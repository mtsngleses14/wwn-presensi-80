import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { Button, Card, Field, LoadingBlock, TextInput, Toasts } from './components/ui';
import { fetchAllData, pingBackend } from './services/gasApi';
import type {
  AppDatabase,
  AuthSession,
  DatabaseStatus,
  PageKey,
  PenggunaLogin,
  SchoolEntry,
  ToastMsg,
} from './types';
import Dashboard from './pages/Dashboard';
import Presensi from './pages/Presensi';
import Izin from './pages/Izin';
import Laporan from './pages/Laporan';
import Rekap from './pages/Rekap';
import KelolaData from './pages/KelolaData';
import Pengaturan from './pages/Pengaturan';
import Konfigurasi from './pages/Konfigurasi';
import Login from './pages/Login';
import type { PageProps } from './pages/PageProps';

// ============================================================
// Presensi Sekolah Digital — orkestrasi utama.
// - Multi-sekolah via public/schools.json + ?school=<id>
// - Login WAJIB per sekolah (halaman non-dismissable)
// - Sesi tersimpan per sekolah di localStorage
// - Menu admin saja: Pengaturan, Konfigurasi, tab Pengguna,
//   tombol Setujui/Tolak izin
// ============================================================

const LS_SEKOLAH = 'wwn-presensi-80:sekolah-aktif';
const LS_URL_PREFIX = 'wwn-presensi-80:apiurl:';
const LS_SESI_PREFIX = 'wwn-presensi-80:sesi:';

const PENGATURAN_KOSONG = {
  namaSekolah: '', npsn: '', alamat: '', telepon: '', tahunPelajaran: '', kepalaSekolah: '', logoUrl: '',
  lat: '', lng: '', radiusMeter: '',
  waAktif: '', waEndpoint: '', waApiKey: '', waTemplateMasuk: '', waTemplatePulang: '', waTemplateIzin: '',
};

const DB_KOSONG: AppDatabase = {
  pengaturan: PENGATURAN_KOSONG,
  anggota: [], kelas: [], shift: [], izin: [], pengguna: [], hariLibur: [],
};

const HALAMAN_ADMIN: PageKey[] = ['pengaturan', 'konfigurasi'];

function urlUntukSekolah(s: SchoolEntry): string {
  try {
    return localStorage.getItem(LS_URL_PREFIX + s.id) || s.apiUrl || '';
  } catch {
    return s.apiUrl || '';
  }
}

function bacaSesi(sekolahId: string): AuthSession | null {
  try {
    const raw = localStorage.getItem(LS_SESI_PREFIX + sekolahId);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && j.user && typeof j.user.username === 'string') {
      return { isLoggedIn: true, user: j.user as PenggunaLogin };
    }
  } catch { /* abaikan */ }
  return null;
}

function tulisSesi(sekolahId: string, user: PenggunaLogin | null) {
  try {
    if (user) localStorage.setItem(LS_SESI_PREFIX + sekolahId, JSON.stringify({ user, savedAt: Date.now() }));
    else localStorage.removeItem(LS_SESI_PREFIX + sekolahId);
  } catch { /* abaikan */ }
}

// ============================================================
// Layar setup awal: dipakai saat sekolah terpilih BELUM punya
// URL backend (mis. entri seed di schools.json dengan apiUrl
// kosong). Tanpa ini, admin tidak bisa login & tidak bisa
// membuka menu Konfigurasi — jalan buntu.
// ============================================================

