import { useState } from 'react';
import { FileDown, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, SelectInput, TextInput } from '../components/ui';
import { getRekap } from '../services/gasApi';
import { bulanBerjalanMY, formatBulanMY, unduhXlsx, ymKeMy } from '../utils/format';
import type { RekapRow, TipeAnggota } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Rekap bulanan: pilih bulan + tipe → tabel per anggota
// (hadir / terlambat / izin / alpa / hari efektif) + unduh Excel.
// ============================================================

export default function Rekap({ apiUrl, toast }: PageProps) {
  const [bulan, setBulan] = useState(() => {
    const my = bulanBerjalanMY(); // mm/yyyy
    const [m, y] = my.split('/');
    return `${y}-${m}`; // yyyy-mm untuk input type="month"
  });
  const [tipe, setTipe] = useState<TipeAnggota>('GURU');
  const [rows, setRows] = useState<RekapRow[]>([]);
  const [bulanLabel, setBulanLabel] = useState(bulanBerjalanMY());
  const [ditampilkan, setDitampilkan] = useState(false);
  const [memuat, setMemuat] = useState(false);

  const tampilkan = async () => {
    const my = ymKeMy(bulan);
    if (!my) {
      toast('error', 'Pilih bulan terlebih dahulu.');
      return;
    }
    setMemuat(true);
    const res = await getRekap(apiUrl, my, tipe);
    if (res.success && res.data) {
      setRows(res.data.rows);
      setBulanLabel(res.data.bulan || my);
      setDitampilkan(true);
    } else {
      toast('error', res.error || 'Gagal memuat rekap.');
    }
    setMemuat(false);
  };

  const eksporExcel = () => {
    const judul = tipe === 'GURU' ? 'Guru & Karyawan' : 'Siswa';
    unduhXlsx(
      `rekap-presensi-${judul.toLowerCase().replace(/[^a-z]+/g, '-')}-${bulanLabel.replace('/', '-')}`,
      'Rekap',
      ['No', 'Nama', 'Tipe', 'Kelas', 'Hadir', 'Terlambat', 'Izin', 'Alpa', 'Hari Efektif'],
      rows.map((r, i) => [
        i + 1, r.nama, r.tipe, r.kelasNama || '-', r.hadir, r.terlambat, r.izin, r.alpa, r.hariEfektif,
      ])
    );
    toast('sukses', 'File Excel berhasil diunduh.');
  };

  return (
    <div>
      <PageHeader
        judul="Rekap Bulanan"
        subjudul={`Rekapitulasi kehadiran ${formatBulanMY(bulanLabel)}`}
        aksi={
          <Button varian="hijau" kecil onClick={eksporExcel} disabled={rows.length === 0}>
            <FileDown className="h-4 w-4" /> Unduh Excel
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bulan">
            <TextInput type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} />
          </Field>
          <Field label="Tipe">
            <SelectInput value={tipe} onChange={(e) => setTipe(e.target.value as TipeAnggota)}>
              <option value="GURU">Guru & Karyawan</option>
              <option value="SISWA">Siswa</option>
            </SelectInput>
          </Field>
          <div className="flex items-end">
            <Button onClick={tampilkan} loading={memuat} className="w-full sm:w-auto">
              <Search className="h-4 w-4" /> Tampilkan
            </Button>
          </div>
        </div>
      </Card>

      {!ditampilkan ? (
        <EmptyState judul="Belum ada rekap" subjudul="Pilih bulan & tipe lalu klik Tampilkan." />
      ) : rows.length === 0 ? (
        <EmptyState judul="Tidak ada data" subjudul={`Belum ada anggota ${tipe === 'GURU' ? 'guru' : 'siswa'} pada bulan ini.`} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5">No</th>
                  <th className="px-3 py-2.5">Nama</th>
                  <th className="px-3 py-2.5">Kelas</th>
                  <th className="px-3 py-2.5 text-center">Hadir</th>
                  <th className="px-3 py-2.5 text-center">Terlambat</th>
                  <th className="px-3 py-2.5 text-center">Izin</th>
                  <th className="px-3 py-2.5 text-center">Alpa</th>
                  <th className="px-3 py-2.5 text-center">Hari Efektif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={r.anggotaId || i}>
                    <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.nama}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.kelasNama || '-'}</td>
                    <td className="px-3 py-2.5 text-center"><Badge warna="hijau">{r.hadir}</Badge></td>
                    <td className="px-3 py-2.5 text-center"><Badge warna="kuning">{r.terlambat}</Badge></td>
                    <td className="px-3 py-2.5 text-center"><Badge warna="biru">{r.izin}</Badge></td>
                    <td className="px-3 py-2.5 text-center"><Badge warna="merah">{r.alpa}</Badge></td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-700">{r.hariEfektif}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 p-3 text-xs text-slate-400">
            {rows.length} anggota • {formatBulanMY(bulanLabel)} • Alpa = hari efektif − (hadir + terlambat + izin).
          </p>
        </Card>
      )}
    </div>
  );
}
