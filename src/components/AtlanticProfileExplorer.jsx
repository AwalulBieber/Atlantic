import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { ArrowLeft, BadgeCheck, CalendarDays, LockKeyhole, Users, X } from "lucide-react";
import "./AtlanticProfileExplorer.css";

function initials(name = "A") {
  return name.trim().slice(0, 1).toUpperCase() || "A";
}

export default function AtlanticProfileExplorer({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [stories, setStories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storyError, setStoryError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url,bio,is_private,is_verified,show_online_status,created_at,show_contacts")
        .eq("id", userId).maybeSingle();
      if (!alive) return;
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(data);
      const { data: adminStatus } = await supabase.rpc("is_atlantic_admin", { target_user: userId });
      if (alive) setIsAdmin(adminStatus === true);

      // Story visibility is enforced by the existing mutual-contact RLS policy.
      const { data: storyRows, error: storiesError } = await supabase.from("atlantic_stories")
        .select("id,body,media_url,created_at,expires_at")
        .eq("user_id", userId).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(20);
      if (!alive) return;
      setStories(storyRows || []);
      if (storiesError) setStoryError("Story hanya ditampilkan jika kebijakan privasi mengizinkan.");

      if (!data.is_private && data.show_contacts) {
        const { data: contactRows } = await supabase.rpc("get_public_profile_contacts", { target_user: userId });
        if (alive) setContacts(contactRows || []);
      }
      if (alive) setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [userId]);

  return (
    <div className="atl-profile-explorer-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="atl-profile-explorer" role="dialog" aria-modal="true" aria-label="Profil pengguna">
        <header className="atl-profile-explorer-head">
          <button type="button" onClick={onClose} aria-label="Kembali"><ArrowLeft size={19}/></button>
          <b>Profil</b>
          <button type="button" onClick={onClose} aria-label="Tutup"><X size={18}/></button>
        </header>
        {loading ? <div className="atl-profile-explorer-loading">Memuat profil…</div> : !profile ? <div className="atl-profile-explorer-loading">Profil tidak dapat ditemukan.</div> : <>
          <div className="atl-profile-hero">
            <div className="atl-profile-photo">{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name || profile.username}/> : initials(profile.display_name || profile.username)}</div>
            <h2>{profile.display_name || profile.username}{(profile.is_verified || isAdmin) && <BadgeCheck className="atl-profile-verified" size={19}/>}</h2>
            <div className="atl-profile-username">@{profile.username}</div>
            {(profile.is_verified || isAdmin) && <span className="atl-profile-badge"><BadgeCheck size={14}/> Atlantic Verified</span>}
            {profile.bio && !profile.is_private && <p>{profile.bio}</p>}
            <div className="atl-profile-meta"><CalendarDays size={14}/> Bergabung {profile.created_at ? new Date(profile.created_at).toLocaleDateString("id-ID",{month:"long",year:"numeric"}) : "di Atlantic"}</div>
          </div>

          {profile.is_private && <div className="atl-profile-private"><LockKeyhole size={17}/><div><b>Akun private</b><span>Informasi profil dan kontak dibatasi oleh pemilik akun.</span></div></div>}

          {!profile.is_private && <section className="atl-profile-section">
            <h3>Story</h3>
            {stories.length ? <div className="atl-profile-stories">{stories.map(story => <article key={story.id}>
              {story.media_url && <img src={story.media_url} alt="Story"/>}
              {story.body && <p>{story.body}</p>}
              <small>{new Date(story.created_at).toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</small>
            </article>)}</div> : <p className="atl-profile-empty">{storyError || "Belum ada Story yang bisa kamu lihat."}</p>}
          </section>}

          {!profile.is_private && <section className="atl-profile-section">
            <h3><Users size={16}/> Kontak</h3>
            {profile.show_contacts ? contacts.length ? <div className="atl-profile-contact-list">{contacts.map(person => <div key={person.id} className="atl-profile-contact">
              <span className="atl-profile-contact-avatar">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : initials(person.display_name || person.username)}</span>
              <span><b>{person.display_name || person.username}</b><small>@{person.username}</small></span>
              {person.is_verified && <BadgeCheck size={15}/>}
            </div>)}</div> : <p className="atl-profile-empty">Belum ada kontak yang dibagikan.</p> : <p className="atl-profile-empty">Pemilik akun belum membagikan daftar kontaknya.</p>}
          </section>}
        </>}
      </section>
    </div>
  );
}
