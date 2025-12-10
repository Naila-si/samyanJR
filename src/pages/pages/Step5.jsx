import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

const toDateOnly = (v) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d)) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

async function kirimKeSupabase(formData) {
  const slugByLabel = {
    "Keterjaminan Korban": "keterjaminan",
    "Keabsahan Ahli Waris": "keabsahan_waris",
    "Keabsahan Biaya Perawatan": "keabsahan_biaya",
    "Lainnya": "lainnya",
  };
  const labelBySlug = {
    keterjaminan: "Keterjaminan Korban",
    keabsahan_waris: "Keabsahan Ahli Waris",
    keabsahan_biaya: "Keabsahan Biaya Perawatan",
    lainnya: formData.jenisSurveiLainnya || "Lainnya",
  };

  const template = formData.template; // "kunjungan_rs" | "survei_ll" | "survei_md"
  const isSurvey = template?.startsWith("survei_");

  // hitung jumlah berkas sebagai ANGKA (kalau kolom 'berkas' di DB numerik)
  const berkasCount = Array.isArray(formData.attachList)
    ? formData.attachList.length
    : (typeof formData.berkas === "number" ? formData.berkas : null);

  // siapkan payload dasar (kolom umum)
  const base = {
    local_id: formData.localId || null,
    waktu: formData.waktu ?? new Date().toISOString(), // timestamptz
    template,
    korban: formData.korban ?? formData.namaKorban ?? null,
    petugas: formData.petugas ?? formData.petugasSurvei ?? null,
    tanggalKecelakaan: toDateOnly(formData.tanggalKecelakaan ?? formData.tglKecelakaan),
    status: formData.status ?? "terkirim",
    rating: (formData.rating === 0 || formData.rating) ? Number(formData.rating) : null,
    feedback: formData.feedback ?? null,
  };

  // kalau SURVEI: tambahkan field survei
  let surveyFields = {};
  if (isSurvey) {
    // normalisasi jenis_survei ke slug
    let jenisSurveiSlug = formData.jenisSurvei || null;
    if (jenisSurveiSlug && slugByLabel[jenisSurveiSlug]) {
      jenisSurveiSlug = slugByLabel[jenisSurveiSlug]; // kalau user kirim label
    }
    const allowed = ["keterjaminan", "keabsahan_waris", "keabsahan_biaya", "lainnya"];
    if (jenisSurveiSlug && !allowed.includes(jenisSurveiSlug)) {
      jenisSurveiSlug = "lainnya";
    }

    const jenisSurveyLabel =
      formData.jenisSurveyLabel ??
      (jenisSurveiSlug ? labelBySlug[jenisSurveiSlug] : null);

    surveyFields = {
      noPL: formData.noPL ?? formData.noBerkas ?? formData.noLP ?? null,
      jenisSurvei: jenisSurveiSlug,        
      jenisSurveyLabel: jenisSurveyLabel, 
    };
  }

  // gabung base + surveyFields
  const record = { ...base, ...(isSurvey ? surveyFields : {}) };

  // buang undefined agar bersih
  Object.keys(record).forEach((k) => record[k] === undefined && delete record[k]);

  console.log("📤 Payload ke Supabase:", record);

  // ===== INSERT =====
  const { error } = await supabase
    .from("dataform")
    .upsert([record], { onConflict: "local_id" });

  if (error) {
    console.error("❌ Supabase upsert error detail:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    alert("Gagal simpan ke server 🙏");
    return false;
  }

  console.log("✅ Tersimpan di Supabase");
  return true;
}

/* ============================================
   DATA
============================================ */
const faces = [
  { v: 1, label: "😖", text: "Sedih banget" },
  { v: 2, label: "😟", text: "Kurang puas" },
  { v: 3, label: "🙂", text: "Biasa aja" },
  { v: 4, label: "😊", text: "Puas" },
  { v: 5, label: "🤩", text: "Suka banget!" },
];

function getListSafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed]; // 🔧 self-heal
    return [];
  } catch {
    return [];
  }
}

