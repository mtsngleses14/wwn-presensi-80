import { useRef, useState } from 'react';
import { ImagePlus, MapPin, MessageCircle, Save, Send, Trash2 } from 'lucide-react';
import { Button, Card, Field, PageHeader, TextAreaInput, TextInput } from '../components/ui';
import { kirimWA, saveSettings, uploadLogo } from '../services/gasApi';
import { ambilLokasi } from '../utils/camera';
import { nowHMS, todayDMY } from '../utils/format';
import type { PageProps } from './PageProps';

// ============================================================
// Pengaturan (khusus admin): identitas sekolah, titik lokasi +
// radius kehadiran, konfigurasi WA gateway (default kosong),
// dan logo sekolah.
// ============================================================

export default function Pengaturan({ db, apiUrl, refresh, toast }: PageProps) {
  const p = db.pengaturan;
  const [namaSekolah, setNamaSekolah] = useState(p.namaSekolah || '');
  const [npsn, setNpsn] = useState(p.npsn || '');
  const [alamat, setAlamat] = useState(p.alamat || '');
  const [telepon, setTelepon] = useState(p.telepon || '');
  const [tahunPelajaran, setTahunPelajaran] = useState(p.tahunPelajaran || '');
  const [kepalaSekolah, setKepalaSekolah] = useState(p.kepalaSekolah || '');
  const [logoUrl, setLogoUrl] = useState(p.logoUrl || '');

  const [lat, setLat] = useState(p.lat || '');
  const [lng, setLng] = useState(p.lng || '');
  const [radiusMeter, setRadiusMeter] = useState(p.radiusMeter || '');
  const [mengambilLokasi, setMengambilLokasi] = useState(false);
  const [galatLokasi, setGalatLokasi] = useState('');

  const [waAktif, setWaAktif] = useState(p.waAktif === 'true');
  const [waEndpoint, setWaEndpoint] = useState(p.waEndpoint || '');
  const [waApiKey, setWaApiKey] = useState(p.waApiKey || '');
  const [waTemplateMasuk, setWaTemplateMasuk] = useState(p.waTemplateMasuk || '');
  const [waTemplatePulang, setWaTemplatePulang] = useState(p.waTemplatePulang || '');
  const [waTemplateIzin, setWaTemplateIzin] = useState(p.waTemplateIzin || '');
  const [tesNoWA, setTesNoWA] = useState('');
  const [mengirimTes, setMengirimTes] = useState(false);

  const [err, setErr] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [mengunggah, setMengunggah] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bacaFile = (file: File): Promise<{ base64: string; mime: string }> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('Gagal membaca file.'));
      r.onload = () => {
        const dataUrl = String(r.result || '');
        const [head, base64] = dataUrl.split(',');
        const mime = (head.match(/data:(.*?);/) || [])[1] || file.type || 'image/png';
        resolve({ base64: base64 || '', mime });
      };
      r.readAsDataURL(file);
    });

  const unggahLogo = async (file: File | undefined) => {
    if (!file || mengunggah) return;
    if (!file.type.startsWith('image/')) {
      toast('error', 'File harus berupa gambar (PNG/JPG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('error', 'Ukuran gambar maksimal 2 MB.');
      return;
    }
    setMengunggah(true);
    try {
      const { base64, mime } = await bacaFile(file);
      const up = await uploadLogo(apiUrl, { fileName: file.name, base64Data: base64, mimeType: mime });
      if (!up.success || !up.data?.url) {
        toast('error', up.error || up.message || 'Gagal mengunggah logo.');
        return;
      }
      const simpan = await saveSettings(apiUrl, { ...db.pengaturan, logoUrl: up.data.url });
      if (simpan.success) {
        setLogoUrl(up.data.url);
        toast('sukses', 'Logo berhasil diunggah dan disimpan.');
        await refresh();
      } else {
        toast('error', 'Logo terunggah, tetapi gagal menyimpan ke pengaturan.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan saat mengunggah logo.');
    } finally {
      setMengunggah(false);
    }
  };

  const hapusLogo = async () => {
    setMenyimpan(true);
    try {
      const res = await saveSettings(apiUrl, { ...db.pengaturan, logoUrl: '' });
      if (res.success) {
        setLogoUrl('');
        toast('sukses', 'Logo dihapus.');
        await refresh();
      } else {
        toast('error', res.error || 'Gagal menghapus logo.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan.');
    } finally {
      setMenyimpan(false);
    }
  };

  const ambilLokasiSaya = async () => {
    setMengambilLokasi(true);
    setGalatLokasi('');
    try {
      const k = await ambilLokasi();
      setLat(String(k.lat));
      setLng(String(k.lng));
      toast('sukses', `Lokasi tercatat (±${Math.round(k.akurasi)} m). Sesuaikan radius lalu Simpan.`);
    } catch (e) {
      setGalatLokasi(e instanceof Error ? e.message : 'Gagal membaca lokasi.');
    } finally {
      setMengambilLokasi(false);
    }
  };

  const kirimTesWA = async () => {
    const no = tesNoWA.replace(/[^0-9]/g, '');
    if (!no) {
      toast('error', 'Isi nomor WhatsApp tujuan untuk tes (format 08xx).');
      return;
    }
    setMengirimTes(true);
    try {
      const res = await kirimWA(apiUrl, {
        to: no,
        template: `*Tes Notifikasi WA* — Aplikasi Presensi Sekolah Digital.\nJika pesan ini diterima, konfigurasi WhatsApp gateway sudah benar. ({tanggal} {jam})`,
        params: { nama: 'Tes', tanggal: todayDMY(), jam: nowHMS() },
      });
      if (res.success && res.data?.terkirim) {
        toast('sukses', 'Pesan tes terkirim! Cek WhatsApp tujuan.');
      } else {
        toast('info', res.data?.pesan || res.error || 'Pesan tes tidak terkirim (mungkin WA belum dikonfigurasi).');
      }
    } catch {
      toast('error', 'Gagal mengirim pesan tes.');
    } finally {
      setMengirimTes(false);
    }
  };

  const simpan = async () => {
    if (!namaSekolah.trim()) { setErr('Nama sekolah wajib diisi.'); return; }
    setErr('');
    setMenyimpan(true);
    try {
      const res = await saveSettings(apiUrl, {
        ...db.pengaturan,
        namaSekolah: namaSekolah.trim(),
        npsn: npsn.trim(),
        alamat: alamat.trim(),
        telepon: telepon.trim(),
        tahunPelajaran: tahunPelajaran.trim(),
        kepalaSekolah: kepalaSekolah.trim(),
        logoUrl: logoUrl.trim(),
        lat: lat.trim(),
        lng: lng.trim(),
        radiusMeter: radiusMeter.trim(),
        waAktif: waAktif ? 'true' : 'false',
        waEndpoint: waEndpoint.trim(),
        waApiKey: waApiKey.trim(),
        waTemplateMasuk: waTemplateMasuk.trim(),
        waTemplatePulang: waTemplatePulang.trim(),
        waTemplateIzin: waTemplateIzin.trim(),
      });
      if (res.success) {
        toast('sukses', 'Pengaturan berhasil disimpan.');
        await refresh();
      } else {
        toast('error', res.error || 'Gagal menyimpan pengaturan.');
      }
    } catch {
      toast('error', 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div>
      <PageHeader judul="Pengaturan" subjudul="Identitas, lokasi kehadiran & notifikasi WhatsApp (khusus admin)" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold text-slate-900">Identitas Sekolah</h2>
          <div className="space-y-3">
            <Field label="Nama Sekolah">
              <TextInput value={namaSekolah} onChange={(e) => setNamaSekolah(e.target.value)} placeholder="Nama madrasah/sekolah" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NPSN / NSM">
                <TextInput value={npsn} onChange={(e) => setNpsn(e.target.value)} placeholder="Nomor pokok sekolah" />
              </Field>
              <Field label="Telepon">
                <TextInput value={telepon} onChange={(e) => setTelepon(e.target.value)} placeholder="No. telepon" />
              </Field>
            </div>
            <Field label="Alamat">
              <TextInput value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="Alamat lengkap" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tahun Pelajaran">
                <TextInput value={tahunPelajaran} onChange={(e) => setTahunPelajaran(e.target.value)} placeholder="2026/2027" />
              </Field>
              <Field label="Kepala Madrasah">
                <TextInput value={kepalaSekolah} onChange={(e) => setKepalaSekolah(e.target.value)} placeholder="Nama kepala" />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900">
            <MapPin className="h-5 w-5 text-indigo-600" /> Titik Lokasi Kehadiran
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Presensi di luar radius ini akan <b>ditolak</b>. Kosongkan koordinat untuk menonaktifkan
            validasi lokasi (tidak disarankan).
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <TextInput value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-7.123456" inputMode="decimal" />
              </Field>
              <Field label="Longitude">
                <TextInput value={lng} onChange={(e) => setLng(e.target.value)} placeholder="110.123456" inputMode="decimal" />
              </Field>
            </div>
            <Field label="Radius (meter)">
              <TextInput type="number" min={0} value={radiusMeter} onChange={(e) => setRadiusMeter(e.target.value)} placeholder="100" />
            </Field>
            <Button varian="sekunder" kecil onClick={ambilLokasiSaya} loading={mengambilLokasi}>
              <MapPin className="h-4 w-4" /> Ambil Lokasi Saya
            </Button>
            {galatLokasi && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{galatLokasi}</p>}
            <p className="text-xs text-slate-400">
              💡 Berdirilah di titik tengah sekolah (mis. halaman utama) lalu ketuk tombol di atas.
            </p>
          </div>
        </Card>
      </div>

      {/* Notifikasi WhatsApp */}
      <Card className="mt-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-900">
          <MessageCircle className="h-5 w-5 text-emerald-600" /> Notifikasi WhatsApp
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Isi endpoint & API key gateway WA Anda (mis. WAPrioritas/Fonnte/dll). Selama belum diisi,
          notifikasi dilewati otomatis tanpa error.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={waAktif}
            onChange={(e) => setWaAktif(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Aktifkan notifikasi WhatsApp
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WA Endpoint (URL API)">
            <TextInput value={waEndpoint} onChange={(e) => setWaEndpoint(e.target.value)} placeholder="https://.../send" />
          </Field>
          <Field label="WA API Key">
            <TextInput type="password" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} placeholder="API key gateway" autoComplete="off" />
          </Field>
        </div>
        <div className="mt-3 space-y-3">
          <Field label="Template pesan — Presensi Masuk">
            <TextAreaInput value={waTemplateMasuk} onChange={(e) => setWaTemplateMasuk(e.target.value)} rows={2} placeholder="Kosong = pakai bawaan backend" />
          </Field>
          <Field label="Template pesan — Presensi Pulang">
            <TextAreaInput value={waTemplatePulang} onChange={(e) => setWaTemplatePulang(e.target.value)} rows={2} placeholder="Kosong = pakai bawaan backend" />
          </Field>
          <Field label="Template pesan — Keputusan Izin">
            <TextAreaInput value={waTemplateIzin} onChange={(e) => setWaTemplateIzin(e.target.value)} rows={2} placeholder="Kosong = pakai bawaan backend" />
          </Field>
          <p className="text-xs text-slate-400">
            Variabel yang tersedia: {'{nama}'}, {'{tanggal}'}, {'{jam}'}, {'{status}'}, {'{jenis}'}, {'{keputusan}'}.
          </p>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-600">Tes kirim pesan (action <code>kirimWA</code>)</p>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[200px] flex-1">
                <TextInput
                  value={tesNoWA}
                  onChange={(e) => setTesNoWA(e.target.value)}
                  placeholder="Nomor WA tujuan, mis. 081234567890"
                  inputMode="tel"
                />
              </div>
              <Button varian="sekunder" kecil onClick={kirimTesWA} loading={mengirimTes}>
                <Send className="h-4 w-4" /> Kirim Tes
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Logo sekolah */}
      <Card className="mt-4">
        <h2 className="mb-1 font-bold text-slate-900">Logo Sekolah</h2>
        <p className="mb-4 text-xs text-slate-500">
          Logo tampil di beranda dan kop laporan cetak. Format PNG/JPG, maksimal 2 MB.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo sekolah" className="h-full w-full object-contain" />
            ) : (
              <span className="px-2 text-center text-xs text-slate-400">Belum ada logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button varian="sekunder" kecil onClick={() => fileRef.current?.click()} loading={mengunggah}>
              <ImagePlus className="h-4 w-4" /> {logoUrl ? 'Ganti Logo' : 'Unggah Logo'}
            </Button>
            {logoUrl && (
              <Button varian="bahaya" kecil onClick={hapusLogo} disabled={mengunggah || menyimpan}>
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={(e) => {
                unggahLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </Card>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-4">
        <Button onClick={simpan} loading={menyimpan} className="w-full sm:w-auto sm:px-10">
          <Save className="h-4 w-4" /> Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
