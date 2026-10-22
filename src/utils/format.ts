import * as XLSX from 'xlsx';

// ============================================================
// Helper format & utilitas.
// Kontrak memakai tanggal dd/mm/yyyy dan jam HH:MM:SS.
// ============================================================

/** dd/mm/yyyy hari ini (zona waktu lokal browser). */
export function todayDMY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** HH:MM:SS sekarang (zona waktu lokal browser). */
export function nowHMS(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** yyyy-mm-dd -> dd/mm/yyyy (untuk input type="date" ke kontrak). */
export function ymdKeDmy(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/mm/yyyy -> yyyy-mm-dd (untuk input type="date" dari data kontrak). */
export function dmyKeYmd(dmy: string): string {
  if (!dmy || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dmy)) return '';
  const [d, m, y] = dmy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** dd/mm/yyyy -> "21 Juli 2026" */
export function formatTanggal(dmy: string): string {
  const ymd = dmyKeYmd(dmy);
  if (!ymd) return dmy || '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return dmy;
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** dd/mm/yyyy -> "Senin, 21 Juli 2026" */
export function formatTanggalPanjang(dmy: string): string {
  const ymd = dmyKeYmd(dmy);
  if (!ymd) return dmy || '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return dmy;
  return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Hari dalam minggu (1=Senin ... 7=Minggu) dari dd/mm/yyyy. */
export function hariKeTujuh(dmy: string): number {
  const ymd = dmyKeYmd(dmy);
  const [y, m, d] = ymd.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay(); // 0=Minggu
  return js === 0 ? 7 : js;
}

/** mm/yyyy -> "Juli 2026" */
export function formatBulanMY(my: string): string {
  if (!my || !/^\d{2}\/\d{4}$/.test(my)) return my || '-';
  const [m, y] = my.split('/').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/** yyyy-mm (input type="month") -> mm/yyyy (kontrak getRekap). */
export function ymKeMy(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return '';
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}

/** Bulan berjalan dalam format kontrak: mm/yyyy */
export function bulanBerjalanMY(): string {
  const t = todayDMY();
  return t.slice(3); // "mm/yyyy"
}

/** HH:MM:SS -> HH:MM (tampilan ringkas) */
export function jamPendek(hms: string): string {
  if (!hms) return '-';
  return hms.slice(0, 5);
}

/** ID unik berawalan prefix, mis. "PRS-lxyz123". */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Normalisasi nomor WA: digit saja, awali 62. */
export function normalisasiNoWA(v: string): string {
  let s = (v || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  return s;
}

// ---------- Unduh file ----------

function unduhBlob(namaFile: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Unduh data sebagai file Excel (.xlsx) asli. */
export function unduhXlsx(namaFile: string, namaSheet: string, header: string[], baris: unknown[][]): void {
  const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
  ws['!cols'] = header.map((h) => ({ wch: Math.min(Math.max(String(h).length + 4, 14), 40) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  const nama = namaFile.endsWith('.xlsx') ? namaFile : `${namaFile}.xlsx`;
  XLSX.writeFile(wb, nama);
}

/** Escape nilai untuk CSV (Excel Indonesia memakai ; sebagai pemisah). */
function escCsv(v: unknown): string {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Unduh array baris sebagai file CSV (cadangan, terbuka rapi di Excel). */
export function unduhCsv(namaFile: string, header: string[], baris: unknown[][]): void {
  const bom = '﻿'; // U+FEFF — agar Excel membaca UTF-8 dengan benar
  const isi = [header.map(escCsv).join(';')]
    .concat(baris.map((b) => b.map(escCsv).join(';')))
    .join('\r\n');
  unduhBlob(namaFile.endsWith('.csv') ? namaFile : `${namaFile}.csv`, new Blob([bom + isi], { type: 'text/csv;charset=utf-8;' }));
}
