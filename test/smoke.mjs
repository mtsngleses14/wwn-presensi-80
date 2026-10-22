// Smoke test backend Kode.gs (wwn-presensi-80) dengan stub Google Apps Script.
// Menjalankan Kode.gs ASLI di dalam vm Node dan menguji SEMUA action:
// initDatabase, ping, getAllData, settings, CRUD anggota/kelas/shift/hariLibur/pengguna,
// login, importAnggota, checkIn/checkOut + aturan bisnis, izin, WA, dashboard, rekap,
// getPresensi, uploadLogo, kirimWA.
// Jalankan: node test/smoke.mjs   (exit 0 = semua lolos)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'backend', 'Kode.gs'), 'utf8');

// ---------- Stub Spreadsheet ----------
function makeSheet(name, headers) {
  const grid = [headers.slice()]; // baris 0 = header
  return {
    _name: name,
    getName() { return this._name; },
    setFrozenRows() {},
    getLastRow() { return grid.length; },
    getLastColumn() { return grid[0].length; },
    getSheetValues() { return grid; },
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      function ensure(rr, cc) {
        while (grid.length < rr) grid.push(new Array(grid[0].length).fill(''));
        for (const row of grid) while (row.length < cc) row.push('');
      }
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) {
              const gr = grid[r - 1 + i];
              row.push(gr ? (gr[c - 1 + j] ?? '') : '');
            }
            out.push(row);
          }
          return out;
        },
        getValue() { return this.getValues()[0][0]; },
        setValues(vals) {
          for (let i = 0; i < vals.length; i++)
            for (let j = 0; j < vals[i].length; j++) {
              ensure(r + i, c + j);
              grid[r - 1 + i][c - 1 + j] = vals[i][j];
            }
        },
        setValue(v) { this.setValues([[v]]); },
      };
    },
    appendRow(row) {
      const h = grid[0].length;
      const full = row.slice(0, h);
      while (full.length < h) full.push('');
      grid.push(full);
    },
    deleteRow(n) {
      if (n < 1 || n > grid.length) throw new Error('Row out of range: ' + n);
      grid.splice(n - 1, 1);
    },
  };
}

const sheets = new Map();
const SpreadsheetApp = {
  getActiveSpreadsheet() {
    return {
      getName() { return 'DB TEST PRESENSI'; },
      getSheetByName(n) { return sheets.get(n) || null; },
      insertSheet(n) {
        const s = makeSheet(n, []);
        sheets.set(n, s);
        return s;
      },
    };
  },
};

const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(text) {
    return {
      _t: String(text),
      getContent() { return this._t; },
      setMimeType() { return this; },
    };
  },
};

const Utilities = {
  getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },
  formatDate(d, _tz, fmt) {
    const p = (n) => String(n).padStart(2, '0');
    if (fmt === 'yyyy-MM-dd') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return d.toISOString();
  },
  base64Decode: (s) => Buffer.from(s, 'base64'),
  newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
};
const Session = { getScriptTimeZone: () => 'Asia/Jakarta' };

// ---------- Stub DriveApp (folder bertingkat + file) ----------
function makeFolder(name) {
  const subs = {};
  const files = [];
  return {
    _name: name, _subs: subs, _files: files,
    setSharing() {},
    getFoldersByName(n) {
      const list = subs[n] ? [subs[n]] : [];
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++] };
    },
    createFolder(n) { const f = makeFolder(n); subs[n] = f; return f; },
    createFile(blob) {
      const file = {
        _id: 'file_' + Math.random().toString(36).slice(2, 10),
        _blob: blob,
        getId() { return this._id; },
        setSharing() {},
      };
      files.push(file);
      return file;
    },
  };
}
const DriveApp = {
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' },
  _roots: {},
  getFoldersByName(n) {
    const list = this._roots[n] ? [this._roots[n]] : [];
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  },
  createFolder(n) { const f = makeFolder(n); this._roots[n] = f; return f; },
};

// ---------- Stub UrlFetchApp (mencatat, TIDAK request sungguhan) ----------
const UrlFetchApp = {
  _requests: [],
  _shouldThrow: false,
  fetch(url, opts) {
    if (this._shouldThrow) throw new Error('jaringan bermasalah (simulasi)');
    this._requests.push({ url, opts });
    return { getContentText: () => '{"ok":true}', getResponseCode: () => 200 };
  },
};

// ---------- Jalankan Kode.gs di sandbox ----------
const ctx = vm.createContext({ SpreadsheetApp, ContentService, Utilities, Session, DriveApp, UrlFetchApp, console });
vm.runInContext(src, ctx, { filename: 'Kode.gs' });

// Helper: panggil doPost/doGet lalu parse JSON respons
function post(action, extra = {}) {
  const out = vm.runInContext(
    `doPost({postData:{contents:${JSON.stringify(JSON.stringify({ action, ...extra }))}}})`,
    ctx
  );
  return JSON.parse(out.getContent());
}
function get(action, params = {}) {
  const out = vm.runInContext(
    `doGet({parameter:{action:${JSON.stringify(action)}, ${Object.entries(params).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(',')}}})`,
    ctx
  );
  return JSON.parse(out.getContent());
}

