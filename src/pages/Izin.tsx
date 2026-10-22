import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FilePlus2, MessageCircle, Search, X } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, LoadingBlock, PageHeader, SelectInput, TextAreaInput, TextInput } from '../components/ui';
import { ajukanIzin, getIzin, putuskanIzin } from '../services/gasApi';
import { dmyKeYmd, formatTanggal, todayDMY, ymdKeDmy } from '../utils/format';
import type { AnggotaItem, IzinItem, JenisIzin, StatusIzin } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Izin: daftar pengajuan (filter status) + form pengajuan +
// tombol Setujui/Tolak (khusus admin).
// ============================================================

const JENIS_IZIN: JenisIzin[] = ['Sakit', 'Izin', 'Keperluan'];
const WARNA_STATUS: Record<StatusIzin, 'kuning' | 'hijau' | 'merah'> = {
  MENUNGGU: 'kuning',
  DISETUJUI: 'hijau',
  DITOLAK: 'merah',
};

export default function Izin({ db, apiUrl, toast, user }: PageProps) {
  const [daftar, setDaftar] = useState<IzinItem[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'SEMUA' | StatusIzin>('MENUNGGU');
  const [formBuka, setFormBuka] = useState(false);

  // Form pengajuan
  const [cariAnggota, setCariAnggota] = useState('');
  const [anggotaId, setAnggotaId] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [jenis, setJenis] = useState<JenisIzin>('Izin');
  const [keterangan, setKeterangan] = useState('');
  const [mengajukan, setMengajukan] = useState(false);
  const [errForm, setErrForm] = useState('');

  // Keputusan admin
  const [keputusan, setKeputusan] = useState<{ item: IzinItem; aksi: 'DISETUJUI' | 'DITOLAK' } | null>(null);
  const [memproses, setMemproses] = useState(false);

  const isAdmin = user?.peran === 'admin';

  const muat = useCallback(async () => {
    setMemuat(true);
    const res = await getIzin(apiUrl, { status: filterStatus });
    if (res.success && res.data) {
      setDaftar(res.data.items);
    } else {
      toast('error', res.error || 'Gagal memuat data izin.');
    }
    setMemuat(false);
  }, [apiUrl, filterStatus, toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  const opsiAnggota = useMemo(() => {
    const q = cariAnggota.trim().toLowerCase();
    return db.anggota
      .filter((a) => a.statusAktif)
      .filter((a) => !q || `${a.nama} ${a.kelasNama} ${a.jabatan}`.toLowerCase().includes(q))
      .sort((a, b) => a.nama.localeCompare(b.nama))
      .slice(0, 60);
  }, [db.anggota, cariAnggota]);

  const anggotaTerpilih: AnggotaItem | undefined = db.anggota.find((a) => a.id === anggotaId);

  const ajukan = async () => {
    if (!anggotaId) { setErrForm('Pilih anggota terlebih dahulu.'); return; }
    const tglDmy = ymdKeDmy(tanggal);
    if (!tglDmy) { setErrForm('Isi tanggal izin.'); return; }
    if (!keterangan.trim()) { setErrForm('Isi keterangan/alasan izin.'); return; }
    setErrForm('');
    setMengajukan(true);
    try {
      const res = await ajukanIzin(apiUrl, {
        tanggal: tglDmy,
        anggotaId,
        jenis,
        keterangan: keterangan.trim(),
        diajukanOleh: user?.nama || '',
      });
      if (res.success) {
        toast('sukses', 'Pengajuan izin berhasil dikirim.');
        setFormBuka(false);
        setAnggotaId('');
        setTanggal('');
        setKeterangan('');
        setCariAnggota('');
        await muat();
      } else {
        setErrForm(res.error || res.message || 'Gagal mengajukan izin.');
      }
    } catch {
      setErrForm('Terjadi kesalahan jaringan.');
    } finally {
      setMengajukan(false);
    }
  };

  const putuskan = async () => {
    if (!keputusan) return;
    setMemproses(true);
    try {
      const res = await putuskanIzin(apiUrl, keputusan.item.id, keputusan.aksi, user?.nama || '');
      if (res.success && res.data) {
        toast(
          'sukses',
          `Izin ${keputusan.aksi === 'DISETUJUI' ? 'disetujui' : 'ditolak'}. Notifikasi WA: ${res.data.waTerkirim ? 'terkirim ✓' : 'tidak dikirim'}.`
        );
        setKeputusan(null);
        await muat();
      } else {
        toast('error', res.error || res.message || 'Gagal memproses keputusan.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan jaringan.');
    } finally {
      setMemproses(false);
    }
  };

  return (
    <div>
      <PageHeader
        judul="Izin"
        subjudul="Pengajuan & persetujuan izin (sakit / izin / keperluan)"
        aksi={
          <Button kecil onClick={() => setFormBuka(true)}>
            <FilePlus2 className="h-4 w-4" /> Ajukan Izin
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          {(['MENUNGGU', 'DISETUJUI', 'DITOLAK', 'SEMUA'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'MENUNGGU' ? 'Menunggu' : s === 'DISETUJUI' ? 'Disetujui' : s === 'DITOLAK' ? 'Ditolak' : 'Semua'}
            </button>
          ))}
        </div>
      </Card>

      {memuat ? (
        <LoadingBlock teks="Memuat data izin..." />
      ) : daftar.length === 0 ? (
        <EmptyState judul="Tidak ada pengajuan" subjudul="Belum ada pengajuan izin pada filter ini." />
      ) : (
        <div className="space-y-3">
          {daftar.map((z) => (
            <Card key={z.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{z.nama}</p>
                  <p className="text-xs text-slate-500">
                    {z.tipe} • {z.kelasNama || '-'} • {formatTanggal(z.tanggal)}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-700">
                    <Badge warna="biru">{z.jenis}</Badge>{' '}
                    <span className="ml-1">{z.keterangan}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Diajukan oleh {z.diajukanOleh || '-'}
                    {z.disetujuiOleh && ` • Diputuskan oleh ${z.disetujuiOleh}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge warna={WARNA_STATUS[z.status]}>
                    {z.status === 'MENUNGGU' ? 'Menunggu' : z.status === 'DISETUJUI' ? 'Disetujui' : 'Ditolak'}
                  </Badge>
                  {isAdmin && z.status === 'MENUNGGU' && (
                    <div className="flex gap-2">
                      <Button varian="hijau" kecil onClick={() => setKeputusan({ item: z, aksi: 'DISETUJUI' })}>
                        <Check className="h-4 w-4" /> Setujui
                      </Button>
                      <Button varian="bahaya" kecil onClick={() => setKeputusan({ item: z, aksi: 'DITOLAK' })}>
                        <X className="h-4 w-4" /> Tolak
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ===== Form pengajuan ===== */}
      {formBuka && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Ajukan Izin</h2>
              <button onClick={() => setFormBuka(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Cari anggota">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={cariAnggota}
                    onChange={(e) => setCariAnggota(e.target.value)}
                    placeholder="Ketik nama guru/siswa..."
                    className="pl-9"
                  />
                </div>
              </Field>
              <Field label="Anggota">
                <SelectInput value={anggotaId} onChange={(e) => setAnggotaId(e.target.value)}>
                  <option value="">-- Pilih anggota --</option>
                  {opsiAnggota.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama} ({a.tipe}{a.kelasNama ? ` • ${a.kelasNama}` : ''})
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {anggotaTerpilih && (
                <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  Notifikasi keputusan akan dikirim ke WA {anggotaTerpilih.tipe === 'SISWA' ? 'orang tua' : 'anggota'}.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tanggal">
                  <TextInput
                    type="date"
                    value={tanggal}
                    min={dmyKeYmd(todayDMY())}
                    onChange={(e) => setTanggal(e.target.value)}
                  />
                </Field>
                <Field label="Jenis">
                  <SelectInput value={jenis} onChange={(e) => setJenis(e.target.value as JenisIzin)}>
                    {JENIS_IZIN.map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <Field label="Keterangan / Alasan">
                <TextAreaInput
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Contoh: Sakit demam, ada surat dokter."
                />
              </Field>
              {errForm && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errForm}</p>}
              <Button onClick={ajukan} loading={mengajukan} className="w-full">
                <FilePlus2 className="h-4 w-4" /> Kirim Pengajuan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Konfirmasi keputusan ===== */}
      {keputusan && (
        <ConfirmDialog
          judul={keputusan.aksi === 'DISETUJUI' ? 'Setujui Izin?' : 'Tolak Izin?'}
          pesan={`Pengajuan ${keputusan.item.jenis} atas nama ${keputusan.item.nama} pada ${formatTanggal(keputusan.item.tanggal)} akan ${keputusan.aksi === 'DISETUJUI' ? 'DISETUJUI' : 'DITOLAK'}. Notifikasi WhatsApp otomatis dikirim ke ${keputusan.item.tipe === 'SISWA' ? 'orang tua' : 'anggota'}.`}
          teksYa={keputusan.aksi === 'DISETUJUI' ? 'Ya, Setujui' : 'Ya, Tolak'}
          varian={keputusan.aksi === 'DISETUJUI' ? 'hijau' : 'bahaya'}
          onYa={putuskan}
          onBatal={() => setKeputusan(null)}
          loading={memproses}
        />
      )}
    </div>
  );
}
