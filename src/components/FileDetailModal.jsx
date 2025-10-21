// FileDetailModal.jsx
import React, { useEffect, useState } from "react";

/* ==== util & child components DIPINDAH KE LUAR ==== */
const DEBUG = true;

const guessTypeFromName = (name = "") => {
  const n = name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(n)) return "image/*";
  if (/\.(pdf)$/.test(n)) return "application/pdf";
  return "";
};
const isImage = (it) =>
  (it?.type || "").startsWith?.("image/") ||
  (it?.src || "").startsWith?.("data:image/") ||
  /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(
    (it?.name || "").toLowerCase()
  );
const isPDF = (it) =>
  (it?.type || "") === "application/pdf" ||
  (it?.src || "").startsWith?.("data:application/pdf") ||
  /\.pdf$/i.test((it?.name || "").toLowerCase());

const fileToDataURL = (file) =>
  new Promise((resolve) => {
    if (!file) return resolve("");
    const r = new FileReader();
    r.onload = () => resolve(r.result || "");
    r.onerror = () => resolve("");
    r.readAsDataURL(file);
  });

const getName = (f, fallback = "file") =>
  (f && (f.name || f.fileName || f.filename || f.label)) ||
  (typeof f === "string" ? f.split("/").pop() : null) ||
  fallback;