// ---------- Mini test runner ----------
let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; /* console.log(`  ✓ ${label}`); */ }
  else { failed++; console.log(`  ✗ GAGAL: ${label} ${detail}`); }
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label, `(dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)})`);
}

// Foto kecil valid (header PNG, ~1KB setelah base64)
const FOTO_KECIL = Buffer.alloc(800, 7).toString('base64');
const LAT_SEKOLAH = '-7.612345', LNG_SEKOLAH = '110.823456';
const LAT_DEKAT = '-7.612400', LNG_DEKAT = '110.823500';
const LAT_JAUH = '-7.700000', LNG_JAUH = '110.900000';
const T1 = '17/10/2026'; // Sabtu
const T2 = '19/10/2026'; // Senin
const T3 = '20/10/2026'; // Selasa
const T4 = '21/10/2026'; // Rabu

function checkInArgs(anggotaId, tanggal, jam, extra = {}) {
  return {
    anggotaId, tanggal, jam,
    lat: LAT_DEKAT, lng: LNG_DEKAT,
    fotoBase64: FOTO_KECIL, fileName: 'selfie.jpg',
    ...extra,
  };
}

console.log('\n[1] initDatabase');
let r = post('initDatabase');
ok(r.success, 'initDatabase sukses');
ok(sheets.size === 8, '8 sheet dibuat', `(ada ${sheets.size})`);
const hdrPres = sheets.get('Presensi').getSheetValues()[0];
ok(hdrPres[1] === 'Tanggal' && hdrPres[12] === 'StatusMasuk' && hdrPres[16] === 'DibuatPada', 'header Presensi benar');
const hdrIzin = sheets.get('Izin').getSheetValues()[0];
ok(hdrIzin[8] === 'Status' && hdrIzin[11] === 'WaktuPengajuan', 'header Izin benar');
r = get('getAllData');
eq(r.data.pengaturan.namaSekolah, 'MTs AL ISLAM NGLESES', 'seed namaSekolah');
ok(r.data.pengaturan.waTemplateMasuk.includes('{nama}'), 'seed template WA masuk');
eq(r.data.pengguna.length, 2, 'seed 2 pengguna');
eq(r.data.shift.length, 1, 'seed 1 shift default');
eq(r.data.shift[0].namaShift, 'Reguler', 'nama shift default Reguler');
eq(r.data.shift[0].jamMasuk, '07:00', 'jam masuk shift default');
// initDatabase kedua tidak menduplikasi seed
post('initDatabase');
r = get('getAllData');
eq(r.data.pengguna.length, 2, 'seed pengguna tidak duplikat');
eq(r.data.shift.length, 1, 'seed shift tidak duplikat');

console.log('\n[2] ping');
r = get('ping');
ok(r.success && r.version === '1.0.0', 'ping mengembalikan version 1.0.0');
{
  const outDef = vm.runInContext('doGet({parameter:{}})', ctx);
  const rDef = JSON.parse(outDef.getContent());
  ok(rDef.success && rDef.version === '1.0.0', 'doGet tanpa action default ke ping');
}

console.log('\n[3] saveSettings + getAllData');
r = post('saveSettings', { pengaturan: { namaSekolah: 'MTs TEST', lat: LAT_SEKOLAH, lng: LNG_SEKOLAH, radiusMeter: '150', waAktif: 'false' } });
ok(r.success, 'saveSettings sukses');
r = get('getAllData');
eq(r.data.pengaturan.namaSekolah, 'MTs TEST', 'namaSekolah tersimpan');
eq(r.data.pengaturan.lat, LAT_SEKOLAH, 'lat tersimpan');
eq(r.data.pengaturan.radiusMeter, '150', 'radiusMeter tersimpan');
ok(r.data.pengguna.every((u) => !('password' in u) && !('Password' in u)), 'pengguna tanpa password');
eq(Object.keys(r.data).sort(), ['anggota', 'hariLibur', 'izin', 'kelas', 'pengaturan', 'pengguna', 'shift'], 'getAllData memuat 7 kunci kontrak');
ok(Array.isArray(r.data.anggota) && Array.isArray(r.data.hariLibur), 'anggota & hariLibur array');

console.log('\n[4] CRUD Kelas, Shift, Anggota');
r = post('saveKelas', { item: { namaKelas: '7A', tingkat: 'VII', waliKelas: 'Pak Guru' } });
ok(r.success && r.data.item.id.startsWith('KLS-'), 'kelas baru dapat ID KLS-');
const KLS7A = r.data.item.id;
r = post('saveShift', { item: { namaShift: 'Lima Hari', jamMasuk: '7:00', jamPulang: '14:00' } });
ok(!r.success, 'shift jam format salah ditolak');
r = post('saveShift', { item: { namaShift: 'Lima Hari', jamMasuk: '07:00', jamPulang: '14:00', toleransiMenit: 10, hariAktif: '1,2,3,4,5', keterangan: 'Senin-Jumat' } });
ok(r.success, 'shift valid tersimpan');
const SHIFT5 = r.data.item.id;
eq(r.data.item.hariAktif, '1,2,3,4,5', 'hariAktif ternormalisasi');
r = post('saveShift', { item: { id: SHIFT5, namaShift: 'Lima Hari', jamMasuk: '07:30', jamPulang: '14:00', toleransiMenit: 10, hariAktif: '1,2,3,4,5' } });
ok(r.success && get('getAllData').data.shift.length === 2, 'update shift tidak menambah baris');
r = post('deleteShift', { id: SHIFT5 });
ok(r.success, 'hapus shift tak terpakai sukses');

