import React, { useEffect } from "react";
import HasilSurvey from "./HasilSurvey.jsx";
import HasilKunjungan from "./HasilKunjungan.jsx";

const SURVEY_TEMPLATE = "Laporan Hasil Survei – Ahli Waris (Versi Terbaru)";
const KUNJUNGAN_TEMPLATE = "Lembar Hasil Kunjungan RS (Mobile Pelayanan)";

export default function Step3({ data = {}, setData, next, back, playBeep }) {
  const tpl = data.template || "";

  useEffect(() => {
      if (tpl === SURVEY_TEMPLATE) {
        setData(prev => ({ ...prev, isSurvey: true }));
      } else if (tpl === KUNJUNGAN_TEMPLATE) {
        setData(prev => ({ ...prev, isSurvey: false }));
      }
    }, [tpl]);

  const handleNext = () => {
    next();
  };


  const renderBody = () => {
    if (tpl === SURVEY_TEMPLATE) {
      return (
        <HasilSurvey
          data={data}
          setData={setData}
          next={handleNext}
          back={back}
          playBeep={playBeep}
        />
      );
    }
    if (tpl === KUNJUNGAN_TEMPLATE) {
      return (
        <HasilKunjungan
          data={data}
          setData={setData}
          next={handleNext}
          back={back}
          playBeep={playBeep}
        />
      );
    }

    return (
      <div className="empty-card">
        <div className="empty-emoji">🗂️</div>
        <div className="empty-title">Belum ada template</div>
        <p className="empty-sub">Silakan kembali ke Langkah 2 dan pilih template dokumen.</p>
        <div className="actions">
          <button className="btn ghost" onClick={back}>Kembali</button>
        </div>
      </div>
    );
  };

  return (
    <div className="container step3-shell">
      <div className="head">
        <h2 className="title">
          Isi Form
          <span className="title-sub"> {tpl || "—"} </span>
        </h2>
        <span className="step-chip">Langkah 3/5</span>
      </div>

      {renderBody()}

      <style>{css}</style>
    </div>
  );
}

/* ====== Shell styling: formal-kawaii (aksen #F7C7C4) ====== */
const css = `
.step3-shell{
  --accent:#F7C7C4;
  --accent-strong:#E59E9A;
  --ring:#FBE6E5;
  --ring-2:#F3D1CF;
  --ink:#2b2326;
  --muted:#776b71;
  color:var(--ink);
}
.step3-shell .head{
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:12px;
}
.step3-shell .title{ margin:0; font-size:20px; font-weight:900; color:var(--accent-strong) }
.step3-shell .title-sub{
  font-size:14px; font-weight:700; color:#87464e; background:#FFF1F0; border:1.5px solid var(--ring-2);
  padding:4px 8px; border-radius:10px; margin-left:8px;
}
.step3-shell .step-chip{
  font-size:12px; font-weight:800; padding:6px 10px; border-radius:999px;
  border:1.5px solid var(--ring-2); background:#FFF1F0;
}

/* Empty */
.empty-card{
  background:#fff; border:2px solid var(--ring-2); border-radius:16px; padding:24px;
  text-align:center; box-shadow:0 10px 28px rgba(247,199,196,.35);
}
.empty-emoji{ font-size:40px; margin-bottom:8px }
.empty-title{ font-weight:900; color:var(--accent-strong); margin-bottom:6px }
.empty-sub{ color:var(--muted); margin:0 0 10px }

/* Shared primitives; anak form pakai kelas ini */
.form-card{
  background:#fff; border:2px solid var(--ring-2); border-radius:16px; padding:16px;
  margin-bottom:12px; box-shadow:0 10px 28px rgba(247,199,196,.20);
}
.row{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
.row-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px }
@media (max-width: 900px){
  .row{ grid-template-columns:1fr }
  .row-3{ grid-template-columns:1fr }
}
.label{ font-weight:800; margin-bottom:8px; display:block; color:var(--ink) }
.helper{ color:var(--muted); font-size:12px; margin-top:6px }

.input, .select, .textarea{
  width:100%; padding:12px 14px; border-radius:12px;
  border:2px solid var(--ring-2); background:#FFF6F5; outline:none; font-size:15px; color:var(--ink);
}
.input:focus, .select:focus, .textarea:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--ring) }

.bad{ color:#B03A54 }
.good{ color:#1f8f4e }

.actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:10px }
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  border-radius:14px; padding:12px 16px; font-weight:800; cursor:pointer; border:2px solid transparent;
}
.btn.ghost{ background:#FFE9E7; border-color:#F3B6B2; color:#6b2a35 }
.btn.ghost:hover{ filter:brightness(0.98) }
.btn.rose{ background:#F7C7C4; border-color:#F3B6B2; color:#3b0a1a }
.btn.rose:hover{ filter:brightness(0.98) }
.btn[disabled]{ opacity:.6; cursor:not-allowed }
`;
