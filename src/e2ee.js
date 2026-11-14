const DB_NAME = 'atlantic-e2ee';
const DB_VERSION = 1;
const IDENTITY_STORE = 'identities';
const CONVERSATION_STORE = 'conversation-keys';
const PREFIX = 'ATL-E2EE1:';
const conversationKeyIdCache = new Map();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openKeyDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Penyimpanan kunci aman tidak tersedia di browser ini.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE);
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) db.createObjectStore(CONVERSATION_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database kunci gagal dibuka.'));
  });
}

async function readLocalKey(storeName, key) {
  const db = await openKeyDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeLocalKey(storeName, key, value) {
  const db = await openKeyDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Penyimpanan kunci dibatalkan.'));
    });
  } finally {
    db.close();
  }
}

function conversationCacheId(conversationId, keyId) {
  return conversationId + ':' + keyId;
}

async function deriveWrappingKey(privateKey, publicJwk, conversationId, keyId) {
  const publicKey = await crypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey }, privateKey, 256
  );
  const material = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(conversationId + ':' + keyId),
      info: encoder.encode('Atlantic conversation key envelope v1')
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function wrapConversationKey(rawKey, identity, recipient, conversationId, keyId) {
  const wrappingKey = await deriveWrappingKey(
    identity.privateKey, recipient.e2ee_public_key, conversationId, keyId
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawKey);
  return {
    sender_id: identity.userId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function unwrapConversationKey(envelope, identity, senderPublicKey, conversationId, keyId) {
  const wrappingKey = await deriveWrappingKey(
    identity.privateKey, senderPublicKey, conversationId, keyId
  );
  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    wrappingKey,
    base64ToBytes(envelope.ciphertext)
  );
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const identitySetupPromises = new Map();

async function createOrLoadE2EEIdentity(supabase, userId, password) {
  const local = await readLocalKey(IDENTITY_STORE, userId);
  const { data: profile, error } = await supabase
    .from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle();
  if (error) throw new Error('Kunci publik gagal dimuat: ' + error.message);

  // Existing local identities remain untouched. Older non-extractable keys
  // cannot be retroactively backed up; never replace them automatically.
  if (local) {
    if (!profile?.e2ee_public_key) {
      const { data: restored, error: restoreError } = await supabase
        .from('profiles').update({ e2ee_public_key: local.publicJwk })
        .eq('id', userId).is('e2ee_public_key', null).select('id').maybeSingle();
      if (restoreError || !restored) {
        throw new Error('Kunci publik perangkat gagal dipulihkan. Jangan kirim pesan terenkripsi sebelum status kunci diperiksa.');
      }
    } else if (canonicalPublicJwk(profile.e2ee_public_key) !== canonicalPublicJwk(local.publicJwk)) {
      throw new Error('Kunci perangkat dan kunci akun tidak cocok. Jangan kirim pesan terenkripsi dari perangkat ini sebelum pemulihan kunci dilakukan.');
    }
    return { userId, privateKey: local.privateKey, publicJwk: local.publicJwk };
  }

  // A new browser/device restores the exact account identity using the
  // password supplied during this login. The server stores ciphertext only.
  if (profile?.e2ee_public_key) {
    if (!password) {
      throw new Error('Masuk ulang dengan kata sandi akun untuk memulihkan kunci E2EE secara otomatis di perangkat ini.');
    }
    const { data: backupRow, error: backupError } = await supabase
      .from('profile_e2ee_recovery_backups').select('backup').eq('user_id', userId).maybeSingle();
    if (backupError) throw new Error('Cadangan kunci E2EE gagal dimuat: ' + backupError.message);
    const backup = backupRow?.backup;
    if (!backup || ![1, 2].includes(backup.version) || backup.kdf !== 'PBKDF2-SHA256' ||
        !backup.salt || !backup.iv || !backup.ciphertext ||
        Number(backup.iterations) < 100000 || Number(backup.iterations) > 1000000 ||
        !backup.publicJwk?.x || !backup.publicJwk?.y) {
      throw new Error('Cadangan kunci E2EE tidak ditemukan atau formatnya tidak didukung. Jangan hapus data perangkat lama.');
    }
    if (backup.version === 1) {
      throw new Error('Cadangan E2EE akun ini memakai passphrase pemulihan lama. Pulihkan dari Pengaturan dengan passphrase tersebut atau gunakan perangkat yang masih menyimpan kunci. Kata sandi akun tidak dapat membuka cadangan lama.');
    }
    if (canonicalPublicJwk(profile.e2ee_public_key) !== canonicalPublicJwk(backup.publicJwk)) {
      throw new Error('Kunci publik cadangan tidak cocok dengan identitas akun. Pemulihan dihentikan.');
    }
    const wrappingKey = await deriveRecoveryWrappingKey(
      password, base64ToBytes(backup.salt), Number(backup.iterations)
    );
    let privatePkcs8;
    try {
      privatePkcs8 = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(backup.iv) },
        wrappingKey, base64ToBytes(backup.ciphertext)
      );
    } catch {
      throw new Error('Kata sandi akun tidak cocok untuk membuka cadangan kunci E2EE. Jika kata sandi pernah diubah, pemulihan perlu diperbarui dari perangkat lama.');
    }
    let privateKey;
    try {
      privateKey = await crypto.subtle.importKey(
        'pkcs8', privatePkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
      );
    } finally {
      new Uint8Array(privatePkcs8).fill(0);
    }
    await writeLocalKey(IDENTITY_STORE, userId, { privateKey, publicJwk: backup.publicJwk });
    return { userId, privateKey, publicJwk: backup.publicJwk, restored: true };
  }

  // First-time identity: generate an exportable pair briefly so an encrypted
  // recovery copy can be made with PBKDF2 + AES-GCM. The live private key is
  // then re-imported as non-extractable and only that CryptoKey stays locally.
  if (!password) {
    throw new Error('Masuk dengan kata sandi akun diperlukan untuk menyiapkan cadangan kunci E2EE otomatis.');
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const wrappingKey = await deriveRecoveryWrappingKey(password, salt, iterations);
  let ciphertext;
  try {
    ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privatePkcs8);
  } finally {
    privatePkcs8.fill(0);
  }
  const backup = {
    version: 2, kdf: 'PBKDF2-SHA256', iterations,
    salt: bytesToBase64(salt), iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)), publicJwk
  };
  const privateBytesForImport = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, wrappingKey, ciphertext
  );
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', privateBytesForImport, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  new Uint8Array(privateBytesForImport).fill(0);

  const { data: registered, error: registerError } = await supabase
    .from('profiles').update({ e2ee_public_key: publicJwk })
    .eq('id', userId).is('e2ee_public_key', null).select('id').maybeSingle();
  if (registerError || !registered) {
    throw new Error(registerError
      ? 'Identitas E2EE otomatis gagal didaftarkan: ' + registerError.message
      : 'Akun ini sudah memiliki identitas E2EE di perangkat lain. Identitas tidak akan ditimpa.');
  }

  const { error: backupError } = await supabase
    .from('profile_e2ee_recovery_backups')
    .insert({ user_id: userId, backup });
  if (backupError) {
    await supabase.from('profiles').update({ e2ee_public_key: null })
      .eq('id', userId).eq('e2ee_public_key', publicJwk);
    throw new Error('Cadangan kunci otomatis gagal disimpan: ' + backupError.message);
  }
  try {
    await writeLocalKey(IDENTITY_STORE, userId, { privateKey, publicJwk });
  } catch (storageError) {
    await supabase.from('profile_e2ee_recovery_backups').delete().eq('user_id', userId);
    await supabase.from('profiles').update({ e2ee_public_key: null })
      .eq('id', userId).eq('e2ee_public_key', publicJwk);
    throw new Error('Kunci privat gagal disimpan di perangkat ini: ' + storageError.message);
  }
  return { userId, privateKey, publicJwk };
}
export function ensureE2EEIdentity(supabase, userId, password) {
  if (!userId) return Promise.reject(new Error('Akun belum terautentikasi untuk menyiapkan E2EE.'));
  const existing = identitySetupPromises.get(userId);
  if (existing) return existing;
  const runSetup = () => {
    // Web Locks also serialize initialization across tabs on the same device.
    if (globalThis.navigator?.locks?.request) {
      return navigator.locks.request('atlantic-e2ee-identity:' + userId, () =>
        createOrLoadE2EEIdentity(supabase, userId, password)
      );
    }
    return createOrLoadE2EEIdentity(supabase, userId, password);
  };
  const setup = runSetup().finally(() => {
    if (identitySetupPromises.get(userId) === setup) identitySetupPromises.delete(userId);
  });
  identitySetupPromises.set(userId, setup);
  return setup;
}

