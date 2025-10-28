import React, { useMemo, useRef, useState, useEffect } from "react";
import { fetchAllDataPks } from "../../lib/datapksRepo";

/* =========================================================
   KONFIG & UTIL
   ========================================================= */
const THEME = {
  accent: "#F7C7C4",
  accentStrong: "#E59E9A",
  ring: "#FBE6E5",
  ring2: "#F3D1CF",
};
const DEFAULT_TTD = "/andi-ttd.jpeg"; // file default disimpan di public/

const DOC_OPTIONS = [
  { type: "kunjungan", label: "Lembar Hasil Kunjungan RS (Mobile Pelayanan)" },
];

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function printViaIframe(srcdoc) {
  const ifr = document.createElement("iframe");
  ifr.style.position = "fixed";
  ifr.style.right = "0";
  ifr.style.bottom = "0";
  ifr.style.width = "0";
  ifr.style.height = "0";
  ifr.style.border = "0";
  document.body.appendChild(ifr);
  ifr.onload = () => {
    setTimeout(() => {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
      setTimeout(() => document.body.removeChild(ifr), 800);
    }, 200);
  };
  ifr.srcdoc = srcdoc;
}
async function fileToDataURL(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      console.log("✅ Berhasil convert file:", file.name);
      resolve(fr.result);
    };
    fr.onerror = (err) => {
      console.error("❌ Gagal convert file:", err);
      reject(err);
    };
    fr.readAsDataURL(file);
  });
}

async function toDataURL(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Gagal convert URL:", err);
    return null;
  }
}

/* =========================================================
   Loader html2pdf.js (untuk download PDF langsung)
   ========================================================= */
// function loadHtml2Pdf() {
//   return new Promise((resolve, reject) => {
//     if (window.html2pdf) return resolve(window.html2pdf);
//     const s = document.createElement("script");
//     s.src =
//       "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js";
//     s.onload = () => resolve(window.html2pdf);
//     s.onerror = reject;
//     document.body.appendChild(s);
//   });
// }

/* =========================================================
   Mic (speech-to-text)
   ========================================================= */
function DictationButton({ onResult, title = "Dikte" }) {
  const recRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung Speech Recognition.");
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {}
      recRef.current = null;
    }
    const r = new SR();
    r.lang = "id-ID";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onResult?.(e.results[0][0].transcript);
    r.onend = () => (recRef.current = null);
    recRef.current = r;
    r.start();
  };
  return (
    <button
      type="button"
      onClick={start}
      className="btn mic"
      title={title}
      aria-label="Dikte"
    >
      🎤
    </button>
  );
}

/* =========================================================
   HALAMAN
   ========================================================= */
