
import React, { useEffect, useRef, useState } from 'react';
import { supabase, configReady } from './supabase';
import {
  MessageCircle, Search, Plus, Send, LogOut, ArrowLeft, Waves,
  Sparkles, MessageSquarePlus, Settings, X, Info, Check
} from 'lucide-react';

function initials(name = 'A') {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}

function time(value) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

const DEFAULT_SETTINGS = {
  theme: 'light',
  accent: 'yellow',
  font: 'ios',
  textSize: 'medium',
  fps: '60',
  animations: true
};

const FONT_OPTIONS = [
  { value: 'ios', label: 'iOS / SF Pro', sample: 'Halo dunia 👋 😀' },
  { value: 'inter', label: 'Inter', sample: 'Halo dunia 👋 😀' },
  { value: 'roboto', label: 'Roboto', sample: 'Halo dunia 👋 😀' },
  { value: 'nunito', label: 'Nunito', sample: 'Halo dunia 👋 😀' },
  { value: 'poppins', label: 'Poppins', sample: 'Halo dunia 👋 😀' },
  { value: 'arial', label: 'Arial', sample: 'Halo dunia 👋 😀' },
  { value: 'system', label: 'System Default', sample: 'Halo dunia 👋 😀' }
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
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');

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
      yellow: '#ffd84d',
      blue: '#7bd5ff',
      pink: '#ff9ec7',
      green: '#b8f36b',
      purple: '#c6a5ff'
    };

    root.style.setProperty(
      '--accent',
      accents[settings.accent] || accents.yellow
    );
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

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadProfiles();
    } else {
      setProfiles([]);
      setActive(null);
      setMessages([]);
      setUnread({});
      setIncomingNotice(null);
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
          email,
          password,
          options: {
            data: { display_name: displayName.trim() }
          }
        });

        if (error) throw error;

        setNotice(
          data.session
            ? 'Akun berhasil dibuat.'
            : 'Akun dibuat. Periksa email untuk konfirmasi, lalu login.'
        );

        if (!data.session) setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
      }
    } catch (err) {
      setNotice(err.message || 'Terjadi kesalahan.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url')
      .neq('id', session.user.id)
      .order('display_name');

    if (error) setNotice(error.message);
    else setProfiles(data || []);
  }

  async function openChat(person) {
    setNotice('');

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;

      if (!user) {
        throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');
      }

      if (user.id === person.id) {
        throw new Error('Kamu tidak bisa membuka chat dengan akun sendiri.');
      }

      const { data: conversationId, error: rpcError } =
        await supabase.rpc('create_direct_conversation', {
          target_user: person.id
        });

      if (rpcError) throw rpcError;

      if (!conversationId) {
        throw new Error('Database tidak mengembalikan ID percakapan.');
      }

      setUnread(old => {
        const next = { ...old };
        delete next[person.id];
        return next;
      });

      setIncomingNotice(null);
      setActive({ conversation_id: conversationId, person });
      setMobileChat(true);

      await loadMessages(conversationId);
    } catch (err) {
      setNotice(
        'Gagal membuka chat: ' +
        (err?.message || 'Terjadi kesalahan.')
      );
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

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  }

  // Realtime untuk chat yang sedang dibuka
  useEffect(() => {
    if (!active || !session) return;

    loadMessages(active.conversation_id);

    const channel = supabase
      .channel('chat-' + active.conversation_id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${active.conversation_id}`
        },
        payload => {
          setMessages(old =>
            old.some(m => m.id === payload.new.id)
              ? old
              : [...old, payload.new]
          );

          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 60);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active?.conversation_id, session?.user?.id]);

  // Realtime global: mendeteksi pesan dari semua percakapan
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('atlantic-global-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async payload => {
          const message = payload.new;

          if (
            !message ||
            message.sender_id === session.user.id ||
            seenMessages.current.has(message.id)
          ) {
            return;
          }

          seenMessages.current.add(message.id);

          // Chat yang sedang dibuka tidak perlu notifikasi
          if (active?.conversation_id === message.conversation_id) {
            return;
          }

          // Pastikan akun kita anggota percakapan
          const { data: members, error: memberError } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', message.conversation_id);

          if (memberError || !members) return;

          const isMember = members.some(
            member => member.user_id === session.user.id
          );

          if (!isMember) return;

          // Ambil profil pengirim
          const { data: person, error: profileError } = await supabase
            .from('profiles')
            .select('id,username,display_name,avatar_url')
            .eq('id', message.sender_id)
            .single();

          if (profileError || !person) return;

          setUnread(old => ({
            ...old,
            [person.id]: (old[person.id] || 0) + 1
          }));

          setIncomingNotice({
            person,
            body: message.body || 'Mengirim pesan'
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    seenMessages.current.clear();
  }

  if (!configReady) {
    return (
      <div className="setup">
        <div className="brand"><Waves /> ATLANTIC</div>
        <h1>Hubungkan database dulu</h1>
        <p>
          Isi file <b>.env</b> dengan Project URL dan Publishable Key
          Supabase. Lihat README.txt di paket proyek.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="center">
        <span className="loader-orbit" />
        <b>Menyiapkan Atlantic…</b>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand">
            <Waves size={28} /> ATLANTIC <Sparkles size={17} />
          </div>

          <p className="muted">
            Ruang obrolanmu, terhubung kapan saja.
          </p>

          <h1>
            {mode === 'login'
              ? 'Selamat datang kembali'
              : 'Buat akun Atlantic'}
          </h1>

          <form onSubmit={authenticate}>
            {mode === 'signup' && (
              <label>
                Nama tampilan
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                  placeholder="Nama kamu"
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="nama@email.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength="6"
                required
                placeholder="Minimal 6 karakter"
              />
            </label>

            <button className="primary full" disabled={authBusy}>
              {authBusy
                ? <><span className="button-spinner" /> Memproses…</>
                : mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
          </form>

          {notice && <p className="notice">{notice}</p>}

          <p className="switch">
            {mode === 'login'
              ? 'Belum punya akun?'
              : 'Sudah punya akun?'}

            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setNotice('');
              }}
            >
              {mode === 'login' ? 'Daftar' : 'Masuk'}
            </button>
          </p>
        </section>
      </main>
    );
  }

  const filtered = profiles.filter(p =>
    (p.display_name || p.username || '')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileChat ? 'hide-mobile' : ''}`}>
        <header className="topbar">
          <div className="brand"><Waves /> ATLANTIC</div>

          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={() => {
                setSettingsTab('appearance');
                setSettingsOpen(true);
              }}
              title="Pengaturan"
              aria-label="Pengaturan"
            >
              <Settings size={19} />
            </button>

            <button
              className="icon-btn"
              onClick={logout}
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <div className="me">
          <div className="avatar">
            {initials(
              session.user.user_metadata?.display_name ||
              session.user.email
            )}
          </div>

          <div>
            <b>
              {session.user.user_metadata?.display_name ||
                session.user.email}
            </b>
            <small><i className="online-dot" /> Online</small>
          </div>
        </div>

        <div className="search">
          <Search size={17} />
          <input
            placeholder="Cari pengguna…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="section-title">
          <span>Pengguna</span>
          <span className="count-tag">{filtered.length}</span>
        </div>

        <div className="people">
          {filtered.map(p => (
            <button
              className={`person ${
                active?.person.id === p.id ? 'selected' : ''
              }`}
              key={p.id}
              onClick={() => openChat(p)}
            >
              <div className="avatar">
                {initials(p.display_name || p.username)}
              </div>

              <div className="person-info">
                <b>{p.display_name || p.username}</b>
                <small>@{p.username}</small>
              </div>

              {unread[p.id] > 0 && (
                <span className="unread-badge">
                  {unread[p.id]}
                </span>
              )}

              <Plus size={17} />
            </button>
          ))}

          {!filtered.length && (
            <p className="empty">Pengguna Tidak Ditemukan</p>
          )}
        </div>

        <footer className="side-foot">
          ATLANTIC WEB <span>•</span> V1.1
        </footer>
      </aside>

      <section className={`chat-panel ${mobileChat ? 'show-mobile' : ''}`}>
        {active ? (
          <>
            <header className="chat-head">
              <button
                className="back icon-btn"
                onClick={() => setMobileChat(false)}
                aria-label="Kembali"
              >
                <ArrowLeft />
              </button>

              <div className="avatar">
                {initials(
                  active.person.display_name ||
                  active.person.username
                )}
              </div>

              <div className="chat-person">
                <b>
                  {active.person.display_name ||
                    active.person.username}
                </b>
                <small>@{active.person.username}</small>
              </div>
            </header>

            <div className="messages">
              {messages.map(m => (
                <div
                  className={`bubble-row ${
                    m.sender_id === session.user.id ? 'mine' : ''
                  }`}
                  key={m.id}
                >
                  <div className="bubble">
                    <div>{m.body}</div>
                    <time>{time(m.created_at)}</time>
                  </div>
                </div>
              ))}

              {!messages.length && (
                <div className="empty-chat">
                  <MessageCircle size={34} />
                  <b>Mulai percakapan</b>
                  <span>
                    Kirim pesan pertama ke {
                      active.person.display_name ||
                      active.person.username
                    }.
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Tulis pesan…"
                autoComplete="off"
              />

              <button
                className="send"
                disabled={!draft.trim() || sending}
                aria-label="Kirim pesan"
              >
                {sending
                  ? <span className="button-spinner" />
                  : <Send size={19} />}
              </button>
            </form>
          </>
        ) : (
          <div className="welcome">
            <div className="welcome-icon">
              <MessageSquarePlus size={42} />
            </div>
            <h2>Selamat datang di Atlantic</h2>
            <p>Pilih pengguna di samping untuk mulai mengobrol.</p>
          </div>
        )}
      </section>

      {notice && (
        <button className="toast" onClick={() => setNotice('')}>
          {notice}　×
        </button>
      )}

      {incomingNotice && (
        <button
          className="toast"
          onClick={() => {
            const person = incomingNotice.person;
            setIncomingNotice(null);
            openChat(person);
          }}
        >
          <b>
            {incomingNotice.person.display_name ||
              incomingNotice.person.username}
          </b>
          <br />
          {incomingNotice.body}
          <span>　×</span>
        </button>
      )}

      {settingsOpen && (
        <div
          className="settings-backdrop"
          onClick={() => setSettingsOpen(false)}
        >
          <section
            className="settings-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Pengaturan Atlantic"
          >
            <header className="settings-header">
              <div>
                <span className="eyebrow">ATLANTIC CONTROL</span>
                <h2>Pengaturan</h2>
              </div>

              <button
                className="icon-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="Tutup"
              >
                <X size={19} />
              </button>
            </header>

            <nav className="settings-tabs">
              <button
                className={settingsTab === 'appearan
