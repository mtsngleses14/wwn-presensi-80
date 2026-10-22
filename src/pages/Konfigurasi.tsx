import { useEffect, useState } from 'react';
import { Database, PlugZap, RefreshCw, School } from 'lucide-react';
import { Button, Card, Field, PageHeader, TextInput } from '../components/ui';
import { initDatabase, pingBackend } from '../services/gasApi';
import type { DatabaseStatus, SchoolEntry } from '../types';
import type { PageProps } from './PageProps';

interface Props extends PageProps {
  sekolah: SchoolEntry | null;
  daftarSekolah: SchoolEntry[];
  onGantiSekolah: (s: SchoolEntry) => void;
  onSimpanUrl: (url: string) => void;
  database: DatabaseStatus | null;
}

export default function Konfigurasi({ apiUrl, toast, refresh, sekolah, daftarSekolah, onGantiSekolah, onSimpanUrl, database }: Props) {
  const [url, setUrl] = useState(apiUrl);
  const [menguji, setMenguji] = useState(false);
  const [inisialisasi, setInisialisasi] = useState(false);
  const [hasilUji, setHasilUji] = useState('');

  useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl]);

  const simpanUrl = () => {
    const bersih = url.trim();
    if (!bersih.startsWith('https://script.google.com/')) {
      toast('error', 'URL harus diawali https://script.google.com/');
      return;
    }
    onSimpanUrl(bersih);
    toast('sukses', 'URL backend disimpan. Memuat ulang data...');
  };

  const ujiKoneksi = async () => {
    setMenguji(true);
    setHasilUji('');
    try {
      const res = await pingBackend(url.trim());
      if (res.success) {
        setHasilUji(`✅ Terhubung! ${res.message || ''} (versi ${res.data?.version || '?'})`);
      } else {
        setHasilUji(`❌ Gagal: ${res.error || res.message}`);
      }
    } catch {
      setHasilUji('❌ Gagal menghubungi URL tersebut.');
    } finally {
      setMenguji(false);
    }
  };

  const jalankanInisialisasi = async () => {
    if (!apiUrl) {
      toast('error', 'Simpan URL backend terlebih dahulu.');
      return;
    }
    setInisialisasi(true);
    try {
      const res = await initDatabase(apiUrl);
      if (res.success) {
        toast('sukses', '8 sheet database berhasil dibuat!');
        await refresh();
      } else {
        toast('error', res.error || 'Gagal inisialisasi.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan.');
    } finally {
      setInisialisasi(false);
    }
  };

  return (
    <div>
      <PageHeader judul="Konfigurasi" subjudul="Koneksi backend Google Spreadsheet & pilihan sekolah (khusus admin)" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <School className="h-5 w-5 text-indigo-600" /> Sekolah Aktif
          </h2>
          <p className="mb-3 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">
            {sekolah ? sekolah.nama : 'Belum ada sekolah dipilih'}
          </p>
          {daftarSekolah.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-400">Ganti sekolah</p>
              {daftarSekolah.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onGantiSekolah(s)}
                  disabled={sekolah?.id === s.id}
                  className={`block w-full rounded-xl border p-3 text-left text-sm font-semibold transition disabled:opacity-60 ${
                    sekolah?.id === s.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {s.nama} {sekolah?.id === s.id && '✓'}
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Daftar sekolah diambil dari <code>public/schools.json</code>. Tambah sekolah baru = tambah entri di file itu lalu push (Vercel deploy otomatis).
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
            <PlugZap className="h-5 w-5 text-indigo-600" /> Backend Google Apps Script
          </h2>
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
              <RefreshCw className="h-4 w-4" /> Uji Koneksi
            </Button>
            <Button kecil onClick={simpanUrl}>Simpan URL</Button>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">Langkah setup backend (sekali per sekolah):</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Buat Google Spreadsheet baru.</li>
              <li>Buka Extensions → Apps Script, hapus isi editor, paste file <code>backend/Kode.gs</code> dari repo ini.</li>
              <li>Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).</li>
              <li>Salin URL /exec ke kolom di atas, klik Simpan URL, lalu Uji Koneksi.</li>
              <li>Klik tombol "Inisialisasi 8 Sheet" di bawah.</li>
            </ol>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
          <Database className="h-5 w-5 text-indigo-600" /> Database Spreadsheet
        </h2>
        {database ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Spreadsheet: <b>{database.spreadsheetTitle}</b>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {database.sheets.map((s) => (
                <div
                  key={s.name}
                  className={`rounded-xl border p-3 text-center ${s.exists ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
                >
                  <p className="text-xs font-bold">{s.name}</p>
                  <p className="mt-1 text-lg font-bold">{s.exists ? s.rowCount : '✗'}</p>
                  <p className="text-[10px] text-slate-400">{s.exists ? 'baris data' : 'belum ada'}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Backend belum terhubung — data sheet belum bisa ditampilkan.</p>
        )}
        <div className="mt-4">
          <Button varian="kuning" onClick={jalankanInisialisasi} loading={inisialisasi} disabled={!apiUrl}>
            <Database className="h-4 w-4" /> Inisialisasi 8 Sheet
          </Button>
        </div>
      </Card>
    </div>
  );
}
