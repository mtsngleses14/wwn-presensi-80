import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, CalendarDays, CheckCircle2, MailWarning, RefreshCw, UserX, Users } from 'lucide-react';
import { Badge, Button, Card, LoadingBlock, PageHeader } from '../components/ui';
import { getDashboard } from '../services/gasApi';
import { formatTanggalPanjang, jamPendek, todayDMY } from '../utils/format';
import type { DashboardData, RingkasTipe } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Dashboard: ringkasan presensi hari ini per tipe (guru/siswa)
// + daftar yang terlambat hari ini.
// ============================================================

function KartuRingkasan({ judul, r, warna }: { judul: string; r: RingkasTipe; warna: string }) {
  const item = [
    { l: 'Hadir', n: r.hadir, ikon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
    { l: 'Terlambat', n: r.terlambat, ikon: <AlarmClock className="h-4 w-4 text-amber-600" /> },
    { l: 'Izin', n: r.izin, ikon: <MailWarning className="h-4 w-4 text-blue-600" /> },
    { l: 'Belum Absen', n: r.belumAbsen, ikon: <UserX className="h-4 w-4 text-slate-400" /> },
  ];
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1.5 ${warna}`} />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <Users className="h-5 w-5 text-indigo-600" /> {judul}
        </h2>
        <span className="text-xs text-slate-400">{r.total} anggota</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {item.map((s) => (
          <div key={s.l} className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="mb-1 flex justify-center">{s.ikon}</div>
            <p className="text-2xl font-bold text-slate-900">{s.n}</p>
            <p className="text-xs text-slate-500">{s.l}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard({ apiUrl, toast }: PageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true);
    const res = await getDashboard(apiUrl, todayDMY());
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast('error', res.error || 'Gagal memuat dashboard.');
    }
    setMemuat(false);
  }, [apiUrl, toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <div>
      <PageHeader
        judul="Beranda"
        subjudul={formatTanggalPanjang(todayDMY())}
        aksi={
          <Button varian="sekunder" kecil onClick={muat} loading={memuat}>
            <RefreshCw className="h-4 w-4" /> Segarkan
          </Button>
        }
      />

      {memuat && !data ? (
        <LoadingBlock teks="Memuat ringkasan hari ini..." />
      ) : data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <KartuRingkasan judul="Guru & Karyawan" r={data.guru} warna="bg-indigo-500" />
            <KartuRingkasan judul="Siswa" r={data.siswa} warna="bg-violet-500" />
          </div>

          <Card className="mt-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
              <AlarmClock className="h-5 w-5 text-amber-600" />
              Terlambat Hari Ini
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                {data.terlambat.length}
              </span>
            </h2>
            {data.terlambat.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700">
                🎉 Tidak ada yang terlambat hari ini. Semua tepat waktu!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Tipe</th>
                      <th className="px-3 py-2">Kelas</th>
                      <th className="px-3 py-2">Jam Masuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.terlambat.map((t, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{t.nama}</td>
                        <td className="px-3 py-2.5">
                          <Badge warna={t.tipe === 'GURU' ? 'biru' : 'ungu'}>{t.tipe}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{t.kelasNama || '-'}</td>
                        <td className="font-mono-num px-3 py-2.5 font-semibold text-amber-700">{jamPendek(t.jamMasuk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" />
            Data per {formatTanggalPanjang(data.tanggal)}
          </p>
        </>
      ) : (
        <Card>
          <p className="text-center text-sm text-slate-500">Data dashboard belum tersedia.</p>
        </Card>
      )}
    </div>
  );
}
