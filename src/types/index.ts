// ============================================================
// Tipe data aplikasi Presensi Sekolah Digital (wwn-presensi-80)
// Sesuai docs/API_CONTRACT.md v1.0.0 — jangan diubah sendiri.
// ============================================================

export interface SchoolEntry {
  id: string;
  nama: string;
  apiUrl: string;
  kota?: string;
}

export interface Pengaturan {
  namaSekolah: string;
  npsn: string;
  alamat: string;
  telepon: string;
  tahunPelajaran: string;
  kepalaSekolah: string;
  logoUrl: string;
  lat: string;
  lng: string;
  radiusMeter: string;
  waAktif: string;
  waEndpoint: string;
  waApiKey: string;
  waTemplateMasuk: string;
  waTemplatePulang: string;
  waTemplateIzin: string;
}

export type TipeAnggota = 'GURU' | 'SISWA';

export interface AnggotaItem {
  id: string;
  nama: string;
  tipe: TipeAnggota;
  kelasId: string;
  kelasNama: string;
  jabatan: string;
  noWA: string;
  noWAOrtu: string;
  shiftId: string;
  statusAktif: boolean;
}

export interface KelasItem {
  id: string;
  nama: string;
  tingkat: string;
  waliKelas: string;
}

export interface ShiftItem {
  id: string;
  nama: string;
  jamMasuk: string; // HH:MM
  jamPulang: string; // HH:MM
  toleransiMenit: number;
  hariAktif: string; // "1,2,3,4,5,6" (1=Senin ... 7=Minggu)
  keterangan: string;
}

export type StatusMasuk = 'HADIR' | 'TERLAMBAT';

export interface PresensiItem {
  id: string;
  tanggal: string; // dd/mm/yyyy
  anggotaId: string;
  nama: string;
  tipe: TipeAnggota;
  kelasNama: string;
  jamMasuk: string; // HH:MM:SS
  jamPulang: string;
  latMasuk: string;
  lngMasuk: string;
  latPulang: string;
  lngPulang: string;
  statusMasuk: StatusMasuk | '';
  fotoMasukUrl: string;
  fotoPulangUrl: string;
  keterangan: string;
  dibuatPada: string;
}

export type JenisIzin = 'Sakit' | 'Izin' | 'Keperluan';
export type StatusIzin = 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK';

export interface IzinItem {
  id: string;
  tanggal: string; // dd/mm/yyyy
  anggotaId: string;
  nama: string;
  tipe: TipeAnggota;
  kelasNama: string;
  jenis: JenisIzin;
  keterangan: string;
  status: StatusIzin;
  diajukanOleh: string;
  disetujuiOleh: string;
  waktuPengajuan: string;
}

export interface PenggunaItem {
  username: string;
  nama: string;
  peran: 'admin' | 'operator';
  statusAktif: boolean;
}

/** Pengguna yang sedang login (tanpa password). */
export interface PenggunaLogin {
  username: string;
  nama: string;
  peran: 'admin' | 'operator';
}

export interface AuthSession {
  isLoggedIn: boolean;
  user: PenggunaLogin | null;
}

export interface HariLiburItem {
  tanggal: string; // dd/mm/yyyy — juga dipakai sebagai ID
  keterangan: string;
}

// ---------- Dashboard ----------

export interface RingkasTipe {
  hadir: number;
  terlambat: number;
  izin: number;
  belumAbsen: number;
  total: number;
}

export interface TerlambatItem {
  nama: string;
  tipe: TipeAnggota;
  kelasNama: string;
  jamMasuk: string;
}

export interface DashboardData {
  tanggal: string; // dd/mm/yyyy
  guru: RingkasTipe;
  siswa: RingkasTipe;
  terlambat: TerlambatItem[];
}

// ---------- Rekap ----------

export interface RekapRow {
  anggotaId: string;
  nama: string;
  tipe: TipeAnggota;
  kelasNama: string;
  hadir: number;
  terlambat: number;
  izin: number;
  alpa: number;
  hariEfektif: number;
}

// ---------- Impor anggota ----------

export interface ImportRow {
  nama: string;
  tipe: TipeAnggota | string;
  kelasNama?: string;
  jabatan?: string;
  noWA?: string;
  noWAOrtu?: string;
  shiftNama?: string;
}

export interface ImportError {
  baris: number;
  pesan: string;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: ImportError[];
}

// ---------- CheckIn / CheckOut ----------

export interface CheckInResult {
  record: PresensiItem;
  statusMasuk: StatusMasuk;
  waTerkirim: boolean;
}

export interface CheckOutResult {
  record: PresensiItem;
  waTerkirim: boolean;
}

// ---------- Database ----------

export interface SheetInfo {
  name: string;
  exists: boolean;
  rowCount: number;
}

export interface DatabaseStatus {
  connected: boolean;
  spreadsheetTitle: string;
  sheets: SheetInfo[];
  lastChecked: string;
}

export interface AppDatabase {
  pengaturan: Pengaturan;
  anggota: AnggotaItem[];
  kelas: KelasItem[];
  shift: ShiftItem[];
  izin: IzinItem[];
  pengguna: PenggunaItem[];
  hariLibur: HariLiburItem[];
}

export interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export type PageKey =
  | 'dashboard'
  | 'presensi'
  | 'izin'
  | 'laporan'
  | 'rekap'
  | 'kelola'
  | 'pengaturan'
  | 'konfigurasi';

export interface ToastMsg {
  id: number;
  tipe: 'sukses' | 'error' | 'info';
  pesan: string;
}
