// src/pages/Verifikator.jsx
import { useAuth } from "../auth/AuthContext";

export default function Verifikator() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 24 }}>
      <h1>Halaman Kerja Verifikator</h1>
      <p>Selamat datang, {user?.name}</p>

      <p>
        Di sini nanti tampil daftar berkas untuk diverifikasi. 
        Bisa kamu kembangkan lebih lanjut (tabel, aksi setujui/tolak, dsb).
      </p>
    </div>
  );
}