// Cuma coba simpan, kalau gagal (quota) balikin false dan JANGAN ubah data lama
function tryWriteWhole(key, nextArr) {
  try {
    localStorage.setItem(key, JSON.stringify(nextArr));
    return true;
  } catch (e) {
    console.warn("Gagal setItem (kemungkinan quota):", e);
    return false;
  }
}

// Append-only: baca lama → push baru → tulis → kalau gagal, batalkan
function appendRecord(key, rec) {
  let base = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) base = parsed;
      else if (parsed && typeof parsed === "object") base = [parsed]; // 🔧 self-heal
    }
  } catch {
    base = [];
  }

  const nextArr = [...base, rec];

  try {
    localStorage.setItem(key, JSON.stringify(nextArr));
    return { ok: true, len: nextArr.length };
  } catch (e) {
    console.warn("Gagal setItem (kemungkinan quota):", e);
    return { ok: false, len: base.length };
  }
}

function sanitizeRecordForStorage(rec) {
  const MAX_INLINE_LEN = 2000; // jaga-jaga: string terlalu panjang juga dipotong

  const stripString = (s) => {
    if (typeof s !== "string") return s;
    if (s.startsWith("data:")) return undefined; // buang base64 besar
    if (s.length > MAX_INLINE_LEN && !/^https?:\/\//.test(s)) {
      // potong string panjang non-URL (biar gak bengkak)
      return s.slice(0, MAX_INLINE_LEN);
    }
    return s;
  };

  const stripFile = (f) => {
    if (!f) return f;
    if (typeof f === "string") return stripString(f);

    // objek file-ish
    const {
      dataURL,
      file, // buang yang berat
      preview, // kadang libs taruh thumbnail base64 di sini
      ...rest
    } = f;

    // bersihkan properti string yang bisa menyimpan data base64
    ["src", "url", "path"].forEach((k) => {
      if (k in rest) rest[k] = stripString(rest[k]);
    });

    // singkatkan candidates (hapus yang "data:")
    if (Array.isArray(rest.candidates)) {
      rest.candidates = rest.candidates.map(stripString).filter(Boolean);
    }

    return rest;
  };

  const deep = (v) => {
    if (!v) return v;
    if (v instanceof File || v instanceof Blob) return undefined;
    if (typeof v === "string") return stripString(v);
    if (Array.isArray(v)) return v.map(deep);
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        // khusus beberapa kunci yang sering berat → pakai stripFile
        if (["fotoSurveyList", "laporanRSList", "hasilFormFile"].includes(k)) {
          out[k] = Array.isArray(val) ? val.map(stripFile) : stripFile(val);
        } else if (k === "attachSurvey") {
          if (val && typeof val === "object") {
            const inner = {};
            for (const [kk, vv] of Object.entries(val)) {
              inner[kk] = Array.isArray(vv) ? vv.map(stripFile) : stripFile(vv);
            }
            out[k] = inner;
          } else {
            out[k] = val;
          }
        } else if (k === "attachList") {
          // ringankan attachList
          out[k] = Array.isArray(val)
            ? val.map(({ name, size = 0, key, type }) => ({
                name,
                size,
                key,
                type,
              }))
            : undefined;
        } else {
          out[k] = deep(val);
        }
      }
      return out;
    }
    return v;
  };

  return deep(rec);
}

function trySaveNoDelete(key, valueObj) {
  try {
    localStorage.setItem(key, JSON.stringify(valueObj));
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e };
  }
}

