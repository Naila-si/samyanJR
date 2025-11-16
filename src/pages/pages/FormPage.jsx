import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import Step1 from "./Step1";
import Step2 from "./Step2";
import Step3 from "./Step3";
import Step4 from "./Step4";
import Step5 from "./Step5";

/** 1) Definisikan ikon & konfeti per step di satu tempat (dipakai Header & efek) */
const STEPS = [
  { label: "Input Data", sticker: "🌸", confetti: ["🌸", "💮", "🌼"] },
  { label: "Pilih Dokumen", sticker: "📁", confetti: ["📁", "🗂️", "📄"] },
  { label: "Isi & Upload", sticker: "📝", confetti: ["📝", "📷", "⬆️"] },
  { label: "Validasi", sticker: "🛡️", confetti: ["🛡️", "✅", "🔍"] },
  { label: "Selesai", sticker: "🎀", confetti: ["🎀", "🎉", "💖"] },
];

function StepAudio({ step, enabled = true }) {
  if (!enabled) return null;
  const src =
    step === 1 ? "/voices/Step1.mp3" :
      step === 2 ? "/voices/Step2.mp3" :
        step === 3 ? "/voices/Step3.mp3" :
          step === 4 ? "/voices/Step4.mp3" :
            step === 5 ? "/voices/Step5.mp3" :
              null;
  if (!src) return null;
  return (
    <audio key={step} autoPlay playsInline>
      <source src={src} type="audio/mpeg" />
    </audio>
  );
}

/** Wizard 5 langkah — Kawaii + Dinamis + Formal */
export default function FormPage() {
  const [step, setStep] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const fxRef = useRef(null);

  // ===== Global form state =====
  const [data, setData] = useState({
    // === STEP 1 ===
    petugas: "",
    korban: "",
    tanggalKecelakaan: "",

    // === STEP 2 ===
    template: "", // untuk pilih antara SURVEY_TEMPLATE / KUNJUNGAN_TEMPLATE
    sifatCidera: "",
    jenisSurvei: "",
    jenisSurveiLainnya: "",

    // === STEP 3 (HasilSurvey & HasilKunjungan) ===
    // Hasil Survey
    noPL: "",
    hariTanggal: "",
    petugasSurvei: "",
    namaKorban: "",
    noBerkas: "",
    alamatKorban: "",
    tempatKecelakaan: "",
    hubunganSesuai: "",
    uraianSurvei: "",
    kesimpulanSurvei: "",

    // Hasil Kunjungan
    petugasJabatan: "",
    wilayah: "",
    lokasiKecelakaan: "",
    rumahSakit: "",
    tglKecelakaan: "",
    tglMasukRS: "",
    tglJamNotifikasi: "",
    tglJamKunjungan: "",
    uraianKunjungan: "",
    rekomendasi: "",

    // Mengetahui (shared)
    pejabatMengetahuiName: "Andi Raharja, S.A.B",
    pejabatMengetahuiJabatan: "Kepala Bagian Operasional",
    pejabatMengetahuiTtd: "",

    // Lampiran
    fotoSurveyList: [],
    laporanRSList: [],

    // === STEP 4 ===
    mlResult: { foto: null, laporan: null, form: null },

    // === STEP 5 ===
    rating: 0,
    feedback: "",
  });

  const fotoCount = data.fotoSurveyList?.length || 0;
  const rsCount = data.laporanRSList?.length || 0;

  // ===== Notifikasi suara (pakai <audio id="spaNotifyAudio"> yang sudah ada) =====
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const el =
        document.getElementById("spaNotifyAudio") ||
        document.querySelector('[data-role="spa-notify-audio"]');
      if (el?.play) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } catch {}
  }, [soundEnabled]);

  // ===== Confetti kawaii: SEKARANG menerima daftar emoji (beda tiap step) =====
  const sparkle = useCallback((emojis = ["✨"], count = 10) => {
    const layer = fxRef.current;
    if (!layer) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      s.className = "fx-emoji";
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const x = 12 + Math.random() * 76; // %
      const y = 3 + Math.random() * 5; // vh
      s.style.left = `${x}%`;
      s.style.top = `${y}vh`;
      s.style.setProperty("--rise", `${22 + Math.random() * 24}vh`);
      s.style.setProperty("--spin", `${-30 + Math.random() * 60}deg`);
      s.style.setProperty("--scale", 0.85 + Math.random() * 0.7);
      s.style.setProperty("--time", `${1.2 + Math.random() * 0.7}s`);
      layer.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const existing = JSON.parse(localStorage.getItem("formDataList") || "[]");
    const newData = {
      ...data,
      attachSurvey: {
        fotoSurvey: data.fotoSurveyList || [],
        laporanRS: data.laporanRSList || [],
        hasilFormFile: data.mlResult?.form ? [data.mlResult.form] : [],
      },
      waktu: new Date().toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "diproses",
      fotoList: data.fotoList || [], 
      rsList: data.rsList || [],    
      totalFiles: (data.fotoList?.length || 0) + (data.rsList?.length || 0),
      counts: {
        singles: data.rsList?.length || 0,
        fotoSurvey: data.fotoList?.length || 0,
        fotoKejadian: 0,
      },
  };
    const updated = [...existing, newData];
    localStorage.setItem("formDataList", JSON.stringify(updated));
    setData({
      petugas: "",
      korban: "",
      tanggalKecelakaan: "",
      template: "",
      wilayah: "",
      lokasiKecelakaan: "",
      rumahSakit: "",
      tglMasukRS: "",
      tglKecelakaan: "",
      tglJamNotifikasi: "",
      fotoSurvey: null,
      rating: null,
      feedback: "",
    });

    setStep(1);

    sparkle(["🎉", "💖", "🌈"], 25);
    playBeep();
    toast.success("Data berhasil disimpan!");
  }, [data, playBeep, sparkle]);

  // ===== Validasi per step =====
