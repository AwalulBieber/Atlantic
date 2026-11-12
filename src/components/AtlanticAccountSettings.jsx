import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import "./AtlanticAccountSettings.css";

const DEFAULTS = {
  bio: "", is_private: false, show_online_status: true,
  read_receipts_enabled: true, group_invite_policy: "everyone",
};

export default function AtlanticAccountSettings({ user, onClose, onSaved }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user?.id) return;
      const [{ data: p, error: profileError }, { data: admin, error: adminError }] =
        await Promise.all([
          supabase.from("profiles").select("id,username,display_name,avatar_url,bio,is_private,show_online_status,read_receipts_enabled,group_invite_policy").eq("id", user.id).maybeSingle(),
          supabase.rpc("is_atlantic_admin")
        ]);
      if (!alive) return;
      if (profileError) setMessage(profileError.message);
      else setProfile({ ...DEFAULTS, ...(p || {}) });
      setIsAdmin(!adminError && admin === true);
    }
    load();
    return () => { alive = false; };
  }, [user?.id]);

  function update(key, value) {
    setProfile(current => ({ ...current, [key]: value }));
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Pilih file gambar (JPG, PNG, atau WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Ukuran foto maksimal 5 MB.");
      return;
    }
    setUploading(true);
    setMessage("");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = user.id + "/" + Date.now() + "." + extension;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (uploadError) {
      setMessage("Upload gagal: " + uploadError.message + ". Pastikan bucket avatars dan izin upload sudah dibuat di Supabase.");
    } else {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      update("avatar_url", data.publicUrl);
      setMessage("Foto berhasil diunggah. Tekan Simpan perubahan untuk menerapkannya.");
    }
    setUploading(false);
  }

  async function save(event) {
    event.preventDefault();
    if (!user?.id || !profile || busy) return;
    setBusy(true);
    setMessage("");
    const payload = {
      username: profile.username, display_name: profile.display_name,
      avatar_url: profile.avatar_url, bio: profile.bio,
      is_private: profile.is_private, show_online_status: profile.show_online_status,
      read_receipts_enabled: profile.read_receipts_enabled,
      group_invite_policy: profile.group_invite_policy,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    setBusy(false);
    if (error) setMessage("Gagal menyimpan: " + error.message);
    else { setMessage("Perubahan berhasil disimpan."); onSaved?.(profile); }
  }

  if (!profile) {
    return <div className="atl-settings-backdrop"><section className="atl-settings"><p>{message || "Memuat pengaturan…"}</p><button onClick={onClose}>Tutup</button></section></div>;
  }

  return (
    <div className="atl-settings-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <section className="atl-settings" role="dialog" aria-modal="true" aria-label="Pengaturan akun Atlantic">
        <header className="atl-settings-head">
          <div><small>ATLANTIC ACCOUNT</small><h2>Pengaturan akun</h2></div>
          <button type="button" onClick={onClose} aria-label="Tutup">✕</button>
        </header>
        <nav className="atl-settings-tabs">
          <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profil</button>
          <button type="button" className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>Privasi</button>
        </nav>
        <form onSubmit={save} className="atl-settings-body">
          {tab === "profile" && <>
            <div className="atl-admin-status">
              <div><strong>{profile.display_name || profile.username || "Pengguna Atlantic"}</strong><small>{profile.username ? "@" + profile.username : user?.email}</small></div>
              {isAdmin && <span className="atl-blue-verified">✓ Atlantic Verified</span>}
            </div>
            <div className="atl-avatar-editor">
              <div className="atl-avatar-preview">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="Foto profil" /> : <span>{(profile.display_name || profile.username || "A").slice(0,1).toUpperCase()}</span>}
              </div>
              <div className="atl-avatar-actions">
                <b>Foto profil</b>
                <small>Pilih foto langsung dari galeri. Maksimal 5 MB.</small>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadAvatar} hidden />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Mengunggah…" : "Pilih dari galeri"}</button>
              </div>
            </div>
            <label>Nama tampilan<input value={profile.display_name || ""} onChange={e => update("display_name", e.target.value)} maxLength={60}/></label>
            <label>Username<input value={profile.username || ""} onChange={e => update("username", e.target.value)} maxLength={30}/></label>
            <label>Bio<textarea value={profile.bio || ""} onChange={e => update("bio", e.target.value)} maxLength={160} rows={3}/></label>
          </>}
          {tab === "privacy" && <>
            <label className="atl-switch-row"><span><b>Akun private</b><small>Batasi penemuan profil melalui fitur pencarian yang mendukung privasi.</small></span><input type="checkbox" checked={!!profile.is_private} onChange={e => update("is_private", e.target.checked)}/></label>
            <label className="atl-switch-row"><span><b>Tampilkan status online</b><small>Izinkan pengguna melihat status online.</small></span><input type="checkbox" checked={!!profile.show_online_status} onChange={e => update("show_online_status", e.target.checked)}/></label>
            <label className="atl-switch-row"><span><b>Tanda dibaca</b><small>Izinkan tanda pesan telah dibaca.</small></span><input type="checkbox" checked={!!profile.read_receipts_enabled} onChange={e => update("read_receipts_enabled", e.target.checked)}/></label>
            <label>Siapa yang boleh mengundang ke grup<select value={profile.group_invite_policy || "everyone"} onChange={e => update("group_invite_policy", e.target.value)}><option value="everyone">Semua orang</option><option value="approval">Perlu persetujuan</option></select></label>
          </>}
          {message && <p className="atl-settings-message" role="status">{message}</p>}
          <footer><button type="button" className="atl-secondary" onClick={onClose}>Tutup</button><button type="submit" disabled={busy || uploading}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></footer>
        </form>
      </section>
    </div>
  );
}
