import * as XLSX from 'xlsx';

// ============================================================
// Template & parser Excel untuk impor data anggota (Kelola Data)
// Kolom sesuai kontrak action importAnggota:
// Nama, Tipe, KelasNama, Jabatan, NoWA, NoWAOrtu, ShiftNama
// ============================================================

export const TEMPLATE_ANGGOTA = {
  judul: 'Data Anggota',
  namaFile: 'template-anggota-presensi.xlsx',
  headers: ['Nama*', 'Tipe*', 'KelasNama', 'Jabatan', 'NoWA', 'NoWAOrtu', 'ShiftNama'],
  contoh: [
    ['Budi Santoso', 'GURU', '', 'Guru Kelas', '081234567890', '', 'Shift Pagi'],
    ['Ahmad Fauzi', 'SISWA', '7A', '', '', '081298765432', 'Shift Pagi'],
  ],
  catatan: [
    'Kolom bertanda * wajib diisi.',
    'Tipe diisi GURU atau SISWA (huruf besar).',
    'KelasNama diisi NAMA kelas yang sudah ada di database (contoh: 7A). Boleh kosong untuk guru.',
    'ShiftNama diisi NAMA shift yang sudah ada di database. Boleh kosong.',
    'NoWA = nomor WhatsApp anggota; NoWAOrtu = nomor WhatsApp orang tua (untuk siswa). Format: 08xx...',
    'Baris contoh di bawah header boleh dihapus/diubah.',
    'Jika nama + tipe sudah ada di database, datanya akan diperbarui (tidak duplikat).',
  ],
};

/** Unduh template .xlsx impor anggota. */
export function unduhTemplateAnggota(): void {
  const def = TEMPLATE_ANGGOTA;
  const ws = XLSX.utils.aoa_to_sheet([
    def.headers,
    ...def.contoh,
    [],
    ['CATATAN:'],
    ...def.catatan.map((c) => ['- ' + c]),
  ]);
  ws['!cols'] = def.headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.judul);
  XLSX.writeFile(wb, def.namaFile);
}

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

/** Baca file .xlsx/.xls/.csv → {headers, rows}. Baris kosong dilewati. */
export function parseFileExcel(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error('File tidak berisi sheet.');
        const ws = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false });
        const bersih = aoa.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
        if (bersih.length === 0) throw new Error('File kosong.');
        const headers = bersih[0].map((h) => String(h ?? '').trim());
        const rows: string[][] = [];
        for (let i = 1; i < bersih.length; i++) {
          const r0 = String(bersih[i][0] ?? '').trim().toUpperCase();
          if (r0 === 'CATATAN:' || r0.startsWith('- ')) break;
          rows.push(bersih[i].map((c) => String(c ?? '').trim()));
        }
        resolve({ headers, rows });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Format file tidak dikenali.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Normalisasi header template: "Nama*" → "nama", dst. */
export function normalisasiHeader(h: string): string {
  return h.replace(/\*/g, '').trim().toLowerCase();
}

export const HEADER_ANGGOTA_WAJIB = ['nama', 'tipe', 'kelasnama', 'jabatan', 'nowa', 'nowaortu', 'shiftnama'];