r = post('saveAnggota', { item: { nama: '', tipe: 'GURU' } });
ok(!r.success, 'anggota tanpa nama ditolak');
r = post('saveAnggota', { item: { nama: 'X', tipe: 'DOSEN' } });
ok(!r.success, 'anggota tipe invalid ditolak');
r = post('saveAnggota', { item: { nama: 'Pak Guru', tipe: 'GURU', jabatan: 'Guru Kelas', noWA: '0811', shiftId: 'SHF-REGULER' } });
ok(r.success && r.data.item.id.startsWith('AGT-'), 'anggota guru tersimpan');
const G1 = r.data.item.id;
ok(r.data.item.statusAktif === true, 'statusAktif default true');
r = post('saveAnggota', { item: { nama: 'Bu Guru', tipe: 'GURU', noWA: '0812', shiftId: 'SHF-REGULER', statusAktif: false } });
const G2 = r.data.item.id;
r = post('saveAnggota', { item: { nama: 'Siswa Satu', tipe: 'siswa', kelasId: KLS7A, kelasNama: '7A', noWAOrtu: '0822', shiftId: 'SHF-REGULER' } });
ok(r.success && r.data.item.tipe === 'SISWA', 'tipe lowercase dinormalisasi');
const S1 = r.data.item.id;
r = post('saveAnggota', { item: { nama: 'Siswa Dua', tipe: 'SISWA', kelasId: KLS7A, kelasNama: '7A', noWAOrtu: '0823', shiftId: 'SHF-REGULER' } });
const S2 = r.data.item.id;
// Shift yang dipakai anggota tidak boleh dihapus
r = post('deleteShift', { id: 'SHF-REGULER' });
ok(!r.success && /dipakai/.test(r.error), 'hapus shift yang dipakai anggota ditolak');
r = post('saveShift', { item: { namaShift: 'Lima Hari', jamMasuk: '07:00', jamPulang: '14:00', toleransiMenit: 10, hariAktif: '1,2,3,4,5' } });
const SHIFT5B = r.data.item.id;
r = post('saveAnggota', { item: { nama: 'Siswa Tiga', tipe: 'SISWA', kelasId: KLS7A, kelasNama: '7A', noWAOrtu: '0833', shiftId: SHIFT5B } });
const S3 = r.data.item.id;
r = post('deleteShift', { id: SHIFT5B });
ok(!r.success, 'shift SHIFT5B dipakai S3 → hapus ditolak');
r = post('saveAnggota', { item: { id: S1, nama: 'Siswa Satu', tipe: 'SISWA', kelasId: KLS7A, kelasNama: '7A', noWAOrtu: '0822', shiftId: 'SHF-REGULER', statusAktif: true } });
ok(r.success, 'update anggota sukses');
r = post('deleteAnggota', { id: 'AGT-tidak-ada' });
ok(!r.success, 'hapus anggota tak ada → error');

console.log('\n[5] HariLibur');
r = post('saveHariLibur', { item: { tanggal: '2026-10-19', keterangan: 'Maulid Nabi' } });
ok(r.success && r.data.item.tanggal === '19/10/2026', 'hari libur tersimpan (format dd/mm/yyyy)');
r = post('saveHariLibur', { item: { tanggal: '19/10/2026', keterangan: 'Maulid (revisi)' } });
ok(r.success && get('getAllData').data.hariLibur.length === 1, 'upsert hari libur tidak duplikat');
eq(get('getAllData').data.hariLibur[0].keterangan, 'Maulid (revisi)', 'keterangan libur terupdate');
r = post('saveHariLibur', { item: { tanggal: '31/02/2026' } });
ok(!r.success, 'tanggal libur tidak valid ditolak');

