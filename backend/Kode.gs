/**
 * BACKEND — Aplikasi Presensi Sekolah/Madrasah Digital (wwn-presensi-80)
 * Google Apps Script + Google Sheets + Google Drive
 *
 * FITUR:
 *  - Presensi MASUK / PULANG dengan validasi jadwal shift, toleransi keterlambatan,
 *    radius GPS (haversine), dan foto selfie yang disimpan ke Google Drive.
 *  - Pengajuan & persetujuan izin (Sakit/Izin/Keperluan).
 *  - Dashboard harian, rekap bulanan, impor anggota dari Excel/CSV (via frontend).
 *  - Notifikasi WhatsApp otomatis (best-effort, tidak pernah menggagalkan aksi).
 *  - Login multi-peran: admin & operator (sheet Pengguna).
 *
 * CARA PAKAI (untuk pemula):
 *  1. Buat Google Spreadsheet baru (mis. "Database Presensi Sekolah").
 *  2. Buka menu Extensions > Apps Script. HAPUS seluruh isi editor,
 *     lalu PASTE seluruh isi file ini.
 *  3. (Hanya jika memakai foto presensi / logo) Jalankan fungsi
 *     "authorizeDriveAccess" dari editor, lalu setujui izin Google Drive.
 *  4. Deploy > New deployment > Web app:
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. Salin URL /exec ke menu Konfigurasi di aplikasi web,
 *     lalu klik "Inisialisasi Database".
 *
 * Sheet yang dibuat (8): Pengaturan, Anggota, Kelas, Shift, Presensi,
 * Izin, Pengguna, HariLibur
 *
 * CATATAN PENTING:
 *  - Format TANGGAL di semua request & response: dd/mm/yyyy (mis. 17/10/2026).
 *  - Format JAM: HH:MM:SS (24 jam). Jam shift: HH:MM.
 *  - Foto presensi & logo disimpan ke Google Drive di folder
 *    "PresensiSekolah_Files" (dibagikan publik, hanya-baca).
 *  - Notifikasi WA dikirim ke endpoint milik sekolah sendiri (diatur di
 *    Pengaturan: waEndpoint + waApiKey). Backend mengirim POST JSON
 *    {to, message, apiKey} ke endpoint tersebut. Jika belum dikonfigurasi,
 *    pengiriman dilewati TANPA error dan TANPA request jaringan.
 *  - Akun bawaan: admin/admin123 (admin), operator/operator123 (operator).
 *    SEGERA ganti password setelah inisialisasi!
 */

var APP_VERSION = '1.0.0';

// ============================================================
// KONFIGURASI SHEET (satu sumber kebenaran untuk nama & header)
// ============================================================
var SHEET_PENGATURAN = 'Pengaturan';
var SHEET_ANGGOTA = 'Anggota';
var SHEET_KELAS = 'Kelas';
var SHEET_SHIFT = 'Shift';
var SHEET_PRESENSI = 'Presensi';
var SHEET_IZIN = 'Izin';
var SHEET_PENGGUNA = 'Pengguna';
var SHEET_HARILIBUR = 'HariLibur';

var HEADERS = {};
HEADERS[SHEET_PENGATURAN] = ['Kunci', 'Nilai'];
HEADERS[SHEET_ANGGOTA] = ['ID', 'Nama', 'Tipe', 'KelasID', 'KelasNama', 'Jabatan', 'NoWA', 'NoWAOrtu', 'ShiftID', 'StatusAktif'];
HEADERS[SHEET_KELAS] = ['ID', 'NamaKelas', 'Tingkat', 'WaliKelas'];
HEADERS[SHEET_SHIFT] = ['ID', 'NamaShift', 'JamMasuk', 'JamPulang', 'ToleransiMenit', 'HariAktif', 'Keterangan'];
HEADERS[SHEET_PRESENSI] = ['ID', 'Tanggal', 'AnggotaID', 'Nama', 'Tipe', 'KelasNama', 'JamMasuk', 'JamPulang',
  'LatMasuk', 'LngMasuk', 'LatPulang', 'LngPulang', 'StatusMasuk', 'FotoMasukUrl', 'FotoPulangUrl',
  'Keterangan', 'DibuatPada'];
HEADERS[SHEET_IZIN] = ['ID', 'Tanggal', 'AnggotaID', 'Nama', 'Tipe', 'KelasNama', 'Jenis', 'Keterangan',
  'Status', 'DiajukanOleh', 'DisetujuiOleh', 'WaktuPengajuan'];
HEADERS[SHEET_PENGGUNA] = ['Username', 'Nama', 'Peran', 'Password', 'StatusAktif'];
HEADERS[SHEET_HARILIBUR] = ['Tanggal', 'Keterangan'];

var TEMPLATE_WA_MASUK = "Assalamu'alaikum, {nama} telah presensi MASUK pada {tanggal} pukul {jam} ({status}).";
var TEMPLATE_WA_PULANG = "Assalamu'alaikum, {nama} telah presensi PULANG pada {tanggal} pukul {jam}.";
var TEMPLATE_WA_IZIN = "Assalamu'alaikum, pengajuan izin {nama} pada {tanggal} ({jenis}) telah {keputusan}.";

var DEFAULT_PENGATURAN = [
  ['namaSekolah', 'MTs AL ISLAM NGLESES'],
  ['npsn', ''],
  ['alamat', ''],
  ['telepon', ''],
  ['tahunPelajaran', '2026/2027'],
  ['kepalaSekolah', ''],
  ['logoUrl', ''],
  ['lat', ''],
  ['lng', ''],
  ['radiusMeter', ''],
  ['waAktif', 'false'],
  ['waEndpoint', ''],
  ['waApiKey', ''],
  ['waTemplateMasuk', TEMPLATE_WA_MASUK],
  ['waTemplatePulang', TEMPLATE_WA_PULANG],
  ['waTemplateIzin', TEMPLATE_WA_IZIN]
];

var SETTING_KEYS = DEFAULT_PENGATURAN.map(function (r) { return r[0]; });

// Batas ukuran foto presensi (base64 murni, tanpa prefix data:). ~1,5 MB.
var MAX_FOTO_BASE64 = 2097152;