export async function ensureConversationE2EE(supabase, conversationId, memberIds, userId) {
  const identity = await ensureE2EEIdentity(supabase, userId);
  // Membership and current key are independent reads; fetch them in parallel to
  // remove one full network round-trip from the send/open-chat path.
  const [membersResult, keyResult] = await Promise.all([
    supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId),
    supabase.from('conversation_e2ee_keys')
      .select('conversation_id,key_id,shares,created_by,member_ids')
      .eq('conversation_id', conversationId).maybeSingle()
  ]);
  const { data: liveMembers, error: memberError } = membersResult;
  if (memberError) throw new Error('Daftar anggota chat gagal diverifikasi: ' + memberError.message);
  const verifiedMemberIds = (liveMembers || []).map(member => member.user_id);
  const ids = [...new Set([userId, ...(verifiedMemberIds.length ? verifiedMemberIds : (memberIds || []))].filter(Boolean))];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles').select('id,e2ee_public_key').in('id', ids);
  if (profileError) throw new Error('Kunci anggota chat gagal dimuat: ' + profileError.message);
  const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
  const missingPublicKeys = ids.filter(id => !profileMap.get(id)?.e2ee_public_key);
  if (missingPublicKeys.length) {
    throw new Error('Menunggu anggota chat mendaftarkan kunci keamanan di perangkatnya. E2EE belum aktif untuk chat ini.');
  }

  let { data: keyRow, error: keyError } = keyResult;
  if (keyError) throw new Error('Kunci percakapan gagal dimuat: ' + keyError.message);

  if (!keyRow) {
    const keyId = crypto.randomUUID();
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const shares = {};
    for (const recipientId of ids) {
      shares[recipientId] = await wrapConversationKey(
        rawKey, identity, profileMap.get(recipientId), conversationId, keyId
      );
    }
    const { error: insertError } = await supabase.from('conversation_e2ee_keys').insert({
      conversation_id: conversationId,
      key_id: keyId,
      shares,
      member_ids: ids,
      created_by: userId
    });
    if (!insertError) {
      const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      await writeLocalKey(CONVERSATION_STORE, conversationCacheId(conversationId, keyId), key);
      conversationKeyIdCache.set(conversationId, keyId);
      return key;
    }
    // A concurrent member may have initialized this conversation first.
    const { data: racedRow, error: racedError } = await supabase
      .from('conversation_e2ee_keys')
      .select('conversation_id,key_id,shares,created_by,member_ids')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (racedError || !racedRow) throw new Error('Kunci percakapan gagal dibuat: ' + insertError.message);
    keyRow = racedRow;
  }

  conversationKeyIdCache.set(conversationId, keyRow.key_id);
  const cacheId = conversationCacheId(conversationId, keyRow.key_id);
  let conversationKey = await readLocalKey(CONVERSATION_STORE, cacheId);

  if (!conversationKey) {
    const ownEnvelope = keyRow.shares?.[userId];
    if (!ownEnvelope) {
      throw new Error('Perangkat anggota chat belum menerima kunci percakapan. Minta anggota yang sudah bisa membuka chat untuk membagikan ulang kunci.');
    }
    const senderProfile = profileMap.get(ownEnvelope.sender_id);
    if (!senderProfile?.e2ee_public_key) {
      throw new Error('Kunci publik pengirim amplop keamanan tidak ditemukan.');
    }
    conversationKey = await unwrapConversationKey(
      ownEnvelope, identity, senderProfile.e2ee_public_key, conversationId, keyRow.key_id
    );
    await writeLocalKey(CONVERSATION_STORE, cacheId, conversationKey);
  }

  // Membership changes create a fresh epoch key. Removed members retain only
  // their old local key and therefore cannot decrypt messages sent after rotation.
  const previousMembers = [...(keyRow.member_ids || [])].sort();
  const currentMembers = [...ids].sort();
  const membershipChanged = previousMembers.length !== currentMembers.length ||
    previousMembers.some((id, index) => id !== currentMembers[index]);
  const missingShares = ids.filter(id => !keyRow.shares?.[id]);
  if (membershipChanged || missingShares.length) {
    const nextKeyId = crypto.randomUUID();
    const nextRawKey = crypto.getRandomValues(new Uint8Array(32));
    const nextShares = {};
    for (const recipientId of ids) {
      nextShares[recipientId] = await wrapConversationKey(
        nextRawKey, identity, profileMap.get(recipientId), conversationId, nextKeyId
      );
    }
    const { data: rotated, error: rotateError } = await supabase.rpc(
      'rotate_atlantic_conversation_e2ee_key',
      {
        p_conversation_id: conversationId,
        p_expected_key_id: keyRow.key_id,
        p_next_key_id: nextKeyId,
        p_next_shares: nextShares,
        p_member_ids: ids
      }
    );
    if (rotateError) {
      throw new Error('Rotasi kunci grup gagal: ' + rotateError.message);
    }
    if (rotated !== true) {
      // Another active device may have completed the same membership rotation first.
      const { data: latest, error: latestError } = await supabase
        .from('conversation_e2ee_keys')
        .select('key_id,shares,member_ids')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      const latestMembers = [...(latest?.member_ids || [])].sort();
      const sameMembership = latestMembers.length === currentMembers.length &&
        latestMembers.every((id, index) => id === currentMembers[index]);
      const latestEnvelope = latest?.shares?.[userId];
      const latestSender = latestEnvelope && profileMap.get(latestEnvelope.sender_id);
      if (latestError || !latest || !sameMembership || !latestEnvelope || !latestSender?.e2ee_public_key) {
        throw new Error('Rotasi kunci grup sedang berlangsung. Buka ulang chat sebentar lagi.');
      }
      const concurrentKey = await unwrapConversationKey(
        latestEnvelope, identity, latestSender.e2ee_public_key, conversationId, latest.key_id
      );
      await writeLocalKey(CONVERSATION_STORE, conversationCacheId(conversationId, latest.key_id), concurrentKey);
      conversationKeyIdCache.set(conversationId, latest.key_id);
      return concurrentKey;
    }
    const nextKey = await crypto.subtle.importKey('raw', nextRawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    await writeLocalKey(CONVERSATION_STORE, conversationCacheId(conversationId, nextKeyId), nextKey);
    conversationKeyIdCache.set(conversationId, nextKeyId);
    return nextKey;
  }

  return conversationKey;
}