const validateStep = useCallback(() => {
  switch (step) {
    case 1:
      if (!data.petugas?.trim() || !data.korban?.trim() || !data.tanggalKecelakaan) {
        toast.error("Mohon isi semua data pada langkah 1 (Petugas, Korban, dan Tanggal Kecelakaan).");
        return false;
      }
      return true;

    case 2:
      const templateName2 = data.template?.toLowerCase();

      if (!data.template) {
        toast.error("Pilih template dokumen terlebih dahulu pada langkah 2.");
        return false;
      }

      if (templateName2.includes("survey")) {
        if (!data.sifatCidera?.trim()) {
          toast.error("Pilih sifat cidera terlebih dahulu sebelum lanjut.");
          return false;
        }
      }

      return true;

    case 3:
      console.log("🔍 Step 3 Validation, template:", data.template);

      const templateName = data.template?.toLowerCase();

      if (templateName.includes("survey")) {
        const requiredSurveyFields = [
          "noPL",
          "alamatKorban",
          "uraianSurvei",
          "kesimpulanSurvei",
          "noBerkas",
          "tempatKecelakaan",
          "hubunganSesuai",
        ];
        const missing = requiredSurveyFields.filter((key) => !data[key]?.trim());
        if (missing.length > 0) {
          console.warn("❌ Field kosong di SURVEY:", missing);
          toast.error("Lengkapi semua kolom Hasil Survey terlebih dahulu.");
          return false;
        }
      } else if (templateName.includes("kunjungan")) {
        const requiredKunjunganFields = [
          "rumahSakit",
          "tglJamKunjungan",
          "uraianKunjungan",
          "rekomendasi",
          "wilayah",
          "lokasiKecelakaan",
          "tglKecelakaan",
          "tglMasukRS",
          // "tglJamNotifikasi",
        ];
        const missing = requiredKunjunganFields.filter((key) => !data[key]?.trim());
        if (missing.length > 0) {
          console.warn("❌ Field kosong di KUNJUNGAN:", missing);
          toast.error("Lengkapi semua kolom Hasil Kunjungan terlebih dahulu.");
          return false;
        }
      }

      return true;

    case 4:
      if (!data.mlResult || Object.keys(data.mlResult).length === 0) {
        toast.error("Pastikan hasil validasi (ML Result) sudah ada sebelum lanjut.");
        return false;
      }
      return true;

    default:
      return true;
  }
}, [step, data]);

  // ===== Nav helpers =====
  const next = useCallback(() => {
    if (!validateStep()) return;
    setStep((s) => {
      const ns = Math.min(5, s + 1);
      playBeep();
      sparkle(STEPS[ns - 1].confetti, 12); // konfeti sesuai step baru
      return ns;
    });
  }, [validateStep, playBeep, sparkle]);

  const back = useCallback(() => {
    setStep((s) => {
      const ns = Math.max(1, s - 1);
      playBeep();
      sparkle(STEPS[ns - 1].confetti, 10);
      return ns;
    });
  }, [playBeep, sparkle]);

  const goTo = useCallback(
    (n) => {
      if (n > step + 1) {
        toast.error("Harap selesaikan langkah sebelumnya terlebih dahulu.");
        return;
      }
      if (n > step && !validateStep()) return;
      setStep(() => {
        const ns = Math.min(5, Math.max(1, n));
        playBeep();
        sparkle(STEPS[ns - 1].confetti, 10);
        return ns;
      });
    },
    [step, validateStep, playBeep, sparkle]
  );

  const stepProps = useMemo(
    () => ({
      data,
      setData,
      next,
      back,
      goTo,
      setStep,
      soundEnabled,
      toggleSound: () => setSoundEnabled((v) => !v),
      playBeep,
    }),
    [data, next, back, goTo, soundEnabled, playBeep]
  );

  useEffect(() => {
    if (data.tanggalKecelakaan) {
      setData((prev) => ({
        ...prev,
        // Hanya update kalau belum diisi manual di Step 3
        tglKecelakaan: prev.tglKecelakaan || data.tanggalKecelakaan,
        hariTanggal: prev.hariTanggal || data.tanggalKecelakaan,
      }));
    }
  }, [data.tanggalKecelakaan]);

  return (
    <div className="spa-wrapper kawaii">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#fff",
            color: "#2B2326",
            borderRadius: "14px",
            border: "2px solid #FFD1DA",
            fontWeight: 600,
          },
          success: { iconTheme: { primary: "#C7546C", secondary: "#fff" } },
        }}
      />
      {/* layer untuk konfeti emoji */}
      <div ref={fxRef} className="fx-layer" aria-hidden="true" />

      <Header
        step={step}
        goTo={goTo}
        soundEnabled={soundEnabled}
        toggleSound={() => setSoundEnabled((v) => !v)}
      />

      <div className="stage">
        {step === 1 && <Step1 {...stepProps} />}
        {step === 2 && <Step2 {...stepProps} />}
        {step === 3 && <Step3 {...stepProps} />}
        {step === 4 && <Step4 {...stepProps} />}
        {step === 5 && <Step5 {...stepProps} handleSubmit={handleSubmit} />}

        <StepAudio step={step} enabled={soundEnabled} />
      </div>

      <style>{css}</style>
    </div>
  );
}

