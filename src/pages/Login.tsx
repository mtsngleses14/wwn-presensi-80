import { useState } from 'react';
import { KeyRound, Timer, User } from 'lucide-react';
import { loginBackend } from '../services/gasApi';
import { Button, Field, TextInput } from '../components/ui';
import type { PenggunaLogin, SchoolEntry } from '../types';

// ============================================================
// Halaman login WAJIB — non-dismissable. Muncul sampai login
// sukses. Sesi berlaku per sekolah (disimpan di localStorage).
// ============================================================

export default function Login({
  apiUrl,
  sekolah,
  onSukses,
}: {
  apiUrl: string;
  sekolah: SchoolEntry | null;
  onSukses: (user: PenggunaLogin) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [masuk, setMasuk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErr('Isi username dan password.');
      return;
    }
    setErr('');
    setMasuk(true);
    try {
      const res = await loginBackend(apiUrl, username, password);
      if (res.success && res.data?.user) {
        onSukses(res.data.user);
      } else {
        setErr(res.error || res.message || 'Username atau password salah.');
      }
    } catch {
      setErr('Tidak dapat menghubungi backend. Periksa koneksi & URL backend.');
    } finally {
      setMasuk(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-4xl">
            ⏱️
          </div>
          <h1 className="text-xl font-bold text-slate-900">Presensi Sekolah Digital</h1>
          <p className="mt-1 text-sm font-semibold text-indigo-700">
            {sekolah ? sekolah.nama : 'Silakan masuk untuk melanjutkan'}
          </p>
          {!apiUrl && (
            <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700">
              Backend belum dikonfigurasi. Hubungi admin untuk mengatur URL backend di menu Konfigurasi.
            </p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoComplete="username"
                className="pl-9"
              />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                autoComplete="current-password"
                className="pl-9"
              />
            </div>
          </Field>
          {err && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{err}</p>
          )}
          <Button type="submit" loading={masuk} disabled={!apiUrl} className="w-full">
            <Timer className="h-4 w-4" /> Masuk
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Akun dibuat & dikelola admin di menu Kelola Data → Pengguna.
        </p>
      </div>
    </div>
  );
}
