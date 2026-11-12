ATLANTIC CHAT — V1
==================

Fitur yang sudah disiapkan:
- Daftar akun dan login email/password via Supabase Auth
- Profil dasar otomatis dibuat oleh trigger SQL
- Daftar pengguna
- Membuka percakapan pribadi
- Kirim dan terima pesan real-time
- Tampilan responsif HP dan desktop

PENTING:
Project ini membutuhkan project Supabase dan SQL schema yang sudah dijalankan.
Jangan pernah memasukkan Supabase Secret key atau password database ke frontend.

CARA MENJALANKAN / DEPLOY DARI HP
1. Buat akun GitHub jika belum punya: https://github.com
2. Buat repository baru bernama atlantic-chat.
3. Upload seluruh isi folder project ini ke repository (termasuk folder src).
4. Buka https://vercel.com dan login dengan GitHub.
5. Pilih Add New > Project, lalu import repository atlantic-chat.
6. Pada Environment Variables tambahkan:
   VITE_SUPABASE_URL = https://hbdfmyoohnofynywgvoj.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY = (isi publishable key milikmu)
7. Tekan Deploy.

Untuk menjalankan lokal:
- Salin .env.example menjadi .env
- Isi dua variable di atas
- Jalankan npm install
- Jalankan npm run dev

KONFIGURASI SUPABASE
- Authentication > URL Configuration:
  Setelah deploy, masukkan domain Vercel ke Site URL dan Redirect URLs.
- Authentication > Providers > Email: aktifkan.
- Untuk uji coba awal, konfirmasi email boleh dimatikan di Authentication settings,
  tetapi aktifkan kembali sebelum aplikasi dipakai publik.
- Pastikan tabel messages sudah masuk ke publication supabase_realtime.
- Jalankan tes dengan dua akun berbeda.

STATUS FITUR ATLANTIC
=====================
Sudah tersedia di kode:
- Chat pribadi real-time dan balasan pesan.
- Arsip chat per pengguna dengan tampilan daftar arsip dan opsi kembalikan ke daftar utama.
- Hapus pesan sendiri dengan konfirmasi Neobrutalism.
- Indikator pesan terkirim, diterima, dan dibaca (mengikuti pengaturan tanda dibaca).
- Indikator "sedang mengetik" real-time.
- Profil: nama tampilan, username, bio, foto profil, dan pengaturan privasi.
- Badge biru Atlantic Verified untuk admin utama; pengajuan verifikasi pengguna dengan badge oranye setelah disetujui admin.
- Story teks/foto/video dan Catatan yang kedaluwarsa setelah 24 jam.
- Saluran publik dengan fitur gabung dan posting teks.
- Panggilan audio dan video langsung satu-lawan-satu berbasis WebRTC, termasuk terima/tolak, mute mikrofon, kontrol kamera, dan akhiri panggilan.
- Dashboard Admin dengan ringkasan pengguna, chat pribadi, grup, riwayat panggilan, antrean verifikasi, dan daftar pengguna terbaru.
- Navigasi bawah Liquid Glass, tema, font, warna aksen, dan animasi UI.

BATASAN YANG MASIH ADA
======================
- Story mendukung foto/video hingga 20 MB per file (JPG, PNG, WebP, GIF, MP4, WebM); media disimpan privat dan URL akses berakhir mengikuti masa aktif Story.
- Chat belum mendukung kirim gambar atau file.
- Panggilan grup belum tersedia.
- Koneksi panggilan memakai STUN publik; sebagian jaringan/NAT mungkin memerlukan server TURN agar koneksi lebih andal.
- Push notification belum tersedia.
- Enkripsi end-to-end belum diimplementasikan.
- Moderation dashboard lanjutan belum tersedia.

Catatan: daftar di atas menjelaskan fitur yang sudah dibuat di source code.
Fitur tetap perlu diuji di browser setelah deployment sebelum dianggap siap produksi.


ATLANTIC COMMUNITY MIGRATION
============================
Jalankan SQL secara utuh dari file supabase/migrations/202611120001_community_features.sql melalui Supabase Dashboard > SQL Editor sebelum memakai Story, Catatan, Saluran, dan riwayat undangan panggilan. Migrasi ini hanya menambah tabel baru dan policy RLS; tidak menghapus atau mengubah tabel chat lama.

Catatan: panggilan langsung memerlukan izin mikrofon/kamera dan koneksi HTTPS. Sediakan konfigurasi TURN sebelum penggunaan skala luas agar koneksi antarjaringan lebih andal.


ATLANTIC SAVED MESSAGES
=======================
- Pengguna dapat menyimpan dan menghapus pesan dari daftar Pesan Tersimpan.
- Pesan tersimpan bersifat pribadi per akun dan dapat dibuka kembali langsung ke percakapan asal.
- Tabel saved_messages dilindungi RLS; hanya pemilik yang dapat membaca, menyimpan, atau menghapus bookmark untuk pesan di percakapan yang diikutinya.


ATLANTIC GROUP CHAT
===================
- Pengguna dapat membuat grup dengan nama 2–60 karakter dan memilih minimal dua anggota lain.
- Grup mendukung percakapan teks realtime, balasan pesan, status pesan, dan Pesan Tersimpan.
- Nama pengirim ditampilkan pada setiap pesan grup.
- Batas anggota grup saat ini 100 akun termasuk pembuat grup.
- Pembuatan grup memakai RPC terautentikasi; fungsi tidak dapat dijalankan oleh role anon. Penambahan anggota langsung dibatasi kepada pembuat percakapan.
- Panggilan audio/video grup langsung belum tersedia.


ATLANTIC LIVE AUDIO/VIDEO CALLS
===============================
- Panggilan audio/video satu-lawan-satu dari header chat pribadi.
- Penerima mendapat pop-up panggilan masuk dan dapat menerima atau menolak.
- WebRTC mengirim media langsung antarperangkat; Supabase Realtime + tabel atlantic_call_signals hanya digunakan untuk pertukaran SDP/ICE dan status panggilan.
- Tabel sinyal dibatasi RLS untuk dua peserta panggilan; panggilan hanya dapat dibuat oleh anggota percakapan yang sama.
- Kontrol tersedia: mute/unmute mikrofon, kamera on/off, dan akhiri panggilan.
- Saat ini memakai STUN publik. TURN relay belum dikonfigurasi, sehingga beberapa jaringan seluler/Wi-Fi atau NAT ketat dapat membutuhkan konfigurasi TURN tambahan.
- Migrasi database: jalankan berurutan 202611120012_atlantic_realtime_audio_video_calls.sql, 202611120013_atlantic_restrict_initial_call_state.sql, dan 202611120014_atlantic_restrict_call_signal_permissions.sql.


ATLANTIC ADMIN DASHBOARD
========================
- Dashboard hanya ditampilkan kepada admin Atlantic.
- Statistik membaca jumlah pengguna, chat pribadi, grup, riwayat panggilan, dan pengajuan verifikasi yang menunggu.
- Menampilkan hingga 30 akun terbaru dengan pencarian nama/username.
- Kebijakan SELECT admin dibatasi melalui fungsi public.is_atlantic_admin(auth.uid()); pengguna biasa tetap mengikuti RLS masing-masing.
- Dashboard tidak mengambil isi pesan pribadi.
- Migrasi database: 202611120015_atlantic_admin_dashboard_read_access.sql.
