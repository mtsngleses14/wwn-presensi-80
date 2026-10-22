import type {
  AnggotaItem,
  ApiResult,
  AppDatabase,
  CheckInResult,
  CheckOutResult,
  DashboardData,
  DatabaseStatus,
  HariLiburItem,
  IzinItem,
  ImportResult,
  ImportRow,
  JenisIzin,
  KelasItem,
  Pengaturan,
  PenggunaItem,
  PenggunaLogin,
  PresensiItem,
  RekapRow,
  ShiftItem,
  StatusIzin,
  TipeAnggota,
} from '../types';

// ============================================================
// Klien API Google Apps Script — sesuai docs/API_CONTRACT.md:
//  - GET  : ?action=...&param=... (baca data)
//  - POST : JSON { action, ... } dengan Content-Type text/plain
//          (menghindari preflight CORS di Apps Script)
//  - Envelope: { success, message, data, error }
//  - Tanggal: dd/mm/yyyy • Jam: HH:MM:SS
// ============================================================

function validUrl(apiUrl: string): boolean {
  return !!apiUrl && apiUrl.trim().startsWith('http');
}

async function getAction<T>(
  apiUrl: string,
  action: string,
  params: Record<string, string | undefined> = {}
): Promise<ApiResult<T>> {
  if (!validUrl(apiUrl)) {
    return { success: false, message: 'URL backend belum dikonfigurasi.', error: 'URL backend belum dikonfigurasi.' };
  }
  try {
    const url = new URL(apiUrl.trim());
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
    url.searchParams.set('_t', Date.now().toString());
    const res = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Server merespons HTTP ${res.status}`);
    const json = await res.json();
    return {
      success: json.success !== false,
      message: json.message || 'OK',
      data: json.data as T,
      error: json.error,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan jaringan';
    return { success: false, message: 'Gagal menghubungi backend.', error: msg };
  }
}

async function postAction<T>(apiUrl: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  if (!validUrl(apiUrl)) {
    return { success: false, message: 'URL backend belum dikonfigurasi.', error: 'URL backend belum dikonfigurasi.' };
  }
  try {
    const res = await fetch(apiUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Server merespons HTTP ${res.status}`);
    const json = await res.json();
    return {
      success: json.success !== false,
      message: json.message || 'Berhasil.',
      data: json.data as T,
      error: json.error,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan jaringan';
    return { success: false, message: 'Gagal mengirim data ke backend.', error: msg };
  }
}

// ---------- Koneksi & inisialisasi ----------

export async function pingBackend(apiUrl: string): Promise<ApiResult<{ version?: string }>> {
  return getAction(apiUrl, 'ping');
}

export async function initDatabase(apiUrl: string): Promise<ApiResult<DatabaseStatus>> {
  return postAction(apiUrl, { action: 'initDatabase' });
}

export async function fetchAllData(apiUrl: string): Promise<ApiResult<AppDatabase & { database: DatabaseStatus }>> {
  return getAction(apiUrl, 'getAllData');
}

// ---------- Login ----------

export async function loginBackend(
  apiUrl: string,
  username: string,
  password: string
): Promise<ApiResult<{ user: PenggunaLogin }>> {
  return postAction(apiUrl, { action: 'login', username: username.trim(), password });
}

// ---------- Pengaturan ----------

export async function saveSettings(apiUrl: string, pengaturan: Pengaturan): Promise<ApiResult<{ pengaturan: Pengaturan }>> {
  return postAction(apiUrl, { action: 'saveSettings', pengaturan });
}

/** Unggah logo ke Google Drive via backend. Mengembalikan URL publik logo. */
export async function uploadLogo(
  apiUrl: string,
  params: { fileName: string; base64Data: string; mimeType: string }
): Promise<ApiResult<{ fileId: string; url: string }>> {
  return postAction(apiUrl, { action: 'uploadLogo', ...params });
}

// ---------- CRUD: Anggota ----------

export async function saveAnggota(apiUrl: string, item: AnggotaItem): Promise<ApiResult<{ item: AnggotaItem }>> {
  return postAction(apiUrl, { action: 'saveAnggota', item });
}

export async function deleteAnggota(apiUrl: string, id: string): Promise<ApiResult> {
  return postAction(apiUrl, { action: 'deleteAnggota', id });
}

export async function importAnggota(
  apiUrl: string,
  rows: ImportRow[]
): Promise<ApiResult<ImportResult>> {
  return postAction(apiUrl, { action: 'importAnggota', rows });
}

// ---------- CRUD: Kelas ----------

export async function saveKelas(apiUrl: string, item: KelasItem): Promise<ApiResult<{ item: KelasItem }>> {
  return postAction(apiUrl, { action: 'saveKelas', item });
}

export async function deleteKelas(apiUrl: string, id: string): Promise<ApiResult> {
  return postAction(apiUrl, { action: 'deleteKelas', id });
}

// ---------- CRUD: Shift ----------