// ============================================================
// ENTRY POINT
// ============================================================
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'ping';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'ping':
        return jsonResponse({ success: true, message: 'Backend Presensi aktif.', version: APP_VERSION });

      case 'getAllData':
        return jsonResponse({
          success: true,
          message: 'Data berhasil dimuat.',
          data: {
            pengaturan: getSettings(ss),
            anggota: getAnggotaList(ss),
            kelas: getKelasList(ss),
            shift: getShiftList(ss),
            izin: getIzinList(ss),
            pengguna: getPenggunaList(ss),
            hariLibur: getHariLiburList(ss)
          }
        });

      case 'getIzin':
        return jsonResponse({
          success: true,
          data: { items: getIzinList(ss, asString(p.status) || null) }
        });

      case 'getPresensi':
        return jsonResponse({
          success: true,
          data: { items: getPresensiList(ss, p) }
        });

      case 'getDashboard':
        return jsonResponse({
          success: true,
          data: getDashboardData(ss, p)
        });

      case 'getRekap':
        return jsonResponse({
          success: true,
          data: getRekapData(ss, p)
        });

      default:
        return jsonResponse({ success: false, error: 'Aksi tidak dikenal: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: 'doGet: ' + err.message });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = payload.action || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'initDatabase':
        initializeAllSheets(ss);
        return jsonResponse({
          success: true,
          message: '8 sheet database berhasil diinisialisasi.',
          data: { sheets: getSheetSummaries(ss) }
        });

      case 'login': {
        var lr = verifyLogin(ss, payload.username, payload.password);
        return jsonResponse(lr);
      }

      case 'saveSettings':
        saveSettings(ss, payload.pengaturan || {});
        return jsonResponse({ success: true, message: 'Pengaturan berhasil disimpan.', data: { pengaturan: getSettings(ss) } });

      case 'uploadLogo': {
        var up = uploadLogoFile(ss, payload);
        return jsonResponse({ success: up.success, message: up.message, error: up.error, data: up.data });
      }

      case 'saveAnggota': {
        var ag = saveAnggotaItem(ss, payload.item || {});
        return jsonResponse({ success: true, message: 'Data anggota berhasil disimpan.', data: { item: ag } });
      }
      case 'deleteAnggota':
        deleteRowById(getAnggotaSheet(ss), asString(payload.id));
        return jsonResponse({ success: true, message: 'Data anggota berhasil dihapus.' });

      case 'saveKelas': {
        var kl = saveKelasItem(ss, payload.item || {});
        return jsonResponse({ success: true, message: 'Data kelas berhasil disimpan.', data: { item: kl } });
      }
      case 'deleteKelas':
        deleteRowById(getKelasSheet(ss), asString(payload.id));
        return jsonResponse({ success: true, message: 'Data kelas berhasil dihapus.' });

      case 'saveShift': {
        var sh = saveShiftItem(ss, payload.item || {});
        return jsonResponse({ success: true, message: 'Data shift berhasil disimpan.', data: { item: sh } });
      }
      case 'deleteShift':
        deleteShiftItem(ss, payload.id);
        return jsonResponse({ success: true, message: 'Data shift berhasil dihapus.' });

      case 'saveHariLibur': {
        var hl = saveHariLiburItem(ss, payload.item || {});
        return jsonResponse({ success: true, message: 'Hari libur berhasil disimpan.', data: { item: hl } });
      }
      case 'deleteHariLibur':
        deleteHariLiburItem(ss, payload.id);
        return jsonResponse({ success: true, message: 'Hari libur berhasil dihapus.' });

      case 'savePengguna': {
        var pg = savePenggunaItem(ss, payload.item || {});
        return jsonResponse({ success: true, message: 'Data pengguna berhasil disimpan.', data: { item: pg } });
      }
      case 'deletePengguna':
        deletePenggunaItem(ss, payload.username);
        return jsonResponse({ success: true, message: 'Data pengguna berhasil dihapus.' });

      case 'importAnggota': {
        var imp = importAnggotaRows(ss, payload.rows || []);
        return jsonResponse({
          success: true,
          message: 'Impor selesai: ' + imp.inserted + ' baru, ' + imp.updated + ' diperbarui, ' + imp.errors.length + ' gagal.',
          data: imp
        });
      }

      case 'checkIn': {
        var ci = actionCheckIn(ss, payload);
        return jsonResponse({ success: true, message: 'Presensi MASUK tercatat (' + ci.statusMasuk + ').', data: ci });
      }

      case 'checkOut': {
        var co = actionCheckOut(ss, payload);
        return jsonResponse({ success: true, message: 'Presensi PULANG tercatat.', data: co });
      }

      case 'ajukanIzin': {
        var iz = actionAjukanIzin(ss, payload);
        return jsonResponse({ success: true, message: 'Pengajuan izin berhasil dikirim.', data: iz });
      }

      case 'putuskanIzin': {
        var pk = actionPutuskanIzin(ss, payload);
        return jsonResponse({ success: true, message: 'Izin telah ' + pk.item.status.toLowerCase() + '.', data: pk });
      }

      case 'kirimWA': {
        var wa = kirimWAAman(ss, payload.to, payload.template, payload.params || {});
        return jsonResponse({ success: true, terkirim: wa.terkirim, pesan: wa.pesan });
      }

      default:
        return jsonResponse({ success: false, error: 'Aksi tidak dikenal: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: 'doPost: ' + err.message });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// HELPER GENERIK
// ============================================================

/** Ambil sheet, buat jika belum ada (dengan header yang benar). */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = HEADERS[name] || [];
    if (headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/** Semua baris data (tanpa header) sebagai array. */
function getDataRows(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/** Cari nomor baris (1-based, termasuk header) berdasarkan ID di kolom 1. */
function findRowById(sheet, id) {
  if (!id) return -1;
  var rows = getDataRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/** Hapus baris berdasarkan ID di kolom 1. */
function deleteRowById(sheet, id) {
  var rowNum = findRowById(sheet, id);
  if (rowNum < 2) throw new Error('Data tidak ditemukan (ID: ' + id + ').');
  sheet.deleteRow(rowNum);
}

function asString(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function asBool(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function asNumber(v) {
  var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function nowISO() {
  return new Date().toISOString();
}

function newUuid(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** Format Date → 'dd/mm/yyyy'. */
function formatTanggalID(d) {
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** Cek tanggal kalender valid. */
function validDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  var dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * Normalisasi tanggal menjadi 'dd/mm/yyyy'.
 * Menerima: Date, 'dd/mm/yyyy', 'dd-mm-yyyy', 'yyyy-mm-dd'.
 */
function parseTanggal(input) {
  if (input instanceof Date && !isNaN(input.getTime())) {
    return formatTanggalID(input);
  }
  var s = asString(input);
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (!validDate(y, mo, d)) throw new Error('Tanggal tidak valid: ' + s + ' (format: dd/mm/yyyy).');
    return pad2(d) + '/' + pad2(mo) + '/' + y;
  }
  var m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    var y2 = parseInt(m2[1], 10), mo2 = parseInt(m2[2], 10), d2 = parseInt(m2[3], 10);
    if (!validDate(y2, mo2, d2)) throw new Error('Tanggal tidak valid: ' + s + '.');
    return pad2(d2) + '/' + pad2(mo2) + '/' + y2;
  }
  throw new Error('Format tanggal tidak valid: "' + s + '" (gunakan dd/mm/yyyy).');
}

/** 'dd/mm/yyyy' → 'yyyymmdd' (untuk perbandingan & filter). */
function tanggalToSort(t) {
  var p = asString(t).split('/');
  return p[2] + p[1] + p[0];
}

/** Hari dalam seminggu: 1=Senin ... 7=Minggu. */
function weekday1to7(tanggal) {
  var p = asString(tanggal).split('/');
  var dt = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
  return (dt.getDay() + 6) % 7 + 1;
}

/** 'HH:MM[:SS]' → detik. Throw jika format salah. */
function parseJamToSec(jam) {
  var m = asString(jam).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error('Format jam tidak valid: "' + jam + '" (gunakan HH:MM:SS).');
  var h = parseInt(m[1], 10), mi = parseInt(m[2], 10), s = parseInt(m[3] || '0', 10);
  if (h > 23 || mi > 59 || s > 59) throw new Error('Jam tidak valid: "' + jam + '".');
  return h * 3600 + mi * 60 + s;
}

/** 'HH:MM' → menit. Throw jika format salah. */
function parseJamHM(jam) {
  var m = asString(jam).match(/^(\d{2}):(\d{2})$/);
  if (!m) throw new Error('Format jam shift tidak valid: "' + jam + '" (gunakan HH:MM).');
  var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) throw new Error('Jam shift tidak valid: "' + jam + '".');
  return h * 60 + mi;
}

/** Haversine: jarak (meter) antara dua koordinat. */
function distanceMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = function (d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Isi placeholder {nama} {tanggal} {jam} {status} {jenis} {keputusan}. */
function fillTemplate(template, params) {
  var out = asString(template);
  var keys = ['nama', 'tanggal', 'jam', 'status', 'jenis', 'keputusan'];
  params = params || {};
  for (var i = 0; i < keys.length; i++) {
    out = out.split('{' + keys[i] + '}').join(asString(params[keys[i]]));
  }
  return out;
}

function sanitizeFileName(s) {
  return asString(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'anggota';
}

// ============================================================
// INISIALISASI DATABASE
// ============================================================
function initializeAllSheets(ss) {
  getPengaturanSheet(ss);
  getAnggotaSheet(ss);
  getKelasSheet(ss);
  getShiftSheet(ss);
  getPresensiSheet(ss);
  getIzinSheet(ss);
  getPenggunaSheet(ss);
  getHariLiburSheet(ss);

  // Seed shift default (hanya jika belum ada shift sama sekali)
  if (getShiftList(ss).length === 0) {
    getShiftSheet(ss).appendRow(['SHF-REGULER', 'Reguler', '07:00', '14:00', 15, '1,2,3,4,5,6', 'Shift default (Senin-Sabtu)']);
  }
  // Seed pengguna bawaan (hanya jika sheet Pengguna masih kosong)
  if (getDataRows(getPenggunaSheet(ss)).length === 0) {
    var sh = getPenggunaSheet(ss);
    sh.appendRow(['admin', 'Administrator', 'admin', 'admin123', 'TRUE']);
    sh.appendRow(['operator', 'Operator', 'operator', 'operator123', 'TRUE']);
  }
}

function getSheetSummaries(ss) {
  var names = [SHEET_PENGATURAN, SHEET_ANGGOTA, SHEET_KELAS, SHEET_SHIFT,
    SHEET_PRESENSI, SHEET_IZIN, SHEET_PENGGUNA, SHEET_HARILIBUR];
  return names.map(function (n) {
    var sh = ss.getSheetByName(n);
    return { name: n, exists: !!sh, rowCount: sh ? Math.max(0, sh.getLastRow() - 1) : 0 };
  });
}

// ============================================================
// PENGATURAN
// ============================================================
function getPengaturanSheet(ss) {
  var sheet = getOrCreateSheet(ss, SHEET_PENGATURAN);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, DEFAULT_PENGATURAN.length, 2).setValues(DEFAULT_PENGATURAN);
  }
  return sheet;
}

function getSettings(ss) {
  var sheet = getPengaturanSheet(ss);
  var rows = getDataRows(sheet);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[asString(rows[i][0])] = asString(rows[i][1]);
  }
  var out = {};
  for (var k = 0; k < SETTING_KEYS.length; k++) {
    out[SETTING_KEYS[k]] = map[SETTING_KEYS[k]] !== undefined ? map[SETTING_KEYS[k]] : '';
  }
  // Pastikan template WA selalu ada (fallback bawaan)
  if (!out.waTemplateMasuk) out.waTemplateMasuk = TEMPLATE_WA_MASUK;
  if (!out.waTemplatePulang) out.waTemplatePulang = TEMPLATE_WA_PULANG;
  if (!out.waTemplateIzin) out.waTemplateIzin = TEMPLATE_WA_IZIN;
  return out;
}

function saveSettings(ss, pengaturan) {
  var sheet = getPengaturanSheet(ss);
  for (var i = 0; i < SETTING_KEYS.length; i++) {
    var k = SETTING_KEYS[i];
    if (pengaturan[k] === undefined) continue;
    var rowNum = findRowByKey(sheet, k);
    if (rowNum > 0) {
      sheet.getRange(rowNum, 2).setValue(String(pengaturan[k]));
    } else {
      sheet.appendRow([k, String(pengaturan[k])]);
    }
  }
}

function findRowByKey(sheet, key) {
  var rows = getDataRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][0]) === key) return i + 2;
  }
  return -1;
}

// ============================================================
// ANGGOTA (Guru & Siswa)
// ============================================================
function getAnggotaSheet(ss) {
  return getOrCreateSheet(ss, SHEET_ANGGOTA);
}

function anggotaRowToObj(r) {
  return {
    id: asString(r[0]),
    nama: asString(r[1]),
    tipe: asString(r[2]).toUpperCase(),
    kelasId: asString(r[3]),
    kelasNama: asString(r[4]),
    jabatan: asString(r[5]),
    noWA: asString(r[6]),
    noWAOrtu: asString(r[7]),
    shiftId: asString(r[8]),
    statusAktif: asBool(r[9])
  };
}

function getAnggotaList(ss) {
  var rows = getDataRows(getAnggotaSheet(ss));
  return rows.map(anggotaRowToObj).filter(function (a) { return a.id !== ''; });
}

function getAnggotaById(ss, id) {
  var list = getAnggotaList(ss);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === asString(id)) return list[i];
  }
  return null;
}

function saveAnggotaItem(ss, item) {
  var nama = asString(item.nama);
  if (!nama) throw new Error('Nama anggota wajib diisi.');
  var tipe = asString(item.tipe).toUpperCase();
  if (tipe !== 'GURU' && tipe !== 'SISWA') throw new Error('Tipe anggota tidak valid (GURU/SISWA).');
  var sheet = getAnggotaSheet(ss);
  var id = asString(item.id);
  var row = [id || newUuid('AGT'), nama, tipe, asString(item.kelasId), asString(item.kelasNama),
    asString(item.jabatan), asString(item.noWA), asString(item.noWAOrtu), asString(item.shiftId),
    item.statusAktif === false ? 'FALSE' : 'TRUE'];
  if (id && findRowById(sheet, id) > 0) {
    sheet.getRange(findRowById(sheet, id), 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return anggotaRowToObj(row);
}

/**
 * Impor banyak anggota sekaligus (upsert: cocokkan Nama + Tipe, abaikan huruf besar/kecil).
 * Mengembalikan {inserted, updated, errors: [{baris, pesan}]}.
 */
function importAnggotaRows(ss, rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Data impor kosong.');
  var sheet = getAnggotaSheet(ss);
  var kelasList = getKelasList(ss);
  var shiftList = getShiftList(ss);
  var existing = getAnggotaList(ss);
  var inserted = 0, updated = 0, errors = [];

  function cariKelasId(namaKelas) {
    var n = asString(namaKelas).toLowerCase();
    if (!n) return '';
    for (var i = 0; i < kelasList.length; i++) {
      if (kelasList[i].namaKelas.toLowerCase() === n) return kelasList[i].id;
    }
    return '';
  }
  function cariShiftId(namaShift) {
    var n = asString(namaShift).toLowerCase();
    if (!n) return '';
    for (var j = 0; j < shiftList.length; j++) {
      if (shiftList[j].namaShift.toLowerCase() === n) return shiftList[j].id;
    }
    return '';
  }

  for (var b = 0; b < rows.length; b++) {
    try {
      var r = rows[b] || {};
      var nama = asString(r.nama);
      if (!nama) throw new Error('Nama kosong.');
      var tipe = asString(r.tipe).toUpperCase();
      if (tipe !== 'GURU' && tipe !== 'SISWA') throw new Error('Tipe tidak valid (harus GURU/SISWA).');
      var cocok = null;
      var cocokIdx = -1;
      for (var e = 0; e < existing.length; e++) {
        if (existing[e].nama.toLowerCase() === nama.toLowerCase() && existing[e].tipe === tipe) {
          cocok = existing[e];
          cocokIdx = e;
          break;
        }
      }
      if (cocok) {
        // Update: hanya field yang diisi di baris impor yang diubah (merge).
        // Field yang kosong di baris impor = tidak diubah (bukan dikosongkan).
        var kelasNamaBaru = asString(r.kelasNama);
        var shiftNamaBaru = asString(r.shiftNama);
        var merged = {
          id: cocok.id,
          nama: nama,
          tipe: tipe,
          kelasId: kelasNamaBaru ? cariKelasId(kelasNamaBaru) : cocok.kelasId,
          kelasNama: kelasNamaBaru ? kelasNamaBaru : cocok.kelasNama,
          jabatan: asString(r.jabatan) ? asString(r.jabatan) : cocok.jabatan,
          noWA: asString(r.noWA) ? asString(r.noWA) : cocok.noWA,
          noWAOrtu: asString(r.noWAOrtu) ? asString(r.noWAOrtu) : cocok.noWAOrtu,
          shiftId: shiftNamaBaru ? cariShiftId(shiftNamaBaru) : cocok.shiftId,
          statusAktif: cocok.statusAktif
        };
        var saved = saveAnggotaItem(ss, merged);
        existing[cocokIdx] = saved;
        updated++;
      } else {
        var item = {
          nama: nama,
          tipe: tipe,
          kelasId: cariKelasId(asString(r.kelasNama)),
          kelasNama: asString(r.kelasNama),
          jabatan: asString(r.jabatan),
          noWA: asString(r.noWA),
          noWAOrtu: asString(r.noWAOrtu),
          shiftId: cariShiftId(r.shiftNama),
          statusAktif: true
        };
        var baru = saveAnggotaItem(ss, item);
        existing.push(baru);
        inserted++;
      }
    } catch (err) {
      errors.push({ baris: b + 1, pesan: err.message });
    }
  }
  return { inserted: inserted, updated: updated, errors: errors };
}

// ============================================================
// KELAS
// ============================================================
function getKelasSheet(ss) {
  return getOrCreateSheet(ss, SHEET_KELAS);
}

function kelasRowToObj(r) {
  return { id: asString(r[0]), namaKelas: asString(r[1]), tingkat: asString(r[2]), waliKelas: asString(r[3]) };
}

function getKelasList(ss) {
  var rows = getDataRows(getKelasSheet(ss));
  return rows.map(kelasRowToObj).filter(function (k) { return k.id !== ''; });
}

function saveKelasItem(ss, item) {
  if (!asString(item.namaKelas)) throw new Error('Nama kelas wajib diisi.');
  var sheet = getKelasSheet(ss);
  var id = asString(item.id);
  var row = [id || newUuid('KLS'), asString(item.namaKelas), asString(item.tingkat), asString(item.waliKelas)];
  if (id && findRowById(sheet, id) > 0) {
    sheet.getRange(findRowById(sheet, id), 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return kelasRowToObj(row);
}

// ============================================================
// SHIFT
// ============================================================
function getShiftSheet(ss) {
  return getOrCreateSheet(ss, SHEET_SHIFT);
}

/** Normalisasi 'HariAktif' menjadi daftar angka 1-7 berurutan, dipisah koma. */
function normalisasiHariAktif(v) {
  var parts = asString(v).split(',');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var n = parseInt(parts[i].trim(), 10);
    if (n >= 1 && n <= 7 && out.indexOf(n) === -1) out.push(n);
  }
  out.sort();
  return out.join(',');
}

function shiftRowToObj(r) {
  var hariAktif = normalisasiHariAktif(r[5]) || '1,2,3,4,5,6';
  return {
    id: asString(r[0]),
    namaShift: asString(r[1]),
    jamMasuk: asString(r[2]),
    jamPulang: asString(r[3]),
    toleransiMenit: asNumber(r[4]),
    hariAktif: hariAktif,
    hariAktifList: hariAktif.split(',').map(function (x) { return parseInt(x, 10); }),
    keterangan: asString(r[6])
  };
}

function getShiftList(ss) {
  var rows = getDataRows(getShiftSheet(ss));
  return rows.map(shiftRowToObj).filter(function (s) { return s.id !== ''; });
}

function saveShiftItem(ss, item) {
  if (!asString(item.namaShift)) throw new Error('Nama shift wajib diisi.');
  parseJamHM(item.jamMasuk);   // validasi format HH:MM
  parseJamHM(item.jamPulang);  // validasi format HH:MM
  var tol = asNumber(item.toleransiMenit);
  if (tol < 0) throw new Error('Toleransi menit tidak boleh negatif.');
  var sheet = getShiftSheet(ss);
  var id = asString(item.id);
  var row = [id || newUuid('SHF'), asString(item.namaShift), asString(item.jamMasuk),
    asString(item.jamPulang), tol, normalisasiHariAktif(item.hariAktif) || '1,2,3,4,5,6',
    asString(item.keterangan)];
  if (id && findRowById(sheet, id) > 0) {
    sheet.getRange(findRowById(sheet, id), 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return shiftRowToObj(row);
}

function deleteShiftItem(ss, id) {
  id = asString(id);
  // Shift yang masih dipakai anggota tidak boleh dihapus
  var dipakai = getAnggotaList(ss).filter(function (a) { return a.shiftId === id; });
  if (dipakai.length > 0) {
    throw new Error('Shift tidak bisa dihapus: masih dipakai ' + dipakai.length + ' anggota.');
  }
  deleteRowById(getShiftSheet(ss), id);
}

/** Shift acuan untuk seorang anggota: ShiftID-nya, atau shift pertama. */
function getShiftAcuan(ss, anggota) {
  var shifts = getShiftList(ss);
  if (shifts.length === 0) throw new Error('Shift belum dikonfigurasi. Tambahkan shift di menu Kelola Data.');
  if (anggota.shiftId) {
    for (var i = 0; i < shifts.length; i++) {
      if (shifts[i].id === anggota.shiftId) return shifts[i];
    }
  }
  return shifts[0];
}

// ============================================================
// HARI LIBUR
// ============================================================
function getHariLiburSheet(ss) {
  return getOrCreateSheet(ss, SHEET_HARILIBUR);
}

function hariLiburRowToObj(r) {
  return { tanggal: parseTanggal(r[0]), keterangan: asString(r[1]) };
}

function getHariLiburList(ss) {
  var rows = getDataRows(getHariLiburSheet(ss));
  return rows.map(hariLiburRowToObj).filter(function (h) { return h.tanggal !== ''; });
}

function isHariLibur(ss, tanggal) {
  var list = getHariLiburList(ss);
  for (var i = 0; i < list.length; i++) {
    if (list[i].tanggal === tanggal) return list[i];
  }
  return null;
}

function saveHariLiburItem(ss, item) {
  var tanggal = parseTanggal(item.tanggal);
  var sheet = getHariLiburSheet(ss);
  var rowNum = findRowById(sheet, tanggal); // kunci = tanggal (kolom 1)
  var row = [tanggal, asString(item.keterangan)];
  if (rowNum > 0) {
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { tanggal: tanggal, keterangan: row[1] };
}

function deleteHariLiburItem(ss, id) {
  var tanggal = parseTanggal(id);
  deleteRowById(getHariLiburSheet(ss), tanggal);
}

// ============================================================
// PENGGUNA & LOGIN
// ============================================================
function getPenggunaSheet(ss) {
  var sheet = getOrCreateSheet(ss, SHEET_PENGGUNA);
  return sheet;
}

function penggunaRowToObj(r) {
  return {
    username: asString(r[0]),
    nama: asString(r[1]),
    peran: asString(r[2]).toLowerCase(),
    statusAktif: asBool(r[4])
  };
}

/** Daftar pengguna TANPA password (untuk getAllData). */
function getPenggunaList(ss) {
  var rows = getDataRows(getPenggunaSheet(ss));
  return rows.map(penggunaRowToObj).filter(function (u) { return u.username !== ''; });
}

function savePenggunaItem(ss, item) {
  var username = asString(item.username);
  if (!username) throw new Error('Username wajib diisi.');
  if (!asString(item.nama)) throw new Error('Nama pengguna wajib diisi.');
  var peran = asString(item.peran).toLowerCase();
  if (peran !== 'admin' && peran !== 'operator') throw new Error('Peran tidak valid (admin/operator).');
  var sheet = getPenggunaSheet(ss);
  // Cari baris berdasarkan username (abaikan huruf besar/kecil)
  var rows = getDataRows(sheet);
  var rowNum = -1;
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][0]).toLowerCase() === username.toLowerCase()) { rowNum = i + 2; break; }
  }
  var passwordLama = rowNum > 0 ? asString(sheet.getRange(rowNum, 4).getValue()) : '';
  var password = asString(item.password);
  if (!password) {
    if (!passwordLama) throw new Error('Password wajib diisi untuk pengguna baru.');
    password = passwordLama; // update tanpa ganti password
  }
  var row = [username, asString(item.nama), peran, password, item.statusAktif === false ? 'FALSE' : 'TRUE'];
  if (rowNum > 0) {
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return penggunaRowToObj(row);
}

function deletePenggunaItem(ss, username) {
  username = asString(username);
  if (!username) throw new Error('Username wajib diisi.');
  var sheet = getPenggunaSheet(ss);
  var rows = getDataRows(sheet);
  var rowNum = -1;
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][0]).toLowerCase() === username.toLowerCase()) { rowNum = i + 2; break; }
  }
  if (rowNum < 2) throw new Error('Pengguna tidak ditemukan: ' + username + '.');
  // Jangan sampai tidak ada admin aktif tersisa
  var target = penggunaRowToObj(rows[rowNum - 2]);
  if (target.peran === 'admin' && target.statusAktif) {
    var adminAktifLain = rows.filter(function (r, idx) {
      return idx !== rowNum - 2 && asString(r[2]).toLowerCase() === 'admin' && asBool(r[4]);
    });
    if (adminAktifLain.length === 0) {
      throw new Error('Tidak bisa menghapus satu-satunya admin aktif.');
    }
  }
  sheet.deleteRow(rowNum);
}

/** Verifikasi username/password → {success, message?, data?: {user}} (user tanpa password). */
function verifyLogin(ss, username, password) {
  username = asString(username);
  if (!username || !asString(password)) {
    return { success: false, message: 'Username dan password wajib diisi.' };
  }
  var sheet = getPenggunaSheet(ss);
  var rows = getDataRows(sheet);
  var cocok = null;
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][0]).toLowerCase() === username.toLowerCase() &&
        asString(rows[i][3]) === asString(password)) {
      cocok = rows[i];
      break;
    }
  }
  if (!cocok) {
    return { success: false, message: 'Username atau password salah.' };
  }
  var user = penggunaRowToObj(cocok);
  if (!user.statusAktif) {
    return { success: false, message: 'Akun Anda sedang dinonaktifkan oleh administrator.' };
  }
  return {
    success: true,
    message: 'Login berhasil. Selamat datang, ' + user.nama + '.',
    data: { user: { username: user.username, nama: user.nama, peran: user.peran } }
  };
}

