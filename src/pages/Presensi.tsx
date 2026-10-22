import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Search,
  User,
  X,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, LoadingBlock, PageHeader, SelectInput, TextInput } from '../components/ui';
import { checkIn, checkOut, getPresensi } from '../services/gasApi';
import { ambilLokasi, kompresFoto, type Koordinat } from '../utils/camera';
import { formatTanggalPanjang, jamPendek, nowHMS, todayDMY } from '../utils/format';
import type { AnggotaItem, PresensiItem, TipeAnggota } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Presensi: pilih tipe → cari anggota → status hari ini →
// tombol Masuk/Pulang → GPS + foto → kirim → hasil.
// ============================================================

type Langkah = 'siap' | 'lokasi' | 'foto' | 'kirim' | 'hasil';

interface HasilKirim {
  ok: boolean;
  pesan: string;
  statusMasuk?: string;
  waTerkirim?: boolean;
  jam?: string;
}

export default function Presensi({ db, apiUrl, toast, refresh }: PageProps) {
  const [tipe, setTipe] = useState<TipeAnggota>('GURU');
  const [cari, setCari] = useState('');
  const [terpilih, setTerpilih] = useState<AnggotaItem | null>(null);
  const [presensiHariIni, setPresensiHariIni] = useState<Record<string, PresensiItem>>({});
  const [memuatStatus, setMemuatStatus] = useState(true);

  // State modal presensi
  const [modalBuka, setModalBuka] = useState(false);
  const [mode, setMode] = useState<'masuk' | 'pulang'>('masuk');
  const [langkah, setLangkah] = useState<Langkah>('siap');
  const [koordinat, setKoordinat] = useState<Koordinat | null>(null);
  const [galatLokasi, setGalatLokasi] = useState('');
  const [fotoPreview, setFotoPreview] = useState('');
  const [fotoBase64, setFotoBase64] = useState('');
  const [galatFoto, setGalatFoto] = useState('');
  const [hasil, setHasil] = useState<HasilKirim | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tanggal = todayDMY();

  // Muat status presensi hari ini (sekali per tipe/tanggal)
  useEffect(() => {
    let batal = false;
    (async () => {
      setMemuatStatus(true);
      const res = await getPresensi(apiUrl, { tanggalDari: tanggal, tanggalSampai: tanggal, tipe });
      if (!batal) {
        if (res.success && res.data) {
          const peta: Record<string, PresensiItem> = {};
          for (const r of res.data.items) peta[r.anggotaId] = r;
          setPresensiHariIni(peta);
        } else if (res.error) {
          toast('error', 'Gagal memuat status presensi: ' + res.error);
        }
        setMemuatStatus(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [apiUrl, tanggal, tipe, toast]);

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return db.anggota
      .filter((a) => a.tipe === tipe && a.statusAktif)
      .filter((a) => {
        if (!q) return true;
        return `${a.nama} ${a.kelasNama} ${a.jabatan}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [db.anggota, tipe, cari]);

  const statusAnggota = (a: AnggotaItem): PresensiItem | undefined => presensiHariIni[a.id];

  const mulaiPresensi = (m: 'masuk' | 'pulang') => {
    if (!terpilih) return;
    setMode(m);
    setLangkah('siap');
    setKoordinat(null);
    setGalatLokasi('');
    setFotoPreview('');
    setFotoBase64('');
    setGalatFoto('');
    setHasil(null);
    setModalBuka(true);
  };

  const bacaLokasi = async () => {
    setLangkah('lokasi');
    setGalatLokasi('');
    try {
      const k = await ambilLokasi();
      setKoordinat(k);
      setLangkah('foto');
    } catch (e) {
      setGalatLokasi(e instanceof Error ? e.message : 'Gagal membaca lokasi.');
      setLangkah('siap');
    }
  };

  const pilihFoto = async (file: File | undefined) => {
    if (!file) return;
    setGalatFoto('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran foto maksimal 10 MB sebelum kompresi.');
      const base64 = await kompresFoto(file);
      if (base64.length > 1_500_000 * 1.4) {
        throw new Error('Foto masih terlalu besar setelah dikompres. Coba ambil ulang dengan resolusi lebih rendah.');
      }
      setFotoBase64(base64);
      setFotoPreview(`data:image/jpeg;base64,${base64}`);
      setLangkah('kirim');
    } catch (e) {
      setGalatFoto(e instanceof Error ? e.message : 'Gagal memproses foto.');
    }
  };

  const kirim = async () => {
    if (!terpilih || !koordinat || !fotoBase64) return;
    const jam = nowHMS();
    const namaFile = `${mode === 'masuk' ? 'MASUK' : 'PULANG'}_${terpilih.id}_${jam.replace(/:/g, '')}.jpg`;
    const payload = {
      anggotaId: terpilih.id,
      tanggal,
      jam,
      lat: koordinat.lat,
      lng: koordinat.lng,
      fotoBase64,
      fileName: namaFile,
    };
    try {
      const res = mode === 'masuk' ? await checkIn(apiUrl, payload) : await checkOut(apiUrl, payload);
      if (res.success && res.data) {
        const r = res.data;
        setHasil({
          ok: true,
          pesan: `Presensi ${mode === 'masuk' ? 'MASUK' : 'PULANG'} berhasil dicatat.`,
          statusMasuk: 'statusMasuk' in r ? (r as { statusMasuk?: string }).statusMasuk : undefined,
          waTerkirim: r.waTerkirim,
          jam,
        });
        // Perbarui status hari ini tanpa reload penuh
        setPresensiHariIni((lama) => ({ ...lama, [terpilih.id]: r.record }));
        await refresh();
      } else {
        setHasil({ ok: false, pesan: res.error || res.message || 'Gagal mencatat presensi.' });
      }
    } catch {
      setHasil({ ok: false, pesan: 'Terjadi kesalahan jaringan.' });
    }
    setLangkah('hasil');
  };

  const tutupModal = () => {
    setModalBuka(false);
    setFotoPreview('');
  };

  const info = terpilih ? statusAnggota(terpilih) : undefined;
  const sudahMasuk = !!info?.jamMasuk;
  const sudahPulang = !!info?.jamPulang;

  return (
    <div>
      <PageHeader judul="Presensi" subjudul={formatTanggalPanjang(tanggal)} />

      {/* Pilih tipe */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
        {(['GURU', 'SISWA'] as TipeAnggota[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTipe(t);
              setTerpilih(null);
              setCari('');
            }}
            className={`rounded-xl py-2.5 text-sm font-bold transition ${
              tipe === t ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t === 'GURU' ? '👨‍🏫 Guru & Karyawan' : '🎒 Siswa'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Daftar anggota */}
        <Card className="lg:col-span-2">
          <Field label={`Cari ${tipe === 'GURU' ? 'guru/karyawan' : 'siswa'}`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Ketik nama..."
                className="pl-9"
              />
            </div>
          </Field>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
            {memuatStatus ? (
              <LoadingBlock teks="Memuat status hari ini..." />
            ) : daftar.length === 0 ? (
              <EmptyState judul="Tidak ada anggota" subjudul="Tambahkan dulu di menu Kelola Data → Anggota." />
            ) : (
              daftar.map((a) => {
                const st = statusAnggota(a);
                const aktif = terpilih?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setTerpilih(a)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      aktif ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{a.nama}</p>
                      <p className="truncate text-xs text-slate-500">
                        {a.tipe === 'SISWA' ? a.kelasNama || '-' : a.jabatan || '-'}
                      </p>
                    </div>
                    {st?.jamMasuk ? (
                      st.jamPulang ? (
                        <Badge warna="hijau">Pulang ✓</Badge>
                      ) : (
                        <Badge warna="biru">Masuk {jamPendek(st.jamMasuk)}</Badge>
                      )
                    ) : (
                      <Badge warna="abu">Belum</Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Panel presensi anggota terpilih */}
        <div className="lg:col-span-3">
          {!terpilih ? (
            <Card className="flex h-full min-h-[240px] items-center justify-center">
              <div className="text-center">
                <Clock className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="font-semibold text-slate-500">Pilih anggota di daftar untuk presensi</p>
                <p className="mt-1 text-xs text-slate-400">Presensi membutuhkan GPS dan foto yang diambil saat itu juga.</p>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{terpilih.nama}</h2>
                  <p className="text-sm text-slate-500">
                    {terpilih.tipe} • {terpilih.tipe === 'SISWA' ? terpilih.kelasNama || '-' : terpilih.jabatan || '-'}
                  </p>
                </div>
                <button
                  onClick={() => setTerpilih(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Batal pilih"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Status hari ini */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Jam Masuk</p>
                  <p className="font-mono-num text-lg font-bold text-slate-900">
                    {info?.jamMasuk ? jamPendek(info.jamMasuk) : '-'}
                  </p>
                  {info?.statusMasuk && (
                    <Badge warna={info.statusMasuk === 'TERLAMBAT' ? 'kuning' : 'hijau'}>{info.statusMasuk}</Badge>
                  )}
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Jam Pulang</p>
                  <p className="font-mono-num text-lg font-bold text-slate-900">
                    {info?.jamPulang ? jamPendek(info.jamPulang) : '-'}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  varian="hijau"
                  onClick={() => mulaiPresensi('masuk')}
                  disabled={sudahMasuk}
                  className="py-4 text-base"
                >
                  <LogIn className="h-5 w-5" />
                  {sudahMasuk ? 'Sudah Presensi Masuk' : 'Presensi Masuk'}
                </Button>
                <Button
                  varian="kuning"
                  onClick={() => mulaiPresensi('pulang')}
                  disabled={!sudahMasuk || sudahPulang}
                  className="py-4 text-base"
                >
                  <LogOut className="h-5 w-5" />
                  {sudahPulang ? 'Sudah Presensi Pulang' : 'Presensi Pulang'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                💡 Pastikan GPS aktif dan izinkan akses lokasi saat diminta browser. Foto diambil langsung dari kamera.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* ===== Modal alur presensi ===== */}
      {modalBuka && terpilih && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Presensi {mode === 'masuk' ? 'Masuk' : 'Pulang'} — {terpilih.nama}
              </h2>
              <button onClick={tutupModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Langkah 1: lokasi */}
            {langkah === 'siap' && (
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                  <MapPin className="h-8 w-8 text-indigo-600" />
                </div>
                <p className="mb-1 font-semibold text-slate-900">Langkah 1 dari 2: Lokasi GPS</p>
                <p className="mb-4 text-sm text-slate-500">
                  Kami perlu tahu posisi Anda untuk memastikan presensi dilakukan di area sekolah.
                </p>
                {galatLokasi && (
                  <p className="mb-3 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">{galatLokasi}</p>
                )}
                <Button onClick={bacaLokasi} className="w-full">
                  <MapPin className="h-4 w-4" /> Ambil Lokasi Saya
                </Button>
              </div>
            )}

            {langkah === 'lokasi' && (
              <div className="py-10 text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm text-slate-500">Membaca GPS... mohon tunggu.</p>
              </div>
            )}

            {/* Langkah 2: foto */}
            {langkah === 'foto' && (
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
                  <Camera className="h-8 w-8 text-violet-600" />
                </div>
                <p className="mb-1 font-semibold text-slate-900">Langkah 2 dari 2: Foto</p>
                <p className="mb-1 text-sm text-slate-500">
                  Lokasi tercatat ✓ (±{koordinat ? Math.round(koordinat.akurasi) : '?'} m)
                </p>
                <p className="mb-4 text-sm text-slate-500">Ambil foto wajah/selfie sebagai bukti kehadiran.</p>
                {galatFoto && (
                  <p className="mb-3 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">{galatFoto}</p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    pilihFoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button varian="ungu" onClick={() => fileRef.current?.click()} className="w-full">
                  <Camera className="h-4 w-4" /> Ambil Foto
                </Button>
              </div>
            )}

            {/* Langkah 3: konfirmasi & kirim */}
            {langkah === 'kirim' && (
              <div>
                <p className="mb-3 font-semibold text-slate-900">Periksa sebelum dikirim</p>
                <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200">
                  {fotoPreview && <img src={fotoPreview} alt="Foto presensi" className="max-h-64 w-full object-cover" />}
                </div>
                <div className="mb-4 space-y-1.5 text-sm">
                  <p className="flex items-center gap-2 text-slate-600">
                    <MapPin className="h-4 w-4 text-indigo-600" />
                    {koordinat ? `${koordinat.lat.toFixed(6)}, ${koordinat.lng.toFixed(6)}` : '-'}
                  </p>
                  <p className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    {tanggal} • {nowHMS().slice(0, 5)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button varian="sekunder" onClick={() => setLangkah('foto')} className="flex-1">
                    Foto Ulang
                  </Button>
                  <Button onClick={kirim} className="flex-1">
                    <CheckCircle2 className="h-4 w-4" /> Kirim Presensi
                  </Button>
                </div>
              </div>
            )}

            {/* Hasil */}
            {langkah === 'hasil' && hasil && (
              <div className="text-center">
                <div
                  className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl ${
                    hasil.ok ? 'bg-emerald-100' : 'bg-red-100'
                  }`}
                >
                  {hasil.ok ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  ) : (
                    <X className="h-8 w-8 text-red-600" />
                  )}
                </div>
                <p className="mb-1 text-lg font-bold text-slate-900">
                  {hasil.ok ? 'Berhasil!' : 'Gagal'}
                </p>
                <p className="mb-3 text-sm text-slate-600">{hasil.pesan}</p>
                {hasil.ok && (
                  <div className="mb-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-left text-sm">
                    {hasil.statusMasuk && (
                      <p>
                        Status: <Badge warna={hasil.statusMasuk === 'TERLAMBAT' ? 'kuning' : 'hijau'}>{hasil.statusMasuk}</Badge>
                      </p>
                    )}
                    {hasil.jam && (
                      <p className="text-slate-600">
                        Jam: <b className="font-mono-num">{hasil.jam}</b>
                      </p>
                    )}
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <MessageCircle className="h-4 w-4 text-emerald-600" />
                      Notifikasi WA: <b>{hasil.waTerkirim ? 'terkirim ✓' : 'tidak dikirim'}</b>
                    </p>
                  </div>
                )}
                <Button onClick={tutupModal} className="w-full">
                  Selesai
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter tambahan di bawah daftar (opsional): pilih kelas untuk siswa */}
      {tipe === 'SISWA' && (
        <Card className="mt-4">
          <Field label="Filter kelas (opsional)">
            <SelectInput
              value=""
              onChange={(e) => setCari(e.target.value)}
            >
              <option value="">Semua kelas</option>
              {db.kelas.map((k) => (
                <option key={k.id} value={k.nama}>
                  {k.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
        </Card>
      )}
    </div>
  );
}
