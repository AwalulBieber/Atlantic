import React, { useEffect, useRef, useState } from 'react';
import { supabase, configReady } from './supabase';
import AtlanticAccountSettings from './components/AtlanticAccountSettings';
import AtlanticCommunity from './components/AtlanticCommunity';
import {
  MessageCircle, Search, Plus, Send, LogOut, ArrowLeft, Waves, Archive, ArchiveRestore,
  Sparkles, MessageSquarePlus, Settings, UserRound, X, Check,
  Clock3, Radio, Phone, Video, NotebookPen, ImagePlus, BadgeCheck, Trash2, Reply, CheckCheck
} from 'lucide-react';

function initials(name = 'A') {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}

function time(value) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit'
  });
}

const DEFAULT_SETTINGS = {
  theme: 'light', accent: 'yellow', font: 'ios',
  textSize: 'medium', fps: '60', animations: true
};

const FONT_OPTIONS = [
  { value: 'ios', label: 'iOS / SF Pro' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'nunito', label: 'Nunito' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'arial', label: 'Arial' },
  { value: 'system', label: 'System Default' }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [chats, setChats] = useState([]);
  const [archivedIds, setArchivedIds] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [unread, setUnread] = useState({});
  const [incomingNotice, setIncomingNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [communityCreateRequest, setCommunityCreateRequest] = useState(0);
  const [replyTarget, setReplyTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [swipeState, setSwipeState] = useState({ id: null, offset: 0 });
  const [swipeFeedbackId, setSwipeFeedbackId] = useState(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeTimer = useRef(null);
  const typingChannelRef = useRef(null);
  const typingStopTimer = useRef(null);
  const typingIndicatorTimer = useRef(null);
  const [otherTyping, setOtherTyping] = useState(false);

  const seenMessages = useRef(new Set());
  const bottomRef = useRef(null);

  const [settings, setSettings] = useState(() => {
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem('atlantic-settings') || '{}')
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('atlantic-settings', JSON.stringify(settings));
    } catch {}
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.textSize = settings.textSize;
    root.dataset.fps = settings.fps;
    root.dataset.animations = settings.animations ? 'on' : 'off';
    const accents = {
      yellow: '#ffd84d', blue: '#7bd5ff', pink: '#ff9ec7',
      green: '#b8f36b', purple: '#c6a5ff'
    };
    root.style.setProperty('--accent', accents[settings.accent] || accents.yellow);
  }, [settings]);

  function updateSetting(key, value) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!configReady) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
  setChats([]);
  loadMyProfile();
  loadProfiles();
} else {
  setMyProfile(null);
  setChats([]);
  setActive(null);
  setMessages([]);
  setUnread({});
  setIncomingNotice(null);
  setAccountSettingsOpen(false);
  seenMessages.current.clear();
    }
  }, [session]);

  async function loadMyProfile() {
    if (!session?.user?.id) return;
    const [{ data, error }, { data: isAdmin, error: badgeError }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,bio,is_verified,read_receipts_enabled').eq('id', session.user.id).maybeSingle(),
      supabase.rpc('is_atlantic_admin', { target_user: session.user.id })
    ]);
    if (!error && data) {
      const isPrimaryAdmin = session.user.email?.toLowerCase() === 'awalulhakim94@gmail.com';
      setMyProfile({ ...data, is_admin: isAdmin === true || (!badgeError && isAdmin === true) || isPrimaryAdmin });
    }
  }

  async function authenticate(e) {
    e.preventDefault();
    setNotice('');
    setAuthBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: displayName.trim() } }
        });
        if (error) throw error;
        setNotice(data.session
          ? 'Akun berhasil dibuat.'
          : 'Akun dibuat. Periksa email untuk konfirmasi, lalu login.');
        if (!data.session) setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setNotice(err.message || 'Terjadi kesalahan.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadProfiles() {
  const { data: mine, error } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', session.user.id);

  if (error) {
    setNotice(error.message);
    return;
  }

  if (!mine?.length) {
    setChats([]);
    setArchivedIds([]);
    return;
  }

  const ids = mine.map(c => c.conversation_id);
  const { data: archived, error: archiveError } = await supabase
    .from('archived_conversations')
    .select('conversation_id')
    .eq('user_id', session.user.id);
  if (archiveError) setNotice('Arsip chat: ' + archiveError.message);
  else setArchivedIds((archived || []).map(row => row.conversation_id));

  // When a user reconnects, mark any previously queued messages as delivered.
  await supabase.from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('conversation_id', ids)
    .neq('sender_id', session.user.id)
    .is('delivered_at', null);

  const { data: members, error: memberError } = await supabase
    .from('conversation_members')
    .select('conversation_id,user_id')
    .in('conversation_id', ids)
    .neq('user_id', session.user.id);

  if (memberError) {
    setNotice(memberError.message);
    return;
  }

  const userIds = [...new Set((members || []).map(m => m.user_id))];

  if (!userIds.length) {
    setChats([]);
    return;
  }

  const { data: people, error: profileError } = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar_url,is_verified')
    .in('id', userIds);

  if (profileError) {
    setNotice(profileError.message);
    return;
  }

  const peopleWithBadges = await Promise.all((people || []).map(async person => {
    const { data: isAdmin, error: badgeError } = await supabase.rpc('is_atlantic_admin', { target_user: person.id });
    return { ...person, is_admin: !badgeError && isAdmin === true };
  }));
  setChats((members || []).map(m => ({
    conversation_id: m.conversation_id,
    person: peopleWithBadges.find(p => p.id === m.user_id)
  })).filter(c => c.person));
  }

  async function toggleArchive(conversationId) {
    const isArchived = archivedIds.includes(conversationId);
    const query = isArchived
      ? supabase.from('archived_conversations').delete().eq('conversation_id', conversationId).eq('user_id', session.user.id)
      : supabase.from('archived_conversations').upsert({ conversation_id: conversationId, user_id: session.user.id }, { onConflict: 'conversation_id,user_id' });
    const { error } = await query;
    if (error) { setNotice('Arsip chat gagal diperbarui: ' + error.message); return; }
    setArchivedIds(current => isArchived ? current.filter(id => id !== conversationId) : [...current, conversationId]);
    setNotice(isArchived ? 'Chat dipindahkan kembali ke daftar utama.' : 'Chat berhasil diarsipkan.');
  }

  async function openChat(person) {
    setNotice('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');
      if (user.id === person.id) throw new Error('Kamu tidak bisa membuka chat dengan akun sendiri.');

      const { data: conversationId, error: rpcError } = await supabase.rpc(
        'create_direct_conversation', { target_user: person.id }
      );
      if (rpcError) throw rpcError;
      if (!conversationId) throw new Error('Database tidak mengembalikan ID percakapan.');

      setUnread(old => {
        const next = { ...old };
        delete next[person.id];
        return next;
      });
      setIncomingNotice(null);
      setReplyTarget(null);
      setActive({ conversation_id: conversationId, person });
      setMobileChat(true);
      await loadMessages(conversationId);
      await loadProfiles();
    } catch (err) {
      setNotice('Gagal membuka chat: ' + (err?.message || 'Terjadi kesalahan.'));
    }
  }

  async function loadMessages(id) {
    const { data, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,body,created_at,reply_to,delivered_at,read_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      setNotice(error.message);
      return;
    }
    const replyIds = [...new Set((data || []).map(m => m.reply_to).filter(Boolean))];
    let replyMap = {};
    if (replyIds.length) {
      const { data: originals } = await supabase.from('messages').select('id,body,sender_id').in('id', replyIds);
      replyMap = Object.fromEntries((originals || []).map(item => [item.id, item]));
    }
    const incomingIds = (data || []).filter(m => m.sender_id !== session.user.id).map(m => m.id);
    if (incomingIds.length) {
      const now = new Date().toISOString();
      const receipt = { delivered_at: now };
      if (myProfile?.read_receipts_enabled !== false) receipt.read_at = now;
      await supabase.from('messages').update(receipt).in('id', incomingIds);
    }
    setMessages((data || []).map(m => ({ ...m, replyPreview: replyMap[m.reply_to] || null })));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  useEffect(() => {
    if (!active || !session) return;
    loadMessages(active.conversation_id);
    const channel = supabase
      .channel('chat-' + active.conversation_id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${active.conversation_id}`
      }, async payload => {
        const incoming = payload.new;
        if (incoming.reply_to) {
          const { data: original } = await supabase.from('messages').select('id,body,sender_id').eq('id', incoming.reply_to).maybeSingle();
          incoming.replyPreview = original || null;
        }
        if (incoming.sender_id !== session.user.id) {
          const now = new Date().toISOString();
          const receipt = { delivered_at: now };
          if (myProfile?.read_receipts_enabled !== false) receipt.read_at = now;
          const { error: receiptError } = await supabase.from('messages').update(receipt).eq('id', incoming.id);
          if (!receiptError) {
            incoming.delivered_at = now;
            if (receipt.read_at) incoming.read_at = now;
          }
        }
        setMessages(old => old.some(m => m.id === incoming.id) ? old : [...old, incoming]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${active.conversation_id}` }, payload => {
        setMessages(old => old.map(m => m.id === payload.new.id ? { ...m, delivered_at: payload.new.delivered_at, read_at: payload.new.read_at } : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const deleted = payload.old;
        if (deleted?.id) setMessages(old => old.filter(m => m.id !== deleted.id).map(m => m.reply_to === deleted.id ? { ...m, reply_to: null, replyPreview: null } : m));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [active?.conversation_id, session?.user?.id, myProfile?.read_receipts_enabled]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('atlantic-global-messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages'
      }, async payload => {
        const message = payload.new;
        if (!message || message.sender_id === session.user.id ||
            seenMessages.current.has(message.id)) return;
        seenMessages.current.add(message.id);
        if (active?.conversation_id === message.conversation_id) return;

        const { data: members, error: memberError } = await supabase
          .from('conversation_members').select('user_id')
          .eq('conversation_id', message.conversation_id);
        if (memberError || !members?.some(m => m.user_id === session.user.id)) return;

        const { data: person, error: profileError } = await supabase
          .from('profiles').select('id,username,display_name,avatar_url')
          .eq('id', message.sender_id).single();
        if (profileError || !person) return;

        await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', message.id).is('delivered_at', null);
        setUnread(old => ({ ...old, [person.id]: (old[person.id] || 0) + 1 }));
        setIncomingNotice({ person, body: message.body || 'Mengirim pesan' });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id, active?.conversation_id]);

  useEffect(() => {
    if (!active?.conversation_id || !session?.user?.id) return;
    const channel = supabase.channel('atlantic-typing-' + active.conversation_id);
    typingChannelRef.current = channel;
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.user_id !== session.user.id) {
        setOtherTyping(Boolean(payload?.is_typing));
        if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current);
        if (payload?.is_typing) typingIndicatorTimer.current = setTimeout(() => setOtherTyping(false), 2400);
      }
    }).subscribe();
    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current);
      typingChannelRef.current = null;
      setOtherTyping(false);
      supabase.removeChannel(channel);
    };
  }, [active?.conversation_id, session?.user?.id]);

  function updateDraft(value) {
    setDraft(value);
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: Boolean(value.trim()) } });
    if (value.trim()) typingStopTimer.current = setTimeout(() => {
      channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: false } });
    }, 1400);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    setDraft('');
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, is_typing: false } });
    const { error } = await supabase.from('messages').insert({
      conversation_id: active.conversation_id,
      sender_id: session.user.id,
      body,
      reply_to: replyTarget?.id || null
    });
    if (error) {
      setDraft(body);
      setNotice('Pesan gagal dikirim: ' + error.message);
    } else {
      setReplyTarget(null);
    }
    setSending(false);
  }

  async function requestCall(callType) {
    if (!active?.person?.id || !session?.user?.id) return;
    const { error } = await supabase.from('atlantic_call_sessions').insert({ caller_id: session.user.id, callee_id: active.person.id, call_type: callType, status: 'requested' });
    setNotice(error ? 'Undangan panggilan gagal: ' + error.message : 'Undangan panggilan tercatat. Panggilan audio/video langsung belum aktif.');
  }

  async function confirmDeleteMessage() {
    const message = deleteTarget;
    if (!message || message.sender_id !== session.user.id) return;
    const { error } = await supabase.from('messages').delete().eq('id', message.id).eq('sender_id', session.user.id);
    if (error) setNotice('Pesan gagal dihapus: ' + error.message);
    else {
      setMessages(old => old.filter(m => m.id !== message.id).map(m => m.reply_to === message.id ? { ...m, reply_to: null, replyPreview: null } : m));
      if (replyTarget?.id === message.id) setReplyTarget(null);
    }
    setDeleteTarget(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessages([]);
    setActive(null);
    setMobileChat(false);
    setUnread({});
    setIncomingNotice(null);
    setAccountSettingsOpen(false);
    seenMessages.current.clear();
  }

  if (!configReady) {
    return (
      <div className="setup">
        <div className="brand"><Waves /> ATLANTIC</div>
        <h1>Hubungkan database dulu</h1>
        <p>Isi file <b>.env</b> dengan Project URL dan Publishable Key Supabase. Lihat README.txt di paket proyek.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="center"><span className="loader-orbit" /><b>Menyiapkan Atlantic…</b></div>;
  }

  if (!session) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand"><Waves size={28} /> ATLANTIC <Sparkles size={17} /></div>
          <p className="muted">Ruang obrolanmu, terhubung kapan saja.</p>
          <h1>{mode === 'login' ? 'Selamat datang kembali' : 'Buat akun Atlantic'}</h1>
          <form onSubmit={authenticate}>
            {mode === 'signup' && (
              <label>Nama tampilan
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} required placeholder="Nama kamu" />
              </label>
            )}
            <label>Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="nama@email.com" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength="6" required placeholder="Minimal 6 karakter" />
            </label>
            <button className="primary full" disabled={authBusy}>
              {authBusy ? <><span className="button-spinner" /> Memproses…</> : mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          </form>
          {notice && <p className="notice">{notice}</p>}
          <p className="switch">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setNotice(''); }}>
              {mode === 'login' ? 'Daftar' : 'Masuk'}
            </button>
          </p>
        </section>
      </main>
    );
  }

  const visibleChats = chats.filter(c => archivedIds.includes(c.conversation_id) === showArchived);
  const filtered = visibleChats.filter(c =>
  (c.person.display_name || c.person.username || '')
    .toLowerCase().includes(search.toLowerCase())
);

  return (
    <main className={`app-shell tab-${activeTab}`}>
      <aside className={`sidebar ${mobileChat ? 'hide-mobile' : ''}`}>
        <header className="topbar">
          <div className="brand"><Waves /> ATLANTIC</div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => setAccountSettingsOpen(true)} title="Profil dan privasi" aria-label="Profil dan privasi">
              <UserRound size={19} />
            </button>
            <button className="icon-btn" onClick={() => { setSettingsTab('appearance'); setSettingsOpen(true); }} title="Pengaturan tampilan" aria-label="Pengaturan tampilan">
              <Settings size={19} />
            </button>
            <button className="icon-btn" onClick={logout} title="Keluar" aria-label="Keluar">
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <div className="me">
          <div className="avatar">{myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : initials(myProfile?.display_name || session.user.user_metadata?.display_name || session.user.email)}</div>
          <div>
            <b>{myProfile?.display_name || session.user.user_metadata?.display_name || session.user.email}{myProfile?.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={16}/></span> : myProfile?.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={16}/></span>}</b>
            <small><i className="online-dot" /> Online</small>
          </div>
        </div>

        <div className="search">
          <Search size={17} />
          <input placeholder="Cari Chat…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="chat-list-tabs"><button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Semua chat</button><button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}><Archive size={14}/> Arsip {archivedIds.length ? `(${archivedIds.length})` : ''}</button></div>
        <div className="section-title"><span>{showArchived ? 'Arsip Chat' : 'Chat'}</span><span className="count-tag">{filtered.length}</span></div>
        <div className="people">
  {filtered.map(c => (
    <button
      className={`person ${active?.conversation_id === c.conversation_id ? 'selected' : ''}`}
      key={c.conversation_id}
      onClick={() => openChat(c.person)}
    >
      <div className="avatar">
        {c.person.avatar_url ? <img src={c.person.avatar_url} alt="" /> : initials(c.person.display_name || c.person.username)}
      </div>
      <div className="person-info">
        <b>{c.person.display_name || c.person.username}{c.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={14}/></span> : c.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={14}/></span>}</b>
        <small>Ketuk untuk membuka chat</small>
      </div>
      <button type="button" className="archive-chat-btn" title={showArchived ? 'Keluarkan dari arsip' : 'Arsipkan chat'} aria-label={showArchived ? 'Keluarkan dari arsip' : 'Arsipkan chat'} onClick={e => { e.stopPropagation(); toggleArchive(c.conversation_id); }}>{showArchived ? <ArchiveRestore size={16}/> : <Archive size={16}/>}</button>
      <MessageCircle size={17} />
    </button>
  ))}

  {!filtered.length && (
    <p className="empty">{showArchived ? 'Belum ada chat yang diarsipkan' : 'Belum ada percakapan'}</p>
  )}