console.log('\n[6] Pengguna & login');
r = post('login', { username: 'admin', password: 'admin123' });
ok(r.success, 'login admin sukses');
eq(r.data.user, { username: 'admin', nama: 'Administrator', peran: 'admin' }, 'user tanpa password, sesuai kontrak');
r = post('login', { username: 'ADMIN', password: 'admin123' });
ok(r.success, 'username case-insensitive');
r = post('login', { username: 'admin', password: 'salah' });
ok(!r.success, 'password salah ditolak');
r = post('login', { username: 'takada', password: 'x' });
ok(!r.success, 'username tak dikenal ditolak');
r = post('login', { username: '', password: '' });
ok(!r.success, 'login kosong ditolak');
r = post('savePengguna', { item: { username: 'operator', nama: 'Operator', peran: 'operator', statusAktif: false } });
ok(r.success, 'nonaktifkan operator (tanpa password = pertahankan)');
r = post('login', { username: 'operator', password: 'operator123' });
ok(!r.success, 'akun nonaktif tidak bisa login');
r = post('savePengguna', { item: { username: 'operator', nama: 'Operator', peran: 'operator', statusAktif: true } });
ok(r.success && post('login', { username: 'operator', password: 'operator123' }).success, 'aktifkan kembali → login sukses');
r = post('savePengguna', { item: { username: 'bendahara', nama: 'Bendahara', peran: 'operator', password: 'b123' } });
ok(r.success && !('password' in r.data.item), 'pengguna baru tanpa password di respons');
r = post('deletePengguna', { username: 'bendahara' });
ok(r.success, 'hapus pengguna sukses');
r = post('deletePengguna', { username: 'bendahara' });
ok(!r.success, 'hapus pengguna tak ada → error');
r = post('deletePengguna', { username: 'admin' });
ok(!r.success, 'hapus satu-satunya admin aktif ditolak');
r = post('savePengguna', { item: { username: 'x', nama: 'X', peran: 'kepsek', password: 'p' } });
ok(!r.success, 'peran invalid ditolak');

console.log('\n[7] checkIn — sukses & aturan bisnis');
r = post('checkIn', checkInArgs(G1, T1, '06:55:00'));
ok(r.success, 'checkIn G1 sukses');
eq(r.data.statusMasuk, 'HADIR', '06:55 (toleransi 15) = HADIR');
ok(r.data.record.fotoMasukUrl.startsWith('https://lh3.googleusercontent.com/d/'), 'URL foto masuk format lh3');
eq(r.data.record.tanggal, T1, 'tanggal record dd/mm/yyyy');
eq(r.data.waTerkirim, false, 'WA belum dikonfigurasi → waTerkirim false');
ok(UrlFetchApp._requests.length === 0, 'tanpa request jaringan saat WA off');
r = post('checkIn', checkInArgs(G1, T1, '06:56:00'));
ok(!r.success, 'checkIn duplikat ditolak');
r = post('checkIn', checkInArgs(S1, T1, '07:20:00'));
ok(r.success, 'checkIn S1 sukses');
eq(r.data.statusMasuk, 'TERLAMBAT', '07:20 (> 07:15) = TERLAMBAT');
ok(r.data.record.keterangan.includes('menit'), 'keterangan keterlambatan terisi');
r = post('checkIn', checkInArgs(S2, T1, '04:30:00'));
ok(!r.success && /jam presensi/i.test(r.error), 'di luar jendela masuk (04:30) ditolak');
r = post('checkIn', checkInArgs(S2, T1, '14:01:00'));
ok(!r.success, 'lewat jam pulang (14:01) ditolak');
r = post('checkIn', checkInArgs(S2, T1, '06:50:00', { lat: LAT_JAUH, lng: LNG_JAUH }));
ok(!r.success && / m dari titik sekolah/.test(r.error), 'di luar radius ditolak (pesan memuat jarak)');
{
  const mJarak = r.error.match(/(\d+) m dari titik sekolah/);
  ok(mJarak && parseInt(mJarak[1], 10) > 1000, 'jarak terhitung wajar (>1000 m)', r.error);
}
r = post('checkIn', checkInArgs(S2, T1, '06:50:00', { fotoBase64: '' }));
ok(!r.success && /foto/i.test(r.error), 'tanpa foto ditolak');
r = post('checkIn', checkInArgs(S2, T1, '06:50:00', { fotoBase64: 'aGVsbG8=', fileName: 'x.txt', mimeType: 'text/plain' }));
ok(!r.success && /gambar/i.test(r.error), 'foto bukan gambar ditolak');
// Foto > 1,5 MB ditolak
ctx.__bigPhoto = 'x'.repeat(2097153);
{
  const out = vm.runInContext(
    `doPost({postData:{contents:JSON.stringify({action:'checkIn',anggotaId:${JSON.stringify(S2)},tanggal:${JSON.stringify(T1)},jam:'06:50:00',lat:${JSON.stringify(LAT_DEKAT)},lng:${JSON.stringify(LNG_DEKAT)},fotoBase64:__bigPhoto,fileName:'f.jpg'})}})`,
    ctx
  );
  const rr = JSON.parse(out.getContent());
  ok(!rr.success && /1,5 MB/.test(rr.error), 'foto > 1,5 MB ditolak');
}
r = post('checkIn', checkInArgs(G2, T1, '06:50:00'));
ok(!r.success && /tidak aktif/.test(r.error), 'anggota nonaktif ditolak');
r = post('checkIn', checkInArgs('AGT-ngawur', T1, '06:50:00'));
ok(!r.success && /tidak ditemukan/.test(r.error), 'anggota tak dikenal ditolak');
r = post('checkIn', checkInArgs(S3, T1, '06:50:00'));
ok(!r.success && /di luar jadwal shift/.test(r.error), 'Sabtu di luar shift Senin-Jumat ditolak');
r = post('checkIn', checkInArgs(G1, T2, '06:50:00'));
ok(!r.success && /hari libur/i.test(r.error), 'checkIn di hari libur ditolak');
r = post('deleteHariLibur', { id: '19/10/2026' });
ok(r.success && get('getAllData').data.hariLibur.length === 0, 'hapus hari libur sukses');
r = post('checkIn', checkInArgs(S2, T1, '25:00:00'));
ok(!r.success && /jam/i.test(r.error), 'format jam invalid ditolak');
r = post('checkIn', checkInArgs(S2, T1, '06:50:00', { tanggal: '17-13-2026' }));
ok(!r.success, 'tanggal invalid ditolak');
// Tanpa konfigurasi GPS → tetap lolos
r = post('saveSettings', { pengaturan: { lat: '', lng: '', radiusMeter: '' } });
ok(r.success, 'kosongkan konfigurasi GPS');
r = post('checkIn', checkInArgs(S2, T1, '06:50:00', { lat: LAT_JAUH, lng: LNG_JAUH }));
ok(r.success && r.data.statusMasuk === 'HADIR', 'tanpa konfigurasi GPS tetap lolos (HADIR)');
r = post('saveSettings', { pengaturan: { lat: LAT_SEKOLAH, lng: LNG_SEKOLAH, radiusMeter: '150' } });
ok(r.success, 'kembalikan konfigurasi GPS');
// Struktur folder Drive foto: PresensiSekolah_Files/Presensi/2026-10
{
  const rootF = DriveApp._roots['PresensiSekolah_Files'];
  const presF = rootF && rootF._subs['Presensi'];
  const blnF = presF && presF._subs['2026-10'];
  ok(!!(blnF && blnF._files.length >= 3), 'folder Presensi/2026-10 berisi file foto');
  const namaFile = blnF._files[0]._blob.name;
  ok(/^MASUK_AGT-[a-z0-9]{8}_20261017_065500\.jpg$/.test(namaFile), 'nama file MASUK_<id>_<yyyymmdd>_<hhmmss>.jpg', namaFile);
}

