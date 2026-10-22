import { useMemo, useState } from 'react';
import { FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, SelectInput, TextAreaInput, TextInput } from '../components/ui';
import ExcelUploadModal from '../components/ExcelUploadModal';
import {
  deleteAnggota,
  deleteHariLibur,
  deleteKelas,
  deletePengguna,
  deleteShift,
  saveAnggota,
  saveHariLibur,
  saveKelas,
  savePengguna,
  saveShift,
} from '../services/gasApi';
import { formatTanggal, newId, normalisasiNoWA, ymdKeDmy } from '../utils/format';
import type { AnggotaItem, HariLiburItem, KelasItem, PenggunaItem, ShiftItem, TipeAnggota } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Kelola Data: tab Anggota / Kelas / Shift / Hari Libur /
// Pengguna (khusus admin). CRUD + impor Excel untuk Anggota.
// ============================================================

type TabKey = 'anggota' | 'kelas' | 'shift' | 'libur' | 'pengguna';

const HARI: { n: number; l: string }[] = [
  { n: 1, l: 'Senin' },
  { n: 2, l: 'Selasa' },
  { n: 3, l: 'Rabu' },
  { n: 4, l: 'Kamis' },
  { n: 5, l: "Jum'at" },
  { n: 6, l: 'Sabtu' },
  { n: 7, l: 'Minggu' },
];

