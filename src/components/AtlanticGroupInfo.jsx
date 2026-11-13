import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { X, Users, BadgeCheck, Camera, ShieldCheck, Send } from 'lucide-react';

export default function AtlanticGroupInfo({ conversationId, user, onClose, onUpdated, onNotice }) {
  const [group,setGroup]=useState(null);
  const [members,setMembers]=useState([]);
  const [recentMessages,setRecentMessages]=useState([]);
  const [request,setRequest]=useState(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [avatarFile,setAvatarFile]=useState(null);
  const [avatarPreview,setAvatarPreview]=useState('');
  const [avatarUrl,setAvatarUrl]=useState('');
  const [inviteLink,setInviteLink]=useState('');
  const [inviteLinkId,setInviteLinkId]=useState('');
  const [inviteBusy,setInviteBusy]=useState(false);
  const [inviteExpiry,setInviteExpiry]=useState('never');
  const [inviteMaxUses,setInviteMaxUses]=useState('');

  async function load(){
    const {data:g,error:ge}=await supabase.from('conversations').select('id,title,description,avatar_url,is_verified,created_by,message_policy,add_member_policy,pinned_message_id').eq('id',conversationId).single();
    if(ge){setError(ge.message);return;}
    setGroup(g);
    if(g.avatar_url){const {data:signed}=await supabase.storage.from('atlantic-chat-media').createSignedUrl(g.avatar_url,3600);setAvatarUrl(signed?.signedUrl||'');}
    const {data:messageRows}=await supabase.from('messages').select('id,body,created_at,sender_id').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(40);
    setRecentMessages(messageRows||[]);
    const {data:m,error:me}=await supabase.from('conversation_members').select('user_id,role,joined_at').eq('conversation_id',conversationId).order('joined_at');
    if(me){setError(me.message);return;}
    const ids=(m||[]).map(x=>x.user_id);
    const {data:p}=ids.length?await supabase.from('profiles').select('id,username,display_name,avatar_url,is_verified').in('id',ids):{data:[]};
    const map=Object.fromEntries((p||[]).map(x=>[x.id,x]));
    setMembers((m||[]).map(x=>({...x,profile:map[x.user_id]||{}})));
    const {data:r}=await supabase.from('atlantic_group_verification_requests').select('id,status,note,admin_note,created_at,reviewed_at').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(1).maybeSingle();
    setRequest(r||null);
  }

  useEffect(()=>{load();},[conversationId]);
  useEffect(()=>()=>{if(avatarPreview)URL.revokeObjectURL(avatarPreview);},[avatarPreview]);
  const isAdmin=members.some(m=>m.user_id===user.id&&m.role==='admin');

  async function saveGroup(e){
    e.preventDefault();if(!group||busy||!isAdmin)return;
    setBusy(true);setError('');
    let avatarPath=group.avatar_url;
    if(avatarFile){
      const ext=(avatarFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      const next=conversationId+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
      const {error:uploadError}=await supabase.storage.from('atlantic-chat-media').upload(next,avatarFile,{upsert:false,contentType:avatarFile.type});
      if(uploadError){setError(uploadError.message);setBusy(false);return;}
      avatarPath=next;
    }
    const {error:updateError}=await supabase.from('conversations').update({title:String(group.title||'').trim(),description:String(group.description||'').trim(),avatar_url:avatarPath,message_policy:group.message_policy,add_member_policy:group.add_member_policy,pinned_message_id:group.pinned_message_id||null}).eq('id',conversationId);
    if(updateError){if(avatarFile&&avatarPath)await supabase.storage.from('atlantic-chat-media').remove([avatarPath]);setError(updateError.message);}
    else{
      if(group.avatar_url&&avatarPath!==group.avatar_url)await supabase.storage.from('atlantic-chat-media').remove([group.avatar_url]);
      const {data:signed}=avatarPath?await supabase.storage.from('atlantic-chat-media').createSignedUrl(avatarPath,3600):{data:null};
      setAvatarUrl(signed?.signedUrl||'');setAvatarFile(null);if(avatarPreview)URL.revokeObjectURL(avatarPreview);setAvatarPreview('');const saved={...group,avatar_url:avatarPath,avatar_signed_url:signed?.signedUrl||null};setGroup(saved);onUpdated?.(saved);
    }
    setBusy(false);
  }

  async function createInviteLink(){
    if(!isAdmin||inviteBusy)return;
    setInviteBusy(true);setError('');
    const token=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
    const maxUses=inviteMaxUses.trim()?Number(inviteMaxUses):null;
    if(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1)){setError('Batas penggunaan harus berupa angka minimal 1.');setInviteBusy(false);return;}
    const expiresAt=inviteExpiry==='never'?null:new Date(Date.now()+Number(inviteExpiry)*86400000).toISOString();
    const {data:id,error:e}=await supabase.rpc('create_atlantic_invite_link',{
      p_invite_type:'group',p_resource_id:conversationId,p_token:token,p_expires_at:expiresAt,p_max_uses:maxUses
    });
    if(e){setError('Link undangan gagal dibuat: '+e.message);setInviteBusy(false);return;}
    const url=window.location.origin+'/?atlanticInvite='+encodeURIComponent(token);
    setInviteLink(url);setInviteLinkId(id);
    try{await navigator.clipboard.writeText(url);onNotice?.('Link undangan grup berhasil dibuat dan disalin.');}
    catch{onNotice?.('Link undangan grup berhasil dibuat. Salin link yang tampil.');}
    setInviteBusy(false);
  }

  async function revokeInviteLink(){
    if(!inviteLinkId||inviteBusy)return;
    setInviteBusy(true);
    const {error:e}=await supabase.rpc('revoke_atlantic_invite_link',{p_link_id:inviteLinkId});
    if(e)setError('Link gagal dinonaktifkan: '+e.message);
    else{setInviteLink('');setInviteLinkId('');onNotice?.('Link undangan grup dinonaktifkan.');}
    setInviteBusy(false);
  }

  async function submitVerification(e){
    e.preventDefault();if(!isAdmin||busy)return;
    setBusy(true);setError('');
    const {error:e1}=await supabase.from('atlantic_group_verification_requests').insert({conversation_id:conversationId,requester_id:user.id,note:note.trim()});
    if(e1)setError(e1.code==='23505'?'Permintaan verifikasi grup masih menunggu pemeriksaan.':e1.message);
    else{setNote('');await load();}
    setBusy(false);
  }

  return <div className="atl-group-info-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}>
    <section className="atl-group-info" role="dialog" aria-modal="true" aria-label="Info grup">
      <header><button type="button" onClick={onClose} aria-label="Kembali"><X/></button><b>Info grup</b><span>ATLANTIC GROUP</span></header>
      {!group?<p>Memuat info grup…</p>:<>
        <div className="atl-group-profile">
          <div className="atl-group-avatar">{avatarUrl?<img src={avatarUrl} alt="Foto grup"/>:<Users size={34}/>}</div>
          <h2>{group.title} {group.is_verified&&<BadgeCheck className="atl-group-verified" size={19}/>}</h2>
          <p>Grup · {members.length} anggota</p>
        </div>
        {isAdmin&&<section className="atl-group-invite-link">
          <h3>Undang lewat link</h3>
          <p>Buat link untuk mengundang teman bergabung ke grup ini.</p>
          <label>Masa berlaku<select value={inviteExpiry} onChange={e=>setInviteExpiry(e.target.value)}><option value="never">Tidak kedaluwarsa</option><option value="1">1 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></select></label>
          <label>Batas penggunaan (opsional)<input type="number" min="1" max="10000" value={inviteMaxUses} onChange={e=>setInviteMaxUses(e.target.value)} placeholder="Kosong = tanpa batas"/></label>
          <button type="button" onClick={createInviteLink} disabled={inviteBusy}>{inviteBusy?'Memproses…':'Buat / perbarui link undangan'}</button>
          {inviteLink&&<><input readOnly value={inviteLink} onFocus={e=>e.target.select()}/><div><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(inviteLink);onNotice?.('Link disalin.');}catch{setError('Gagal menyalin otomatis. Tekan dan tahan link untuk menyalin.');}}}>Salin link</button><button type="button" className="atl-group-invite-revoke" onClick={revokeInviteLink} disabled={inviteBusy}>Nonaktifkan link</button></div></>}
        </section>}
        {isAdmin&&<form className="atl-group-edit" onSubmit={saveGroup}>
          <label>Nama grup<input value={group.title||''} maxLength={60} onChange={e=>setGroup({...group,title:e.target.value})}/></label>
          <label>Deskripsi<textarea value={group.description||''} maxLength={500} onChange={e=>setGroup({...group,description:e.target.value})} placeholder="Tambahkan deskripsi…"/></label>
          <label className="atl-group-photo-pick"><Camera size={16}/> Ubah foto grup<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file&&file.size<=5*1024*1024){if(avatarPreview)URL.revokeObjectURL(avatarPreview);const preview=URL.createObjectURL(file);setAvatarFile(file);setAvatarPreview(preview);setAvatarUrl(preview);}else if(file)setError('Foto grup maksimal 5 MB.');}} hidden/></label>
          <button disabled={busy||group.title.trim().length<2}>Simpan perubahan</button>
        </form>}
        {isAdmin&&<section className="atl-group-permissions">
          <h3>⚙️ Pengaturan grup</h3>
          <label><span><b>Kirim pesan</b><small>Siapa yang boleh mengirim pesan di grup ini</small></span><select value={group.message_policy||'all'} onChange={e=>setGroup({...group,message_policy:e.target.value})}><option value="all">Semua anggota</option><option value="admins">Hanya admin</option></select></label>
          <label><span><b>Tambah anggota</b><small>Siapa yang boleh menambahkan anggota baru</small></span><select value={group.add_member_policy||'admins'} onChange={e=>setGroup({...group,add_member_policy:e.target.value})}><option value="admins">Hanya admin</option><option value="all">Semua anggota</option></select></label>
          <label><span><b>Sematkan pesan</b><small>Pilih pesan yang ditampilkan sebagai pesan penting grup</small></span><select value={group.pinned_message_id||''} onChange={e=>setGroup({...group,pinned_message_id:e.target.value||null})}><option value="">Tidak ada pesan disematkan</option>{recentMessages.map(message=><option key={message.id} value={message.id}>{(message.body||'Lampiran').slice(0,65)} · {new Date(message.created_at).toLocaleDateString('id-ID')}</option>)}</select></label>
          <p>Pengaturan berlaku langsung setelah menekan Simpan perubahan di atas.</p>
        </section>}
        <section className="atl-group-verification">
          <h3><ShieldCheck size={17}/> Atlantic Verified</h3>
          {group.is_verified?<p>Grup ini sudah terverifikasi Atlantic.</p>:request?.status==='pending'?<p>Permintaan verifikasi sedang diperiksa admin Atlantic.</p>:isAdmin?<><form onSubmit={submitVerification}><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Jelaskan identitas dan tujuan grup…"/><button disabled={busy}><Send size={15}/> Ajukan verifikasi</button></form>{request?.status==='rejected'&&<p>Pengajuan terakhir ditolak: {request.admin_note||'Tidak ada catatan'}. Kamu bisa mengajukan ulang.</p>}</>:<p>Hanya admin grup yang dapat mengajukan verifikasi.</p>}
        </section>
        <section className="atl-group-members"><h3><Users size={17}/> Anggota ({members.length})</h3>{members.map(m=><article key={m.user_id}><span className="atl-group-member-avatar">{m.profile.avatar_url?<img src={m.profile.avatar_url} alt=""/>:(m.profile.display_name||m.profile.username||'A').slice(0,1).toUpperCase()}</span><span><b>{m.profile.display_name||m.profile.username||'Pengguna Atlantic'}</b><small>@{m.profile.username||'atlantic'}</small></span>{m.role==='admin'&&<small className="atl-group-admin-tag">Admin</small>}</article>)}</section>
      </>}
      {error&&<p className="atl-group-error">{error}</p>}
    </section>
  </div>;
}
