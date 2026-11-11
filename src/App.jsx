import React, { useEffect, useRef, useState } from 'react';
import { supabase, configReady } from './supabase';
import AtlanticAccountSettings from './components/AtlanticAccountSettings';
import {
  MessageCircle, Search, Plus, Send, LogOut, ArrowLeft, Waves,
  Sparkles, MessageSquarePlus, Settings, UserRound, X, Check
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
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [chats, setChats] = useState([]);
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
  loadProfiles();
} else {
  setProfiles([]);
  setChats([]);
  setActive(null);
  setMessages([]);
  setUnread({});
  setIncomingNotice(null);
  setAccountSettingsOpen(false);
  seenMessages.current.clear();
    }
  }, [session]);

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
    return;
  }

  const ids = mine.map(c => c.conversation_id);

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
    .select('id,username,display_name,avatar_url')
    .in('id', userIds);

  if (profileError) {
    setNotice(profileError.message);
    return;
  }

  setChats((members || []).map(m => ({
    conversation_id: m.conversation_id,
    person: people.find(p => p.id === m.user_id)
  })).filter(c => c.person));
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
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      setNotice(error.message);
      return;
    }
    setMessages(data || []);
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
      }, payload => {
        setMessages(old => old.some(m => m.id === payload.new.id) ? old : [...old, payload.new]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [active?.conversation_id, session?.user?.id]);

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

        setUnread(old => ({ ...old, [person.id]: (old[person.id] || 0) + 1 }));
        setIncomingNotice({ person, body: message.body || 'Mengirim pesan' });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id, active?.conversation_id]);

  async function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    setDraft('');
    const { error } = await supabase.from('messages').insert({
      conversation_id: active.conversation_id,
      sender_id: session.user.id,
      body
    });
    if (error) {
      setDraft(body);
      setNotice('Pesan gagal dikirim: ' + error.message);
    }
    setSending(false);
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

  const filtered = chats.filter(c =>
  (c.person.display_name || c.person.username || '')
    .toLowerCase().includes(search.toLowerCase())
);

  return (
    <main className="app-shell">
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
          <div className="avatar">{initials(session.user.user_metadata?.display_name || session.user.email)}</div>
          <div>
            <b>{session.user.user_metadata?.display_name || session.user.email}</b>
            <small><i className="online-dot" /> Online</small>
          </div>
        </div>

        <div className="search">
          <Search size={17} />
          <input placeholder="Cari Chat…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="section-title"><span>Chat</span><span className="count-tag">{filtered.length}</span></div>
        <div className="people">
  {filtered.map(c => (
    <button
      className={`person ${active?.conversation_id === c.conversation_id ? 'selected' : ''}`}
      key={c.conversation_id}
      onClick={() => openChat(c.person)}
    >
      <div className="avatar">
        {initials(c.person.display_name || c.person.username)}
      </div>
      <div className="person-info">
        <b>{c.person.display_name || c.person.username}</b>
        <small>Ketuk untuk membuka chat</small>
      </div>
      <MessageCircle size={17} />
    </button>
  ))}

  {!filtered.length && (
    <p className="empty">Belum ada percakapan</p>
  )}
</div>
        <footer className="side-foot">ATLANTIC WEB <span>•</span> V1.1</footer>
      </aside>

      <section className={`chat-panel ${mobileChat ? 'show-mobile' : ''}`}>
        {active ? (
          <>
            <header className="chat-head">
              <button className="back icon-btn" onClick={() => setMobileChat(false)} aria-label="Kembali"><ArrowLeft /></button>
              <div className="avatar">{initials(active.person.display_name || active.person.username)}</div>
              <div className="chat-person">
                <b>{active.person.display_name || active.person.username}</b>
                <small>@{active.person.username}</small>
              </div>
            </header>
            <div className="messages">
              {messages.map(m => (
                <div className={`bubble-row ${m.sender_id === session.user.id ? 'mine' : ''}`} key={m.id}>
                  <div className="bubble"><div>{m.body}</div><time>{time(m.created_at)}</time></div>
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
            <form className="composer" onSubmit={sendMessage}>
              <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Tulis pesan…" autoComplete="off" />
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

      {accountSettingsOpen && (
        <AtlanticAccountSettings
          user={session.user}
          onClose={() => setAccountSettingsOpen(false)}
        />
      )}
    </main>
  );
                                            }
          