function SetupBackendAwal({
  sekolah,
  daftarSekolah,
  onGantiSekolah,
  onSimpanUrl,
  toast,
}: {
  sekolah: SchoolEntry | null;
  daftarSekolah: SchoolEntry[];
  onGantiSekolah: (s: SchoolEntry) => void;
  onSimpanUrl: (url: string) => void;
  toast: (tipe: ToastMsg['tipe'], pesan: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [menguji, setMenguji] = useState(false);
  const [hasilUji, setHasilUji] = useState('');

  const ujiKoneksi = async () => {
    const bersih = url.trim();
    if (!bersih.startsWith('https://script.google.com/')) {
      setHasilUji('❌ URL harus diawali https://script.google.com/');
      return;
    }
    setMenguji(true);
    setHasilUji('');
    try {
      const res = await pingBackend(bersih);
      if (res.success) setHasilUji(`✅ Terhubung! (versi ${res.data?.version || '?'}) — klik Simpan & Lanjutkan.`);
      else setHasilUji(`❌ Gagal: ${res.error || res.message}`);
    } catch {
      setHasilUji('❌ Gagal menghubungi URL tersebut.');
    } finally {
      setMenguji(false);
    }
  };

  const simpan = () => {
    const bersih = url.trim();
    if (!bersih.startsWith('https://script.google.com/')) {
      toast('error', 'URL harus diawali https://script.google.com/');
      return;
    }
    onSimpanUrl(bersih);
    toast('sukses', 'URL backend disimpan. Silakan login.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-900 p-4">
      <Card className="w-full max-w-md !rounded-3xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-3xl">🔌</div>
          <h1 className="text-lg font-bold text-slate-900">Hubungkan Backend Sekolah</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sekolah ? sekolah.nama : 'Sekolah'} belum terhubung ke Google Spreadsheet.
            Tempel URL Web App (/exec) dari Apps Script di bawah.
          </p>
        </div>
        <Field label="URL Web App (/exec)">
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
        </Field>
        {hasilUji && <p className="mt-2 text-sm">{hasilUji}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button varian="sekunder" kecil onClick={ujiKoneksi} loading={menguji}>
            Uji Koneksi
          </Button>
          <Button kecil onClick={simpan}>Simpan & Lanjutkan</Button>
        </div>
        {daftarSekolah.length > 1 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Atau pilih sekolah lain</p>
            <div className="space-y-1.5">
              {daftarSekolah.filter((s) => s.id !== sekolah?.id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onGantiSekolah(s)}
                  className="block w-full rounded-xl border border-slate-200 p-2.5 text-left text-sm font-semibold hover:border-indigo-300"
                >
                  {s.nama}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400">
          Panduan lengkap membuat backend ada di README.md repo ini (Bagian 1).
        </p>
      </Card>
    </div>
  );
}

export default function App() {
  const [daftarSekolah, setDaftarSekolah] = useState<SchoolEntry[]>([]);
  const [sekolah, setSekolah] = useState<SchoolEntry | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [db, setDb] = useState<AppDatabase>(DB_KOSONG);
  const [database, setDatabase] = useState<DatabaseStatus | null>(null);
  const [sesi, setSesi] = useState<AuthSession>({ isLoggedIn: false, user: null });
  const [memuatAwal, setMemuatAwal] = useState(true);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [galat, setGalat] = useState('');
  const [page, setPage] = useState<PageKey>('dashboard');
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((tipe: ToastMsg['tipe'], pesan: string) => {
    const id = ++toastId.current;
    setToasts((lama) => [...lama.slice(-2), { id, tipe, pesan }]);
    setTimeout(() => {
      setToasts((lama) => lama.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const tutupToast = useCallback((id: number) => {
    setToasts((lama) => lama.filter((t) => t.id !== id));
  }, []);

  const muatData = useCallback(
    async (url: string, awal = false) => {
      if (!url) {
        setDb(DB_KOSONG);
        setDatabase(null);
        setGalat('Backend belum dikonfigurasi. Buka menu Konfigurasi untuk menghubungkan Google Spreadsheet.');
        if (awal) setMemuatAwal(false);
        return;
      }
      if (awal) setMemuatAwal(true);
      else setMenyegarkan(true);
      setGalat('');
      try {
        const res = await fetchAllData(url);
        if (res.success && res.data) {
          setDb({
            pengaturan: { ...PENGATURAN_KOSONG, ...(res.data.pengaturan || {}) },
            anggota: res.data.anggota || [],
            kelas: res.data.kelas || [],
            shift: res.data.shift || [],
            izin: res.data.izin || [],
            pengguna: res.data.pengguna || [],
            hariLibur: res.data.hariLibur || [],
          });
          setDatabase(res.data.database || null);
        } else {
          setGalat(res.error || 'Gagal memuat data. Periksa URL backend di menu Konfigurasi.');
        }
      } catch {
        setGalat('Tidak dapat menghubungi backend. Periksa koneksi internet & URL backend.');
      } finally {
        if (awal) setMemuatAwal(false);
        else setMenyegarkan(false);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    await muatData(apiUrl, false);
  }, [muatData, apiUrl]);

  // Muat daftar sekolah sekali saat aplikasi dibuka
  useEffect(() => {
    let batal = false;
    (async () => {
      let daftar: SchoolEntry[] = [];
      try {
        const res = await fetch('/schools.json');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) daftar = json;
        }
      } catch {
        daftar = [];
      }
      if (batal) return;
      setDaftarSekolah(daftar);

      // Pilih sekolah: ?school= > localStorage > pertama di daftar
      const param = new URLSearchParams(window.location.search).get('school');
      let pilih: SchoolEntry | null = null;
      if (param) pilih = daftar.find((s) => s.id === param) || null;
      if (!pilih) {
        try {
          const tersimpan = localStorage.getItem(LS_SEKOLAH);
          if (tersimpan) pilih = daftar.find((s) => s.id === tersimpan) || null;
        } catch { /* abaikan */ }
      }
      if (!pilih && daftar.length > 0) pilih = daftar[0];
      setSekolah(pilih);
      if (pilih) {
        setApiUrl(urlUntukSekolah(pilih));
        // Pulihkan sesi tersimpan untuk sekolah ini (jika ada)
        const sesiTersimpan = bacaSesi(pilih.id);
        if (sesiTersimpan) setSesi(sesiTersimpan);
        try { localStorage.setItem(LS_SEKOLAH, pilih.id); } catch { /* abaikan */ }
      } else {
        setMemuatAwal(false);
        setGalat('Belum ada sekolah terdaftar. Atur URL backend manual di menu Konfigurasi.');
      }
    })();
    return () => { batal = true; };
  }, []);

  // Muat data setiap kali apiUrl berubah
  useEffect(() => {
    if (sekolah) muatData(apiUrl, true);
  }, [apiUrl, sekolah, muatData]);

  const gantiSekolah = useCallback(
    (s: SchoolEntry) => {
      // Reset sesi saat ganti sekolah — wajib login ulang (atau pulihkan sesi tersimpan sekolah tsb)
      setSesi({ isLoggedIn: false, user: null });
      setSekolah(s);
      setPage('dashboard');
      setDb(DB_KOSONG);
      setDatabase(null);
      setGalat('');
      const url = urlUntukSekolah(s);
      setApiUrl(url);
      const sesiTersimpan = bacaSesi(s.id);
      if (sesiTersimpan) setSesi(sesiTersimpan);
      try {
        localStorage.setItem(LS_SEKOLAH, s.id);
        const u = new URL(window.location.href);
        u.searchParams.set('school', s.id);
        window.history.replaceState(null, '', u.toString());
      } catch { /* abaikan */ }
    },
    []
  );

  const simpanUrlManual = useCallback(
    (url: string) => {
      if (sekolah) {
        try { localStorage.setItem(LS_URL_PREFIX + sekolah.id, url); } catch { /* abaikan */ }
      }
      setApiUrl(url);
    },
    [sekolah]
  );

  const handleLoginSukses = useCallback(
    (user: PenggunaLogin) => {
      setSesi({ isLoggedIn: true, user });
      if (sekolah) tulisSesi(sekolah.id, user);
      toast('sukses', `Selamat datang, ${user.nama}!`);
    },
    [sekolah, toast]
  );

  const handleLogout = useCallback(() => {
    setSesi({ isLoggedIn: false, user: null });
    if (sekolah) tulisSesi(sekolah.id, null);
    setPage('dashboard');
    toast('info', 'Anda telah keluar. Silakan masuk kembali.');
  }, [sekolah, toast]);

  const pindah = useCallback((p: PageKey) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const pageProps: PageProps = {
    db, apiUrl, refresh, toast, pindah,
    user: sesi.user,
  };

  const halamanAktif: PageKey =
    sesi.user?.peran !== 'admin' && HALAMAN_ADMIN.includes(page) ? 'dashboard' : page;

  const renderHalaman = () => {
    switch (halamanAktif) {
      case 'dashboard':
        return <Dashboard {...pageProps} />;
      case 'presensi':
        return <Presensi {...pageProps} />;
      case 'izin':
        return <Izin {...pageProps} />;
      case 'laporan':
        return <Laporan {...pageProps} />;
      case 'rekap':
        return <Rekap {...pageProps} />;
      case 'kelola':
        return <KelolaData {...pageProps} />;
      case 'pengaturan':
        return <Pengaturan {...pageProps} />;
      case 'konfigurasi':
        return (
          <Konfigurasi
            {...pageProps}
            sekolah={sekolah}
            daftarSekolah={daftarSekolah}
            onGantiSekolah={gantiSekolah}
            onSimpanUrl={simpanUrlManual}
            database={database}
          />
        );
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  // ===== Setup awal: sekolah tanpa URL backend → jalan buntu tanpa ini =====
  if (!memuatAwal && !apiUrl) {
    return (
      <>
        <SetupBackendAwal
          sekolah={sekolah}
          daftarSekolah={daftarSekolah}
          onGantiSekolah={gantiSekolah}
          onSimpanUrl={simpanUrlManual}
          toast={toast}
        />
        <Toasts daftar={toasts} onTutup={tutupToast} />
      </>
    );
  }

  // ===== Gerbang login: wajib sampai login sukses =====
  if (!sesi.isLoggedIn && !memuatAwal) {
    return (
      <>
        <Login apiUrl={apiUrl} sekolah={sekolah} onSukses={handleLoginSukses} />
        <Toasts daftar={toasts} onTutup={tutupToast} />
      </>
    );
  }

  return (
    <>
      <Layout
        page={halamanAktif}
        onPindah={pindah}
        sekolah={sekolah}
        daftarSekolah={daftarSekolah}
        onGantiSekolah={gantiSekolah}
        terhubung={!!database?.connected && !galat}
        logoUrl={db.pengaturan.logoUrl}
        user={sesi.user}
        onLogout={handleLogout}
      >
        {memuatAwal ? (
          <LoadingBlock teks="Memuat data dari Google Spreadsheet..." />
        ) : (
          <>
            {menyegarkan && (
              <p className="mb-3 text-center text-xs text-slate-400">Menyegarkan data...</p>
            )}
            {galat && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">⚠ {galat}</p>
                {sesi.user?.peran === 'admin' && halamanAktif !== 'konfigurasi' && (
                  <button onClick={() => pindah('konfigurasi')} className="mt-2 font-bold text-indigo-700 hover:underline">
                    Buka menu Konfigurasi →
                  </button>
                )}
              </div>
            )}
            {renderHalaman()}
          </>
        )}
      </Layout>
      <Toasts daftar={toasts} onTutup={tutupToast} />
    </>
  );
}