// ============================================================
// PRESENSI
// ============================================================
function getPresensiSheet(ss) {
  return getOrCreateSheet(ss, SHEET_PRESENSI);
}

function presensiRowToObj(r) {
  return {
    id: asString(r[0]),
    tanggal: parseTanggalLoose(r[1]),
    anggotaId: asString(r[2]),
    nama: asString(r[3]),
    tipe: asString(r[4]).toUpperCase(),
    kelasNama: asString(r[5]),
    jamMasuk: asString(r[6]),
    jamPulang: asString(r[7]),
    latMasuk: asString(r[8]),
    lngMasuk: asString(r[9]),
    latPulang: asString(r[10]),
    lngPulang: asString(r[11]),
    statusMasuk: asString(r[12]).toUpperCase(),
    fotoMasukUrl: asString(r[13]),
    fotoPulangUrl: asString(r[14]),
    keterangan: asString(r[15]),
    dibuatPada: asString(r[16])
  };
}

/** parseTanggal versi longgar (untuk baca sheet; gagal → string mentah). */
function parseTanggalLoose(v) {
  try { return parseTanggal(v); } catch (e) { return asString(v); }
}

/** Cari baris presensi berdasarkan anggotaId + tanggal (dd/mm/yyyy). */
function findPresensiRow(ss, anggotaId, tanggal) {
  var rows = getDataRows(getPresensiSheet(ss));
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][2]) === asString(anggotaId) && parseTanggalLoose(rows[i][1]) === tanggal) {
      return i + 2;
    }
  }
  return -1;
}