export async function encryptE2EEText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(text)
  );
  return PREFIX + bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(ciphertext));
}

export async function decryptE2EEText(key, value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const [iv, ciphertext] = value.slice(PREFIX.length).split(':');
  if (!iv || !ciphertext) throw new Error('Format pesan terenkripsi tidak valid.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext)
  );
  return decoder.decode(plaintext);
}

export function isE2EEText(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export async function encryptE2EEBytes(key, value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: bytesToBase64(iv), ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptE2EEBytes(key, envelope) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, envelope.ciphertext
  );
  return new Uint8Array(plaintext);
}

export async function encryptE2EEMessage(key, payload) {
  return encryptE2EEText(key, JSON.stringify({ version: 1, ...payload }));
}

export async function decryptE2EEMessage(key, value) {
  const plaintext = await decryptE2EEText(key, value);
  try {
    const parsed = JSON.parse(plaintext);
    if (parsed && parsed.version === 1) return parsed;
  } catch { /* Legacy ATL-E2EE1 text message. */ }
  return { version: 0, text: plaintext };
}

export async function getCurrentConversationE2EEKeyId(supabase, conversationId) {
  const cachedKeyId = conversationKeyIdCache.get(conversationId);
  if (cachedKeyId) return cachedKeyId;
  const { data, error } = await supabase.from('conversation_e2ee_keys')
    .select('key_id').eq('conversation_id', conversationId).maybeSingle();
  if (error || !data?.key_id) throw new Error('ID kunci percakapan belum tersedia.');
  conversationKeyIdCache.set(conversationId, data.key_id);
  return data.key_id;
}