export default function KelolaData({ db, apiUrl, toast, refresh, user }: PageProps) {
  const isAdmin = user?.peran === 'admin';
  const [tab, setTab] = useState<TabKey>('anggota');
  const [cari, setCari] = useState('');
  const [formBuka, setFormBuka] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [hapus, setHapus] = useState<{ tab: TabKey; id: string; nama: string } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [menghapus, setMenghapus] = useState(false);
  const [imporBuka, setImporBuka] = useState(false);

  // ----- State form Anggota -----
  const [fNama, setFnama] = useState('');
  const [fTipe, setFTipe] = useState<TipeAnggota>('SISWA');
  const [fKelasId, setFKelasId] = useState('');
  const [fJabatan, setFJabatan] = useState('');
  const [fNoWA, setFNoWA] = useState('');
  const [fNoWAOrtu, setFNoWAOrtu] = useState('');
  const [fShiftId, setFShiftId] = useState('');
  const [fAktif, setFAktif] = useState(true);

  // ----- State form Kelas -----
  const [kNama, setKNama] = useState('');
  const [kTingkat, setKTingkat] = useState('');
  const [kWali, setKWali] = useState('');

  // ----- State form Shift -----
  const [sNama, setSNama] = useState('');
  const [sMasuk, setSMasuk] = useState('07:00');
  const [sPulang, setSPulang] = useState('14:00');
  const [sToleransi, setSToleransi] = useState('15');
  const [sHari, setSHari] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [sKet, setSKet] = useState('');

  // ----- State form Hari Libur -----
  const [lTanggal, setLTanggal] = useState('');
  const [lKet, setLKet] = useState('');

  // ----- State form Pengguna -----
  const [pUsername, setPUsername] = useState('');
  const [pNama, setPNama] = useState('');
  const [pPeran, setPPeran] = useState<'admin' | 'operator'>('operator');
  const [pPassword, setPPassword] = useState('');
  const [pAktif, setPAktif] = useState(true);

  const [errForm, setErrForm] = useState('');

  const tabAktif: TabKey = !isAdmin && tab === 'pengguna' ? 'anggota' : tab;

  const mulaiTambah = () => {
    setEditId(null);
    setErrForm('');
    if (tabAktif === 'anggota') {
      setFnama(''); setFTipe('SISWA'); setFKelasId(''); setFJabatan(''); setFNoWA(''); setFNoWAOrtu(''); setFShiftId(''); setFAktif(true);
    } else if (tabAktif === 'kelas') {
      setKNama(''); setKTingkat(''); setKWali('');
    } else if (tabAktif === 'shift') {
      setSNama(''); setSMasuk('07:00'); setSPulang('14:00'); setSToleransi('15'); setSHari([1, 2, 3, 4, 5, 6]); setSKet('');
    } else if (tabAktif === 'libur') {
      setLTanggal(''); setLKet('');
    } else {
      setPUsername(''); setPNama(''); setPPeran('operator'); setPPassword(''); setPAktif(true);
    }
    setFormBuka(true);
  };

  const mulaiEdit = (t: TabKey, id: string) => {
    setErrForm('');
    if (t === 'anggota') {
      const a = db.anggota.find((x) => x.id === id);
      if (!a) return;
      setFnama(a.nama); setFTipe(a.tipe); setFKelasId(a.kelasId); setFJabatan(a.jabatan);
      setFNoWA(a.noWA); setFNoWAOrtu(a.noWAOrtu); setFShiftId(a.shiftId); setFAktif(a.statusAktif);
    } else if (t === 'kelas') {
      const k = db.kelas.find((x) => x.id === id);
      if (!k) return;
      setKNama(k.nama); setKTingkat(k.tingkat); setKWali(k.waliKelas);
    } else if (t === 'shift') {
      const s = db.shift.find((x) => x.id === id);
      if (!s) return;
      setSNama(s.nama); setSMasuk(s.jamMasuk); setSPulang(s.jamPulang);
      setSToleransi(String(s.toleransiMenit));
      setSHari(s.hariAktif.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => x >= 1 && x <= 7));
      setSKet(s.keterangan);
    } else if (t === 'pengguna') {
      const p = db.pengguna.find((x) => x.username === id);
      if (!p) return;
      setPUsername(p.username); setPNama(p.nama); setPPeran(p.peran); setPPassword(''); setPAktif(p.statusAktif);
    }
    // Hari libur tidak diedit — hapus & tambah ulang.
    setEditId(id);
    setFormBuka(true);
  };

  const simpan = async () => {
    setErrForm('');
    setMenyimpan(true);
    try {
      if (tabAktif === 'anggota') {
        if (!fNama.trim()) { setErrForm('Nama wajib diisi.'); setMenyimpan(false); return; }
        const kelas = db.kelas.find((k) => k.id === fKelasId);
        const item: AnggotaItem = {
          id: editId || newId('AGT'),
          nama: fNama.trim(),
          tipe: fTipe,
          kelasId: fKelasId,
          kelasNama: kelas?.nama || '',
          jabatan: fJabatan.trim(),
          noWA: normalisasiNoWA(fNoWA),
          noWAOrtu: normalisasiNoWA(fNoWAOrtu),
          shiftId: fShiftId,
          statusAktif: fAktif,
        };
        const res = await saveAnggota(apiUrl, item);
        if (!res.success) { setErrForm(res.error || 'Gagal menyimpan.'); setMenyimpan(false); return; }
      } else if (tabAktif === 'kelas') {
        if (!kNama.trim()) { setErrForm('Nama kelas wajib diisi.'); setMenyimpan(false); return; }
        const item: KelasItem = { id: editId || newId('KLS'), nama: kNama.trim(), tingkat: kTingkat.trim(), waliKelas: kWali.trim() };
        const res = await saveKelas(apiUrl, item);
        if (!res.success) { setErrForm(res.error || 'Gagal menyimpan.'); setMenyimpan(false); return; }
      } else if (tabAktif === 'shift') {
        if (!sNama.trim()) { setErrForm('Nama shift wajib diisi.'); setMenyimpan(false); return; }
        if (sHari.length === 0) { setErrForm('Pilih minimal 1 hari aktif.'); setMenyimpan(false); return; }
        const item: ShiftItem = {
          id: editId || newId('SFT'),
          nama: sNama.trim(),
          jamMasuk: sMasuk,
          jamPulang: sPulang,
          toleransiMenit: Math.max(0, parseInt(sToleransi, 10) || 0),
          hariAktif: [...sHari].sort((a, b) => a - b).join(','),
          keterangan: sKet.trim(),
        };
        const res = await saveShift(apiUrl, item);
        if (!res.success) { setErrForm(res.error || 'Gagal menyimpan.'); setMenyimpan(false); return; }
      } else if (tabAktif === 'libur') {
        const tglDmy = ymdKeDmy(lTanggal);
        if (!tglDmy) { setErrForm('Isi tanggal libur.'); setMenyimpan(false); return; }
        const item: HariLiburItem = { tanggal: tglDmy, keterangan: lKet.trim() };
        const res = await saveHariLibur(apiUrl, item);
        if (!res.success) { setErrForm(res.error || 'Gagal menyimpan.'); setMenyimpan(false); return; }
      } else {
        if (!editId && !pUsername.trim()) { setErrForm('Username wajib diisi.'); setMenyimpan(false); return; }
        if (!pNama.trim()) { setErrForm('Nama wajib diisi.'); setMenyimpan(false); return; }
        if (!editId && !pPassword) { setErrForm('Password wajib diisi untuk pengguna baru.'); setMenyimpan(false); return; }
        if (pPassword && pPassword.length < 6) { setErrForm('Password minimal 6 karakter.'); setMenyimpan(false); return; }
        const item: PenggunaItem & { password?: string } = {
          username: editId || pUsername.trim(),
          nama: pNama.trim(),
          peran: pPeran,
          statusAktif: pAktif,
          password: pPassword || undefined,
        };
        const res = await savePengguna(apiUrl, item);
        if (!res.success) { setErrForm(res.error || 'Gagal menyimpan.'); setMenyimpan(false); return; }
      }
      toast('sukses', 'Data berhasil disimpan.');
      setFormBuka(false);
      await refresh();
    } catch {
      setErrForm('Terjadi kesalahan jaringan.');
    } finally {
      setMenyimpan(false);
    }
  };

  const jalankanHapus = async () => {
    if (!hapus) return;
    setMenghapus(true);
    try {
      let res;
      if (hapus.tab === 'anggota') res = await deleteAnggota(apiUrl, hapus.id);
      else if (hapus.tab === 'kelas') res = await deleteKelas(apiUrl, hapus.id);
      else if (hapus.tab === 'shift') res = await deleteShift(apiUrl, hapus.id);
      else if (hapus.tab === 'libur') res = await deleteHariLibur(apiUrl, hapus.id);
      else res = await deletePengguna(apiUrl, hapus.id);
      if (res && res.success) {
        toast('sukses', 'Data berhasil dihapus.');
        setHapus(null);
        await refresh();
      } else {
        toast('error', (res && (res.error || res.message)) || 'Gagal menghapus.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan jaringan.');
    } finally {
      setMenghapus(false);
    }
  };

  const q = cari.trim().toLowerCase();
  const cocok = (s: string) => !q || s.toLowerCase().includes(q);

  const anggotaTampil = useMemo(
    () => db.anggota.filter((a) => cocok(`${a.nama} ${a.kelasNama} ${a.jabatan} ${a.tipe}`)).sort((a, b) => a.nama.localeCompare(b.nama)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.anggota, cari]
  );
  const kelasTampil = useMemo(() => db.kelas.filter((k) => cocok(`${k.nama} ${k.waliKelas}`)), [db.kelas, cari]);
  const shiftTampil = useMemo(() => db.shift.filter((s) => cocok(s.nama)), [db.shift, cari]);
  const liburTampil = useMemo(() => db.hariLibur.filter((l) => cocok(`${l.tanggal} ${l.keterangan}`)), [db.hariLibur, cari]);
  const penggunaTampil = useMemo(() => db.pengguna.filter((p) => cocok(`${p.username} ${p.nama}`)), [db.pengguna, cari]);

  const toggleHari = (n: number) => {
    setSHari((lama) => (lama.includes(n) ? lama.filter((x) => x !== n) : [...lama, n]));
  };

  const judulTab: { key: TabKey; label: string; admin?: boolean }[] = [
    { key: 'anggota', label: 'Anggota' },
    { key: 'kelas', label: 'Kelas' },
    { key: 'shift', label: 'Shift' },
    { key: 'libur', label: 'Hari Libur' },
    { key: 'pengguna', label: 'Pengguna', admin: true },
  ];

  return (
    <div>
      <PageHeader
        judul="Kelola Data"
        subjudul="Anggota, kelas, shift, hari libur, dan pengguna"
        aksi={
          <>
            {tabAktif === 'anggota' && (
              <Button varian="biru" kecil onClick={() => setImporBuka(true)}>
                <FileUp className="h-4 w-4" /> Template & Upload
              </Button>
            )}
            <Button kecil onClick={mulaiTambah}>
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          </>
        }
      />

      {/* Tab */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {judulTab
          .filter((t) => !t.admin || isAdmin)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setCari('');
              }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                tabAktif === t.key ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      <Card className="mb-4">
        <Field label="Cari">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Ketik untuk mencari..." className="pl-9" />
          </div>
        </Field>
      </Card>

      {/* ===== DAFTAR ===== */}
      {tabAktif === 'anggota' && (
        <div className="space-y-2">
          {anggotaTampil.length === 0 && <EmptyState judul="Belum ada anggota" subjudul="Klik Tambah atau gunakan Template & Upload." />}
          {anggotaTampil.map((a) => (
            <Card key={a.id} className="!p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {a.nama}{' '}
                    <Badge warna={a.tipe === 'GURU' ? 'biru' : 'ungu'}>{a.tipe}</Badge>{' '}
                    {!a.statusAktif && <Badge warna="abu">Nonaktif</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[a.kelasNama, a.jabatan, a.noWA].filter(Boolean).join(' • ') || '-'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => mulaiEdit('anggota', a.id)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setHapus({ tab: 'anggota', id: a.id, nama: a.nama })}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    aria-label="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tabAktif === 'kelas' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {kelasTampil.length === 0 && <div className="col-span-full"><EmptyState judul="Belum ada kelas" /></div>}
          {kelasTampil.map((k) => (
            <Card key={k.id} className="!p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{k.nama}</p>
                  <p className="text-xs text-slate-500">
                    {[k.tingkat, k.waliKelas ? `Wali: ${k.waliKelas}` : ''].filter(Boolean).join(' • ') || '-'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => mulaiEdit('kelas', k.id)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setHapus({ tab: 'kelas', id: k.id, nama: k.nama })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tabAktif === 'shift' && (
        <div className="space-y-2">
          {shiftTampil.length === 0 && <EmptyState judul="Belum ada shift" subjudul="Buat shift kerja, mis. Shift Pagi 07:00–14:00." />}
          {shiftTampil.map((s) => (
            <Card key={s.id} className="!p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{s.nama}</p>
                  <p className="font-mono-num text-xs text-slate-500">
                    {s.jamMasuk}–{s.jamPulang} • toleransi {s.toleransiMenit} mnt • hari {s.hariAktif}
                  </p>
                  {s.keterangan && <p className="truncate text-xs text-slate-400">{s.keterangan}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => mulaiEdit('shift', s.id)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setHapus({ tab: 'shift', id: s.id, nama: s.nama })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tabAktif === 'libur' && (
        <div className="space-y-2">
          {liburTampil.length === 0 && <EmptyState judul="Belum ada hari libur" subjudul="Pada hari libur, presensi akan ditolak otomatis." />}
          {liburTampil.map((l) => (
            <Card key={l.tanggal} className="!p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{formatTanggal(l.tanggal)}</p>
                  <p className="text-xs text-slate-500">{l.keterangan || '-'}</p>
                </div>
                <button onClick={() => setHapus({ tab: 'libur', id: l.tanggal, nama: formatTanggal(l.tanggal) })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Hapus">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tabAktif === 'pengguna' && isAdmin && (
        <div className="space-y-2">
          {penggunaTampil.map((p) => (
            <Card key={p.username} className="!p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {p.nama} <span className="text-xs text-slate-400">({p.username})</span>{' '}
                    <Badge warna={p.peran === 'admin' ? 'merah' : 'biru'}>{p.peran}</Badge>{' '}
                    {!p.statusAktif && <Badge warna="abu">Nonaktif</Badge>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => mulaiEdit('pengguna', p.username)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {p.username !== user?.username && (
                    <button onClick={() => setHapus({ tab: 'pengguna', id: p.username, nama: p.nama })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ===== FORM ===== */}
      {formBuka && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editId ? 'Edit' : 'Tambah'} {tabAktif === 'anggota' ? 'Anggota' : tabAktif === 'kelas' ? 'Kelas' : tabAktif === 'shift' ? 'Shift' : tabAktif === 'libur' ? 'Hari Libur' : 'Pengguna'}
              </h2>
              <button onClick={() => setFormBuka(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup">
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="space-y-3">
              {tabAktif === 'anggota' && (
                <>
                  <Field label="Nama Lengkap">
                    <TextInput value={fNama} onChange={(e) => setFnama(e.target.value)} placeholder="Nama anggota" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tipe">
                      <SelectInput value={fTipe} onChange={(e) => setFTipe(e.target.value as TipeAnggota)}>
                        <option value="SISWA">Siswa</option>
                        <option value="GURU">Guru/Karyawan</option>
                      </SelectInput>
                    </Field>
                    <Field label="Kelas">
                      <SelectInput value={fKelasId} onChange={(e) => setFKelasId(e.target.value)}>
                        <option value="">-- Pilih --</option>
                        {db.kelas.map((k) => (
                          <option key={k.id} value={k.id}>{k.nama}</option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Jabatan">
                      <TextInput value={fJabatan} onChange={(e) => setFJabatan(e.target.value)} placeholder="Guru Kelas" />
                    </Field>
                    <Field label="Shift">
                      <SelectInput value={fShiftId} onChange={(e) => setFShiftId(e.target.value)}>
                        <option value="">-- Pilih --</option>
                        {db.shift.map((s) => (
                          <option key={s.id} value={s.id}>{s.nama}</option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="No. WA">
                      <TextInput value={fNoWA} onChange={(e) => setFNoWA(e.target.value)} placeholder="0812..." inputMode="tel" />
                    </Field>
                    <Field label="No. WA Orang Tua">
                      <TextInput value={fNoWAOrtu} onChange={(e) => setFNoWAOrtu(e.target.value)} placeholder="0812..." inputMode="tel" />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={fAktif} onChange={(e) => setFAktif(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                    Status aktif
                  </label>
                </>
              )}

              {tabAktif === 'kelas' && (
                <>
                  <Field label="Nama Kelas">
                    <TextInput value={kNama} onChange={(e) => setKNama(e.target.value)} placeholder="7A" />
                  </Field>
                  <Field label="Tingkat">
                    <TextInput value={kTingkat} onChange={(e) => setKTingkat(e.target.value)} placeholder="VII" />
                  </Field>
                  <Field label="Wali Kelas">
                    <TextInput value={kWali} onChange={(e) => setKWali(e.target.value)} placeholder="Nama wali kelas" />
                  </Field>
                </>
              )}

              {tabAktif === 'shift' && (
                <>
                  <Field label="Nama Shift">
                    <TextInput value={sNama} onChange={(e) => setSNama(e.target.value)} placeholder="Shift Pagi" />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Jam Masuk">
                      <TextInput type="time" value={sMasuk} onChange={(e) => setSMasuk(e.target.value)} />
                    </Field>
                    <Field label="Jam Pulang">
                      <TextInput type="time" value={sPulang} onChange={(e) => setSPulang(e.target.value)} />
                    </Field>
                    <Field label="Toleransi (mnt)">
                      <TextInput type="number" min={0} value={sToleransi} onChange={(e) => setSToleransi(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Hari Aktif">
                    <div className="flex flex-wrap gap-2">
                      {HARI.map((h) => (
                        <button
                          key={h.n}
                          type="button"
                          onClick={() => toggleHari(h.n)}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                            sHari.includes(h.n) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {h.l}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Keterangan">
                    <TextAreaInput value={sKet} onChange={(e) => setSKet(e.target.value)} placeholder="Opsional" rows={2} />
                  </Field>
                </>
              )}

              {tabAktif === 'libur' && (
                <>
                  <Field label="Tanggal">
                    <TextInput type="date" value={lTanggal} onChange={(e) => setLTanggal(e.target.value)} />
                  </Field>
                  <Field label="Keterangan">
                    <TextInput value={lKet} onChange={(e) => setLKet(e.target.value)} placeholder="Hari libur nasional, dsb." />
                  </Field>
                </>
              )}

              {tabAktif === 'pengguna' && (
                <>
                  <Field label="Username">
                    <TextInput value={pUsername} onChange={(e) => setPUsername(e.target.value)} disabled={!!editId} placeholder="username" />
                  </Field>
                  <Field label="Nama Lengkap">
                    <TextInput value={pNama} onChange={(e) => setPNama(e.target.value)} placeholder="Nama pengguna" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Peran">
                      <SelectInput value={pPeran} onChange={(e) => setPPeran(e.target.value as 'admin' | 'operator')}>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </SelectInput>
                    </Field>
                    <Field label={editId ? 'Password Baru (kosongkan = tetap)' : 'Password'}>
                      <TextInput type="password" value={pPassword} onChange={(e) => setPPassword(e.target.value)} placeholder="min. 6 karakter" />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={pAktif} onChange={(e) => setPAktif(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                    Status aktif
                  </label>
                </>
              )}

              {errForm && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errForm}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button varian="sekunder" onClick={() => setFormBuka(false)} disabled={menyimpan}>
                  Batal
                </Button>
                <Button onClick={simpan} loading={menyimpan}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== KONFIRMASI HAPUS ===== */}
      {hapus && (
        <ConfirmDialog
          judul="Hapus Data?"
          pesan={`"${hapus.nama}" akan dihapus permanen dari database. Lanjutkan?`}
          onYa={jalankanHapus}
          onBatal={() => setHapus(null)}
          loading={menghapus}
        />
      )}

      {/* ===== IMPOR EXCEL ===== */}
      {imporBuka && (
        <ExcelUploadModal
          db={db}
          apiUrl={apiUrl}
          toast={toast}
          onTutup={() => setImporBuka(false)}
          onSelesai={refresh}
        />
      )}
    </div>
  );
}