/** Daftar presensi dengan filter opsional: tanggalDari, tanggalSampai, tipe, kelasNama, anggotaId. */
function getPresensiList(ss, filter) {
  filter = filter || {};
  var dari = filter.tanggalDari ? tanggalToSort(parseTanggal(filter.tanggalDari)) : null;
  var sampai = filter.tanggalSampai ? tanggalToSort(parseTanggal(filter.tanggalSampai)) : null;
  var tipe = asString(filter.tipe).toUpperCase();
  var kelasNama = asString(filter.kelasNama).toLowerCase();
  var anggotaId = asString(filter.anggotaId);
  var rows = getDataRows(getPresensiSheet(ss));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var o = presensiRowToObj(rows[i]);
    if (!o.id) continue;
    if (dari && tanggalToSort(o.tanggal) < dari) continue;
    if (sampai && tanggalToSort(o.tanggal) > sampai) continue;
    if (tipe && o.tipe !== tipe) continue;
    if (kelasNama && o.kelasNama.toLowerCase() !== kelasNama) continue;
    if (anggotaId && o.anggotaId !== anggotaId) continue;
    out.push(o);
  }
  return out;
}

/** Ambil konfigurasi GPS dari Pengaturan. {aktif:false} jika belum dikonfigurasi. */
function parseGpsConfig(settings) {
  var lat = parseFloat(String(settings.lat).replace(',', '.'));
  var lng = parseFloat(String(settings.lng).replace(',', '.'));
  var r = parseFloat(String(settings.radiusMeter).replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || isNaN(r) || r <= 0) return { aktif: false };
  return { aktif: true, lat: lat, lng: lng, radiusMeter: r };
}

