import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import AtlanticImageCropper from './AtlanticImageCropper';
import AtlanticPolls from './AtlanticPolls';
import { Clock3, Plus, Send, Radio, Phone, ImagePlus, NotebookPen, X, Users, RefreshCw, Search, BadgeCheck, BarChart3 } from 'lucide-react';

const dateLabel = value => new Date(value).toLocaleString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
const callStatusLabel = status => ({ requested:'Memanggil', accepted:'Diterima', declined:'Ditolak', missed:'Tak terjawab', ended:'Selesai', cancelled:'Dibatalkan' }[status] || status);

export default function AtlanticCommunity({ tab, user, profile, createRequest = 0, onNotice, onDialog }) {
  const [stories,setStories]=useState([]);
  const [notes,setNotes]=useState([]);
  const [channels,setChannels]=useState([]);
  const [joinedChannelIds,setJoinedChannelIds]=useState([]);
  const [selectedChannel,setSelectedChannel]=useState(null);
  const [posts,setPosts]=useState([]);
  const [calls,setCalls]=useState([]);
  const [people,setPeople]=useState({});
  const [body,setBody]=useState('');
  const [mediaFile,setMediaFile]=useState(null);
  const [mediaPreview,setMediaPreview]=useState('');
  const storyMediaInput=useRef(null);
  const [channelName,setChannelName]=useState('');
  const [channelDescription,setChannelDescription]=useState('');
  const [channelAvatarFile,setChannelAvatarFile]=useState(null);
  const [channelCropFile,setChannelCropFile]=useState(null);
  const [channelAvatarPreview,setChannelAvatarPreview]=useState('');
  const [channelSettingsOpen,setChannelSettingsOpen]=useState(false);
  const [channelInviteLink,setChannelInviteLink]=useState('');
  const [channelInviteLinkId,setChannelInviteLinkId]=useState('');
  const [channelInviteBusy,setChannelInviteBusy]=useState(false);
  const [channelInviteExpiry,setChannelInviteExpiry]=useState('never');
  const [channelInviteMaxUses,setChannelInviteMaxUses]=useState('');
  const [channelMediaFile,setChannelMediaFile]=useState(null);
  const [channelMoreOpen,setChannelMoreOpen]=useState(false);
  const [channelPollsOpen,setChannelPollsOpen]=useState(false);
  const channelMediaInput=useRef(null);
  const channelDocumentInput=useRef(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [activeStoryIndex,setActiveStoryIndex]=useState(-1);
  const [communitySearch,setCommunitySearch]=useState('');

  const storyGroups = [...stories.reduce((groups, story, index) => {
    const existing = groups.get(story.user_id);
    if (existing) existing.items.push({ story, index });
    else groups.set(story.user_id, { userId: story.user_id, firstIndex: index, items: [{ story, index }] });
    return groups;
  }, new Map()).values()];
  const searchTerm=communitySearch.trim().toLowerCase();
  const visibleStoryGroups=storyGroups.filter(group=>{
    const person=people[group.userId]||{};
    return !searchTerm||String(person.display_name||'').toLowerCase().includes(searchTerm)||String(person.username||'').toLowerCase().includes(searchTerm);
  });
  const visibleNotes=notes.filter(note=>{
    const person=people[note.user_id]||{};
    return !searchTerm||String(person.display_name||'').toLowerCase().includes(searchTerm)||String(person.username||'').toLowerCase().includes(searchTerm)||note.body.toLowerCase().includes(searchTerm);
  });

  async function loadPeople(ids) {
    const unique=[...new Set((ids||[]).filter(Boolean))];
    if(!unique.length)return;
    const {data,error:e}=await supabase.from('profiles').select('id,display_name,username,avatar_url,is_verified').in('id',unique);
    if(!e&&data?.length)setPeople(current=>({...current,...Object.fromEntries(data.map(person=>[person.id,person]))}));
  }

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
          if(!story.media_url)return {...story,media_path:null};
          const expiresIn=Math.max(1,Math.floor((new Date(story.expires_at).getTime()-Date.now())/1000));
          const {data:signed,error:signedError}=await supabase.storage.from('atlantic-stories').createSignedUrl(story.media_url,expiresIn);
          if(signedError){setError(v=>v||('Media Story: '+signedError.message));return {...story,media_url:null};}
          return {...story,media_path:story.media_url,media_url:signed?.signedUrl||null};
        }));
        setStories(signedStories);
      }
      if(n.error) setError(v=>v||('Catatan: '+n.error.message)); else setNotes(n.data||[]);
      await loadPeople([...(s.data||[]).map(story=>story.user_id),...(n.data||[]).map(note=>note.user_id)]);
    } else if(tab==='channels') {
      const {data,error:e}=await supabase.from('atlantic_channels').select('id,owner_id,name,description,is_public,avatar_url,created_at').eq('is_public',true).order('created_at',{ascending:false}).limit(60);
      if(e) setError(e.message); else {
        const hydrated=await Promise.all((data||[]).map(async channel=>{
          if(!channel.avatar_url)return {...channel,avatar_path:null,member_count:0};
          const {data:signed,error:signedError}=await supabase.storage.from('atlantic-channel-media').createSignedUrl(channel.avatar_url,3600);
          if(signedError){setError(v=>v||('Foto saluran: '+signedError.message));return {...channel,avatar_path:channel.avatar_url,avatar_url:null,member_count:0};}
          return {...channel,avatar_path:channel.avatar_url,avatar_url:signed?.signedUrl||null,member_count:0};
        }));
        const counts=await Promise.all(hydrated.map(channel=>supabase.from('atlantic_channel_members').select('user_id',{count:'exact',head:true}).eq('channel_id',channel.id)));
        hydrated.forEach((channel,index)=>{channel.member_count=counts[index].count||0;});
        setChannels(hydrated);
        const {data:memberships}=await supabase.from('atlantic_channel_members').select('channel_id').eq('user_id',user.id);
        setJoinedChannelIds((memberships||[]).map(item=>item.channel_id));
        await loadPeople((data||[]).map(channel=>channel.owner_id));
      }
    } else if(tab==='calls') {
      const {data,error:e}=await supabase.from('atlantic_call_sessions').select('id,caller_id,callee_id,call_type,status,started_at,ended_at').or('caller_id.eq.'+user.id+',callee_id.eq.'+user.id).order('started_at',{ascending:false}).limit(40);
      if(e) setError(e.message); else {setCalls(data||[]);await loadPeople((data||[]).flatMap(call=>[call.caller_id,call.callee_id]));}
    }
    setRefreshing(false);
  },[tab,user?.id]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(createRequest>0)setShowCreate(true);},[createRequest]);
  useEffect(()=>()=>{if(mediaPreview)URL.revokeObjectURL(mediaPreview);},[mediaPreview]);
  useEffect(()=>()=>{if(channelAvatarPreview)URL.revokeObjectURL(channelAvatarPreview);},[channelAvatarPreview]);

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


  async function deleteStory(story) {
    if(story.user_id!==user.id||busy)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.from('atlantic_stories').delete().eq('id',story.id).eq('user_id',user.id);
    if(e)setError(e.message);
    else {
      if(story.media_path)await supabase.storage.from('atlantic-stories').remove([story.media_path]);
      setStories(current=>current.filter(item=>item.id!==story.id));
      setActiveStoryIndex(-1);
    }
    setBusy(false);
  }

  async function deleteNote(note) {
    if(note.user_id!==user.id||busy)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.from('atlantic_notes').delete().eq('id',note.id).eq('user_id',user.id);
    if(e)setError(e.message);else setNotes(current=>current.filter(item=>item.id!==note.id));
    setBusy(false);
  }

  async function createChannel(e) {
    e.preventDefault(); if(!channelName.trim()||busy) return;
    setBusy(true);setError('');
    const {data,error:e1}=await supabase.from('atlantic_channels')
      .insert({owner_id:user.id,name:channelName.trim(),description:channelDescription.trim()})
      .select('id,owner_id,name,description,is_public,avatar_url,created_at').single();
    if(e1){
      setError(e1.message);
      setBusy(false);
      return;
    }

    const {error:e2}=await supabase.from('atlantic_channel_members')
      .insert({channel_id:data.id,user_id:user.id,role:'owner'});
    if(e2){
      await supabase.from('atlantic_channels').delete().eq('id',data.id).eq('owner_id',user.id);
      setError('Gagal menyiapkan keanggotaan saluran: '+e2.message);
      setBusy(false);
      return;
    }

    let avatarPath=null;
    if(channelAvatarFile){
      const ext=(channelAvatarFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      avatarPath=data.id+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
      const {error:uploadError}=await supabase.storage.from('atlantic-channel-media')
        .upload(avatarPath,channelAvatarFile,{upsert:false,contentType:channelAvatarFile.type});
      if(uploadError){
        await supabase.from('atlantic_channels').delete().eq('id',data.id).eq('owner_id',user.id);
        setError('Foto saluran gagal diunggah: '+uploadError.message);
        setBusy(false);
        return;
      }
      const {error:updateError}=await supabase.from('atlantic_channels')
        .update({avatar_url:avatarPath}).eq('id',data.id).eq('owner_id',user.id);
      if(updateError){
        await supabase.storage.from('atlantic-channel-media').remove([avatarPath]);
        await supabase.from('atlantic_channels').delete().eq('id',data.id).eq('owner_id',user.id);
        setError('Foto saluran gagal disimpan: '+updateError.message);
        setBusy(false);
        return;
      }
    }

    let avatarSigned=null;
    if(avatarPath){
      const {data:signed}=await supabase.storage.from('atlantic-channel-media').createSignedUrl(avatarPath,3600);
      avatarSigned=signed?.signedUrl||null;
    }
    const ready={...data,avatar_url:avatarPath?avatarPath:null,avatar_path:avatarPath,member_count:1,member_role:'owner'};
    if(avatarPath)ready.avatar_url=avatarSigned;
    setChannelName('');setChannelDescription('');setChannelAvatarFile(null);setChannelAvatarPreview('');
    setShowCreate(false);setChannels(v=>[ready,...v]);setJoinedChannelIds(v=>[...new Set([...v,ready.id])]);setSelectedChannel(ready);
    setBusy(false);
  }

  async function joinChannel(channel) {
    const {data:existing,error:checkError}=await supabase.from('atlantic_channel_members').select('user_id,role').eq('channel_id',channel.id).eq('user_id',user.id).maybeSingle();
    if(checkError){setError(checkError.message);return;}
    if(!existing){const {error:e}=await supabase.from('atlantic_channel_members').insert({channel_id:channel.id,user_id:user.id,role:'member'});if(e){setError(e.message);return;}}
    let readyChannel={...channel,avatar_path:channel.avatar_url||null,member_role:existing?.role||'member'};
    if(channel.avatar_url){const {data:signed,error:signedError}=await supabase.storage.from('atlantic-channel-media').createSignedUrl(channel.avatar_url,3600);if(signedError)setError('Foto saluran: '+signedError.message);else readyChannel.avatar_url=signed?.signedUrl||null;}
    setJoinedChannelIds(v=>[...new Set([...v,channel.id])]);
    setSelectedChannel(readyChannel);loadPosts(channel.id);
  }

  async function loadPosts(id) {
    const {data,error:e}=await supabase.from('atlantic_channel_posts').select('id,channel_id,author_id,body,created_at,media_url,media_type,media_name').eq('channel_id',id).order('created_at',{ascending:true}).limit(100);
    if(e) setError(e.message); else {
      const hydrated=await Promise.all((data||[]).map(async post=>{if(!post.media_url)return post;const {data:signed}=await supabase.storage.from('atlantic-channel-media').createSignedUrl(post.media_url,3600);return {...post,media_path:post.media_url,media_url:signed?.signedUrl||null};}));
      setPosts(hydrated);await loadPeople((data||[]).map(post=>post.author_id));
    }
  }

  async function saveChannelSettings(e) {
    e.preventDefault();
    if(!selectedChannel||selectedChannel.owner_id!==user.id||busy)return;
    setBusy(true);setError('');
    let avatarPath=selectedChannel.avatar_path||null;
    if(channelAvatarFile){
      const ext=(channelAvatarFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      avatarPath=selectedChannel.id+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
      const {error:uploadError}=await supabase.storage.from('atlantic-channel-media').upload(avatarPath,channelAvatarFile,{upsert:false,contentType:channelAvatarFile.type});
      if(uploadError){setError('Foto saluran gagal diunggah: '+uploadError.message);setBusy(false);return;}
    }
    const {error:e1}=await supabase.from('atlantic_channels').update({name:channelName.trim(),description:channelDescription.trim(),avatar_url:avatarPath}).eq('id',selectedChannel.id).eq('owner_id',user.id);
    if(e1){if(channelAvatarFile&&avatarPath)await supabase.storage.from('atlantic-channel-media').remove([avatarPath]);setError(e1.message);}
    else{
      if(selectedChannel.avatar_path&&avatarPath!==selectedChannel.avatar_path)await supabase.storage.from('atlantic-channel-media').remove([selectedChannel.avatar_path]);
      let avatarSigned=null;if(avatarPath){const {data:signed}=await supabase.storage.from('atlantic-channel-media').createSignedUrl(avatarPath,3600);avatarSigned=signed?.signedUrl||null;}
      const next={...selectedChannel,name:channelName.trim(),description:channelDescription.trim(),avatar_path:avatarPath,avatar_url:avatarSigned};
      setSelectedChannel(next);setChannels(items=>items.map(item=>item.id===next.id?next:item));
      setChannelAvatarFile(null);setChannelAvatarPreview('');setChannelSettingsOpen(false);
      onNotice?.('Info saluran berhasil diperbarui.');
    }
    setBusy(false);
  }

  async function createChannelInviteLink(){
    if(!selectedChannel||selectedChannel.owner_id!==user.id||channelInviteBusy)return;
    setChannelInviteBusy(true);setError('');
    const token=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
    const maxUses=channelInviteMaxUses.trim()?Number(channelInviteMaxUses):null;
    if(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1)){setError('Batas penggunaan link harus berupa angka minimal 1.');setChannelInviteBusy(false);return;}
    const expiresAt=channelInviteExpiry==='never'?null:new Date(Date.now()+Number(channelInviteExpiry)*86400000).toISOString();
    const {data:id,error:e}=await supabase.rpc('create_atlantic_invite_link',{
      p_invite_type:'channel',p_resource_id:selectedChannel.id,p_token:token,p_expires_at:expiresAt,p_max_uses:maxUses
    });
    if(e){setError('Link undangan saluran gagal dibuat: '+e.message);setChannelInviteBusy(false);return;}
    const url=window.location.origin+'/?atlanticInvite='+encodeURIComponent(token);
    setChannelInviteLink(url);setChannelInviteLinkId(id);
    try{await navigator.clipboard.writeText(url);onNotice?.('Link saluran berhasil dibuat dan disalin.');}
    catch{onNotice?.('Link saluran berhasil dibuat. Salin link yang tampil.');}
    setChannelInviteBusy(false);
  }

  async function revokeChannelInviteLink(){
    if(!channelInviteLinkId||channelInviteBusy)return;
    setChannelInviteBusy(true);
    const {error:e}=await supabase.rpc('revoke_atlantic_invite_link',{p_link_id:channelInviteLinkId});
    if(e)setError('Link saluran gagal dinonaktifkan: '+e.message);
    else{setChannelInviteLink('');setChannelInviteLinkId('');onNotice?.('Link undangan saluran dinonaktifkan.');}
    setChannelInviteBusy(false);
  }

  async function deleteChannelPost(post) {
    if(!selectedChannel||busy)return;
    const canDelete=selectedChannel.owner_id===user.id||['owner','admin'].includes(selectedChannel.member_role);
    if(!canDelete)return;
    const confirmed=await onDialog?.({type:'confirm',title:'Hapus postingan?',message:'Postingan ini akan dihapus dari saluran.',confirmLabel:'Hapus'}); if(!confirmed)return;
    setBusy(true);setError('');
    const {error:e}=await supabase.from('atlantic_channel_posts').delete().eq('id',post.id);
    if(e)setError('Postingan gagal dihapus: '+e.message);
    else{
      setPosts(items=>items.filter(item=>item.id!==post.id));
      if(post.media_path)await supabase.storage.from('atlantic-channel-media').remove([post.media_path]);
    }
    setBusy(false);
  }

  async function publishPost(e) {
    e.preventDefault();const text=body.trim();if((!text&&!channelMediaFile)||!selectedChannel||busy||!(selectedChannel.owner_id===user.id||['owner','admin'].includes(selectedChannel.member_role)))return;
    setBusy(true);setError('');let mediaPath=null;
    if(channelMediaFile){const ext=(channelMediaFile.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';mediaPath=selectedChannel.id+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;const {error:uploadError}=await supabase.storage.from('atlantic-channel-media').upload(mediaPath,channelMediaFile,{upsert:false,contentType:channelMediaFile.type});if(uploadError){setError('Upload media saluran gagal: '+uploadError.message);setBusy(false);return;}}
    const {error:e1}=await supabase.from('atlantic_channel_posts').insert({channel_id:selectedChannel.id,author_id:user.id,body:text,media_url:mediaPath,media_type:channelMediaFile?.type||null,media_name:channelMediaFile?.name||null});
    if(e1){if(mediaPath)await supabase.storage.from('atlantic-channel-media').remove([mediaPath]);setError(e1.message);}else{setBody('');setChannelMediaFile(null);await loadPosts(selectedChannel.id);}
    setBusy(false);
  }

  const title=tab==='updates'?'Pembaruan':tab==='channels'?'Saluran':'Panggilan';\n  const isChannelStaff=Boolean(selectedChannel&&(selectedChannel.owner_id===user.id||['owner','admin'].includes(selectedChannel.member_role)));
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
      <label className="atl-community-search"><Search size={17}/><input value={communitySearch} onChange={e=>setCommunitySearch(e.target.value)} placeholder="Cari status atau catatan…"/></label>
      <div className="atl-community-section"><h2><Clock3 size={18}/> Story</h2><p>Story teks, foto, dan video tampil selama 24 jam.</p>
        <div className="atl-story-strip">
          <button type="button" className="atl-story-add" onClick={()=>setShowCreate(true)}><span className="atl-story-ring"><span>+</span></span><b>Tambah Status</b></button>
          {visibleStoryGroups.map(group=>{const s=group.items[0].story;const person=people[group.userId]||{};return <button type="button" className="atl-story-person" key={group.userId} onClick={()=>setActiveStoryIndex(group.firstIndex)}><span className="atl-story-ring"><span className="atl-story-ring-inner">{person.avatar_url?<img src={person.avatar_url} alt=""/>:(person.display_name||person.username||'A').slice(0,1).toUpperCase()}</span>{group.items.length>1&&<i>{group.items.length}</i>}</span><b>{group.userId===user.id?'Status kamu':(person.display_name||person.username||'Pengguna').split(' ')[0]}</b></button>;})}
          {!visibleStoryGroups.length&&<p className="atl-community-empty">{searchTerm?'Tidak ada status yang cocok.':'Belum ada pembaruan status. Ketuk "Tambah Status" untuk membuat Story pertamamu.'}</p>}
        </div>
      </div>
      <div className="atl-community-section"><h2><NotebookPen size={18}/> Catatan</h2><p>Catatan singkat yang aktif selama 24 jam.</p>
        <div className="atl-note-bubbles">{visibleNotes.map(n=><article className="atl-note-bubble" key={n.id}><div className="atl-note-avatar">{people[n.user_id]?.avatar_url?<img src={people[n.user_id].avatar_url} alt=""/>:(people[n.user_id]?.display_name||people[n.user_id]?.username||'A').slice(0,1).toUpperCase()}</div><div className="atl-note-content"><b>{n.user_id===user.id?'Catatanmu':(people[n.user_id]?.display_name||people[n.user_id]?.username||'Pengguna Atlantic')}</b><p>{n.body}</p><small>{dateLabel(n.created_at)}</small></div>{n.user_id===user.id&&<button type="button" className="atl-note-delete" onClick={()=>deleteNote(n)} aria-label="Hapus catatan">×</button>}</article>)}
        {!visibleNotes.length&&<div className="atl-community-empty">{searchTerm?'Tidak ada catatan yang cocok.':'Belum ada Catatan. Buat catatan singkat untuk teman-temanmu.'}</div>}</div>
      </div>
    </>}
    {tab==='channels'&&<>
      {selectedChannel?<div className="atl-channel-view">
        <button className="atl-channel-back" onClick={()=>{setSelectedChannel(null);setPosts([]);setChannelSettingsOpen(false);}}>← Semua saluran</button>
        <div className="atl-channel-profile-head">
          <div className="atl-channel-profile-avatar">{selectedChannel.avatar_url?<img src={selectedChannel.avatar_url} alt="Foto saluran"/>:<Radio size={28}/>}</div>
          <div><h2>{selectedChannel.name}</h2><p>{selectedChannel.description||'Saluran komunitas Atlantic'}</p><small>{posts.length} postingan · {selectedChannel.owner_id===user.id?'Pemilik':selectedChannel.member_role==='admin'?'Admin':'Pengikut'}</small></div>
          {selectedChannel.owner_id===user.id&&<div className="atl-channel-owner-actions"><button type="button" className="atl-channel-settings-btn" onClick={()=>{setChannelName(selectedChannel.name);setChannelDescription(selectedChannel.description||'');setChannelAvatarPreview('');setChannelSettingsOpen(true);}}>Pengaturan</button><button type="button" className="atl-channel-settings-btn" onClick={createChannelInviteLink} disabled={channelInviteBusy}>{channelInviteBusy?'Memproses…':'Undang teman'}</button></div>}
        </div>
        {selectedChannel.owner_id===user.id&&<div className="atl-channel-invite-settings"><label>Masa berlaku<select value={channelInviteExpiry} onChange={e=>setChannelInviteExpiry(e.target.value)}><option value="never">Tidak kedaluwarsa</option><option value="1">1 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></select></label><label>Batas penggunaan (opsional)<input type="number" min="1" max="10000" value={channelInviteMaxUses} onChange={e=>setChannelInviteMaxUses(e.target.value)} placeholder="Kosong = tanpa batas"/></label></div>}
        {channelInviteLink&&<div className="atl-channel-invite-link"><input readOnly value={channelInviteLink} onFocus={e=>e.target.select()}/><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(channelInviteLink);onNotice?.('Link saluran disalin.');}catch{setError('Gagal menyalin otomatis. Tekan dan tahan link untuk menyalin.');}}}>Salin</button><button type="button" onClick={revokeChannelInviteLink} disabled={channelInviteBusy}>Nonaktifkan</button></div>}
        <div className="atl-channel-posts">{posts.map(p=><article key={p.id}><div className="atl-channel-post-author"><span>{people[p.author_id]?.avatar_url?<img src={people[p.author_id].avatar_url} alt=""/>:(people[p.author_id]?.display_name||people[p.author_id]?.username||'A').slice(0,1).toUpperCase()}</span><b>{people[p.author_id]?.display_name||people[p.author_id]?.username||'Pengguna Atlantic'} {people[p.author_id]?.is_verified&&<BadgeCheck size={13}/>}</b></div>{p.media_url&&(p.media_type?.startsWith('image/')?<img className="atl-channel-media" src={p.media_url} alt={p.media_name||'Media saluran'}/>:p.media_type?.startsWith('video/')?<video className="atl-channel-media" src={p.media_url} controls playsInline/>:<a href={p.media_url} target="_blank" rel="noreferrer">📎 {p.media_name||'Lampiran'}</a>)}{p.body&&<p>{p.body}</p>}<small>{dateLabel(p.created_at)}</small>{isChannelStaff&&<button type="button" className="atl-channel-delete-post" onClick={()=>deleteChannelPost(p)} disabled={busy}>Hapus postingan</button>}</article>)}{!posts.length&&<div className="atl-community-empty">Belum ada postingan di saluran ini.</div>}</div>
        {isChannelStaff?<form className="atl-community-compose atl-channel-compose" onSubmit={publishPost}><input ref={channelMediaInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>50*1024*1024){setError('Ukuran lampiran maksimal 50 MB.');return;}setChannelMediaFile(file);}}/><input ref={channelDocumentInput} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>50*1024*1024){setError('Ukuran lampiran maksimal 50 MB.');return;}setChannelMediaFile(file);}}/><div className="atl-channel-attach-wrap"><button type="button" onClick={()=>setChannelMoreOpen(v=>!v)} aria-label="Lampiran" aria-expanded={channelMoreOpen}><ImagePlus size={19}/></button>{channelMoreOpen&&<div className="atl-channel-attach-menu"><button type="button" onClick={()=>{setChannelMoreOpen(false);channelMediaInput.current?.click();}}><ImagePlus size={17}/> Foto &amp; video</button><button type="button" onClick={()=>{setChannelMoreOpen(false);channelDocumentInput.current?.click();}}><NotebookPen size={17}/> Dokumen</button><button type="button" onClick={()=>{setChannelMoreOpen(false);setChannelPollsOpen(true);}}><BarChart3 size={17}/> Polling / Vote</button></div>}</div><input value={body} onChange={e=>setBody(e.target.value)} placeholder="Tulis postingan…" maxLength={2000}/><button disabled={busy||(!body.trim()&&!channelMediaFile)} aria-label="Kirim postingan"><Send size={18}/></button></form> : <div className="atl-channel-readonly-note">Hanya pemilik dan admin yang dapat mengirim pesan di saluran ini.</div>}{channelMediaFile&&isChannelStaff&&<small className="atl-channel-attachment">Lampiran: {channelMediaFile.name} <button type="button" onClick={()=>setChannelMediaFile(null)}>Hapus</button></small>}
        {channelPollsOpen&&isChannelStaff&&<div className="atl-channel-polls-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setChannelPollsOpen(false)}><section className="atl-channel-polls-panel"><header><b><BarChart3 size={18}/> Polling saluran</b><button type="button" onClick={()=>setChannelPollsOpen(false)} aria-label="Tutup"><X size={19}/></button></header><AtlanticPolls targetType="channel" targetId={selectedChannel.id} user={user} canCreate={isChannelStaff} onNotice={onNotice}/></section></div>}
        {channelSettingsOpen&&<div className="atl-community-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setChannelSettingsOpen(false)}><section className="atl-community-modal atl-channel-settings-modal"><header><b>Pengaturan Saluran</b><button type="button" onClick={()=>setChannelSettingsOpen(false)}><X/></button></header><form onSubmit={saveChannelSettings}><label>Nama saluran<input value={channelName} onChange={e=>setChannelName(e.target.value)} maxLength={60} required/></label><label>Deskripsi<textarea value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} maxLength={180}/></label><input type="file" accept="image/jpeg,image/png,image/webp" hidden id="atl-channel-avatar-input" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>5*1024*1024){setError('Foto saluran maksimal 5 MB.');return;}setChannelCropFile(file);}}/><label className="atl-channel-avatar-picker" htmlFor="atl-channel-avatar-input"><ImagePlus size={16}/> Ganti foto saluran</label>{channelAvatarPreview&&<img className="atl-channel-avatar-preview" src={channelAvatarPreview} alt="Pratinjau foto saluran"/>}<button className="atl-community-submit" disabled={busy||channelName.trim().length<2}>Simpan perubahan</button></form></section></div>}
      </div>:<div className="atl-channel-home">
        <div className="atl-channel-home-toolbar">
          <div><span className="eyebrow">JELAJAHI ATLANTIC</span><h2>Temukan saluran</h2><p>Ikuti kabar dari kreator dan komunitas yang kamu suka.</p></div>
          <button type="button" onClick={()=>setShowCreate(true)}><Plus size={17}/> Buat saluran</button>
        </div>
        <label className="atl-channel-home-search"><Search size={17}/><input value={communitySearch} onChange={e=>setCommunitySearch(e.target.value)} placeholder="Cari saluran…"/></label>
        {(()=>{const matches=channels.filter(c=>!searchTerm||String(c.name||'').toLowerCase().includes(searchTerm)||String(c.description||'').toLowerCase().includes(searchTerm));const followed=matches.filter(c=>joinedChannelIds.includes(c.id));const discover=matches.filter(c=>!joinedChannelIds.includes(c.id));const channelRow=c=><article className="atl-channel-wa-row" key={c.id}><button type="button" className="atl-channel-wa-main" onClick={()=>joinChannel(c)}><span className="atl-channel-wa-avatar">{c.avatar_url?<img src={c.avatar_url} alt=""/>:<Radio size={22}/>}</span><span className="atl-channel-wa-copy"><b>{c.name} {people[c.owner_id]?.is_verified&&<BadgeCheck size={14}/>}</b><small>{c.description||'Saluran komunitas Atlantic'}</small><small className="atl-channel-wa-meta">{c.member_count} pengikut · {people[c.owner_id]?.display_name||people[c.owner_id]?.username||'Kreator Atlantic'}</small></span></button><button type="button" className={joinedChannelIds.includes(c.id)?'is-following':''} onClick={()=>joinChannel(c)}>{joinedChannelIds.includes(c.id)?'Buka':'Ikuti'}</button></article>;return <><section className="atl-channel-wa-section"><header><div><h3>Saluran yang diikuti</h3><p>Update terbaru dari saluran pilihanmu</p></div><span>{followed.length}</span></header>{followed.length?followed.map(channelRow):<div className="atl-channel-home-empty">Saluran yang kamu ikuti akan muncul di sini.</div>}</section><section className="atl-channel-wa-section"><header><div><h3>Temukan saluran</h3><p>Rekomendasi komunitas untuk kamu ikuti</p></div><span>{discover.length}</span></header>{discover.length?discover.map(channelRow):<div className="atl-channel-home-empty">{channels.length?'Tidak ada saluran yang cocok.':'Belum ada saluran publik. Jadilah yang pertama membuat saluran.'}</div>}</section></>;})()}
      </div>}
    </>}
    {tab==='calls'&&<div className="atl-community-section"><h2><Phone size={18}/> Riwayat panggilan</h2><p>Riwayat panggilan audio dan video langsung Atlantic.</p>
      <div className="atl-call-list">{calls.map(c=><article key={c.id}><div className="atl-call-icon"><Phone size={17}/></div><div><b>{c.caller_id===user.id?'Keluar ke':'Masuk dari'} {people[c.caller_id===user.id?c.callee_id:c.caller_id]?.display_name||people[c.caller_id===user.id?c.callee_id:c.caller_id]?.username||'Pengguna Atlantic'} · {c.call_type==='video'?'Video':'Audio'}</b><small>{dateLabel(c.started_at)} · {callStatusLabel(c.status)}</small></div></article>)}{!calls.length&&<div className="atl-community-empty">Belum ada riwayat panggilan.</div>}</div>
    </div>}
    {activeStoryIndex>=0&&stories[activeStoryIndex]&&(()=>{const story=stories[activeStoryIndex];const isVideo=/\.(mp4|webm)(\?|$)/i.test(story.media_url||'');return <div className="atl-story-viewer" onClick={()=>setActiveStoryIndex(-1)}><button className="atl-story-viewer-close" onClick={()=>setActiveStoryIndex(-1)} aria-label="Tutup">×</button><article onClick={e=>e.stopPropagation()}><header><b>{people[story.user_id]?.display_name||people[story.user_id]?.username||'Pengguna Atlantic'}</b><small>{dateLabel(story.created_at)}</small></header>{story.media_url&&(isVideo?<video src={story.media_url} controls autoPlay playsInline/>:<img src={story.media_url} alt="Story"/>)}{story.body&&<p>{story.body}</p>}<footer>{story.user_id===user.id&&<button type="button" onClick={()=>deleteStory(story)} disabled={busy}>Hapus Story</button>}<button type="button" onClick={()=>setActiveStoryIndex(v=>v>0?v-1:-1)}>Tutup</button><button type="button" onClick={()=>setActiveStoryIndex(v=>v<stories.length-1?v+1:-1)}>Berikutnya</button></footer></article></div>;})()}
    {showCreate&&<div className="atl-community-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowCreate(false)}><section className="atl-community-modal"><header><b>{tab==='updates'?'Bagikan pembaruan':'Buat saluran'}</b><button onClick={()=>setShowCreate(false)}><X/></button></header>
      {tab==='updates'?<><label>{mediaFile?'Caption Story':'Teks Story'}<textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={mediaFile?'Tulis caption untuk foto atau video Story…':'Apa yang ingin kamu bagikan?'} rows={4} maxLength={500}/></label><div className="atl-story-upload"><input ref={storyMediaInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={chooseStoryMedia} hidden/><button type="button" onClick={()=>storyMediaInput.current?.click()} disabled={busy}><ImagePlus size={16}/>{mediaFile?'Ganti foto/video':'Tambahkan foto/video'}</button><small>JPG, PNG, WebP, GIF, MP4, WebM · Maks. 20 MB</small>{mediaPreview&&<div className="atl-story-preview">{mediaFile?.type.startsWith('video/')?<video src={mediaPreview} controls playsInline/>:<img src={mediaPreview} alt="Pratinjau Story"/>}<button type="button" onClick={()=>{setMediaFile(null);setMediaPreview('');}}>Hapus media</button></div>}</div><div className="atl-community-modal-actions"><button onClick={()=>publish('story')} disabled={busy||(!body.trim()&&!mediaFile)}><ImagePlus size={16}/> {busy?'Mengunggah…':'Terbitkan Story'}</button><button onClick={()=>publish('note')} disabled={busy||!body.trim()||!!mediaFile}><NotebookPen size={16}/> Buat Catatan</button></div></>:<form onSubmit={createChannel}><label>Nama saluran<input value={channelName} onChange={e=>setChannelName(e.target.value)} maxLength={60} required/></label><label>Deskripsi<input value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} maxLength={180}/></label><input type="file" accept="image/jpeg,image/png,image/webp" hidden id="atl-channel-avatar-create-input" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Foto saluran harus JPG, PNG, atau WebP.');return;}if(file.size>5*1024*1024){setError('Foto saluran maksimal 5 MB.');return;}setChannelCropFile(file);}}/><label className="atl-channel-avatar-picker" htmlFor="atl-channel-avatar-create-input"><ImagePlus size={16}/> Tambahkan foto profil saluran</label>{channelAvatarPreview&&<img className="atl-channel-avatar-preview" src={channelAvatarPreview} alt="Pratinjau foto saluran"/>}<button className="atl-community-submit" disabled={busy||!channelName.trim()}>Buat saluran</button></form>}
    </section></div>}
    <AtlanticImageCropper file={channelCropFile} title="Sesuaikan foto saluran" busy={busy} onCancel={()=>setChannelCropFile(null)} onApply={async croppedFile=>{setChannelAvatarFile(croppedFile);setChannelAvatarPreview(URL.createObjectURL(croppedFile));setChannelCropFile(null);}} />
  </section>;
}
