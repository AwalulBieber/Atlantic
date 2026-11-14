import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { X, ShieldCheck, Users, BadgeCheck, Clock3, CheckCircle2, XCircle, RefreshCw, Search, MessageSquare, Layers3, Radio, Eye, EyeOff } from 'lucide-react';
import './AtlanticAdminDashboard.css';

const dateLabel = value => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AtlanticAdminDashboard({ user, onClose, onNotice, onDialog }) {
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
  const [reports, setReports] = useState([]);
  const [channels, setChannels] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [groupsById, setGroupsById] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [userCount, conversationCount, messageCount, usersResult, userRequestsResult, groupRequestsResult, reportsResult, channelsResult] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id,username,display_name,avatar_url,is_verified,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('atlantic_verification_requests').select('id,user_id,note,status,requested_at,reviewed_at,review_note').order('requested_at', { ascending: false }).limit(100),
        supabase.from('atlantic_group_verification_requests').select('id,conversation_id,requester_id,status,note,admin_note,created_at,reviewed_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('atlantic_account_reports').select('id,reporter_id,reported_user_id,reason,status,admin_note,created_at,reviewed_at').order('created_at', { ascending: false }).limit(100),
        supabase.rpc('admin_list_channels')
      ]);
      const firstError = [usersResult, userRequestsResult, groupRequestsResult, reportsResult, channelsResult].find(result => result.error);
      if (firstError) throw firstError.error;
      const { data: moderationRows, error: moderationError } = await supabase.rpc('admin_get_profile_moderation', {
        p_user_ids: (usersResult.data || []).map(profile => profile.id)
      });
      if (moderationError) throw moderationError;
      const moderationById = Object.fromEntries((moderationRows || []).map(item => [item.user_id, item]));
      setUserTotal(userCount.count || 0);
      setConversationTotal(conversationCount.count || 0);
      setMessageTotal(messageCount.count || 0);
      setUsers((usersResult.data || []).map(profile => ({
        ...profile,
        is_blocked: moderationById[profile.id]?.is_blocked === true,
        blocked_reason: moderationById[profile.id]?.blocked_reason || null
      })));
      setUserRequests(userRequestsResult.data || []);
      setGroupRequests(groupRequestsResult.data || []);
      setReports(reportsResult.data || []);
      setChannels(channelsResult.data || []);

      const ids = [...new Set([
        ...(channelsResult.data || []).map(item => item.owner_id),
        ...(userRequestsResult.data || []).map(item => item.user_id),
        ...(groupRequestsResult.data || []).map(item => item.requester_id),
        ...(reportsResult.data || []).flatMap(item => [item.reporter_id, item.reported_user_id])
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
  const pendingReports = reports.filter(item => item.status === 'pending').length;

  const toggleChannelVisibility = async channel => {
    const shouldPublish = !channel.is_public;
    const confirmed = await onDialog?.({
      type: 'confirm',
      title: shouldPublish ? 'Tampilkan saluran?' : 'Sembunyikan saluran?',
      message: shouldPublish ? `Saluran “${channel.channel_name}” akan muncul kembali di penemuan saluran.` : `Saluran “${channel.channel_name}” akan disembunyikan dari penemuan publik.`,
      confirmLabel: shouldPublish ? 'Tampilkan' : 'Sembunyikan'
    });
    if (!confirmed) return;
    setBusyId('channel:' + channel.channel_id);
    const { error } = await supabase.rpc('admin_set_channel_visibility', {
      target_channel: channel.channel_id,
      should_publish: shouldPublish
    });
    if (error) onNotice?.('Gagal mengubah saluran: ' + error.message);
    else onNotice?.(shouldPublish ? 'Saluran ditampilkan kembali.' : 'Saluran berhasil disembunyikan.');
    setBusyId('');
    await loadDashboard();
  };

  const toggleAdminBlock = async profile => {
    const shouldBlock = !profile.is_blocked;
    const reason = shouldBlock ? ((await onDialog?.({type:'prompt',title:'Alasan blokir akun',message:`Masukkan alasan memblokir @${profile.username} (opsional).`,defaultValue:'Pelanggaran aturan Atlantic',placeholder:'Alasan blokir…',confirmLabel:'Lanjutkan',maxLength:500})) || '') : '';
    const confirmed=await onDialog?.({type:'confirm',title:shouldBlock?'Blokir akun?':'Buka blokir akun?',message:shouldBlock?`Blokir akun @${profile.username}?`:`Buka blokir akun @${profile.username}?`,confirmLabel:shouldBlock?'Blokir':'Buka blokir'}); if(!confirmed)return;
    setBusyId('block:' + profile.id);
    const { error } = await supabase.rpc('admin_set_user_blocked', { target_user: profile.id, should_block: shouldBlock, reason });
    if (error) onNotice?.('Gagal mengubah status blokir: ' + error.message);
    else onNotice?.(shouldBlock ? 'Akun berhasil diblokir.' : 'Blokir akun berhasil dibuka.');
    setBusyId(''); await loadDashboard();
  };

  const reviewReport = async (report, decision) => {
    const note = (await onDialog?.({type:'prompt',title:'Catatan admin',message:'Tambahkan catatan peninjauan (opsional).',placeholder:'Catatan untuk laporan…',confirmLabel:'Simpan catatan',maxLength:500})) || '';
    setBusyId('report:' + report.id);
    const { error } = await supabase.rpc('admin_review_account_report', { report_id: report.id, decision, admin_note: note.slice(0,500) });
    if (error) onNotice?.('Gagal memproses laporan: ' + error.message);
    else onNotice?.(decision === 'reviewed' ? 'Laporan ditandai sudah ditinjau.' : 'Laporan ditutup tanpa tindakan.');
    setBusyId(''); await loadDashboard();
  };

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
          <article className={pendingUsers + pendingGroups + pendingReports ? 'has-pending' : ''}><Clock3/><span>Menunggu ditinjau</span><b>{(pendingUsers + pendingGroups + pendingReports).toLocaleString('id-ID')}</b></article>
        </div>
        <nav className="atl-admin-tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Pengguna ({userTotal})</button>
          <button className={tab === 'verification' ? 'active' : ''} onClick={() => setTab('verification')}>Pemeriksaan akun {pendingUsers > 0 && <i>{pendingUsers}</i>}</button>
          <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Verifikasi grup {pendingGroups > 0 && <i>{pendingGroups}</i>}</button>
          <button className={tab === 'channels' ? 'active' : ''} onClick={() => setTab('channels')}>Saluran ({channels.length})</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Laporan akun {pendingReports > 0 && <i>{pendingReports}</i>}</button>
        </nav>
        <main className="atl-admin-content">
          {loading && <div className="atl-admin-loading"><span className="atl-admin-spinner"/> Memperbarui data…</div>}
          {!loading && tab === 'users' && <>
            <div className="atl-admin-section-heading"><div><h3>Daftar pengguna</h3><p>Menampilkan hingga 100 akun terbaru.</p></div><label className="atl-admin-search"><Search size={16}/><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Cari nama atau username"/></label></div>
            <div className="atl-admin-user-list">{filteredUsers.map(profile => <article key={profile.id} className="atl-admin-user"><div className="atl-admin-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : (profile.display_name || profile.username || 'A').slice(0,1).toUpperCase()}</div><div className="atl-admin-user-info"><b>{profile.display_name || profile.username || 'Pengguna'} {profile.is_verified && <BadgeCheck size={15}/>}</b><span>@{profile.username || 'tanpa-username'}</span><small>Bergabung {dateLabel(profile.created_at)}</small></div><div className="atl-admin-user-actions"><span className={profile.is_blocked ? 'atl-admin-status rejected' : profile.is_verified ? 'atl-admin-status verified' : 'atl-admin-status'}>{profile.is_blocked ? 'Diblokir' : profile.is_verified ? 'Verified User' : 'Pengguna'}</span><button className={profile.is_blocked ? 'unblock' : 'block'} disabled={busyId === 'block:' + profile.id} onClick={() => toggleAdminBlock(profile)}>{profile.is_blocked ? 'Buka blokir' : 'Blokir'}</button></div></article>)}
              {!filteredUsers.length && <p className="atl-admin-empty">Pengguna tidak ditemukan.</p>}</div>
          </>}
          {!loading && tab === 'verification' && <>
            <div className="atl-admin-section-heading"><div><h3>Pemeriksaan akun</h3><p>Tinjau pengajuan verifikasi pengguna. Persetujuan memberikan centang merah; centang biru tetap khusus Admin Atlantic utama.</p></div></div>
            <div className="atl-admin-request-list">{userRequests.map(request => { const profile = profilesById[request.user_id] || {}; const key = 'user:' + request.id; return <article className="atl-admin-request" key={request.id}><div className="atl-admin-request-top"><div><b>{profile.display_name || profile.username || 'Pengguna'}</b><span>@{profile.username || 'akun'}</span></div><span className={'atl-admin-status ' + request.status}>{request.status === 'pending' ? 'Menunggu' : request.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span></div><p>{request.note || 'Tidak ada catatan tambahan.'}</p><small>Diajukan {dateLabel(request.requested_at)}{request.reviewed_at ? ' · Ditinjau ' + dateLabel(request.reviewed_at) : ''}</small>{request.status === 'pending' && <><textarea value={reviewNotes[key] || ''} onChange={event => setReviewNotes(current => ({...current,[key]:event.target.value}))} maxLength={500} placeholder="Catatan admin (opsional)"/><div className="atl-admin-review-actions"><button className="reject" disabled={busyId === key} onClick={() => reviewRequest('user',request,false)}><XCircle size={16}/> Tolak</button><button className="approve" disabled={busyId === key} onClick={() => reviewRequest('user',request,true)}><CheckCircle2 size={16}/> Setujui</button></div></>}</article>; })}
              {!userRequests.length && <p className="atl-admin-empty">Belum ada pengajuan verifikasi.</p>}</div>
          </>}
          {!loading && tab === 'channels' && <>
            <div className="atl-admin-section-heading"><div><h3>Moderasi saluran</h3><p>Kelola visibilitas saluran publik. Menyembunyikan saluran tidak menghapus pesan atau anggota.</p></div></div>
            <div className="atl-admin-channel-list">{channels.map(channel => { const owner = profilesById[channel.owner_id] || {}; const key = 'channel:' + channel.channel_id; return <article className="atl-admin-channel" key={channel.channel_id}>
              <div className="atl-admin-channel-icon"><Radio size={19}/></div>
              <div className="atl-admin-channel-info"><b>{channel.channel_name || 'Saluran Atlantic'}</b><small>{channel.channel_description || 'Tidak ada deskripsi'}</small><span>Pemilik: {owner.display_name || owner.username || 'Pengguna'} · {Number(channel.member_count || 0).toLocaleString('id-ID')} pengikut · {dateLabel(channel.created_at)}</span></div>
              <span className={'atl-admin-status ' + (channel.is_public ? 'approved' : 'rejected')}>{channel.is_public ? 'Publik' : 'Disembunyikan'}</span>
              <button className={channel.is_public ? 'hide' : 'show'} disabled={busyId === key} onClick={() => toggleChannelVisibility(channel)}>{channel.is_public ? <><EyeOff size={15}/> Sembunyikan</> : <><Eye size={15}/> Tampilkan</>}</button>
            </article>; })}{!channels.length && <p className="atl-admin-empty">Belum ada saluran.</p>}</div>
          </>}
          {!loading && tab === 'reports' && <>
            <div className="atl-admin-section-heading"><div><h3>Laporan akun</h3><p>Periksa laporan pengguna dan ambil tindakan yang sesuai.</p></div></div>
            <div className="atl-admin-request-list">{reports.map(report => { const reporter = profilesById[report.reporter_id] || {}; const target = profilesById[report.reported_user_id] || {}; return <article className="atl-admin-request" key={report.id}><div className="atl-admin-request-top"><div><b>@{target.username || 'akun tidak ditemukan'}</b><span> dilaporkan oleh @{reporter.username || 'pengguna'}</span></div><span className={'atl-admin-status ' + (report.status === 'pending' ? 'pending' : report.status === 'reviewed' ? 'approved' : 'rejected')}>{report.status === 'pending' ? 'Menunggu' : report.status === 'reviewed' ? 'Ditinjau' : 'Ditutup'}</span></div><p>{report.reason}</p><small>Dilaporkan {dateLabel(report.created_at)}{report.admin_note ? ' · Catatan: ' + report.admin_note : ''}</small>{report.status === 'pending' && <div className="atl-admin-review-actions"><button className="reject" disabled={busyId === 'report:' + report.id} onClick={() => reviewReport(report,'dismissed')}><XCircle size={16}/> Tutup laporan</button><button className="approve" disabled={busyId === 'report:' + report.id} onClick={() => reviewReport(report,'reviewed')}><CheckCircle2 size={16}/> Tandai ditinjau</button>{target.id && !target.is_blocked && <button className="reject" disabled={busyId === 'block:' + target.id} onClick={() => toggleAdminBlock(target)}><ShieldCheck size={16}/> Blokir akun</button>}</div>}</article>; })}{!reports.length && <p className="atl-admin-empty">Belum ada laporan akun.</p>}</div>
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
