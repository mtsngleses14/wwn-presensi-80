# ⏱️ Presensi Sekolah Digital (wwn-presensi-80)

Aplikasi web presensi guru/karyawan & siswa dengan **GPS + foto**, jadwal shift,
pengajuan izin, laporan & rekap, dan **notifikasi WhatsApp otomatis**.

**Cara kerja:** aplikasi ini (frontend) menyimpan semua data ke **Google Spreadsheet**
milik sekolah sendiri lewat **Google Apps Script** (backend). Foto presensi & logo
disimpan di **Google Drive**. Tidak ada Firebase, tidak ada server lain.

---

## Bagian 1 — Siapkan Backend (Google Spreadsheet + Apps Script)

Lakukan sekali untuk setiap sekolah. Setiap sekolah **wajib punya spreadsheet &
Apps Script sendiri** (datanya tidak boleh campur).

### Langkah 1: Buat spreadsheet baru
1. Buka [Google Drive](https://drive.google.com) → **Baru → Google Spreadsheet**.
2. Beri nama, mis. `Database Presensi MTs Al Islam Ngleses`.

### Langkah 2: Paste kode backend
1. Di spreadsheet, klik menu **Extensions → Apps Script** (Ekstensi → Apps Script).
2. **Hapus SELURUH isi editor** yang ada (blok semua → hapus). Ini penting! Kode yang
   tertinggal bisa bikin error aneh.
3. Buka file `backend/Kode.gs` dari repo ini (di GitHub: klik file → tombol copy).
4. Paste ke editor Apps Script → klik **Save** (ikon disket). Beri nama project,
   mis. `Backend Presensi`.

### Langkah 3: Atur appsscript.json (izin Drive)
Backend menyimpan foto & logo ke Google Drive, jadi butuh izin penuh:
1. Di editor Apps Script, klik ikon ⚙️ **Project Settings** (kiri bawah).
2. Centang **"Show appsscript.json manifest file in editor"**.
3. Kembali ke editor, buka file `appsscript.json`, ganti isinya dengan file
   `backend/appsscript.json` dari repo ini (sudah berisi scope spreadsheets + drive).
4. Save.

### Langkah 4: Otorisasi (wajib, hanya sekali)
1. Di editor, pilih fungsi **`authorizeDriveAccess`** di dropdown atas → klik **Run**.
2. Google akan meminta izin → klik akun Anda → **Advanced/Lanjutkan** → **Allow/Izinkan**.
3. Jika muncul error scope, buka [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
   cabut izin project Apps Script ini, lalu ulangi Run.

### Langkah 5: Deploy sebagai Web App
1. Klik **Deploy → New deployment** (bukan "Manage deployments" kalau ini pertama kali).
2. Pilih tipe **Web app**.
3. **Execute as:** Me (saya).
4. **Who has access:** Anyone (siapa pun). ← penting, kalau tidak aplikasi tidak bisa akses.
5. Klik **Deploy** → **salin URL yang diakhiri `/exec`**. Simpan baik-baik.

> ⚠️ Setiap kali kode backend diubah: **Deploy → Manage deployments → ✏️ → New version**
> (bukan "New deployment"). Pastikan nomor versi berubah, kalau tidak kode lama yang jalan.

### Langkah 6: Inisialisasi database dari aplikasi
1. Buka aplikasi web (lihat Bagian 3), login sebagai admin.
2. Menu **Konfigurasi** → paste URL `/exec` → **Simpan URL** → **Uji Koneksi**
   (harus muncul ✅ Terhubung).
3. Klik **Inisialisasi 8 Sheet** → 8 sheet (Pengaturan, Anggota, Kelas, Shift,
   Presensi, Izin, Pengguna, HariLibur) dibuat otomatis beserta akun bawaan:
   - `admin` / `admin123` (peran admin)
   - `operator` / `operator123` (peran operator)
4. **Segera ganti password bawaan** di menu Kelola Data → Pengguna.

---

## Bagian 2 — Upload Kode ke GitHub (lewat web)

1. Buat repository baru di GitHub (mis. `wwn-presensi-80`), **jangan** centang "Add README".
2. Di halaman repo, klik **Add file → Upload files**.
3. Di komputer, buka folder project ini, **pilih SEMUA folder & file**:
   `src`, `public`, `backend`, `test`, `docs`, `package.json`, `package-lock.json`
   (+ `index.html`, `vite.config.ts`, `tsconfig.json`, `vercel.json`, `README.md`).
4. Drag & drop semuanya ke halaman upload GitHub → **Commit changes**.

> ⚠️ **Pelajaran dari pengalaman:** deploy pernah GAGAL total hanya karena folder `src`
> tidak ikut ter-upload (cuma file-file lepas yang masuk). Setelah upload, **buka repo
> di browser dan pastikan pohon foldernya lengkap** (ada `src/main.tsx`, `src/App.tsx`,
> dst.) sebelum menganggap selesai. Kalau ada dependensi baru, pastikan
> `package.json` **dan** `package-lock.json` ikut ter-upload.

## Bagian 3 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New → Project** → Import repository tadi.
2. Biarkan semua setting default → **Deploy**.
3. Tunggu sampai status **Ready** → buka URL-nya (mis. `wwn-presensi-80.vercel.app`).
4. Daftarkan URL backend sekolah: admin login → menu **Konfigurasi** → paste URL `/exec`
   per sekolah. Atau isi permanen di `public/schools.json` (lihat Bagian 4) lalu push ulang.

> Catatan: URL backend juga bisa di-override per perangkat (tersimpan di browser),
> tapi mengisinya di `schools.json` lebih rapi — tidak perlu setting ulang di tiap HP.

## Bagian 4 — Daftarkan Sekolah (multi-sekolah)

Satu aplikasi bisa melayani banyak sekolah. Daftarnya ada di `public/schools.json`:

```json
[
  { "id": "mts-al-islam-ngleses", "nama": "MTs AL ISLAM NGLESES", "kota": "Juwangi, Boyolali", "apiUrl": "https://script.google.com/macros/s/.../exec" }
]
```

- `apiUrl` diisi URL `/exec` backend sekolah tersebut (kosongkan `""` kalau belum ada —
  nanti bisa diisi manual lewat menu Konfigurasi).
- Tambah sekolah = tambah satu baris objek → commit → push → Vercel deploy otomatis.
- Akses langsung ke sekolah: `https://alamat-aplikasi/?school=mts-al-islam-ngleses`
  (URL asli Apps Script tidak tampil di address bar).

---

## Menu & Peran

| Menu | Admin | Operator |
|---|---|---|
| Beranda (dashboard) | ✅ | ✅ |
| Presensi (GPS + foto) | ✅ | ✅ |
| Izin (pengajuan) | ✅ | ✅ |
| Laporan & Rekap | ✅ | ✅ |
| Kelola Data (anggota/kelas/shift/libur) | ✅ | ✅ |
| Kelola Data → Pengguna | ✅ | ❌ |
| Pengaturan (lokasi, WA, logo) | ✅ | ❌ |
| Konfigurasi (URL backend, init DB) | ✅ | ❌ |
| Setujui/Tolak izin | ✅ | ❌ |

**Alur presensi:** pilih Guru/Siswa → cari & pilih nama → tombol **Presensi Masuk** /
**Presensi Pulang** → izinkan GPS → ambil foto → kirim. Backend menolak otomatis jika
di luar radius lokasi, di luar jam shift, atau pada hari libur. Status TERLAMBAT
dihitung dari jam masuk + toleransi shift.

**Notifikasi WA:** diatur di Pengaturan → Notifikasi WhatsApp (endpoint + API key
gateway milik Anda, mis. WAPrioritas). Untuk siswa, pesan dikirim ke **No. WA orang tua**.
Selama belum dikonfigurasi, notifikasi dilewati otomatis tanpa error.

---

## Pengembangan lokal

```bash
npm install
npm run dev     # jalankan lokal di http://localhost:3000
npm run lint    # cek TypeScript (harus 0 error)
npm run build   # build produksi (harus sukses)
```

Kode **wajib lolos** `npm run lint` dan `npm run build` sebelum di-push ke GitHub.