/** Validasi radius GPS; throw dengan pesan memuat jarak jika di luar radius. */
function validasiRadius(cfg, latRaw, lngRaw) {
  var aLat = parseFloat(String(latRaw).replace(',', '.'));
  var aLng = parseFloat(String(lngRaw).replace(',', '.'));
  if (isNaN(aLat) || isNaN(aLng)) throw new Error('Koordinat GPS tidak valid.');
  var jarak = distanceMeters(cfg.lat, cfg.lng, aLat, aLng);
  if (jarak > cfg.radiusMeter) {
    throw new Error('Lokasi Anda ' + Math.round(jarak) + ' m dari titik sekolah (radius ' +
      Math.round(cfg.radiusMeter) + ' m). Presensi ditolak.');
  }
  return jarak;
}

function tebakMimeDariNama(fileName) {
  var n = asString(fileName).toLowerCase();
  if (/\.png$/.test(n)) return 'image/png';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  if (/\.gif$/.test(n)) return 'image/gif';
  if (/\.webp$/.test(n)) return 'image/webp';
  return '';
}

/** Ambil/buat folder Drive bertingkat, mis. ['PresensiSekolah_Files','Presensi','2026-10']. */
function getOrCreateDriveFolder_(pathParts) {
  var folder = null;
  for (var i = 0; i < pathParts.length; i++) {
    var name = pathParts[i];
    var next = null;
    try {
      if (folder === null) {
        var roots = DriveApp.getFoldersByName(name);
        next = roots.hasNext() ? roots.next() : DriveApp.createFolder(name);
      } else {
        var subs = folder.getFoldersByName(name);
        next = subs.hasNext() ? subs.next() : folder.createFolder(name);
      }
      try { next.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e1) {}
    } catch (permErr) {
      throw new Error('Izin Google Drive belum diberikan. Jalankan fungsi "authorizeDriveAccess" di editor Apps Script, setujui izinnya, lalu coba lagi.');
    }
    folder = next;
  }
  return folder;
}

