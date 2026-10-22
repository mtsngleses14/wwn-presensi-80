import type { AppDatabase, PageKey, PenggunaLogin, ToastMsg } from '../types';

// Props bersama untuk semua halaman
export interface PageProps {
  db: AppDatabase;
  apiUrl: string;
  refresh: () => Promise<void>;
  toast: (tipe: ToastMsg['tipe'], pesan: string) => void;
  pindah: (p: PageKey) => void;
  user: PenggunaLogin | null;
}
