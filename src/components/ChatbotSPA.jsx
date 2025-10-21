import React, { useEffect, useRef, useState } from "react";

/** ================== KONFIG ================== */
const SUPPORT_WHATSAPP_URL = "https://wa.me/62XXXXXXXXXXX"; // ✅ GANTI ke nomor WA resmi kalian

/** ====== Jawaban yang sudah di-setting (FAQ) ======
 * Urutan dari yang paling sering ditanya sampai yang jarang.
 * Kamu bisa edit/ambah keywords & answer kapan saja.
 */
const FAQ_ANSWERS = [
  /* --- Paling sering --- */
  {
    keywords: ["apa itu samyan", "samyan itu", "definisi", "pengertian", "fungsi samyan"],
    answer:
      "SAMYAN (Sistem Administrasi Pelayanan) adalah platform untuk mengelola data & dokumen layanan agar proses lebih cepat, terdokumentasi, dan mengurangi penggunaan kertas.",
  },
  {
    keywords: ["cara daftar", "registrasi", "daftar", "mendaftar", "buat akun"],
    answer:
      "Registrasi: buka menu *Registrasi* di navbar, isi data yang diminta, unggah dokumen pendukung, lalu kirim. Kamu akan menerima nomor tiket untuk pelacakan.",
  },
  {
    keywords: ["login", "masuk", "gagal login", "tidak bisa login", "akun terkunci"],
    answer:
      "Pastikan email/username & kata sandi benar. Jika masih gagal, coba *reset password* lewat tautan Lupa Kata Sandi. Bila akun terkunci, tunggu 15 menit atau hubungi admin.",
  },
  {
    keywords: ["lupa password", "reset password", "ubah password", "ganti sandi"],
    answer:
      "Klik *Lupa Kata Sandi* di halaman Login, masukkan email terdaftar, dan ikuti instruksi pada email untuk membuat kata sandi baru.",
  },
  {
    keywords: ["status", "cek status", "lacak", "progres", "tiket saya", "nomor registrasi"],
    answer:
      "Cek status permohonan di menu *Status Proses*. Masukkan nomor tiket/registrasi untuk melihat tahap, petugas, dan catatan verifikasi.",
  },
  {
    keywords: ["dokumen", "syarat", "persyaratan", "unggah", "upload", "berkas"],
    answer:
      "Dokumen umum: identitas pemohon, formulir layanan, dan berkas pendukung sesuai jenis layanan. Format PDF/JPG/PNG, maksimal 10MB per file.",
  },
  {
    keywords: ["format file", "ukuran file", "maksimal", "compress", "kompres"],
    answer:
      "Format yang didukung: PDF/JPG/PNG. Batas ukuran 10MB per file. Gunakan kompresor online untuk mengecilkan ukuran bila diperlukan.",
  },
  {
    keywords: ["berapa lama", "lama proses", "waktu", "sla", "durasi"],
    answer:
      "Rata-rata proses 1–3 hari kerja setelah berkas lengkap. Notifikasi akan dikirim bila ada koreksi.",
  },
  {
    keywords: ["notifikasi", "email", "tidak menerima email", "spam"],
    answer:
      "Notifikasi dikirim via email. Jika belum masuk, cek folder *Spam/Promotion*. Tambahkan domain kami ke *safe sender* agar tidak terfilter.",
  },
  {
    keywords: ["nomor tiket hilang", "lupa tiket", "kehilangan nomor"],
    answer:
      "Coba cari di email konfirmasi. Jika masih tidak ditemukan, hubungi admin dengan menyebutkan nama & tanggal registrasi.",
  },
  {
    keywords: ["edit data", "ubah data", "salah isi", "perbaiki formulir"],
    answer:
      "Selama status masih *Verifikasi*, kamu bisa mengajukan koreksi lewat menu *Status Proses* → *Ajukan Perubahan*. Jika sudah diproses, hubungi admin.",
  },
  {
    keywords: ["hapus pengajuan", "batalkan", "batal"],
    answer:
      "Pengajuan dapat dibatalkan selama belum memasuki tahap *Proses*. Buka *Status Proses* → *Batalkan*. Setelah diproses, hubungi admin.",
  },
  {
    keywords: ["jam layanan", "jam operasional", "operasional", "hari kerja"],
    answer:
      "Layanan sistem 24/7. Verifikasi petugas pada hari & jam kerja: Senin–Jumat 08.00–16.00 WIB (kecuali hari libur).",
  },
  {
    keywords: ["kontak", "bantuan", "helpdesk", "hubungi", "call center"],
    answer:
      "Bantuan: hubungi admin melalui email helpdesk@samyan.local atau ext. 1234 pada jam kerja.",
  },

  /* --- Cukup sering --- */
  {
    keywords: ["browser", "peramban", "didukung", "support"],
    answer:
      "Gunakan Chrome, Edge, atau Firefox versi terbaru. Aktifkan JavaScript & izinkan pop-up untuk unduh bukti.",
  },
  {
    keywords: ["mobile", "hp", "android", "ios", "responsive"],
    answer:
      "SAMYAN mendukung tampilan mobile. Untuk unggah berkas ukuran besar, disarankan melalui desktop agar stabil.",
  },
  {
    keywords: ["cetak", "unduh", "download", "bukti", "kuitansi"],
    answer:
      "Bukti registrasi & dokumen bisa diunduh dari *Status Proses*. Jika gagal, nonaktifkan pemblokir pop-up/iklan sementara.",
  },
  {
    keywords: ["hak akses", "role", "peran", "admin", "petugas", "pengguna"],
    answer:
      "Hak akses berbasis peran: Pengguna mengajukan & lacak berkas; Petugas memverifikasi; Admin kelola data & audit trail.",
  },
  {
    keywords: ["audit trail", "log", "riwayat"],
    answer:
      "Setiap aksi tercatat (waktu, pengguna, aktivitas). Admin dapat mengekspor audit trail sesuai kebutuhan pengawasan.",
  },
  {
    keywords: ["keamanan", "privasi", "data", "enkripsi", "gdpr"],
    answer:
      "Data disimpan terenkripsi, akses berdasarkan peran, dan koneksi menggunakan HTTPS. Hanya pihak berwenang yang dapat melihat berkas.",
  },
  {
    keywords: ["kebijakan privasi", "privacy policy"],
    answer:
      "Kebijakan privasi tersedia pada halaman *Kebijakan Privasi*. Ringkasnya: kami mengelola data hanya untuk keperluan layanan.",
  },
  {
    keywords: ["biaya", "gratis", "tarif", "pungutan"],
    answer:
      "Layanan melalui SAMYAN **tidak dipungut biaya**. Waspada pihak yang meminta pembayaran di luar ketentuan.",
  },

  /* --- Jarang tapi perlu --- */
  {
    keywords: ["maintenance", "pemeliharaan", "gangguan", "downtime"],
    answer:
      "Jika ada pemeliharaan terjadwal/insiden, pemberitahuan akan tampil di banner sistem. Coba lagi beberapa saat.",
  },
  {
    keywords: ["captcha", "kode verifikasi", "captcha tidak muncul"],
    answer:
      "Pastikan koneksi stabil & nonaktifkan ekstensi pemblokir. Muat ulang halaman bila captcha tidak muncul.",
  },
  {
    keywords: ["error 500", "error 404", "kesalahan server", "gagal memuat"],
    answer:
      "Maaf terjadi gangguan. Hapus cache/cookies lalu coba kembali. Jika berulang, kirim tangkapan layar ke admin.",
  },
  {
    keywords: ["ganti email", "ubah email", "email salah"],
    answer:
      "Perubahan email dapat diajukan lewat *Profil* → *Ubah Email*. Verifikasi melalui tautan yang dikirim ke email baru.",
  },
  {
    keywords: ["integrasi", "sso", "single sign on"],
    answer:
      "SSO didukung untuk akun internal yang diotorisasi. Hubungi admin untuk mengaktifkan akses SSO.",
  },
  {
    keywords: ["nik", "npwp", "validasi", "format salah"],
    answer:
      "Pastikan NIK/NPWP diisi 16/15 digit sesuai format. Sistem menolak jika format tidak valid.",
  },
  {
    keywords: ["multi layanan", "ajukan lebih dari satu", "beberapa layanan"],
    answer:
      "Kamu dapat mengajukan beberapa layanan secara paralel. Gunakan nomor tiket berbeda untuk tiap pengajuan.",
  },
  {
    keywords: ["alamat kantor", "lokasi", "datang langsung", "kantor"],
    answer:
      "Silakan kunjungi kantor kami di Jl. Jend. Sudirman No.285, Simpang Empat, Kec. Pekanbaru Kota, Kota Pekanbaru, Riau 28121.",
  },
];

