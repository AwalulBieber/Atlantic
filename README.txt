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

BATASAN V1
Belum ada kirim gambar/file, grup, story, voice/video call, push notification,
read receipts, moderation dashboard, maupun verifikasi admin. Fitur-fitur itu
perlu tahap implementasi dan pengujian terpisah.
