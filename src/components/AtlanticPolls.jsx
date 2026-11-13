import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { encryptE2EEText, decryptE2EEText, encryptE2EEMessage, ensureConversationE2EE, getCurrentConversationE2EEKeyId, getConversationE2EEKeyById } from '../e2ee';
import { BarChart3, Plus, X, Check, Lock, Clock3, Users } from 'lucide-react';

export default function AtlanticPolls({ targetType, targetId, user, canCreate = true, onNotice, onDialog, onCancel, pollId = null, inline = false, createOnly = false, onCreated, onDeleted, e2eeKey = null, e2eeKeyId = null, onKeyReady }) {
  const [polls,setPolls]=useState([]);
  const [options,setOptions]=useState([]);
  const [votes,setVotes]=useState([]);
  const [reactions,setReactions]=useState([]);
  const [profiles,setProfiles]=useState({});
  const [question,setQuestion]=useState('');
  const [choices,setChoices]=useState(['','']);
  const [expiry,setExpiry]=useState('never');
  const [showCreate,setShowCreate]=useState(createOnly);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [canModerate,setCanModerate]=useState(false);

  const load=useCallback(async()=>{
    if(!targetId)return;
    if(targetType==='group'&&user?.id){const {data:membership}=await supabase.from('conversation_members').select('role').eq('conversation_id',targetId).eq('user_id',user.id).maybeSingle();setCanModerate(membership?.role==='admin');}else setCanModerate(Boolean(canCreate));
    let pollQuery=supabase.from('atlantic_polls').select('id,target_type,target_id,question,created_by,created_at,expires_at,closed_at,e2ee_key_id').eq('target_type',targetType).eq('target_id',targetId).order('created_at',{ascending:false}).limit(pollId?1:30);
    if(pollId) pollQuery=pollQuery.eq('id',pollId);
    const {data:rows,error:pollError}=await pollQuery;
    if(pollError){setError(pollError.message);return;}
    const pollIds=(rows||[]).map(p=>p.id);
    const pollKeys = new Map();
    const visiblePolls = await Promise.all((rows||[]).map(async poll => {
      if (!e2eeKey) return targetType === 'group' ? { ...poll, question: '🔒 Polling terenkripsi belum dapat dibuka di perangkat ini.', decrypt_error: true, is_e2ee: true } : poll;
      try {
        const pollKey = poll.e2ee_key_id && poll.e2ee_key_id !== e2eeKeyId
          ? await getConversationE2EEKeyById(supabase, targetId, poll.e2ee_key_id, user.id)
          : e2eeKey;
        pollKeys.set(poll.id, pollKey);
        return { ...poll, question: await decryptE2EEText(pollKey, poll.question), is_e2ee: true };
      } catch { return { ...poll, question: '🔒 Polling terenkripsi tidak dapat dibuka.', decrypt_error: true, is_e2ee: true }; }
    }));
    setPolls(visiblePolls);
    if(!pollIds.length){setOptions([]);setVotes([]);setReactions([]);setProfiles({});return;}
    const [{data:optionRows,error:optionError},{data:voteRows,error:voteError},{data:reactionRows,error:reactionError}]=await Promise.all([
      supabase.from('atlantic_poll_options').select('id,poll_id,label,position').in('poll_id',pollIds).order('position'),
      supabase.from('atlantic_poll_votes').select('id,poll_id,option_id,user_id,created_at').in('poll_id',pollIds),
      supabase.from('atlantic_poll_reactions').select('id,poll_id,user_id,emoji').in('poll_id',pollIds)
    ]);
    if(optionError||voteError||reactionError){setError(optionError?.message||voteError?.message||reactionError?.message||'Gagal memuat hasil polling.');return;}
    setReactions(reactionRows||[]);
    const visibleOptions = await Promise.all((optionRows||[]).map(async option => {
      if (!e2eeKey) return targetType === 'group' ? { ...option, label: '🔒 Pilihan terkunci', decrypt_error: true, is_e2ee: true } : option;
      try {
        const optionKey = pollKeys.get(option.poll_id) || e2eeKey;
        return { ...option, label: await decryptE2EEText(optionKey, option.label), is_e2ee: true };
      } catch { return { ...option, label: '🔒 Pilihan terkunci', decrypt_error: true, is_e2ee: true }; }
    }));
    setOptions(visibleOptions);setVotes(voteRows||[]);
    const ids=[...new Set((voteRows||[]).map(v=>v.user_id))];
    if(ids.length){
      const {data:people}=await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',ids);
      setProfiles(Object.fromEntries((people||[]).map(p=>[p.id,p])));
    }else setProfiles({});
  },[targetId,targetType,user?.id,canCreate,pollId,e2eeKey,e2eeKeyId]);

  useEffect(()=>{
    if(createOnly)return;
    load();
    const channel=supabase.channel('atlantic-polls-'+targetType+'-'+targetId+'-'+(pollId||'all'));
    const voteFilter=pollId?{filter:'poll_id=eq.'+pollId}:{};
    const pollFilter=pollId?{filter:'id=eq.'+pollId}:{};
    channel
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_poll_votes',...voteFilter},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_poll_reactions',...voteFilter},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_polls',...pollFilter},()=>load())
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[load,targetId,targetType,pollId,createOnly]);

  const createPoll=async(e)=>{
    e.preventDefault();
    const clean=choices.map(v=>v.trim()).filter(Boolean);
    if(!question.trim()||clean.length<2||busy)return;
    if(new Set(clean.map(v=>v.toLocaleLowerCase())).size!==clean.length){setError('Pilihan polling tidak boleh duplikat.');return;}
    setBusy(true);setError('');
    const expiresAt=expiry==='never'?null:new Date(Date.now()+Number(expiry)*86400000).toISOString();
    let activeKey = e2eeKey;
    let activeKeyId = e2eeKeyId;
    let storedQuestion = question.trim();
    let storedOptions = clean;
    try {
      if (targetType === 'group') {
        if (!e2eeKey) throw new Error('E2EE grup belum aktif. Polling tidak dikirim agar pertanyaan dan pilihan tidak tersimpan sebagai teks biasa.');
        activeKey = await ensureConversationE2EE(supabase, targetId, [], user.id);
        activeKeyId = await getCurrentConversationE2EEKeyId(supabase, targetId);
        onKeyReady?.(activeKey, activeKeyId);
        storedQuestion = await encryptE2EEText(activeKey, storedQuestion);
        storedOptions = await Promise.all(clean.map(option => encryptE2EEText(activeKey, option)));
      }
    } catch (encryptionError) { setError('Polling gagal dienkripsi: ' + encryptionError.message); setBusy(false); return; }
    const {data:createdId,error:e1}=await supabase.rpc('create_atlantic_poll',{p_type:targetType,p_target:targetId,p_question:storedQuestion,p_options:storedOptions,p_expires_at:expiresAt});
    if(e1)setError(e1.message);
    else if(!createdId)setError('Polling dibuat tetapi ID polling tidak diterima.');
    else{
      if (activeKey && activeKeyId) {
        const { error: keyBindError } = await supabase.rpc('set_atlantic_poll_e2ee_key', { p_poll_id: createdId, p_key_id: activeKeyId });
        if (keyBindError) { setError('Polling dibuat tetapi pengaitan kunci E2EE gagal: ' + keyBindError.message); setBusy(false); return; }
      }
      if(targetType==='group'){
        const pollMarker = `[[ATLANTIC_POLL:${createdId}]]`;
        const storedMarker = activeKey ? await encryptE2EEMessage(activeKey, { text: pollMarker }) : pollMarker;
        const {error:messageError}=await supabase.from('messages').insert({conversation_id:targetId,sender_id:user.id,body:storedMarker,e2ee_key_id:activeKeyId});
        if(messageError){setError('Polling dibuat, tetapi gagal dikirim ke chat: '+messageError.message);setBusy(false);return;}
      }
      setQuestion('');setChoices(['','']);setExpiry('never');setShowCreate(false);
      onNotice?.(targetType==='channel'?'Polling diterbitkan di timeline saluran.':'Polling berhasil dikirim ke chat.');
      onCreated?.();await load();
    }
    setBusy(false);
  };

  const vote=async(pollId,optionId)=>{
    if(busy)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.rpc('cast_atlantic_poll_vote',{p_poll_id:pollId,p_option_id:optionId});
    if(e)setError(e.message);else await load();
    setBusy(false);
  };

  const closePoll=async(poll)=>{
    if(busy)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.rpc('close_atlantic_poll',{p_poll_id:poll.id});
    if(e)setError(e.message);else{onNotice?.('Polling ditutup.');await load();}
    setBusy(false);
  };

  const toggleReaction=async(poll,emoji)=>{
    if(busy)return;
    const existing=reactions.find(item=>item.poll_id===poll.id&&item.user_id===user?.id&&item.emoji===emoji);
    setBusy(true);setError('');
    const result=existing
      ? await supabase.from('atlantic_poll_reactions').delete().eq('id',existing.id).eq('user_id',user.id)
      : await supabase.from('atlantic_poll_reactions').insert({poll_id:poll.id,user_id:user.id,emoji});
    if(result.error)setError('Reaksi gagal disimpan: '+result.error.message);
    else await load();
    setBusy(false);
  };

  const deletePoll=async(poll)=>{
    if(busy)return;
    const allowed=targetType==='channel'?canCreate:(poll.created_by===user?.id||canModerate);
    if(!allowed)return;
    const confirmed=onDialog
      ? await onDialog({type:'confirm',title:'Hapus polling?',message:'Polling ini akan dihapus dari timeline. Semua suara dan reaksi ikut dihapus.',confirmLabel:'Hapus'})
      : window.confirm('Hapus polling ini dari timeline? Semua suara dan reaksi ikut dihapus.');
    if(!confirmed)return;
    setBusy(true);setError('');
    const {error:deleteError}=await supabase.from('atlantic_polls').delete().eq('id',poll.id);
    if(deleteError)setError('Polling gagal dihapus: '+deleteError.message);
    else{onNotice?.('Polling dihapus.');onDeleted?.(poll.id);await load();}
    setBusy(false);
  };

  const groupedOptions=useMemo(()=>options.reduce((acc,o)=>{(acc[o.poll_id] ||= []).push(o);return acc;},{}),[options]);
  const groupedVotes=useMemo(()=>votes.reduce((acc,v)=>{(acc[v.poll_id] ||= []).push(v);return acc;},{}),[votes]);

  const formatExpiry=(value)=>value?new Date(value).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Tanpa batas waktu';

  return <section className="atl-polls">
    {!inline&&!createOnly&&<div className="atl-polls-heading"><div><BarChart3 size={18}/><div><b>Polling</b><small>{polls.length} polling</small></div></div>{canCreate&&<button type="button" onClick={()=>setShowCreate(v=>!v)}><Plus size={15}/> Buat polling</button>}</div>}
    {showCreate&&<form className="atl-poll-create" onSubmit={createPoll}>
      <label>Pertanyaan<input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={240} placeholder="Apa yang ingin ditanyakan?" required/></label>
      <div className="atl-poll-choice-list">{choices.map((choice,index)=><div key={index}><input value={choice} onChange={e=>setChoices(old=>old.map((v,i)=>i===index?e.target.value:v))} maxLength={100} placeholder={'Pilihan '+(index+1)}/>{choices.length>2&&<button type="button" onClick={()=>setChoices(old=>old.filter((_,i)=>i!==index))} aria-label="Hapus pilihan"><X size={15}/></button>}</div>)}</div>
      {choices.length<8&&<button className="atl-poll-add-choice" type="button" onClick={()=>setChoices(old=>[...old,''])}><Plus size={14}/> Tambah pilihan</button>}
      <label>Batas waktu<select value={expiry} onChange={e=>setExpiry(e.target.value)}><option value="never">Tanpa batas waktu</option><option value="1">1 hari</option><option value="3">3 hari</option><option value="7">7 hari</option></select></label>
      <div className="atl-poll-create-actions"><button type="button" onClick={()=>{setShowCreate(false);onCancel?.();}}>Batal</button><button type="submit" disabled={busy||question.trim().length<3||choices.filter(v=>v.trim()).length<2}>{busy?'Membuat…':'Terbitkan polling'}</button></div>
    </form>}
    {error&&<p className="atl-poll-error">{error}</p>}
    {!createOnly&&(!polls.length&&!inline?<div className="atl-polls-empty"><BarChart3 size={24}/><span>Belum ada polling di sini.</span></div>:polls.map(poll=>{
      const opts=groupedOptions[poll.id]||[];
      const pollVotes=groupedVotes[poll.id]||[];
      const total=pollVotes.length;
      const ownVote=pollVotes.find(v=>v.user_id===user?.id);
      const expired=poll.expires_at&&new Date(poll.expires_at).getTime()<=Date.now();
      const closed=Boolean(poll.closed_at||expired);
      const canClose=targetType==='channel'?canCreate:(poll.created_by===user?.id||canModerate);
      return <article className="atl-poll-card" key={poll.id}>
        <header><div><span className="atl-poll-tag"><BarChart3 size={12}/> {targetType==='group'?'POLLING GRUP':'POLLING SALURAN'}</span><h3>{poll.question}</h3><small>{new Date(poll.created_at).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {formatExpiry(poll.expires_at)}</small></div><div className="atl-poll-card-actions">{canClose&&!closed&&<button type="button" className="atl-poll-close" onClick={()=>closePoll(poll)} disabled={busy}>Tutup</button>}{(targetType==='channel'?canCreate:(poll.created_by===user?.id||canModerate))&&<button type="button" className="atl-poll-delete" onClick={()=>deletePoll(poll)} disabled={busy}>Hapus</button>}</div></header>
        <div className="atl-poll-options">{opts.map(option=>{
          const selected=pollVotes.some(v=>v.option_id===option.id&&v.user_id===user?.id);
          const voters=pollVotes.filter(v=>v.option_id===option.id);
          const pct=total?Math.round(voters.length/total*100):0;
          return <div className={'atl-poll-option'+(selected?' is-selected':'')} key={option.id}>
            <button type="button" disabled={closed||busy} onClick={()=>vote(poll.id,option.id)}><span className="atl-poll-option-label">{selected&&<Check size={14}/>} {option.label}</span><b>{voters.length} · {pct}%</b></button>
            <div className="atl-poll-progress"><span style={{width:pct+'%'}}/></div>
            <div className="atl-poll-voters"><Users size={12}/>{voters.length?voters.map(v=>profiles[v.user_id]?.display_name||profiles[v.user_id]?.username||'Pengguna Atlantic').join(', '):'Belum ada yang memilih'}</div>
          </div>;
        })}</div>
        <footer><span>{total} suara</span><span>{closed?<><Lock size={12}/> {expired&&!poll.closed_at?'Waktu habis':'Ditutup'}</>:'Pilih jawaban · bisa mengubah pilihan'}</span></footer>
        <div className="atl-poll-reactions">{['👍','❤️','😂','🎉','🔥'].map(emoji=>{const items=reactions.filter(item=>item.poll_id===poll.id&&item.emoji===emoji);const selected=items.some(item=>item.user_id===user?.id);return <button type="button" key={emoji} className={selected?'is-selected':''} onClick={()=>toggleReaction(poll,emoji)} disabled={busy} aria-label={`Reaksi ${emoji}, ${items.length}`}><span>{emoji}</span>{items.length>0&&<b>{items.length}</b>}</button>;})}</div>
      </article>;
    }))}
  </section>;
}