export async function saveShift(apiUrl: string, item: ShiftItem): Promise<ApiResult<{ item: ShiftItem }>> {
  return postAction(apiUrl, { action: 'saveShift', item });
}

export async function deleteShift(apiUrl: string, id: string): Promise<ApiResult> {
  return postAction(apiUrl, { action: 'deleteShift', id });
}

// ---------- CRUD: Hari Libur ----------

export async function saveHariLibur(
  apiUrl: string,
  item: HariLiburItem
): Promise<ApiResult<{ item: HariLiburItem }>> {
  return postAction(apiUrl, { action: 'saveHariLibur', item });
}

export async function deleteHariLibur(apiUrl: string, tanggal: string): Promise<ApiResult> {
  return postAction(apiUrl, { action: 'deleteHariLibur', id: tanggal });
}

// ---------- CRUD: Pengguna ----------

/** CATATAN: saat mengedit, kirim `password: ''` agar backend mempertahankan password lama. */
export async function savePengguna(
  apiUrl: string,
  item: PenggunaItem & { password?: string }
): Promise<ApiResult<{ item: PenggunaItem }>> {
  return postAction(apiUrl, { action: 'savePengguna', item });
}

export async function deletePengguna(apiUrl: string, username: string): Promise<ApiResult> {
  return postAction(apiUrl, { action: 'deletePengguna', id: username });
}

// ---------- Presensi ----------

export interface CheckInParams {
  anggotaId: string;
  tanggal: string; // dd/mm/yyyy
  jam: string; // HH:MM:SS
  lat: number | string;
  lng: number | string;
  fotoBase64: string; // tanpa prefix data:
  fileName: string;
}

export async function checkIn(apiUrl: string, p: CheckInParams): Promise<ApiResult<CheckInResult>> {
  return postAction(apiUrl, { action: 'checkIn', ...p });
}

export async function checkOut(apiUrl: string, p: CheckInParams): Promise<ApiResult<CheckOutResult>> {
  return postAction(apiUrl, { action: 'checkOut', ...p });
}

// ---------- Izin ----------

export interface FilterIzin {
  status?: StatusIzin | 'SEMUA';
}

export async function getIzin(apiUrl: string, filter: FilterIzin = {}): Promise<ApiResult<{ items: IzinItem[] }>> {
  const params: Record<string, string | undefined> = {};
  if (filter.status && filter.status !== 'SEMUA') params.status = filter.status;
  return getAction(apiUrl, 'getIzin', params);
}

export async function ajukanIzin(
  apiUrl: string,
  item: { tanggal: string; anggotaId: string; jenis: JenisIzin; keterangan: string; diajukanOleh: string }
): Promise<ApiResult<{ item: IzinItem }>> {
  return postAction(apiUrl, { action: 'ajukanIzin', item });
}

export async function putuskanIzin(
  apiUrl: string,
  id: string,
  keputusan: 'DISETUJUI' | 'DITOLAK',
  oleh: string
): Promise<ApiResult<{ item: IzinItem; waTerkirim: boolean }>> {
  return postAction(apiUrl, { action: 'putuskanIzin', id, keputusan, oleh });
}

// ---------- Laporan presensi ----------

export interface FilterPresensi {
  tanggalDari?: string; // dd/mm/yyyy
  tanggalSampai?: string; // dd/mm/yyyy
  tipe?: TipeAnggota | 'SEMUA';
  kelasNama?: string;
  anggotaId?: string;
}

export async function getPresensi(
  apiUrl: string,
  filter: FilterPresensi = {}
): Promise<ApiResult<{ items: PresensiItem[] }>> {
  return getAction(apiUrl, 'getPresensi', {
    tanggalDari: filter.tanggalDari,
    tanggalSampai: filter.tanggalSampai,
    tipe: filter.tipe && filter.tipe !== 'SEMUA' ? filter.tipe : undefined,
    kelasNama: filter.kelasNama,
    anggotaId: filter.anggotaId,
  });
}

// ---------- Dashboard & rekap ----------

export async function getDashboard(apiUrl: string, tanggal: string): Promise<ApiResult<DashboardData>> {
  return getAction(apiUrl, 'getDashboard', { tanggal });
}

export async function getRekap(
  apiUrl: string,
  bulan: string, // mm/yyyy
  tipe: TipeAnggota
): Promise<ApiResult<{ bulan: string; rows: RekapRow[] }>> {
  return getAction(apiUrl, 'getRekap', { bulan, tipe });
}

// ---------- Notifikasi WhatsApp manual ----------

export interface KirimWAParams {
  to: string;
  template: string;
  params: {
    nama: string;
    tanggal: string;
    jam: string;
    status?: string;
    jenis?: string;
    keputusan?: string;
  };
}

export async function kirimWA(
  apiUrl: string,
  p: KirimWAParams
): Promise<ApiResult<{ terkirim: boolean; pesan: string }>> {
  return postAction(apiUrl, { action: 'kirimWA', ...p });
}