export async function getConversationE2EEKeyById(supabase, conversationId, keyId, userId) {
  const cacheId = conversationCacheId(conversationId, keyId);
  const cached = await readLocalKey(CONVERSATION_STORE, cacheId);
  if (cached) return cached;
  const identity = await ensureE2EEIdentity(supabase, userId);
  let row = null;
  const current = await supabase.from('conversation_e2ee_keys')
    .select('key_id,shares').eq('conversation_id', conversationId).eq('key_id', keyId).maybeSingle();
  if (current.error) throw new Error('Kunci percakapan gagal dimuat.');
  row = current.data;
  if (!row) {
    const historic = await supabase.from('conversation_e2ee_key_epochs')
      .select('key_id,shares').eq('conversation_id', conversationId).eq('key_id', keyId).maybeSingle();
    if (historic.error || !historic.data) throw new Error('Riwayat kunci E2EE tidak tersedia di perangkat ini.');
    row = historic.data;
  }
  const envelope = row.shares?.[userId];
  if (!envelope) throw new Error('Perangkat ini tidak memiliki kunci untuk epoch pesan tersebut.');
  const { data: sender } = await supabase.from('profiles')
    .select('e2ee_public_key').eq('id', envelope.sender_id).maybeSingle();
  if (!sender?.e2ee_public_key) throw new Error('Kunci publik pengirim tidak tersedia.');
  const key = await unwrapConversationKey(envelope, identity, sender.e2ee_public_key, conversationId, keyId);
  await writeLocalKey(CONVERSATION_STORE, cacheId, key);
  return key;
}

