import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Clock3, Plus, Send, Radio, Phone, ImagePlus, NotebookPen, X, Users, RefreshCw } from 'lucide-react';

const dateLabel = value => new Date(value).toLocaleString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

export default function AtlanticCommunity({ tab, user, profile, createRequest = 0, onNotice }) {
  const [stories,setStories]=useState([]);
  const [notes,setNotes]=useState([]);
  const [channels,setChannels]=useState([]);
  const [selectedChannel,setSelectedChannel]=useState(null);
  const [posts,setPosts]=useState([]);
  const [calls,setCalls]=useState([]);
  const [body,setBody]=useState('');
  const [mediaFile,setMediaFile]=useState(null);
  const [mediaPreview,setMediaPreview]=useState('');
  const storyMediaInput=useRef(null);
  const [channelName,setChannelName]=useState('');
  const [channelDescription,setChannelDescription]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [refreshing,setRefreshing]=useState(false);

  const load = useCallback(async () => {
    if(!user?.id) return;
    setRefreshing(true); setError('');
    if(tab==='updates') {
      const [s,n]=await Promise.all([
        supabase.from('atlantic_stories').select('id,user_id,body,media_url,created_at,expires_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60),
        supabase.from('atlantic_notes').select('id,user_id,body,created_at,expires_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60)
      ]);
      if(s.error) setError('Story: '+s.error.message);
      else {
        const signedStories=await Promise.all((s.data||[]).map(async story=>{
          if(!story.media_url)return story;
          const expiresIn=Math.max(1,Math.floor((new Date(story.expires_at).getTime()-Date.now())/1000));
          const {data:signed,error:signedError}=await supabase.storage.from('atlantic-stories').createSignedUrl(story.media_url,expiresIn);
          if(signedError){setError(v=>v||('Media Story: '+signedError.message));return {...story,media_url:null};}
          return {...story,media_url:signed?.signedUrl||null};
        }));
        setStories(signedStories);
      }
      if(n.error) setError(v=>v||('Catatan: '+n.error.message)); else setNotes(n.data||[]);
    } else if(tab==='channels') {
      const {data,error:e}=await supabase.from('atlantic_channels').select('id,owner_id,name,description,is_public,created_at').eq('is_public',true).order('created_at',{ascending:false}).limit(60);
      if(e) setError(e.message); else setChannels(data||[]);
    } else if(tab==='calls') {
      const {data,error:e}=await supabase.from('atlantic_call_sessions').select('id,caller_id,callee_id,call_type,status,started_at,ended_at').or('caller_id.eq.'+user.id+',callee_id.eq.'+user.id).order('started_at',{ascending:false}).limit(40);
      if(e) setError(e.message); else setCalls(data||[]);
    }
    setRefreshing(false);
  },[tab,user?.id]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(createRequest>0)setShowCreate(true);},[createRequest]);
  useEffect(()=>()=>{if(mediaPreview)URL.revokeObjectURL(mediaPreview);},[mediaPreview]);

  function chooseStoryMedia(event){
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    const allowed=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
    if(!allowed.includes(file.type)){setError('Format media harus JPG, PNG, WebP, GIF, MP4, atau WebM.');return;}
    if(file.size>20*1024*1024){setError('Ukuran media Story maksimal 20 MB.');return;}
    setError('');setMediaFile(file);setMediaPreview(URL.createObjectURL(file));
  }

  // Keep community feeds synchronized without requiring a manual refresh.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel('atlantic-community-' + tab + '-' + user.id);
    if (tab === 'updates') {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atlantic_stories' }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atlantic_notes' }, load);
    } else if (tab === 'channels') {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'atlantic_channels' }, load);
      if (selectedChannel?.id) {
        channel.on('postgres_changes', {
          event: '*', schema: 'public', table: 'atlantic_channel_posts',
          filter: 'channel_id=eq.' + selectedChannel.id
        }, () => loadPosts(selectedChannel.id));
      }
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, user?.id, selectedChannel?.id, load]);

  async function publish(kind) {
    const text=body.trim();
    if(busy||(!text&&!(kind==='story'&&mediaFile))||(kind==='note'&&mediaFile)) return;
    setBusy(true); setError('');
    let mediaUrl=null;
    let uploadedPath=null;
    if(kind==='story'&&mediaFile){
      const extension=(mediaFile.name.split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'')||(mediaFile.type==='video/mp4'?'mp4':mediaFile.type==='video/webm'?'webm':'jpg');
      uploadedPath=user.id+'/'+crypto.randomUUID()+'.'+extension;
      const {error:uploadError}=await supabase.storage.from('atlantic-stories').upload(uploadedPath,mediaFile,{cacheControl:'3600',upsert:false,contentType:mediaFile.type});
      if(uploadError){setError('Upload Story gagal: '+uploadError.message);setBusy(false);return;}
      mediaUrl=uploadedPath;
    }
    const table=kind==='story'?'atlantic_stories':'atlantic_notes';
    const payload=kind==='story'?{user_id:user.id,body:text,media_url:mediaUrl}:{user_id:user.id,body:text};
    const {error:e}=await supabase.from(table).insert(payload);
    if(e){
      if(uploadedPath)await supabase.storage.from('atlantic-stories').remove([uploadedPath]);
      setError(e.message);
    }else{
      setBody('');setMediaFile(null);setMediaPreview('');setShowCreate(false);await load();
    }
    setBusy(false);
  }

  async function createChannel(e) {
    e.preventDefault(); if(!channelName.trim()||busy) return;
    setBusy(true);setError('');
    const {data,error:e1}=await supabase.from('atlantic_channels').insert({owner_id:user.id,name:channelName.trim(),description:channelDescription.trim()}).select('id,owner_id,name,description,is_public,created_at').single();
    if(e1) setError(e1.message);
    else {
      const {error:e2}=await supabase.from('atlantic_channel_members').insert({channel_id:data.id,user_id:user.id,role:'owner'});
      if(e2) setError(e2.message); else {setChannelName('');setChannelDescription('');setShowCreate(false);setChannels(v=>[data,...v]);setSelectedChannel(data);}
    }
    setBusy(false);
  }

  async function joinChannel(channel) {
    const {data:existing,error:checkError}=await supabase.from('atlantic_channel_members').select('user_id').eq('channel_id',channel.id).eq('user_id',user.id).maybeSingle();
    if(checkError){setError(checkError.message);return;}
    if(!existing){const {error:e}=await supabase.from('atlantic_channel_members').insert({channel_id:channel.id,user_id:user.id,role:'member'});if(e){setError(e.message);return;}}
    setSelectedChannel(channel);loadPosts(channel.id);
  }

  async function loadPosts(id) {
    const {data,error:e}=await supabase.from('atlantic_channel_posts').select('id,channel_id,author_id,body,created_at').eq('channel_id',id).order('created_at',{ascending:true}).limit(100);
    if(e) setError(e.message); else setPosts(data||[]);
  }

  async function publishPost(e) {
    e.preventDefault();const text=body.trim();if(!text||!selectedChannel||busy)return;
    setBusy(true);const {error:e1}=await supabase.from('atlantic_channel_posts').insert({channel_id:selectedChannel.id,author_id:user.id,body:text});
    if(e1)setError(e1.message);else{setBody('');await loadPosts(selectedChannel.id);}
    setBusy(false);
  }

  const title=tab==='updates'?'Pembaruan':tab==='channels'?'Saluran':'Panggilan';
  return <section className="atl-community">
    <header className="atl-community-head">
      <div><span className="eyebrow">ATLANTIC / {tab.toUpperCase()}</span><h1>{title}</h1><p>{tab==='updates'?'Bagikan momen dan catatan singkat.':'Terhubung dengan komunitas Atlantic.'}</p></div>
      <div className="atl-community-actions">
        <button type="button" className="atl-community-icon" onClick={load} disabled={refreshing} aria-label="Muat ulang"><RefreshCw size={17}/></button>
        {tab!=='calls'&&<button type="button" className="atl-community-create" onClick={()=>setShowCreate(true)}><Plus size={17}/>{tab==='updates'?'Buat':'Saluran baru'}</button>}
      </div>
    </header>
    {error&&<div className="atl-community-error">{error}</div>}
    {tab==='updates'&&<>
      <div className="atl-community-section"><h2><Clock3 size={18}/> Story</h2><p>Story teks, foto, dan video tampil selama 24 jam.</p>
        <div className="atl-story-grid">{stories.map(s=><article className="atl-story-card" key={s.id}><small>{s.user_id===user.id?'Story kamu':'Story Atlantic'} · {dateLabel(s.created_at)}</small>{s.media_url&&( /\.(mp4|webm)(\?|$)/i.test(s.media_url)?<video className="atl-story-media" src={s.media_url} controls playsInline preload="metadata"/>:<img className="atl-story-media" src={s.media_url} alt="Media Story" loading="lazy"/>)}{s.body?.trim()&&<p>{s.body}</p>}</article>)}
        {!stories.length&&<div className="atl-community-empty">Belum ada Story. Jadilah yang pertama berbagi.</div>}</div>
      </div>
      <div className="atl-community-section"><h2><NotebookPen size={18}/> Catatan</h2><p>Catatan singkat yang aktif selama 24 jam.</p>
        <div className="atl-note-list">{notes.map(n=><article className="atl-note-card" key={n.id}><div className="atl-note-avatar">{(n.user_id===user.id?(profile?.display_name||'K'):'A').slice(0,1).toUpperCase()}</div><div><b>{n.user_id===user.id?'Catatan kamu':'Catatan pengguna'}</b><p>{n.body}</p><small>{dateLabel(n.created_at)}</small></div></article>)}
        {!notes.length&&<div className="atl-community-empty">Belum ada Catatan.</div>}</div>
      </div>
    </>}
    {tab==='channels'&&<>
      {selectedChannel?<div className="atl-channel-view">
        <button className="atl-channel-back" onClick={()=>{setSelectedChannel(null);setPosts([]);}}>← Semua saluran</button>
        <h2>{selectedChannel.name}</h2><p>{selectedChannel.description||'Saluran komunitas Atlantic'}</p>
        <div className="atl-channel-posts">{posts.map(p=><article key={p.id}><p>{p.body}</p><small>{dateLabel(p.created_at)}</small></article>)}{!posts.length&&<div className="atl-community-empty">Belum ada postingan di saluran ini.</div>}</div>
        <form className="atl-community-compose" onSubmit={publishPost}><input value={body} onChange={e=>setBody(e.target.value)} placeholder="Tulis postingan…" maxLength={2000}/><button disabled={busy||!body.trim()}><Send size={18}/></button></form>
      </div>:<div className="atl-channel-grid">{channels.map(c=><article className="atl-channel-card" key={c.id}><div className="atl-channel-mark"><Radio/></div><h3>{c.name}</h3><p>{c.description||'Saluran komunitas Atlantic'}</p><small>Dibuat {dateLabel(c.created_at)}</small><button onClick={()=>joinChannel(c)}><Users size={15}/> Gabung & buka</button></article>)}{!channels.length&&<div className="atl-community-empty">Belum ada saluran publik. Buat saluran pertama.</div>}</div>}
    </>}
    {tab==='calls'&&<div className="atl-community-section"><h2><Phone size={18}/> Riwayat panggilan</h2><p>Riwayat undangan suara dan video tersimpan di sini. Panggilan langsung belum tersedia pada versi ini.</p>
      <div className="atl-call-list">{calls.map(c=><article key={c.id}><div className="atl-call-icon"><Phone size={17}/></div><div><b>{c.caller_id===user.id?'Panggilan keluar':'Panggilan masuk'} · {c.call_type==='video'?'Video':'Suara'}</b><small>{dateLabel(c.started_at)} · {c.status}</small></div></article>)}{!calls.length&&<div className="atl-community-empty">Belum ada riwayat panggilan.</div>}</div>
    </div>}
    {showCreate&&<div className="atl-community-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowCreate(false)}><section className="atl-community-modal"><header><b>{tab==='updates'?'Bagikan pembaruan':'Buat saluran'}</b><button onClick={()=>setShowCreate(false)}><X/></button></header>
      {tab==='updates'?<><label>{body.length>0?'Isi postingan':'Apa yang ingin kamu bagikan?' }<textarea value={body} onChange={e=>setBody(e.target.value)} rows={4} maxLength={500}/></label><div className="atl-story-upload"><input ref={storyMediaInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={chooseStoryMedia} hidden/><button type="button" onClick={()=>storyMediaInput.current?.click()} disabled={busy}><ImagePlus size={16}/>{mediaFile?'Ganti foto/video':'Tambahkan foto/video'}</button><small>JPG, PNG, WebP, GIF, MP4, WebM · Maks. 20 MB</small>{mediaPreview&&<div className="atl-story-preview">{mediaFile?.type.startsWith('video/')?<video src={mediaPreview} controls playsInline/>:<img src={mediaPreview} alt="Pratinjau Story"/>}<button type="button" onClick={()=>{setMediaFile(null);setMediaPreview('');}}>Hapus media</button></div>}</div><div className="atl-community-modal-actions"><button onClick={()=>publish('story')} disabled={busy||(!body.trim()&&!mediaFile)}><ImagePlus size={16}/> {busy?'Mengunggah…':'Terbitkan Story'}</button><button onClick={()=>publish('note')} disabled={busy||!body.trim()||!!mediaFile}><NotebookPen size={16}/> Buat Catatan</button></div></>:<form onSubmit={createChannel}><label>Nama saluran<input value={channelName} onChange={e=>setChannelName(e.target.value)} maxLength={60} required/></label><label>Deskripsi<input value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} maxLength={180}/></label><button className="atl-community-submit" disabled={busy||!channelName.trim()}>Buat saluran</button></form>}
    </section></div>}
  </section>;
}