console.log('\n[8] checkOut');
r = post('checkOut', { anggotaId: G1, tanggal: T1, jam: '13:30:00', lat: LAT_DEKAT, lng: LNG_DEKAT, fotoBase64: FOTO_KECIL, fileName: 'pulang.jpg' });
ok(r.success, 'checkOut G1 sukses');
eq(r.data.record.jamPulang, '13:30:00', 'jam pulang tercatat');
ok(r.data.record.fotoPulangUrl.startsWith('https://lh3.googleusercontent.com/d/'), 'URL foto pulang format lh3');
eq(r.data.waTerkirim, false, 'WA off → waTerkirim false');
r = post('checkOut', { anggotaId: G1, tanggal: T1, jam: '13:35:00', lat: LAT_DEKAT, lng: LNG_DEKAT, fotoBase64: FOTO_KECIL, fileName: 'p.jpg' });
ok(!r.success && /sudah presensi pulang/i.test(r.error), 'checkOut ganda ditolak');
r = post('checkOut', { anggotaId: S3, tanggal: T1, jam: '13:30:00', lat: LAT_DEKAT, lng: LNG_DEKAT, fotoBase64: FOTO_KECIL, fileName: 'p.jpg' });
ok(!r.success && /belum ada presensi masuk/i.test(r.error), 'checkOut tanpa checkIn ditolak');
r = post('checkOut', { anggotaId: S1, tanggal: T1, jam: '13:35:00', lat: LAT_DEKAT, lng: LNG_DEKAT, fotoBase64: FOTO_KECIL, fileName: 'p.jpg' });
ok(r.success, 'checkOut S1 sukses');
{
  const rootF = DriveApp._roots['PresensiSekolah_Files'];
  const namaFile = rootF._subs['Presensi']._subs['2026-10']._files.find((f) => f._blob.name.startsWith('PULANG_'))._blob.name;
  ok(/^PULANG_/.test(namaFile), 'nama file PULANG_...', namaFile);
}

