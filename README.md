# Masjid Management System

Sistem manajemen masjid berbasis **Google Apps Script + Google Spreadsheet** (tanpa PHP/Laravel/MySQL/Node.js backend). Mencakup administrasi masjid, keuangan (pemasukan/pengeluaran/transparansi), pengumuman, agenda, jadwal shalat & imam/khatib, jamaah, inventaris, donasi, program sosial, dan **Digital Signage** untuk TV/monitor masjid.

Seluruh source code ada di folder [`gas-app/`](gas-app) dan siap di-copy langsung ke Google Apps Script.

---

## 1. Arsitektur

```
Browser (Admin / Publik / TV Display)
        │  fetch() ke Web App URL (?action=... untuk API, ?page=... untuk halaman)
        ▼
Google Apps Script Web App  (doGet / doPost di Code.gs)
        │  getSheet() / getAll() / insert() / update() / remove()  (Database.gs)
        ▼
Google Spreadsheet  (20 sheet = 20 "tabel")
        │  (opsional, untuk dokumen/lampiran)
        ▼
Google Drive
```

- **Tidak ada WebSocket / realtime server-push.** Semua update di sisi client memakai *polling* berkala (default 30 detik) + jam lokal yang disinkronkan lewat *server time offset* agar detik pada jam & countdown tetap presisi di antara polling. Ini keterbatasan platform Google Apps Script, bukan bug.
- Autentikasi berbasis token: `login` menghasilkan token yang disimpan di `localStorage`/`sessionStorage` browser dan divalidasi ulang di server pada **setiap** pemanggilan API (role juga divalidasi di server, tidak pernah dipercaya dari frontend).
- Apps Script Web App tidak mengekspos header HTTP kustom ke `doGet`/`doPost`, sehingga token dikirim sebagai parameter (query string untuk GET, body JSON untuk POST) — bukan `Authorization` header. Selalu diakses lewat HTTPS bawaan Google.

## 2. Struktur File (folder `gas-app/`)

| Jenis | File | Isi |
|---|---|---|
| Backend | `Config.gs` | Konstanta, nama sheet, role & permission matrix, kategori default |
| Backend | `Utils.gs` | Response builder, hashing password, format Rupiah/tanggal, validasi |
| Backend | `Database.gs` | Helper generik: `getSheet/getAll/findById/insert/update/remove/generateId/getSetting/setSetting` |
| Backend | `Auth.gs` | Login, session/token, permission checking |
| Backend | `User.gs` | CRUD Users & Roles |
| Backend | `Audit.gs` | Pencatatan & query audit log |
| Backend | `Finance.gs` | Pemasukan, pengeluaran, kategori, sumber dana, dashboard, laporan, transparansi |
| Backend | `Announcement.gs` | CRUD pengumuman + publish/unpublish/pin |
| Backend | `Event.gs` | CRUD agenda + upcoming/ongoing |
| Backend | `Prayer.gs` | PrayerService (abstraksi provider API + cache), HijriService, jadwal imam/khatib |
| Backend | `Display.gs` | Display settings, playlist, heartbeat/monitoring, emergency, bundle data untuk TV |
| Backend | `Inventory.gs` / `Jamaah.gs` / `Donation.gs` / `SocialProgram.gs` / `Documents.gs` | Modul masing-masing |
| Backend | `Setup.gs` | `setupDatabase()`, `seedDemoData()`, `backupDatabase()` |
| Backend | `Code.gs` | `doGet`/`doPost`, routing action → handler, `include()` untuk HTML |
| Frontend | `Login.html`, `AdminApp.html`, `Display.html`, `Public.html`, `SetupWizard.html` | Halaman utama |
| Frontend | `css_*.html` | Partial CSS (variables, admin, display/TV, public) |
| Frontend | `js_utils.html`, `js_api.html`, `js_auth.html`, `js_charts.html`, `js_crud.html` | Helper JS inti (format, fetch wrapper, sesi, Chart.js, generic CRUD table+form) |
| Frontend | `js_app.html` | Shell admin: sidebar, topbar, router, Dashboard |
| Frontend | `js_finance.html`, `js_content.html`, `js_prayer_admin.html`, `js_assets.html`, `js_donation_admin.html`, `js_display_admin.html`, `js_system_admin.html` | Halaman per-modul admin |
| Frontend | `js_display_engine.html` | **DisplayEngine** — state machine Digital Signage |
| Frontend | `js_public.html` | Renderer tiap view di website publik |

> Google Apps Script tidak mendukung sub-folder di editornya — semua file di atas memang flat (satu level), sesuai batasan platform. CSS/JS disisipkan sebagai partial `.html` dan digabungkan lewat `include()`.

## 3. Struktur Google Spreadsheet (20 sheet)

`settings, users, roles, announcements, events, prayer_schedules, imam_schedules, income, expenses, fund_sources, finance_categories, donations, campaigns, inventory, jamaah, social_programs, documents, display_settings, display_schedules, audit_logs` — ditambah `sessions` untuk token login.