/** Pencarian jawaban sederhana berbasis keyword.includes() dengan normalisasi */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // hilangkan tanda baca
    .replace(/\s+/g, " ")
    .trim();
}

function findAnswer(text) {
  const q = normalize(text);
  const hit = FAQ_ANSWERS.find(item =>
    item.keywords.some(k => q.includes(normalize(k)))
  );

  if (hit?.answer) return hit.answer;

  // ===== Fallback bila tidak ada jawaban yang cocok =====
  return `Maaf, aku belum menemukan jawaban untuk pertanyaanmu. 
Silakan hubungi petugas kami melalui WhatsApp: ${SUPPORT_WHATSAPP_URL} 
atau datang ke kantor kami di Jl. Jend. Sudirman No.285, Simpang Empat, Kec. Pekanbaru Kota, Kota Pekanbaru, Riau 28121.`;
}

/** ====== Komponen ChatbotSPA (tetap seperti punyamu, hanya pakai findAnswer baru) ====== */
export default function ChatbotSPA() {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState([
    { sender: "bot", text: "Halo! Aku asisten SAMYAN. Mau tanya apa?" },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = () => {
    const text = input.trim();
    if (!text) return;

    setMessages(prev => [...prev, { sender: "user", text }]);
    setInput("");

    setTimeout(() => {
      const reply = findAnswer(text);
      setMessages(prev => [...prev, { sender: "bot", text: reply }]);
    }, 350);
  };

  return (
    <div className={`chatbot ${open ? "" : "collapsed"}`}>
      <div className="chatbot-header">
        <span>Chatbot SAMYAN</span>
        <button className="chatbot-toggle" onClick={() => setOpen(o => !o)}>
          {open ? "—" : "Chat"}
        </button>
      </div>

      {open && (
        <>
          <div className="chatbot-messages">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.sender}`}>
                {m.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="chatbot-input">
            <input
              type="text"
              placeholder="Tulis pertanyaan…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMsg()}
            />
            <button onClick={sendMsg}>Kirim</button>
          </div>
        </>
      )}
    </div>
  );
}
