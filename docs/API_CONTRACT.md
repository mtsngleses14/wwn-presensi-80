# KONTRAK API — wwn-presensi-80 v1.0.0

Backend: Google Apps Script (backend/Kode.gs). Frontend: React (src/services/gasApi.ts).
Kedua sisi WAJIB memakai kontrak ini. Jika kontrak berubah, ubah kedua sisi + tes ulang.

## Aturan umum
- Transport: GET `?action=<nama>&param=...` untuk baca; POST JSON `{action, ...}` dengan header `Content-Type: text/plain;charset=utf-8` (hindari preflight CORS).
- Envelope respons SELALU: `{success: boolean, message?: string, data?: any, error?: string}`.
- Format tanggal: `dd/mm/yyyy` di semua request & response. Jam: `HH:MM:SS` (24 jam).
- Versi backend: `1.0.0` (action `ping` mengembalikan `version`).

## Sheet (8)
1. `Pengaturan` — [Kunci, Nilai]. Kunci bawaan: namaSekolah, npsn, alamat, telepon, tahunPelajaran, kepalaSekolah, logoUrl, lat, lng, radiusMeter, waAktif, waEndpoint, waApiKey, waTemplateMasuk, waTemplatePulang, waTemplateIzin.
2. `Anggota` — [ID, Nama, Tipe, KelasID, KelasNama, Jabatan, NoWA, NoWAOrtu, ShiftID, StatusAktif]. Tipe: `GURU` | `SISWA`. StatusAktif: `TRUE`/`FALSE`.
3. `Kelas` — [ID, NamaKelas, Tingkat, WaliKelas]
4. `Shift` — [ID, NamaShift, JamMasuk, JamPulang, ToleransiMenit, HariAktif, Keterangan]. JamMasuk/JamPulang format `HH:MM`. HariAktif: daftar angka 1–7 dipisah koma (1=Senin … 7=Minggu), mis. `1,2,3,4,5,6`.
5. `Presensi` — [ID, Tanggal, AnggotaID, Nama, Tipe, KelasNama, JamMasuk, JamPulang, LatMasuk, LngMasuk, LatPulang, LngPulang, StatusMasuk, FotoMasukUrl, FotoPulangUrl, Keterangan, DibuatPada]. StatusMasuk: `HADIR` | `TERLAMBAT`.
6. `Izin` — [ID, Tanggal, AnggotaID, Nama, Tipe, KelasNama, Jenis, Keterangan, Status, DiajukanOleh, DisetujuiOleh, WaktuPengajuan]. Jenis: `Sakit` | `Izin` | `Keperluan`. Status: `MENUNGGU` | `DISETUJUI` | `DITOLAK`.
7. `Pengguna` — [Username, Nama, Peran, Password, StatusAktif]. Peran: `admin` | `operator`. Seed: admin/admin123 (admin), operator/operator123 (operator).
8. `HariLibur` — [Tanggal, Keterangan]

