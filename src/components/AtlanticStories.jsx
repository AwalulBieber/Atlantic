import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Plus, X, Eye, Clock3, ImagePlus, StickyNote, ChevronRight } from 'lucide-react';
import './AtlanticStories.css';

const MAX_STORY_SIZE = 50 * 1024 * 1024;
const initials = name => (name || '?').trim().slice(0, 1).toUpperCase();

export default function AtlanticStories({ session, profiles = [], myProfile }) {
  const [stories, setStories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [storyFile, setStoryFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const fileRef = useRef(null);

  const people = useMemo(() => [
    { ...myProfile, id: session?.user?.id, display_name: myProfile?.display_name || session?.user?.user_metadata?.display_name || 'Kamu', isMe: true },
    ...profiles.map(p => ({ ...p, isMe: false }))
  ].filter(p => p.id), [profiles, myProfile, session?.user?.id]);

  async function refresh() {
    if (!session?.user?.id) return;
    const [{ data: storyRows, error: storyError }, { data: noteRows, error: noteError }] = await Promise.all([
      supabase.from('stories').select('id,user_id,media_path,media_type,caption,created_at,expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true }),
      supabase.from('user_notes').select('user_id,body,updated_at,expires_at').gt('expires_at', new Date().toISOString())
    ]);
    if (storyError || noteError) {
      setError((storyError || noteError).message);
      return;
    }
    const hydrated = await Promise.all((storyRows || []).map(async story => {
      const { data } = await supabase.storage.from('atlantic-stories').createSignedUrl(story.media_path, 60 * 60);
      return { ...story, url: data?.signedUrl || null };
    }));
    setStories(hydrated.filter(s => s.url));
    setNotes(noteRows || []);
  }

  useEffect(() => {
    refresh();
    const channel = supabase.channel('atlantic-stories-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notes' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id]);

  const noteByUser = Object.fromEntries(notes.map(n => [n.user_id, n]));
  const storiesByUser = people.map(person => ({
    person,
    items: stories.filter(s => s.user_id === person.id)
  })).filter(group => group.items.length);

  async function saveNote(e) {
    e?.preventDefault();
    const body = noteText.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    const now = new Date().toISOString();
    const { error: saveError } = await supabase.from('user_notes').upsert({
      user_id: session.user.id, body, updated_at: now,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'user_id' });
    if (saveError) setError(saveError.message);
    else { setNoteOpen(false); await refresh(); }
    setBusy(false);
  }

  async function deleteNote() {
    const { error: deleteError } = await supabase.from('user_notes').delete().eq('user_id', session.user.id);
    if (deleteError) setError(deleteError.message);
    else { setNoteText(''); setNoteOpen(false); await refresh(); }
  }

  async function publishStory(e) {
    e?.preventDefault();
    if (!storyFile || busy) return;
    if (storyFile.size > MAX_STORY_SIZE) { setError('Ukuran story maksimal 50 MB.'); return; }
    if (!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'].includes(storyFile.type)) {
      setError('Format story harus JPG, PNG, WEBP, GIF, MP4, atau WEBM.');
      return;
    }
    setBusy(true); setError('');
    const ext = storyFile.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const path = session.user.id + '/' + crypto.randomUUID() + '.' + ext;
    const { error: uploadError } = await supabase.storage.from('atlantic-stories').upload(path, storyFile, { contentType: storyFile.type, upsert: false });
    if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    const { error: insertError } = await supabase.from('stories').insert({
      user_id: session.user.id, media_path: path, media_type: storyFile.type,
      caption: caption.trim().slice(0, 180),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    if (insertError) {
      await supabase.storage.from('atlantic-stories').remove([path]);
      setError(insertError.message);
    } else {
      setStoryFile(null); setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      await refresh();
    }
    setBusy(false);
  }

  async function openGroup(group) {
    setStoryOpen(group);
    setStoryIndex(0);
    const story = group.items[0];
    if (story && story.user_id !== session.user.id) {
      await supabase.from('story_views').upsert({ story_id: story.id, viewer_id: session.user.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
    }
  }

  async function moveStory(next) {
    if (!storyOpen) return;
    const index = Math.max(0, Math.min(storyOpen.items.length - 1, next));
    setStoryIndex(index);
    const story = storyOpen.items[index];
    if (story && story.user_id !== session.user.id) {
      await supabase.from('story_views').upsert({ story_id: story.id, viewer_id: session.user.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
    }
  }

  const currentStory = storyOpen?.items?.[storyIndex];
  const currentOwner = people.find(p => p.id === currentStory?.user_id);

  useEffect(() => {
    let alive = true;
    async function loadViewerCount() {
      if (!currentStory || currentStory.user_id !== session?.user?.id) { setViewerCount(0); return; }
      const { count, error: countError } = await supabase.from('story_views')
        .select('viewer_id', { count: 'exact', head: true }).eq('story_id', currentStory.id);
      if (alive && !countError) setViewerCount(count || 0);
    }
    loadViewerCount();
    return () => { alive = false; };
  }, [currentStory?.id, session?.user?.id]);

  return (
    <section className="atl-stories">
      <div className="atl-stories-heading">
        <b>Story</b><span>24 jam</span>
      </div>
      <div className="atl-story-strip">
        <button className="atl-story-person atl-story-add" type="button" onClick={() => fileRef.current?.click()}>
          <span className="atl-story-ring own"><span>{myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : initials(myProfile?.display_name || session?.user?.email)}</span><i><Plus size={13}/></i></span>
          <small>Story kamu</small>
        </button>
        {storiesByUser.map(group => (
          <button className="atl-story-person" type="button" key={group.person.id} onClick={() => openGroup(group)}>
            <span className="atl-story-ring"><span>{group.person.avatar_url ? <img src={group.person.avatar_url} alt="" /> : initials(group.person.display_name || group.person.username)}</span></span>
            <small>{group.person.isMe ? 'Kamu' : (group.person.display_name || group.person.username || 'Teman')}</small>
          </button>
        ))}
        {!storiesByUser.length && <span className="atl-story-empty">Belum ada story teman.</span>}
      </div>
      <div className="atl-notes-row">
        <button type="button" className="atl-note-own" onClick={() => { setNoteText(noteByUser[session.user.id]?.body || ''); setNoteOpen(true); }}>
          <span className="atl-note-icon"><StickyNote size={16}/></span>
          <span><b>Catatan kamu</b><small>{noteByUser[session.user.id]?.body || 'Bagikan apa yang kamu pikirkan…'}</small></span>
          <ChevronRight size={15}/>
        </button>
        {notes.filter(n => n.user_id !== session.user.id).slice(0, 3).map(note => {
          const person = people.find(p => p.id === note.user_id);
          if (!person) return null;
          return <div className="atl-friend-note" key={note.user_id}><b>{person.display_name || person.username}</b><span>{note.body}</span></div>;
        })}
      </div>
      {error && <p className="atl-story-error">{error}</p>}
      <form className="atl-story-publish" onSubmit={publishStory}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={e => setStoryFile(e.target.files?.[0] || null)} hidden />
        {storyFile ? <><span>{storyFile.name}</span><input value={caption} onChange={e => setCaption(e.target.value)} maxLength={180} placeholder="Tulis caption (opsional)…"/><button disabled={busy} type="submit">{busy ? 'Mengunggah…' : 'Bagikan'}</button><button type="button" onClick={() => {setStoryFile(null);fileRef.current.value='';}}>Batal</button></> : <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={15}/> Tambah story foto/video</button>}
      </form>
      {noteOpen && <div className="atl-story-backdrop" onClick={() => setNoteOpen(false)}><form className="atl-note-modal" onSubmit={saveNote} onClick={e => e.stopPropagation()}>
        <header><div><span>ATLANTIC NOTES</span><h3>Catatan kamu</h3></div><button type="button" onClick={() => setNoteOpen(false)}><X size={18}/></button></header>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} maxLength={60} placeholder="Apa yang sedang kamu pikirkan?" autoFocus/>
        <div className="atl-note-footer"><small>{noteText.length}/60 · hilang dalam 24 jam</small><button type="button" className="atl-note-delete" onClick={deleteNote}>Hapus</button><button type="submit" disabled={busy || !noteText.trim()}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
      </form></div>}
      {currentStory && <div className="atl-story-viewer" onClick={() => setStoryOpen(null)}>
        <div className="atl-story-viewer-card" onClick={e => e.stopPropagation()}>
          <div className="atl-story-progress"><i style={{width: ((storyIndex + 1) / storyOpen.items.length * 100) + '%'}}/></div>
          <header><b>{currentOwner?.display_name || currentOwner?.username || 'Story'}</b><small><Clock3 size={12}/> {new Date(currentStory.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</small><button onClick={() => setStoryOpen(null)}><X size={18}/></button></header>
          {currentStory.media_type.startsWith('video/') ? <video src={currentStory.url} controls autoPlay playsInline/> : <img src={currentStory.url} alt="Story"/>}
          {currentStory.caption && <p>{currentStory.caption}</p>}
          {currentStory.user_id === session.user.id && <small className="atl-story-views"><Eye size={14}/> {viewerCount} penonton</small>}
          <div className="atl-story-controls"><button disabled={storyIndex === 0} onClick={() => moveStory(storyIndex - 1)}>Sebelumnya</button><button disabled={storyIndex >= storyOpen.items.length - 1} onClick={() => moveStory(storyIndex + 1)}>Berikutnya</button></div>
        </div>
      </div>}
    </section>
  );
}