function shrinkRecordOnce(rec) {
  const MAX = 500; // potong string non-URL jadi 500 char

  const trimStr = (s) => {
    if (typeof s !== "string") return s;
    if (s.startsWith("data:")) return undefined; // buang base64
    if (!/^https?:\/\//.test(s) && s.length > MAX) return s.slice(0, MAX);
    return s;
  };

  const walk = (v) => {
    if (!v) return v;
    if (v instanceof File || v instanceof Blob) return undefined;
    if (typeof v === "string") return trimStr(v);
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        // singkatkan fields umum yang sering besar
        if (["src", "url", "path", "preview"].includes(k)) {
          out[k] = trimStr(val);
          continue;
        }
        if (k === "candidates" && Array.isArray(val)) {
          out[k] = val.map(trimStr).filter(Boolean);
          continue;
        }
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };

  return walk(rec);
}

/* ============================================
   MAIN
============================================ */
export default function Step5({ data = {}, setData, back, setStep }) {
  const setRating = (v) => setData?.({ ...data, rating: v });
  const [burstKey, setBurstKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const showKawaiiAlert = (text, type = "success") => {
    const msg = document.createElement("div");
    msg.textContent = type === "success" ? `✨ ${text} 💖` : `💔 ${text} 😢`;

    Object.assign(msg.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      background: type === "success" ? "#ffe6f1" : "#ffd6d6",
      color: type === "success" ? "#e94e77" : "#b80000",
      padding: "14px 20px",
      borderRadius: "20px",
      boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
      fontFamily: "'Poppins', sans-serif",
      fontWeight: "500",
      fontSize: "15px",
      zIndex: 9999,
      animation: "popIn 0.4s ease",
    });

    // tambahkan ke body
    document.body.appendChild(msg);

    // otomatis hilang dalam 2.5 detik
    setTimeout(() => {
      msg.style.transition = "opacity 0.6s, transform 0.6s";
      msg.style.opacity = "0";
      msg.style.transform = "translateY(10px)";
      setTimeout(() => msg.remove(), 600);
    }, 2500);
  };

  const handleSubmit = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      console.log("📦 Sebelum simpan:", localStorage.getItem("formDataList"));

      // self-heal kalau formDataList masih object
      try {
        const raw0 = localStorage.getItem("formDataList");
        if (raw0) {
          const parsed0 = JSON.parse(raw0);
          if (parsed0 && !Array.isArray(parsed0) && typeof parsed0 === "object") {
            localStorage.setItem("formDataList", JSON.stringify([parsed0]));
          }
        }
      } catch {}

      const sifatStr = `${data.sifatCidera || ""} ${data.jenisSurvei || ""} ${
        data.jenisSurveyLabel || ""
      }`;

      const hasLL = /(?:\bll\b|luka)/i.test(sifatStr);
      const hasMD = /(?:\bmd\b|meninggal)/i.test(sifatStr);

      const inferredTemplate =
        data.template ||
        (hasLL ? "survei_ll" : hasMD ? "survei_md" : "kunjungan_rs");

      const labelBySlug = {
        keterjaminan: "Keterjaminan Korban",
        keabsahan_waris: "Keabsahan Ahli Waris",
        keabsahan_biaya: "Keabsahan Biaya Perawatan",
        lainnya: data.jenisSurveiLainnya || "Lainnya",
      };
      const jenisSurveiSlug = data.jenisSurvei || null;
      const jenisSurveyLabel =
        data.jenisSurveyLabel ||
        (jenisSurveiSlug ? labelBySlug[jenisSurveiSlug] : null);

      const newDataRaw = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        waktu: new Date().toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        jenisSurvei: jenisSurveiSlug,
        jenisSurveyLabel,
        status: "terkirim",
        template: inferredTemplate,
        att: data.att || {},
        fotoSurveyList: data.fotoSurveyList || [],
        laporanRSList: data.laporanRSList || [],
      };

      if (data.hasilFormFile) newDataRaw.hasilFormFile = data.hasilFormFile;

      const mergedAttach = {
        ...(data.attachSurvey || {}),
        fotoSurveyList: data.fotoSurveyList || [],
        laporanRSList: data.laporanRSList || [],
        hasilFormFile: data.hasilFormFile ? [data.hasilFormFile] : [],
      };

      newDataRaw.attachSurvey = {
        fotoSurvey: data.fotoSurveyList || [],
        laporanRS: data.laporanRSList || [],
        hasilFormFile: data.hasilFormFile ? [data.hasilFormFile] : [],
      };

      newDataRaw.attachList = Object.entries(mergedAttach).flatMap(([k, v]) =>
        Array.isArray(v)
          ? v.map((f) => ({
              key: k,
              name: f?.name || f?.fileName || f?.filename || k,
              type: f?.type || f?.file?.type || undefined,
            }))
          : v
          ? [{ key: k, name: v.name || k, size: v.size || 0 }]
          : []
      );

      const newData = sanitizeRecordForStorage(newDataRaw);

      const res = appendRecord("formDataList", newData);
      if (!res.ok) {
        alert("Penyimpanan penuh. Data lama tetap aman ya 💖");
        return;
      }

      localStorage.setItem("formDataLastId", newData.id);

      // kirim ke server cuma sekali
      const okInsert = await kirimKeSupabase({
        localId: newData.id,
        waktu: new Date().toISOString(),
        template: inferredTemplate,
        jenisSurvei: data.jenisSurvei,
        jenisSurveyLabel: data.jenisSurveyLabel,
        noPL: data.noPL || data.noBerkas || data.noLP,
        korban: data.korban || data.namaKorban,
        petugas: data.petugas || data.petugasSurvei,
        tanggalKecelakaan: data.tanggalKecelakaan || data.tglKecelakaan,
        attachList: newData.attachList,
        status: "terkirim",
        rating: data.rating,
        feedback: data.feedback,
      });

      if (!okInsert) {
        showKawaiiAlert("Gagal simpan ke server, data masih aman di local 😭", "error");
        return;
      }

      // sukses → bersihkan local
      localStorage.removeItem("formDataList");
      localStorage.removeItem("formDataLastId");
      localStorage.removeItem("draftForm");

      const resetByTemplate = (tpl) =>
        String(tpl || "").startsWith("survei_")
          ? {
              sifatCidera: "",
              jenisSurvei: "",
              jenisSurveiLainnya: "",
              uraianSurvei: "",
              kesimpulanSurvei: "",
              attachSurvey: {},
              fotoSurveyList: [],
            }
          : {
              uraianKunjungan: "",
              rekomendasi: "",
              laporanRSList: [],
              hasilFormFile: null,
            };

      setData((prev) => ({
        ...prev,
        template: "",
        rating: 0,
        feedback: "",
        ...resetByTemplate(inferredTemplate),
      }));

      setStep(1);
      setData({
        petugas: "",
        wilayah: "",
        korban: "",
        lokasiKecelakaan: "",
        rumahSakit: "",
        tanggalKecelakaan: "",
        tglMasukRS: "",
        tglJamNotifikasi: "",
        tglJamKunjungan: "",
        uraianKunjungan: "",
        rekomendasi: "",
        fotoSurveyList: [],
        laporanRSList: [],
        hasilFormFile: null,
        rating: 0,
        feedback: "",
        template: "",
      });

      showKawaiiAlert("Data berhasil disimpan!", "success");
    } catch (err) {
      console.error("❌ Gagal menyimpan data:", err);
      showKawaiiAlert("Gagal menyimpan data 😭", "error");
    } finally {
      setSaving(false);
    }
  }, [data, saving, setData, setStep]);

  const caption = useMemo(() => {
    const f = faces.find((x) => x.v === data.rating);
    return f ? f.text : "Pilih salah satu ya~";
  }, [data.rating]);

  const onSubmit = () => {
    if (!data.rating) {
      alert("Pilih rating dulu ya~ (｡•́︿•̀｡)");
      return;
    }

    jellyChime();
    setBurstKey((k) => k + 1);

    // 🔒 backup mentah sebelum write-all (buat rollback kalau gagal)
    const BK_RAW = localStorage.getItem("formDataList");

    const existing = getListSafe("formDataList"); // self-heal: objek→array, kalau gagal parse → []
    const targetId = localStorage.getItem("formDataLastId");

    // 🛡️ Jika gagal parse (existing kosong), JANGAN overwrite array kosong.
    if (!existing.length) {
      console.warn(
        "[rating] existing kosong (parse gagal?) → hindari overwrite, fallback append-only."
      );
      appendRecord("formDataList", {
        id: crypto.randomUUID(),
        rating: data.rating,
        feedback: data.feedback || "",
        waktu: new Date().toISOString(),
        status: "rating-only",
      });

      setTimeout(() => {
        alert("Arigatou~ Rating & feedback terkirim! 💖");
      }, 250);
      return;
    }

    // cari index record yg barusan disimpan
    let idx = existing.findIndex((x) => x && x.id === targetId);
    if (idx < 0) idx = existing.length - 1; // fallback aman: elemen terakhir

    if (idx >= 0) {
      const next = existing.slice();
      next[idx] = {
        ...next[idx],
        rating: data.rating,
        feedback: data.feedback || "",
        updatedAt: new Date().toISOString(),
      };

      // 📝 tulis ulang array — tapi aman: rollback kalau gagal
      const ok = tryWriteWhole("formDataList", next);
      if (!ok) {
        console.warn("[rating] write-all gagal → rollback backup");
        if (BK_RAW != null) localStorage.setItem("formDataList", BK_RAW);
        alert("Penyimpanan penuh saat update rating. Data utama aman kok 💖");
        return;
      }
    } else {
      // benar2 tidak ketemu → append saja tanpa overwrite (non-destruktif)
      appendRecord("formDataList", {
        id: crypto.randomUUID(),
        rating: data.rating,
        feedback: data.feedback || "",
        waktu: new Date().toISOString(),
        status: "rating-only",
      });
    }

    setTimeout(() => {
      alert("Arigatou~ Rating & feedback terkirim! 💖");
    }, 250);
  };

  return (
    <div className="kw-wrap container">
      <KawaiiStyles />
      <Sakura />
      <Decor />

      {/* HERO */}
      <div className="kw-card kw-hero">
        <span className="kw-sticker">uwu</span>
        <div className="kw-hero-title">
          <span className="kw-glow">✨ Terima kasih! 🎀</span>
        </div>
        <div className="kw-hero-sub">
          Dokumen kamu sudah kami terima. Boleh dong kasih penilaian
          pengalamanmu hari ini~
        </div>
        <div className="kw-mascot" aria-hidden="true">
          🧋
        </div>
      </div>

      {/* RATING */}
      <div className="kw-card">
        <div className="kw-section-title">Seberapa puas kamu? (kyaaa~)</div>

        <div className="kw-faces">
          {faces.map((f) => (
            <button
              key={f.v}
              className={`kw-face ${data.rating === f.v ? "active" : ""}`}
              onClick={() => setRating(f.v)}
              type="button"
              aria-label={`rating-${f.v}`}
              title={f.text}
            >
              <span className="kw-emoji">{f.label}</span>
              <span className="kw-sparkles" aria-hidden="true">
                ✨
              </span>
            </button>
          ))}
        </div>

        <Hearts value={data.rating || 0} />
        <div className="kw-caption">{caption}</div>
      </div>

      {/* FEEDBACK */}
      <div className="kw-card">
        <label className="kw-label">Pesan untuk tim kami (opsional)</label>

        <div className="kw-letter">
          <div className="kw-tape tl" />
          <div className="kw-tape tr" />
          <textarea
            className="kw-textarea"
            rows={5}
            placeholder="Tulis kesan/masukan manis di sini… (kami baca semuanya! 💌)"
            value={data.feedback || ""}
            onChange={(e) => setData?.({ ...data, feedback: e.target.value })}
          />
          <span className="kw-tail" />
        </div>

        <div className="kw-help">
          Pujian, kritik lembut, atau saran manis diterima~
        </div>
      </div>

      {/* ACTIONS */}
      <div className="kw-actions">
        <button
          className="kw-btn kw-btn-ghost"
          type="button"
          onClick={() => back?.()}
        >
          ⬅️ Kembali ke awal
        </button>

        <button
          className="kw-btn kw-btn-green"
          type="button"
          onClick={() => handleSubmit?.()}
        >
          💾 Simpan Laporan
        </button>

        {/* <button
          className="kw-btn kw-btn-red"
          type="button"
          onClick={() => {
            localStorage.removeItem("formDataList");
            alert("LocalStorage sudah dikosongkan!");
          }}
        >
          🗑️ Kosongkan LocalStorage
        </button> */}
      </div>

      {/* Confetti emoji saat submit */}
      <Confetti key={burstKey} trigger={burstKey} />
    </div>
  );
}