</div>
        <footer className="side-foot">ATLANTIC WEB <span>•</span> V1.1</footer>
      </aside>

      <section className={`chat-panel ${mobileChat ? 'show-mobile' : ''}`}>
        {active ? (
          <>
            <header className="chat-head">
              <button className="back icon-btn" onClick={() => setMobileChat(false)} aria-label="Kembali"><ArrowLeft /></button>
              <div className="avatar">{active.person.avatar_url ? <img src={active.person.avatar_url} alt="" /> : initials(active.person.display_name || active.person.username)}</div>
              <div className="chat-person">
                <b>{active.person.display_name || active.person.username}{active.person.is_admin ? <span className="atl-inline-verified" title="Atlantic Verified"><BadgeCheck size={15}/></span> : active.person.is_verified && <span className="atl-inline-verified atl-user-verified" title="Terverifikasi"><BadgeCheck size={15}/></span>}</b>
                <small>{otherTyping ? <span className="typing-indicator"><i/><i/><i/> sedang mengetik</span> : `@${active.person.username}`}</small>
              </div>
              <div className="chat-head-actions">
                <button type="button" className="icon-btn" onClick={() => requestCall('audio')} title="Undang panggilan suara" aria-label="Undang panggilan suara"><Phone size={18}/></button>
                <button type="button" className="icon-btn" onClick={() => requestCall('video')} title="Undang panggilan video" aria-label="Undang panggilan video"><Video size={18}/></button>
              </div>
            </header>
            <div className="messages">
              {messages.map(m => (
                <div
                  className={`bubble-row ${m.sender_id === session.user.id ? 'mine' : ''} ${swipeState.id === m.id && swipeState.offset > 0 ? 'reply-swiping' : ''} ${swipeFeedbackId === m.id ? 'reply-swipe-confirmed' : ''}`}
                  key={m.id}
                  id={`message-${m.id}`}
                  style={swipeState.id === m.id ? { transform: `translateX(${swipeState.offset}px)` } : undefined}
                  onTouchStart={e => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; }}
                  onTouchMove={e => {
                    const dx = e.touches[0].clientX - touchStartX.current;
                    const dy = e.touches[0].clientY - touchStartY.current;
                    if (dx > 6 && dx > Math.abs(dy)) setSwipeState({ id: m.id, offset: Math.min(dx, 92) });
                  }}
                  onTouchEnd={e => {
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    const dy = e.changedTouches[0].clientY - touchStartY.current;
                    if (dx > 65 && dx > Math.abs(dy)) {
                      setReplyTarget(m);
                      setSwipeFeedbackId(m.id);
                      if (swipeTimer.current) clearTimeout(swipeTimer.current);
                      swipeTimer.current = setTimeout(() => setSwipeFeedbackId(null), 650);
                    }
                    setSwipeState({ id: null, offset: 0 });
                  }}
                >
                  <div className={`swipe-reply-indicator ${swipeState.id === m.id && swipeState.offset > 12 ? 'visible' : ''}`} style={swipeState.id === m.id ? { opacity: Math.min(swipeState.offset / 65, 1) } : undefined}><Reply size={15}/></div>
                  <div className="bubble">
                    {m.replyPreview && <button type="button" className="reply-quote" onClick={() => document.getElementById(`message-${m.reply_to}`)?.scrollIntoView({behavior:'smooth',block:'center'})}><b>{m.replyPreview.sender_id === session.user.id ? 'Kamu' : (active.person.display_name || active.person.username)}</b><span>{m.replyPreview.body || 'Pesan'}</span></button>}
                    <div>{m.body}</div>
                    <div className="bubble-meta"><time>{time(m.created_at)}</time>{m.sender_id === session.user.id && <span className={`message-status ${m.read_at ? 'is-read' : ''}`} title={m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}>{m.delivered_at || m.read_at ? <CheckCheck size={13}/> : <Check size={13}/>}<small>{m.read_at ? 'Dibaca' : m.delivered_at ? 'Terkirim' : 'Dikirim'}</small></span>}<button type="button" className="message-reply-btn" onClick={() => setReplyTarget(m)} aria-label="Balas pesan"><Reply size={13}/></button>{m.sender_id === session.user.id && <button type="button" className="message-delete-btn" onClick={() => setDeleteTarget(m)} aria-label="Hapus pesan"><Trash2 size={13}/></button>}</div>
                  </div>
                </div>
              ))}
              {!messages.length && (
                <div className="empty-chat">
                  <MessageCircle size={34} /><b>Mulai percakapan</b>
                  <span>Kirim pesan pertama ke {active.person.display_name || active.person.username}.</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            {replyTarget && <div className="reply-composer-preview"><div><b>Membalas {replyTarget.sender_id === session.user.id ? 'pesan sendiri' : (active.person.display_name || active.person.username)}</b><span>{replyTarget.body || 'Pesan'}</span></div><button type="button" onClick={() => setReplyTarget(null)} aria-label="Batal membalas"><X size={17}/></button></div>}
            <form className="composer" onSubmit={sendMessage}>
              <input value={draft} onChange={e => updateDraft(e.target.value)} placeholder="Tulis pesan…" autoComplete="off" />
              <button className="send" disabled={!draft.trim() || sending} aria-label="Kirim pesan">
                {sending ? <span className="button-spinner" /> : <Send size={19} />}
              </button>
            </form>
          </>
        ) : (
          <div className="welcome">
            <div className="welcome-icon"><MessageSquarePlus size={42} /></div>
            <h2>Selamat datang di Atlantic</h2>
            <p>Pilih chat di samping atau tekan + untuk memulai percakapan.</p>
          </div>
        )}
      </section>

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}　×</button>}
      {deleteTarget && <div className="neo-delete-backdrop" onClick={() => setDeleteTarget(null)}><section className="neo-delete-modal" role="dialog" aria-modal="true" aria-label="Konfirmasi hapus pesan" onClick={e => e.stopPropagation()}><span className="neo-delete-tag">ATLANTIC / MESSAGE</span><h2>HAPUS PESAN?</h2><p>Pesan ini akan dihapus untuk semua orang dalam percakapan.</p><div className="neo-delete-actions"><button type="button" onClick={() => setDeleteTarget(null)}>BATAL</button><button type="button" onClick={confirmDeleteMessage}>HAPUS</button></div></section></div>}
      {incomingNotice && (
        <button className="toast" onClick={() => { const person = incomingNotice.person; setIncomingNotice(null); openChat(person); }}>
          <b>{incomingNotice.person.display_name || incomingNotice.person.username}</b><br />
          {incomingNotice.body}<span>　×</span>
        </button>
      )}

      {settingsOpen && (
        <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pengaturan Atlantic">
            <header className="settings-header">
              <div><span className="eyebrow">ATLANTIC CONTROL</span><h2>Pengaturan</h2></div>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Tutup"><X size={19} /></button>
            </header>

            <nav className="settings-tabs">
              <button className={settingsTab === 'appearance' ? 'active' : ''} onClick={() => setSettingsTab('appearance')}>Tampilan</button>
              <button className={settingsTab === 'performance' ? 'active' : ''} onClick={() => setSettingsTab('performance')}>Performa</button>
              <button className={settingsTab === 'about' ? 'active' : ''} onClick={() => setSettingsTab('about')}>Tentang</button>
            </nav>

            <div className="settings-content">
              {settingsTab === 'appearance' && <>
                <div className="setting-group">
                  <h3>Tema</h3><p>Pilih suasana tampilan Atlantic.</p>
                  <div className="choice-row">
                    {[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([v, l]) => (
                      <button key={v} className={settings.theme === v ? 'choice selected' : 'choice'} onClick={() => updateSetting('theme', v)}>
                        {settings.theme === v && <Check size={15} />} {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Warna aksen</h3>
                  <div className="swatches">
                    {['yellow', 'blue', 'pink', 'green', 'purple'].map(c => (
                      <button key={c} aria-label={c} title={c} className={`swatch ${c} ${settings.accent === c ? 'chosen' : ''}`} onClick={() => updateSetting('accent', c)}>
                        {settings.accent === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Font website</h3><p>Emoji menggunakan fallback emoji bawaan perangkat.</p>
                  <div className="font-list">
                    {FONT_OPTIONS.map(f => (
                      <button key={f.value} className={`font-choice font-${f.value} ${settings.font === f.value ? 'selected' : ''}`} onClick={() => updateSetting('font', f.value)}>
                        <span><b>{f.label}</b><small>Halo dunia 👋 😀</small></span>
                        {settings.font === f.value && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group">
                  <h3>Ukuran teks</h3>
                  <div className="choice-row">
                    {[['small', 'Kecil'], ['medium', 'Sedang'], ['large', 'Besar']].map(([v, l]) => (
                      <button key={v} className={settings.textSize === v ? 'choice selected' : 'choice'} onClick={() => updateSetting('textSize', v)}>
                        {settings.textSize === v && <Check size={15} />} {l}
                      </button>
                    ))}
                  </div>
                </div>
              </>}

              {settingsTab === 'performance' && <>
                <div className="setting-group">
                  <h3>Target animasi</h3>
                  <p>Pilih preset kelancaran animasi. FPS aktual tetap mengikuti browser, layar, dan kemampuan perangkat.</p>
                  <div className="fps-grid">
                    {[
                      ['30', 'Hemat baterai'], ['60', 'Seimbang'], ['90', 'Lebih mulus'],
                      ['120', 'Paling mulus'], ['auto', 'Otomatis']
                   ].map(([v, l]) => (
                      <button key={v} className={settings.fps === v ? 'fps-choice selected' : 'fps-choice'} onClick={() => updateSetting('fps', v)}>
                        <b>{v === 'auto' ? 'AUTO' : `${v} FPS`}</b><small>{l}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-group setting-toggle">
                  <div><h3>Animasi UI</h3><p>Efek transisi, bubble, dan Liquid Glass.</p></div>
                  <button className={`toggle ${settings.animations ? 'on' : ''}`} onClick={() => updateSetting('animations', !settings.animations)} aria-pressed={settings.animations}><span /></button>
                </div>
              </>}

              {settingsTab === 'about' && (
                <div className="about-card">
                  <div className="about-logo"><Waves size={34} /></div>
                  <h2>ATLANTIC</h2><p>Ruang obrolanmu, terhubung kapan saja.</p>
                  <div className="about-meta">
                    <span>Versi</span><b>1.2.0</b><span>Platform</span><b>Atlantic Web</b><span>UI</span><b>Neobrutalism + Liquid Glass</b>
                  </div>
                  <a href="https://github.com/AwalulBieber/Atlantic" target="_blank" rel="noreferrer">Lihat repository GitHub ↗</a>
                  <small className="about-note">Dibuat untuk percakapan yang lebih nyaman. Pengaturan tampilan tersimpan di perangkat ini.</small>
                </div>
              )}
            </div>

            <footer className="settings-footer">
              <span>Perubahan tersimpan otomatis</span>
              <button className="primary" onClick={() => setSettingsOpen(false)}>Selesai</button>
            </footer>
          </section>
        </div>
      )}

      {createMenuOpen && (
        <div className="create-menu-backdrop" onClick={() => setCreateMenuOpen(false)}>
          <section className="create-menu" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Buat baru">
            <header><div><small>ATLANTIC CREATE</small><b>Buat sesuatu</b></div><button className="icon-btn" onClick={() => setCreateMenuOpen(false)} aria-label="Tutup"><X size={18}/></button></header>
            <button onClick={() => { setActiveTab('chat'); setCreateMenuOpen(false); setNotice('Pilih pengguna dari daftar chat untuk membuka percakapan.'); }}><MessageSquarePlus/><span><b>Chat baru</b><small>Mulai percakapan</small></span></button>
            <button onClick={() => { setActiveTab('updates'); setCommunityCreateRequest(v => v + 1); setCreateMenuOpen(false); setNotice(''); }}><ImagePlus/><span><b>Story</b><small>Bagikan momen singkat</small></span></button>
            <button onClick={() => { setActiveTab('updates'); setCommunityCreateRequest(v => v + 1); setCreateMenuOpen(false); setNotice(''); }}><NotebookPen/><span><b>Catatan</b><small>Tulis sesuatu untuk dibagikan</small></span></button>
          </section>
        </div>
      )}

      {activeTab !== 'chat' && (
        <AtlanticCommunity
          tab={activeTab}
          user={session.user}
          profile={myProfile}
          createRequest={communityCreateRequest}
          onProfileRefresh={loadMyProfile}
          onNotice={setNotice}
        />
      )}

      <nav className="bottom-nav" aria-label="Navigasi utama">
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}><MessageCircle/><span>Chat</span></button>
        <button className={activeTab === 'updates' ? 'active' : ''} onClick={() => setActiveTab('updates')}><Clock3/><span>Pembaruan</span></button>
        <button className="nav-create" onClick={() => setCreateMenuOpen(true)} aria-label="Buat baru"><Plus/></button>
        <button className={activeTab === 'channels' ? 'active' : ''} onClick={() => setActiveTab('channels')}><Radio/><span>Saluran</span></button>
        <button className={activeTab === 'calls' ? 'active' : ''} onClick={() => setActiveTab('calls')}><Phone/><span>Panggilan</span></button>
      </nav>

      {accountSettingsOpen && (
        <AtlanticAccountSettings
          user={session.user}
          onClose={() => setAccountSettingsOpen(false)}
          onSaved={profile => { setMyProfile(profile); loadMyProfile(); }}
        />
      )}
    </main>
  );
                                            }
          