export async function getE2EEFingerprint(publicJwk) {
  if (!publicJwk?.x || !publicJwk?.y) throw new Error('Kunci publik tidak valid.');
  const canonical = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)));
  return Array.from(digest.slice(0, 20)).map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}


function canonicalPublicJwk(jwk) {
  return JSON.stringify({ crv: jwk?.crv, kty: jwk?.kty, x: jwk?.x, y: jwk?.y });
}

async function deriveRecoveryWrappingKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createE2EERecoveryBackup(supabase, userId, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('Gunakan passphrase pemulihan minimal 12 karakter.');
  }
  const local = await readLocalKey(IDENTITY_STORE, userId);
  if (local) {
    throw new Error('Identitas E2EE sudah dibuat tanpa cadangan yang dapat diekspor. Demi keamanan, identitas non-extractable lama tidak bisa diubah menjadi cadangan secara retroaktif.');
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle();
  if (profileError) throw new Error('Profil keamanan gagal dimuat: ' + profileError.message);
  if (profile?.e2ee_public_key) {
    throw new Error('Kunci publik akun sudah ada di perangkat lain. Pulihkan dari cadangan yang sudah dibuat; jangan membuat identitas baru.');
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const wrappingKey = await deriveRecoveryWrappingKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privatePkcs8);
  const backup = {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    publicJwk
  };

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ e2ee_public_key: publicJwk })
    .eq('id', userId)
    .is('e2ee_public_key', null)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) {
    throw new Error('Kunci publik gagal didaftarkan. Tidak ada identitas lokal yang disimpan.');
  }

  const { error: backupError } = await supabase
    .from('profile_e2ee_recovery_backups')
    .insert({ user_id: userId, backup });
  if (backupError) {
    await supabase.from('profiles').update({ e2ee_public_key: null })
      .eq('id', userId).eq('e2ee_public_key', publicJwk);
    throw new Error('Cadangan pemulihan gagal disimpan: ' + backupError.message);
  }

  const privateKey = await crypto.subtle.importKey(
    'pkcs8', privatePkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  await writeLocalKey(IDENTITY_STORE, userId, { privateKey, publicJwk });
  return { userId, publicJwk };
}