/* ============================================
   HEART METER
============================================ */
function Hearts({ value = 0 }) {
  const arr = Array.from({ length: 5 }, (_, i) => i < value);
  return (
    <div className="kw-hearts" aria-hidden="true">
      {arr.map((on, i) => (
        <span key={i} className={`h ${on ? "on" : ""}`}>
          💗
        </span>
      ))}
    </div>
  );
}

/* ============================================
   CONFETTI EMOJI
============================================ */
function Confetti({ trigger }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const shapes = ["💖", "✨", "🎀", "🌸", "🧋", "⭐", "💫", "💕"];
    const arr = Array.from({ length: 34 }).map((_, i) => ({
      id: `${trigger}-${i}`,
      emoji: shapes[(Math.random() * shapes.length) | 0],
      left: Math.random() * 100,
      dur: 2200 + Math.random() * 2000,
      delay: Math.random() * 260,
      rot: (Math.random() * 60 - 30) | 0,
      size: 18 + Math.random() * 14,
    }));
    setItems(arr);
    const t = setTimeout(() => setItems([]), 3600);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    <div className="kw-confetti" aria-hidden="true">
      {items.map((it) => (
        <span
          key={it.id}
          style={{
            left: `${it.left}%`,
            animationDuration: `${it.dur}ms`,
            animationDelay: `${it.delay}ms`,
            fontSize: `${it.size}px`,
            rotate: `${it.rot}deg`,
          }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  );
}

/* ============================================
   SAKURA DRIFT (subtle background)
============================================ */
function Sakura() {
  const [petals] = useState(() =>
    Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 10 + Math.random() * 14,
      dur: 9000 + Math.random() * 5000,
      delay: Math.random() * 4000,
      rot: Math.random() * 360,
    }))
  );
  return (
    <div className="kw-sakura" aria-hidden="true">
      {petals.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.8,
            animationDuration: `${p.dur}ms`,
            animationDelay: `${p.delay}ms`,
            rotate: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

/* ============================================
   DECOR RINGS
============================================ */
function Decor() {
  return (
    <div className="kw-decor" aria-hidden="true">
      <div className="kw-bubble b1" />
      <div className="kw-bubble b2" />
      <div className="kw-bubble b3" />
      <div className="kw-ribbon" />
    </div>
  );
}

/* ============================================
   CHIME (tanpa file audio)
============================================ */
function jellyChime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g).connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.02);
    o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
    o.stop(ac.currentTime + 0.26);
  } catch {}
}