/* ---------------- Header & Stepper ---------------- */

function Header({ step, goTo, soundEnabled, toggleSound }) {
  const progress = ((step - 1) / 4) * 100;
  return (
    <header className="page-header">
      <h1 className="title">Sistem Administrasi Pelayanan (SAMYAN)</h1>

      <div className="stepper" role="tablist" aria-label="Langkah Form">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <StepBadge
              key={s.label}
              n={n}
              label={s.label}
              sticker={s.sticker}
              active={active}
              done={done}
              onClick={() => goTo(n)}
            />
          );
        })}
        <button
          className="sound"
          onClick={toggleSound}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? "🔔 Suara ON" : "🔕 Suara OFF"}
        </button>
      </div>

      <div className="progress" aria-hidden="true">
        <div className="bar" style={{ width: `${progress}%` }}>
          <div className="shine" />
        </div>
      </div>
    </header>
  );
}

function StepBadge({ n, label, sticker, active, done, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`badge ${active ? "active" : ""} ${done ? "done" : ""}`}
      aria-current={active ? "step" : undefined}
      role="tab"
      title={label}
    >
      {/* stiker per step (muncul saat aktif) */}
      <span className="sticker" aria-hidden="true">
        {sticker}
      </span>

      {/* DOT bulat + ring lembut + state aktif/done */}
      <span className="dot" aria-hidden="true">
        {done ? "✓" : n}
      </span>
      <span className="text">{label}</span>
    </button>
  );
}

/* ---------------- CSS (ringkas; tetap kawai-formal) ---------------- */