export async function restoreE2EEIdentityFromBackup(supabase, userId, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 6) {
    throw new Error('Masukkan kata sandi akun minimal 6 karakter.');
  }
  const local = await readLocalKey(IDENTITY_STORE, userId);
  if (local) return { userId, alreadyRestored: true };

  const [{ data: profile, error: profileError }, { data: row, error: backupError }] = await Promise.all([
    supabase.from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle(),
    supabase.from('profile_e2ee_recovery_backups').select('backup').eq('user_id', userId).maybeSingle()
  ]);
  if (profileError) throw new Error('Kunci publik gagal dimuat: ' + profileError.message);
  if (backupError) throw new Error('Cadangan pemulihan gagal dimuat: ' + backupError.message);
  const backup = row?.backup;
  if (!backup || ![1, 2].includes(backup.version) || backup.kdf !== 'PBKDF2-SHA256' ||
      !Number.isInteger(Number(backup.iterations)) ||
      Number(backup.iterations) < 100000 || Number(backup.iterations) > 1000000 ||
      !backup.salt || !backup.iv || !backup.ciphertext ||
      !backup.publicJwk?.x || !backup.publicJwk?.y) {
    throw new Error('Cadangan pemulihan tidak ditemukan atau formatnya tidak didukung.');
  }
  if (!profile?.e2ee_public_key || canonicalPublicJwk(profile.e2ee_public_key) !== canonicalPublicJwk(backup.publicJwk)) {
    throw new Error('Kunci publik cadangan tidak cocok dengan identitas akun. Pemulihan dihentikan.');
  }
  const wrappingKey = await deriveRecoveryWrappingKey(
    passphrase, base64ToBytes(backup.salt), Number(backup.iterations)
  );
  let privatePkcs8;
  try {
    privatePkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(backup.iv) },
      wrappingKey,
      base64ToBytes(backup.ciphertext)
    );
  } catch {
    throw new Error('Passphrase pemulihan salah atau cadangan rusak.');
  }
  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8', privatePkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
  } finally {
    new Uint8Array(privatePkcs8).fill(0);
  }
  if (!await verifyPrivateKeyMatchesPublic(privateKey, backup.publicJwk)) {
    throw new Error('Private key cadangan tidak cocok dengan kunci publik akun. Pemulihan dibatalkan.');
  }
  await writeLocalKey(IDENTITY_STORE, userId, {
    privateKey,
    publicJwk: backup.publicJwk
  });
  return { userId, restored: true };
}


async function verifyPrivateKeyMatchesPublic(privateKey, publicJwk) {
  const publicKey = await crypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const probe = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const [left, right] = await Promise.all([
    crypto.subtle.deriveBits({ name: 'ECDH', public: probe.publicKey }, privateKey, 256),
    crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, probe.privateKey, 256)
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  a.fill(0);
  b.fill(0);
  return difference === 0;
}

export async function verifyE2EEIdentityBackup(supabase, userId, password) {
  if (!userId || typeof password !== 'string' || !password) {
    throw new Error('Masukkan kata sandi akun untuk memeriksa cadangan E2EE.');
  }
  const [{ data: profile, error: profileError }, { data: row, error: backupError }, local] =
    await Promise.all([
      supabase.from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle(),
      supabase.from('profile_e2ee_recovery_backups').select('backup').eq('user_id', userId).maybeSingle(),
      readLocalKey(IDENTITY_STORE, userId)
    ]);
  if (profileError) throw new Error('Identitas akun gagal dimuat: ' + profileError.message);
  if (backupError) throw new Error('Cadangan E2EE gagal dimuat: ' + backupError.message);
  const publicJwk = profile?.e2ee_public_key;
  const backup = row?.backup;
  if (!publicJwk?.x || !publicJwk?.y || !backup) {
    throw new Error('Identitas publik atau cadangan terenkripsi belum tersedia.');
  }
  if (canonicalPublicJwk(publicJwk) !== canonicalPublicJwk(backup.publicJwk)) {
    throw new Error('Kunci publik pada cadangan tidak cocok dengan identitas akun. Tidak ada perubahan dilakukan.');
  }
  if (![1, 2].includes(backup.version) || backup.kdf !== 'PBKDF2-SHA256' ||
      !backup.salt || !backup.iv || !backup.ciphertext ||
      Number(backup.iterations) < 100000 || Number(backup.iterations) > 1000000) {
    throw new Error('Format cadangan E2EE tidak valid atau tidak didukung.');
  }
  const wrappingKey = await deriveRecoveryWrappingKey(
    password, base64ToBytes(backup.salt), Number(backup.iterations)
  );
  let raw;
  try {
    raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(backup.iv) },
      wrappingKey, base64ToBytes(backup.ciphertext)
    );
  } catch {
    throw new Error(backup.version === 1
      ? 'Passphrase pemulihan khusus yang digunakan saat cadangan lama dibuat tidak cocok.'
      : 'Kata sandi akun tidak cocok dengan cadangan E2EE.');
  }
  let backupPrivate;
  try {
    backupPrivate = await crypto.subtle.importKey(
      'pkcs8', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
  } finally {
    new Uint8Array(raw).fill(0);
  }
  if (!await verifyPrivateKeyMatchesPublic(backupPrivate, publicJwk)) {
    throw new Error('Private key dalam cadangan tidak cocok dengan kunci publik akun.');
  }
  if (local) {
    if (canonicalPublicJwk(local.publicJwk) !== canonicalPublicJwk(publicJwk)) {
      throw new Error('Kunci lokal berbeda dari identitas akun. Kunci lokal tidak diubah.');
    }
    if (!await verifyPrivateKeyMatchesPublic(local.privateKey, publicJwk)) {
      throw new Error('Kunci privat lokal tidak cocok dengan identitas akun. Tidak ada perubahan dilakukan.');
    }
  }
  return { localIdentityVerified: Boolean(local), backupVerified: true };
}