// coba bentuk URL kalau cuma punya "name"
const buildSrcFromName = (name, data) => {
  if (!name) return null;
  const clean = String(name).replace(/^\.?\//, "");

  // urutkan sesuai preferensi kamu
  const bases = [
    data?.fileBaseURL,
    data?.cdnBase,
    data?.baseURL,
    "/uploads",
    "/files",
    "/",           // terakhir: root
  ].filter(Boolean);

  const candidates = bases.map((b) => {
    // kalau base http(s) → pakai URL absolut
    if (String(b).startsWith("http")) {
      try { return new URL(clean, b).toString(); } catch { return `${b.replace(/\/+$/,"")}/${clean}`; }
    }
    // base path relatif
    return `${String(b).replace(/\/+$/,"")}/${clean}`;
  });

  // fallback minimal
  if (!candidates.includes(`/${clean}`)) candidates.push(`/${clean}`);

  return { src: candidates[0], candidates };
};

const normalizeOne = async (f, suggestedLabel = "file", rootDataForBase) => {
  if (!f) return null;

  if (typeof f === "string") {
    const name = getName(f, suggestedLabel);
    if (/^data:|^https?:\/\//i.test(f)) {
      return { name, type: guessTypeFromName(name), src: f, candidates: [f] };
    }
    const guess = buildSrcFromName(f, rootDataForBase);
    if (guess) {
      return { name, type: guessTypeFromName(name), src: guess.src, candidates: guess.candidates };
    }
    return null;
  }

  if (f instanceof File || f instanceof Blob) {
    const name = f.name || suggestedLabel;
    const src = await fileToDataURL(f);
    return { name, type: f.type || guessTypeFromName(name), src, candidates: [src] };
  }

  const name = f.name || f.fileName || f.filename || f.label || suggestedLabel;
  const type = f.type || guessTypeFromName(name);

  if (f.dataURL) return { name, type, src: f.dataURL, candidates: [f.dataURL] };
  if (f.url)     return { name, type, src: f.url, candidates: [f.url] };
  if (f.src)     return { name, type, src: f.src, candidates: [f.src] };
  if (f.path)    return { name, type, src: f.path, candidates: [f.path] };

  if (f.file instanceof File || f.file instanceof Blob) {
    const src = await fileToDataURL(f.file);
    return { name, type: f.file.type || type, src, candidates: [src] };
  }

  // fallback by name
  const guess = buildSrcFromName(name, rootDataForBase);
  if (guess) {
    if (DEBUG) console.warn("⚠️ Fallback URL by name:", name, "→", guess.src);
    return { name, type, src: guess.src, candidates: guess.candidates };
  }

  if (DEBUG) console.warn("⚠️ Tidak ada dataURL/URL/file untuk:", name, f);
  return null;
};

const normalizeAny = async (val, suggestedLabel, rootDataForBase) => {
  if (!val) return [];
  if (Array.isArray(val)) {
    const arr = await Promise.all(val.map((x) => normalizeOne(x, suggestedLabel, rootDataForBase)));
    return arr.filter(Boolean);
  }
  const one = await normalizeOne(val, suggestedLabel, rootDataForBase);
  return one ? [one] : [];
};

// heuristik debug
const isFileish = (v) => {
  if (!v) return false;
  if (v instanceof File || v instanceof Blob) return true;
  if (typeof v === "string")
    return (
      /^data:/.test(v) ||
      /^https?:\/\//.test(v) ||
      /\.(pdf|jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(v)
    );
  if (typeof v === "object")
    return (
      v.file instanceof File ||
      v.file instanceof Blob ||
      typeof v.dataURL === "string" ||
      typeof v.url === "string" ||
      typeof v.src === "string"
    );
  return false;
};
const detectKindBySample = (s) => {
  const name = (s?.name || s?.fileName || s?.filename || "") + "";
  const type = (s?.type || "") + "";
  const src = (s?.dataURL || s?.url || s?.src || s || "") + "";
  const lower = (name + " " + type + " " + src).toLowerCase();
  if (lower.includes("application/pdf") || /\.pdf(\b|$)/.test(lower))
    return "pdf";
  if (
    lower.includes("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)(\b|$)/.test(lower)
  )
    return "image";
  return "unknown";
};
const sampleSource = (s) => {
  if (!s) return "-";
  if (s.dataURL?.startsWith?.("data:")) return "dataURL";
  if (typeof s.url === "string") return "url";
  if (typeof s.src === "string") return "src";
  if (s.file instanceof File || s.file instanceof Blob) return "file";
  if (typeof s === "string")
    return s.startsWith("data:") ? "dataURL" : "url/string";
  return "object";
};
const scanUploads = (data) => {
  const rows = [];
  const pushRow = (path, key, val) => {
    const arr = Array.isArray(val) ? val : [val];
    const sample = arr.find((x) => isFileish(x));
    if (!sample) return;
    rows.push({
      path,
      key,
      kind: detectKindBySample(sample),
      count: arr.length,
      sampleName:
        sample?.name ||
        sample?.fileName ||
        sample?.filename ||
        (typeof sample === "string" ? sample.split("/").pop() : "") ||
        "-",
      source: sampleSource(sample),
    });
  };
  const rootKeys = [
    "fotoSurveyList",
    "fotoSurvey",
    "hasilFormFile",
    "ktp",
    "kk",
    "bukuTabungan",
    "formPengajuan",
    "formKeteranganAW",
    "skKematian",
    "aktaKelahiran",
    "lhsFile",
    "attachments",
    "attachList",
    "files",
  ];
  rootKeys.forEach((k) => {
    if (k in (data || {})) pushRow(k, k, data[k]);
  });
  if (data?.attachSurvey && typeof data.attachSurvey === "object") {
    Object.keys(data.attachSurvey).forEach((k) =>
      pushRow(`attachSurvey.${k}`, k, data.attachSurvey[k])
    );
  }
  Object.keys(data || {}).forEach((k) => {
    if (rootKeys.includes(k) || k === "attachSurvey") return;
    const val = data[k];
    if (isFileish(val)) pushRow(`data.${k}`, k, val);
    if (Array.isArray(val) && val.some(isFileish)) pushRow(`data.${k}`, k, val);
  });
  return rows;
};

// KUMPULKAN SEMUA SUMBER FOTO YANG MUNGKIN
function collectPhotoSources(data) {
  if (!data) return [];

  const arrs = [];

  // sumber utama yang kamu pakai di form
  if (Array.isArray(data.fotoSurveyList)) arrs.push(...data.fotoSurveyList);
  if (Array.isArray(data.attachSurvey?.fotoSurvey))
    arrs.push(...data.attachSurvey.fotoSurvey);

  // sumber lain yang kadang dipakai
  if (Array.isArray(data.fotoSurvey)) arrs.push(...data.fotoSurvey);
  if (Array.isArray(data.fotoList)) arrs.push(...data.fotoList);

  // kalau ada attachList (campur aduk), ambil yang image-like
  if (Array.isArray(data.attachList)) {
    arrs.push(
      ...data.attachList.filter((f) => {
        const name = (f?.name || "").toLowerCase();
        const type = (f?.type || "").toLowerCase();
        const src = f?.dataURL || f?.url || f?.src || "";
        return (
          type.startsWith("image/") ||
          src.startsWith?.("data:image/") ||
          /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(name)
        );
      })
    );
  }

  // dedup by name+size+src (kasus user dobel upload)
  const seen = new Set();
  const uniq = [];
  for (const x of arrs) {
    const key = [
      x?.name || x?.fileName || x?.filename || "",
      x?.size || x?.file?.size || "",
      x?.dataURL || x?.url || x?.src || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(x);
  }
  return uniq;
}

const Grid = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: "0.75rem",
      marginTop: "0.5rem",
    }}
  >
    {children}
  </div>
);
const ImageTile = ({ item, onView, onDownload }) => {
  const [idx, setIdx] = useState(0);
  const candidates = Array.isArray(item.candidates) && item.candidates.length ? item.candidates : [item.src];
  const src = candidates[idx] || item.src;

  const handleError = () => {
    if (idx < candidates.length - 1) {
      if (DEBUG) console.warn("🖼️ Load gagal:", candidates[idx], "→ coba:", candidates[idx + 1]);
      setIdx(idx + 1);
    } else {
      if (DEBUG) console.error("🖼️ Semua kandidat gagal untuk:", item.name, candidates);
    }
  };

  return (
    <div style={{border:"1px solid #ddd",borderRadius:"0.6rem",overflow:"hidden",background:"#fafafa"}}>
      <div style={{width:"100%",aspectRatio:"4/3",background:"#f0f2f5",display:"grid",placeItems:"center",overflow:"hidden"}} title={item.name}>
        {src ? (
          <img
            src={src}
            alt={item.name || "Foto"}
            onError={handleError}
            style={{width:"100%",height:"100%",objectFit:"cover"}}
          />
        ) : (
          <div style={{color:"#888",fontSize:12}}>Tidak ada preview</div>
        )}
      </div>
      <div style={{padding:"0.5rem"}}>
        <div style={{fontSize:"0.8rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={item.name}>
          {item.name || "Unnamed"}
        </div>
        <div style={{display:"flex",gap:6,marginTop:6}}>
          <button onClick={() => onView(src)}>👁️ Lihat</button>
          <button onClick={() => onDownload(src, item.name || "image")}>⬇️ Unduh</button>
        </div>
      </div>
    </div>
  );
};
const DocTile = ({ item, onView, onDownload }) => (
  <div
    style={{
      border: "1px solid #ddd",
      borderRadius: "0.6rem",
      padding: "0.6rem",
      background: "#fbfbff",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>📄</span>
      <div
        style={{
          fontSize: "0.9rem",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={item.name}
      >
        {item.name || "Dokumen"}
      </div>
    </div>
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <button onClick={() => onView(item.src)}>👁️ Lihat</button>
      <button onClick={() => onDownload(item.src, item.name || "dokumen")}>
        ⬇️ Unduh
      </button>
    </div>
  </div>
);

function SectionList({ label, raw, rootData }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    (async () => setItems(await normalizeAny(raw, label, rootData)))();
  }, [raw, rootData]);

  if (!raw || !items.length) {
    return (
      <div style={{ marginBottom: "0.9rem" }}>
        <strong>{label}:</strong> <span style={{ color: "#999" }}>Belum diunggah</span>
      </div>
    );
  }

  const onView = (src) => { if (!src) return; const w = window.open(); if (w) w.location.href = src; };
  const onDownload = (src, name="file") => { if (!src) return; const a = document.createElement("a"); a.href = src; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <strong>{label}:</strong>
      <Grid>
        {items.map((it, idx) =>
          isImage(it) ? (
            <ImageTile key={idx} item={it} onView={onView} onDownload={onDownload} />
          ) : (
            <DocTile key={idx} item={it} onView={onView} onDownload={onDownload} />
          )
        )}
      </Grid>
    </div>
  );
}

/* =================== PARENT =================== */
export default function FileDetailModal({ open, data, onClose }) {
  const [fotoList, setFotoList] = useState([]);

  // Debug sekali tiap data berubah
  useEffect(() => {
    if (!DEBUG || !data) return;
    const rows = scanUploads(data);
    console.groupCollapsed("🧭 FileDetailModal: Deteksi Uploads");
    console.log(
      "Template:",
      data.template,
      "| Jenis:",
      data.jenisSurvei || data.jenisSurveyLabel || data.sifatCidera
    );
    if (!rows.length)
      console.warn(
        "Tidak terdeteksi unggahan berformat file/foto/pdf di data ini."
      );
    else {
      console.table(rows);
      const presentKeys = [...new Set(rows.map((r) => r.key))];
      console.log("🔑 Kunci terdeteksi:", presentKeys.join(", "));
      console.log(
        "🖼️ Sumber gambar:",
        rows.filter((r) => r.kind === "image").map((r) => r.path)
      );
      console.log(
        "📄 Sumber PDF   :",
        rows.filter((r) => r.kind === "pdf").map((r) => r.path)
      );
    }
    console.groupEnd();
  }, [data]);

  // Foto untuk kunjungan/LL
  useEffect(() => {
    if (!data) {
      setFotoList([]);
      return;
    }

    // kumpulkan semua kandidat foto
    const rawCandidates = collectPhotoSources(data);

    if (DEBUG) {
      console.groupCollapsed("📸 Foto Candidates (kunjungan/LL)");
      console.log("Jumlah kandidat:", rawCandidates.length);
      console.table(
        rawCandidates.map((f, i) => ({
          i,
          name: f?.name || f?.file?.name || "-",
          type: f?.type || f?.file?.type || "-",
          hasDataURL: !!f?.dataURL,
          hasURL: !!f?.url,
          hasSrc: !!f?.src,
          isFile: f instanceof File,
        }))
      );
      console.groupEnd();
    }

    (async () => {
      // titipkan data ke global sementara buat SectionList
      window.__FDM_ROOTDATA__ = data;
      const normalized = await normalizeAny(rawCandidates, "Foto", data);
      setFotoList(normalized);
    })();
  }, [data]); // <— penting: tergantung 'data', bukan JSON.stringify

  if (!open || !data) return null;

  const mdMap = [
    { key: "ktp", label: "KTP Korban" },
    { key: "kk", label: "Kartu Keluarga" },
    { key: "bukuTabungan", label: "Buku Tabungan" },
    { key: "formPengajuan", label: "Form Pengajuan Santunan" },
    { key: "formKeteranganAW", label: "Form Keterangan Ahli Waris" },
    { key: "skKematian", label: "Surat Keterangan Kematian" },
    { key: "aktaKelahiran", label: "Akta Kelahiran" },
    { key: "lhsFile", label: "Laporan Hasil Survei (LHS)" },
    { key: "fotoSurvey", label: "Foto Survei Kecelakaan" },
  ];
  const srcData = {
    ktp: data.ktp || data.attachSurvey?.ktp,
    kk: data.kk || data.attachSurvey?.kk,
    bukuTabungan: data.bukuTabungan || data.attachSurvey?.bukuTabungan,
    formPengajuan: data.formPengajuan || data.attachSurvey?.formPengajuan,
    formKeteranganAW:
      data.formKeteranganAW || data.attachSurvey?.formKeteranganAW,
    skKematian: data.skKematian || data.attachSurvey?.skKematian,
    aktaKelahiran: data.aktaKelahiran || data.attachSurvey?.aktaKelahiran,
    lhsFile: data.lhsFile || data.attachSurvey?.lhsFile,
    fotoSurvey: data.attachSurvey?.fotoSurvey || data.fotoSurveyList || [],
  };
  // boolean sederhana, tidak perlu useMemo
  const isSurveyMeninggal = mdMap.some(({ key }) => !!srcData[key]);

  const onCloseClick = (e) => {
    e.stopPropagation();
    onClose?.();
  };

  // --- DETEKSI JENIS FORM ---
  const template = (data.template || "").toLowerCase();
  const sifat = (
    data.sifatCidera ||
    data.jenisSurvei ||
    data.jenisSurveyLabel ||
    ""
  ).toLowerCase();

  // Heuristik ada dokumen wajib MD?
  const mdKeys = [
    "ktp",
    "kk",
    "bukuTabungan",
    "formPengajuan",
    "formKeteranganAW",
    "skKematian",
    "aktaKelahiran",
    "lhsFile",
  ];
  const hasAnyMD = mdKeys.some((k) => !!srcData[k]);

  let formType = "unknown";
  /**
   * Prioritas:
   * - template "kunjungan" -> kunjungan_rs
   * - survey + (MD/meninggal) -> survey_md
   * - survey + (LL/luka) -> survey_ll
   * - fallback: kalau ada dokumen MD -> survey_md
   * - selain itu -> anggap kunjungan/LL (foto saja)
   */
  if (template.includes("kunjungan")) {
    formType = "kunjungan_rs";
  } else if (sifat.includes("md") || sifat.includes("meninggal")) {
    formType = "survey_md";
  } else if (sifat.includes("ll") || sifat.includes("luka")) {
    formType = "survey_ll";
  } else if (hasAnyMD) {
    formType = "survey_md";
  } else {
    // fallback: kalau hanya ada foto ya anggap kunjungan/LL
    formType = "kunjungan_rs";
  }

  if (DEBUG) {
    console.log("🧭 Ditentukan formType:", formType, {
      template: data.template,
      sifat: data.sifatCidera,
    });
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onCloseClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "1rem",
          width: "90%",
          maxWidth: 900,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.25rem",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "#fff",
            paddingBottom: 8,
          }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0 }}>
            📁 Detail Berkas
          </h2>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Klik <b>Lihat</b> untuk membuka tab baru, atau <b>Unduh</b> untuk
            menyimpan file.
          </p>
          <hr
            style={{ border: 0, borderTop: "1px solid #eee", marginTop: 8 }}
          />
        </div>

        {/* === RENDER SESUAI TIPE FORM === */}
        {formType === "survey_md" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Dokumen wajib + fotoSurvey */}
            {mdMap.map(({ key, label }) => (
              <SectionList key={key} label={label} raw={srcData[key]} rootData={data}/>
            ))}

            {/* (Opsional) tampilkan hasilFormFile kalau ada */}
            {!!data.hasilFormFile && (
              <SectionList
                label="Hasil Formulir Survei (HTML)"
                raw={data.hasilFormFile}
                rootData={data}
              />
            )}
          </div>
        )}

        {(formType === "kunjungan_rs" || formType === "survey_ll") && (
          <section style={{ marginBottom: "0.5rem" }}>
            <h3 style={{ fontWeight: 600, margin: "0 0 0.4rem" }}>
              {formType === "kunjungan_rs"
                ? "📷 Foto Survey / Kunjungan RS"
                : "📷 Foto Survey (Luka-luka)"}
            </h3>

            {/* Foto dari sumber apa pun: data.fotoSurveyList atau attachSurvey.fotoSurvey */}
            {fotoList.length ? (
              <Grid>
                {fotoList.map((it, i) =>
                  isImage(it) ? (
                    <ImageTile
                      key={i}
                      item={it}
                      onView={(src) => {
                        const w = window.open();
                        if (w) w.location.href = src;
                      }}
                      onDownload={(src, name) => {
                        const a = document.createElement("a");
                        a.href = src;
                        a.download = name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                    />
                  ) : (
                    <DocTile
                      key={i}
                      item={it}
                      onView={(src) => {
                        const w = window.open();
                        if (w) w.location.href = src;
                      }}
                      onDownload={(src, name) => {
                        const a = document.createElement("a");
                        a.href = src;
                        a.download = name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                      }}
                    />
                  )
                )}
              </Grid>
            ) : (
              <p style={{ color: "#666", margin: 0 }}>Tidak ada foto</p>
            )}

            {/* (Opsional) tampilkan hasilFormFile kalau ada (Kunjungan/LL juga bisa punya file HTML hasil cetak) */}
            {!!data.hasilFormFile && (
              <div style={{ marginTop: "1rem" }}>
                <SectionList
                  label="Hasil Formulir (HTML)"
                  raw={data.hasilFormFile}
                />
              </div>
            )}
          </section>
        )}

        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              cursor: "pointer",
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
            }}
          >
            ✕ Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