/**
 * Simpan foto presensi ke Drive: folder PresensiSekolah_Files/Presensi/YYYY-MM,
 * nama MASUK_<anggotaId>_<yyyymmdd>_<hhmmss>.jpg (atau PULANG_...).
 * Mengembalikan {fileId, url}. Throw dengan pesan jelas jika tidak valid.
 */
function uploadFotoPresensi(ss, opt) {
  var base64Data = asString(opt.base64Data);
  if (!base64Data) throw new Error('Foto presensi wajib diunggah.');
  var clean = base64Data.indexOf(',') > -1 ? base64Data.split(',')[1] : base64Data;
  clean = clean.replace(/\s+/g, '');
  if (clean.length > MAX_FOTO_BASE64) throw new Error('Ukuran foto maksimal 1,5 MB.');
  var mime = asString(opt.mimeType) || tebakMimeDariNama(opt.fileName);
  if (!/^image\//.test(mime)) throw new Error('Foto harus berupa gambar (JPG/PNG).');

  var tanggal = opt.tanggal; // sudah dd/mm/yyyy
  var ym = tanggalToSort(tanggal).slice(0, 4) + '-' + tanggalToSort(tanggal).slice(4, 6);
  var folder = getOrCreateDriveFolder_(['PresensiSekolah_Files', 'Presensi', ym]);

  var jamCompact = asString(opt.jam).replace(/:/g, '').slice(0, 6);
  var namaFile = opt.jenis + '_' + sanitizeFileName(opt.anggotaId) + '_' +
    tanggalToSort(tanggal) + '_' + jamCompact + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(clean), mime, namaFile);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
  var fileId = file.getId();
  return { fileId: fileId, url: 'https://lh3.googleusercontent.com/d/' + fileId };
}

/** Nomor WA tujuan: SISWA → NoWAOrtu, GURU → NoWA. */
function nomorWATujuan(anggota) {
  if (!anggota) return '';
  return anggota.tipe === 'SISWA' ? anggota.noWAOrtu : anggota.noWA;
}

// ---------- Aksi: checkIn ----------
function actionCheckIn(ss, p) {
  var anggotaId = asString(p.anggotaId);
  if (!anggotaId) throw new Error('anggotaId wajib diisi.');
  var anggota = getAnggotaById(ss, anggotaId);
  if (!anggota) throw new Error('Anggota tidak ditemukan (ID: ' + anggotaId + ').');
  if (!anggota.statusAktif) throw new Error('Anggota "' + anggota.nama + '" sudah tidak aktif.');

  var tanggal = parseTanggal(p.tanggal);

  var libur = isHariLibur(ss, tanggal);
  if (libur) throw new Error('Tanggal ' + tanggal + ' adalah hari libur (' + (libur.keterangan || 'libur') + '). Presensi ditolak.');

  var shift = getShiftAcuan(ss, anggota);
  var hari = weekday1to7(tanggal);
  if (shift.hariAktifList.indexOf(hari) === -1) {
    throw new Error('Tanggal ' + tanggal + ' di luar jadwal shift "' + shift.namaShift + '".');
  }

  var jam = asString(p.jam);
  var jamSec = parseJamToSec(jam);
  var jamMin = Math.floor(jamSec / 60);
  var masukMin = parseJamHM(shift.jamMasuk);
  var pulangMin = parseJamHM(shift.jamPulang);
  var batasAwalMin = masukMin - 120;
  if (jamMin < batasAwalMin || jamMin > pulangMin) {
    throw new Error('Di luar jam presensi (pukul ' + shift.jamMasuk + '–' + shift.jamPulang + ', maksimal 2 jam sebelum masuk).');
  }

  if (findPresensiRow(ss, anggotaId, tanggal) > 0) {
    throw new Error('Anggota ini sudah presensi MASUK pada ' + tanggal + '.');
  }

  var tolMin = Math.max(0, asNumber(shift.toleransiMenit));
  var statusMasuk = jamSec > (masukMin + tolMin) * 60 ? 'TERLAMBAT' : 'HADIR';

  var settings = getSettings(ss);
  var cfg = parseGpsConfig(settings);
  if (cfg.aktif) validasiRadius(cfg, p.lat, p.lng);

  var foto = uploadFotoPresensi(ss, {
    base64Data: p.fotoBase64, mimeType: p.mimeType, fileName: p.fileName,
    anggotaId: anggotaId, tanggal: tanggal, jam: jam, jenis: 'MASUK'
  });

  var keterangan = '';
  if (statusMasuk === 'TERLAMBAT') {
    var telatMin = Math.max(1, Math.round((jamSec - masukMin * 60) / 60));
    keterangan = 'Terlambat ' + telatMin + ' menit';
  }

  var sheet = getPresensiSheet(ss);
  var row = [newUuid('PRS'), tanggal, anggotaId, anggota.nama, anggota.tipe, anggota.kelasNama,
    jam, '', asString(p.lat), asString(p.lng), '', '', statusMasuk, foto.url, '', keterangan, nowISO()];
  sheet.appendRow(row);
  var record = presensiRowToObj(row);

  var wa = kirimWAAman(ss, nomorWATujuan(anggota), settings.waTemplateMasuk,
    { nama: anggota.nama, tanggal: tanggal, jam: jam, status: statusMasuk });

  return { record: record, statusMasuk: statusMasuk, waTerkirim: wa.terkirim };
}