console.log('\n[9] ajukanIzin, putuskanIzin, getIzin');
r = post('ajukanIzin', { item: { tanggal: T3, anggotaId: S3, jenis: 'Sakit', keterangan: 'Demam', diajukanOleh: 'Ortu' } });
ok(r.success && r.data.item.id.startsWith('IZN-'), 'ajukanIzin sukses');
eq(r.data.item.status, 'MENUNGGU', 'status awal MENUNGGU');
const IZ1 = r.data.item.id;
r = post('ajukanIzin', { item: { tanggal: T3, anggotaId: S3, jenis: 'Alfa' } });
ok(!r.success, 'jenis izin invalid ditolak');
r = post('ajukanIzin', { item: { tanggal: T3, anggotaId: 'AGT-ngawur', jenis: 'Izin' } });
ok(!r.success, 'izin untuk anggota tak dikenal ditolak');
r = get('getIzin');
ok(r.success && r.data.items.length === 1, 'getIzin semua → 1');
r = get('getIzin', { status: 'MENUNGGU' });
eq(r.data.items.length, 1, 'filter MENUNGGU → 1');
r = post('putuskanIzin', { id: IZ1, keputusan: 'BATAL', oleh: 'admin' });
ok(!r.success, 'keputusan invalid ditolak');
r = post('putuskanIzin', { id: IZ1, keputusan: 'DISETUJUI', oleh: 'admin' });
ok(r.success, 'putuskanIzin DISETUJUI sukses');
eq(r.data.item.status, 'DISETUJUI', 'status terupdate');
eq(r.data.item.disetujuiOleh, 'admin', 'disetujuiOleh tercatat');
eq(r.data.waTerkirim, false, 'WA off → waTerkirim false');
r = post('putuskanIzin', { id: IZ1, keputusan: 'DITOLAK', oleh: 'admin' });
ok(!r.success && /sudah diputuskan/.test(r.error), 'izin yang sudah diputus tidak bisa diubah');
r = get('getIzin', { status: 'DISETUJUI' });
eq(r.data.items.length, 1, 'filter DISETUJUI → 1');
r = get('getIzin', { status: 'MENUNGGU' });
eq(r.data.items.length, 0, 'filter MENUNGGU → 0');

console.log('\n[10] kirimWA & notifikasi otomatis');
const req0 = UrlFetchApp._requests.length;
r = post('kirimWA', { to: '0811', template: 'Halo {nama}, status {status} tgl {tanggal}', params: { nama: 'Budi', status: 'HADIR', tanggal: T1 } });
ok(r.success && r.terkirim === false, 'WA belum dikonfigurasi → terkirim false');
eq(r.pesan, 'WA belum dikonfigurasi — dilewati.', 'pesan skip sesuai kontrak');
ok(UrlFetchApp._requests.length === req0, 'TANPA request jaringan saat belum dikonfigurasi');
r = post('saveSettings', { pengaturan: { waAktif: 'true', waEndpoint: 'https://wa.contoh.test/kirim', waApiKey: 'kunci-rahasia-123' } });
ok(r.success, 'konfigurasi WA disimpan');
r = post('kirimWA', { to: '0811', template: 'Halo {nama}, {status} {tanggal} {jam} {jenis} {keputusan}', params: { nama: 'Budi', status: 'HADIR', tanggal: T1, jam: '06:55:00', jenis: 'Sakit', keputusan: 'disetujui' } });
ok(r.success && r.terkirim === true, 'WA terkonfigurasi → terkirim true');
{
  const last = UrlFetchApp._requests[UrlFetchApp._requests.length - 1];
  eq(last.url, 'https://wa.contoh.test/kirim', 'URL endpoint benar');
  const body = JSON.parse(last.opts.payload);
  eq(body.to, '0811', 'payload to benar');
  eq(body.message, 'Halo Budi, HADIR 17/10/2026 06:55:00 Sakit disetujui', 'semua placeholder terisi');
  eq(body.apiKey, 'kunci-rahasia-123', 'payload apiKey benar');
  eq(last.opts.method, 'post', 'method POST');
}
UrlFetchApp._shouldThrow = true;
r = post('kirimWA', { to: '0811', template: 'x', params: {} });
ok(r.success && r.terkirim === false && r.pesan.startsWith('Gagal:'), 'gagal jaringan → success:true, terkirim:false, pesan Gagal:');
UrlFetchApp._shouldThrow = false;
r = post('kirimWA', { to: '', template: 'x', params: {} });
ok(r.success && r.terkirim === false, 'tujuan kosong → terkirim false tanpa error');
// Notifikasi otomatis checkIn (SISWA → NoWAOrtu)
const req1 = UrlFetchApp._requests.length;
r = post('checkIn', checkInArgs(S1, T4, '06:50:00'));
ok(r.success && r.data.waTerkirim === true, 'checkIn memicu WA otomatis');
{
  const last = UrlFetchApp._requests[UrlFetchApp._requests.length - 1];
  const body = JSON.parse(last.opts.payload);
  eq(body.to, '0822', 'SISWA → NoWAOrtu');
  ok(body.message.includes('Siswa Satu') && body.message.includes('MASUK') && body.message.includes('(HADIR)'), 'template masuk terisi', body.message);
}
r = post('checkIn', checkInArgs(G1, T4, '06:50:00'));
{
  const last = UrlFetchApp._requests[UrlFetchApp._requests.length - 1];
  const body = JSON.parse(last.opts.payload);
  eq(body.to, '0811', 'GURU → NoWA');
}
ok(UrlFetchApp._requests.length === req1 + 2, '2 checkIn → 2 request WA');
// Notifikasi putusan izin memakai template izin + {keputusan}
r = post('ajukanIzin', { item: { tanggal: T4, anggotaId: S2, jenis: 'Izin', keterangan: 'Acara keluarga', diajukanOleh: 'Ortu' } });
const IZ2 = r.data.item.id;
r = post('putuskanIzin', { id: IZ2, keputusan: 'DISETUJUI', oleh: 'admin' });
ok(r.success && r.data.waTerkirim === true, 'putusan izin memicu WA');
{
  const last = UrlFetchApp._requests[UrlFetchApp._requests.length - 1];
  const body = JSON.parse(last.opts.payload);
  ok(body.message.includes('Siswa Dua') && body.message.includes('(Izin)') && body.message.includes('disetujui'), 'template izin terisi', body.message);
  eq(body.to, '0823', 'izin SISWA → NoWAOrtu');
}

