import React, { useMemo, useState } from "react";

const templates = [
  "",
  "Lembar Hasil Kunjungan RS",
  "Laporan Hasil Survei",
];
const SURVEY_TEMPLATE = templates[2];

const jenisOptions = [
  { value: "keterjaminan", label: "Keterjaminan Korban", icon: "🛡️" },
  { value: "keabsahan_waris", label: "Keabsahan Ahli Waris", icon: "👨‍👩‍👧‍👦" },
  { value: "keabsahan_biaya", label: "Keabsahan Biaya Perawatan", icon: "💳" },
  // { value: "lainnya", label: "Lainnya", icon: "📝" },
];

const toNormalizedTemplate = (templateTitle, jenisSurvei) => {
  if (templateTitle !== SURVEY_TEMPLATE) {
    return templateTitle?.toLowerCase().includes("kunjungan")
      ? "kunjungan_rs"
      : "";
  }

  switch (jenisSurvei) {
    case "keterjaminan":
      return "survei_ll";
    case "keabsahan_waris":
      return "survei_md";
    case "keabsahan_biaya":
      return "survei_ll";
    default:
      return "";
  }
};

export default function Step2({ data: rawData = {}, setData, next, back }) {
  const [warn, setWarn] = useState("");

  const data = {
    templateTitle: rawData.templateTitle ?? rawData.template ?? "",   // <- untuk UI dropdown
    template: rawData.template ?? "", 
    sifatCidera: "",
    jenisSurvei: "",
    jenisSurveiLainnya: "",
    ...rawData,
  };
  const isSurvey = data.templateTitle === SURVEY_TEMPLATE;

  const canNext = useMemo(() => {
    if (!data.template) return false;
    if (isSurvey) {
      if (!data.jenisSurvei) return false;
      if (data.jenisSurvei === "lainnya" && !data.jenisSurveiLainnya?.trim()) return false;
    }
    return true;
  }, [isSurvey, data.template, data.sifatCidera, data.jenisSurvei, data.jenisSurveiLainnya]);
  
  const onTemplate = (tpl) => {
    const next = {
      ...data,
      templateTitle: tpl,
      sifatCidera: tpl === SURVEY_TEMPLATE ? data.sifatCidera : "",
      jenisSurvei: tpl === SURVEY_TEMPLATE ? data.jenisSurvei : "",
      jenisSurveiLainnya: tpl === SURVEY_TEMPLATE ? (data.jenisSurveiLainnya || "") : "",
    };
    next.template = toNormalizedTemplate(tpl, next.jenisSurvei);
    setData?.(next);
    setWarn("");
  };

  const handleNext = () => {
    if (!data.template) {
      setWarn("Pilih salah satu template terlebih dahulu.");
      return;
    }

    // Kalau template adalah survey
    if (isSurvey) {
      if (!data.jenisSurvei) {
        setWarn("Pilih jenis survei.");
        return;
      }
    }

    const normalized = toNormalizedTemplate(data.templateTitle, data.jenisSurvei);
    if (normalized !== data.template) {
      setData?.({ ...data, template: normalized });
    }

    // Kalau semua valid → lanjut
    setWarn("");
    next?.();
  };

  return (
    <div className="container step2-kawaii">
      <div className="head">
        <h2 className="title">Pilih Dokumen</h2>
        <span className="step-chip">Langkah 2/5</span>
      </div>

      <section className="card">
        <label className="label">Pilih Template Dokumen</label>
        <select
          className="select pretty"
          value={data.templateTitle}
          onChange={(e) => onTemplate(e.target.value)}
        >
          {templates.map((t, i) => (
            <option key={i} value={t}>
              {t || "— Pilih template —"}
            </option>
          ))}
        </select>
        <p className="helper">Template menentukan isian lanjutan.</p>
      </section>

      {isSurvey && (
        <>
          <section className="card">
            <label className="label">Jenis Laporan Survei</label>
            <div className="seg wrap">
              {jenisOptions.map((o) => {
                const active = data.jenisSurvei === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`pill ${active ? "active" : ""}`}
                    onClick={() => {
                      const template = toNormalizedTemplate(data.templateTitle, o.value);

                      setData?.({
                        ...data,
                        jenisSurvei: o.value,
                        template,
                        jenisSurveiLainnya:
                          o.value === "lainnya" ? data.jenisSurveiLainnya || "" : "",
                      });
                    }}
                    aria-pressed={active}
                    title={o.label}
                  >
                    <span className="ico">{o.icon}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>

            {data.jenisSurvei === "lainnya" && (
              <div className="other">
                <input
                  className="input"
                  placeholder="Tuliskan keterangan singkat…"
                  value={data.jenisSurveiLainnya || ""}
                  onChange={(e) =>
                    setData?.({ ...data, jenisSurveiLainnya: e.target.value })
                  }
                />
              </div>
            )}
          </section>
        </>
      )}

      {warn && <div className="warn">{warn}</div>}

      <section className="card summary">
        <div className="sum-title">Ringkasan</div>
        <ul className="sum-list">
          <li>
            <span>📄</span>
            <div>
              <b>Template</b>
              <div className={data.template ? "" : "muted"}>
                {data.templateTitle || "— belum dipilih —"}
              </div>
            </div>
          </li>
          {isSurvey && (
            <>
              <li>
                <span>🔎</span>
                <div>
                  <b>Jenis Survei</b>
                  <div className={data.jenisSurvei ? "" : "muted"}>
                    {data.jenisSurvei
                      ? data.jenisSurvei === "keterjaminan"
                        ? "Keterjaminan Korban"
                        : data.jenisSurvei === "keabsahan_waris"
                        ? "Keabsahan Ahli Waris"
                        : data.jenisSurvei === "keabsahan_biaya"
                        ? "Keabsahan Biaya Perawatan"
                        : ``
                      : "— belum dipilih —"}
                  </div>
                </div>
              </li>
            </>
          )}
        </ul>
      </section>

      <div className="actions">
        <button className="btn ghost" onClick={back}>Kembali</button>
        <button className="btn rose" onClick={handleNext} disabled={!canNext}>Selanjutnya</button>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* ========= Style: no white buttons, aksen #F7C7C4 ========= */
const css = `
.step2-kawaii{
  --accent:#F7C7C4;
  --accent-strong:#E59E9A;
  --ring:#FBE6E5;
  --ring-2:#F3D1CF;
  --ink:#2b2326;
  --muted:#776b71;
  color:var(--ink);
}

.step2-kawaii .head{
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:12px;
}
.step2-kawaii .title{ margin:0; font-size:20px; font-weight:900; color:var(--accent-strong) }
.step2-kawaii .step-chip{
  font-size:12px; font-weight:800; padding:6px 10px; border-radius:999px;
  border:1.5px solid var(--ring-2); background:#FFF1F0; /* <- tidak putih */
}

/* Card */
.step2-kawaii .card{
  background:#fff;
  border:2px solid var(--ring-2);
  border-radius:16px;
  padding:16px; margin-bottom:12px;
  box-shadow:0 10px 28px rgba(247,199,196,.35);
}

/* Form primitives */
.label{ font-weight:800; margin-bottom:8px; display:block; color:var(--ink) }
.helper{ color:var(--muted); font-size:12px; margin-top:6px }

.select.pretty, .input{
  width:100%; padding:12px 14px; border-radius:12px;
  border:2px solid var(--ring-2); background:#FFF6F5; /* <- lembut, bukan putih */
  outline:none; font-size:15px; color:var(--ink);
  appearance:none; -webkit-appearance:none; -moz-appearance:none;
}
.select.pretty:focus, .input:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--ring) }
.select.pretty option{ color:var(--ink); background:#fff }

/* Pills */
.seg{ display:flex; gap:10px; flex-wrap:wrap }
.pill{
  border:2px solid var(--ring-2);
  background:#FFF3F2;              /* <- default bukan putih */
  color:#3b2f34;
  padding:10px 14px; border-radius:999px; font-weight:700; cursor:pointer;
  display:inline-flex; align-items:center; gap:8px; transition:.15s;
  box-shadow:0 2px 8px rgba(0,0,0,.04);
}
.pill:hover{ transform:translateY(-1px) }
.pill.active{
  background:linear-gradient(#fff,#fff) padding-box,
             linear-gradient(90deg,#F7C7C4,#FBE6E5) border-box;
  border:2px solid transparent; color:#A43C48;
}
.ico{ font-size:16px }

/* Warning */
.warn{
  margin-top:6px; padding:10px 12px; border-radius:12px;
  border:1.5px dashed var(--accent); background:#FFF7F7; color:#B03A54;
}

/* Summary (bawah) */
.summary .sum-title{ font-weight:900; color:var(--accent-strong); margin-bottom:8px }
.summary .sum-list{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px }
.summary .sum-list li{ display:flex; gap:10px; align-items:flex-start }
.summary .sum-list li>span{ font-size:18px; line-height:1 }
.summary .muted{ color:#a3a3a3; font-style:italic }

/* Actions */
.actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:10px }
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  border-radius:14px; padding:12px 16px; font-weight:800; cursor:pointer; border:2px solid transparent;
}
.btn.ghost{
  background:#FFE9E7;          /* <- BUKAN putih */
  border-color:#F3B6B2;
  color:#6b2a35;
}
.btn.ghost:hover{ filter:brightness(0.98) }
.btn.rose{
  background:#F7C7C4; border-color:#F3B6B2; color:#3b0a1a;
}
.btn.rose:hover{ filter:brightness(0.98) }
.btn[disabled]{ opacity:.6; cursor:not-allowed }
`;