async function deleteLocalKey(storeName, key) {
  const db = await openKeyDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Penghapusan kunci lokal dibatalkan.'));
    });
  } finally {
    db.close();
  }
}

export async function hasLocalE2EEIdentity(userId) {
  if (!userId) return false;
  return Boolean(await readLocalKey(IDENTITY_STORE, userId));
}

// Explicit self-service recovery reset. The server archives the previous
// encrypted backup and refuses the reset if any conversation has key epochs.
export async function resetOwnE2EEIdentity(supabase, userId, accountPassword) {
  if (!userId || typeof accountPassword !== 'string' || accountPassword.length < 6) {
    throw new Error('Masukkan kata sandi akun yang benar untuk membuat identitas E2EE baru.');
  }
  if (await readLocalKey(IDENTITY_STORE, userId)) {
    throw new Error('Perangkat ini masih menyimpan identitas E2EE. Reset dibatalkan agar kunci lokal lama tidak tertimpa.');
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle();
  if (profileError || !profile?.e2ee_public_key) {
    throw new Error('Identitas E2EE akun tidak ditemukan atau gagal dimuat.');
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600000;
  const wrappingKey = await deriveRecoveryWrappingKey(accountPassword, salt, iterations);
  let ciphertext;
  try {
    ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privatePkcs8);
  } finally {
    privatePkcs8.fill(0);
  }
  const backup = {
    version: 2, kdf: 'PBKDF2-SHA256', iterations,
    salt: bytesToBase64(salt), iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)), publicJwk
  };
  const privateBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, wrappingKey, ciphertext
  );
  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8', privateBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
    );
  } finally {
    new Uint8Array(privateBytes).fill(0);
  }

  await writeLocalKey(IDENTITY_STORE, userId, { privateKey, publicJwk });
  const { data, error } = await supabase.rpc('reset_own_e2ee_identity', {
    p_public_key: publicJwk,
    p_backup: backup
  });
  if (error || data !== true) {
    // A network interruption can hide a successful server commit. Confirm the
    // authoritative profile + backup before deciding whether to discard local key.
    const [{ data: currentProfile }, { data: currentBackup }] = await Promise.all([
      supabase.from('profiles').select('e2ee_public_key').eq('id', userId).maybeSingle(),
      supabase.from('profile_e2ee_recovery_backups').select('backup').eq('user_id', userId).maybeSingle()
    ]);
    const resetCommitted =
      canonicalPublicJwk(currentProfile?.e2ee_public_key) === canonicalPublicJwk(publicJwk) &&
      currentBackup?.backup?.version === 2 &&
      canonicalPublicJwk(currentBackup.backup.publicJwk) === canonicalPublicJwk(publicJwk);
    if (!resetCommitted) {
      await deleteLocalKey(IDENTITY_STORE, userId).catch(() => {});
      throw new Error(error?.message || 'Reset identitas E2EE ditolak oleh pengaman database.');
    }
  }
  return { userId, publicJwk };
}