// ---------- Aksi: checkOut ----------
function actionCheckOut(ss, p) {
  var anggotaId = asString(p.anggotaId);
  if (!anggotaId) throw new Error('anggotaId wajib diisi.');
  var anggota = getAnggotaById(ss, anggotaId);
  if (!anggota) throw new Error('Anggota tidak ditemukan (ID: ' + anggotaId + ').');
  if (!anggota.statusAktif) throw new Error('Anggota "' + anggota.nama + '" sudah tidak aktif.');

  var tanggal = parseTanggal(p.tanggal);
  var sheet = getPresensiSheet(ss);
  var rowNum = findPresensiRow(ss, anggotaId, tanggal);
  if (rowNum < 2) throw new Error('Belum ada presensi MASUK pada ' + tanggal + '. Lakukan presensi masuk dulu.');
  var jamPulangLama = asString(sheet.getRange(rowNum, 8).getValue());
  if (jamPulangLama) throw new Error('Sudah presensi PULANG pada ' + tanggal + ' pukul ' + jamPulangLama + '.');

  var jam = asString(p.jam);
  parseJamToSec(jam); // validasi format

  var settings = getSettings(ss);
  var cfg = parseGpsConfig(settings);
  if (cfg.aktif) validasiRadius(cfg, p.lat, p.lng);

  var foto = uploadFotoPresensi(ss, {
    base64Data: p.fotoBase64, mimeType: p.mimeType, fileName: p.fileName,
    anggotaId: anggotaId, tanggal: tanggal, jam: jam, jenis: 'PULANG'
  });

  sheet.getRange(rowNum, 8).setValue(jam);
  sheet.getRange(rowNum, 11).setValue(asString(p.lat));
  sheet.getRange(rowNum, 12).setValue(asString(p.lng));
  sheet.getRange(rowNum, 15).setValue(foto.url);

  var row = getDataRows(sheet)[rowNum - 2];
  row[7] = jam; row[10] = asString(p.lat); row[11] = asString(p.lng); row[14] = foto.url;
  var record = presensiRowToObj(row);

  var wa = kirimWAAman(ss, nomorWATujuan(anggota), settings.waTemplatePulang,
    { nama: anggota.nama, tanggal: tanggal, jam: jam });

  return { record: record, waTerkirim: wa.terkirim };
}

// ============================================================
// IZIN
// ============================================================
function getIzinSheet(ss) {
  return getOrCreateSheet(ss, SHEET_IZIN);
}

function izinRowToObj(r) {
  return {
    id: asString(r[0]),
    tanggal: parseTanggalLoose(r[1]),
    anggotaId: asString(r[2]),
    nama: asString(r[3]),
    tipe: asString(r[4]).toUpperCase(),
    kelasNama: asString(r[5]),
    jenis: asString(r[6]),
    keterangan: asString(r[7]),
    status: asString(r[8]).toUpperCase(),
    diajukanOleh: asString(r[9]),
    disetujuiOleh: asString(r[10]),
    waktuPengajuan: asString(r[11])
  };
}

function getIzinList(ss, statusFilter) {
  var rows = getDataRows(getIzinSheet(ss));
  var sf = asString(statusFilter).toUpperCase();
  return rows.map(izinRowToObj).filter(function (z) {
    if (!z.id) return false;
    if (sf && z.status !== sf) return false;
    return true;
  });
}

function actionAjukanIzin(ss, p) {
  var item = p.item || {};
  var anggotaId = asString(item.anggotaId);
  var anggota = getAnggotaById(ss, anggotaId);
  if (!anggota) throw new Error('Anggota tidak ditemukan (ID: ' + anggotaId + ').');
  if (!anggota.statusAktif) throw new Error('Anggota "' + anggota.nama + '" sudah tidak aktif.');
  var tanggal = parseTanggal(item.tanggal);
  var jenis = asString(item.jenis);
  if (['Sakit', 'Izin', 'Keperluan'].indexOf(jenis) === -1) {
    throw new Error('Jenis izin tidak valid (Sakit/Izin/Keperluan).');
  }
  var row = [newUuid('IZN'), tanggal, anggotaId, anggota.nama, anggota.tipe, anggota.kelasNama,
    jenis, asString(item.keterangan), 'MENUNGGU', asString(item.diajukanOleh), '', nowISO()];
  getIzinSheet(ss).appendRow(row);
  return { item: izinRowToObj(row) };
}

function actionPutuskanIzin(ss, p) {
  var id = asString(p.id);
  var keputusan = asString(p.keputusan).toUpperCase();
  if (keputusan !== 'DISETUJUI' && keputusan !== 'DITOLAK') {
    throw new Error('Keputusan tidak valid (DISETUJUI/DITOLAK).');
  }
  var sheet = getIzinSheet(ss);
  var rowNum = findRowById(sheet, id);
  if (rowNum < 2) throw new Error('Data izin tidak ditemukan (ID: ' + id + ').');
  var statusLama = asString(sheet.getRange(rowNum, 9).getValue()).toUpperCase();
  if (statusLama !== 'MENUNGGU') throw new Error('Izin ini sudah diputuskan (' + statusLama + ').');
  var oleh = asString(p.oleh);
  sheet.getRange(rowNum, 9).setValue(keputusan);
  sheet.getRange(rowNum, 11).setValue(oleh);
  var row = getDataRows(sheet)[rowNum - 2];
  row[8] = keputusan; row[10] = oleh;
  var item = izinRowToObj(row);

  var anggota = getAnggotaById(ss, item.anggotaId);
  var settings = getSettings(ss);
  var keputusanTeks = keputusan === 'DISETUJUI' ? 'disetujui' : 'ditolak';
  var wa = kirimWAAman(ss, nomorWATujuan(anggota), settings.waTemplateIzin,
    { nama: item.nama, tanggal: item.tanggal, jenis: item.jenis, keputusan: keputusanTeks });

  return { item: item, waTerkirim: wa.terkirim };
}

// ============================================================
// DASHBOARD HARIAN
// ============================================================
/**
 * Ringkasan per tipe (GURU/SISWA) untuk satu tanggal.
 * hadir = jumlah check-in (termasuk yang TERLAMBAT); terlambat = subset dari hadir;
 * izin = izin DISETUJUI pada tanggal itu (yang sudah check-in tidak dihitung ganda);
 * belumAbsen = total − hadir − izin.
 */
function getDashboardData(ss, params) {
  var tanggal = params.tanggal ? parseTanggal(params.tanggal) : formatTanggalID(new Date());
  var anggota = getAnggotaList(ss).filter(function (a) { return a.statusAktif; });
  var pres = getPresensiList(ss, { tanggalDari: tanggal, tanggalSampai: tanggal });
  var izinOk = getIzinList(ss, 'DISETUJUI').filter(function (z) { return z.tanggal === tanggal; });

  function ringkas(tipe) {
    var ids = {};
    var total = 0;
    for (var i = 0; i < anggota.length; i++) {
      if (anggota[i].tipe === tipe) { ids[anggota[i].id] = true; total++; }
    }
    var hadir = 0, terlambat = 0, izin = 0;
    var hadirIds = {};
    for (var j = 0; j < pres.length; j++) {
      if (ids[pres[j].anggotaId]) {
        hadir++;
        hadirIds[pres[j].anggotaId] = true;
        if (pres[j].statusMasuk === 'TERLAMBAT') terlambat++;
      }
    }
    for (var k = 0; k < izinOk.length; k++) {
      if (ids[izinOk[k].anggotaId] && !hadirIds[izinOk[k].anggotaId]) izin++;
    }
    return { hadir: hadir, terlambat: terlambat, izin: izin, belumAbsen: Math.max(0, total - hadir - izin), total: total };
  }

  var daftarTerlambat = [];
  for (var t = 0; t < pres.length; t++) {
    if (pres[t].statusMasuk === 'TERLAMBAT') {
      daftarTerlambat.push({
        anggotaId: pres[t].anggotaId,
        nama: pres[t].nama,
        tipe: pres[t].tipe,
        kelasNama: pres[t].kelasNama,
        jamMasuk: pres[t].jamMasuk
      });
    }
  }

  return {
    tanggal: tanggal,
    guru: ringkas('GURU'),
    siswa: ringkas('SISWA'),
    terlambat: daftarTerlambat
  };
}