/* ============================================
   STYLES (namespaced)
============================================ */
function KawaiiStyles() {
  return (
    <style>{`
:root{
  --kw-ink:#2a1f24;
  --kw-muted:#7a2a3b;
  --kw-pink:#F7C7C4;
  --kw-pink-strong:#E59E9A;
  --kw-ring:#FBE6E5;
  --kw-ring2:#F3D1CF;
  --kw-white:#fff;
  --kw-mint:#d5fff4;
}

.kw-wrap{
  color:var(--kw-ink);
  position:relative;
  padding:clamp(12px,3.5vw,22px);
  overflow:hidden;
  font-family: ui-rounded, system-ui, -apple-system, "Segoe UI", "Nunito", "Quicksand", sans-serif;
  background:
    radial-gradient(1100px 540px at -10% -10%, #fff7fb 0%, #fff 60%) no-repeat,
    radial-gradient(900px 520px at 110% 10%, #fff3f6 0%, #ffffff 60%) no-repeat;
}

/* subtle sakura */
.kw-sakura{ position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:0; }
.kw-sakura span{
  position:absolute; top:-8%; background:radial-gradient(circle at 30% 30%, #ffc1d4 35%, #ffdeea 36% 60%, transparent 61%);
  border-radius:60% 40% 60% 40%;
  filter: blur(.2px) drop-shadow(0 2px 1px rgba(255,182,193,.6));
  animation:kw-sakura-fall linear infinite;
  opacity:.6;
}
@keyframes kw-sakura-fall {
  0% { transform: translateY(-10%) translateX(0) rotate(0deg); }
  50%{ transform: translateY(55vh) translateX(14px) rotate(180deg); }
  100%{ transform: translateY(110vh) translateX(-10px) rotate(360deg); }
}

/* decor rings */
.kw-decor .kw-bubble{ position:absolute; border-radius:50%; filter:blur(18px); opacity:.45; pointer-events:none; z-index:0 }
.kw-decor .b1{ width:240px; height:240px; background:#ffe3ea; top:-60px; right:-40px }
.kw-decor .b2{ width:170px; height:170px; background:#ffd8e2; bottom:12%; left:-60px }
.kw-decor .b3{ width:130px; height:130px; background:#ffeef3; bottom:-50px; right:12% }
.kw-decor .kw-ribbon{
  position:absolute; inset:auto -40px 28% -40px; height:20px;
  background:repeating-linear-gradient(90deg,#ffdbe2 0 24px,#ffeef2 24px 48px);
  border-radius:999px; opacity:.25; pointer-events:none; z-index:0;
}

/* cards */
.kw-card{
  position:relative; z-index:1;
  background:var(--kw-white);
  border:2px solid var(--kw-ring2);
  border-radius:22px;
  padding:clamp(14px,2.2vw,18px);
  box-shadow:0 12px 28px rgba(247,199,196,.28);
  margin-bottom:14px;
}
.kw-card:after{
  content:""; position:absolute; inset:-1.5px; border-radius:24px;
  background:linear-gradient(135deg,rgba(255,255,255,.7),rgba(255,255,255,0));
  pointer-events:none; mix-blend-mode:soft-light; border:1px solid rgba(255,255,255,.4);
}

.kw-hero{
  text-align:center;
  background:linear-gradient(180deg,#fff6fa 0%, #fff 65%);
  border-color:#ffd1de;
}
.kw-hero-title{ font-size:clamp(22px,3.6vw,30px); font-weight:900; color:#d23a6a }
.kw-glow{
  background:linear-gradient(90deg,#ff8fb1,#d23a6a 60%,#ffb4cf);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 2px 0 rgba(255,255,255,.6);
}
.kw-hero-sub{ margin-top:6px; color:var(--kw-muted) }
.kw-mascot{ position:absolute; right:12px; bottom:10px; font-size:44px; opacity:.95; animation:kw-float 3s ease-in-out infinite }
@keyframes kw-float { 0%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } 100%{ transform:translateY(0) } }
.kw-sticker{
  position:absolute; top:-10px; left:-10px; background:#fff; padding:6px 10px;
  border:2px dashed #ff9ab3; border-radius:14px; rotate:-6deg; font-weight:900; color:#d23a6a; box-shadow:0 6px 14px rgba(248,186,197,.35)
}

/* titles */
.kw-section-title{ font-weight:900; color:#c33; margin-bottom:10px }

/* faces grid */
.kw-faces{
  display:grid; grid-template-columns:repeat(auto-fit,minmax(74px,1fr)); gap:12px;
}
.kw-face{
  aspect-ratio:1/1; border-radius:22px;
  border:2px solid #f0cbd0;
  background:
    radial-gradient(120% 90% at 30% 20%, #ffffff 0%, #fff7fb 60%),
    linear-gradient(180deg,#fff,#fff);
  box-shadow:
    inset 0 10px 20px rgba(255,255,255,.9),
    0 8px 18px rgba(247,199,196,.35);
  display:grid; place-items:center; font-size:36px;
  position:relative; overflow:hidden; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
.kw-face:hover{ transform: translateY(-2px) }
.kw-face:active{ transform: scale(.98) }
.kw-face.active{
  border-color:#f3a7af;
  box-shadow:0 14px 30px rgba(243,167,175,.55), inset 0 0 0 4px #fff;
  animation: kw-pop .18s ease-out;
}
.kw-emoji{ transform: translateY(1px) }
.kw-sparkles{
  position:absolute; right:6px; top:6px; font-size:14px; opacity:.0;
  transition:opacity .2s ease; pointer-events:none;
}
.kw-face.active .kw-sparkles{ opacity:1 }
@keyframes kw-pop { from { transform: scale(.92) } to { transform: scale(1) } }

/* hearts */
.kw-hearts{ display:flex; justify-content:center; gap:6px; margin:10px 0 2px }
.kw-hearts .h{ filter: grayscale(1) opacity(.6); transform:translateY(0) scale(1); transition: all .18s ease }
.kw-hearts .h.on{ filter:none; transform:translateY(-2px) scale(1.06) }

/* caption */
.kw-caption{ margin-top:4px; text-align:center; color:#9b5560; font-weight:800 }

/* letter textarea w/ washi tape */
.kw-label{ font-weight:900; margin-bottom:6px; color:#8a303f }
.kw-letter{
  position:relative; border-radius:18px; background:#fff; border:2px solid var(--kw-ring2);
  box-shadow: 0 12px 26px rgba(247,199,196,.18);
}
.kw-textarea{
  width:100%; padding:14px 16px; border-radius:16px; border:none;
  background:
    repeating-linear-gradient(180deg, #fff 0 28px, #fff 28px 54px),
    linear-gradient(#fff,#fff);
  outline:none; font-size:15.5px; color:var(--kw-ink);
}
.kw-textarea:focus{ box-shadow: inset 0 0 0 3px var(--kw-ring) }
.kw-tail{
  position:absolute; left:18px; bottom:-9px; width:18px; height:18px; background:#fff; border-left:2px solid var(--kw-ring2); border-bottom:2px solid var(--kw-ring2); rotate:45deg; border-bottom-left-radius:6px
}
.kw-tape{
  position:absolute; width:56px; height:16px; background:
    linear-gradient(90deg,#ffe3ea 0,#ffeef3 100%);
  opacity:.9; filter:drop-shadow(0 2px 2px rgba(0,0,0,.06));
  border-radius:4px;
}
.kw-tape.tl{ top:-10px; left:14px; rotate:-10deg }
.kw-tape.tr{ top:-12px; right:16px; rotate:8deg }

.kw-help{ margin-top:8px; font-size:12.5px; color:#9b5560 }

/* actions */
.kw-actions{ display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:10px }
.kw-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:.45rem;
  border-radius:999px; padding:12px 18px; font-weight:900; cursor:pointer; border:2px solid transparent;
  transition: transform .05s ease, filter .15s ease;
  position:relative; overflow:hidden;
}
.kw-btn:before{
  content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,0));
  pointer-events:none; mix-blend-mode:soft-light;
}
.kw-btn:after{
  content:""; position:absolute; top:-60%; left:-20%; width:40%; height:220%;
  background:linear-gradient(90deg, rgba(255,255,255,.9), rgba(255,255,255,0));
  transform:skewX(-20deg); animation:kw-sheen 3.2s linear infinite;
  opacity:.75; pointer-events:none;
}
@keyframes kw-sheen { 0%{ left:-40% } 100%{ left:130% } }

.kw-btn:active{ transform: translateY(1px) }
.kw-btn-ghost{ background:#FFE9E7; border-color:#F3B6B2; color:#6b2a35; box-shadow:0 10px 24px rgba(247,199,196,.2) }
.kw-btn-rose{
  background:linear-gradient(180deg, #ffd4e4 0%, #f7b4c8 100%);
  border-color:#F3B6B2; color:#3b0a1a; box-shadow:0 12px 26px rgba(247,199,196,.35)
}
.kw-btn[disabled]{ filter: saturate(.3) opacity(.7); cursor:not-allowed }

/* confetti */
.kw-confetti{ position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:50 }
.kw-confetti span{ position:absolute; top:-10%; animation:kw-fall linear forwards }
@keyframes kw-fall { 0%{ transform:translateY(-10%) rotate(0); opacity:0 } 10%{ opacity:1 } 100%{ transform:translateY(115vh) rotate(360deg); opacity:0 } }

/* responsive */
@media (max-width:640px){
  .kw-actions{ justify-content:space-between }
}
    `}</style>
  );
}
