import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload } from 'lucide-react';
import { Button, Modal } from './ui';
import { importAnggota } from '../services/gasApi';
import { HEADER_ANGGOTA_WAJIB, normalisasiHeader, parseFileExcel, unduhTemplateAnggota } from '../utils/excel';
import { normalisasiNoWA } from '../utils/format';
import type { AppDatabase, ImportRow, ToastMsg } from '../types';

// ============================================================
// Modal impor Excel anggota: pilih file → pratinjau + validasi
// → kirim SEKALIGUS via action importAnggota → hasil
// inserted/updated/errors dari backend.
// ============================================================

interface BarisValid {
  no: number;
  mentah: string[];
  row: ImportRow | null;
  errors: string[];
  mode: 'baru' | 'perbarui' | '-';
}

export default function ExcelUploadModal({
  db,
  apiUrl,
  toast,
  onTutup,
  onSelesai,
}: {
  db: AppDatabase;
  apiUrl: string;
  toast: (tipe: ToastMsg['tipe'], pesan: string) => void;
  onTutup: () => void;
  onSelesai: () => void;
}) {
  const [namaFile, setNamaFile] = useState('');
  const [baris, setBaris] = useState<BarisValid[]>([]);
  const [galatFile, setGalatFile] = useState('');
  const [memproses, setMemproses] = useState(false);
  const [mengimpor, setMengimpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const samaNama = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const validasi = (headers: string[], rows: string[][]): BarisValid[] => {
    const idx = (nama: string) => headers.findIndex((h) => normalisasiHeader(h) === nama);
    const namaKelasAda = (v: string) => db.kelas.some((k) => samaNama(k.nama, v));
    const namaShiftAda = (v: string) => db.shift.some((s) => samaNama(s.nama, v));
    const hasil: BarisValid[] = [];

    rows.forEach((r, i) => {
      const ambil = (nama: string) => {
        const p = idx(nama);
        return p >= 0 ? (r[p] || '').trim() : '';
      };
      const errors: string[] = [];
      let row: ImportRow | null = null;
      let mode: BarisValid['mode'] = '-';

      const nama = ambil('nama');
      const tipeRaw = ambil('tipe').toUpperCase();
      const kelasNama = ambil('kelasnama');
      const shiftNama = ambil('shiftnama');

      if (!nama) errors.push('Nama kosong');
      if (tipeRaw !== 'GURU' && tipeRaw !== 'SISWA') errors.push('Tipe harus GURU/SISWA');
      if (kelasNama && !namaKelasAda(kelasNama)) errors.push(`Kelas "${kelasNama}" tidak ada di database`);
      if (shiftNama && !namaShiftAda(shiftNama)) errors.push(`Shift "${shiftNama}" tidak ada di database`);

      if (errors.length === 0) {
        const ada = db.anggota.find((a) => a.tipe === tipeRaw && samaNama(a.nama, nama));
        mode = ada ? 'perbarui' : 'baru';
        row = {
          nama,
          tipe: tipeRaw,
          kelasNama: kelasNama || undefined,
          jabatan: ambil('jabatan') || undefined,
          noWA: ambil('nowa') ? normalisasiNoWA(ambil('nowa')) : undefined,
          noWAOrtu: ambil('nowaortu') ? normalisasiNoWA(ambil('nowaortu')) : undefined,
          shiftNama: shiftNama || undefined,
        };
      }

      hasil.push({ no: i + 2, mentah: r, row, errors, mode });
    });
    return hasil;
  };

  const pilihFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setGalatFile('Ukuran file maksimal 5 MB.');
      return;
    }
    setMemproses(true);
    setGalatFile('');
    setHasilImpor([]);
    try {
      const { headers, rows } = await parseFileExcel(file);
      const normal = headers.map(normalisasiHeader);
      const cocok = HEADER_ANGGOTA_WAJIB.every((w, i) => normal[i] === w);
      if (!cocok) {
        setGalatFile(`Header file tidak sesuai template. Unduh template dulu lewat tombol "Unduh Template".`);
        setBaris([]);
        setNamaFile('');
        return;
      }
      if (rows.length === 0) {
        setGalatFile('Tidak ada baris data di file.');
        setBaris([]);
        return;
      }
      setNamaFile(file.name);
      setBaris(validasi(headers, rows));
    } catch (e) {
      setGalatFile(e instanceof Error ? e.message : 'Gagal membaca file.');
      setBaris([]);
    } finally {
      setMemproses(false);
    }
  };

  const valid = baris.filter((b) => b.errors.length === 0 && b.row);
  const bermasalah = baris.filter((b) => b.errors.length > 0);

  const impor = async () => {
    if (mengimpor || valid.length === 0) return;
    setMengimpor(true);
    setHasilImpor([]);
    try {
      const res = await importAnggota(
        apiUrl,
        valid.map((b) => b.row as ImportRow)
      );
      if (res.success && res.data) {
        const d = res.data;
        const ringkas = [`${d.inserted} data baru ditambahkan`, `${d.updated} data diperbarui`];
        if (d.errors.length === 0) toast('sukses', `Impor selesai: ${ringkas.join(', ')}.`);
        else {
          toast('info', `Impor selesai: ${ringkas.join(', ')}, ${d.errors.length} baris ditolak backend.`);
          setHasilImpor(d.errors.map((e) => `Baris ${e.baris}: ${e.pesan}`));
        }
        onSelesai();
      } else {
        toast('error', res.error || res.message || 'Gagal mengimpor.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan saat mengimpor.');
    } finally {
      setMengimpor(false);
    }
  };

  return (
    <Modal judul="Impor Data Anggota dari Excel" onTutup={onTutup} lebar="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button varian="sekunder" kecil onClick={unduhTemplateAnggota}>
          <Download className="h-4 w-4" /> Unduh Template
        </Button>
        <Button varian="sekunder" kecil onClick={() => inputRef.current?.click()} disabled={memproses}>
          <FileUp className="h-4 w-4" /> Pilih File Excel/CSV
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            pilihFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {memproses && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
      </div>

      {galatFile && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{galatFile}</p>
      )}

      {hasilImpor.length > 0 && (
        <div className="mb-3 max-h-40 overflow-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <p className="mb-1 font-bold">Baris yang ditolak backend:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {hasilImpor.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {baris.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{valid.length} baris valid</span>
            {bermasalah.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{bermasalah.length} baris bermasalah</span>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{namaFile}</span>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {baris.map((b, i) => (
                  <tr key={i} className={b.errors.length > 0 ? 'bg-red-50/50' : ''}>
                    <td className="px-3 py-2 text-slate-400">{b.no}</td>
                    <td className="px-3 py-2">{b.mentah.filter(Boolean).join(' • ') || '-'}</td>
                    <td className="px-3 py-2">
                      {b.errors.length > 0 ? (
                        <span className="font-semibold text-red-600">{b.errors.join('; ')}</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 font-bold ${b.mode === 'baru' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {b.mode === 'baru' ? 'Baru' : 'Perbarui'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button varian="sekunder" onClick={onTutup} disabled={mengimpor}>Batal</Button>
            <Button onClick={impor} loading={mengimpor} disabled={valid.length === 0}>
              <Upload className="h-4 w-4" /> Impor {valid.length} Data
            </Button>
          </div>
        </>
      )}

      {baris.length === 0 && !galatFile && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Unduh template, isi datanya di Excel (kolom: Nama, Tipe, KelasNama, Jabatan, NoWA, NoWAOrtu,
          ShiftNama), lalu pilih file-nya di sini. Baris yang bermasalah ditandai dan dilewati — hanya
          baris valid yang dikirim ke backend.
        </p>
      )}
    </Modal>
  );
}
