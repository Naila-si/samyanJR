import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

async function syncVerificationToSupabase(rec, payload) {
  const TABLES = ["DataForm", "dataform"];
  const nowIso = new Date().toISOString();

  // === coercers utk type safety ===
  const toTs = (v) => (v ? new Date(v).toISOString() : null);           // timestamptz
  const toDate = (v) => {                                               // date (YYYY-MM-DD)
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  const toInt = (v) => (v == null || isNaN(+v) ? null : parseInt(v, 10));
  const toBool = (v) => (v === true || v === false ? v : null);
  const toJSON = (v) => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  };

  // === build 'updates' sesuai aksi verifikasi ===
  let updates;
  switch (payload.action) {
    case "verify":
      updates = {
        verified: true,
        verified_at: toTs(payload.timestamp),
        verify_note: payload.note || null,
        verify_checklist: toJSON(payload.checks),
        status: "diproses",
        updated_at: nowIso,
      };
      break;
    case "unverify":
      updates = {
        verified: false,
        unverified_at: toTs(payload.timestamp),
        unverify_note: payload.note || null,
        status: "terkirim",
        updated_at: nowIso,
      };
      break;
    case "finish":
      updates = {
        finished_at: toTs(payload.timestamp),
        finish_note: payload.note || null,
        status: "selesai",
        updated_at: nowIso,
      };
      break;
    case "reject":
      updates = {
        verified: false,
        rejected_at: toTs(payload.timestamp),
        reject_note: payload.note || null,
        status: "terkirim",
        updated_at: nowIso,
      };
      break;
    default:
      updates = { updated_at: nowIso };
  }

  // === (opsional) kalau kamu memang punya RPC apply_verification ===
  try {
    const { data, error } = await supabase.rpc("apply_verification", {
      p_action: payload.action,
      p_local_id: rec.id ?? null,
      p_note: payload.note ?? null,
      p_checklist: payload.checks ?? null,
    });
    if (error) throw error;
    console.log("✅ RPC apply_verification OK:", data);
    return data;
  } catch (e) {
    console.warn("↪️ RPC skip:", e?.message || e);
  }

  // helper update & upsert
  const updateByLocalId = async (table) =>
    await supabase
      .from(table)
      .update(updates)
      .eq("local_id", rec.id)
      .select("id, local_id");

  const upsertByLocalId = async (table) => {
    // hitung turunan json/int agar pas dgn schema
    const counts = toJSON(rec.counts) || {};
    const files = toJSON(rec.files) || rec.files || null;
    const totalFiles =
      toInt(rec.totalFiles) ??
      (Array.isArray(rec.files) ? rec.files.length : null);

    // rakit payload sesuai kolom kamu
    const row = {
      // --- kunci sinkron ---
      local_id: String(rec.id),

      // --- meta & identitas ---
      waktu: toTs(rec.waktu || rec.createdAt || nowIso),            // timestamptz
      template: rec.template ?? null,                                // text
      jenisSurvei: rec.jenisSurvei ?? null,                          // text
      jenisSurveyLabel: rec.jenisSurveyLabel ?? null,                // text
      noPL: rec.noPL ?? null,                                        // text
      korban: rec.korban ?? null,                                    // text
      petugas: rec.petugas ?? null,                                  // text
      tanggalKecelakaan: toDate(rec.tanggalKecelakaan || rec.tglKecelakaan), // date
      status: updates.status ?? rec.status ?? "terkirim",            // text

      // --- rating & feedback ---
      rating: toInt(rec.rating),
      feedback: rec.feedback ?? null,

      // --- verifikasi ---
      verified: toBool(rec.verified) ?? false,
      verified_at: rec.verifiedAt ? toTs(rec.verifiedAt) : updates.verified_at ?? null,
      verify_note: rec.verifyNote ?? updates.verify_note ?? null,
      verify_checklist: toJSON(rec.verifyChecklist) ?? updates.verify_checklist ?? null,
      unverified_at: rec.unverifiedAt ? toTs(rec.unverifiedAt) : updates.unverified_at ?? null,
      unverify_note: rec.unverifyNote ?? updates.unverify_note ?? null,
      finished_at: rec.finishedAt ? toTs(rec.finishedAt) : updates.finished_at ?? null,
      finish_note: rec.finishNote ?? updates.finish_note ?? null,
      rejected_at: rec.rejectedAt ? toTs(rec.rejectedAt) : updates.rejected_at ?? null,
      reject_note: rec.rejectNote ?? updates.reject_note ?? null,

      // --- file-related ---
      totalFiles,
      counts: Object.keys(counts).length ? counts : null,            // jsonb
      files: files ?? null,                                          // jsonb

      // --- housekeeping ---
      createdAt: toTs(rec.createdAt || rec.waktu || nowIso),         // timestamptz
      updated_at: nowIso,                                            // timestamptz

      // --- kalau kamu punya ownerId (uuid) pass-kan di sini ---
      ownerId: rec.ownerId ?? null,                                  // uuid (nullable)
    };

    // buang key bernilai undefined (biar PostgREST gak ngambek)
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

    return await supabase
      .from(table)
      .upsert(row, { onConflict: "local_id" })
      .select("id, local_id");
  };

  // 1) coba UPDATE by local_id
  for (const t of TABLES) {
    const { data, error } = await updateByLocalId(t);
    if (error) { console.warn(`⚠️ Update ${t} error:`, error); continue; }
    if (data && data.length) { console.log(`✅ Update OK di ${t}`, data); return data; }
  }

  // 2) jika belum ada row → UPSERT
  for (const t of TABLES) {
    const { data, error } = await upsertByLocalId(t);
    if (error) { console.warn(`⚠️ Upsert ${t} error:`, error); continue; }
    if (data && data.length) { console.log(`✅ Upsert OK di ${t}`, data); return data; }
  }

  console.error("❌ Gagal simpan verifikasi (update & upsert gagal).");
  return null;
}

const LS_KEY = "formDataList";
const LS_VERIF = "spa_verifikator_queue";

function getListSafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed]; // self-heal
    return [];
  } catch {
    return [];
  }
}

// tulis ulang seluruh array tapi aman (balik false kalo gagal)
function tryWriteWhole(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
    return true;
  } catch {
    return false;
  }
}

