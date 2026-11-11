import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./AtlanticAccountSettings.css";

const DEFAULTS = {
  bio: "",
  is_private: false,
  show_online_status: true,
  read_receipts_enabled: true,
  group_invite_policy: "everyone",
};

export default function AtlanticAccountSettings({ user, onClose }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user?.id) return;
      const [{ data: p, error: profileError }, { data: admin, error: adminError }] =
        await Promise.all([
          supabase.from("profiles")
            .select("id,username,display_name,avatar_url,bio,is_private,show_online_status,read_receipts_enabled,group_invite_policy")
            .eq("id", user.id).maybeSingle(),
          supabase.rpc("is_atlantic_admin")
        ]);
      if (!alive) return;
      if (profileError) setMessage(profileError.message);
      else setProfile({ ...DEFAULTS, ...(p || {}) });
      if (adminError) {
        // Badge is shown only when the protected admin registry can be read.
        setIsAdmin(false);
      } else {
        setIsAdmin(admin === true);
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.id]);

  function update(key, value) {
    setProfile(current => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (!user?.id || !profile || busy) return;
    setBusy(true);
    setMessage("");
    const payload = {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      is_private: profile.is_private,
      show_online_status: profile.show_online_status,
      read_receipts_enabled: profile.read_receipts_enabled,
      group_invite_policy: profile.group_invite_policy,
    };
    const { error } = await supabase.from("profiles")
      .update(payload).eq("id", user.id);
    setBusy(false);
    setMessage(error ? `Gagal menyimpan: ${error.message}` : "Perubahan berhasil disimpan.");
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
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profil</button>
          <button className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>Privasi</button>
        </nav>
        <form onSubmit={save} className="atl-settings-body">
          {tab === "profile" && <>
            <div className="atl-admin-status">
              <div><strong>{profile.display_name || profile.username || "Pengguna Atlantic"}</strong><small>{profile.username ? `@${profile.username}` : user?.email}</small></div>
              {isAdmin && <span className="atl-blue-verified">✓ Atlantic Verified</span>}
            </div>
            {!isAdmin && <p className="atl-muted">Akun pengguna biasa tidak menampilkan badge verifikasi.</p>}
            <label>Nama tampilan<input value={profile.display_name || ""} onChange={e => update("display_name", e.target.value)} maxLength={60}/></label>
            <label>Username<input value={profile.username || ""} onChange={e => update("username", e.target.value)} maxLength={30}/></label>
            <label>URL foto profil<input value={profile.avatar_url || ""} onChange={e => update("avatar_url", e.target.value)} placeholder="https://…"/></label>
            <label>Bio<textarea value={profile.bio || ""} onChange={e => update("bio", e.target.value)} maxLength={160} rows={3}/></label>
          </>}
          {tab === "privacy" && <>
            <label className="atl-switch-row"><span><b>Akun private</b><small>Batasi penemuan profil melalui fitur pencarian yang mendukung privasi.</small></span><input type="checkbox" checked={!!profile.is_private} onChange={e => update("is_private", e.target.checked)}/></label>
            <label className="atl-switch-row"><span><b>Tampilkan status online</b><small>Izinkan pengguna melihat status online.</small></span><input type="checkbox" checked={!!profile.show_online_status} onChange={e => update("show_online_status", e.target.checked)}/></label>
            <label className="atl-switch-row"><span><b>Tanda dibaca</b><small>Izinkan tanda pesan telah dibaca.</small></span><input type="checkbox" checked={!!profile.read_receipts_enabled} onChange={e => update("read_receipts_enabled", e.target.checked)}/></label>
            <label>Siapa yang boleh mengundang ke grup
              <select value={profile.group_invite_policy || "everyone"} onChange={e => update("group_invite_policy", e.target.value)}>
                <option value="everyone">Semua orang</option>
                <option value="approval">Perlu persetujuan</option>
              </select>
            </label>
          </>}
          {message && <p className="atl-settings-message" role="status">{message}</p>}
          <footer><button type="button" className="atl-secondary" onClick={onClose}>Tutup</button><button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></footer>
        </form>
      </section>
    </div>
  );
      }

