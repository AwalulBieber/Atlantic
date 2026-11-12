import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { X, ShieldCheck, Users, BadgeCheck, Clock3, CheckCircle2, XCircle, RefreshCw, Search, MessageSquare, Layers3 } from 'lucide-react';
import './AtlanticAdminDashboard.css';

const dateLabel = value => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AtlanticAdminDashboard({ user, onClose, onNotice }) {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userTotal, setUserTotal] = useState(0);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [messageTotal, setMessageTotal] = useState(0);
  const [userRequests, setUserRequests] = useState([]);
  const [groupRequests, setGroupRequests] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [groupsById, setGroupsById] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [userCount, conversationCount, messageCount, usersResult, userRequestsResult, groupRequestsResult] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id,username,display_name,avatar_url,is_verified,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('atlantic_verification_requests').select('id,user_id,note,status,requested_at,reviewed_at,review_note').order('requested_at', { ascending: false }).limit(100),
        supabase.from('atlantic_group_verification_requests').select('id,conversation_id,requester_id,status,note,admin_note,created_at,reviewed_at').order('created_at', { ascending: false }).limit(100)
      ]);
      const firstError = [usersResult, userRequestsResult, groupRequestsResult].find(result => result.error);
      if (firstError) throw firstError.error;
      setUserTotal(userCount.count || 0);
      setConversationTotal(conversationCount.count || 0);
      setMessageTotal(messageCount.count || 0);
      setUsers(usersResult.data || []);
      setUserRequests(userRequestsResult.data || []);
      setGroupRequests(groupRequestsResult.data || []);

      const ids = [...new Set([
        ...(userRequestsResult.data || []).map(item => item.user_id),
        ...(groupRequestsResult.data || []).map(item => item.requester_id)
      ])];
      const conversationIds = [...new Set((groupRequestsResult.data || []).map(item => item.conversation_id))];
      const [profileResult, groupResult] = await Promise.all([
        ids.length ? supabase.from('profiles').select('id,username,display_name,avatar_url,is_verified').in('id', ids) : Promise.resolve({ data: [], error: null }),
        conversationIds.length ? supabase.from('conversations').select('id,title,avatar_url,is_verified').in('id', conversationIds) : Promise.resolve({ data: [], error: null })
      ]);
      if (profileResult.error) throw profileResult.error;
      if (groupResult.error) throw groupResult.error;
      setProfilesById(Object.fromEntries((profileResult.data || []).map(profile => [profile.id, profile])));
      setGroupsById(Object.fromEntries((groupResult.data || []).map(group => [group.id, group])));
    } catch (error) {
      onNotice?.('Dashboard admin: ' + (error.message || 'Gagal memuat data.'));
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('is_atlantic_admin');
      if (!active) return;
      setAuthorized(!error && data === true);
      setChecking(false);
      if (!error && data === true) await loadDashboard();
    })();
    return () => { active = false; };
  }, [loadDashboard]);

  const reviewRequest = async (kind, request, approve) => {
    const key = kind + ':' + request.id;
    setBusyId(key);
    try {
      const rpc = kind === 'user' ? 'review_atlantic_verification_request' : 'review_atlantic_group_verification_request';
      const noteKey = key;
      const { error } = await supabase.rpc(rpc, {
        request_id: request.id,
        approve,
        admin_note: (reviewNotes[noteKey] || '').trim().slice(0, 500)
      });
      if (error) throw error;
      onNotice?.(approve ? 'Pengajuan berhasil disetujui.' : 'Pengajuan berhasil ditolak.');
      await loadDashboard();
    } catch (error) {
      onNotice?.('Gagal memproses pengajuan: ' + (error.message || 'Terjadi kesalahan.'));
    } finally {
      setBusyId('');
    }
  };

  const filteredUsers = useMemo(() => users.filter(profile =>
    (profile.display_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (profile.username || '').toLowerCase().includes(userSearch.toLowerCase())
  ), [users, userSearch]);
  const pendingUsers = userRequests.filter(item => item.status === 'pending').length;
  const pendingGroups = groupRequests.filter(item => item.status === 'pending').length;

  if (checking) return <div className="atl-admin-backdrop"><section className="atl-admin-panel"><div className="atl-admin-loading">Memeriksa akses admin…</div></section></div>;
  if (!authorized) return <div className="atl-admin-backdrop" onClick={onClose}><section className="atl-admin-panel atl-admin-denied" onClick={event => event.stopPropagation()}><button className="atl-admin-close" onClick={onClose} aria-label="Tutup"><X/></button><ShieldCheck size={38}/><h2>Akses ditolak</h2><p>Akun ini tidak memiliki hak akses Dashboard Admin Atlantic.</p></section></div>;

  return (
    <div className="atl-admin-backdrop" onClick={onClose}>
      <section className="atl-admin-panel" role="dialog" aria-modal="true" aria-label="Dashboard Admin Atlantic" onClick={event => event.stopPropagation()}>
        <header className="atl-admin-header">
          <div className="atl-admin-brand"><span><ShieldCheck size={22}/></span><div><small>ATLANTIC CONTROL CENTER</small><h2>Dashboard Admin</h2><p>Masuk sebagai {user?.email || 'Admin Atlantic'}</p></div></div>
          <div className="atl-admin-header-actions"><button onClick={loadDashboard} disabled={loading} aria-label="Muat ulang"><RefreshCw size={18}/></button><button onClick={onClose} aria-label="Tutup"><X size={20}/></button></div>
        </header>
        <div className="atl-admin-stats">
          <article><Users/><span>Total pengguna</span><b>{userTotal.toLocaleString('id-ID')}</b></article>
          <article><Layers3/><span>Percakapan</span><b>{conversationTotal.toLocaleString('id-ID')}</b></article>
          <article><MessageSquare/><span>Pesan</span><b>{messageTotal.toLocaleString('id-ID')}</b></article>
          <article className={pendingUsers + pendingGroups ? 'has-pending' : ''}><Clock3/><span>Menunggu ditinjau</span><b>{(pendingUsers + pendingGroups).toLocaleString('id-ID')}</b></article>
        </div>
        <nav className="atl-admin-tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Pengguna ({userTotal})</button>
          <button className={tab === 'verification' ? 'active' : ''} onClick={() => setTab('verification')}>Verifikasi pengguna {pendingUsers > 0 && <i>{pendingUsers}</i>}</button>
          <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Verifikasi grup {pendingGroups > 0 && <i>{pendingGroups}</i>}</button>
        </nav>
        <main className="atl-admin-content">
          {loading && <div className="atl-admin-loading"><span className="atl-admin-spinner"/> Memperbarui data…</div>}
          {!loading && tab === 'users' && <>
            <div className="atl-admin-section-heading"><div><h3>Daftar pengguna</h3><p>Menampilkan hingga 100 akun terbaru.</p></div><label className="atl-admin-search"><Search size={16}/><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Cari nama atau username"/></label></div>
            <div className="atl-admin-user-list">{filteredUsers.map(profile => <article key={profile.id} className="atl-admin-user"><div className="atl-admin-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : (profile.display_name || profile.username || 'A').slice(0,1).toUpperCase()}</div><div className="atl-admin-user-info"><b>{profile.display_name || profile.username || 'Pengguna'} {profile.is_verified && <BadgeCheck size={15}/>}</b><span>@{profile.username || 'tanpa-username'}</span><small>Bergabung {dateLabel(profile.created_at)}</small></div><span className={profile.is_verified ? 'atl-admin-status verified' : 'atl-admin-status'}>{profile.is_verified ? 'Terverifikasi' : 'Reguler'}</span></article>)}
              {!filteredUsers.length && <p className="atl-admin-empty">Pengguna tidak ditemukan.</p>}</div>
          </>}
          {!loading && tab === 'verification' && <>
            <div className="atl-admin-section-heading"><div><h3>Pengajuan verifikasi pengguna</h3><p>Tinjau permintaan lencana verifikasi akun.</p></div></div>
            <div className="atl-admin-request-list">{userRequests.map(request => { const profile = profilesById[request.user_id] || {}; const key = 'user:' + request.id; return <article className="atl-admin-request" key={request.id}><div className="atl-admin-request-top"><div><b>{profile.display_name || profile.username || 'Pengguna'}</b><span>@{profile.username || 'akun'}</span></div><span className={'atl-admin-status ' + request.status}>{request.status === 'pending' ? 'Menunggu' : request.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span></div><p>{request.note || 'Tidak ada catatan tambahan.'}</p><small>Diajukan {dateLabel(request.requested_at)}{request.reviewed_at ? ' · Ditinjau ' + dateLabel(request.reviewed_at) : ''}</small>{request.status === 'pending' && <><textarea value={reviewNotes[key] || ''} onChange={event => setReviewNotes(current => ({...current,[key]:event.target.value}))} maxLength={500} placeholder="Catatan admin (opsional)"/><div className="atl-admin-review-actions"><button className="reject" disabled={busyId === key} onClick={() => reviewRequest('user',request,false)}><XCircle size={16}/> Tolak</button><button className="approve" disabled={busyId === key} onClick={() => reviewRequest('user',request,true)}><CheckCircle2 size={16}/> Setujui</button></div></>}</article>; })}
              {!userRequests.length && <p className="atl-admin-empty">Belum ada pengajuan verifikasi.</p>}</div>
          </>}
          {!loading && tab === 'groups' && <>
            <div className="atl-admin-section-heading"><div><h3>Pengajuan verifikasi grup</h3><p>Tinjau permintaan lencana resmi untuk grup.</p></div></div>
            <div className="atl-admin-request-list">{groupRequests.map(request => { const group = groupsById[request.conversation_id] || {}; const profile = profilesById[request.requester_id] || {}; const key = 'group:' + request.id; return <article className="atl-admin-request" key={request.id}><div className="atl-admin-request-top"><div><b>{group.title || 'Grup Atlantic'}</b><span>Diminta oleh {profile.display_name || profile.username || 'anggota'}</span></div><span className={'atl-admin-status ' + request.status}>{request.status === 'pending' ? 'Menunggu' : request.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span></div><p>{request.note || 'Tidak ada catatan tambahan.'}</p><small>Diajukan {dateLabel(request.created_at)}{request.reviewed_at ? ' · Ditinjau ' + dateLabel(request.reviewed_at) : ''}</small>{request.status === 'pending' && <><textarea value={reviewNotes[key] || ''} onChange={event => setReviewNotes(current => ({...current,[key]:event.target.value}))} maxLength={500} placeholder="Catatan admin (opsional)"/><div className="atl-admin-review-actions"><button className="reject" disabled={busyId === key} onClick={() => reviewRequest('group',request,false)}><XCircle size={16}/> Tolak</button><button className="approve" disabled={busyId === key} onClick={() => reviewRequest('group',request,true)}><CheckCircle2 size={16}/> Setujui</button></div></>}</article>; })}
              {!groupRequests.length && <p className="atl-admin-empty">Belum ada pengajuan verifikasi grup.</p>}</div>
          </>}
        </main>
        <footer className="atl-admin-footer">Akses dibatasi oleh otorisasi admin di Supabase · Data dimuat langsung dari Atlantic</footer>
      </section>
    </div>
  );
}