export default function HasilKunjungan({
  data = {},
  setData,
  next,
  back,
  playBeep,
}) {
  const set = (k) => (e) => setData?.({ ...data, [k]: e.target.value });

  // daftar dokumen (biarkan 1 jenis dulu — bisa ditambah)
  const [docs, setDocs] = useState([{ type: "kunjungan", id: 1 }]);
  const [showAddDoc, setShowAddDoc] = useState(false);

  // tanda tangan
  const ttdMode = data.ttdMode || "image"; // "image" | "none"
  const setTtdMode = (mode) => setData?.({ ...data, ttdMode: mode });

  const [fotoList, setFotoList] = useState(data.fotoSurveyList || []);
  const [rsList, setRsList] = useState(data.laporanRSList || []);

  useEffect(() => {
    setData?.((prev) => ({
      ...prev,
      fotoSurveyList: fotoList,
      laporanRSList: rsList,
    }));
  }, [fotoList, rsList]);

  // === Konversi File ke Base64 ===
  async function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // === Upload Foto Survey ===
  const onUploadFoto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const converted = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type,
        dataURL: await fileToDataURL(f),
      }))
    );

    setFotoList((prev) => {
      const names = new Set(prev.map((x) => x.name));
      const merged = [...prev, ...converted.filter((x) => !names.has(x.name))];
      setData?.((d) => ({ ...d, fotoSurveyList: merged }));
      return merged;
    });

    e.target.value = "";
  };

  // === Hapus Foto ===
  const removeFoto = (idx) => {
    const updated = fotoList.filter((_, i) => i !== idx);
    setFotoList(updated);
    setData?.((prev) => ({ ...prev, fotoSurveyList: updated }));
  };

  const v = {
    petugas: data.petugas || "",
    petugasJabatan: data.petugasJabatan || "Petugas Pelayanan",
    wilayah: data.wilayah || "",
    korban: data.korban || "",
    lokasiKecelakaan: data.lokasiKecelakaan || "",
    rumahSakit: data.rumahSakit || "",
    tanggalKecelakaan: data.tanggalKecelakaan || "",
    tglMasukRS: data.tglMasukRS || "",
    tglJamNotifikasi: data.tglJamNotifikasi || "",
    tglJamKunjungan: data.tglJamKunjungan || "",
    uraianKunjungan: data.uraianKunjungan || "",
    rekomendasi: data.rekomendasi || "",
    pejabatMengetahuiName: data.pejabatMengetahuiName || "Andi Raharja, S.A.B",
    pejabatMengetahuiJabatan:
      data.pejabatMengetahuiJabatan || "Kepala Bagian Operasional",
    pejabatMengetahuiTtd: data.pejabatMengetahuiTtd || "",
    petugasTtd: data.petugasTtd || "",
    ttdMode,
    fotoSurveyList: fotoList,
    laporanRSList: rsList,
  };

  const canNext = useMemo(
    () =>
      v.petugas.trim() &&
      v.wilayah.trim() &&
      v.korban.trim() &&
      v.lokasiKecelakaan.trim() &&
      v.rumahSakit.trim() &&
      v.tanggalKecelakaan.trim() &&
      v.tglMasukRS.trim() &&
      v.tglJamNotifikasi.trim() &&
      v.tglJamKunjungan.trim() && !!v.petugasTtd,
    [v]
  );

  const onUploadTtd = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataURL = await fileToDataURL(file);
    setData?.({ ...data, pejabatMengetahuiTtd: dataURL, ttdMode: "image" });
  };

  // --- RS options dari Data PKS (localStorage) ---
  const [rsOptions, setRsOptions] = useState([]);

  const LS_KEY = "datapks_rows";
  const loadRsOptions = async () => {
    try {
      // 1) Coba dari localStorage dulu
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      let rows = Array.isArray(cached) ? cached : [];

      // 2) Kalau kosong → fetch dari Supabase (fallback)
      if (!rows.length) {
        try {
          const remoteRows = Array.isArray(remote)
            ? remote
            : Array.isArray(remote?.data)
              ? remote.data
              : Array.isArray(remote?.rows)
                ? remote.rows
                : [];
          if (remoteRows.length) {
            rows = remoteRows;
            localStorage.setItem(LS_KEY, JSON.stringify(rows));
            try { window.dispatchEvent(new CustomEvent("datapks:changed")); } catch {}
          } else {
            console.warn("[HasilKunjungan] fetchAllDataPks tidak mengembalikan array. Bentuk:", remote);
          }
        } catch (e) {
          console.warn("[HasilKunjungan] fallback fetchAllDataPks gagal:", e);
        }
      }

      // 3) Bentuk list nama RS unik
      const names = rows.map(r => {
        const n =
          r?.namaRS ??
          r?.nama_rs ??
          r?.namaRumahSakit ??
          r?.rumahSakit ??
          r?.rs_name ??
          r?.rsName ??
          "";
        return String(n).trim();
      }).filter(Boolean);

      const seen = new Set();
      const out = [];
      for (const n of names) {
        const k = n.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(n); }
      }
      out.sort((a,b) => a.localeCompare(b, "id"));
      setRsOptions(out);
      console.log("[HasilKunjungan] rsOptions.count =", out.length, out.slice(0, 10));
    } catch (e) {
      console.error("[HasilKunjungan] loadRsOptions error:", e);
      setRsOptions([]); 
    }
  };

  useEffect(() => {
    loadRsOptions();
    const onChanged = () => loadRsOptions();
    window.addEventListener("datapks:changed", onChanged);
    return () => window.removeEventListener("datapks:changed", onChanged);
  }, []);

  /* ============================ CETAK & DOWNLOAD ============================ */

  const openPrint = async () => {
    playBeep?.();
    const vv = await prepareForOutput(v);
    const srcdoc = buildBundleHtml(vv, docs);

    // === buat blob dari srcdoc (HTML hasil form)
    const blob = new Blob([srcdoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Simpan ke state/form data (biar ikut ke Step5 & DataForm)
    setData?.((prev) => ({
      ...prev,
      hasilFormFile: {
        name: `Hasil_Form_Kunjungan_${vv.korban || "Anon"}.html`,
        dataURL: url,
        label: "Hasil Formulir Kunjungan RS",
      },
    }));

    // Cetak juga
    printViaIframe(srcdoc);
  };

  async function prepareForOutput(v0) {
    const vv = { ...v0 };
    if (vv.ttdMode === "image") {
      if (!vv.pejabatMengetahuiTtd) {
        try {
          vv.pejabatMengetahuiTtd = await toDataURL(DEFAULT_TTD);
        } catch {
          vv.ttdMode = "none";
        }
      }
    }
    return vv;
  }

  const handleNext = () => {
    if (!canNext) return alert("Lengkapi semua kolom wajib sebelum lanjut.");
    playBeep?.();
    next?.();
  };

  /* ============================ RENDER ============================ */

  return (
    <div className="hk-wrap container">
      <div className="head">
        <div>
          <h2 className="title">Lembar Hasil Kunjungan RS</h2>
          <div className="chips">
            <span className="chip">Langkah 3/5</span>
            <span className="chip alt">
              Template: Lembar Hasil Kunjungan RS
            </span>
          </div>
        </div>
      </div>

      {/* Form utama */}
      <section className="card">
        <div className="row">
          <div>
            <label className="label">
              NPP / Nama Petugas <small className="hint">• Dikte</small>
            </label>
            <div className="with-mic">
              <input
                className="input"
                value={v.petugas}
                onChange={set("petugas")}
                placeholder="Isi nama petugas"
              />
              <DictationButton
                onResult={(t) =>
                  setData?.({ ...data, petugas: `${v.petugas} ${t}`.trim() })
                }
              />
            </div>
          </div>

          <div>
            <label className="label">Loket Kantor / Wilayah</label>
            <select
              className="select"
              value={v.wilayah}
              onChange={set("wilayah")}
            >
              <option value="">— Pilih —</option>
              <option>Kanwil</option>
              <option>Dumai</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">
              Nama Korban <small className="hint">• Dikte</small>
            </label>
            <div className="with-mic">
              <input
                className="input"
                value={v.korban}
                onChange={set("korban")}
                placeholder="Isi nama korban"
              />
              <DictationButton
                onResult={(t) =>
                  setData?.({ ...data, korban: `${v.korban} ${t}`.trim() })
                }
              />
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-2">
              Lokasi Kecelakaan <small className="hint">• Dikte</small>
              {/* Ikon info */}
              <span
                className="info-icon cursor-pointer text-blue-500"
                title={`Mohon tuliskan alamat sejelas mungkin, meliputi:\n\n- Nama jalan\n- Dekat toko/gedung terkenal\n- Kelurahan & Kecamatan\n- Titik koordinat`}
              >
                ℹ️
              </span>
            </label>

            <div className="with-mic">
              <textarea
                className="textarea"
                value={v.lokasiKecelakaan}
                onChange={set("lokasiKecelakaan")}
                placeholder="Isi lokasi kejadian"
              />
              <DictationButton
                onResult={(t) =>
                  setData?.((prev) => ({
                    ...prev,
                    lokasiKecelakaan: `${prev.lokasiKecelakaan || ""} ${t}`.trim(),
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Kode RS / Nama RS</label>
            <input
              list="rs-master"
              className="input"
              value={v.rumahSakit}
              onChange={set("rumahSakit")}
              placeholder="Ketik nama RS, pilih bila muncul…"
            />
            <datalist id="rs-master">
              {rsOptions.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>

          <div className="row-3">
            <div>
              <label className="label">Tanggal Kecelakaan</label>
              <input
                type="date"
                className="input"
                value={data.tanggalKecelakaan}
                onChange={set("tanggalKecelakaan")}
              />
            </div>
            <div>
              <label className="label">Tanggal Masuk RS</label>
              <input
                type="datetime-local"
                className="input"
                value={v.tglMasukRS}
                onChange={set("tglMasukRS")}
              />
            </div>
            <div>
              <label className="label">Tanggal & Jam Notifikasi</label>
              <input
                type="datetime-local"
                className="input"
                value={v.tglJamNotifikasi}
                onChange={set("tglJamNotifikasi")}
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Tanggal & Jam Kunjungan</label>
            <input
              type="datetime-local"
              className="input"
              value={v.tglJamKunjungan}
              onChange={set("tglJamKunjungan")}
            />
          </div>
          <div>
            <label className="label">Jabatan Petugas</label>
            <input
              className="input"
              value={v.petugasJabatan}
              onChange={set("petugasJabatan")}
              placeholder="Contoh: Petugas Pelayanan"
            />
          </div>
        </div>
      </section>

      {/* Uraian */}
      <section className="card">
        <label className="label flex items-center gap-2">
          Uraian Hasil Kunjungan <small className="hint">• Dikte</small>
          {/* Ikon info */}
          <span
            className="info-icon cursor-pointer text-blue-500"
            title="Deskripsikan kondisi luka korban"
          >
            ℹ️
          </span>
        </label>

        <div className="with-mic">
          <textarea
            className="textarea"
            rows={6}
            value={v.uraianKunjungan}
            onChange={set("uraianKunjungan")}
            placeholder="Tuliskan hasil kunjungan…"
          />
          <DictationButton
            onResult={(t) =>
              setData?.({
                ...data,
                uraianKunjungan: `${v.uraianKunjungan} ${t}`.trim(),
              })
            }
          />
        </div>
      </section>

      {/* Rekomendasi */}
      <section className="card">
        <label className="label flex items-center gap-2">
          Rekomendasi Kesimpulan <small className="hint">• Dikte</small>
          {/* Ikon info */}
          <span
            className="info-icon cursor-pointer text-blue-500"
            title="Tuliskan kesimpulan berdasarkan uraian kunjungan. Sertakan juga kronologi singkat bila diperlukan."
          >
            ℹ️
          </span>
        </label>

        <div className="with-mic">
          <textarea
            className="textarea"
            rows={4}
            value={v.rekomendasi}
            onChange={set("rekomendasi")}
            placeholder="Tuliskan rekomendasi/kesimpulan…"
          />
          <DictationButton
            onResult={(t) =>
              setData?.({
                ...data,
                rekomendasi: `${v.rekomendasi} ${t}`.trim(),
              })
            }
          />
        </div>
      </section>

      {/* Upload Foto Survey */}
      <section className="card">
        <div className="row">
          <div>
            <label className="label">Foto Survey (multi)</label>
            <input
              key={fotoList.length}
              type="file"
              accept="image/*"
              multiple
              onChange={onUploadFoto}
            />
            {fotoList.length > 0 ? (
              fotoList.map((f, i) => {
                const src = f.dataURL || null;
                return (
                  <div className="thumb" key={i}>
                    {src ? (
                      <img
                        src={src}
                        alt={f.name}
                        style={{
                          width: "100%",
                          height: "100px",
                          objectFit: "cover",
                          borderRadius: "0.25rem",
                        }}
                      />
                    ) : (
                      <div style={{ padding: "1rem", color: "#888" }}>
                        Tidak ada preview
                      </div>
                    )}
                    <div className="tname" title={f.name}>
                      {f.name}
                    </div>
                    <button className="btn small" onClick={() => removeFoto(i)}>
                      Hapus
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "1rem", color: "#888" }}>Belum ada foto</div>
            )}
          </div>
        </div>
        {/* TTD PETUGAS (PNG) */}
        <div style={{ marginTop: 14 }}>
          <label className="label">TTD Petugas (PNG, latar transparan disarankan)</label>
          <input
            type="file"
            accept="image/png"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.type !== "image/png") {
                alert("Format harus PNG ya 🙏");
                e.target.value = "";
                return;
              }
              const url = await fileToDataURL(f);
              setData?.((prev) => ({ ...prev, petugasTtd: url }));
            }}
          />
          {data.petugasTtd && (
            <div className="ttd-preview">
              <img src={data.petugasTtd} alt="TTD Petugas" />
            </div>
          )}
        </div>
      </section>
      <div className="actions">
        <button className="btn ghost" onClick={back}>
          Kembali
        </button>
        <button className="btn rose" onClick={handleNext} disabled={!canNext}>
          Selanjutnya
        </button>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* =========================================================
   BUILDER HTML CETAK — 1 HALAMAN, judul kecil, hitam/putih
   ========================================================= */
function buildBundleHtml(v, docs) {
  const pages = docs
    .map((d) => (d.type === "kunjungan" ? pageKunjungan(v) : ""))
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Hasil Kunjungan</title>
<style>
@page { size: A4; margin: 12mm; }
*{ box-sizing: border-box; }
html,body{ margin:0; padding:0; background:#fff; }
body{
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-family: "Times New Roman", Times, serif;
  font-size: 10.8pt;
  color:#000;
}
.page{ width: 186mm; position: relative; }
.title{
  text-align:center; font-weight:700; text-transform:uppercase;
  font-size:12pt; line-height:1.15; letter-spacing:0;
  margin:0 0 1.2mm; color:#000 !important;
}
.sub{
  text-align:center; font-weight:700; text-transform:uppercase;
  font-size:10.6pt; line-height:1.15; margin:0 0 4mm; color:#000 !important;
}
.kv{
  display:grid; grid-template-columns: 53mm 4mm 1fr;
  row-gap:2.0mm; column-gap:1.6mm; margin-bottom:5mm;
}
.k{ font-weight:700; } .c{ text-align:center; }

.sec{ margin:0 0 4.6mm; }
.box{ border:0.3mm solid #000; padding:2.1mm; white-space:pre-wrap; }
.box-uraian{ height:62mm; }
.box-reko{ height:8mm; }

.closing{ margin:2.5mm 0 6mm; }

.signs{ display:grid; grid-template-columns:1fr 1fr; column-gap:18mm; }
.lbl{ margin-bottom:6mm; }
.space{ height:52mm; }
.sign-img{ max-height:52mm; max-width:95mm; width:auto; height:auto; display:block; }
.name{ font-weight:700; text-decoration: underline; margin-top:0; }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

function pageKunjungan(v) {
  const src = v.ttdMode === "image" ? v.pejabatMengetahuiTtd : null;
  const petugasSrc = v.petugasTtd || null;
  const showImg = !!src;
  return `
<section class="page">
  <div class="title">LEMBAR HASIL CETAK KUNJUNGAN<br/>KE RUMAH SAKIT</div>
  <div class="sub">APLIKASI MOBILE PELAYANAN</div>

  <div class="kv">
    <div class="k">NPP / Nama Petugas</div><div class="c">:</div><div class="v">${escapeHtml(
      v.petugas || "-"
    )}</div>
    <div class="k">Loket Kantor</div><div class="c">:</div><div class="v">${escapeHtml(
      v.wilayah || "-"
    )}</div>
    <div class="k">Nama Korban</div><div class="c">:</div><div class="v">${escapeHtml(
      v.korban || "-"
    )}</div>
    <div class="k">Lokasi Kecelakaan</div><div class="c">:</div><div class="v">${escapeHtml(
      v.lokasiKecelakaan || "-"
    )}</div>
    <div class="k">Kode RS / Nama RS</div><div class="c">:</div><div class="v">${escapeHtml(
      v.rumahSakit || "-"
    )}</div>
    <div class="k">Tanggal Kecelakaan</div><div class="c">:</div><div class="v">${escapeHtml(
      fmtDate(v.tanggalKecelakaan)
    )}</div>
    <div class="k">Tanggal Masuk RS</div><div class="c">:</div><div class="v">${escapeHtml(
      fmtDate(v.tglMasukRS)
    )}</div>
    <div class="k">Tanggal & Jam Notifikasi</div><div class="c">:</div><div class="v">${escapeHtml(
      fmtDateTime(v.tglJamNotifikasi)
    )}</div>
    <div class="k">Tanggal & Jam Kunjungan</div><div class="c">:</div><div class="v">${escapeHtml(
      fmtDateTime(v.tglJamKunjungan)
    )}</div>
  </div>

  <div class="sec">
    <div style="font-weight:700; margin:0 0 2mm">Uraian Hasil Kunjungan:</div>
    <div class="box box-uraian">${escapeHtml(v.uraianKunjungan || "")}</div>
  </div>

  <div class="sec">
    <div style="font-weight:700; margin:0 0 2mm">Rekomendasi Kesimpulan:</div>
    <div class="box box-reko">${escapeHtml(v.rekomendasi || "")}</div>
  </div>

  <p class="closing">
    Demikian laporan hasil kunjungan ke Rumah Sakit ini kami buat dengan sebenarnya sesuai
    dengan informasi yang kami peroleh.
  </p>

  <div class="signs">
    <div>
      <div class="lbl">Mengetahui,</div>
      <div class="space">${
        showImg ? `<img src="${src}" class="sign-img" />` : ""
      }</div>
      <div class="name">${escapeHtml(v.pejabatMengetahuiName)}</div>
      <div>${escapeHtml(v.pejabatMengetahuiJabatan)}</div>
    </div>
    <div>
      <div class="lbl">Petugas yang Melaksanakan Kunjungan,</div>
      <div class="space">${petugasSrc ? `<img src="${petugasSrc}" class="sign-img" />` : ""}</div>
      <div class="name">${escapeHtml(
        v.petugas || "Nama .................................................."
      )}</div>
      <div>${escapeHtml(
        v.petugasJabatan ||
          "Jabatan ................................................"
      )}</div>
    </div>
  </div>
</section>`;
}

/* =========================================================
   CSS SCREEN (kawaii + responsif)
   ========================================================= */
const css = `
.hk-wrap{
  --accent:${THEME.accent}; --accent-strong:${THEME.accentStrong};
  --ring:${THEME.ring}; --ring-2:${THEME.ring2};
  --ink:#2b2326; --muted:#776b71; color:var(--ink);
}
.head{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap }
.title{ margin:0; font-size:20px; font-weight:900; color:var(--accent-strong) }
.chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:6px }
.chip{ background:#FFF1F0; border:1.5px solid var(--ring-2); border-radius:999px; padding:6px 10px; font-weight:800; font-size:12px }
.chip.alt{ background:#FFE9E7 }
.right-controls{ display:flex; gap:8px; flex-wrap:wrap; margin-left:auto }

.card{ background:#fff; border:2px solid var(--ring-2); border-radius:16px; padding:16px; margin-bottom:12px; box-shadow:0 10px 28px rgba(247,199,196,.25) }
.row{ display:grid; grid-template-columns:1fr 1fr; gap:14px }
.row-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px }
@media (max-width: 900px){ .row{ grid-template-columns:1fr } .row-3{ grid-template-columns:1fr } .right-controls{ width:100%; } }

.label{ font-weight:800; margin-bottom:8px; display:block }
.hint{ color:#c06; font-weight:800 }
.input,.select,.textarea{ width:100%; padding:12px 14px; border-radius:12px; border:2px solid var(--ring-2); background:#FFF6F5; outline:none; font-size:15px; color:var(--ink) }
.input:focus,.select:focus,.textarea:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--ring) }

.with-mic{ display:grid; grid-template-columns:1fr 44px; gap:10px; align-items:center }
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:.4rem; border-radius:14px; padding:10px 14px; font-weight:800; cursor:pointer; border:2px solid transparent }
.btn.ghost{ background:#FFE9E7; border-color:#F3B6B2; color:#6b2a35 }
.btn.rose{ background:#F7C7C4; border-color:#F3B6B2; color:#3b0a1a }
.btn.small{ padding:6px 10px; font-size:12px }
.btn.mic{ background:#fff; border:2px solid var(--ring-2) }

.seg{ display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 }
.pill{ display:inline-flex; align-items:center; gap:8px; border:2px solid var(--ring-2); padding:8px 12px; border-radius:999px; background:#fff; cursor:pointer }
.pill input{ accent-color:#c45; }

.info-icon {
  position: relative;
  display: inline-block;
}

.info-icon:hover::after {
  white-space: pre-wrap;
  position: absolute;
  top: 120%;
  left: 0;
  background: #1f2937; /* abu gelap */
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  width: 220px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
}

.ttd-preview img{ height:56px; margin-top:6px }

.doc-list{ margin:6px 0 0; padding:0 0 0 18px }
.doc-list li{ margin:4px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap }

.thumbs{ display:flex; gap:10px; flex-wrap:wrap; margin-top:8px }
.thumb{ width:120px; border:1px solid var(--ring-2); border-radius:12px; padding:8px; background:#fff }
.thumb img{ width:100%; height:80px; object-fit:cover; border-radius:8px }
.tname{ font-size:11px; margin-top:4px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }

.actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:10px; flex-wrap:wrap }

.modal{ position:fixed; inset:0; background:rgba(0,0,0,.12); display:grid; place-items:center; z-index:60 }
.modal-card{ background:#fff; border:2px solid var(--ring-2); border-radius:16px; padding:14px; width: min(540px, 92vw); box-shadow:0 20px 60px rgba(0,0,0,.15) }
.modal-hd{ margin-bottom:10px }
.modal-bd{ display:grid; gap:10px }
.doc-opt{ border:2px dashed var(--ring-2); background:#FFFAFA; border-radius:12px; padding:12px; cursor:pointer; text-align:left; font-weight:800 }
.modal-ft{ margin-top:10px; display:flex; justify-content:flex-end }
`;
