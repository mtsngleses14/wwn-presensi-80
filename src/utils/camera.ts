// ============================================================
// Kamera & lokasi: kompres foto (canvas max 1024px, JPEG 0.8
// → base64 tanpa prefix) dan baca GPS dengan pesan error ramah.
// ============================================================

export interface Koordinat {
  lat: number;
  lng: number;
  akurasi: number; // meter
}

/** Muat gambar dari File/Blob menjadi HTMLImageElement. */
function muatGambar(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File gambar tidak bisa dibaca.'));
    };
    img.src = url;
  });
}

/**
 * Kompres foto: sisi terpanjang max 1024px, format JPEG kualitas 0.8.
 * Mengembalikan base64 TANPA prefix "data:..." (sesuai kontrak fotoBase64).
 */
export async function kompresFoto(file: File | Blob, batasSisi = 1024, kualitas = 0.8): Promise<string> {
  const img = await muatGambar(file);
  let { naturalWidth: w, naturalHeight: h } = img;
  if (w <= 0 || h <= 0) throw new Error('Gambar tidak valid.');

  const skala = Math.min(1, batasSisi / Math.max(w, h));
  w = Math.round(w * skala);
  h = Math.round(h * skala);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak mendukung kompresi gambar.');
  // Perbaiki orientasi EXIF sederhana tidak didukung canvas — gambar HP umumnya sudah benar via input file.
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl: string = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengompres foto.'));
          return;
        }
        const r = new FileReader();
        r.onerror = () => reject(new Error('Gagal membaca hasil kompresi.'));
        r.onload = () => resolve(String(r.result || ''));
        r.readAsDataURL(blob);
      },
      'image/jpeg',
      kualitas
    );
  });

  const koma = dataUrl.indexOf(',');
  if (koma < 0 || !dataUrl.startsWith('data:image/jpeg')) {
    throw new Error('Hasil kompresi bukan JPEG.');
  }
  return dataUrl.slice(koma + 1);
}

/**
 * Ambil koordinat GPS. Pesan error dibuat ramah untuk pengguna awam.
 */
export function ambilLokasi(timeoutMs = 20000): Promise<Koordinat> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Perangkat ini tidak mendukung GPS. Coba buka di HP dengan GPS aktif.'));
      return;
    }
    // Pastikan konteks aman (HTTPS / localhost) — geolocation diblokir di HTTP biasa.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new Error('Lokasi hanya bisa dibaca lewat koneksi aman (HTTPS). Buka aplikasi lewat alamat https://.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: pos.coords.accuracy });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              'Izin lokasi DITOLAK. Ketuk ikon gembok/kunci di address bar browser → izinkan "Lokasi", lalu coba lagi.'
            )
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Sinyal GPS tidak ditemukan. Pastikan GPS/Location HP aktif dan Anda di area terbuka.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Waktu habis menunggu GPS. Pastikan GPS aktif lalu coba lagi.'));
        } else {
          reject(new Error('Gagal membaca lokasi: ' + (err.message || 'kesalahan tidak dikenal.')));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}