// ============================================================
// REKAP BULANAN
// ============================================================
/**
 * Rekap per anggota untuk satu bulan (mm/yyyy).
 * hariEfektif = hari aktif shift anggota − hari libur (yang jatuh di hari aktif);
 * hadir = jumlah check-in (termasuk TERLAMBAT); izin = hari izin DISETUJUI;
 * alpa = hariEfektif − hadir − izin (tidak negatif).
 */
function getRekapData(ss, params) {
  var m = asString(params.bulan).match(/^(\d{2})\/(\d{4})$/);
  if (!m) throw new Error('Format bulan tidak valid (gunakan mm/yyyy).');
  var bulan = parseInt(m[1], 10), tahun = parseInt(m[2], 10);
  if (bulan < 1 || bulan > 12) throw new Error('Bulan tidak valid: ' + params.bulan + '.');
  var tipeFilter = asString(params.tipe).toUpperCase();

  var daftar = getAnggotaList(ss).filter(function (a) {
    return !tipeFilter || a.tipe === tipeFilter;
  });
  var liburSet = {};
  var liburList = getHariLiburList(ss);
  for (var l = 0; l < liburList.length; l++) liburSet[liburList[l].tanggal] = true;

  var shifts = getShiftList(ss);
  var awalan = pad2(bulan) + '/' + tahun; // untuk filter cepat 'mm/yyyy'
  var presBulan = [];
  var semuaPres = getPresensiList(ss, {});
  for (var q = 0; q < semuaPres.length; q++) {
    if (semuaPres[q].tanggal.slice(3) === awalan) presBulan.push(semuaPres[q]);
  }
  var izinBulan = [];
  var semuaIzin = getIzinList(ss, 'DISETUJUI');
  for (var w = 0; w < semuaIzin.length; w++) {
    if (semuaIzin[w].tanggal.slice(3) === awalan) izinBulan.push(semuaIzin[w]);
  }

  var daysInMonth = new Date(tahun, bulan, 0).getDate();
  var rows = [];
  for (var a = 0; a < daftar.length; a++) {
    var ag = daftar[a];
    var shift = null;
    if (shifts.length > 0) {
      shift = shifts[0];
      for (var s = 0; s < shifts.length; s++) {
        if (shifts[s].id === ag.shiftId) { shift = shifts[s]; break; }
      }
    }
    var efektif = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var t = pad2(d) + '/' + pad2(bulan) + '/' + tahun;
      if (liburSet[t]) continue;
      if (!shift) { efektif++; continue; } // tanpa shift: semua hari non-libur efektif
      if (shift.hariAktifList.indexOf(weekday1to7(t)) > -1) efektif++;
    }
    var hadir = 0, terlambat = 0;
    for (var p = 0; p < presBulan.length; p++) {
      if (presBulan[p].anggotaId === ag.id) {
        hadir++;
        if (presBulan[p].statusMasuk === 'TERLAMBAT') terlambat++;
      }
    }
    var izinSet = {};
    for (var z = 0; z < izinBulan.length; z++) {
      if (izinBulan[z].anggotaId === ag.id) izinSet[izinBulan[z].tanggal] = true;
    }
    var izin = Object.keys(izinSet).length;
    rows.push({
      anggotaId: ag.id,
      nama: ag.nama,
      tipe: ag.tipe,
      kelasNama: ag.kelasNama,
      hadir: hadir,
      terlambat: terlambat,
      izin: izin,
      alpa: Math.max(0, efektif - hadir - izin),
      hariEfektif: efektif
    });
  }
  return { bulan: pad2(bulan) + '/' + tahun, rows: rows };
}

// ============================================================
// WHATSAPP (best-effort — tidak pernah melempar error)
// ============================================================
/**
 * Kirim pesan WA via endpoint milik sekolah (diatur di Pengaturan).
 * SELALU mengembalikan {success:true, terkirim:boolean, pesan} — tidak pernah throw
 * dan tidak pernah success:false. Jika waAktif != true atau endpoint/key kosong,
 * TIDAK ada request jaringan sama sekali.
 */
function kirimWAAman(ss, to, template, params) {
  try {
    var settings = getSettings(ss);
    var waAktif = asString(settings.waAktif).toLowerCase() === 'true';
    var endpoint = asString(settings.waEndpoint);
    var apiKey = asString(settings.waApiKey);
    to = asString(to);
    if (!to) {
      return { success: true, terkirim: false, pesan: 'Nomor WA tujuan kosong — dilewati.' };
    }
    if (!waAktif || !endpoint || !apiKey) {
      return { success: true, terkirim: false, pesan: 'WA belum dikonfigurasi — dilewati.' };
    }
    var message = fillTemplate(template, params);
    UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ to: to, message: message, apiKey: apiKey }),
      muteHttpExceptions: true
    });
    return { success: true, terkirim: true, pesan: 'Pesan WA terkirim ke ' + to + '.' };
  } catch (err) {
    return { success: true, terkirim: false, pesan: 'Gagal: ' + err.message };
  }
}

// ============================================================
// UPLOAD LOGO KE GOOGLE DRIVE
// ============================================================

/**
 * Jalankan manual sekali dari editor Apps Script untuk memberi izin Drive.
 */
function authorizeDriveAccess() {
  var folders = DriveApp.getFoldersByName('PresensiSekolah_Files');
  return 'OK — akses Drive aktif. Jumlah folder: ' + (folders.hasNext() ? 1 : 0);
}

/**
 * Terima {fileName, base64Data, mimeType} → simpan ke Drive → simpan URL di Pengaturan.logoUrl.
 * Mengembalikan {success, message, error, data:{fileId, url}}.
 */
function uploadLogoFile(ss, payload) {
  try {
    var rawName = asString(payload.fileName) || ('logo_' + Date.now() + '.png');
    var cleanName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    var base64Data = asString(payload.base64Data);
    var mimeType = asString(payload.mimeType) || 'image/png';

    if (!base64Data) {
      return { success: false, message: 'Data gambar kosong.' };
    }
    if (!/^image\//.test(mimeType)) {
      return { success: false, message: 'File harus berupa gambar (PNG/JPG).' };
    }
    var cleanBase64 = base64Data.indexOf(',') > -1 ? base64Data.split(',')[1] : base64Data;
    cleanBase64 = cleanBase64.replace(/\s+/g, '');
    // Batas 2 MB (base64 ~2,7 juta karakter)
    if (cleanBase64.length > 2800000) {
      return { success: false, message: 'Ukuran gambar maksimal 2 MB.' };
    }

    var folder = getOrCreateDriveFolder_(['PresensiSekolah_Files']);
    var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), mimeType, cleanName);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}

    var fileId = file.getId();
    var logoUrl = 'https://lh3.googleusercontent.com/d/' + fileId;

    var sheet = getPengaturanSheet(ss);
    var rowNum = findRowByKey(sheet, 'logoUrl');
    if (rowNum > 0) {
      sheet.getRange(rowNum, 2).setValue(logoUrl);
    } else {
      sheet.appendRow(['logoUrl', logoUrl]);
    }

    return { success: true, message: 'Logo berhasil diunggah.', data: { fileId: fileId, url: logoUrl } };
  } catch (err) {
    return { success: false, message: 'Gagal mengunggah logo: ' + err.message, error: String(err) };
  }
}
