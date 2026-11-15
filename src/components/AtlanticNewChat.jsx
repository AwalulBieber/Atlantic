import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Search, X, MessageCircle, BadgeCheck } from 'lucide-react';

export default function AtlanticNewChat({ user, onClose, onOpenChat }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const loadPeople = useCallback(async (term = '') => {
    if (!user?.id) return;
    setBusy(true);
    setError('');
    let request = supabase.from('profiles')
      .select('id,username,display_name,avatar_url,is_verified')
      .neq('id', user.id)
      .limit(40);
    const safe = term.trim().replace(/[,%()]/g, ' ').trim();
    if (safe) request = request.or('username.ilike.%' + safe + '%,display_name.ilike.%' + safe + '%');
    const { data, error: loadError } = await request;
    if (loadError) setError(loadError.message || 'Gagal memuat pengguna.');
    else setPeople(data || []);
    setBusy(false);
  }, [user?.id]);

  useEffect(() => { loadPeople(''); }, [loadPeople]);
  useEffect(() => {
    const timer = setTimeout(() => loadPeople(query), 220);
    return () => clearTimeout(timer);
  }, [query, loadPeople]);

  return <div className="atl-new-chat-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
    <section className="atl-new-chat-modal" role="dialog" aria-modal="true" aria-label="Chat baru">
      <header>
        <div><small>ATLANTIC / MESSAGES</small><h2>Chat baru</h2><p>Pilih pengguna untuk memulai percakapan</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
      </header>
      <label className="atl-new-chat-search"><Search size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama atau username…"/></label>
      {error && <p className="atl-new-chat-error">{error}</p>}
      <div className="atl-new-chat-list">
        {people.map(person => <button className="atl-new-chat-person" type="button" key={person.id} onClick={() => onOpenChat?.(person)}>
          <span className="atl-new-chat-avatar">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : (person.display_name || person.username || 'A').slice(0,1).toUpperCase()}</span>
          <span className="atl-new-chat-person-info"><b>{person.display_name || person.username || 'Pengguna Atlantic'} {person.is_verified && <BadgeCheck size={15} aria-label="Atlantic Verified"/>}</b><small>@{person.username || 'atlantic'}</small></span>
          <MessageCircle size={18}/>
        </button>)}
        {!busy && !error && people.length === 0 && <p className="atl-new-chat-empty">{query.trim() ? 'Pengguna tidak ditemukan.' : 'Belum ada pengguna lain yang tersedia.'}</p>}
        {busy && <p className="atl-new-chat-empty">Memuat pengguna…</p>}
      </div>
      <footer>Pengguna Atlantic</footer>
    </section>
  </div>;
}