const css = `
:root{
  --bg-a:#FFF5F6; --bg-b:#F7C7C4;
  --card:#FFFFFF; --ink:#2B2326; --muted:#7A6B73;
  --accent:#C7546C; --accent-soft:#F3B8C3; --ring:#FFC9D5; --ring-2:#FF9FB9;
  --container:1180px; --radius:22px; --shadow:0 18px 44px rgba(199,84,108,.14);
}

*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial;background:linear-gradient(90deg,var(--bg-a),var(--bg-b));overflow-x:hidden}

.fx-layer{position:fixed;inset:0;pointer-events:none;z-index:30}
.fx-emoji{position:absolute;font-size:clamp(14px,2.1vw,20px);animation:pop 1.5s ease-out forwards;transform:translate(-50%,-50%) scale(var(--scale,1));filter:drop-shadow(0 2px 2px rgba(0,0,0,.08))}
@keyframes pop{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{opacity:0;transform:translate(-50%,calc(-1*var(--rise,28vh))) rotate(var(--spin,30deg))}}

.spa-wrapper.kawaii{min-height:100vh;padding:18px 16px 40px}
.page-header{max-width:var(--container);margin:0 auto 8px;padding:6px 8px 0}
.page-header::after{content:"";display:block;height:4px;width:min(92%,760px);margin:12px auto 0;border-radius:999px;background:linear-gradient(90deg,#ffdbe3,#ffeef1,#ffdbe3);opacity:.9}
.title{margin:6px 0 6px;text-align:center;color:var(--accent);font-weight:900;font-size:clamp(26px,4vw,36px);letter-spacing:.3px;text-shadow:0 1px 0 rgba(255,255,255,.75)}

.stepper{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;padding:6px 8px}
.badge{position:relative;display:inline-flex;align-items:center;gap:12px;height:48px;padding:0 18px;border-radius:999px;background:linear-gradient(#fff,#fff) padding-box;border:2px solid var(--accent-soft);color:#483941;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.06);transition:transform .15s,box-shadow .15s,border-color .2s,background .2s}
.badge:hover{transform:translateY(-2px);box-shadow:0 12px 24px rgba(0,0,0,.08)}
.badge.active{border-color:var(--ring-2);background:linear-gradient(#fff,#fff) padding-box,linear-gradient(90deg,#FFB6C6,#FFD6DD) border-box;animation:badgePop .18s ease}
@keyframes badgePop{from{transform:scale(.98)}to{transform:scale(1)}}
.badge.done{opacity:.94}

.sticker{position:absolute;top:-14px;left:10px;background:#fff;border:2px solid var(--ring);border-radius:12px;padding:2px 8px;font-size:15px;box-shadow:0 6px 16px rgba(0,0,0,.08);transform:translateY(-6px) rotate(-6deg) scale(.9);opacity:0;transition:.18s}
.badge.active .sticker{opacity:1;transform:translateY(-8px) rotate(-8deg) scale(1)}

.dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:radial-gradient(circle at 30% 30%,#fff 0%,#FFE7ED 72%);border:2px solid #FFC4D1;color:#9C3147;font-weight:900;box-shadow:inset 0 1px 0 #fff,0 1px 0 rgba(0,0,0,.03);transition:.15s}
.badge.active .dot{background:radial-gradient(circle at 30% 30%,#fff 0%,#FFD1DA 72%);border-color:#FF9FB9;transform:scale(1.04)}
.badge.done .dot{background:radial-gradient(circle at 30% 30%,#fff 0%,#EAFBF0 75%);border-color:#A6E5C3;color:#1F8F4E}

.text{white-space:nowrap}
.sound{margin-left:auto;background:#FFF4F6;border:2px solid var(--ring);border-radius:16px;padding:10px 14px;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.06)}
.sound:hover{transform:translateY(-2px)}

.progress{height:8px;border-radius:999px;width:min(var(--container),96vw);margin:10px auto 18px;background:rgba(255,255,255,.82);outline:2px solid rgba(255,255,255,.85);outline-offset:-2px;box-shadow:inset 0 2px 8px rgba(0,0,0,.05)}
.progress .bar{position:relative;height:100%;border-radius:inherit;background:linear-gradient(90deg,#FFB3C2,#FFC6CF,#FFD4DB);transition:width .35s ease-in-out;width:0%}
.progress .shine{position:absolute;inset:0;border-radius:inherit;mix-blend-mode:overlay;background:linear-gradient(110deg,transparent 0%,rgba(255,255,255,.6) 30%,transparent 60%);animation:shine 1.8s linear infinite}
@keyframes shine{from{transform:translateX(-30%)}to{transform:translateX(100%)}}

.stage{max-width:var(--container);margin:0 auto;padding:0 4px}
.container{background:var(--card);border-radius:var(--radius);border:1px solid #fff;box-shadow:var(--shadow);padding:26px;margin-bottom:28px;transition:transform .12s,box-shadow .12s}
.container:hover{transform:translateY(-1px);box-shadow:0 22px 50px rgba(199,84,108,.16)}

.input,.select,.textarea{width:100%;padding:14px 16px;border-radius:14px;border:2px solid var(--ring);background:#fff;outline:none;font-size:15px;transition:box-shadow .15s,border-color .15s,transform .05s}
.input:focus,.select:focus,.textarea:focus{border-color:#FF86A3;box-shadow:0 0 0 4px #FFE1EA}
.label{font-weight:900;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.section-title{font-size:20px;font-weight:900;margin:4px 0 16px;color:var(--accent)}
.helper{font-size:12px;color:var(--muted);margin-top:6px}

.row{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
.footer{display:flex;justify-content:flex-end;gap:12px;margin-top:22px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:#FFD6DE;border:2px solid #FFC3CE;color:#3B0A1A;border-radius:14px;padding:12px 18px;cursor:pointer;font-weight:800;letter-spacing:.2px;transition:.15s}
.btn:hover{transform:translateY(-1px)}
.btn.ghost{background:#fff}
.btn.rose{background:#FFC7D2;border-color:#FF9FB1}

@media (max-width:900px){
  .row,.row-3{grid-template-columns:1fr}
  .sound{width:100%}
  .container{padding:20px}
}
`;