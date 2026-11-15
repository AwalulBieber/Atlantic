import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Search, X, MessageCircle, BadgeCheck } from 'lucide-react';

export default function AtlanticNewChat({ user, onClose, onOpenChat }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const loadPeople = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    setError('');
    const { data: rows, error: rowsError } = await supabase.from('atlantic_contacts')
      .select('requester_id,addressee_id,created_at')
      .eq('status', 'accepted')
      .or('requester_id.eq.' + user.id + ',addressee_id.eq.' + user.id)
      .order('created_at', { ascending: false });
    if (rowsError) {
      setError(rowsError.message || 'Gagal memuat kontak.');
      setPeople([]);
      setBusy(false);
      return;
    }
    const ids = [...new Set((rows || []).map(row =>
      row.requester_id === user.id ? row.addressee_id : row.requester_id
    ).filter(Boolean))];
    if (!ids.length) {
      setPeople([]);
      setBusy(false);
      return;
    }
    const { data, error: peopleError } = await supabase.from('profiles')
      .select('id,username,display_name,avatar_url,is_verified')
      .in('id', ids);
    if (peopleError) setError(peopleError.message || 'Gagal memuat kontak.');
    else setPeople(data || []);
    setBusy(false);
  }, [user?.id]);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  const filteredPeople = people.filter(person => {
    const term = query.trim().toLowerCase();
    return !term || (person.display_name || '').toLowerCase().includes(term) ||
      (person.username || '').toLowerCase().includes(term);
  });

  return <div className="atl-new-chat-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
    <section className="atl-new-chat-modal" role="dialog" aria-modal="true" aria-label="Chat baru">
      <header>
        <div><small>ATLANTIC / MESSAGES</small><h2>Chat baru</h2><p>Pilih pengguna untuk memulai percakapan</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
      </header>
      <label className="atl-new-chat-search"><Search size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama atau username…"/></label>
      {error && <p className="atl-new-chat-error">{error}</p>}
      <div className="atl-new-chat-list">
        {filteredPeople.map(person => <button className="atl-new-chat-person" type="button" key={person.id} onClick={() => onOpenChat?.(person)}>
          <span className="atl-new-chat-avatar">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : (person.display_name || person.username || 'A').slice(0,1).toUpperCase()}</span>
          <span className="atl-new-chat-person-info"><b>{person.display_name || person.username || 'Pengguna Atlantic'} {person.is_verified && <BadgeCheck size={15} aria-label="Atlantic Verified"/>}</b><small>@{person.username || 'atlantic'}</small></span>
          <MessageCircle size={18}/>
        </button>)}
        {!busy && !error && filteredPeople.length === 0 && <p className="atl-new-chat-empty">{query.trim() ? 'Kontak tidak ditemukan.' : 'Belum ada kontak yang diterima.'}</p>}
        {busy && <p className="atl-new-chat-empty">Memuat pengguna…</p>}
      </div>
      <footer>Pengguna Atlantic</footer>
    </section>
  </div>;
}