console.log('\n[11] getPresensi + filter');
r = get('getPresensi');
eq(r.data.items.length, 5, 'semua presensi → 5 (G1,S1,S2 di T1 + S1,G1 di T4)');
r = get('getPresensi', { tipe: 'SISWA' });
eq(r.data.items.length, 3, 'filter tipe=SISWA → 3');
r = get('getPresensi', { tipe: 'GURU' });
eq(r.data.items.length, 2, 'filter tipe=GURU → 2');
r = get('getPresensi', { kelasNama: '7A' });
eq(r.data.items.length, 3, 'filter kelasNama=7A → 3');
r = get('getPresensi', { anggotaId: G1 });
eq(r.data.items.length, 2, 'filter anggotaId → 2');
r = get('getPresensi', { tanggalDari: T1, tanggalSampai: T1 });
eq(r.data.items.length, 3, 'filter rentang T1–T1 → 3');
r = get('getPresensi', { tanggalDari: '18/10/2026', tanggalSampai: T4 });
eq(r.data.items.length, 2, 'filter rentang 18/10–21/10 → 2');

console.log('\n[12] getDashboard');
// S3 izin pada T1 disetujui → tidak dihitung belumAbsen
r = post('ajukanIzin', { item: { tanggal: T1, anggotaId: S3, jenis: 'Izin', keterangan: 'Keperluan', diajukanOleh: 'Ortu' } });
r = post('putuskanIzin', { id: r.data.item.id, keputusan: 'DISETUJUI', oleh: 'admin' });
ok(r.success, 'izin S3 pada T1 disetujui');
r = get('getDashboard', { tanggal: T1 });
ok(r.success, 'getDashboard sukses');
eq(r.data.tanggal, T1, 'tanggal dashboard sesuai');
eq(r.data.guru, { hadir: 1, terlambat: 0, izin: 0, belumAbsen: 0, total: 1 }, 'ringkasan GURU benar (G2 nonaktif tidak dihitung)');
eq(r.data.siswa, { hadir: 2, terlambat: 1, izin: 1, belumAbsen: 0, total: 3 }, 'ringkasan SISWA benar (izin tidak dihitung belumAbsen)');
eq(r.data.terlambat.length, 1, 'daftar terlambat → 1');
eq(r.data.terlambat[0].nama, 'Siswa Satu', 'yang terlambat = Siswa Satu');
eq(r.data.terlambat[0].jamMasuk, '07:20:00', 'jamMasuk terlambat tercatat');
r = get('getDashboard', { tanggal: '18/10/2026' });
eq(r.data.siswa.belumAbsen, 3, 'hari tanpa presensi → semua belumAbsen');
eq(r.data.guru.belumAbsen, 1, 'guru tanpa presensi → belumAbsen 1');

console.log('\n[13] getRekap');
// Hari libur: 19/10 (Senin, aktif) & 25/10 (Minggu, non-aktif)
post('saveHariLibur', { item: { tanggal: T2, keterangan: 'Libur' } });
post('saveHariLibur', { item: { tanggal: '25/10/2026', keterangan: 'Libur Minggu' } });
function hitungEfektif(y, m, libur, hariAktif) {
  hariAktif = hariAktif || [1, 2, 3, 4, 5, 6];
  let n = 0;
  const dim = new Date(y, m, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(y, m - 1, d);
    const wd = (dt.getDay() + 6) % 7 + 1;
    const t = String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y;
    if (hariAktif.includes(wd) && !libur.includes(t)) n++;
  }
  return n;
}
const EFEKTIF = hitungEfektif(2026, 10, ['19/10/2026', '25/10/2026']);
ok(EFEKTIF === 26, 'hari efektif Okt 2026 = 26 (cek mandiri)', `dapat ${EFEKTIF}`);
r = get('getRekap', { bulan: '10/2026', tipe: 'GURU' });
ok(r.success, 'getRekap sukses');
eq(r.data.bulan, '10/2026', 'bulan sesuai');
eq(r.data.rows.length, 2, '2 baris guru (termasuk nonaktif)');
{
  const g1 = r.data.rows.find((x) => x.anggotaId === G1);
  eq(g1.hariEfektif, EFEKTIF, 'G1 hariEfektif benar');
  eq(g1.hadir, 2, 'G1 hadir=2 (T1+T4)');
  eq(g1.terlambat, 0, 'G1 terlambat=0');
  eq(g1.izin, 0, 'G1 izin=0');
  eq(g1.alpa, EFEKTIF - 2, 'G1 alpa = efektif − hadir − izin');
  const g2 = r.data.rows.find((x) => x.anggotaId === G2);
  eq(g2.alpa, EFEKTIF, 'G2 (nonaktif, tanpa data) alpa = efektif');
}
r = get('getRekap', { bulan: '10/2026', tipe: 'SISWA' });
eq(r.data.rows.length, 3, '3 baris siswa');
{
  const s1 = r.data.rows.find((x) => x.anggotaId === S1);
  eq([s1.hadir, s1.terlambat, s1.izin], [2, 1, 0], 'S1 hadir=2 terlambat=1');
  eq(s1.alpa, EFEKTIF - 2, 'S1 alpa benar');
  const s2 = r.data.rows.find((x) => x.anggotaId === S2);
  eq([s2.hadir, s2.izin], [1, 1], 'S2 hadir=1 izin=1');
  eq(s2.alpa, EFEKTIF - 2, 'S2 alpa benar');
  const s3 = r.data.rows.find((x) => x.anggotaId === S3);
  eq([s3.hadir, s3.izin], [0, 2], 'S3 hadir=0 izin=2 (T1+T3)');
  const EFEKTIF5 = hitungEfektif(2026, 10, ['19/10/2026', '25/10/2026'], [1, 2, 3, 4, 5]);
  eq(s3.hariEfektif, EFEKTIF5, 'S3 hariEfektif mengikuti shift 5-hari');
  eq(s3.alpa, EFEKTIF5 - 2, 'S3 alpa benar');
}
r = get('getRekap', { bulan: '13/2026', tipe: 'GURU' });
ok(!r.success, 'bulan invalid ditolak');
r = get('getRekap', { bulan: '2026-10', tipe: 'GURU' });
ok(!r.success, 'format bulan salah ditolak');

