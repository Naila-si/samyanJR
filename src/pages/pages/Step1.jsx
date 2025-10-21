import React, { useRef, useState } from "react";

/**
 * Step 1: Input Data — Kawaii + Formal
 * - Nama Petugas (dikte), Nama Korban (dikte), Tanggal Kecelakaan
 * - Tombol dikte beranimasi saat aktif
 */
export default function Step1({ data, setData, next, playBeep }) {
  const [error, setError] = useState("");
  const [micField, setMicField] = useState(null); // "petugas" | "korban" | null
  const recogRef = useRef(null);

  React.useEffect(() => {
    if (!data.createdAt) {
      setData(prev => ({
        ...prev,
        createdAt: new Date().toISOString(),
        waktu: new Date().toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
    }
  }, []);
  
  const canNext =
    data.petugas.trim() !== "" &&
    data.korban.trim() !== "" &&
    data.tanggalKecelakaan.trim() !== "";

  const stopDictation = () => {
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch {}
      recogRef.current = null;
    }
    setMicField(null);
  };

  const startDictation = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser kamu belum mendukung Speech Recognition.");
      return;
    }
    // Toggle: jika sedang aktif untuk field yang sama -> stop
    if (micField === field) {
      stopDictation();
      return;
    }
    // Pastikan yang lama dimatikan
    stopDictation();

    const r = new SR();
    r.lang = "id-ID";
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      setData((d) => ({
        ...d,
        [field]: (d[field] || "") + (d[field] ? " " : "") + txt,
      }));
    };
    r.onstart = () => setMicField(field);
    r.onerror = () => setMicField(null);
    r.onend = () => {
      recogRef.current = null;
      setMicField(null);
    };

    recogRef.current = r;
    r.start();
  };

  const handleNext = () => {
    if (!canNext) {
      setError("Lengkapi semua kolom di atas untuk melanjutkan.");
      return;
    }
    setError("");
    playBeep();
    next();
  };

  return (
    <div className="container">
      <h2 className="section-title">
        Masukkan Data <span className="title-deco" aria-hidden="true">✿</span>
      </h2>

      <div className="row">
        {/* Nama Petugas */}
        <div className="group">
          <label className="label">
            NPP / Nama Petugas <span className="req">• Dikte</span>
          </label>

          <div className="input-line">
            <input
              className="input"
              placeholder="Isi nama petugas"
              value={data.petugas}
              onChange={(e) => setData({ ...data, petugas: e.target.value })}
            />
            <button
              type="button"
              className={`mic ${micField === "petugas" ? "on" : ""}`}
              onClick={() => startDictation("petugas")}
              aria-label="Dikte nama petugas"
              title="Dikte nama petugas"
            >
              🎤
            </button>
          </div>

          <p className="helper">
            Tekan tombol 🎤 untuk input suara. (Jika tidak didukung browser, gunakan ketikan biasa.)
          </p>
        </div>

        {/* Nama Korban */}
        <div className="group">
          <label className="label">
            Nama Korban <span className="req">• Dikte</span>
            {/* Ikon info */}
              <span
                className="info-icon cursor-pointer text-blue-500"
                title={`Tuliskan nama korban dengan benar tanpa menggunakan gelar apa pun (contoh: cukup "Budi Santoso", bukan "Bapak Budi" atau "Dr. Budi").`}
              >
                ℹ️
              </span>
          </label>

          <div className="input-line">
            <input
              className="input"
              placeholder="Isi nama korban"
              value={data.korban}
              onChange={(e) => setData({ ...data, korban: e.target.value })}
            />
            <button
              type="button"
              className={`mic ${micField === "korban" ? "on" : ""}`}
              onClick={() => startDictation("korban")}
              aria-label="Dikte nama korban"
              title="Dikte nama korban"
            >
              🎤
            </button>
          </div>

          <p className="helper">Gunakan tombol 🎤 untuk input suara.</p>
        </div>
      </div>

      {/* Tanggal */}
      <div className="group">
        <label className="label">Tanggal Kecelakaan</label>
        <div className="date-line">
          <input
            type="date"
            className="input"
            value={data.tanggalKecelakaan}
            onChange={(e) => setData({ ...data, tanggalKecelakaan: e.target.value })}
          />
          <span className="date-hint">hh/bb/tttt</span>
        </div>
      </div>

      {error && (
        <div className="error-card">
          {error}
        </div>
      )}

      <div className="footer">
        <button className="btn rose" onClick={handleNext} disabled={!canNext}>
          Selanjutnya
        </button>
      </div>

      <style>{stepCss}</style>
    </div>
  );
}

const stepCss = `
/* ===== Kawaii styles khusus Step 1 ===== */
.req{ color:#ff6f91; font-weight:700; }
.title-deco{ margin-left:6px; color:#ff8fb1 }

.group{ margin-bottom:18px }
.input-line{
  display:grid; grid-template-columns:1fr 48px; gap:10px; align-items:center;
}
.date-line{
  display:grid; grid-template-columns:1fr 110px; gap:12px; align-items:center;
}

/* Mic button: bulat, glow saat aktif */
.mic{
  height:48px; width:48px; display:grid; place-items:center; cursor:pointer;
  border-radius:14px; border:2px solid var(--ring, #FFC9D5);
  background:linear-gradient(#fff,#fff);
  transition:.15s; font-size:20px;
  box-shadow:0 3px 10px rgba(0,0,0,.06);
}
.mic:hover{ transform:translateY(-1px) }
.mic.on{
  border-color: var(--ring-2, #FF9FB9);
  background: radial-gradient(120% 120% at 30% 20%, #fff 0%, #FFDDE6 85%);
  box-shadow: 0 0 0 4px #FFE4EC, 0 6px 18px rgba(255,150,170,.35);
  animation: micPulse 1.1s ease-in-out infinite;
}
@keyframes micPulse{
  0%,100%{ transform:scale(1) }
  50%{ transform:scale(1.04) }
}

/* Input & helper tweak */
.input{ font-size:15px }
.helper{ margin:6px 2px 0; color:var(--muted,#7A6B73); font-size:12px }

/* Error card kawaii */
.error-card{
  margin-top:16px;
  padding:12px 14px;
  border:1.5px dashed var(--ring-2, #FF9FB9);
  background:#fff6f9;
  border-radius:14px;
  color:#b32856;
  box-shadow: inset 0 0 0 2px #fff;
}

/* Footer */
.footer{ display:flex; justify-content:flex-end; margin-top:20px }
.btn[disabled]{ opacity:.6; cursor:not-allowed }
`;
