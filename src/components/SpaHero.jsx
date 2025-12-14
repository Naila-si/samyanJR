import React, { useEffect, useRef, useState } from "react";
import "./SpaHero.css";
import { supabase } from "../lib/supabaseClient";

/* =========================================================
   KONFIG KONTAK
   ========================================================= */
const SUPPORT_WHATSAPP_URL = "https://wa.me/62XXXXXXXXXXX"; // GANTI ke nomor WA resmi kalian

/* =========================================================
   SINONIM / ALIAS (kanonisasi frasa)
   - Semua frasa di user input & keywords akan dipetakan ke bentuk ini
   ========================================================= */
const SYNONYMS = {
  registrasi: [
    "registrasi",
    "pendaftaran",
    "daftar",
    "mendaftar",
    "buat akun",
    "sign up",
    "signup",
  ],
  form: [
    "form",
    "formulir",
    "halaman form",
    "pengisian formulir",
    "isi form",
    "isian",
  ],
  status: [
    "status",
    "cek status",
    "lacak",
    "tracking",
    "progres",
    "progress",
    "tiket saya",
    "nomor registrasi",
  ],
  dokumen: ["dokumen", "berkas", "file", "lampiran", "unggah", "upload"],
  login: ["login", "masuk", "sign in", "signin", "log in"],
  password: [
    "password",
    "kata sandi",
    "sandi",
    "passwd",
    "pw",
    "lupa password",
    "reset password",
    "ganti sandi",
  ],
  bantuan: ["bantuan", "helpdesk", "kontak", "hubungi", "call center"],
  biaya: ["biaya", "tarif", "bayar", "pembayaran", "pungutan", "gratis"],
  keamanan: [
    "keamanan",
    "privasi",
    "privacy",
    "data",
    "enkripsi",
    "https",
    "gdpr",
  ],
  pembatalan: ["batalkan", "batal", "hapus pengajuan", "cancel"],
  jam: [
    "jam layanan",
    "jam operasional",
    "operasional",
    "hari kerja",
    "jam kerja",
  ],
  notifikasi: [
    "notifikasi",
    "email",
    "e-mail",
    "spam",
    "promotions",
    "promotion",
  ],
  maintenance: ["maintenance", "pemeliharaan", "gangguan", "downtime"],
  captcha: ["captcha", "kode verifikasi"],
  alamat: ["alamat kantor", "lokasi", "datang langsung", "kantor"],
  sapaan: ["halo", "hai", "hello", "pagi", "siang", "sore", "assalamualaikum"],
};

/* Urutan replace: frasa terpanjang dulu agar tidak tumpang tindih */
const REPLACE_ORDER = Object.entries(SYNONYMS).flatMap(([canon, arr]) =>
  arr
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((phrase) => ({ canon, phrase }))
);

