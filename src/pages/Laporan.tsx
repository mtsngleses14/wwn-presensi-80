import { useMemo, useState } from 'react';
import { FileDown, Printer, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, SelectInput, TextInput } from '../components/ui';
import { getPresensi } from '../services/gasApi';
import { dmyKeYmd, formatTanggal, jamPendek, todayDMY, unduhXlsx, ymdKeDmy } from '../utils/format';
import type { PresensiItem, TipeAnggota } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Laporan presensi: filter periode + tipe + kelas, tampilkan,
// cetak (print CSS), unduh Excel.
// ============================================================

export default function Laporan({ db, apiUrl, toast }: PageProps) {
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [tipe, setTipe] = useState<'SEMUA' | TipeAnggota>('SEMUA');
  const [kelasNama, setKelasNama] = useState('');
  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState<PresensiItem[]>([]);
  const [ditampilkan, setDitampilkan] = useState(false);
  const [memuat, setMemuat] = useState(false);

  const tampilkan = async () => {
    setMemuat(true);
    const res = await getPresensi(apiUrl, {
      tanggalDari: dari ? ymdKeDmy(dari) : undefined,
      tanggalSampai: sampai ? ymdKeDmy(sampai) : undefined,
      tipe,
      kelasNama: kelasNama || undefined,
    });
    if (res.success && res.data) {
      setHasil(res.data.items);
      setDitampilkan(true);
    } else {
      toast('error', res.error || 'Gagal memuat laporan.');
    }
    setMemuat(false);
  };

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return hasil;
    return hasil.filter((r) => `${r.nama} ${r.kelasNama} ${r.keterangan}`.toLowerCase().includes(q));
  }, [hasil, cari]);

  const ringkas = useMemo(() => {
    let hadir = 0, terlambat = 0;
    for (const r of tersaring) {
      if (r.statusMasuk === 'TERLAMBAT') terlambat++;
      else if (r.statusMasuk === 'HADIR') hadir++;
    }
    return { hadir, terlambat, total: tersaring.length };
  }, [tersaring]);

  const periode = dari || sampai
    ? `${dari ? formatTanggal(ymdKeDmy(dari)) : '...'} s.d. ${sampai ? formatTanggal(ymdKeDmy(sampai)) : '...'}`
    : 'Semua Periode';

  const eksporExcel = () => {
    unduhXlsx(
      `laporan-presensi-${dmyKeYmd(todayDMY()).replace(/-/g, '')}`,
      'Presensi',
      ['No', 'Tanggal', 'Nama', 'Tipe', 'Kelas', 'Jam Masuk', 'Jam Pulang', 'Status Masuk', 'Keterangan'],
      tersaring.map((r, i) => [
        i + 1,
        formatTanggal(r.tanggal),
        r.nama,
        r.tipe,
        r.kelasNama || '-',
        r.jamMasuk || '-',
        r.jamPulang || '-',
        r.statusMasuk || '-',
        r.keterangan || '',
      ])
    );
    toast('sukses', 'File Excel berhasil diunduh.');
  };

  return (
    <div>
      <PageHeader
        judul="Laporan Presensi"
        subjudul="Rekap presensi siap cetak & unduh"
        aksi={
          <>
            <Button varian="biru" kecil onClick={() => window.print()} disabled={tersaring.length === 0}>
              <Printer className="h-4 w-4" /> Cetak / PDF
            </Button>
            <Button varian="hijau" kecil onClick={eksporExcel} disabled={tersaring.length === 0}>
              <FileDown className="h-4 w-4" /> Unduh Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4 no-print">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Dari Tanggal">
            <TextInput type="date" value={dari} max={sampai || undefined} onChange={(e) => setDari(e.target.value)} />
          </Field>
          <Field label="Sampai Tanggal">
            <TextInput type="date" value={sampai} min={dari || undefined} onChange={(e) => setSampai(e.target.value)} />
          </Field>
          <Field label="Tipe">
            <SelectInput value={tipe} onChange={(e) => setTipe(e.target.value as 'SEMUA' | TipeAnggota)}>
              <option value="SEMUA">Semua</option>
              <option value="GURU">Guru & Karyawan</option>
              <option value="SISWA">Siswa</option>
            </SelectInput>
          </Field>
          <Field label="Kelas">
            <SelectInput value={kelasNama} onChange={(e) => setKelasNama(e.target.value)}>
              <option value="">Semua Kelas</option>
              {db.kelas.map((k) => (
                <option key={k.id} value={k.nama}>{k.nama}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Pencarian">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama..." className="pl-9" />
            </div>
          </Field>
          <div className="flex items-end">
            <Button onClick={tampilkan} loading={memuat} className="w-full sm:w-auto">
              <Search className="h-4 w-4" /> Tampilkan
            </Button>
          </div>
        </div>
      </Card>

      {!ditampilkan ? (
        <EmptyState judul="Belum ada laporan" subjudul="Atur filter lalu klik Tampilkan." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 no-print">
            {[
              { l: 'Catatan Presensi', n: ringkas.total },
              { l: 'Hadir Tepat Waktu', n: ringkas.hadir },
              { l: 'Terlambat', n: ringkas.terlambat },
            ].map((s) => (
              <Card key={s.l} className="!p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{s.n}</p>
                <p className="text-xs text-slate-500">{s.l}</p>
              </Card>
            ))}
          </div>

          {/* Area cetak */}
          <div id="print-area">
            <Card className="!p-0 overflow-hidden">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center justify-center gap-4">
                  {db.pengaturan.logoUrl && (
                    <img src={db.pengaturan.logoUrl} alt="Logo" className="h-16 w-16 shrink-0 object-contain" />
                  )}
                  <div className="text-center">
                    <h2 className="text-lg font-bold uppercase">{db.pengaturan.namaSekolah || 'Laporan Presensi'}</h2>
                    {db.pengaturan.alamat && <p className="text-xs text-slate-500">{db.pengaturan.alamat}</p>}
                    <p className="mt-1 text-sm text-slate-500">Periode: {periode} • {tersaring.length} catatan</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">No</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Nama</th>
                      <th className="px-3 py-2.5">Tipe</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Masuk</th>
                      <th className="px-3 py-2.5">Pulang</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tersaring.map((r, i) => (
                      <tr key={r.id || i}>
                        <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatTanggal(r.tanggal)}</td>
                        <td className="px-3 py-2.5 font-medium">{r.nama}</td>
                        <td className="px-3 py-2.5">
                          <Badge warna={r.tipe === 'GURU' ? 'biru' : 'ungu'}>{r.tipe}</Badge>
                        </td>
                        <td className="px-3 py-2.5">{r.kelasNama || '-'}</td>
                        <td className="font-mono-num whitespace-nowrap px-3 py-2.5">{r.jamMasuk ? jamPendek(r.jamMasuk) : '-'}</td>
                        <td className="font-mono-num whitespace-nowrap px-3 py-2.5">{r.jamPulang ? jamPendek(r.jamPulang) : '-'}</td>
                        <td className="px-3 py-2.5">
                          {r.statusMasuk ? (
                            <Badge warna={r.statusMasuk === 'TERLAMBAT' ? 'kuning' : 'hijau'}>{r.statusMasuk}</Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                    {tersaring.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">Tidak ada data pada filter ini.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-16 p-4 text-center text-sm">
                <div>
                  <p className="mb-12">Mengetahui,<br />Kepala Madrasah</p>
                  <p className="font-semibold underline">{db.pengaturan.kepalaSekolah || '( .............................. )'}</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