const fmtDT = (d) => {
  if (!d) return "-";
  const x = new Date(d);
  if (isNaN(x)) return d;
  return x.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtD = (d) => {
  if (!d) return "-";
  const x = new Date(d);
  if (isNaN(x)) return d;
  return x.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const BYTES = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

function pickAlias(obj, names = []) {
  if (!obj) return null;
  for (const n of names) {
    if (obj[n] != null && obj[n] !== "") return obj[n];
  }
  return null;
}

function normalizeRemoteRow(row) {
  // Helper: parse JSON jika disimpan sebagai string
  const parseMaybeJson = (v) => {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  };

  // Ada beberapa implementasi menyimpan payload penuh di 1 kolom JSON
  // coba ambil dari 'data' / 'payload' / 'content'
  const blob =
    parseMaybeJson(row.data) ||
    parseMaybeJson(row.payload) ||
    parseMaybeJson(row.content) ||
    row.data || row.payload || row.content || {};

  const rawId =
    row.local_id ?? row.id ?? row.row_id ?? row.uuid ?? null;

  const surrogateId =
    rawId ??
    [
      row.waktu || row.created_at || "t0",
      row.no_pl || (blob && (blob.noPL || blob.no_pl)) || "nop",
      row.template || (blob && blob.template) || "tpl",
    ].join("__");

  // Normalisasi boolean hubungan_sesuai
  const coerceAW = (v) => {
    if (v === true || v === false) return v;
    if (v == null || v === "") return "";
    const s = String(v).trim().toLowerCase();
    if (["ya","y","true","1","sesuai"].includes(s)) return true;
    if (["tidak","tdk","no","n","false","0","tidak sesuai"].includes(s)) return false;
    return "";
  };

  // Ambil lampiran — bisa tersebar di beberapa kolom
  const attachSurvey =
    parseMaybeJson(row.attach_survey) ||
    parseMaybeJson(row.attachSurvey) ||
    parseMaybeJson(row.att) ||   
    parseMaybeJson(row.attachments) ||
    row.attachSurvey ||
    row.att ||
    row.attachments ||
    blob.attachSurvey ||
    {};

  // Beberapa list foto/berkas
  const fotoSurveyList =
    parseMaybeJson(row.foto_survey_list) ||
    row.fotoSurveyList ||
    blob.fotoSurveyList ||
    [];

  const rsList =
    parseMaybeJson(row.rs_list) ||
    row.rsList ||
    blob.rsList ||
    [];

  const fotoList =
    parseMaybeJson(row.foto_list) ||
    row.fotoList ||
    blob.fotoList ||
    [];

  const tglK = pickAlias(
    row,
    [
      "tanggal_kecelakaan",   // snake_case
      "tanggalkecelakaan",    // folded lowercase 
      "tanggalKecelakaan",    // camelCase
      "tgl_kecelakaan",
      "tglkecelakaan",
      "tglKecelakaan",
    ]
  ) ?? pickAlias(blob, [
      "tanggalKecelakaan",
      "tglKecelakaan",
      "tanggal_kecelakaan",
      "tanggalkecelakaan",
      "tgl_kecelakaan",
      "tglkecelakaan",
    ]);

  const hariTgl = pickAlias(row, ["hari_tanggal"]) ??
                  pickAlias(blob, ["hariTanggal", "tanggalKecelakaan"]);

  // Map semua field yang dipakai Detail/Preview
  return {
    // ===== ID/META/STATUS =====
    id: String(surrogateId),
    waktu: row.waktu || row.created_at || blob.waktu || blob.createdAt || null,
    template: row.template || blob.template || null,
    korban: row.korban || blob.korban || null,
    petugas: row.petugas || blob.petugas || null,
    status: row.status || blob.status || "terkirim",

    // ===== SURVEI =====
    noPL: row.no_pl ?? row.noPL ?? blob.noPL ?? null,
    jenisSurveyLabel:
      row.jenis_survey_label ??
      row.jenisSurveyLabel ??
      row.jenis_survei_label ??
      blob.jenisSurveyLabel ??
      blob.jenisSurvei ??
      null,
    jenisSurvei:
      row.jenis_survei ??
      row.jenisSurvei ??
      blob.jenisSurvei ??
      null,

    // tanggal kejadian/survei
    tanggalKecelakaan: tglK,
    hariTanggal: hariTgl,

    // field yang KOSONG DI KAMU:
    noBerkas:
      row.no_berkas ?? row.noBerkas ?? blob.noBerkas ?? null,
    alamatKorban:
      row.alamat_korban ?? row.alamatKorban ?? blob.alamatKorban ?? null,
    tempatKecelakaan:
      row.tempat_kecelakaan ??
      row.tempatKecelakaan ??
      row.lokasi_kecelakaan ??
      row.lokasiKecelakaan ??
      blob.tempatKecelakaan ??
      blob.lokasiKecelakaan ??
      null,
    tglKecelakaan: pickAlias(row, ["tgl_kecelakaan","tglkecelakaan","tglKecelakaan"]) ?? tglK,
    hubunganSesuai:
      coerceAW(row.hubungan_sesuai ?? row.hubunganSesuai ?? blob.hubunganSesuai),

    // narasi survei (LL/MD)
    uraian:
      row.uraian ?? blob.uraian ?? blob.uraianSurvei ?? null,
    kesimpulan:
      row.kesimpulan ?? blob.kesimpulan ?? blob.kesimpulanSurvei ?? null,

    // ===== KUNJUNGAN RS =====
    wilayah:
      row.wilayah ?? blob.wilayah ?? null,
    lokasiKecelakaan:
      row.lokasi_kecelakaan ??
      row.lokasiKecelakaan ??
      blob.lokasiKecelakaan ??
      blob.tempatKecelakaan ??
      null,
    rumahSakit:
      row.rumah_sakit ??
      row.rumahSakit ??
      blob.rumahSakit ??
      null,
    tglMasukRS:
      row.tgl_masuk_rs ?? row.tanggal_masuk_rs ?? blob.tglMasukRS ?? null,
    tglJamNotifikasi:
      row.tgl_jam_notifikasi ?? blob.tglJamNotifikasi ?? null,
    tglJamKunjungan:
      row.tgl_jam_kunjungan ?? blob.tglJamKunjungan ?? null,
    uraianKunjungan:
      row.uraian_kunjungan ?? blob.uraianKunjungan ?? null,
    rekomendasi:
      row.rekomendasi ?? blob.rekomendasi ?? null,

    // ===== LAMPIRAN =====
    attachSurvey,
    fotoSurveyList: Array.isArray(fotoSurveyList) ? fotoSurveyList : [],
    rsList: Array.isArray(rsList) ? rsList : [],
    fotoList: Array.isArray(fotoList) ? fotoList : [],

    // ===== VERIFIKASI =====
    verified: !!(row.verified ?? blob.verified),
    verifiedAt: row.verified_at ?? blob.verifiedAt ?? null,
    verifyNote: row.verify_note ?? blob.verifyNote ?? null,
    verifyChecklist: row.verify_checklist ?? blob.verifyChecklist ?? null,
    unverifiedAt: row.unverified_at ?? blob.unverifiedAt ?? null,
    unverifyNote: row.unverify_note ?? blob.unverifyNote ?? null,

    // ===== RATING/FEEDBACK =====
    rating: row.rating ?? row.rating_value ?? blob.rating ?? blob.rating_value ?? null,
    feedback: row.feedback ?? row.feedback_text ?? row.ulasan ?? blob.feedback ?? blob.feedback_text ?? blob.ulasan ?? null,

    // untuk sorting
    _updatedAt:
      row.updated_at ??
      row.verified_at ??
      row.unverified_at ??
      row.waktu ??
      row.created_at ??
      null,
  };
}

function DetailModal({ open, data, onClose, onPrint }) {
  const modalRef = useRef(null);
  useFocusTrap(open, modalRef);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !data) return null;

  // --- util: detect variant ---
  const getVariant = (d) => {
    const t = (d.template || "").toLowerCase();
    const s = (d.jenisSurvei || d.jenisSurveyLabel || d.sifatCidera || "").toLowerCase();
    if (t.includes("kunjungan")) return "rs";
    if (t.includes("survei_md") || s.includes("meninggal")) return "md";
    if (t.includes("survei_ll") || s.includes("luka")) return "ll";
    return "ll";
  };

  const variant = getVariant(data);

  const fmtDateLong = (d) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch { return d; }
  };

  let pairs;
  if (variant === "rs") {
    pairs = [
      ["ID", data.id],
      ["Waktu Submit", fmtDT(data.createdAt)],
      ["Template", "Kunjungan RS"],
      ["Nama Korban", data.korban || "-"],
      ["NPP/Nama Petugas", data.petugas || "-"],
      ["Wilayah", data.wilayah || "-"],
      ["Lokasi Kecelakaan", data.lokasiKecelakaan || "-"],
      ["Kode/Nama RS", data.rumahSakit || "-"],
      ["Tanggal Kecelakaan", data.tglKecelakaan || fmtD(data.tanggalKecelakaan)],
      ["Tanggal Masuk RS", data.tglMasukRS || "-"],
      ["Tgl/Jam Notifikasi", data.tglJamNotifikasi || "-"],
      ["Tgl/Jam Kunjungan", data.tglJamKunjungan || "-"],
      ["Status", data.status || "terkirim"],
      ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    ];
  } else if (variant === "md") {
    pairs = [
      ["ID", data.id],
      ["Waktu Submit", fmtDT(data.createdAt)],
      ["Template", "Survei Ahli Waris (MD)"],
      ["No. PL", data.noPL || "-"],
      ["Hari/Tanggal Survei", fmtDateLong(data.hariTanggal)],
      ["Petugas Survei", data.petugasSurvei || data.petugas || "-"],
      ["Jenis Survei", data.jenisSurvei || data.jenisSurveyLabel || "Meninggal Dunia"],
      ["Nama Korban", data.namaKorban || data.korban || "-"],
      ["No. Berkas", data.noBerkas || "-"],
      ["Alamat Korban", data.alamatKorban || "-"],
      ["Tempat/Tgl. Kecelakaan", `${data.tempatKecelakaan || "-"} / ${fmtDateLong(data.tglKecelakaan)}`],
      ["Kesesuaian Hubungan AW", 
        data.hubunganSesuai === "" || data.hubunganSesuai == null
          ? "-" : (data.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")
      ],
      ["Status", data.status || "terkirim"],
      ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    ];
  } else {
    pairs = [
      ["ID", data.id],
      ["Waktu Submit", fmtDT(data.createdAt)],
      ["Template", "Survei Ahli Waris (Luka-luka)"],
      ["No. PL", data.noPL || "-"],
      ["Hari/Tanggal Survei", fmtDateLong(data.hariTanggal)],
      ["Petugas Survei", data.petugasSurvei || data.petugas || "-"],
      ["Jenis Survei", data.jenisSurvei || data.jenisSurveyLabel || "Luka-luka"],
      ["Nama Korban", data.namaKorban || data.korban || "-"],
      ["No. Berkas", data.noBerkas || "-"],
      ["Alamat Korban", data.alamatKorban || "-"],
      ["Tempat/Tgl. Kecelakaan", `${data.tempatKecelakaan || "-"} / ${fmtDateLong(data.tglKecelakaan)}`],
      ["Kesesuaian Hubungan AW", 
        data.hubunganSesuai === "" || data.hubunganSesuai == null
          ? "-" : (data.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")
      ],
      ["Status", data.status || "terkirim"],
      ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    ];
  }

  const fileBreakdown = (() => {
    const c = data.counts || {};
    const singles = Array.from({ length: c.singles || 0 }, (_, i) => ({
      label: `Dokumen ${i + 1}`, note: "Berkas tunggal",
    }));
    const fotoSurvey = Array.from({ length: c.fotoSurvey || 0 }, (_, i) => ({
      label: `Foto Survey ${i + 1}`, note: "Foto saat survei",
    }));
    const fotoKejadian = Array.from({ length: c.fotoKejadian || 0 }, (_, i) => ({
      label: `Foto Kejadian ${i + 1}`, note: "Foto TKP/kejadian",
    }));
    if (Array.isArray(data.files) && data.files.length) {
      return data.files.map((f, idx) => ({
        ...f, label: f.label || f.name || `Berkas ${idx + 1}`,
      }));
    }
    return [...singles, ...fotoSurvey, ...fotoKejadian];
  })();

  const styles = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(255, 240, 247, .72)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000, padding: 24, animation: "fadeIn .18s ease-out",
    },
    modal: {
      width: "min(920px,100%)",
      background: "linear-gradient(180deg,#fff,#fff7fb)",
      borderRadius: 18, border: "1px solid #ffd6e7",
      boxShadow: "0 24px 60px rgba(255, 170, 195, .35)",
      maxHeight: "88vh", overflow: "auto",
      transformOrigin: "center", animation: "popIn .18s ease-out",
    },
    head: {
      padding: "14px 18px", borderBottom: "1px solid #ffcade",
      display: "flex", gap: 10, alignItems: "center",
      justifyContent: "space-between", position: "sticky",
      top: 0, background: "linear-gradient(180deg,#fff0f7,#ffe3ef)", zIndex: 1,
    },
    titleWrap: { display: "flex", alignItems: "center", gap: 10 },
    badge: (verified) => ({
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${verified ? "#ffd6d6" : "#c9f2df"}`,
      background: verified ? "#fff7f7" : "#f2fff7",
      color: verified ? "#b10000" : "#007a2e", fontSize: 12, whiteSpace: "nowrap",
    }),
    body: { padding: 18, display: "grid", gap: 14 },
    grid: {
      display: "grid", gridTemplateColumns: "180px 1fr",
      rowGap: "8px", columnGap: "16px", alignItems: "start",
      background: "#fff", border: "1px solid #ffe2ee", borderRadius: 12, padding: 12,
    },
    k: { color: "#8a5774" },
    v: { color: "#333" },
    files: {
      display: "grid", gap: 8,
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    },
    fileItem: {
      border: "1px solid #ffe2ee", borderRadius: 12,
      padding: "10px 12px",
      background: "linear-gradient(180deg,#ffffff,#fff9fc)",
    },
    previewCard: {
      border: "1px solid #ffe2ee", borderRadius: 12, overflow: "hidden", background: "#fff",
    },
    previewHead: {
      padding: "10px 12px", borderBottom: "1px solid #ffe2ee",
      background: "linear-gradient(180deg,#fff0f7,#fff)",
      fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    },
    previewBody: { padding: 12, background: "#fff" },
    footer: {
      padding: "12px 18px", borderTop: "1px solid #ffcade",
      display: "flex", gap: 10, justifyContent: "flex-end",
      position: "sticky", bottom: 0,
      background: "linear-gradient(180deg,#fff,#fff7fb)",
    },
    ghostBtn: {
      background: "linear-gradient(180deg,#f0f8ff,#e5f4ff)",
      border: "1px solid #bae6fd", borderRadius: 10, padding: "8px 12px", cursor: "pointer",
    },
    iconBtn: {
      background: "linear-gradient(180deg,#ffe9f3,#fff)",
      border: "1px solid #ffb3ce", borderRadius: 10,
      padding: "6px 10px", cursor: "pointer", fontWeight: 600, color: "#b23b76",
    },
    sub: { margin: 0, color: "#8a5774", fontSize: 12, fontWeight: 600 },
  };

  const titleByVariant = {
    ll: "Detail Survei — Luka-luka",
    md: "Detail Survei — Meninggal Dunia",
    rs: "Detail Kunjungan RS",
  };

  return (
    <div style={styles.overlay} onClick={onClose} aria-hidden={false} role="presentation">
      <style>{`
        @keyframes fadeIn { from { opacity:.2 } to { opacity:1 } }
        @keyframes popIn  { from { opacity:.4; transform:scale(.98) } to { opacity:1; transform:scale(1) } }
        .mono{ font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "lnum" 1; }
      `}</style>

      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        aria-describedby="detail-desc"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        {/* Header */}
        <header style={styles.head}>
          <div style={styles.titleWrap}>
            <span style={{ fontSize: 20 }}>👀</span>
            <div>
              <h2 id="detail-title" style={{ margin: 0 }}>{titleByVariant[variant]}</h2>
              <p style={styles.sub}>{data.noPL ? `No. PL: ${data.noPL}` : "—"}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={styles.badge(!!data.verified)}>
              {data.verified ? "Status: Terverifikasi" : "Status: Belum Terverifikasi"}
            </span>
            <button className="df-btn df-danger" style={styles.iconBtn} onClick={onClose} title="Tutup">✕</button>
          </div>
        </header>

        {/* Body */}
        <div style={styles.body}>
          <p id="detail-desc" style={{ marginTop: 0, color: "#666" }}>
            Rincian data dan berkas sesuai jenis formulir.
          </p>

          {/* Key-Value Grid */}
          <div style={styles.grid} role="table" aria-label="Ringkasan data pengajuan">
            {pairs.map(([k, v]) => (
              <React.Fragment key={k}>
                <div style={styles.k}><strong>{k}</strong></div>
                <div style={styles.v}>{v}</div>
              </React.Fragment>
            ))}
          </div>

          {/* Ringkasan Berkas */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Berkas Terlampir</div>
            {fileBreakdown.length ? (
              <div style={styles.files}>
                {fileBreakdown.map((f, idx) => (
                  <div key={idx} style={styles.fileItem}>
                    <div style={{ fontWeight: 600 }}>{f.label || f.name}</div>
                    {f.note && <div style={{ fontSize: 12, color: "#666" }}>{f.note}</div>}
                    {f.size != null && (
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        Ukuran: {BYTES(f.size)}
                      </div>
                    )}
                    {(f.url || f.dataURL) && (
                      <div style={{ marginTop: 6 }}>
                        <a href={f.url || f.dataURL} target="_blank" rel="noreferrer">Buka / Unduh</a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "#666" }}><i>Tidak ada berkas terdeteksi.</i></div>
            )}
          </div>

          {/* Preview Laporan */}
          <div style={styles.previewCard}>
            <div style={styles.previewHead}>
              <span>Preview Laporan</span>
              {data?.previewHTML && (
                <button
                  onClick={() => {
                    if (typeof onPrint === "function") {
                      onPrint(variant, data);
                    } else {
                      try { window.print(); } catch { window.print(); }
                    }
                  }}
                  style={styles.iconBtn}
                  title="Cetak / Simpan PDF"
                >
                  🖨️ Cetak
                </button>
              )}
            </div>
            <div style={styles.previewBody}>
              {data?.previewHTML ? (
                <div
                  className="laporan-preview"
                  style={{
                    border: "1px solid #ffcade",
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff",
                  }}
                  dangerouslySetInnerHTML={{ __html: data.previewHTML }}
                />
              ) : (
                <p style={{ margin: 0, color: "#666" }}>
                  Belum ada data laporan untuk ditampilkan.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <button style={styles.ghostBtn} onClick={onClose}>Tutup</button>
        </footer>
      </div>
    </div>
  );
}

function useFocusTrap(enabled, containerRef) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const container = containerRef.current;
    const focusable = container.querySelectorAll(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    container.addEventListener("keydown", onKey);
    first?.focus();
    return () => container.removeEventListener("keydown", onKey);
  }, [enabled, containerRef]);
}

const REASON_PRESETS = {
  verify: [
    "Data utama lengkap dan konsisten.",
    "Dokumen pendukung valid (tidak kadaluarsa/duplikat).",
    "Foto jelas dan dapat dibaca.",
    "Hasil pengecekan lapangan sesuai.",
  ],
  unverify: [
    "Ada perbedaan tanggal antar dokumen.",
    "Identitas pada dokumen tidak sesuai.",
    "Lampiran tidak terbaca/blur, perlu unggah ulang.",
    "Nomor PL/berkas tidak valid.",
  ],
  finish: [
    "Santunan/pengurusan telah dituntaskan.",
    "Semua kewajiban administrasi terpenuhi.",
    "Tidak ada tindak lanjut tambahan.",
    "Konfirmasi akhir dari pemohon diterima.",
  ],
  reject: [
    "Dokumen tidak valid/asal palsu.",
    "Kriteria tidak terpenuhi sesuai pedoman.",
    "Data inti tidak lengkap setelah permintaan perbaikan.",
    "Tidak ada respon dari pemohon melewati batas waktu.",
  ],
};

function VerifyModal({ open, data, onClose, onSubmit }) {
  const [checks, setChecks] = useState({ lengkap: false, valid: false, jelas: false });
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("verify");
  const modalRef = useRef(null);

  useFocusTrap(open, modalRef);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!data) return;
    setMode(data.verified ? "finish" : "verify");
    setChecks({ lengkap: false, valid: false, jelas: false });
    setNote("");
  }, [data]);

  if (!open || !data) return null;

  const canConfirm =
    mode === "verify"
      ? (checks.lengkap && checks.valid && checks.jelas) // verifikasi wajib centang semua
      : mode === "unverify"
      ? note.trim().length > 0                           // batalkan verif wajib alasan
      : mode === "finish"
      ? true                                             // selesaikan tidak wajib catatan
      : note.trim().length > 0;                         // reject wajib alasan

  const styles = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(255, 240, 247, .72)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10000,
      padding: 24,
      animation: "fadeIn .18s ease-out",
    },
    modal: {
      width: "min(720px,100%)",
      background: "linear-gradient(180deg,#fff,#fff7fb)",
      borderRadius: 18,
      border: "1px solid #ffd6e7",
      boxShadow: "0 24px 60px rgba(255, 170, 195, .35)",
      maxHeight: "88vh",
      overflow: "auto",
      transformOrigin: "center",
      animation: "popIn .18s ease-out",
    },
    head: {
      padding: "14px 18px",
      borderBottom: "1px solid #ffcade",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      position: "sticky",
      top: 0,
      background: "linear-gradient(180deg,#fff0f7,#ffe3ef)",
      zIndex: 1,
    },
    titleWrap: { display: "flex", alignItems: "center", gap: 10 },
    badge: (isVerified) => ({
      padding: "4px 10px",
      borderRadius: 999,
      border: `1px solid ${isVerified ? "#ffd6d6" : "#c9f2df"}`,
      background: isVerified ? "#fff7f7" : "#f2fff7",
      color: isVerified ? "#b10000" : "#007a2e",
      fontSize: 12,
      whiteSpace: "nowrap",
    }),
    modeTabs: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      background: "#fff",
      border: "1px solid #ffe2ee",
      borderRadius: 12,
      padding: 6,
    },
    modeBtn: (active) => ({
      border: "1px solid",
      borderColor: active ? "#ffb3ce" : "#ffe2ee",
      background: active ? "linear-gradient(180deg,#ffe9f3,#fff)" : "#fff",
      color: "#b23b76",
      padding: "8px 10px",
      borderRadius: 10,
      cursor: "pointer",
      fontWeight: 600,
      textAlign: "center",
    }),
    body: { padding: 18, display: "grid", gap: 12 },
    info: { color: "#666", display: "flex", flexWrap: "wrap", gap: 6 },
    checklistWrap: { display: "grid", gap: 8, marginTop: 6 },
    checkItem: (checked) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${checked ? "#c9f2df" : "#ffe2ee"}`,
      background: checked ? "linear-gradient(180deg,#f6fff9,#ffffff)" : "#fff",
    }),
    textarea: {
      width: "100%",
      minHeight: 110,
      padding: 12,
      border: "1px solid #f0cfe0",
      borderRadius: 12,
      fontFamily: "inherit",
      resize: "vertical",
      background: "#fff",
      outline: "none",
    },
    footer: {
      padding: "12px 18px",
      borderTop: "1px solid #ffcade",
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      position: "sticky",
      bottom: 0,
      background: "linear-gradient(180deg,#fff,#fff7fb)",
    },
    ghostBtn: {
      background: "linear-gradient(180deg,#f0f8ff,#e5f4ff)",
      border: "1px solid #bae6fd",
      borderRadius: 10,
      padding: "8px 12px",
      cursor: "pointer",
    },
    primaryBtn: (enabled) => ({
      background: enabled ? "linear-gradient(180deg,#ffd6e7,#fff0f7)" : "#fbf1f6",
      color: enabled ? "#b23b76" : "#c9a5b6",
      border: `1px solid ${enabled ? "#ffc6dd" : "#f2d7e4"}`,
      borderRadius: 10,
      padding: "8px 12px",
      cursor: enabled ? "pointer" : "not-allowed",
      fontWeight: 700,
    }),
  };

  return (
    <div style={styles.overlay} onClick={onClose} aria-hidden={false} role="presentation">
      <style>{`
        @keyframes fadeIn { from { opacity: .2 } to { opacity: 1 } }
        @keyframes popIn  { from { opacity: .4; transform: scale(.98) } to { opacity:1; transform: scale(1) } }
        .mono{ font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "lnum" 1; }
      `}</style>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-title"
        aria-describedby="verify-desc"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        {/* Header */}
        <header style={styles.head}>
          <div style={styles.titleWrap}>
            <span style={{ fontSize: 20 }}>{mode === "verify" ? "✅" : "↩︎"}</span>
            <h2 id="verify-title" style={{ margin: 0 }}>
              {mode === "verify" ? "Verifikasi Pengajuan" : "Batalkan Verifikasi"}
            </h2>
          </div>
          <span style={styles.badge(!!data.verified)}>
            {data.verified ? "Status: Terverifikasi" : "Status: Belum Terverifikasi"}
          </span>
        </header>

        {/* Body */}
        <div style={styles.body}>
          <div id="verify-desc" style={styles.info}>
            <strong>ID:</strong> <span className="mono">{data.id}</span> • {data.korban} — {data.jenisSurveyLabel || data.template}
          </div>

          {/* Mode Tabs */}
          <div style={styles.modeTabs} aria-label="Pilih mode" role="tablist">
            <button role="tab" aria-selected={mode === "verify"}   style={styles.modeBtn(mode === "verify")}   onClick={() => setMode("verify")}>✓ Verifikasi</button>
            <button role="tab" aria-selected={mode === "unverify"} style={styles.modeBtn(mode === "unverify")} onClick={() => setMode("unverify")}>↩︎ Batalkan</button>
            <button role="tab" aria-selected={mode === "finish"}   style={styles.modeBtn(mode === "finish")}   onClick={() => setMode("finish")}>✔️ Selesaikan</button>
            <button role="tab" aria-selected={mode === "reject"}   style={styles.modeBtn(mode === "reject")}   onClick={() => setMode("reject")}>⛔ Tolak</button>
          </div>

          {mode === "verify" ? (
            <>
              <div style={{ fontWeight: 600, marginTop: 4 }}>Checklist sebelum verifikasi:</div>
              <div style={styles.checklistWrap}>
                <label style={styles.checkItem(checks.lengkap)}>
                  <input
                    type="checkbox"
                    checked={checks.lengkap}
                    onChange={(e) => setChecks((c) => ({ ...c, lengkap: e.target.checked }))}
                  />
                  Data utama lengkap & konsisten
                </label>
                <label style={styles.checkItem(checks.valid)}>
                  <input
                    type="checkbox"
                    checked={checks.valid}
                    onChange={(e) => setChecks((c) => ({ ...c, valid: e.target.checked }))}
                  />
                  Dokumen pendukung valid (bukan duplikat/kadaluarsa)
                </label>
                <label style={styles.checkItem(checks.jelas)}>
                  <input
                    type="checkbox"
                    checked={checks.jelas}
                    onChange={(e) => setChecks((c) => ({ ...c, jelas: e.target.checked }))}
                  />
                  Foto terbaca dan jelas
                </label>
              </div>

              <div>
                <div style={{ marginTop: 8, marginBottom: 6 }}>Catatan (opsional)</div>
                <textarea
                  style={styles.textarea}
                  value={note}
                  placeholder="Masukkan catatan verifikasi (opsional)…"
                  onChange={(e) => setNote(e.target.value)}
                />
                {Array.isArray(REASON_PRESETS[mode]) && REASON_PRESETS[mode].length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {REASON_PRESETS[mode].map((txt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNote((n) => (n ? (n.trim() ? n + " " : "") + txt : txt))}
                        style={{
                          border: "1px solid #ffd1e2",
                          background: "linear-gradient(180deg,#fff,#ffeef5)",
                          color: "#b23b76",
                          borderRadius: 999,
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                        title="Klik untuk menambahkan ke catatan"
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : mode === "unverify" ? (
            <>
              <div style={{ marginTop: 6, color: "#444", fontWeight: 600 }}>
                Beri alasan pembatalan verifikasi (wajib):
              </div>
              <textarea
                style={styles.textarea}
                value={note}
                placeholder="Contoh: Ditemukan perbedaan tanggal di dokumen…"
                onChange={(e) => setNote(e.target.value)}
              />
              {Array.isArray(REASON_PRESETS[mode]) && REASON_PRESETS[mode].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {REASON_PRESETS[mode].map((txt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNote((n) => (n ? (n.trim() ? n + " " : "") + txt : txt))}
                      style={{
                        border: "1px solid #ffd1e2",
                        background: "linear-gradient(180deg,#fff,#ffeef5)",
                        color: "#b23b76",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                      title="Klik untuk menambahkan ke catatan"
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : mode === "finish" ? (
            <>
              <div style={{ marginTop: 6, color: "#444" }}>
                Tandai pengajuan ini <b>SELESAI</b>. (Catatan opsional)
              </div>
              <textarea
                style={styles.textarea}
                value={note}
                placeholder="Catatan akhir (opsional)…"
                onChange={(e) => setNote(e.target.value)}
              />
              {Array.isArray(REASON_PRESETS[mode]) && REASON_PRESETS[mode].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {REASON_PRESETS[mode].map((txt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNote((n) => (n ? (n.trim() ? n + " " : "") + txt : txt))}
                      style={{
                        border: "1px solid #ffd1e2",
                        background: "linear-gradient(180deg,#fff,#ffeef5)",
                        color: "#b23b76",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                      title="Klik untuk menambahkan ke catatan"
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ marginTop: 6, color: "#444", fontWeight: 600 }}>
                Alasan <b>penolakan</b> (wajib):
              </div>
              <textarea
                style={styles.textarea}
                value={note}
                placeholder="Contoh: Dokumen tidak valid / data tidak sesuai…"
                onChange={(e) => setNote(e.target.value)}
              />
              {Array.isArray(REASON_PRESETS[mode]) && REASON_PRESETS[mode].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {REASON_PRESETS[mode].map((txt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNote((n) => (n ? (n.trim() ? n + " " : "") + txt : txt))}
                      style={{
                        border: "1px solid #ffd1e2",
                        background: "linear-gradient(180deg,#fff,#ffeef5)",
                        color: "#b23b76",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                      title="Klik untuk menambahkan ke catatan"
                    >
                      {txt}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <button style={styles.ghostBtn} onClick={onClose}>Batal</button>
          <button
            style={styles.primaryBtn(!!canConfirm)}
            disabled={!canConfirm}
            onClick={() => {
              const payload = {
                id: data.id,
                action: mode,
                note: note.trim(),
                checks,
                timestamp: new Date().toISOString(),
              };
              onSubmit?.(payload);
            }}
          >
            {mode === "verify"   ? "✓ Konfirmasi Verifikasi"
              : mode === "unverify"? "Batalkan Verifikasi"
              : mode === "finish"  ? "✔️ Tandai Selesai"
                                    : "⛔ Tolak Pengajuan"}
          </button>
        </footer>
      </div>
    </div>
  );
}

const GRID_COLS_AUTO = [
  "2.5rem",                // No
  "max-content",           // Waktu
  "max-content",           // Template
  "max-content",           // Jenis Survei
  "minmax(14ch, 1.4fr)",   // No. LP  (fleksibel)
  "minmax(12ch, 1.2fr)",   // Korban  (fleksibel)
  "minmax(12ch, 1.1fr)",   // Petugas (fleksibel)
  "max-content",           // Tgl. Kejadian
  "minmax(18ch, 1.6fr)",   // Berkas  (fleksibel, bisa panjang)
  "max-content",           // Status
  "minmax(20ch, 1.6fr)",   // Rating/Feedback (fleksibel)
  "fit-content(16rem)",    // Aksi (maks 16rem, tapi bisa lebih kecil)
].join(" ");

export default function DataForm() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [templ, setTempl] = useState("all");
  const [status, setStatus] = useState("all");
  const [expandedRows, setExpandedRows] = useState({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [blobUrls, setBlobUrls] = useState([]);

  // === MERGE HELPERS (letakkan di atas komponen) ===
  const prefer = (remote, local) =>
    remote != null && remote !== "" && !(Array.isArray(remote) && remote.length === 0)
      ? remote
      : local;

  function deepMergeAttachSurvey(remote = {}, local = {}) {
    const out = { ...local, ...remote };
    const parseMaybe = (v) => {
      if (!v) return null;
      if (typeof v === "object") return v;
      try { return JSON.parse(v); } catch { return null; }
    };
    const r = parseMaybe(remote) ?? remote;
    const l = parseMaybe(local) ?? local;
    if (r && typeof r === "object" && l && typeof l === "object") {
      const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
      const merged = {};
      keys.forEach((k) => {
        const rv = r[k];
        const lv = l[k];
        if (Array.isArray(rv) || Array.isArray(lv)) {
          const arr = [].concat(rv || [], lv || []);
          merged[k] = arr.length ? arr : undefined;
        } else {
          merged[k] = prefer(rv, lv);
        }
      });
      return merged;
    }
    return r || l || {};
  }

  function mergeArrays(remoteArr, localArr) {
    const r = Array.isArray(remoteArr) ? remoteArr : [];
    const l = Array.isArray(localArr) ? localArr : [];
    return r.length ? r : l;
  }

  function mergeRecords(localRow = {}, remoteRow = {}) {
    return {
      // meta
      id: prefer(remoteRow.id, localRow.id),
      waktu: prefer(remoteRow.waktu, localRow.waktu),
      template: prefer(remoteRow.template, localRow.template),
      korban: prefer(remoteRow.korban, localRow.korban),
      petugas: prefer(remoteRow.petugas, localRow.petugas),
      status: prefer(remoteRow.status, localRow.status),

      // ringkasan survei
      noPL: prefer(remoteRow.noPL, localRow.noPL),
      jenisSurveyLabel: prefer(remoteRow.jenisSurveyLabel, localRow.jenisSurveyLabel),
      jenisSurvei: prefer(remoteRow.jenisSurvei, localRow.jenisSurvei),
      tanggalKecelakaan: prefer(
        remoteRow.tanggalKecelakaan ?? remoteRow.tglKecelakaan,
        localRow.tanggalKecelakaan ?? localRow.tglKecelakaan
      ),
      hariTanggal: prefer(remoteRow.hariTanggal, localRow.hariTanggal),

      // yang kemarin kosong
      noBerkas: prefer(remoteRow.noBerkas, localRow.noBerkas),
      alamatKorban: prefer(remoteRow.alamatKorban, localRow.alamatKorban),
      tempatKecelakaan: prefer(remoteRow.tempatKecelakaan, localRow.tempatKecelakaan),
      tglKecelakaan: prefer(
        remoteRow.tglKecelakaan ?? remoteRow.tanggalKecelakaan,
        localRow.tglKecelakaan ?? localRow.tanggalKecelakaan
      ),
      hubunganSesuai: prefer(remoteRow.hubunganSesuai, localRow.hubunganSesuai),

      // RS
      wilayah: prefer(remoteRow.wilayah, localRow.wilayah),
      lokasiKecelakaan: prefer(remoteRow.lokasiKecelakaan, localRow.lokasiKecelakaan),
      rumahSakit: prefer(remoteRow.rumahSakit, localRow.rumahSakit),
      tglMasukRS: prefer(remoteRow.tglMasukRS, localRow.tglMasukRS),
      tglJamNotifikasi: prefer(remoteRow.tglJamNotifikasi, localRow.tglJamNotifikasi),
      tglJamKunjungan: prefer(remoteRow.tglJamKunjungan, localRow.tglJamKunjungan),
      uraianKunjungan: prefer(remoteRow.uraianKunjungan, localRow.uraianKunjungan),
      rekomendasi: prefer(remoteRow.rekomendasi, localRow.rekomendasi),

      // narasi
      uraian: prefer(remoteRow.uraian, localRow.uraian),
      kesimpulan: prefer(remoteRow.kesimpulan, localRow.kesimpulan),

      // LAMPIRAN PENTING
      attachSurvey: deepMergeAttachSurvey(remoteRow.attachSurvey, localRow.attachSurvey),
      fotoSurveyList: mergeArrays(remoteRow.fotoSurveyList, localRow.fotoSurveyList),
      rsList: mergeArrays(remoteRow.rsList, localRow.rsList),
      fotoList: mergeArrays(remoteRow.fotoList, localRow.fotoList),

      // verifikasi
      verified: !!prefer(remoteRow.verified, localRow.verified),
      verifiedAt: prefer(remoteRow.verifiedAt, localRow.verifiedAt),
      verifyNote: prefer(remoteRow.verifyNote, localRow.verifyNote),
      verifyChecklist: prefer(remoteRow.verifyChecklist, localRow.verifyChecklist),
      unverifiedAt: prefer(remoteRow.unverifiedAt, localRow.unverifiedAt),
      unverifyNote: prefer(remoteRow.unverifyNote, localRow.unverifyNote),

      // rating
      rating: prefer(remoteRow.rating, localRow.rating),
      feedback: prefer(remoteRow.feedback, localRow.feedback),

      _updatedAt: prefer(remoteRow._updatedAt, localRow._updatedAt),
    };
  }

  const syncFromSupabase = useCallback(async () => {
    try {
      // 1) coba akses tabel dengan nama sekarang
      let resp = await supabase
        .from("DataForm")
        .select("*")
        .order("waktu", { ascending: false });

      // 2) kalau 500 / error, log semua detail yang ada
      if (resp.error) {
        const e = resp.error;
        console.error("❌ Supabase fetch error:", {
          message: e.message, details: e.details, hint: e.hint, code: e.code, status: e.status,
        });
        // 3) fallback: coba tabel lowercase (sering terjadi beda casing)
        if (e.code === "PGRST116" || e.status === 500 || e.status === 404) {
          console.warn("↪️ Mencoba fallback ke tabel 'dataform'…");
          resp = await supabase
            .from("dataform")
            .select("*")
            .order("waktu", { ascending: false });
        }
      }

      if (resp.error) {
        // 4) kalau masih error, jangan clear UI; pakai data lokal saja
        console.error("❌ Gagal fetch Supabase (final):", {
          message: resp.error.message,
          details: resp.error.details,
          hint: resp.error.hint,
          code: resp.error.code,
          status: resp.error.status,
        });
        const localOnly = getListSafe(LS_KEY);
        setRows(localOnly);
        return;
      }

      const data = resp.data || [];
      console.log("🟢 Supabase OK | rows:", data.length);

      // 5) normalisasi + log contoh kolom penting
      const remote = data.map(normalizeRemoteRow);
      console.table(
        remote.slice(0, 10).map(r => ({
          id: r.id, waktu: r.waktu, template: r.template, status: r.status,
          attKeys: r.attachSurvey && typeof r.attachSurvey === "object"
            ? Object.keys(r.attachSurvey).join(",")
            : "(none)",
        }))
      );

      // 6) merge dengan local (safe)
      const localList = getListSafe(LS_KEY);
      const byIdLocal = new Map(localList.map((x) => [String(x.id), x]));

      const merged = remote.map((r) => {
        const l = byIdLocal.get(String(r.id));
        return l ? mergeRecords(l, r) : r;
      });

      const remoteIds = new Set(remote.map((x) => String(x.id)));
      localList.forEach((l) => {
        if (!remoteIds.has(String(l.id))) merged.push(l);
      });

      if (!tryWriteWhole(LS_KEY, merged)) {
        console.warn("⚠️ Gagal menulis hasil merged ke localStorage.");
      }

      setRows(merged);
      console.log("🔎 Supabase count:", data.length, "| merged rows:", merged.length);
    } catch (e) {
      // 7) runtime error (mis. network) → pakai local agar UI gak blank
      console.error("❌ syncFromSupabase runtime error:", e);
      setRows(getListSafe(LS_KEY));
    }
  }, []);


  useEffect(() => {
    setRows(getListSafe(LS_KEY));
    syncFromSupabase();
  }, [syncFromSupabase]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== LS_KEY) return;
      setRows(getListSafe(LS_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (templ === "all" ? true : r.template === templ))
      .filter((r) =>
        status === "all" ? true : (r.status || "terkirim") === status
      )
      .filter((r) => {
        if (!q.trim()) return true;
        const hay = `${r.korban || ""}|${r.petugas || ""}|${r.noPL || ""}|${
          r.jenisSurveyLabel || ""
        }`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => {
        const ta = new Date(a._updatedAt || a.waktu || a.createdAt || 0).getTime();
        const tb = new Date(b._updatedAt || b.waktu || b.createdAt || 0).getTime();
        return tb - ta;
      });
  }, [rows, q, templ, status]);

  const pill = (t) => {
    if (!t) return <span className="df-pill">-</span>;

    const template = t.toLowerCase();
    let label = "";

    if (template.includes("kunjungan")) label = "Kunjungan RS";
    else if (template.includes("survei_ll") || template.includes("luka"))
      label = "Survei Luka-Luka";
    else if (template.includes("survei_md") || template.includes("meninggal"))
      label = "Survei Meninggal Dunia";
    else label = "Lainnya";

    return <span className={`df-pill ${template}`}>{label}</span>;
  };

  const badge = (s) => (
    <span className={`df-badge st-${s || "terkirim"}`}>{s || "terkirim"}</span>
  );

  async function buildPreviewHTML_MD(vv, objURL) {
    const escapeHtml = (str = "") =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const fmtDate = (d) => {
      if (!d) return "-";
      try {
        const date = new Date(d);
        return date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      } catch {
        return d;
      }
    };

    // render 1 sel foto (sederhana, tanpa convert PDF → image)
    const toSrc = (item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (item.dataURL) return item.dataURL;
      if (item.url) return item.url;
      if (item.path) return item.path;
      if (item.file instanceof File) return objURL?.(item.file) || "";
      return "";
    };

    const renderFotoCell = (fotoField) => {
      if (!fotoField) return "-";
      const files = Array.isArray(fotoField) ? fotoField : [fotoField];
      const pieces = files.map((f) => {
        const src = toSrc(f);
        if (!src) return "";
        const isPdf =
          src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src) ||
          (f?.name || "").toLowerCase().endsWith(".pdf");
        if (isPdf) {
          return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`;
        }
        return `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;border:0.3mm solid #000;margin:1mm 0" />`;
      });
      const joined = pieces.filter(Boolean).join("");
      return joined || "-";
    };

    // tabel Sumber Informasi
    const sumbers = Array.isArray(vv.sumbers) ? vv.sumbers : [];
    const tableRows =
      sumbers.length > 0
        ? sumbers
            .map((r, i) => {
              const fotoCell = renderFotoCell(r?.foto);
              return `
                <tr>
                  <td style="text-align:center">${i + 1}</td>
                  <td>${escapeHtml(r?.identitas || "")}</td>
                  <td>${fotoCell}</td>
                </tr>`;
            })
            .join("")
        : `<tr><td style="text-align:center">1</td><td></td><td>-</td></tr>`;

    // halaman per lampiran dari attachSurvey (tanpa convert PDF)
    const filePages = [];
    if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
      for (const [key, file] of Object.entries(vv.attachSurvey)) {
        if (!file) continue;
        const files = Array.isArray(file) ? file : [file];
        const imgs = files
          .map((f) => {
            const src = toSrc(f);
            if (!src) return "";
            const isPdf =
              src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src) ||
              (f?.name || "").toLowerCase().endsWith(".pdf");
            if (isPdf) {
              return `<div style="font-size:10pt;color:#a00;margin:4mm 0">[${escapeHtml(
                f?.name || key
              )}: PDF tidak bisa dipratinjau]</div>`;
            }
            return `<img src="${src}" style="width:31%;height:auto;max-height:90mm;object-fit:contain;border:0.3mm solid #ccc;margin:2mm" />`;
          })
          .filter(Boolean)
          .join("");

        if (imgs) {
          filePages.push(`
            <div style="text-align:center; margin:10mm 0; page-break-inside: avoid;">
              <div style="font-weight:bold; margin-bottom:4mm; page-break-before: always;">
                ${escapeHtml(key)}
              </div>
              <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4mm; page-break-inside: avoid;">
                ${imgs}
              </div>
            </div>
          `);
        }
      }
    }

    // HTML utama (mirror gaya Step4, minus iframe/auto-print)
    const htmlMain = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        @page { size: A4; margin: 12mm; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin:0; font-family:"Times New Roman", Times, serif; color:#000; }
        h1 { font-size:18pt; margin:0 0 2mm; text-align:center; }
        h2 { font-size:12pt; margin:0 0 6mm; text-align:center; }
        .kv { display:grid; grid-template-columns: 54mm 6mm 1fr; row-gap:2mm; column-gap:2mm; margin-bottom:6mm; font-size:11pt }
        .box { border:0.3mm solid #000; padding:2.4mm; white-space:pre-wrap; min-height:18mm }
        table { width:100%; border-collapse:collapse; margin:4mm 0 6mm; font-size:11pt }
        td,th { border:0.3mm solid #000; padding:2mm 2.4mm; vertical-align:top }
        .signs { display:grid; grid-template-columns:1fr 1fr; column-gap:28mm; margin-top:10mm }
        .lbl { margin-bottom: 10mm }
        .space { height: 28mm }
        .name { font-weight:bold; text-decoration:underline; }
      </style>
    </head>
    <body>
      <h1>LAPORAN HASIL SURVEI</h1>
      <h2>APLIKASI MOBILE PELAYANAN</h2>

      <div class="kv">
        <div>No. PL</div><div>:</div><div>${escapeHtml(vv.noPL || "-")}</div>
        <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(fmtDate(vv.hariTanggal))}</div>
        <div>Petugas Survei</div><div>:</div><div>${escapeHtml(vv.petugasSurvei || vv.petugas || "-")}</div>
        <div>Jenis Survei</div><div>:</div><div>${escapeHtml(vv.jenisSurvei || vv.jenisSurveyLabel || "Meninggal Dunia")}</div>
        <div>Nama Korban</div><div>:</div><div>${escapeHtml(vv.namaKorban || vv.korban || "-")}</div>
        <div>No. Berkas</div><div>:</div><div>${escapeHtml(vv.noBerkas || "-")}</div>
        <div>Alamat Korban</div><div>:</div><div>${escapeHtml(vv.alamatKorban || "-")}</div>
        <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(vv.tempatKecelakaan || "-")} / ${escapeHtml(fmtDate(vv.tglKecelakaan))}</div>
        <div>Kesesuaian Hubungan AW</div><div>:</div><div>${
          vv.hubunganSesuai === "" || vv.hubunganSesuai == null
            ? "-"
            : vv.hubunganSesuai
            ? "Sesuai"
            : "Tidak Sesuai"
        }</div>
      </div>

      <div style="font-weight:bold;margin:0 0 2mm">Sumber Informasi :</div>
      <table>
        <thead>
          <tr>
            <th style="width:10mm">No</th>
            <th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th>
            <th style="width:40mm">Foto</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div style="font-weight:bold;margin:0 0 2mm">Uraian & Kesimpulan Hasil Survei :</div>
      <div class="box">${escapeHtml(vv.uraian || vv.kesimpulan || "")}</div>

      <p style="margin:6mm 0 10mm;font-size:11pt">
        Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
      </p>

      <div class="signs">
        <div>
          <div class="lbl">Mengetahui,</div>
          <div class="space"></div>
          <div class="name">${escapeHtml("Andi Raharja, S.A.B")}</div>
          <div>${escapeHtml("Kepala Bagian Operasional")}</div>
        </div>
        <div>
          <div class="lbl">Petugas Survei,</div>
          <div class="space"></div>
          <div class="name">${escapeHtml(vv.petugasSurvei || vv.petugas || "........................................")}</div>
          <div>${escapeHtml(vv.petugasJabatan || "")}</div>
        </div>
      </div>

      ${filePages.join("")}
    </body>
    </html>`;

    return htmlMain;
  }

  function buildPreviewHTML_LL(vv, objURL) {
    const escapeHtml = (str = "") =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const fmtDate = (d) => {
      if (!d) return "-";
      try {
        const date = new Date(d);
        return date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      } catch {
        return d;
      }
    };

    // ambil sumber foto dari beberapa kemungkinan field (tanpa konversi async)
    const fotoSources =
      (Array.isArray(vv.fotoSurvey) && vv.fotoSurvey.length && vv.fotoSurvey) ||
      (Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length && vv.fotoSurveyList) ||
      (Array.isArray(vv.attachSurvey?.fotoSurvey) && vv.attachSurvey.fotoSurvey.length && vv.attachSurvey.fotoSurvey) ||
      [];

    const toSrc = (item) => {
      if (!item) return "";
      if (typeof item === "object" && item.path)
        return item.path.startsWith("http") ? item.path : `/uploads/${item.path}`;
      if (item.dataURL) return item.dataURL;
      if (item.url) return item.url;
      if (item.path) return item.path;
      if (item.file instanceof File) return objURL?.(item.file) || "";
      return "";
    };

    const imgsHTML = fotoSources
      .map((x) => {
        const src = toSrc(x);
        if (!src) return "";
        const isPdf = src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
        if (isPdf) {
          return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`;
        }
        const name = escapeHtml(x?.name || x?.fileName || "foto");
        return `<img src="${src}" alt="${name}" style="max-width:45%; margin:2mm; page-break-inside: avoid;" />`;
      })
      .filter(Boolean)
      .join("");

    // tabel sumber informasi (tanpa konversi async)
    const sumbers = Array.isArray(vv.sumbers) ? vv.sumbers : [];
    const tableRows =
      sumbers.length > 0
        ? sumbers
            .map((r, i) => {
              // render foto kolom (sederhana)
              const fotos =
                (Array.isArray(r?.foto) ? r.foto : r?.foto ? [r.foto] : [])
                  .map((f) => {
                    const s = toSrc(f);
                    if (!s) return "";
                    const isPdf = s.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(s);
                    if (isPdf) return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF]</div>`;
                    return `<img src="${s}" style="width:100%;max-height:45mm;object-fit:contain;border:0.3mm solid #000;margin:1mm 0" />`;
                  })
                  .filter(Boolean)
                  .join("") || "-";

              return `
                <tr>
                  <td style="text-align:center">${i + 1}</td>
                  <td>${escapeHtml(r?.identitas || "")}</td>
                  <td>${fotos}</td>
                </tr>`;
            })
            .join("")
        : `<tr><td style="text-align:center">1</td><td></td><td>-</td></tr>`;

    // HTML utama (mirror gaya Step4, versi LL)
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      @page { size: A4; margin: 12mm; }
      body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; margin:0;
            font-family: "Times New Roman", Times, serif; color:#000; }
      h1{ font-size: 18pt; margin:0 0 2mm; text-align:center; }
      h2{ font-size: 12pt; margin:0 0 6mm; text-align:center; }
      .kv{ display:grid; grid-template-columns: 54mm 6mm 1fr; row-gap:2mm; column-gap:2mm; margin-bottom:6mm; font-size:11pt }
      .box{ border:0.3mm solid #000; padding:2.4mm; white-space:pre-wrap; min-height:18mm }
      table{ width:100%; border-collapse:collapse; margin:4mm 0 6mm; font-size:11pt }
      td,th{ border:0.3mm solid #000; padding:2mm 2.4mm; vertical-align:top }
      .signs{ display:grid; grid-template-columns:1fr 1fr; column-gap:28mm; margin-top:10mm }
      .lbl{ margin-bottom: 10mm }
      .space{ height: 28mm }
      .name{ font-weight:bold; text-decoration:underline; }
      .foto-container{ display:flex; flex-wrap:wrap; gap:4mm; margin-top:6mm }
    </style></head><body>
      <h1>LAPORAN HASIL SURVEI</h1>
      <h2>APLIKASI MOBILE PELAYANAN</h2>

      <div class="kv">
        <div>No. PL</div><div>:</div><div>${escapeHtml(vv.noPL || "-")}</div>
        <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(fmtDate(vv.hariTanggal))}</div>
        <div>Petugas Survei</div><div>:</div><div>${escapeHtml(vv.petugas || "-")}</div>
        <div>Jenis Survei</div><div>:</div><div>${escapeHtml(vv.jenisSurvei || vv.jenisSurveyLabel || "Luka-luka")}</div>
        <div>Nama Korban</div><div>:</div><div>${escapeHtml(vv.korban || vv.namaKorban || "-")}</div>
        <div>No. Berkas</div><div>:</div><div>${escapeHtml(vv.noBerkas || "-")}</div>
        <div>Alamat Korban</div><div>:</div><div>${escapeHtml(vv.alamatKorban || "-")}</div>
        <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(vv.tempatKecelakaan || "-")} / ${escapeHtml(fmtDate(vv.tglKecelakaan))}</div>
        <div>Kesesuaian Hubungan AW</div><div>:</div><div>${
          vv.hubunganSesuai === "" || vv.hubunganSesuai == null
            ? "-"
            : vv.hubunganSesuai
            ? "Sesuai"
            : "Tidak Sesuai"
        }</div>
      </div>

      <div style="font-weight:bold;margin:0 0 2mm">Sumber Informasi :</div>
      <table>
        <thead>
          <tr>
            <th style="width:10mm">No</th>
            <th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th>
            <th style="width:40mm">Foto</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div style="font-weight:bold;margin:0 0 2mm">Uraian & Kesimpulan Hasil Survei :</div>
      <div class="box">${escapeHtml(vv.uraian || "")}</div>

      <p style="margin:6mm 0 10mm;font-size:11pt">
        Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
      </p>

      <div class="signs">
        <div>
          <div class="lbl">Mengetahui,</div>
          <div class="space"></div>
          <div class="name">${escapeHtml("Andi Raharja, S.A.B")}</div>
          <div>${escapeHtml("Kepala Bagian Operasional")}</div>
        </div>
        <div>
          <div class="lbl">Petugas Survei,</div>
          <div class="space"></div>
          <div class="name">${escapeHtml(vv.petugas || "........................................")}</div>
          <div>${escapeHtml(vv.petugasJabatan || "")}</div>
        </div>
      </div>

      <div class="foto-container">${imgsHTML || "<i>Tidak ada foto dilampirkan.</i>"}</div>
    </body></html>`;
  }

  function buildPreviewHTML_RS(vv, objURL) {
    const escapeHtml = (str = "") =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    // Kumpulkan foto dari beberapa kemungkinan field (tanpa konversi async)
    const fotoCandidates =
      (Array.isArray(vv.allPhotos) && vv.allPhotos) ||
      (Array.isArray(vv.fotoList) && vv.fotoList) ||
      (Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList) ||
      (Array.isArray(vv.attachSurvey?.fotoSurvey) && vv.attachSurvey.fotoSurvey) ||
      [];

    const toSrc = (f) => {
      if (!f) return "";
      if (typeof f === "string") return f;
      if (f.dataURL) return f.dataURL;
      if (f.url) return f.url;
      if (f.path) return f.path;
      if (f.file instanceof File) return objURL?.(f.file) || "";
      return "";
    };

    const fotosHTML = fotoCandidates.length
      ? fotoCandidates
          .map((f) => {
            const src = toSrc(f);
            if (!src) return "";
            const name = escapeHtml(f?.name || f?.fileName || "Foto");
            const isPdf = src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
            if (isPdf) {
              return `<div style="margin:5px; text-align:center; font-size:12px; color:#a00;">[PDF tidak bisa dipratinjau]</div>`;
            }
            return `
              <div style="margin:5px; text-align:center;">
                <img src="${src}" alt="${name}" style="max-width:230px; max-height:230px; border:1px solid #999; border-radius:8px; margin:5px;"/>
                <div style="font-size:12px;">${name}</div>
              </div>`;
          })
          .filter(Boolean)
          .join("")
      : "<i>Tidak ada foto dilampirkan.</i>";

    return `<!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8" />
    <title>Laporan Kunjungan RS - ${escapeHtml(vv.korban || "Anon")}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family:"Times New Roman", serif; color:#000; background:#fff; padding:40px 50px; line-height:1.6; }
      h2 { text-align:center; text-transform:uppercase; font-size:18px; font-weight:bold; margin-bottom:0; }
      h3 { text-align:center; margin-top:4px; font-size:14px; font-weight:normal; }
      table { width:100%; border-collapse:collapse; margin-top:20px; font-size:14px; }
      td { padding:4px 6px; vertical-align:top; }
      .label { width:220px; font-weight:bold; }
      .section-title { font-weight:bold; margin-top:20px; text-transform:uppercase; }
      .box { border:1px solid #000; padding:10px; margin-top:6px; min-height:60px; white-space:pre-wrap; }
      .ttd { display:flex; justify-content:space-between; margin-top:60px; font-size:14px; text-align:center; }
      .foto-container { display:flex; flex-wrap:wrap; margin-top:30px; gap:10px; }
      .footer-note { margin-top:30px; font-size:14px; text-align:justify; }
    </style>
  </head>
  <body>
    <h2>LEMBAR HASIL KUNJUNGAN KE RUMAH SAKIT</h2>
    <h3>APLIKASI MOBILE PELAYANAN</h3>

    <table>
      <tr><td class="label">NPP / Nama Petugas</td><td>: ${escapeHtml(vv.petugas || "-")}</td></tr>
      <tr><td class="label">Loket Kantor / Wilayah</td><td>: ${escapeHtml(vv.wilayah || "-")}</td></tr>
      <tr><td class="label">Nama Korban</td><td>: ${escapeHtml(vv.korban || "-")}</td></tr>
      <tr><td class="label">Lokasi Kecelakaan</td><td>: ${escapeHtml(vv.lokasiKecelakaan || "-")}</td></tr>
      <tr><td class="label">Kode RS / Nama RS</td><td>: ${escapeHtml(vv.rumahSakit || "-")}</td></tr>
      <tr><td class="label">Tanggal Kecelakaan</td><td>: ${escapeHtml(vv.tglKecelakaan || "-")}</td></tr>
      <tr><td class="label">Tanggal Masuk RS</td><td>: ${escapeHtml(vv.tglMasukRS || "-")}</td></tr>
      <tr><td class="label">Tanggal & Jam Notifikasi</td><td>: ${escapeHtml(vv.tglJamNotifikasi || "-")}</td></tr>
      <tr><td class="label">Tanggal & Jam Kunjungan</td><td>: ${escapeHtml(vv.tglJamKunjungan || "-")}</td></tr>
    </table>

    <div class="section-title">Uraian Hasil Kunjungan:</div>
    <div class="box">${escapeHtml(vv.uraianKunjungan || "") || "<i>Belum diisi.</i>"}</div>

    <div class="section-title">Rekomendasi / Kesimpulan:</div>
    <div class="box">${escapeHtml(vv.rekomendasi || "") || "<i>Belum diisi.</i>"}</div>

    <div class="footer-note">
      Demikian laporan hasil kunjungan ke Rumah Sakit ini kami buat dengan sebenarnya sesuai dengan informasi yang kami peroleh.
    </div>

    <div class="ttd">
      <div>
        Mengetahui,<br/><br/><br/><br/>
        <b>Andi Raharja, S.A.B</b><br/>
        <i>Kepala Bagian Operasional</i>
      </div>
      <div>
        Petugas yang melakukan kunjungan,<br/><br/><br/><br/>
        <b>${escapeHtml(vv.petugas || "................................")}</b><br/>
        <i>${escapeHtml(vv.petugasJabatan || "")}</i>
      </div>
    </div>

    <div class="foto-container">${fotosHTML}</div>
  </body>
  </html>`;
  }

  async function prepareForOutput(rec) {
    const vv = { ...rec };

    // --- ID & waktu aman ---
    vv.id =
      rec.id ||
      rec.local_id ||
      rec.row_id ||
      rec.uuid ||
      `${rec.waktu || rec.created_at || Date.now()}__${rec.no_pl || rec.noPL || "nop"}__${rec.template || "tpl"}`;

    vv.createdAt = rec.createdAt || rec.waktu || rec.created_at || new Date().toISOString();
    vv.waktu     = rec.waktu     || vv.createdAt;

    // --- Template & label ---
    const tpl = (rec.template || "").toLowerCase();
    vv.template = rec.template || "";
    vv.jenisSurveyLabel =
      rec.jenisSurveyLabel ||
      rec.jenis_survey_label ||
      rec.jenisSurvei ||
      rec.jenis_survei ||
      rec.sifatCidera ||
      "";

    vv.jenisSurvei =
      rec.jenisSurvei ||
      rec.jenis_survei ||
      (tpl.includes("survei_md") ? "Meninggal Dunia" :
      tpl.includes("survei_ll") ? "Luka-luka" : "");

    // --- Data umum / identitas ---
    vv.petugas     = rec.petugas || rec.petugasSurvei || "";
    vv.petugasSurvei = rec.petugasSurvei || rec.petugas || "";
    vv.korban      = rec.korban || rec.namaKorban || "";
    vv.namaKorban  = rec.namaKorban || rec.korban || "";
    vv.noPL        = rec.noPL || rec.no_pl || "";
    vv.noBerkas    = rec.noBerkas || "";
    vv.alamatKorban= rec.alamatKorban || "";
    vv.tempatKecelakaan = rec.tempatKecelakaan || rec.lokasiKecelakaan || "";
    vv.wilayah     = rec.wilayah || "";
    vv.rumahSakit  = rec.rumahSakit || "";

    // --- Tanggal-tanggal ---
    vv.tglKecelakaan =
      rec.tglKecelakaan ||
      rec.tanggalKecelakaan ||
      rec.tgl_kecelakaan ||
      "";

    vv.hariTanggal =
      rec.hariTanggal ||
      rec.tanggalKecelakaan ||
      vv.tglKecelakaan ||
      "";

    vv.tglMasukRS       = rec.tglMasukRS || "";
    vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
    vv.tglJamKunjungan  = rec.tglJamKunjungan || "";

    // --- Konten narasi (survey & kunjungan) ---
    vv.uraian       = rec.uraianSurvei || rec.uraian || "";
    vv.kesimpulan   = rec.kesimpulanSurvei || rec.kesimpulan || "";
    vv.uraianKunjungan = rec.uraianKunjungan || "";
    vv.rekomendasi  = rec.rekomendasi || "";

    // --- Hubungan AW (normalisasi boolean/string) ---
    let hs = rec.hubunganSesuai;
    if (typeof hs === "string") {
      const s = hs.trim().toLowerCase();
      if (["ya","y","true","1","sesuai"].includes(s)) hs = true;
      else if (["tidak","tdk","no","n","false","0","tidak sesuai"].includes(s)) hs = false;
    }
    vv.hubunganSesuai = hs;

    // --- TTD/pejabat (fallback aman) ---
    vv.petugasJabatan = rec.petugasJabatan || "";
    vv.pejabatMengetahuiName    = rec.pejabatMengetahuiName    || "Andi Raharja, S.A.B";
    vv.pejabatMengetahuiJabatan = rec.pejabatMengetahuiJabatan || "Kepala Bagian Operasional";

    // --- Status & verifikasi ---
    vv.status            = rec.status || "terkirim";
    vv.verified          = !!rec.verified;
    vv.verifiedAt        = rec.verifiedAt || rec.verified_at || null;
    vv.verifyNote        = rec.verifyNote || rec.verify_note || null;
    vv.verifyChecklist   = rec.verifyChecklist || rec.verify_checklist || null;
    vv.unverifiedAt      = rec.unverifiedAt || rec.unverified_at || null;
    vv.unverifyNote      = rec.unverifyNote || rec.unverify_note || null;

    // --- Rating/feedback ---
    vv.rating   = rec.rating ?? rec.rating_value ?? rec.star ?? null;
    vv.feedback = rec.feedback ?? rec.feedback_text ?? rec.ulasan ?? null;

    // --- Kumpulan lampiran: satukan jadi satu format seragam ---
    vv.attachSurvey = rec.attachSurvey && typeof rec.attachSurvey === "object" ? rec.attachSurvey : {};

    const files = [];

    const pushFile = (f, label = "Lampiran") => {
      if (!f) return;
      if (Array.isArray(f)) { f.forEach((x) => pushFile(x, label)); return; }

      if (typeof f === "string") {
        files.push({ label, name: f.split("/").pop() || label, url: f });
        return;
      }

      // Object
      const name =
        f.name || f.fileName || f.filename || f.label || label;
      const dataURL =
        f.dataURL || f.url || f.path ||
        (f.file instanceof File ? f.file : null);

      const entry = {
        type: f.type || undefined,
        label: f.label || label,
        name,
        url: typeof dataURL === "string" ? dataURL : undefined,
        dataURL: typeof dataURL !== "string" ? undefined : undefined,
        file: dataURL instanceof File ? dataURL : undefined,
        size: f.size,
      };
      files.push(entry);
    };

    // Sumber umum yang sering dipakai FormPage
    pushFile(rec.fotoSurveyList, "Foto Survey");
    pushFile(rec.fotoList,       "Foto Survey");
    pushFile(rec.laporanRSList,  "Laporan RS");
    pushFile(rec.rsList,         "Berkas RS");

    // Root-level potensi lampiran per jenis
    ["ktp","kk","bukuTabungan","formPengajuan","formKeteranganAW","skKematian","aktaKelahiran"]
      .forEach((k) => pushFile(rec[k], k));

    // Object attachSurvey { ktp: ..., kk: ..., ... }
    if (vv.attachSurvey && !Array.isArray(vv.attachSurvey)) {
      Object.entries(vv.attachSurvey).forEach(([k, v]) => pushFile(v, k));
    }

    vv.files = files;

    // Derivasi: kumpulan foto (untuk preview RS/LL)
    const isImage = (nOrUrl = "") => /\.(png|jpe?g|gif|webp|bmp)$/i.test(nOrUrl);
    vv.allPhotos = files.filter((f) =>
      isImage((f.name || "").toLowerCase()) || isImage((f.url || "").toLowerCase()) || f.type === "foto"
    );

    // Hitungan ringkas
    vv.counts = {
      singles: rec.rsList?.length || 0,
      fotoSurvey: (rec.fotoList?.length || rec.fotoSurveyList?.length || 0),
      fotoKejadian: rec.fotoKejadianList?.length || 0,
    };

    // “_updatedAt” untuk sorting di DataForm
    vv._updatedAt =
      rec.updated_at || rec.verified_at || rec.unverified_at ||
      rec.waktu || rec.createdAt || rec.created_at || null;

    return vv;
  }

  const openPreview = useCallback(async (rec) => {
    if (!rec) return;
    const vv = await prepareForOutput(rec);
    console.log("🧩 Preview data vv:", vv);
    const template = (rec.template || "").toLowerCase();
    const sifat = (rec?.sifatCidera || "").toLowerCase();
    const createdBlobUrls = [];

    const objURL = (maybeFile) => {
      if (maybeFile instanceof File) {
        const u = URL.createObjectURL(maybeFile);
        createdBlobUrls.push(u);
        return u;
      }
      return null;
    };

    // 🔁 1) SURVEI MENINGGAL DUNIA (MD) — cek duluan
    if (sifat.includes("meninggal") || template.includes("survei_md")) {
      const html = await buildPreviewHTML_MD(vv, objURL); // ⬅️ ini isinya
      setDetailData({ ...vv, __variant: "md", previewHTML: html });
      setBlobUrls(createdBlobUrls);
      setDetailOpen(true);
      return;
    }

    // 🔁 2) SURVEI LUKA-LUKA (LL)
    if (sifat.includes("luka") || template.includes("survei_ll")) {
      const html = buildPreviewHTML_LL(vv, objURL); // ⬅️ ini isinya
      setDetailData({ ...vv, __variant: "ll", previewHTML: html });
      setBlobUrls(createdBlobUrls);
      setDetailOpen(true);
      return;
    }

    // 🔁 3) KUNJUNGAN RS (RS) — terakhir
    if (template.includes("kunjungan")) {
      const reportHTML = buildPreviewHTML_RS(vv, objURL); // ⬅️ isi preview-nya
      setDetailData({ ...vv, __variant: "rs", previewHTML: reportHTML });
      setBlobUrls(createdBlobUrls);
      setDetailOpen(true);
      return;
    }

    alert("Template tidak dikenali atau belum disiapkan preview-nya.");
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailData(null);
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
    setBlobUrls([]);
  }, [blobUrls]);

  const openVerify = useCallback((rec) => {
    setVerifyData(rec);
    setVerifyOpen(true);
  }, []);
  const closeVerify = useCallback(() => {
    setVerifyOpen(false);
    setVerifyData(null);
  }, []);

  const applyVerification = useCallback(async (payload) => {
    const BK_RAW = localStorage.getItem(LS_KEY); 
    let updatedRecForSync = null;                

    setRows((prev) => {
      const next = prev.map((r) => {
        if (r.id !== payload.id) return r;
        const now = payload.timestamp;

        if (payload.action === "verify") {
          try {
            const q = getListSafe(LS_VERIF);
            if (!q.some((it) => it.id === r.id)) {
              q.unshift({
                id: r.id,
                pemohon: r.korban,
                status: "menunggu",
                tanggal: now.slice(0, 10),
                pdfUrl: r.pdfBlobUrl || "/Lembar_Kunjungan_RS_NAI.pdf",
              });
              localStorage.setItem(LS_VERIF, JSON.stringify(q));
            }
          } catch {}

          const rec = {
            ...r,
            verified: true,
            verifiedAt: now,
            verifyNote: payload.note || undefined,
            verifyChecklist: payload.checks,
            status: "diproses", // (opsional) supaya UI juga ikut ganti
          };
          updatedRecForSync = rec; // ← simpan buat sync ke Supabase
          return rec;
        }

        if (payload.action === "unverify") {
          const rec = {
            ...r,
            verified: false,
            unverifiedAt: now,
            unverifyNote: payload.note || undefined,
            status: "terkirim", // (opsional)
          };
          updatedRecForSync = rec; // ← simpan buat sync ke Supabase
          return rec;
        }

         if (payload.action === "finish") {
          const rec = {
            ...r,
            // boleh tetap verified sesuai kondisi sebelumnya
            finishedAt: now,
            finishNote: payload.note || undefined,
            status: "selesai",
          };
          updatedRecForSync = rec;
          return rec;
        }

        if (payload.action === "reject") {
          const rec = {
            ...r,
            verified: false,
            rejectedAt: now,
            rejectNote: payload.note || undefined,
            // karena filter kamu hanya punya: terkirim/diproses/selesai
            // maka kembali ke "terkirim" (belum diproses)
            status: "terkirim",
          };
          updatedRecForSync = rec;
          return rec;
        }

        return r;
      });

      // tulis aman + rollback
      if (!tryWriteWhole(LS_KEY, next)) {
        if (BK_RAW != null) localStorage.setItem(LS_KEY, BK_RAW);
        alert("Gagal menyimpan status verifikasi (kemungkinan quota). Perubahan dibatalkan.");
        updatedRecForSync = null; // batalkan sync
        return prev;
      }

      return next;
    });

    if (updatedRecForSync) {
    console.log("🔄 Will sync:", { local_id: updatedRecForSync.id, action: payload.action });
    await syncVerificationToSupabase(updatedRecForSync, payload);
    await syncFromSupabase();
  }

    closeVerify();
  }, [closeVerify]);

  return (
    <div className="df-wrap" style={{ maxWidth: "100%", margin: "0 auto" }}>
      <audio autoPlay playsInline>
        <source src="/voices/dataform.mp3" type="audio/mpeg" />
      </audio>

      {/* Header */}
      <header className="df-head">
        <div className="df-title">
          <span className="df-spark">✨</span>
          <h1>Data Form</h1>
          <span className="df-ribbon">🎀</span>
        </div>
        <p className="df-sub">
          Rekap pengajuan dari halaman SPA. Silakan verifikasi data yang
          masuk—klik baris untuk detail, atau gunakan tombol aksi di kanan.
        </p>
      </header>

      {/* Toolbar */}
      <section className="df-toolbar">
        <div className="df-search">
          <input
            placeholder="Cari korban/petugas/No. PL/Jenis survey…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="df-emoji">🔎</span>
        </div>
        <div className="df-filters">
          <select value={templ} onChange={(e) => setTempl(e.target.value)}>
            <option value="all">Semua Template</option>
            <option value="kunjungan_rs">Kunjungan RS</option>
            <option value="survei_ll">Survei Luka-Luka</option>{" "}
            {/* tambahkan */}
            <option value="survei_md">Survei Meninggal Dunia</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="terkirim">Terkirim</option>
            <option value="diproses">Diproses</option>
            <option value="selesai">Selesai</option>
          </select>
        </div>
      </section>

      {/* Table Card (scrollable & sticky head) */}
      <section className="df-card">
        {filtered.length === 0 ? (
          <div className="df-empty">
            <div className="df-empty-emoji">🍡</div>
            Belum ada data—kirim form dulu ya!
          </div>
        ) : (
          <div className="df-scroll" style={{ overflowX: "auto" }}>
            <div className="df-table" role="table" aria-label="Data Form">
              <div
                className="df-thead"
                role="row"
              >
                <div>No</div>
                <div>Waktu</div>
                <div>Template</div>
                <div>Jenis Survei</div>
                <div>No. LP</div>
                <div>Korban</div>
                <div>Petugas</div>
                <div>Tgl. Kejadian</div>
                <div>Status</div>
                <div>Rating</div>
                <div>Aksi</div>
              </div>

              {filtered.map((r, i) => {
                // 🔍 Gabungkan semua file dari berbagai jenis
                const allFiles = [];

                // === Hasil Kunjungan ===
                if (r.fotoSurveyList?.length) {
                  allFiles.push(
                    ...r.fotoSurveyList.map((f) => ({
                      type: "foto",
                      name: f.name,
                      dataURL: f.dataURL,
                    }))
                  );
                }

                const surveyFiles = [
                  { key: "ktp", label: "KTP Korban" },
                  { key: "kk", label: "Kartu Keluarga (KK)" },
                  { key: "bukuTabungan", label: "Buku Tabungan" },
                  {
                    key: "formPengajuan",
                    label: "Formulir Pengajuan Santunan",
                  },
                  {
                    key: "formKeteranganAW",
                    label: "Formulir Keterangan Ahli Waris",
                  },
                  { key: "skKematian", label: "Surat Keterangan Kematian" },
                  { key: "aktaKelahiran", label: "Akta Kelahiran" },
                ];

                const pushFile = (f, suggestedLabel = "Berkas") => {
                  if (!f) return;

                  if (Array.isArray(f)) {
                    f.forEach((ff) => pushFile(ff, suggestedLabel));
                    return;
                  }

                  if (typeof f === "object") {
                    const name =
                      f.name ||
                      f.fileName ||
                      f.filename ||
                      f.label ||
                      suggestedLabel;

                    const dataURL =
                      f.dataURL ||
                      f.url ||
                      f.path ||
                      f.data ||
                      (f.file instanceof File
                        ? URL.createObjectURL(f.file)
                        : f.file) ||
                      (typeof f.file === "string" ? f.file : null);

                    if (!dataURL) {
                      console.warn(
                        "⚠️ Tidak ada dataURL/URL/data untuk file:",
                        name,
                        f
                      );
                      return;
                    }

                    allFiles.push({
                      type: /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
                        ? "foto"
                        : "berkas",
                      label: f.label || suggestedLabel,
                      name: name || "Unknown",
                      dataURL,
                    });
                    return;
                  }

                  if (typeof f === "string") {
                    allFiles.push({
                      type: /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
                        ? "foto"
                        : "berkas",
                      label: suggestedLabel,
                      name: f.split("/").pop() || suggestedLabel,
                      dataURL: f,
                    });
                  }
                };

                if (
                  r.attachSurvey &&
                  typeof r.attachSurvey === "object" &&
                  !Array.isArray(r.attachSurvey)
                ) {
                  Object.keys(r.attachSurvey).forEach((k) => {
                    const val = r.attachSurvey[k];
                    const meta = surveyFiles.find((s) => s.key === k);
                    pushFile(val, meta ? meta.label : k);
                  });
                }

                Object.entries(r.attachSurvey || {}).forEach(([k, v]) => {
                  console.log("🧱 Detail attachSurvey entry:", k);
                  try {
                    console.log(
                      "🪣 Nilai lengkap:",
                      JSON.stringify(v, null, 2)
                    );
                  } catch {
                    console.log("❌ Gagal stringify:", v);
                  }
                });

                if (Array.isArray(r.attachList) && r.attachList.length) {
                  r.attachList.forEach((f) =>
                    pushFile(f, f.label || f.name || "Lampiran")
                  );
                }

                if (r.hasilFormFile) {
                  pushFile(
                    r.hasilFormFile,
                    r.hasilFormFile.label ||
                      r.hasilFormFile.name ||
                      "Hasil Form"
                  );
                }

                surveyFiles.forEach((f) => {
                  const candidates = [
                    r[f.key],
                    r.data?.[f.key],
                    r.att?.[f.key],
                    r[f.key + "File"],
                  ];
                  const found = candidates.find((x) => !!x);
                  if (found) pushFile(found, f.label);
                });

                if (
                  Array.isArray(r.fotoSurveyList) &&
                  r.fotoSurveyList.length
                ) {
                  r.fotoSurveyList.forEach((f) =>
                    pushFile(f, f.name || "Foto Survey")
                  );
                }
                if (Array.isArray(r.fotoSurvey) && r.fotoSurvey.length) {
                  r.fotoSurvey.forEach((f) =>
                    pushFile(f, f.name || "Foto Survey")
                  );
                }
                if (Array.isArray(r.fotoList) && r.fotoList.length) {
                  r.fotoList.forEach((f) => pushFile(f, f.name || "Foto"));
                }

                if (r.attachments && typeof r.attachments === "object") {
                  if (Array.isArray(r.attachments)) {
                    r.attachments.forEach((f) =>
                      pushFile(f, f.name || "Lampiran")
                    );
                  } else {
                    Object.keys(r.attachments).forEach((k) =>
                      pushFile(r.attachments[k], k)
                    );
                  }
                }

                if (r.attachSurvey && typeof r.attachSurvey === "object") {
                  console.log(
                    "🧩 Semua key di attachSurvey:",
                    Object.keys(r.attachSurvey)
                  );
                  Object.keys(r.attachSurvey).forEach((k) => {
                    console.log(
                      "🧱 Detail attachSurvey entry:",
                      k,
                      r.attachSurvey[k]
                    );
                    if (
                      !allFiles.some(
                        (f) => f.name?.includes(k) || f.label?.includes(k)
                      )
                    ) {
                      console.warn(
                        "⚠️ Tidak terdaftar di allFiles:",
                        k,
                        r.attachSurvey[k]
                      );
                    }
                  });
                }

                return (
                  <React.Fragment key={r.id || i}>
                    <div
                      className="df-row"
                      role="row"
                      style={{
                        alignItems: "start",
                      }}
                    >
                      <div>{i + 1}</div>
                      <div className="df-mono">{fmtDT(r.waktu)}</div>
                      <div>{pill(r.template)}</div>
                      <div>{r.jenisSurveyLabel || r.jenisSurvei || "-"}</div>
                      <div className="df-mono">{r.noPL || "-"}</div>
                      <div>{r.korban || "-"}</div>
                      <div>{r.petugas || "-"}</div>
                      <div className="df-mono">
                        {fmtD(r.tanggalKecelakaan || r.tglKecelakaan || r.hariTanggal)}
                      </div>
                      <div>{badge(r.status)}</div>

                      {/* Kolom Rating */}
                      <div
                        style={{
                          minWidth: "0px",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          padding: "4px 6px",
                          display: "flex",
                          flexDirection: "column", // biar feedback di bawah rating
                          alignItems: "flex-start", // biar rata kiri
                        }}
                      >
                        {/* Rating */}
                        <div>
                          {(() => {
                            const n = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
                            return n ? "⭐".repeat(n) + "☆".repeat(5 - n) : "—";
                          })()}
                        </div>

                        {/* Feedback */}
                        {r.feedback && (
                          <div
                            title={r.feedback}
                            style={{
                              fontSize: "0.85em",
                              color: "#555",
                              marginTop: "4px",
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                            }}
                          >
                            💬 {r.feedback}
                          </div>
                        )}
                      </div>

                      {/* Kolom Aksi */}
                      <div
                        className="df-actions"
                        style={{
                          display: "flex",
                          gap: "4px",
                          justifyContent: "flex-start",
                          minWidth: "180px",
                          padding: "2px 4px",
                        }}
                      >
                        <button
                          className="kawaii-button"
                          onClick={() => openPreview(r)}
                        >
                          👀 Detail
                        </button>
                        <button
                          className="kawaii-button"
                          onClick={() => openVerify(r)}
                        >
                          {r.verified ? "✅ Terverifikasi" : "🗂️ Verifikasi"}
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Modal Detail */}
      <DetailModal
        open={detailOpen}
        data={detailData}
        onClose={closeDetail}
        onPrint={(variant, rec) => {
          // coba pakai printer asli dari Step4
          const printer = window.__reportPrinters?.[variant];
          if (typeof printer === "function") return printer();

          // fallback aman: cetak previewHTML kalau ada, kalau nggak ya window.print()
          if (rec?.previewHTML) {
            const blob = new Blob([rec.previewHTML], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = url;
            document.body.appendChild(iframe);
            iframe.onload = () => {
              try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
              finally {
                setTimeout(() => {
                  document.body.removeChild(iframe);
                  URL.revokeObjectURL(url);
                }, 1000);
              }
            };
          } else {
            window.print();
          }
        }}
      />

      {/* Modal Verifikasi */}
      <VerifyModal
        open={verifyOpen}
        data={verifyData}
        onClose={closeVerify}
        onSubmit={applyVerification}
      />

      <style>
        {`
        .kawaii-button {
        background: linear-gradient(135deg, #ffd6e0, #fff0f5);
        color: #ff4d8e;
        font-weight: 600;
        font-size: 0.85em;
        padding: 4px 10px;
        border: 2px solid #ffcce0;
        border-radius: 10px;
        box-shadow: 0 2px 6px rgba(255, 182, 193, 0.5),
                    inset 0 0 5px rgba(255, 240, 245, 0.7);
        transition: all 0.25s ease;
        cursor: pointer;
      }

      .kawaii-button:hover {
        background: linear-gradient(135deg, #ffe1ec, #ffffff);
        color: #ff007f;
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(255, 150, 180, 0.6);
      }

      .kawaii-button:active {
        transform: translateY(1px);
        box-shadow: inset 0 2px 4px rgba(255, 182, 193, 0.6);
      }

      .kawaii-button:focus {
        outline: none;
        box-shadow: 0 0 10px rgba(255, 200, 220, 0.8);
      }

      .df-scroll {
        overflow-x: auto;
      }

      .df-table {
        min-width: 1200px;            
      }

      .df-thead {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #fffafb;         
        border-bottom: 2px solid #f4c6d0;
        box-shadow: 0 2px 0 rgba(244, 198, 208, 0.4);
      }

      .df-row {
        grid-auto-rows: minmax(56px, auto);
        border-bottom: 1px dashed #f2cbd2;
        background: #fff;
        transition: background 120ms ease;
      }

      .df-row:nth-child(odd) {
        background: #fffefe;
      }

      .df-row:hover {
        background: #fff5f8;
      }

      .df-thead > div,
      .df-row > div {
        padding: 10px 8px;
        align-self: stretch;
        display: flex;
        align-items: center;
        border-right: 1px solid #f3e3e6;
      }

      .df-thead > div:last-child,
      .df-row > div:last-child {
        border-right: none;
      }

      .df-row > div {
        min-width: 0;
        white-space: normal;
        word-break: break-word;
      }

      .df-mono {
        font-feature-settings: "tnum" 1, "lnum" 1;
        font-variant-numeric: tabular-nums lining-nums;
      }

      .df-badge {
        white-space: nowrap;
      }
      .df-table{
        --df-cols: 2.5rem max-content max-content max-content
                    minmax(14ch,1.4fr) minmax(12ch,1.2fr) minmax(12ch,1.1fr)
                    max-content /*(Tgl. Kejadian)*/ max-content /*(Status)*/
                    minmax(20ch,1.6fr) /*(Rating)*/ fit-content(16rem) /*(Aksi)*/;
        grid-template-columns: var(--df-cols);
        column-gap:6px;
        min-width:1100px;
      }

      .df-thead, .df-row{ display: contents; }

      .df-thead > div,
      .df-row  > div {
        padding: 10px 8px;
        align-self: stretch;
        display: flex;
        align-items: center;
        border-right: 1px solid #f3e3e6;
      }
      .df-thead > div:last-child,
      .df-row  > div:last-child { border-right: none; }

      .df-row { grid-auto-rows: minmax(56px, auto); }
      .df-row > div { min-width: 0; white-space: normal; word-break: break-word; }

      .df-col--num { justify-content: center; }
      .df-col--mono { font-variant-numeric: tabular-nums; }

      .df-th,.df-td{
        padding:10px 8px;
        display:flex; align-items:center;
        border-right:1px solid #f3e3e6;
        min-width:0; white-space:normal; word-break:break-word;
      }
      .df-th:last-child,.df-td:last-child{ border-right:none; }

      .df-th{
        position:sticky; top:0; z-index:3;
        background:#fffafb;
        border-bottom:2px solid #f4c6d0;
        box-shadow:0 2px 0 rgba(244,198,208,.4);
      }

      .df-row:nth-of-type(odd) > .df-td{ background:#fffefe; }
      .df-row:nth-of-type(even)> .df-td{ background:#ffffff; }
      .df-row:hover > .df-td{ background:#fff5f8; }

      .df-col--num{ justify-content:center; }
      .df-mono{ font-variant-numeric: tabular-nums; font-feature-settings:"tnum" 1, "lnum" 1; }

      .df-scroll{ overflow-x:auto; }
      :root{
        --pink-0:#fff7fb;  
        --pink-1:#ffe9f3;
        --pink-2:#ffd6e7;
        --pink-3:#ffc1d9;   
        --pink-ink:#6b274d; 
        --pink-sep:rgba(255,170,195,.55); 
      }

      .df-card{
        background: linear-gradient(180deg, var(--pink-0) 0%, #fff 60%);
        border: 1px solid var(--pink-2);
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(255, 170, 195, .25);
        overflow: hidden;
      }

      .df-th{
        position: sticky; top: 0; z-index: 3;
        background: linear-gradient(180deg, #fff0f7 0%, #ffe3ef 100%);
        color: var(--pink-ink);
        border-bottom: 2px solid var(--pink-2);
        box-shadow: 0 2px 0 rgba(255, 170, 195, .35);
      }

      .df-th, .df-td{
        border-right: 1px solid var(--pink-sep);
      }
      .df-th:last-child, .df-td:last-child{ border-right: none; }

      .df-row:nth-of-type(odd)  > .df-td{
        background: linear-gradient(180deg, #fffefe 0%, #fff6fa 100%);
      }
      .df-row:nth-of-type(even) > .df-td{
        background: linear-gradient(180deg, #ffffff 0%, #fff9fc 100%);
      }

      .df-row:hover > .df-td{
        background: linear-gradient(180deg, #fff2f7 0%, #ffe7f1 100%);
      }

      .df-badge.st-terkirim   { background: linear-gradient(180deg,#fff,#ffe9f3); color:#b23b76; border:1px solid var(--pink-2); }
      .df-badge.st-diproses   { background: linear-gradient(180deg,#fff,#eafbf3); color:#0f7a4c;  border:1px solid #bfead5; }
      .df-badge.st-selesai    { background: linear-gradient(180deg,#fff,#eef6ff); color:#1b5fb3;  border:1px solid #cfe0ff; }

      .df-row .df-mono button{
        background: linear-gradient(180deg,#f0f8ff,#e5f4ff);
        border: 1px solid #bae6fd;
      }

      .df-row{
        border-bottom: 1px dashed var(--pink-sep);
      }
    `}
      </style>
    </div>
  );
}
