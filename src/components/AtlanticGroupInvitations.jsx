import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from '../supabase';
import {Users,Check,X,Clock3} from 'lucide-react';

export default function AtlanticGroupInvitations({user,onAccepted,onNotice}){
  const [items,setItems]=useState([]);
  const [open,setOpen]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    if(!user?.id)return;
    const {data,error:e}=await supabase.from('atlantic_group_invitations').select('id,conversation_id,inviter_id,group_title,created_at').eq('invitee_id',user.id).eq('status','pending').order('created_at',{ascending:false});
    if(e){setError(e.message);return;}
    const rows=data||[];
    const inviterIds=[...new Set(rows.map(row=>row.inviter_id))];
    const {data:profiles}=inviterIds.length?await supabase.from('profiles').select('id,display_name,username,avatar_url').in('id',inviterIds):{data:[]};
    const profileMap=Object.fromEntries((profiles||[]).map(profile=>[profile.id,profile]));
    setItems(rows.map(row=>({...row,group:{title:row.group_title||'Grup Atlantic'},inviter:profileMap[row.inviter_id]||{}})));
  },[user?.id]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    if(!user?.id)return;
    const channel=supabase.channel('atlantic-group-invites-'+user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_group_invitations',filter:'invitee_id=eq.'+user.id},load)
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[user?.id,load]);

  async function respond(item,decision){
    if(busyId)return;
    setBusyId(item.id);setError('');
    const {error:e}=await supabase.rpc('respond_atlantic_group_invitation',{request_id:item.id,decision});
    if(e)setError(e.message);
    else{
      setItems(current=>current.filter(row=>row.id!==item.id));
      onNotice?.(decision==='accepted'?'Kamu bergabung ke grup.':'Undangan grup ditolak.');
      if(decision==='accepted')await onAccepted?.(item.conversation_id);
    }
    setBusyId('');
  }

  return <div className="atl-group-invites-widget">
    <button type="button" className="atl-group-invites-trigger" onClick={()=>{setOpen(true);load();}}><Users size={15}/> Undangan grup {items.length>0&&<b>{items.length}</b>}</button>
    {open&&<div className="atl-group-invites-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}><section className="atl-group-invites-modal" role="dialog" aria-modal="true" aria-label="Undangan grup">
      <header><b><Users size={18}/> Undangan grup</b><button type="button" onClick={()=>setOpen(false)} aria-label="Tutup"><X/></button></header>
      {error&&<p className="atl-group-invites-error">{error}</p>}
      {!items.length?<p className="atl-group-invites-empty">Tidak ada undangan grup yang menunggu.</p>:items.map(item=><article key={item.id}>
        <div className="atl-group-invites-avatar">{item.group.avatar_url?<span>G</span>:<Users size={20}/>}</div>
        <div className="atl-group-invites-info"><b>{item.group.title||'Grup Atlantic'}</b><small>{item.inviter.display_name||item.inviter.username||'Pengguna'} mengundang kamu · {new Date(item.created_at).toLocaleDateString('id-ID')}</small></div>
        <div className="atl-group-invites-actions"><button type="button" disabled={!!busyId} onClick={()=>respond(item,'accepted')}><Check size={15}/> Gabung</button><button type="button" disabled={!!busyId} onClick={()=>respond(item,'rejected')}><X size={15}/> Tolak</button></div>
      </article>)}
      <footer><Clock3 size={13}/> Undangan hanya berlaku untuk akun yang menerimanya.</footer>
    </section></div>}
  </div>;
}