/* Normalisasi dan kanonisasi teks */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalize(str) {
  let s = " " + normalize(str) + " ";
  for (const { canon, phrase } of REPLACE_ORDER) {
    const p = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${p}\\b`, "g");
    s = s.replace(re, ` ${canon} `);
  }
  return s.trim().replace(/\s+/g, " ");
}

/* =========================================================
   FAQ (dari yang sering ditanya → jarang)
   ========================================================= */
const FAQ_ANSWERS = [
  // Sapaan
  {
    keywords: [
      "sapaan",
      "halo",
      "hai",
      "hello",
      "pagi",
      "siang",
      "sore",
      "assalamualaikum",
    ],
    answer:
      "Halo! Ada yang bisa saya bantu seputar SAMYAN? Coba tanya tentang registrasi, form, dokumen, status, atau jam layanan.",
  },

  // Inti
  {
    keywords: [
      "apa itu samyan",
      "samyan itu",
      "definisi",
      "pengertian",
      "fungsi samyan",
    ],
    answer:
      "SAMYAN (Sistem Administrasi Pelayanan) adalah platform untuk mengelola data & dokumen layanan agar proses lebih cepat, terdokumentasi, dan mengurangi penggunaan kertas.",
  },
  {
    keywords: ["registrasi", "cara daftar", "buat akun", "mendaftar"],
    answer:
      "Registrasi: buka menu *Registrasi* di navbar, isi data yang diminta, unggah dokumen pendukung, lalu kirim. Kamu akan menerima nomor tiket untuk pelacakan.",
  },

  // Form
  {
    keywords: [
      "form",
      "halaman form",
      "formulir",
      "pengisian formulir",
      "isi form",
    ],
    answer:
      "Halaman *Form* berisi isian data sesuai jenis layanan. Isi data dengan benar, unggah dokumen (PDF/JPG/PNG max 10MB), lalu klik *Kirim*. Setelah terkirim, kamu akan mendapat nomor tiket.",
  },

  // Akses akun
  {
    keywords: ["login", "gagal login", "tidak bisa login", "akun terkunci"],
    answer:
      "Pastikan email/username & kata sandi benar. Jika masih gagal, gunakan *Lupa Kata Sandi*. Bila akun terkunci, tunggu 15 menit atau hubungi admin.",
  },
  {
    keywords: ["password", "lupa password", "reset password", "ganti sandi"],
    answer:
      "Klik *Lupa Kata Sandi* di halaman Login, masukkan email terdaftar, lalu ikuti instruksi pada email untuk membuat kata sandi baru.",
  },

  // Pelacakan & dokumen
  {
    keywords: [
      "status",
      "cek status",
      "lacak",
      "tracking",
      "progres",
      "nomor registrasi",
      "tiket saya",
    ],
    answer:
      "Cek status di menu *Status Proses*. Masukkan nomor tiket/registrasi untuk melihat tahap, petugas, dan catatan verifikasi.",
  },
  {
    keywords: ["dokumen", "berkas", "unggah", "upload", "file", "lampiran"],
    answer:
      "Dokumen umum: identitas pemohon, formulir layanan, dan berkas pendukung sesuai jenis layanan. Format PDF/JPG/PNG, maksimal 10MB per file.",
  },
  {
    keywords: ["format file", "ukuran file", "maksimal", "compress", "kompres"],
    answer:
      "Format didukung: PDF/JPG/PNG. Batas ukuran 10MB per file. Gunakan kompresor online jika diperlukan.",
  },

  // Proses & notifikasi
  {
    keywords: ["berapa lama", "lama proses", "waktu", "sla", "durasi"],
    answer:
      "Rata-rata proses 1–3 hari kerja setelah berkas lengkap. Notifikasi akan dikirim bila ada koreksi.",
  },
  {
    keywords: ["notifikasi", "email", "spam", "promotions", "promotion"],
    answer:
      "Notifikasi dikirim via email. Jika belum masuk, cek folder *Spam/Promotion* dan tambahkan domain kami ke *safe sender*.",
  },

  // Perubahan/batal
  {
    keywords: ["edit data", "ubah data", "salah isi", "perbaiki formulir"],
    answer:
      "Selama status masih *Verifikasi*, ajukan koreksi lewat *Status Proses* → *Ajukan Perubahan*. Jika sudah diproses, hubungi admin.",
  },
  {
    keywords: ["pembatalan", "batalkan", "hapus pengajuan", "batal"],
    answer:
      "Pengajuan bisa dibatalkan selama belum tahap *Proses*. Buka *Status Proses* → *Batalkan*. Jika sudah diproses, hubungi admin.",
  },

  // Navigasi
  {
    keywords: ["dashboard", "beranda", "home"],
    answer:
      "Menu *Dashboard* menampilkan ringkasan pengajuan, status terbaru, dan pintasan ke fitur utama.",
  },
  {
    keywords: ["status proses", "menu status", "tracking"],
    answer:
      "Pada *Status Proses* kamu dapat melacak posisi berkas, melihat petugas penanggung jawab, serta catatan verifikasi.",
  },
  {
    keywords: ["registrasi menu", "menu registrasi"],
    answer:
      "Buka *Registrasi* untuk membuat pengajuan baru. Pastikan data dan dokumen sudah lengkap sebelum mengirim.",
  },

  // Keamanan & biaya
  {
    keywords: [
      "keamanan",
      "privasi",
      "privacy",
      "data",
      "enkripsi",
      "gdpr",
      "https",
    ],
    answer:
      "Data disimpan terenkripsi, akses berdasarkan peran, dan koneksi menggunakan HTTPS. Semua aksi tercatat sebagai audit trail.",
  },
  {
    keywords: ["audit trail", "log", "riwayat"],
    answer:
      "Setiap aksi tercatat (waktu, pengguna, aktivitas). Admin dapat mengekspor audit trail bila diperlukan.",
  },
  {
    keywords: ["biaya", "tarif", "pungutan", "gratis", "bayar"],
    answer:
      "Layanan melalui SAMYAN **tidak dipungut biaya**. Waspada pihak yang meminta pembayaran di luar ketentuan.",
  },

  // Operasional & bantuan
  {
    keywords: ["jam", "jam layanan", "jam operasional", "hari kerja"],
    answer:
      "Layanan sistem 24/7. Verifikasi petugas: Senin–Jumat 08.00–16.00 WIB (kecuali hari libur).",
  },
  {
    keywords: ["bantuan", "helpdesk", "kontak", "hubungi", "call center"],
    answer:
      "Bantuan: hubungi admin melalui email helpdesk@samyan.local atau ext. 1234 pada jam kerja.",
  },

  // Jarang tapi penting
  {
    keywords: ["maintenance", "pemeliharaan", "gangguan", "downtime"],
    answer:
      "Jika ada pemeliharaan/insiden, pemberitahuan akan tampil di banner sistem. Coba lagi beberapa saat.",
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
      "Ubah email lewat *Profil* → *Ubah Email*. Verifikasi melalui tautan yang dikirim ke email baru.",
  },
  {
    keywords: ["integrasi", "sso", "single sign on"],
    answer:
      "SSO didukung untuk akun internal yang diotorisasi. Hubungi admin untuk mengaktifkan.",
  },
  {
    keywords: ["nik", "npwp", "validasi", "format salah"],
    answer:
      "Pastikan NIK/NPWP sesuai panjang digit (16/15). Sistem menolak jika format tidak valid.",
  },
  {
    keywords: ["multi layanan", "ajukan lebih dari satu", "beberapa layanan"],
    answer:
      "Bisa, ajukan beberapa layanan paralel. Setiap pengajuan memiliki nomor tiket berbeda.",
  },
  {
    keywords: [
      "alamat",
      "alamat kantor",
      "lokasi",
      "datang langsung",
      "kantor",
    ],
    answer:
      "Silakan datang ke kantor kami di Jl. Jend. Sudirman No.285, Simpang Empat, Kec. Pekanbaru Kota, Kota Pekanbaru, Riau 28121.",
  },
];

/* =========================================================
   Matcher: canonical + scoring sederhana
   ========================================================= */
function findAnswer(text) {
  const q = canonicalize(text);

  const scored = FAQ_ANSWERS.map((item) => {
    const score = item.keywords.reduce((s, kwRaw) => {
      const kw = canonicalize(kwRaw);
      if (!kw) return s;
      if (q.includes(kw)) return s + 2; // full phrase
      const first = kw.split(" ")[0];
      if (first && new RegExp(`\\b${first}\\b`, "i").test(q)) return s + 1; // partial
      return s;
    }, 0);
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best && best.score > 0) return best.item.answer;

  // Fallback resmi
  return `Maaf, aku belum menemukan jawaban untuk pertanyaanmu.
Silakan hubungi petugas kami melalui WhatsApp: ${SUPPORT_WHATSAPP_URL}
atau datang ke kantor kami di Jl. Jend. Sudirman No.285, Simpang Empat, Kec. Pekanbaru Kota, Kota Pekanbaru, Riau 28121.`;
}

/* =========================================================
   Komponen Chatbot (dipakai di dalam SpaHero)
   ========================================================= */
function ChatbotSPA() {
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

    setMessages((prev) => [...prev, { sender: "user", text }]);
    setInput("");

    setTimeout(() => {
      const reply = findAnswer(text);
      setMessages((prev) => [...prev, { sender: "bot", text: reply }]);
    }, 300);
  };

  return (
    <div className={`chatbot ${open ? "" : "collapsed"}`}>
      <div className="chatbot-header">
        <span>Chatbot SAMYAN</span>
        <button className="chatbot-toggle" onClick={() => setOpen((o) => !o)}>
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
            />
            <button onClick={sendMsg}>Kirim</button>
          </div>
        </>
      )}
    </div>
  );
}

// === Notif PKS ringan (di file SpaHero.jsx yang sama) ===
const LS_KEY = "datapks_rows";

function NotifPKS() {
  const [dueModal, setDueModal] = useState(false);
  const [groups, setGroups] = useState({ overdue: [], h14: [], h30: [] });
  const [loading, setLoading] = useState(true);

  const normDate = (dStr) => {
    if (!dStr) return null;
    const d = new Date(dStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };
  const daysLeft = (end) => {
    const t = today().getTime();
    const e = normDate(end)?.getTime() ?? 0;
    return Math.ceil((e - t) / (1000 * 60 * 60 * 24));
  };
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  const getEndDate = (r) => r.tglAkhir ?? r.tgl_akhir ?? r.tglakhir ?? null;

  const recomputeFromRows = (rows) => {
    const fixedRows = rows.map((r) => ({
      ...r,
      wilayah: r.wilayah === "DUMAI" ? "PWK. DUMAI" : r.wilayah,
    }));

    const withDays = fixedRows
      .map((r) => {
        const endDate = getEndDate(r);
        if (!endDate) return null; // ✅ buang yang gak punya tgl akhir
        return { ...r, _days: daysLeft(endDate) };
      })
      .filter(Boolean); // ✅ remove null

    withDays.sort((a, b) => a._days - b._days);

    const overdue = withDays.filter((r) => r._days <= 0);
    const h14 = withDays.filter((r) => r._days > 0 && r._days <= 14);
    const h30 = withDays.filter((r) => r._days > 14 && r._days <= 30);

    setGroups({ overdue, h14, h30 });
  };

  const fetchPKS = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("datapks")
      .select(`
        *,
        tglAkhir:tgl_akhir,
        namaRS:nama_rs
      `)
      .order("tgl_akhir", { ascending: true });

    if (!error && data) recomputeFromRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPKS();

    // refresh berkala (misal tiap 1 menit)
    const id = setInterval(fetchPKS, 60 * 1000);

    // realtime listener (auto update kalau tabel berubah)
    const channel = supabase
      .channel("pks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "datapks" }, // samain sama tabelmu
        () => fetchPKS()
      )
      .subscribe();

    return () => {
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, []);

  const totalAlerts =
    groups.overdue.length + groups.h14.length + groups.h30.length;

  return (
    <>
      <button
        onClick={() => setDueModal(true)}
        title="Peringatan PKS"
        style={{
          position: "fixed",
          left: 16,
          bottom: 16 + 58,
          zIndex: 9998,
          border: "2px solid #fecaca",
          background: "#fff1f2",
          color: "#7f1d1d",
          borderRadius: 999,
          padding: "10px 14px",
          fontWeight: 800,
          boxShadow: "0 10px 24px rgba(0,0,0,.12)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        🔔 Peringatan PKS
        {totalAlerts > 0 && (
          <span
            style={{
              background: "#dc2626",
              color: "#fff",
              borderRadius: 999,
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {totalAlerts}
          </span>
        )}
      </button>

      {dueModal && (
        <div
          onClick={() => setDueModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 9999,
            cursor: "pointer",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(880px, 96vw)",
              maxHeight: "84vh",
              overflow: "auto",
              background: "#fff",
              border: "2px solid #ff9aa2",
              borderRadius: 16,
              boxShadow: "0 28px 80px rgba(238,109,115,.35)",
            }}
          >
            <div style={{ padding: "16px 20px 8px" }}>
              <h3 style={{ margin: 0, color: "#b91c1c", fontWeight: 900 }}>
                🚨 Peringatan PKS
              </h3>
              <p style={{ margin: "6px 0 0", color: "#374151" }}>
                RS yang <b>jatuh tempo</b> atau berakhir ≤ <b>30 hari</b>.
              </p>
            </div>

            {loading && (
              <div style={{ padding: "12px 20px", color: "#6b7280" }}>
                Ngambil data dulu yaa...
              </div>
            )}

            {!loading && totalAlerts === 0 && (
              <div style={{ padding: "12px 20px", color: "#6b7280" }}>
                Aman dulu yaa ✨ belum ada PKS yang mendekati jatuh tempo.
              </div>
            )}

            {groups.overdue.length > 0 && (
              <Section title={`Lewat / H0 (${groups.overdue.length})`}>
                <List
                  rows={groups.overdue}
                  fmtDate={fmtDate}
                  label={(d) =>
                    d._days === 0
                      ? "Hari ini"
                      : `${Math.abs(d._days)} hari lewat`
                  }
                  badgeCls="red"
                />
              </Section>
            )}
            {groups.h14.length > 0 && (
              <Section title={`≤ 14 Hari (${groups.h14.length})`}>
                <List
                  rows={groups.h14}
                  fmtDate={fmtDate}
                  label={(d) => `${d._days} hari lagi`}
                  badgeCls="red"
                />
              </Section>
            )}
            {groups.h30.length > 0 && (
              <Section title={`≤ 30 Hari (${groups.h30.length})`}>
                <List
                  rows={groups.h30}
                  fmtDate={fmtDate}
                  label={(d) => `${d._days} hari lagi`}
                  badgeCls="amber"
                />
              </Section>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0 20px 16px",
              }}
            >
              <button
                onClick={() => setDueModal(false)}
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Sub-komponen kecil buat tabel ringkas di modal
function Section({ title, children }) {
  return (
    <div style={{ padding: "10px 20px" }}>
      <h4
        style={{
          margin: "10px 0 8px",
          color: "#b91c1c",
          fontWeight: 800,
          borderLeft: "4px solid #ff9aa2",
          paddingLeft: 8,
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function List({ rows, fmtDate, label, badgeCls }) {
  const badgeStyle = {
    base: {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      fontWeight: 800,
      fontSize: 12,
      border: "1px solid",
      background: "#fff",
      whiteSpace: "nowrap",
      lineHeight: 1,
      maxWidth: "100%",
    },
    red: { color: "#b91c1c", borderColor: "#fecaca", background: "#fff1f2" },
    amber: { color: "#b45309", borderColor: "#fcd34d", background: "#fff7ed" },
    green: { color: "#166534", borderColor: "#bbf7d0", background: "#ecfdf5" },
  };
  const style = { ...badgeStyle.base, ...(badgeStyle[badgeCls] || {}) };

  return (
    // 👇 wrapper baru biar bisa scroll horizontal kalau layar sempit
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table
        style={{
          width: "100%",
          minWidth: 720, // biar kolom gak kepres terlalu kecil
          borderCollapse: "separate",
          borderSpacing: 0,
          border: "1px solid #ffe1ea",
          borderRadius: 12,
          overflow: "hidden",
          tableLayout: "fixed", // stabilkan lebar kolom
        }}
      >
        <colgroup>
          <col style={{ width: 56 }} />
          <col style={{ width: 300 }} /> {/* Nama RS */}
          <col style={{ width: 120 }} /> {/* Wilayah */}
          <col style={{ width: 120 }} /> {/* Tgl Akhir */}
          <col style={{ width: 160 }} /> {/* Keterangan */}
        </colgroup>
        <thead>
          <tr>
            <th style={th}>No</th>
            <th style={th}>Nama RS</th>
            <th style={th}>Wilayah</th>
            <th style={th}>Tgl Akhir</th>
            <th style={th}>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={d.id || d.namaRS + i}>
              <td style={td}>{i + 1}</td>
              <td
                style={{ ...td, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {d.namaRS}
              </td>
              <td style={td}>{d.wilayah}</td>
              <td style={td}>{fmtDate(d.tglAkhir)}</td>
              <td style={td}>
                <span style={style}>{label(d)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  background: "#fff6f9",
  color: "#111",
  fontWeight: 800,
  fontSize: 14,
  padding: "10px 12px",
  borderBottom: "1px dashed #ffd1d6",
  textAlign: "left",
};
const td = {
  padding: "10px 12px",
  borderBottom: "1px dashed #ffe3ea",
};

/* =========================================================
   Komponen Halaman Hero (TETAP seperti tampilanmu)
   ========================================================= */
export default function SpaHero() {
  return (
    <section className="hero">
      {/* Audio otomatis diputar */}
      <audio autoPlay>
        <source
          src="/voices/1758589105185805609mgf9e9s5-voicemaker.in-speech.mp3"
          type="audio/mpeg"
        />
      </audio>

      <div className="hero-text">
        <h1>
          SISTEM ADMINISTRASI
          <br />
          PELAYANAN <br />
          (SAMYAN)
        </h1>
        <p className="subtext">
          Sistem Administrasi Pelayanan yang mempermudah pengelolaan data dan
          dokumen santunan, mengurangi ketergantungan pada proses manual untuk
          meningkatkan efisiensi dan efektivitas Sistem Pelayanan secara
          digitalisasi.
        </p>
        <button className="cta">
          Penyederhanaan Proses Adm untuk Pelayanan yang Lebih Baik
          <span className="cta-sub">
            Dengan berbagai fasilitas “advance digital platform”.
          </span>
        </button>
      </div>

      <div className="hero-images">
        <img src="/foto1.jpg" alt="Pegawai 1" />
        <img src="/foto4.jpg" alt="Pegawai 4" />
        <img src="/foto2.jpg" alt="Pegawai 2" />
        <img src="/foto3.jpg" alt="Pegawai 3" />
      </div>

      {/* Chatbot mengambang */}
      <ChatbotSPA />
      {/* 🔔 Notifikasi PKS mengambang */}
      <NotifPKS />
    </section>
  );
}
