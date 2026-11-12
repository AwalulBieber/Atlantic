import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { X, Users, BadgeCheck, Camera, ShieldCheck, Send } from 'lucide-react';

export default function AtlanticGroupInfo({ conversationId, user, onClose, onUpdated }) {
  const [group,setGroup]=useState(null);
  const [members,setMembers]=useState([]);
  const [request,setRequest]=useState(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [avatarFile,setAvatarFile]=useState(null);
  const [avatarPreview,setAvatarPreview]=useState('');
  const [avatarUrl,setAvatarUrl]=useState('');

  async function load(){
    const {data:g,error:ge}=await supabase.from('conversations').select('id,title,description,avatar_url,is_verified,created_by').eq('id',conversationId).single();
    if(ge){setError(ge.message);return;}
    setGroup(g);
    if(g.avatar_url){const {data:signed}=await supabase.storage.from('atlantic-chat-media').createSignedUrl(g.avatar_url,3600);setAvatarUrl(signed?.signedUrl||'');}
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
    const {error:e}=await supabase.from('conversations').update({title:group.title.trim(),description:group.description.trim(),avatar_url:avatarPath}).eq('id',conversationId);
    if(e){if(avatarFile&&avatarPath)await supabase.storage.from('atlantic-chat-media').remove([avatarPath]);setError(e.message);}
    else{
      if(group.avatar_url&&avatarPath!==group.avatar_url)await supabase.storage.from('atlantic-chat-media').remove([group.avatar_url]);
      const {data:signed}=avatarPath?await supabase.storage.from('atlantic-chat-media').createSignedUrl(avatarPath,3600):{data:null};
      setAvatarUrl(signed?.signedUrl||'');setAvatarFile(null);setAvatarPreview('');onUpdated?.(group);
    }
    setBusy(false);
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
        {isAdmin&&<form className="atl-group-edit" onSubmit={saveGroup}>
          <label>Nama grup<input value={group.title||''} maxLength={60} onChange={e=>setGroup({...group,title:e.target.value})}/></label>
          <label>Deskripsi<textarea value={group.description||''} maxLength={500} onChange={e=>setGroup({...group,description:e.target.value})} placeholder="Tambahkan deskripsi…"/></label>
          <label className="atl-group-photo-pick"><Camera size={16}/> Ubah foto grup<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file&&file.size<=5*1024*1024){setAvatarFile(file);setAvatarPreview(URL.createObjectURL(file));setAvatarUrl(URL.createObjectURL(file));}else if(file)setError('Foto grup maksimal 5 MB.');}} hidden/></label>
          <button disabled={busy||group.title.trim().length<2}>Simpan perubahan</button>
        </form>}
        <section className="atl-group-verification">
          <h3><ShieldCheck size={17}/> Atlantic Verified</h3>
          {group.is_verified?<p>Grup ini sudah terverifikasi Atlantic.</p>:request?.status==='pending'?<p>Permintaan verifikasi sedang diperiksa admin Atlantic.</p>:request?.status==='rejected'?<p>Permintaan terakhir ditolak. Admin: {request.admin_note||'Tidak ada catatan'}.</p>:isAdmin?<form onSubmit={submitVerification}><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Jelaskan identitas dan tujuan grup…"/><button disabled={busy}><Send size={15}/> Ajukan verifikasi</button></form>:<p>Hanya admin grup yang dapat mengajukan verifikasi.</p>}
        </section>
        <section className="atl-group-members"><h3><Users size={17}/> Anggota ({members.length})</h3>{members.map(m=><article key={m.user_id}><span className="atl-group-member-avatar">{m.profile.avatar_url?<img src={m.profile.avatar_url} alt=""/>:(m.profile.display_name||m.profile.username||'A').slice(0,1).toUpperCase()}</span><span><b>{m.profile.display_name||m.profile.username||'Pengguna Atlantic'}</b><small>@{m.profile.username||'atlantic'}</small></span>{m.role==='admin'&&<small className="atl-group-admin-tag">Admin</small>}</article>)}</section>
      </>}
      {error&&<p className="atl-group-error">{error}</p>}
    </section>
  </div>;
}