Setiap baris memiliki **ID unik** berformat `PREFIX-00001` (mis. `USR-00001`, `INC-00001`), **bukan** nomor baris. Header & sheet dibuat otomatis oleh `setupDatabase()` — lihat definisi lengkap kolom di `Database.gs` (`SHEET_HEADERS`).

## 4. Instalasi & Deployment

1. Buka [sheets.google.com](https://sheets.google.com) → buat Spreadsheet baru, beri nama misalnya "Masjid Management System - Database".
2. Di dalam Spreadsheet: **Extensions → Apps Script**. Ini membuat *bound script* yang otomatis terhubung ke Spreadsheet tadi (tidak perlu setting Spreadsheet ID secara manual).
3. Hapus isi `Code.gs` default, lalu buat semua file `.gs` dan `.html` yang ada di folder `gas-app/` satu per satu di editor Apps Script (Add file → Script / HTML), copy-paste isinya persis dari repo ini. **Nama file harus sama persis** (tanpa ekstensi `.gs`/`.html` saat membuat file baru — Apps Script menambahkannya otomatis).
4. (Opsional, hanya jika ingin menjalankan sebagai *standalone script* terpisah dari Spreadsheet) Jalankan fungsi `setupScriptProperties('SPREADSHEET_ID_ANDA', 'secret-key-acak')` sekali dari editor.
5. Jalankan fungsi `setupDatabase()` dari editor (pilih fungsi di dropdown toolbar → Run). Ini membuat seluruh 20 sheet + header + data referensi default (roles, sumber dana, kategori, settings, akun `admin`/`admin123`).
6. Jalankan fungsi `seedDemoData()` agar dashboard tidak kosong (pengumuman, agenda, transaksi, dsb contoh).
7. **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (agar halaman publik & TV bisa diakses tanpa login Google) — sesuaikan kebijakan masjid Anda.
8. Salin **Web app URL** yang diberikan. URL ini otomatis dipakai oleh seluruh halaman (`webAppUrl` disuntikkan server-side, tidak perlu di-hardcode di frontend).
9. Buka Web App URL → akan tampil halaman publik. Tambahkan `?page=login` untuk login admin.
10. Login dengan **admin / admin123** (Super Admin) lalu **segera ganti password** lewat menu profil, dan buat akun bendahara/operator sesuai kebutuhan lewat menu **Users**.
11. (Opsional) Buka menu profil → **Setup Wizard** untuk melengkapi profil masjid, lokasi, dan konfigurasi display secara terpandu.

### Redeploy setelah update kode
Setiap kali mengubah source code, buat **New deployment** baru (atau gunakan "Manage deployments → Edit → New version") agar perubahan berlaku di Web App URL yang sama.

## 5. Role & Hak Akses

| Role | Akses |
|---|---|
| `SUPER_ADMIN` | Seluruh sistem |
| `ADMIN` | Dashboard, Pengumuman, Agenda, Jadwal, Display, Inventaris, Jamaah, Program Sosial, Dokumentasi, Settings |
| `TREASURER` (Bendahara) | Dashboard, Pemasukan, Pengeluaran, Transaksi, Kategori, Sumber Dana, Laporan, Donasi |
| `OPERATOR` | Dashboard, Pengumuman, Agenda, Jadwal Imam, Display |

Permission **selalu divalidasi di server** (`requirePermission_()` di `Auth.gs`), bukan hanya disembunyikan di frontend — frontend hanya menyembunyikan menu agar UX rapi.

Akun demo setelah `seedDemoData()`:
- `admin` / `admin123` (Super Admin)
- `bendahara` / `bendahara123` (Treasurer)

## 6. Kontrak API

```
GET  {WebAppURL}?action=NAMA_ACTION&param1=...&token=...
     -> { "success": true|false, "message": "...", "data": {...} }

POST {WebAppURL}   body JSON: { "action": "...", "token": "...", "id": "...", "data": {...} }
     -> { "success": true|false, "message": "...", "data": {...} }
```

Daftar lengkap action ada di `routeGet_()` dan `routePost_()` pada `Code.gs` (mis. `getDashboardSummary`, `getFinanceDashboard`, `createIncome`, `getDisplayBundle`, `displayHeartbeat`, dst).

Frontend memanggilnya lewat helper `apiGet(action, params)` / `apiPost(action, payload)` di `js_api.html` (memakai `fetch`, dengan `Content-Type: text/plain` pada POST agar Apps Script tidak memicu CORS preflight yang tidak didukungnya).

## 7. Setup Halaman Display / TV Masjid

1. Buka `{WebAppURL}?page=display` di browser TV/monitor (Chrome/Edge pada Android TV box, mini PC, atau Smart TV browser).
2. Tambahkan `&mode=tv` untuk mode kiosk (sembunyikan kursor, klik pertama memicu fullscreen — browser tidak mengizinkan auto-fullscreen tanpa interaksi pengguna).
3. Tidak perlu login. Halaman ini memanggil endpoint publik (`getDisplayBundle`) yang sudah menggabungkan jam server, jadwal shalat, agenda, pengumuman, campaign donasi, dan status darurat dalam satu request agar hemat kuota Apps Script.
4. **DisplayEngine** (`js_display_engine.html`) menentukan mode aktif berdasarkan prioritas tetap:

   `EMERGENCY > PRAYER > JUMAT > EVENT > ANNOUNCEMENT > COUNTDOWN > NORMAL`

   - **NORMAL**: slideshow otomatis (jam, pengumuman, agenda, donasi, info masjid), durasi diatur di Display Settings.
   - **COUNTDOWN**: aktif otomatis N menit sebelum waktu shalat berikutnya (`countdown_trigger_minutes`).
   - **PRAYER**: aktif tepat saat masuk waktu shalat selama durasi tertentu (`prayer_mode_duration_minutes`).
   - **JUMAT**: khusus hari Jumat menjelang & saat Dzuhur, menampilkan data dari `imam_schedules`.
   - **EVENT**: otomatis saat ada agenda `is_display=true` yang sedang berlangsung.
   - **ANNOUNCEMENT**: menyisipkan pengumuman prioritas tinggi secara periodik tanpa memblokir rotasi normal selamanya.
   - **EMERGENCY**: diaktifkan manual oleh admin dari menu **Digital Signage**, mengalahkan semua mode lain sampai dinonaktifkan.
5. Jam & countdown berjalan **lokal per detik** (tidak bergantung request jaringan), disinkronkan ke waktu server tiap polling (default 30 detik) lewat `serverTimeOffset` agar tidak melenceng dari jam server.
6. Jika koneksi terputus, TV tetap menampilkan data terakhir dari `localStorage` dengan indikator kecil "Offline — menggunakan data terakhir", dan otomatis sinkron ulang saat koneksi pulih.
7. Admin dapat memonitor status TV (ONLINE/OFFLINE, mode aktif, shalat berikutnya) dari menu **Digital Signage** di panel admin — status berasal dari *heartbeat* yang dikirim halaman Display setiap 30 detik.

## 8. Keamanan

- Password di-hash (SHA-256 + salt acak + secret key dari Script Properties), **tidak pernah** disimpan plaintext.
- Semua mutation (create/update/delete) divalidasi ulang di server: field wajib, tipe data, enum, nominal > 0, role/permission — frontend tidak pernah dipercaya.
- Audit log mencatat login, logout, create, update, delete, publish, unpublish, setting_change, display_change.
- Error internal tidak menampilkan stack trace ke user (`safeExecute_()` di `Utils.gs`), hanya pesan generik; detail dicatat lewat `Logger.log` (Stackdriver).
- Halaman transparansi publik hanya menampilkan transaksi bertanda `is_public = true` dan tidak pernah menampilkan username/ID user/nomor HP/audit log.
- `SPREADSHEET_ID` dan `SECRET_KEY` (untuk mode standalone script) disimpan di **Script Properties**, bukan hardcode di source/frontend.

## 9. Backup

Jalankan fungsi `backupDatabase()` dari editor Apps Script (atau buat *time-driven trigger* agar berjalan otomatis harian/mingguan lewat menu **Triggers** di Apps Script). Fungsi ini membuat salinan (copy) penuh Spreadsheet database ke Google Drive dengan nama `Backup - <nama> - <tanggal jam>`.

## 10. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `SPREADSHEET_ID belum dikonfigurasi` | Menjalankan sebagai standalone script tanpa Script Properties | Jalankan `setupScriptProperties('ID_SPREADSHEET', 'secret')`, atau gunakan bound script (Extensions → Apps Script dari dalam Spreadsheet) |
| Semua request API gagal / CORS error | POST dikirim dengan `Content-Type: application/json` | Pastikan `js_api.html` tetap memakai `text/plain` pada body POST (sudah default di project ini) |
| Dashboard kosong setelah instal | Belum menjalankan `seedDemoData()` | Jalankan dari editor Apps Script |
| Login gagal padahal password benar | Sheet `users`/`roles` belum ter-seed | Jalankan `setupDatabase()` lalu `seedDemoData()` |
| Layar TV blank / stuck loading | Web App belum di-deploy ulang setelah update kode | Buat deployment/version baru |
| Jadwal shalat kosong | API eksternal (Aladhan) tidak dapat diakses dari region Apps Script | Isi jadwal manual lewat menu **Jadwal Shalat** (koreksi manual tersimpan permanen di sheet `prayer_schedules`) |

## 11. Keterbatasan yang Disengaja

- Bukan realtime WebSocket — memakai polling + jam lokal (lihat bagian Arsitektur).
- Token otorisasi dikirim sebagai parameter, bukan header, karena batasan `doGet`/`doPost` Apps Script.
- Upload dokumen dibatasi oleh batas eksekusi Apps Script (± ukuran wajar, bukan untuk file sangat besar).
# Sistem-Managemen-Masjid
