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
- Riwayat undangan panggilan audio/video (bukan panggilan langsung).
- Navigasi bawah Liquid Glass, tema, font, warna aksen, dan animasi UI.

BATASAN YANG MASIH ADA
======================
- Story mendukung foto/video hingga 20 MB per file (JPG, PNG, WebP, GIF, MP4, WebM); media disimpan privat dan URL akses berakhir mengikuti masa aktif Story.
- Chat belum mendukung kirim gambar atau file.
- Grup chat belum tersedia.
- Audio/video call langsung belum tersedia; menu Panggilan hanya menyimpan undangan dan riwayat.
- Push notification belum tersedia.
- Enkripsi end-to-end belum diimplementasikan.
- Moderation dashboard lanjutan belum tersedia.

Catatan: daftar di atas menjelaskan fitur yang sudah dibuat di source code.
Fitur tetap perlu diuji di browser setelah deployment sebelum dianggap siap produksi.


ATLANTIC COMMUNITY MIGRATION
============================
Jalankan SQL secara utuh dari file supabase/migrations/202611120001_community_features.sql melalui Supabase Dashboard > SQL Editor sebelum memakai Story, Catatan, Saluran, dan riwayat undangan panggilan. Migrasi ini hanya menambah tabel baru dan policy RLS; tidak menghapus atau mengubah tabel chat lama.

Catatan: menu Panggilan pada versi ini menyimpan riwayat/undangan. Audio/video real-time belum aktif dan tidak ditampilkan sebagai fitur yang sudah tersedia.


ATLANTIC SAVED MESSAGES
=======================
- Pengguna dapat menyimpan dan menghapus pesan dari daftar Pesan Tersimpan.
- Pesan tersimpan bersifat pribadi per akun dan dapat dibuka kembali langsung ke percakapan asal.
- Tabel saved_messages dilindungi RLS; hanya pemilik yang dapat membaca, menyimpan, atau menghapus bookmark untuk pesan di percakapan yang diikutinya.
