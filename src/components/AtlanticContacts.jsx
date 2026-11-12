import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { UserPlus, Check, X, Search, Users, Clock3, Trash2 } from 'lucide-react';

export default function AtlanticContacts({ user, onClose, onOpenChat }) {
  const [query,setQuery]=useState('');
  const [profiles,setProfiles]=useState([]);
  const [searchProfiles,setSearchProfiles]=useState([]);
  const [rows,setRows]=useState([]);
  const [blockedRows,setBlockedRows]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const load = useCallback(async () => {
    if(!user?.id)return;
    setBusy(true);setError('');
    const {data:myBlocks,error:blockError}=await supabase.from('atlantic_user_blocks').select('id,blocked_user_id,created_at').eq('blocker_id',user.id).order('created_at',{ascending:false});
    if(!blockError)setBlockedRows(myBlocks||[]);
    const {data,error:e}=await supabase.from('atlantic_contacts')
      .select('id,requester_id,addressee_id,status,created_at')
      .or('requester_id.eq.'+user.id+',addressee_id.eq.'+user.id)
      .order('created_at',{ascending:false}).limit(200);
    if(e){setError(e.message);setBusy(false);return;}
    const list=data||[];setRows(list);
    const ids=[...new Set([...list.flatMap(r=>[r.requester_id,r.addressee_id]),...(myBlocks||[]).map(item=>item.blocked_user_id)].filter(id=>id!==user.id))];
    if(ids.length){
      const {data:people,error:pe}=await supabase.from('profiles').select('id,username,display_name,avatar_url,is_verified').in('id',ids);
      if(!pe)setProfiles(people||[]);
    }else setProfiles([]);
    setBusy(false);
  },[user?.id]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    let cancelled=false;
    const run=async()=>{
      const term=query.trim();
      if(!term){setSearchProfiles([]);return;}
      const safe=term.replace(/[,%()]/g,' ').trim();
      if(!safe){setSearchProfiles([]);return;}
      const {data,error:e}=await supabase.from('profiles')
        .select('id,username,display_name,avatar_url,is_verified')
        .or('username.ilike.%'+safe+'%,display_name.ilike.%'+safe+'%')
        .neq('id',user.id).limit(30);
      if(!cancelled&&!e)setSearchProfiles(data||[]);
      if(!cancelled&&e)setError(e.message);
    };
    const timer=setTimeout(run,220);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[query,user?.id]);

  useEffect(()=>{
    if(!user?.id)return;
    const channel=supabase.channel('atlantic-contacts-'+user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_contacts'},load)
      .subscribe();
    return ()=>{supabase.removeChannel(channel);};
  },[user?.id,load]);

  const personById=useMemo(()=>Object.fromEntries([...profiles,...searchProfiles].map(p=>[p.id,p])),[profiles,searchProfiles]);
  const incoming=rows.filter(r=>r.status==='pending'&&r.addressee_id===user.id);
  const outgoing=rows.filter(r=>r.status==='pending'&&r.requester_id===user.id);
  const contacts=rows.filter(r=>r.status==='accepted');
  const filtered=searchProfiles.filter(p=>!blockedRows.some(item=>item.blocked_user_id===p.id)&&!rows.some(r=>['pending','accepted'].includes(r.status)&&[r.requester_id,r.addressee_id].includes(p.id)));

  async function blockPerson(person){
    if(!person?.id)return;
    if(!window.confirm('Blokir @'+(person.username||'pengguna')+'? Pengguna ini tidak bisa mengirim pesan langsung kepadamu.'))return;
    setBusy(true);setError('');setNotice('');
    const {error:e}=await supabase.rpc('set_atlantic_user_block',{target_user:person.id,should_block:true});
    if(e)setError(e.message);else setNotice('@'+(person.username||'Pengguna')+' berhasil diblokir.');
    await load();setBusy(false);
  }
  async function unblockPerson(id){
    setBusy(true);setError('');setNotice('');
    const {error:e}=await supabase.rpc('set_atlantic_user_block',{target_user:id,should_block:false});
    if(e)setError(e.message);else setNotice('Blokir berhasil dibuka.');
    await load();setBusy(false);
  }
  async function reportPerson(person){
    if(!person?.id)return;
    const reason=window.prompt('Jelaskan alasan melaporkan @'+(person.username||'pengguna')+' (minimal 3 karakter):','');
    if(reason===null)return;
    if(reason.trim().length<3){setError('Alasan laporan minimal 3 karakter.');return;}
    setBusy(true);setError('');setNotice('');
    const {error:e}=await supabase.from('atlantic_account_reports').insert({reporter_id:user.id,reported_user_id:person.id,reason:reason.trim().slice(0,1000)});
    if(e)setError(e.message);else setNotice('Laporan akun berhasil dikirim ke admin Atlantic.');
    setBusy(false);
  }
  async function sendRequest(person){
    setBusy(true);setError('');setNotice('');
    const {error:e}=await supabase.from('atlantic_contacts').insert({requester_id:user.id,addressee_id:person.id,status:'pending'});
    if(e)setError(e.code==='23505'?'Permintaan atau kontak dengan pengguna ini sudah ada.':e.message);
    else setNotice('Permintaan kontak berhasil dikirim.');
    await load();setBusy(false);
  }
  async function respond(row,decision){
    setBusy(true);setError('');setNotice('');
    const {error:e}=await supabase.rpc('respond_atlantic_contact_request',{request_id:row.id,decision});
    if(e)setError(e.message);else setNotice(decision==='accepted'?'Kontak berhasil ditambahkan.':'Permintaan ditolak.');
    await load();setBusy(false);
  }
  async function remove(row){
    if(!window.confirm('Hapus kontak ini? Story dan Catatan kalian tidak akan saling terlihat lagi.'))return;
    setBusy(true);const {error:e}=await supabase.from('atlantic_contacts').delete().eq('id',row.id);
    if(e)setError(e.message);else setNotice('Kontak dihapus.');
    await load();setBusy(false);
  }
  function personRow(id){
    const p=personById[id]||{};
    return <><span className="atl-contact-avatar">{p.avatar_url?<img src={p.avatar_url} alt=""/>:(p.display_name||p.username||'A').slice(0,1).toUpperCase()}</span><span className="atl-contact-person"><b>{p.display_name||p.username||'Pengguna Atlantic'}{p.is_verified&&<small className="atl-contact-verified"> ✓</small>}</b><small>@{p.username||'atlantic'}</small></span></>;
  }

  return <div className="atl-contacts-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}>
    <section className="atl-contacts-modal" role="dialog" aria-modal="true" aria-label="Kontak Atlantic">
      <header><div><small>ATLANTIC / CONTACTS</small><h2>Tambah kontak</h2></div><button type="button" onClick={onClose} aria-label="Tutup"><X/></button></header>
      <div className="atl-contacts-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau username…"/></div>
      {error&&<p className="atl-contacts-message error">{error}</p>}
      {notice&&<p className="atl-contacts-message">{notice}</p>}
      {incoming.length>0&&<section className="atl-contacts-section"><h3><Clock3 size={16}/> Permintaan masuk ({incoming.length})</h3>{incoming.map(r=><article className="atl-contact-row" key={r.id}>{personRow(r.requester_id)}<div className="atl-contact-actions"><button disabled={busy} onClick={()=>respond(r,'accepted')} aria-label="Terima"><Check/></button><button disabled={busy} onClick={()=>respond(r,'rejected')} aria-label="Tolak"><X/></button></div></article>)}</section>}
      {contacts.length>0&&<section className="atl-contacts-section"><h3><Users size={16}/> Kontak saya ({contacts.length})</h3>{contacts.map(r=>{const id=r.requester_id===user.id?r.addressee_id:r.requester_id;return <article className="atl-contact-row" key={r.id}>{personRow(id)}<div className="atl-contact-actions"><button disabled={busy} onClick={()=>onOpenChat?.(personById[id])} aria-label="Chat"><span>Chat</span></button><button disabled={busy} onClick={()=>reportPerson(personById[id])} aria-label="Laporkan akun">Report</button><button disabled={busy} onClick={()=>blockPerson(personById[id])} aria-label="Blokir akun">Blokir</button><button disabled={busy} onClick={()=>remove(r)} aria-label="Hapus kontak"><Trash2/></button></div></article>})}</section>}
      {blockedRows.length>0&&<section className="atl-contacts-section"><h3>Pengguna diblokir ({blockedRows.length})</h3>{blockedRows.map(row=><article className="atl-contact-row" key={row.id}>{personRow(row.blocked_user_id)}<button className="atl-contact-add" disabled={busy} onClick={()=>unblockPerson(row.blocked_user_id)}>Buka blokir</button></article>)}</section>}
      {outgoing.length>0&&<section className="atl-contacts-section"><h3>Menunggu persetujuan</h3>{outgoing.map(r=><article className="atl-contact-row" key={r.id}>{personRow(r.addressee_id)}<small>Menunggu</small></article>)}</section>}
      <section className="atl-contacts-section"><h3><UserPlus size={16}/> Temukan pengguna</h3>
        {filtered.map(p=><article className="atl-contact-row" key={p.id}>{personRow(p.id)}<div className="atl-contact-actions"><button className="atl-contact-add" disabled={busy} onClick={()=>sendRequest(p)}><UserPlus size={15}/> Tambah</button><button disabled={busy} onClick={()=>reportPerson(p)}>Report</button><button disabled={busy} onClick={()=>blockPerson(p)}>Blokir</button></div></article>)}
        {!filtered.length&&<p className="atl-contacts-empty">{query?'Tidak ada pengguna yang cocok.':'Cari nama atau username untuk menemukan pengguna.'}</p>}
      </section>
      <footer>Story dan Catatan hanya terlihat setelah permintaan kontak diterima oleh kedua pihak.</footer>
    </section>
  </div>;
}
