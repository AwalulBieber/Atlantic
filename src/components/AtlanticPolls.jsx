import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { BarChart3, Plus, X, Check, Lock, Clock3, Users } from 'lucide-react';

export default function AtlanticPolls({ targetType, targetId, user, canCreate = true, onNotice }) {
  const [polls,setPolls]=useState([]);
  const [options,setOptions]=useState([]);
  const [votes,setVotes]=useState([]);
  const [profiles,setProfiles]=useState({});
  const [question,setQuestion]=useState('');
  const [choices,setChoices]=useState(['','']);
  const [expiry,setExpiry]=useState('never');
  const [showCreate,setShowCreate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    if(!targetId)return;
    const {data:rows,error:pollError}=await supabase.from('atlantic_polls').select('id,target_type,target_id,question,created_by,created_at,expires_at,closed_at').eq('target_type',targetType).eq('target_id',targetId).order('created_at',{ascending:false}).limit(30);
    if(pollError){setError(pollError.message);return;}
    const pollIds=(rows||[]).map(p=>p.id);
    setPolls(rows||[]);
    if(!pollIds.length){setOptions([]);setVotes([]);setProfiles({});return;}
    const [{data:optionRows,error:optionError},{data:voteRows,error:voteError}]=await Promise.all([
      supabase.from('atlantic_poll_options').select('id,poll_id,label,position').in('poll_id',pollIds).order('position'),
      supabase.from('atlantic_poll_votes').select('id,poll_id,option_id,user_id,created_at').in('poll_id',pollIds)
    ]);
    if(optionError||voteError){setError(optionError?.message||voteError?.message||'Gagal memuat hasil polling.');return;}
    setOptions(optionRows||[]);setVotes(voteRows||[]);
    const ids=[...new Set((voteRows||[]).map(v=>v.user_id))];
    if(ids.length){
      const {data:people}=await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',ids);
      setProfiles(Object.fromEntries((people||[]).map(p=>[p.id,p])));
    }else setProfiles({});
  },[targetId,targetType]);

  useEffect(()=>{
    load();
    const channel=supabase.channel('atlantic-polls-'+targetType+'-'+targetId)
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_poll_votes'},()=>load())
      .on('postgres_changes',{event:'*',schema:'public',table:'atlantic_polls'},()=>load())
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[load,targetId,targetType]);

  const createPoll=async(e)=>{
    e.preventDefault();
    const clean=choices.map(v=>v.trim()).filter(Boolean);
    if(!question.trim()||clean.length<2||busy)return;
    if(new Set(clean.map(v=>v.toLocaleLowerCase())).size!==clean.length){setError('Pilihan polling tidak boleh duplikat.');return;}
    setBusy(true);setError('');
    const expiresAt=expiry==='never'?null:new Date(Date.now()+Number(expiry)*86400000).toISOString();
    const {error:e1}=await supabase.rpc('create_atlantic_poll',{p_type:targetType,p_target:targetId,p_question:question.trim(),p_options:clean,p_expires_at:expiresAt});
    if(e1)setError(e1.message);
    else{setQuestion('');setChoices(['','']);setExpiry('never');setShowCreate(false);onNotice?.('Polling berhasil dibuat.');await load();}
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

  const groupedOptions=useMemo(()=>options.reduce((acc,o)=>{(acc[o.poll_id] ||= []).push(o);return acc;},{}),[options]);
  const groupedVotes=useMemo(()=>votes.reduce((acc,v)=>{(acc[v.poll_id] ||= []).push(v);return acc;},{}),[votes]);

  const formatExpiry=(value)=>value?new Date(value).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Tanpa batas waktu';

  return <section className="atl-polls">
    <div className="atl-polls-heading"><div><BarChart3 size={18}/><div><b>Polling</b><small>{polls.length} polling</small></div></div>{canCreate&&<button type="button" onClick={()=>setShowCreate(v=>!v)}><Plus size={15}/> Buat polling</button>}</div>
    {showCreate&&<form className="atl-poll-create" onSubmit={createPoll}>
      <label>Pertanyaan<input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={240} placeholder="Apa yang ingin ditanyakan?" required/></label>
      <div className="atl-poll-choice-list">{choices.map((choice,index)=><div key={index}><input value={choice} onChange={e=>setChoices(old=>old.map((v,i)=>i===index?e.target.value:v))} maxLength={100} placeholder={'Pilihan '+(index+1)}/>{choices.length>2&&<button type="button" onClick={()=>setChoices(old=>old.filter((_,i)=>i!==index))} aria-label="Hapus pilihan"><X size={15}/></button>}</div>)}</div>
      {choices.length<8&&<button className="atl-poll-add-choice" type="button" onClick={()=>setChoices(old=>[...old,''])}><Plus size={14}/> Tambah pilihan</button>}
      <label>Batas waktu<select value={expiry} onChange={e=>setExpiry(e.target.value)}><option value="never">Tanpa batas waktu</option><option value="1">1 hari</option><option value="3">3 hari</option><option value="7">7 hari</option></select></label>
      <div className="atl-poll-create-actions"><button type="button" onClick={()=>setShowCreate(false)}>Batal</button><button type="submit" disabled={busy||question.trim().length<3||choices.filter(v=>v.trim()).length<2}>{busy?'Membuat…':'Terbitkan polling'}</button></div>
    </form>}
    {error&&<p className="atl-poll-error">{error}</p>}
    {!polls.length?<div className="atl-polls-empty"><BarChart3 size={24}/><span>Belum ada polling di sini.</span></div>:polls.map(poll=>{
      const opts=groupedOptions[poll.id]||[];
      const pollVotes=groupedVotes[poll.id]||[];
      const total=pollVotes.length;
      const ownVote=pollVotes.find(v=>v.user_id===user?.id);
      const expired=poll.expires_at&&new Date(poll.expires_at).getTime()<=Date.now();
      const closed=Boolean(poll.closed_at||expired);
      const canClose=poll.created_by===user?.id;
      return <article className="atl-poll-card" key={poll.id}>
        <header><div><span className="atl-poll-tag"><BarChart3 size={12}/> {targetType==='group'?'POLLING GRUP':'POLLING SALURAN'}</span><h3>{poll.question}</h3><small>{new Date(poll.created_at).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {formatExpiry(poll.expires_at)}</small></div>{canClose&&!closed&&<button type="button" className="atl-poll-close" onClick={()=>closePoll(poll)} disabled={busy}>Tutup</button>}</header>
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
      </article>;
    })}
  </section>;
}