console.log('\n[14] importAnggota');
r = post('importAnggota', {
  rows: [
    { nama: 'Impor Satu', tipe: 'SISWA', kelasNama: '7A', jabatan: '', noWA: '0831', noWAOrtu: '0832', shiftNama: 'Reguler' },
    { nama: 'IMPOR SATU', tipe: 'siswa', noWA: '0839' },
    { nama: 'Impor Guru', tipe: 'GURU', noWA: '0841', shiftNama: 'Reguler' },
    { nama: '', tipe: 'GURU' },
    { nama: 'Impor Bad', tipe: 'DOSEN' },
  ],
});
ok(r.success, 'importAnggota sukses');
eq(r.data.inserted, 2, 'inserted=2');
eq(r.data.updated, 1, 'updated=1 (cocok Nama+Tipe case-insensitive)');
eq(r.data.errors.length, 2, 'errors=2');
eq(r.data.errors[0].baris, 4, 'error baris 4 (nama kosong)');
eq(r.data.errors[1].baris, 5, 'error baris 5 (tipe invalid)');
{
  const semua = get('getAllData').data.anggota;
  const imp = semua.find((a) => a.nama.toLowerCase() === 'impor satu');
  eq(imp.noWA, '0839', 'data terupdate (noWA baru)');
  eq(imp.kelasNama, '7A', 'kelasNama dari impor');
  eq(imp.kelasId, KLS7A, 'kelasId ter-resolve dari nama kelas');
  eq(imp.shiftId, 'SHF-REGULER', 'shiftId ter-resolve dari nama shift');
  eq(imp.noWAOrtu, '0832', 'field lama dipertahankan saat update');
  const jmlImporSatu = semua.filter((a) => a.nama.toLowerCase() === 'impor satu').length;
  eq(jmlImporSatu, 1, 'tidak ada duplikat Impor Satu');
}
r = post('importAnggota', { rows: [] });
ok(!r.success, 'impor kosong ditolak');

console.log('\n[15] uploadLogo');
const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
r = post('uploadLogo', { fileName: 'logo.png', base64Data: '', mimeType: 'image/png' });
ok(!r.success, 'data kosong ditolak');
r = post('uploadLogo', { fileName: 'logo.txt', base64Data: tinyPng, mimeType: 'text/plain' });
ok(!r.success, 'bukan gambar ditolak');
r = post('uploadLogo', { fileName: 'logo sekolah.png', base64Data: tinyPng, mimeType: 'image/png' });
ok(r.success, 'upload logo sukses');
ok(r.data && r.data.url.startsWith('https://lh3.googleusercontent.com/d/'), 'URL logo format lh3');
r = get('getAllData');
ok(r.data.pengaturan.logoUrl.startsWith('https://lh3.googleusercontent.com/d/'), 'logoUrl tersimpan di Pengaturan');
{
  const before = get('getAllData').data.pengaturan.logoUrl;
  post('uploadLogo', { fileName: 'logo2.png', base64Data: tinyPng, mimeType: 'image/png' });
  const after = get('getAllData').data.pengaturan.logoUrl;
  ok(after !== before && after.startsWith('https://lh3.googleusercontent.com/d/'), 'logoUrl terupdate (tidak duplikat key)');
}

console.log('\n[16] aksi tidak dikenal');
r = post('aksiNgawur', {});
ok(!r.success, 'POST aksi tidak dikenal → error rapi');
r = get('aksiNgawur');
ok(!r.success, 'GET aksi tidak dikenal → error rapi');

console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