## Action
| Action | Method | Request | Response data |
|---|---|---|---|
| `ping` | GET | — | `{version}` |
| `getAllData` | GET | — | `{pengaturan, anggota, kelas, shift, izin, pengguna (tanpa password), hariLibur}` |
| `initDatabase` | POST | — | `{sheets: [...]}` |
| `login` | POST | `{username, password}` | `{user: {username, nama, peran}}` |
| `saveSettings` | POST | `{pengaturan: {...}}` | `{pengaturan}` |
| `uploadLogo` | POST | `{fileName, base64Data, mimeType}` | `{fileId, url}` |
| `saveAnggota` / `deleteAnggota` | POST | `{item}` / `{id}` | `{item}` / — |
| `saveKelas` / `deleteKelas` | POST | `{item}` / `{id}` | `{item}` / — |
| `saveShift` / `deleteShift` | POST | `{item}` / `{id}` | `{item}` / — |
| `saveHariLibur` / `deleteHariLibur` | POST | `{item:{tanggal,keterangan}}` / `{id(tanggal)}` | `{item}` / — |
| `savePengguna` / `deletePengguna` | POST | `{item}` / `{username}` | `{item tanpa password}` / — |
| `importAnggota` | POST | `{rows: [{nama, tipe, kelasNama?, jabatan?, noWA?, noWAOrtu?, shiftNama?}]}` | `{inserted, updated, errors: [{baris, pesan}]}` |
| `checkIn` | POST | `{anggotaId, tanggal, jam, lat, lng, fotoBase64, fileName}` | `{record, statusMasuk, waTerkirim}` |
| `checkOut` | POST | `{anggotaId, tanggal, jam, lat, lng, fotoBase64, fileName}` | `{record, waTerkirim}` |
| `ajukanIzin` | POST | `{item: {tanggal, anggotaId, jenis, keterangan, diajukanOleh}}` | `{item}` |
| `putuskanIzin` | POST | `{id, keputusan: DISETUJUI\|DITOLAK, oleh}` | `{item, waTerkirim}` |
| `getIzin` | GET | `?status=MENUNGGU` (opsional) | `{items: [...]}` |
| `getPresensi` | GET | `?tanggalDari&?tanggalSampai&?tipe&?kelasNama&?anggotaId` | `{items: [...]}` |
| `getDashboard` | GET | `?tanggal=dd/mm/yyyy` | `{tanggal, guru: {hadir, terlambat, izin, belumAbsen, total}, siswa: {...}, terlambat: [...]}` |
| `getRekap` | GET | `?bulan=mm/yyyy&tipe=GURU\|SISWA` | `{bulan, rows: [{anggotaId, nama, tipe, kelasNama, hadir, terlambat, izin, alpa, hariEfektif}]}` |
| `kirimWA` | POST | `{to, template, params: {nama, tanggal, jam, status?, jenis?, keputusan?}}` | `{terkirim: boolean, pesan}` |

## Aturan bisnis backend (checkIn/checkOut)
- Tolak jika anggota tidak ada / tidak aktif → `success:false`.
- Tolak jika tanggal = hari libur (ada di HariLibur) → pesan jelas.
- Shift acuan: ShiftID anggota; jika kosong → shift pertama. Hari kerja shift mengikuti HariAktif; jika tanggal bukan hari aktif → tolak ("di luar jadwal shift").
- Jendela masuk: dari (JamMasuk − 120 menit) sampai JamPulang. Di luar itu → tolak.
- Status: `TERLAMBAT` jika jam > JamMasuk + ToleransiMenit, selain itu `HADIR`.
- Radius: jika pengaturan lat/lng/radiusMeter terisi (>0) → hitung haversine; jika jarak > radius → tolak dengan pesan memuat jarak. Jika belum dikonfigurasi → lewati validasi (tetap simpan).
- Duplikat: satu anggota hanya 1 checkIn per tanggal; checkOut hanya jika sudah checkIn dan belum checkOut.
- Foto: base64 (tanpa prefix data:) maks ~1,5 MB; simpan ke Drive folder `PresensiSekolah_Files/Presensi/YYYY-MM`, nama `MASUK_<id>_<yyyymmdd>_<hhmmss>.jpg`; URL publik `https://lh3.googleusercontent.com/d/<fileId>`; folder+file sharing ANYONE_WITH_LINK/VIEW.
- WA: setelah checkIn/checkOut/putuskanIzin, panggil pengirim internal (best-effort, tidak pernah menggagalkan aksi utama). Penerima: SISWA → NoWAOrtu, GURU → NoWA.

## Template WA bawaan (bisa diubah di Pengaturan)
- Masuk: `Assalamu'alaikum, {nama} telah presensi MASUK pada {tanggal} pukul {jam} ({status}).`
- Pulang: `Assalamu'alaikum, {nama} telah presensi PULANG pada {tanggal} pukul {jam}.`
- Izin: `Assalamu'alaikum, pengajuan izin {nama} pada {tanggal} ({jenis}) telah {keputusan}.`
- `kirimWA`: jika `waAktif` ≠ `true` atau endpoint/key kosong → `{success:true, terkirim:false, pesan:'WA belum dikonfigurasi — dilewati.'}` TANPA request jaringan. Jika terkonfigurasi → POST via UrlFetchApp, tangkap error → `{success:true, terkirim:false, pesan:'Gagal: ...'}` (tidak pernah `success:false` karena config).
