import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { buildSurveyHtmlClient } from "../utils/surveyReportTemplate";

const detectVariant = (d) => {
  const t = (d.template || "").toLowerCase();
  const s = (d.jenisSurvei || d.jenisSurveyLabel || d.sifatCidera || "").toLowerCase();
  if (t.includes("kunjungan")) return "rs";
  if (t.includes("survei_md") || s.includes("meninggal")) return "md";
  if (t.includes("survei_ll") || s.includes("luka")) return "ll";
  return "ll";
};

const TABLE_BY_VARIANT = {
  rs: "form_kunjungan_rs",
  md: "form_survei_aw",
  ll: "form_survei_aw",
};

async function fetchDetailFromSupabase(rec) {
  const variant = detectVariant(rec);
  const table = TABLE_BY_VARIANT[variant];

  const ors = [];
  if (rec.id)         ors.push(`id.eq.${rec.id}`);
  if (rec.noPL)       ors.push(`no_pl.eq.${rec.noPL}`);

  // khusus RS
  if (variant === "rs") {
    if (rec.local_id) ors.push(`local_id.eq.${rec.local_id}`);
    if (rec.korban)   ors.push(`korban.eq.${rec.korban}`);
  } else {
    // survei_aw (MD/LL)
    if (rec.korban)   ors.push(`nama_korban.eq.${rec.korban}`);
  }

  if (ors.length === 0) {
    return { variant, table, row: null };
  }

  const { data, error } = await supabase
    .from(table)
    .select("*, petugas_ttd")
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn(`[detail] fetch ${table} gagal:`, error.message || error);
    return { variant, table, row: null };
  }
  return { variant, table, row: (data && data[0]) || null };
}

function normalizeDetailRow(variant, row) {
  if (!row) return {};

  const parseMaybe = (v) => {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  };

  const base = {
    id: row.local_id ?? row.id ?? row.uuid ?? null,
    createdAt: row.created_at ?? row.waktu ?? null,
    waktu: row.waktu ?? row.created_at ?? null,
    template:
      row.template ??
      (variant === "rs"
        ? "kunjungan_rs"
        : (row.jenis_survei
            ? (() => {
                const js = String(row.jenis_survei).toLowerCase();
                const isMD =
                  js.includes("meninggal") ||
                  js.includes("md") ||
                  js.includes("ahli waris");
                return `survei_${isMD ? "md" : "ll"}`;
              })()
            : "")
          ),

    // umum
    korban: row.korban ?? row.nama_korban ?? null,
    petugas: row.petugas ?? row.petugas_survei ?? null,
    jenisSurvei: row.jenis_survei ?? row.jenisSurvei ?? null,
    jenisSurveyLabel: row.jenis_survei_label ?? row.jenisSurveyLabel ?? row.jenis_survei ?? null,
    noPL: row.no_pl ?? row.noPL ?? null,
    hubunganSesuai: row.hubungan_sesuai ?? null,
    sumbers: parseMaybe(row.sumbers) ?? row.sumbers ?? [],
    uraian: row.uraian ?? null,

    tanggalKecelakaan: row.tanggal_kecelakaan ?? row.tanggalkecelakaan ?? row.tgl_kecelakaan ?? null,
    tglKecelakaan: row.tgl_kecelakaan ?? row.tanggal_kecelakaan ?? null,
    hariTanggal: row.hari_tanggal ?? row.hariTanggal ?? null,

    noBerkas: row.no_berkas ?? null,
    alamatKorban: row.alamat_korban ?? null,
    tempatKecelakaan: row.tempat_kecelakaan ?? row.lokasi_kecelakaan ?? null,

    status: row.status ?? "terkirim",
    verified: !!row.verified,
    verifiedAt: row.verified_at ?? null,
    verifyNote: row.verify_note ?? null,
    verifyChecklist: parseMaybe(row.verify_checklist) ?? row.verify_checklist ?? null,
    unverifiedAt: row.unverified_at ?? null,
    unverifyNote: row.unverify_note ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectNote: row.reject_note ?? null,
    finishedAt: row.finished_at ?? null,
    finishNote: row.finish_note ?? null,

    rating: row.rating ?? row.rating_value ?? null,
    feedback: row.feedback ?? row.feedback_text ?? null,
    petugasTtd: row.petugas_ttd || null,
  };

  if (variant === "rs") {
    const rawFotoSurvey =
      parseMaybe(row.foto_survey) ??
      parseMaybe(row.foto_survey_list) ??
      row.foto_survey ??
      row.foto_survey_list ??
      [];

    const fotoSurveyList = Array.isArray(rawFotoSurvey)
      ? rawFotoSurvey
      : (rawFotoSurvey && typeof rawFotoSurvey === "object"
          ? Object.values(rawFotoSurvey)
          : []);

    Object.assign(base, {
      // sesuai kolom yang kamu tunjukkan di screenshot RS:
      wilayah: row.wilayah ?? null,
      lokasiKecelakaan: row.lokasi_kecelakaan ?? row.tempat_kecelakaan ?? null,
      rumahSakit: row.rumah_sakit ?? row.nama_rs ?? null,
      tglMasukRS: row.tgl_masuk_rs ?? row.tanggal_masuk_rs ?? null,
      tglJamNotifikasi: row.tgl_jam_notifikasi ?? null,
      tglJamKunjungan: row.tgl_jam_kunjungan ?? null,
      uraianKunjungan: row.uraian_kunjungan ?? row.uraian ?? null,
      rekomendasi: row.rekomendasi ?? null,

      // tambahan yang kelihatan ada di tabel RS-mu:
      petugasJabatan: row.petugas_jabatan ?? null,
      petugasTtd: row.petugas_ttd ?? null,
      fotoSurveyList,
    });
  }

  // lampiran umum/fallback lain
  base.attachSurvey =
    parseMaybe(row.attach_survey) ??
    parseMaybe(row.attachSurvey) ??
    parseMaybe(row.att) ??
    parseMaybe(row.attachments) ??
    row.attachSurvey ?? row.attach_survey ?? row.att ?? row.attachments ?? {};

  // list foto lain (kalau ada di kolom berbeda)
  base.rsList   = parseMaybe(row.rs_list)   ?? row.rs_list   ?? [];
  base.fotoList = parseMaybe(row.foto_list) ?? row.foto_list ?? [];

  return base;
}

async function syncVerificationToSupabase(rec, payload) {
  const TABLES = ["dataform"];
  const nowIso = new Date().toISOString();

  const toTs = (v) => (v ? new Date(v).toISOString() : null);          
  const toDate = (v) => {                                               
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
        status: "ditolak",
        updated_at: nowIso,
      };
      break;
    default:
      updates = { updated_at: nowIso };
  }

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

  const updateByLocalId = async (table) =>
    await supabase
      .from(table)
      .update(updates)
      .eq("local_id", rec.id)
      .select("id, local_id");

  const upsertByLocalId = async (table) => {
    const counts = toJSON(rec.counts) || {};
    const files = toJSON(rec.files) || rec.files || null;
    const totalFiles =
      toInt(rec.totalFiles) ??
      (Array.isArray(rec.files) ? rec.files.length : null);

    const row = {
      local_id: String(rec.id),
      waktu: toTs(rec.waktu || rec.createdAt || nowIso),            
      template: rec.template ?? null,                                
      jenisSurvei: rec.jenisSurvei ?? null,                          
      jenisSurveyLabel: rec.jenisSurveyLabel ?? null,                
      noPL: rec.noPL ?? null,                                        
      korban: rec.korban ?? null,                                    
      petugas: rec.petugas ?? null,                                  
      tanggalKecelakaan: toDate(rec.tanggalKecelakaan || rec.tglKecelakaan), 
      status: updates.status ?? rec.status ?? "terkirim",
      rating: toInt(rec.rating),
      feedback: rec.feedback ?? null,
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
      totalFiles,
      counts: Object.keys(counts).length ? counts : null,           
      files: files ?? null,                                         
      createdAt: toTs(rec.createdAt || rec.waktu || nowIso),         
      updated_at: nowIso,                                            
      ownerId: rec.ownerId ?? null,                                  
    };

    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

    return await supabase
      .from(table)
      .upsert(row, { onConflict: "local_id" })
      .select("id, local_id");
  };

  for (const t of TABLES) {
    const { data, error } = await updateByLocalId(t);
    if (error) { console.warn(`⚠️ Update ${t} error:`, error); continue; }
    if (data && data.length) { console.log(`✅ Update OK di ${t}`, data); return data; }
  }

  for (const t of TABLES) {
    const { data, error } = await upsertByLocalId(t);
    if (error) { console.warn(`⚠️ Upsert ${t} error:`, error); continue; }
    if (data && data.length) { console.log(`✅ Upsert OK di ${t}`, data); return data; }
  }

  console.error("❌ Gagal simpan verifikasi (update & upsert gagal).");
  return null;
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
  const parseMaybeJson = (v) => {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  };

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

  const petugasTtdVal =
    row.petugas_ttd ??
    row.petugasTtd ??
    (attachSurvey && (
      attachSurvey.petugas_ttd ??
      attachSurvey.petugasTtd ??
      attachSurvey.ttdPetugas ??
      attachSurvey.signaturePetugas
    )) ??
    (blob && (blob.petugas_ttd ?? blob.petugasTtd)) ??
    null;

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

    petugasTtd: petugasTtdVal,
  
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
    rejectedAt: row.rejected_at ?? blob.rejectedAt ?? null,
    rejectNote: row.reject_note ?? blob.rejectNote ?? null,
    finishedAt: row.finished_at ?? blob.finishedAt ?? null,
    finishNote: row.finish_note ?? blob.finishNote ?? null,

    // ===== RATING/FEEDBACK =====
    rating: row.rating ?? row.rating_value ?? blob.rating ?? blob.rating_value ?? null,
    feedback: row.feedback ?? row.feedback_text ?? row.ulasan ?? blob.feedback ?? blob.feedback_text ?? blob.ulasan ?? null,

    // untuk sorting
    _updatedAt:
      row.updated_at ??
      row.verified_at ??
      row.unverified_at ??
      row.updated_at ??
      row.verified_at ??
      row.unverified_at ??
      row.rejected_at ??
      row.finished_at ??
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

  // --- util: detect variant (robust) ---
  const getVariant = (d) => {
    const t = String(d?.template || "").toLowerCase();
    const s = String(
      d?.jenisSurvei ||
      d?.jenisSurveyLabel ||
      d?.sifatCidera ||
      d?.sifatCedera ||   // antisipasi typo key
      ""
    ).toLowerCase();

    // Kunjungan RS
    if (t.includes("kunjungan") || t.includes("rs")) return "rs";

    // Meninggal Dunia / Ahli Waris (MD)
    if (
      t.includes("survei_md") ||
      t.includes("survei-md") ||
      t.includes("md") ||
      t.includes("ahli waris") ||
      s.includes("meninggal") ||
      s.includes("md") ||
      s.includes("ahli waris")
    ) return "md";

    // Luka-luka / TKP (LL)
    if (
      t.includes("survei_ll") ||
      t.includes("survei-ll") ||
      t.includes("ll") ||
      s.includes("luka")
    ) return "ll";

    return "ll";
  };

  const variant = data.__variant || getVariant(data);

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
      // ["Wilayah", data.wilayah || "-"],
      // ["Lokasi Kecelakaan", data.lokasiKecelakaan || "-"],
      // ["Kode/Nama RS", data.rumahSakit || "-"],
      ["Tanggal Kecelakaan", data.tglKecelakaan || fmtD(data.tanggalKecelakaan)],
      // ["Tanggal Masuk RS", data.tglMasukRS || "-"],
      // ["Tgl/Jam Notifikasi", data.tglJamNotifikasi || "-"],
      // ["Tgl/Jam Kunjungan", data.tglJamKunjungan || "-"],
      // ["Status", data.status || "terkirim"],
      // ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    ];
  } else if (variant === "md") {
    pairs = [
      ["ID", data.id],
      ["Waktu Submit", fmtDT(data.createdAt)],
      ["Template", "Survei Meninggal Dunia"],
      ["No. PL", data.noPL || "-"],
      ["Hari/Tanggal Survei", fmtDateLong(data.hariTanggal)],
      ["Petugas Survei", data.petugasSurvei || data.petugas || "-"],
      // ["Jenis Survei", data.jenisSurvei || data.jenisSurveyLabel || "Meninggal Dunia"],
      ["Nama Korban", data.namaKorban || data.korban || "-"],
      // ["No. Berkas", data.noBerkas || "-"],
      // ["Alamat Korban", data.alamatKorban || "-"],
      // ["Tempat/Tgl. Kecelakaan", `${data.tempatKecelakaan || "-"} / ${fmtDateLong(data.tglKecelakaan)}`],
      // ["Kesesuaian Hubungan AW", 
      //   data.hubunganSesuai === "" || data.hubunganSesuai == null
      //     ? "-" : (data.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")
      // ],
      // ["Status", data.status || "terkirim"],
      // ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    ];
  } else {
    pairs = [
      ["ID", data.id],
      ["Waktu Submit", fmtDT(data.createdAt)],
      ["Template", "Survei Luka-Luka"],
      ["No. PL", data.noPL || "-"],
      ["Hari/Tanggal Survei", fmtDateLong(data.hariTanggal)],
      ["Petugas Survei", data.petugasSurvei || data.petugas || "-"],
      // ["Jenis Survei", data.jenisSurvei || data.jenisSurveyLabel || "Luka-luka"],
      ["Nama Korban", data.namaKorban || data.korban || "-"],
      // ["No. Berkas", data.noBerkas || "-"],
      // ["Alamat Korban", data.alamatKorban || "-"],
      // ["Tempat/Tgl. Kecelakaan", `${data.tempatKecelakaan || "-"} / ${fmtDateLong(data.tglKecelakaan)}`],
      // ["Kesesuaian Hubungan AW", 
      //   data.hubunganSesuai === "" || data.hubunganSesuai == null
      //     ? "-" : (data.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")
      // ],
      // ["Status", data.status || "terkirim"],
      // ["Terverifikasi", data.verified ? "Ya" : "Belum"],
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
          {/* <div>
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
          </div> */}

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

export default function DataForm() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [templ, setTempl] = useState("all");
  const [status, setStatus] = useState("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [blobUrls, setBlobUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  const [toast, setToast] = useState(null);

  const syncFromSupabase = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error, status } = await supabase
        .from("dataform")
        .select("*")
        .order("waktu", { ascending: false });

      if (error) {
        console.error("❌ Supabase fetch error:", {
          message: error.message, details: error.details, hint: error.hint, code: error.code, status,
        });
        setRows([]);
        setToast({ type: "error", msg: "Gagal refresh data" });
        return;
      }

      const remote = (data || []).map(normalizeRemoteRow);
      setRows(remote);
      setLoadedAt(new Date());
      setToast({ type: "success", msg: "Data berhasil diperbarui" }); // ✅ toast sukses
      console.log("🟢 Supabase OK | rows:", remote.length);
    } catch (e) {
      console.error("❌ syncFromSupabase runtime error:", e);
      setRows([]);
      setToast({ type: "error", msg: e?.message || "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncFromSupabase();
  }, [syncFromSupabase]);

  const ts = (d) => {
    if (!d) return 0;
    const t = Date.parse(d);
    return Number.isFinite(t) ? t : 0;
  };

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (templ === "all" ? true : r.template === templ))
      .filter((r) => (status === "all" ? true : (r.status || "terkirim") === status))
      .filter((r) => {
        if (!q.trim()) return true;
        const hay = `${r.korban || ""}|${r.petugas || ""}|${r.noPL || ""}|${r.jenisSurveyLabel || ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => {
        const ta = ts(a.waktu ?? a.createdAt);
        const tb = ts(b.waktu ?? b.createdAt);
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

  const toDataURL = (file) =>
  new Promise(async (resolve) => {
    if (!file) return resolve("");

    // 1) kalau string
    if (typeof file === "string") {
      // kalau udah URL/dataURL, pake langsung
      if (/^(data:|https?:\/\/)/i.test(file)) return resolve(file);

      // kalau cuma nama file → bikin publicUrl
      try {
        const tryPaths = [
          `survey-images/${file}`,
          file, // fallback root
        ];

        for (const p of tryPaths) {
          const { data: urlData } = supabase.storage
            .from("foto-survey")
            .getPublicUrl(p);

          if (urlData?.publicUrl) return resolve(urlData.publicUrl);
        }
      } catch {}
      return resolve("");
    }

    // 2) kalau object udah ada url/dataURL
    if (file.dataURL) return resolve(file.dataURL);
    if (file.url) return resolve(file.url);

    // 3) kalau object tapi cuma ada fileName/path → generate publicUrl
    const fn = file.fileName || file.path || file.name || "";
    if (fn) {
      try {
        const tryPaths = [
          fn.includes("/") ? fn : `survey-images/${fn}`,
          fn,
        ];

        for (const p of tryPaths) {
          const { data: urlData } = supabase.storage
            .from("foto-survey")
            .getPublicUrl(p);

          if (urlData?.publicUrl) return resolve(urlData.publicUrl);
        }
      } catch {}
    }

    // 4) terakhir baru coba baca Blob/File
    const blob =
      file instanceof Blob
        ? file
        : file.file instanceof Blob
        ? file.file
        : null;

    if (!blob) return resolve("");

    const r = new FileReader();
    r.onload = () => resolve(r.result || "");
    r.onerror = () => resolve("");
    r.readAsDataURL(blob);
  });

  // =========================
  // 1) LAMPIRAN MD (SEMUA, PDF → IMAGE)
  // =========================
  const filePages = [];

  // helper skip ttd / sumber informasi
  const skipKeyRegex = /ttd|tanda\s*tangan|signature|sumber[-_\s]*informasi/i;

  // =========================
  // 1) Prefer attachSurvey kalau ada isinya
  // =========================
  const att = vv.attachSurvey && typeof vv.attachSurvey === "object"
    ? vv.attachSurvey
    : {};

  const attKeys = Object.keys(att);

  if (attKeys.length > 0) {
    const order = ["mapSS", "barcode"];
    const ordered = [
      ...order.filter((k) => k in att).map((k) => [k, att[k]]),
      ...Object.entries(att).filter(([k]) => !order.includes(k)),
    ];

    for (const [key, fileGroup] of ordered) {
      if (!fileGroup) continue;
      if (skipKeyRegex.test(key)) continue;
      if (typeof fileGroup === "boolean") continue;

      const files = Array.isArray(fileGroup) ? fileGroup : [fileGroup];
      for (const f of files) {
        if (!f || typeof f === "boolean") continue;

        const fname = (f?.name || f?.filename || "").toLowerCase();
        if (skipKeyRegex.test(fname)) continue;

        const src = await toDataURL(f);
        if (!src) continue;

        const isPdf =
          src.startsWith("data:application/pdf") ||
          /\.pdf(\?|$)/i.test(src) ||
          fname.endsWith(".pdf");

        if (isPdf) {
          try {
            const pdfFile = f.file instanceof File ? f.file : f;
            const imgs = await pdfToImages(pdfFile);
            imgs.forEach((imgSrc) => {
              filePages.push(`
                <div class="lampiran-page">
                  <img src="${imgSrc}" class="lampiran-img" />
                </div>
              `);
            });
          } catch {
            filePages.push(`
              <div class="lampiran-page">
                <div style="color:red;font-size:11pt;text-align:center">
                  [${escapeHtml(f?.name || key)}: PDF tidak dapat ditampilkan]
                </div>
              </div>
            `);
          }
          continue;
        }

        filePages.push(`
          <div class="lampiran-page">
            <img src="${src}" class="lampiran-img" />
          </div>
        `);
      }
    }
  }

  // =========================
  // 2) Fallback: kalau attachSurvey kosong, pakai vv.files
  // =========================
  if (filePages.length === 0 && Array.isArray(vv.files)) {
    const fallbackFiles = vv.files.filter((f) => {
      const key = (f.label || f.name || "").toLowerCase();
      return !skipKeyRegex.test(key); // buang ttd & sumber info
    });

    for (const f of fallbackFiles) {
      const src = await toDataURL(f);
      if (!src) continue;

      const fname = (f?.name || f?.fileName || "").toLowerCase();
      const isPdf =
        src.startsWith("data:application/pdf") ||
        /\.pdf(\?|$)/i.test(src) ||
        fname.endsWith(".pdf");

      if (isPdf) {
        filePages.push(`
          <div class="lampiran-page">
            <div style="color:red;font-size:11pt;text-align:center">
              [${escapeHtml(f?.name || f?.label || "Lampiran")}: PDF tidak bisa dipratinjau]
            </div>
          </div>
        `);
        continue;
      }

      filePages.push(`
        <div class="lampiran-page">
          <img src="${src}" class="lampiran-img" />
        </div>
      `);
    }
  }

  // =========================
  // 2) TABEL SUMBER INFORMASI
  // =========================
  const renderFotoCell = async (fotoField) => {
    if (!fotoField) return "";
    const files = Array.isArray(fotoField) ? fotoField : [fotoField];
    const pieces = [];

    const blobToDataURL = (blob) =>
      new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result || "");
        r.onerror = () => resolve("");
        r.readAsDataURL(blob);
      });

    for (const f of files) {
      if (!f) continue;

      let src = await toDataURL(f);

      // ===== FIX SUBFOLDER SUMBER INFORMASI =====
      if (
        (!src || /^https?:\/\//i.test(src)) &&
        (f.folder === "sumber-informasi" ||
          /sumber[-_\s]*informasi/i.test(f.fileName || f.path || f.name || ""))
      ) {
        try {
          // pakai path lengkap kalau ada subfolder
          let fullPath =
            f.path || f.fileName || f.name || "";

          // kalau belum ada prefix sumber-informasi/, tambahin
          if (!/^sumber-informasi\//i.test(fullPath)) {
            const clean = fullPath.replace(/^\/+/,"");
            fullPath = `sumber-informasi/${clean}`;
          }

          const { data, error } = await supabase.storage
            .from("foto-survey")
            .download(fullPath);

          if (!error && data) {
            src = await blobToDataURL(data);
          }
        } catch (e) {
          console.warn("gagal download sumber-informasi:", e);
        }
      }
      // =========================================

      if (!src) continue;
      if (src.startsWith("data:application/pdf")) {
        pieces.push(`<div style="font-size:10pt;color:#a00;">[PDF tidak bisa dipratinjau]</div>`);
        continue;
      }
      const isImg = src.startsWith("data:image") || /^https?:/.test(src);
      if (isImg) {
        pieces.push(`<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;" />`);
      }
    }

    return pieces.join("");
  };

  const rows = [];
  for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
    const r = vv.sumbers[i] || {};
    const fotoCell = await renderFotoCell(r.foto || r.ttd || r.signature);
    rows.push(`
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${escapeHtml(r.identitas || "")}</td>
        <td>${fotoCell}</td>
      </tr>
    `);
  }

  // =========================
  // 3) RETURN HTML MAIN (PAKE TEMPLATE STEP4)
  // =========================
  return buildSurveyHtmlClient(vv, {
    filePages,
    tableRows: rows.join(""),
  });
  }

  async function buildPreviewHTML_LL(vv, objURL) {
    console.log("🟢 LL DEBUG (inside builder):", {
      fotoSurveyList: vv.fotoSurveyList,
      attachSurvey: vv.attachSurvey,
      files: vv.files,
    });
    const escapeHtml = (str = "") =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const toDataURL = (file) =>
      new Promise((resolve) => {
        if (!file) return resolve("");
        if (typeof file === "string") return resolve(file);
        if (file.dataURL) return resolve(file.dataURL);
        if (file.url) return resolve(file.url);

        const fn = file.fileName || file.path || file.name;
        const folder = (file.folder || "").toLowerCase();

        if (fn) {
          // kalau item ini dari folder sumber-informasi
          if (folder === "sumber-informasi" || /sumber[-_\s]*informasi/i.test(fn)) {
            const clean = fn.replace(/^sumber-informasi\//i, "");
            const fullPath = `sumber-informasi/${clean}`;

            try {
              const { data: urlData } = supabase.storage
                .from("foto-survey")
                .getPublicUrl(fullPath);

              if (urlData?.publicUrl) return resolve(urlData.publicUrl);
            } catch {}
          }
        }
        
        const blob = file instanceof Blob ? file : file.file instanceof Blob ? file.file : null;
        if (!blob) return resolve("");
        const r = new FileReader();
        r.onload = () => resolve(r.result || "");
        r.onerror = () => resolve("");
        r.readAsDataURL(blob);
      });

    // =========================
    // 1) LAMPIRAN LL (MAP + BARCODE + FOTO SURVEY AJA)
    // =========================
    const filePages = [];
    if (Array.isArray(vv.files)) {
      const surveyFiles = vv.files.filter((f) =>
        /survey/i.test(f.label || f.jenis || f.name || f.fileName || "")
      );

      for (const f of surveyFiles) {
        const src = await toDataURL(f);
        if (!src) continue;

        // cegah duplikat
        if (filePages.some(p => p.includes(src))) continue;

        filePages.push(`
          <div class="lampiran-page">
            <img src="${src}" class="lampiran-img" />
          </div>
        `);
      }
    }
    if (Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length) {
      for (const f of vv.fotoSurveyList) {
        const src = await toDataURL(f);
        if (!src) continue;

        filePages.push(`
          <div class="lampiran-page">
            <img src="${src}" class="lampiran-img" />
          </div>
        `);
      }
    }
    const att = vv.attachSurvey || {};
    const attKeys = Object.keys(att);
    const skipKeyRegex = /ttd|tanda\s*tangan|signature|sumber[-_\s]*informasi/i;

      // kalau attachSurvey ada → pakai
      if (attKeys.length > 0 && filePages.length === 0) {
        const order = ["mapSS", "barcode", "fotoSurvey"];
        const ordered = [...order.filter((k) => k in att).map((k) => [k, att[k]])];

        for (const [key, fileGroup] of ordered) {
          if (!fileGroup || typeof fileGroup === "boolean") continue;
          if (skipKeyRegex.test(key)) continue;

          const files = Array.isArray(fileGroup) ? fileGroup : [fileGroup];
          for (const f of files) {
            if (!f || typeof f === "boolean") continue;

            const fname = (f?.name || f?.filename || f?.fileName || "").toLowerCase();
            if (skipKeyRegex.test(fname)) continue;

            const src = await toDataURL(f);
            if (!src) continue;

            const isPdf =
              src.startsWith("data:application/pdf") ||
              /\.pdf(\?|$)/i.test(src);

            if (isPdf) {
              filePages.push(`
                <div class="lampiran-page">
                  <div style="font-size:10pt;color:#a00;text-align:center">
                    [${escapeHtml(f?.name || key)}: PDF tidak bisa dipratinjau]
                  </div>
                </div>
              `);
              continue;
            }

            filePages.push(`
              <div class="lampiran-page">
                <img src="${src}" class="lampiran-img" />
              </div>
            `);
          }
        }
      }

      // fallback kalau kosong
      if (filePages.length === 0 && Array.isArray(vv.files)) {
        const allowRegex = /(mapss|map_ss|maps|barcode|qr|foto\s*survey|survey)/i;

        const fallbackFiles = vv.files.filter((f) => {
          const label = (f.label || f.name || f.jenis || "").toLowerCase();
          const folder = (f.folder || "").toLowerCase();
          const fileName = (f.fileName || f.name || "").toLowerCase();

          // cuma yang terkait survey, barcode, mapss
          if (!allowRegex.test(label) && !allowRegex.test(fileName)) return false;

          // extra safety: harus dari survey-images
          if (folder && folder !== "survey-images") return false;

          return true;
        });

        for (const f of fallbackFiles) {
          const src = await toDataURL(f);
          if (!src) continue;

          const fname = (f?.name || f?.fileName || "").toLowerCase();
          const isPdf =
            src.startsWith("data:application/pdf") ||
            /\.pdf(\?|$)/i.test(src) ||
            fname.endsWith(".pdf");

          if (isPdf) {
            filePages.push(`
              <div class="lampiran-page">
                <div style="font-size:10pt;color:#a00;text-align:center">
                  [${escapeHtml(f?.name || f?.label || "Lampiran")}: PDF tidak bisa dipratinjau]
                </div>
              </div>
            `);
            continue;
          }

          filePages.push(`
            <div class="lampiran-page">
              <img src="${src}" class="lampiran-img" />
            </div>
          `);
        }
      }

    // =========================
    // 2) TABEL SUMBER INFORMASI
    // =========================
    const renderFotoCell = async (fotoField) => {
      if (!fotoField) return "";
      const files = Array.isArray(fotoField) ? fotoField : [fotoField];
      const pieces = [];

      const blobToDataURL = (blob) =>
        new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result || "");
          r.onerror = () => resolve("");
          r.readAsDataURL(blob);
        });

      for (const f of files) {
        if (!f) continue;

        let src = await toDataURL(f);

        // ===== FIX SUBFOLDER SUMBER INFORMASI =====
        if (
          (!src || /^https?:\/\//i.test(src)) &&
          (f.folder === "sumber-informasi" ||
            /sumber[-_\s]*informasi/i.test(f.fileName || f.path || f.name || ""))
        ) {
          try {
            // pakai path lengkap kalau ada subfolder
            let fullPath =
              f.path || f.fileName || f.name || "";

            // kalau belum ada prefix sumber-informasi/, tambahin
            if (!/^sumber-informasi\//i.test(fullPath)) {
              const clean = fullPath.replace(/^\/+/,"");
              fullPath = `sumber-informasi/${clean}`;
            }

            const { data, error } = await supabase.storage
              .from("foto-survey")
              .download(fullPath);

            if (!error && data) {
              src = await blobToDataURL(data);
            }
          } catch (e) {
            console.warn("gagal download sumber-informasi:", e);
          }
        }
        // =========================================

        if (!src) continue;
        if (src.startsWith("data:application/pdf")) {
          pieces.push(`<div style="font-size:10pt;color:#a00;">[PDF tidak bisa dipratinjau]</div>`);
          continue;
        }
        const isImg = src.startsWith("data:image") || /^https?:/.test(src);
        if (isImg) {
          pieces.push(`<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;" />`);
        }
      }

      return pieces.join("");
    };

    const rows = [];
    for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
      const r = vv.sumbers[i] || {};
      const fotoCell = await renderFotoCell(r.foto || r.ttd || r.signature);
      rows.push(`
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${escapeHtml(r.identitas || "")}</td>
          <td>${fotoCell}</td>
        </tr>
      `);
    }

    // =========================
    // 3) RETURN HTML MAIN (PAKE TEMPLATE STEP4)
    // =========================
    return buildSurveyHtmlClient(vv, {
      filePages,
      tableRows: rows.join(""),
    });
  }

  //jangan otak atik lagi ya udah bener ini
  function buildPreviewHTML_RS(vv, objURL) {
    const escapeHtml = (str = "") =>
        String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

  // Coba berbagai kemungkinan struktur
  if (vv.attachSurvey) {
      if (Array.isArray(vv.attachSurvey)) {
          console.log("📋 attachSurvey is ARRAY");
          vv.attachSurvey.forEach((item, idx) => {
              console.log(`   [${idx}]`, item);
              console.log(`      - type:`, typeof item);
              console.log(`      - keys:`, item ? Object.keys(item) : 'null');
          });
      } else {
          console.log("📋 attachSurvey is OBJECT");
          Object.entries(vv.attachSurvey).forEach(([key, value]) => {
              console.log(`   ${key}:`, value);
              console.log(`      - type:`, typeof value);
              if (Array.isArray(value)) {
                  value.forEach((item, idx) => {
                      console.log(`        [${idx}]`, item);
                });
            }
        });
      }
    }

    const fotoCandidates = [];

    // PRIORITAS 1: Cari dari fotoSurveyList (ternyata di sini datanya)
    if (vv.fotoSurveyList && Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length > 0) {
        console.log("✅✅✅ FOUND fotoSurveyList with photos:", vv.fotoSurveyList.length);
        fotoCandidates.push(...vv.fotoSurveyList);
    }

    // PRIORITAS 1b: kalau belum ada, pakai allPhotos
    if (fotoCandidates.length === 0 && vv.allPhotos && Array.isArray(vv.allPhotos)) {
      console.log("🔄 Fallback to allPhotos:", vv.allPhotos.length);
      fotoCandidates.push(...vv.allPhotos);
    }

    // PRIORITAS 2: Cari dari attachSurvey 
    else if (vv.attachSurvey && typeof vv.attachSurvey === 'object') {
        console.log("🔄 Using attachSurvey");
        
        if (Array.isArray(vv.attachSurvey)) {
            console.log(`📸 attachSurvey is array with ${vv.attachSurvey.length} items`);
            fotoCandidates.push(...vv.attachSurvey);
        } 
        else {
            Object.entries(vv.attachSurvey).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    value.forEach((item, i) => {
                        if (item && typeof item === 'object') {
                            fotoCandidates.push(item);
                        } else if (item) {
                            fotoCandidates.push({ url: item, name: `Foto ${i+1}` });
                        }
                    });
                } 
                else if (value && typeof value === 'object') {
                    fotoCandidates.push(value);
                }
                else if (value && typeof value === 'string' && /^https?:\/\//.test(value)) {
                    fotoCandidates.push({ url: value, name: key });
                }
            });
        }
    }

    // PRIORITAS 3: Cek foto_survey sebagai fallback
    else if (vv.foto_survey) {
        console.log("🔄 Using foto_survey as fallback");
        if (Array.isArray(vv.foto_survey)) {
            fotoCandidates.push(...vv.foto_survey);
        } 
        else if (typeof vv.foto_survey === 'string') {
            try {
                const parsed = JSON.parse(vv.foto_survey);
                if (Array.isArray(parsed)) {
                    fotoCandidates.push(...parsed);
                }
            } catch (parseError) {
                console.error("❌ Error parsing foto_survey:", parseError);
            }
        }
    }
  
    const testFiles = [
        '1763206986877_x5ai868_foto_1763206986877.png',
        '1763206988448_uemeoc5_foto_1763206988448.png'
    ];

    testFiles.forEach(fileName => {
      // Test dengan folder survey-images
      const testPath1 = `survey-images/${fileName}`;
      const { data: testUrlData1 } = supabase.storage
          .from('foto-survey')
          .getPublicUrl(testPath1);
      
      // Test tanpa folder (langsung di root bucket)
      const { data: testUrlData2 } = supabase.storage
          .from('foto-survey')
          .getPublicUrl(fileName);
      
      console.log("🧪 FILE:", fileName);
      console.log("🧪 Dengan folder survey-images:", testUrlData1?.publicUrl);
      console.log("🧪 Tanpa folder (root):", testUrlData2?.publicUrl);
      console.log("---");
    });

    const toSrc = (fotoObj) => {
      if (!fotoObj) {
          console.log("❌ fotoObj is null/undefined");
          return "";
      }
      
      console.log("🔍 Processing foto object:", fotoObj);
      
      // Case 1: Jika fotoObj adalah string langsung (URL)
      if (typeof fotoObj === 'string') {
          console.log("✅ Using string as URL:", fotoObj);
          return fotoObj;
      }
      
      // Case 2: Prioritaskan URL yang sudah ada
      if (fotoObj.url && typeof fotoObj.url === 'string') {
          console.log("✅ Using existing URL:", fotoObj.url);
          return fotoObj.url;
      }
      
      // Case 3: Handle path Supabase - PERBAIKI: survey-images (bukan survey_images)
      if (fotoObj.path && typeof fotoObj.path === 'string') {
          console.log("🔄 Generating URL from path:", fotoObj.path);
          try {
              // PERBAIKAN: Gunakan survey-images (dengan DASH)
              let storagePath = fotoObj.path;
              
              // Jika path tidak mengandung folder survey-images, tambahkan
              if (!storagePath.includes('survey-images/')) {
                  storagePath = `survey-images/${storagePath}`;
              }
              
              const { data: urlData } = supabase.storage
                  .from('foto-survey')
                  .getPublicUrl(storagePath);
              
              const generatedUrl = urlData?.publicUrl;
              if (generatedUrl) {
                  console.log("✅ Generated URL from path:", generatedUrl);
                  return generatedUrl;
              }
          } catch (error) {
              console.error("❌ Error generating URL from path:", error);
          }
      }
      
      // Case 4: Fallback ke fileName - PERBAIKI: survey-images (bukan survey_images)
      if (fotoObj.fileName && typeof fotoObj.fileName === 'string') {
          console.log("🔄 Generating URL from fileName:", fotoObj.fileName);
          try {
              // PERBAIKAN: Gunakan folder survey-images (dengan DASH)
              const fullPath = fotoObj.fileName.includes("survey-images/")
               ? fotoObj.fileName
               : `survey-images/${fotoObj.fileName}`;

              const { data: urlData } = supabase.storage
                  .from('foto-survey')
                  .getPublicUrl(fullPath);
              
              const generatedUrl = urlData?.publicUrl;
              if (generatedUrl) {
                  console.log("✅ Generated URL from fileName:", generatedUrl);
                  return generatedUrl;
              }
          } catch (error) {
              console.error("❌ Error generating URL from fileName:", error);
          }
      }
      
      // Case 5: Cek langsung nama file tanpa folder (fallback)
      if (fotoObj.fileName && typeof fotoObj.fileName === 'string') {
          console.log("🔄 Trying direct fileName without folder:", fotoObj.fileName);
          try {
              const { data: urlData } = supabase.storage
                  .from('foto-survey')
                  .getPublicUrl(fotoObj.fileName);
              
              const generatedUrl = urlData?.publicUrl;
              if (generatedUrl) {
                  console.log("✅ Generated URL from direct fileName:", generatedUrl);
                  return generatedUrl;
              }
          } catch (error) {
              console.error("❌ Error generating URL from direct fileName:", error);
          }
      }
      
      // Case 6: Data URL
      if (fotoObj.dataURL && typeof fotoObj.dataURL === 'string') {
          console.log("✅ Using dataURL");
          return fotoObj.dataURL;
      }
      
      console.log("❌ No valid source found for foto object");
      return "";
    };

    // Process semua foto candidates
    const processedFotos = fotoCandidates.map((foto, index) => {
      console.log(`🔄 Processing candidate ${index}:`, foto);
        const src = toSrc(foto);
          
        if (!src) {
          console.log(`❌ Skipping foto ${index} - no source`);
          return null;
        }
          
        const name = escapeHtml(
          foto.name || 
          foto.fileName || 
          foto.originalName ||
          `Foto Survey ${index + 1}`
        );
        
        const isPdf = src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
        
        if (isPdf) {
            return `
                <div style="margin:10px; padding:10px; border:1px solid #ddd; border-radius:8px; text-align:center;">
                    <div style="font-size:14px; color:#d32f2f; margin-bottom:5px;">📄 PDF Document</div>
                    <div style="font-size:12px; color:#666;">${name}</div>
                </div>`;
        }
        
        return `
            <div style="margin:10px; padding:10px; border:1px solid #ddd; border-radius:8px; text-align:center; background:#f9f9f9;">
                <img src="${src}" alt="${name}" 
                     style="max-width:250px; max-height:250px; border:1px solid #ccc; border-radius:6px; margin-bottom:8px;"
                     onerror="console.error('Failed to load image:', this.src); this.style.display='none'; this.nextElementSibling.innerHTML='Gagal memuat gambar'"/>
                <div style="font-size:12px; color:#333; word-break:break-word;">${name}</div>
                ${foto.uploadedAt ? 
                    `<div style="font-size:10px; color:#888; margin-top:2px;">
                        ${new Date(foto.uploadedAt).toLocaleDateString('id-ID')}
                    </div>` : ''
                }
            </div>`;
    }).filter(Boolean);

    console.log("✅ Processed fotos:", processedFotos.length);

    const fotosHTML = processedFotos.length > 0
        ? processedFotos.join("")
        : `<div style="text-align:center; color:#666; font-style:italic; padding:20px; border:1px dashed #ccc; border-radius:8px;">
            Tidak ada foto survey yang dilampirkan
            <br/><small>Debug: attachSurvey=${vv.attachSurvey ? 'exists' : 'null'}, foto_survey=${vv.foto_survey ? 'exists' : 'null'}, candidates=${fotoCandidates.length}</small>
          </div>`;

    console.log("✅ Final fotosHTML with", processedFotos.length, "photos");

    // TTD handling (tetap sama)
    const petugasSrc = (() => {
        const raw = (vv.petugas_ttd || vv.petugasTtd || "").toString().trim();
        
        console.log("RS preview petugas_ttd RAW:", raw);
        
        if (!raw) {
            console.log("❌ TTD petugas kosong");
            return null;
        }

        if (/^https?:\/\//i.test(raw)) {
            console.log("✅ Sudah URL lengkap:", raw);
            return raw;
        }

        let storagePath = raw;
        if (!raw.includes('/')) {
            storagePath = `ttd-petugas/${raw}`;
        }
        else if (raw.startsWith('ttd-petugas/')) {
            storagePath = raw;
        }

        console.log("🔄 Using TTD storage path:", storagePath);

        try {
            const { data: urlData } = supabase.storage
                .from('foto-survey')
                .getPublicUrl(storagePath);
            
            const generatedUrl = urlData?.publicUrl;
            console.log("🔗 Generated TTD URL:", generatedUrl);
            
            return generatedUrl;
        } catch (error) {
            console.error("❌ Error generating TTD URL:", error);
            return null;
        }
    })();

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
            .foto-container { display:flex; flex-wrap:wrap; margin-top:30px; gap:10px; justify-content:center; }
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
            <tr><td class="label">Lokasi Kecelakaan</td><td>: ${escapeHtml(vv.lokasi_kecelakaan || vv.lokasiKecelakaan || "-")}</td></tr>
            <tr><td class="label">Kode RS / Nama RS</td><td>: ${escapeHtml(vv.rumah_sakit || vv.rumahSakit || "-")}</td></tr>
            <tr><td class="label">Tanggal Kecelakaan</td><td>: ${escapeHtml(vv.tanggal_kecelakaan || vv.tglKecelakaan || "-")}</td></tr>
            <tr><td class="label">Tanggal Masuk RS</td><td>: ${escapeHtml(vv.tgl_masuk_rs || vv.tglMasukRS || "-")}</td></tr>
            <tr><td class="label">Tanggal & Jam Notifikasi</td><td>: ${escapeHtml(vv.tgl_jam_notifikasi || vv.tglJamNotifikasi || "-")}</td></tr>
            <tr><td class="label">Tanggal & Jam Kunjungan</td><td>: ${escapeHtml(vv.tgl_jam_kunjungan || vv.tglJamKunjungan || "-")}</td></tr>
        </table>

        <div class="section-title">Uraian Hasil Kunjungan:</div>
        <div class="box">${escapeHtml(vv.uraian || vv.uraianKunjungan || "") || "<i>Belum diisi.</i>"}</div>

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
                Petugas yang melakukan kunjungan,<br/><br/>
                ${petugasSrc
                    ? `<img src="${petugasSrc}" alt="TTD Petugas" style="max-height:80px; display:block; margin:4px auto;" 
                        onerror="this.style.display='none'"/>`
                    : "<br/><br/><br/>"
                }
                <b>${escapeHtml(vv.petugas || "................................")}</b><br/>
                <i>${escapeHtml(vv.petugas_jabatan || vv.petugasJabatan || "")}</i>
            </div>
        </div>

        <div style="margin-top:40px; border-top:2px solid #000; padding-top:20px;">
            <div style="font-weight:bold; margin-bottom:15px; text-align:center;">FOTO SURVEY YANG DILAMPIRKAN</div>
            <div class="foto-container">${fotosHTML}</div>
        </div>
    </body>
    </html>`;
  }

  function extractTimestampFromFileName(fileName) {
    console.log(`🔍 Extracting timestamp from: ${fileName}`);
    
    // Pattern 1: {timestamp}_{random}_{original_name}
    const pattern1 = fileName.match(/^(\d+)_/);
    if (pattern1 && pattern1[1]) {
      const timestamp = parseInt(pattern1[1]);
      if (!isNaN(timestamp) && timestamp > 1600000000000) {
        console.log(`✅ Extracted timestamp: ${timestamp} from ${fileName}`);
        return new Date(timestamp).toISOString();
      }
    }
    
    // Pattern 2: Cari angka timestamp di nama file
    const pattern2 = fileName.match(/(\d{10,13})/);
    if (pattern2 && pattern2[1]) {
      const timestamp = parseInt(pattern2[1]);
      if (!isNaN(timestamp) && timestamp > 1600000000000) {
        console.log(`✅ Extracted timestamp: ${timestamp} from ${fileName}`);
        return new Date(timestamp).toISOString();
      }
    }
    
    console.log(`❌ No timestamp found in: ${fileName}`);
    return null;
  }

  async function listAllInFolder(bucket, baseFolder) {
    const out = [];

    const { data: items, error } = await supabase.storage
      .from(bucket)
      .list(baseFolder);

    if (error || !items) return out;

    for (const it of items) {
      const isFolder = !it.metadata;

      if (isFolder) {
        const subFolder = `${baseFolder}/${it.name}`;
        const { data: subItems } = await supabase.storage
          .from(bucket)
          .list(subFolder);

        if (subItems?.length) {
          subItems.forEach((f) => {
            out.push({
              ...f,
              folder: baseFolder,
              path: `${subFolder}/${f.name}`, // ✅ path penuh
            });
          });
        }
      } else {
        out.push({
          ...it,
          folder: baseFolder,
          path: `${baseFolder}/${it.name}`,
        });
      }
    }

    return out;
  }

  async function loadFilesWithMetadata() {
    console.log('🔍 Loading files with metadata...');
    
    let allFiles = [];

    try {
      // Load dari survey-images
      const { data: surveyImagesFiles, error: surveyImagesError } = await supabase.storage
        .from('foto-survey')
        .list('survey-images');
      
      if (!surveyImagesError && surveyImagesFiles) {
        console.log('📁 Raw files from Supabase:', surveyImagesFiles);
        
        // Untuk setiap file, ambil metadata
        const filesWithMetadata = await Promise.all(
          surveyImagesFiles.map(async (file) => {
            try {
              // ✅ ALTERNATIF: Extract timestamp dari nama file
              // Biasanya format: {timestamp}_{random}_{original_name}
              const timestampFromName = extractTimestampFromFileName(file.name);
              
              const safeName = encodeURIComponent(file.name);
              const fileUrl = `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/survey-images/${safeName}`;
              
              return {
                ...file,
                url: fileUrl,
                folder: 'survey-images',
                uploadedAt: timestampFromName,
                timestamp: timestampFromName ? new Date(timestampFromName).getTime() : null
              };
            } catch (error) {
              console.error(`❌ Error getting metadata for ${file.name}:`, error);
              return null;
            }
          })
        );
        
        // Filter out null values dan urutkan berdasarkan timestamp
        const validFiles = filesWithMetadata.filter(Boolean);
        validFiles.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        allFiles = [...allFiles, ...validFiles];
        console.log('✅ Files with metadata:', validFiles);
      }

      const sumberInfoFiles = await listAllInFolder("foto-survey", "sumber-informasi");

      if (sumberInfoFiles && sumberInfoFiles.length) {
        const sumberInfoWithUrl = sumberInfoFiles.map((file) => {
          const timestampFromName = extractTimestampFromFileName(file.name);

          // ✅ pakai file.path karena sudah lengkap sampai subfolder
          const fileUrl =
            `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/${file.path}`;

          return {
            ...file,
            url: fileUrl,
            folder: "sumber-informasi",
            uploadedAt: timestampFromName,
            timestamp: timestampFromName ? new Date(timestampFromName).getTime() : null,
          };
        });

        allFiles = [...allFiles, ...sumberInfoWithUrl];
        console.log("✅ Loaded sumber-informasi files:", sumberInfoWithUrl.length);
      }

      // === TAMBAHAN: LOAD FOLDER DOKUMEN (RECURSIVE, SUPPORT SUBFOLDER) ===
      const docFolders = [
        "kk",
        "ktp",
        "akta-kelahiran",
        "buku-tabungan",
        "form-ahli-waris",
        "form-pengajuan",
        "surat-kematian",
      ];

      for (const folder of docFolders) {
        try {
          console.log(`📁 Loading documents recursively from: ${folder}`);

          // ✅ recursive list (folder bisa punya subfolder)
          const docFiles = await listAllInFolder("foto-survey", folder);

          if (docFiles && docFiles.length) {
            const docFilesWithMeta = docFiles.map((file) => {
              const timestampFromName = extractTimestampFromFileName(file.name);

              // ✅ pakai file.path karena sudah full sampai subfolder
              const fileUrl =
                `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/${file.path}`;

              return {
                ...file,
                url: fileUrl,
                folder,
                uploadedAt: timestampFromName,
                timestamp: timestampFromName
                  ? new Date(timestampFromName).getTime()
                  : null,
              };
            });

            allFiles = [...allFiles, ...docFilesWithMeta];
            console.log(`✅ Loaded ${docFilesWithMeta.length} files from ${folder}`);
          } else {
            console.log(`⚠️ No files found in ${folder}`);
          }
        } catch (e) {
          console.error(`❌ Error loading docs from ${folder}:`, e);
        }
      }
      // === END TAMBAHAN ===

    } catch (error) {
      console.error('❌ Error loading files with metadata:', error);
    }
    
    console.log('📚 TOTAL ALL FILES LOADED:', allFiles.length);
    
    // Log summary per folder
    const filesByFolder = {};
    allFiles.forEach(file => {
      if (!filesByFolder[file.folder]) filesByFolder[file.folder] = 0;
      filesByFolder[file.folder]++;
    });
    console.log('📊 FILES COUNT BY FOLDER:', filesByFolder);
    
    return allFiles;
  }

  function pickNearestCluster(files, recordTime, windowMs = 2*60*1000, gapMs = 60*1000) {
    const within = files
      .filter(f => f.timestamp && Math.abs(f.timestamp - recordTime) <= windowMs)
      .sort((a,b) => a.timestamp - b.timestamp);

    if (!within.length) return [];

    // cari file TERDEKAT ke recordTime
    let nearestIdx = 0;
    let nearestDiff = Infinity;
    within.forEach((f, i) => {
      const d = Math.abs(f.timestamp - recordTime);
      if (d < nearestDiff) { nearestDiff = d; nearestIdx = i; }
    });

    // ambil “rombongan upload” di kiri-kanan
    let start = nearestIdx;
    let end = nearestIdx;

    while (start > 0) {
      const gap = within[start].timestamp - within[start-1].timestamp;
      if (gap > gapMs) break;
      start--;
    }
    while (end < within.length - 1) {
      const gap = within[end+1].timestamp - within[end].timestamp;
      if (gap > gapMs) break;
      end++;
    }

    return within.slice(start, end + 1);
  }

  async function prepareForOutput(rec) {
    console.log('🆕 === STARTING NEW INPUT PROCESSING ===');
    console.log('📋 Input data:', {
      id: rec.id,
      noPL: rec.noPL,
      waktu: rec.waktu,
      createdAt: rec.createdAt
    });

    const vv = {
      allPhotos: [],
      sumbers: [],
      fotoSurveyList: [],
      attachSurvey: {},
      files: []
    };

    const files = [];

    const seenFiles = new Set();
    const makeSig = (f) => {
      const folder = (f.folder || "").toLowerCase();
      const fileName = (f.fileName || f.path || f.name || "").toLowerCase();
      const url = (f.url || f.dataURL || "").toLowerCase();
      return `${folder}|${fileName}|${url}`;
    };

    const pushFile = (f, label = "Lampiran", source = "unknown") => {
      if (!f) {
        console.log(`❌ Skip ${label} - null/undefined`);
        return;
      }

      const sig = makeSig(f);
        if (seenFiles.has(sig)) {
          console.log(`🟡 Skip duplicate: ${label}`, sig);
          return;
        }
        seenFiles.add(sig);

      const hasValidIdentifier = f.fileName || f.path || f.url || f.name;
      if (!hasValidIdentifier) {
        console.log(`❌ Skip ${label} - no valid identifier`, f);
        return;
      }
      
      console.log(`✅ Adding file from ${source}:`, { 
        label, 
        fileName: f.fileName,
        path: f.path,
        name: f.name 
      });

      if (typeof f === "string") {
        files.push({ 
          label, 
          name: f.split("/").pop() || label, 
          fileName: f,
          url: f 
        });
        return;
      }

      // Object - Handle berbagai format Supabase
      const name = f.name || f.fileName || f.filename || f.label || label;
      const url = f.url || f.dataURL;
      const fileName = f.fileName || f.path || f.filename;
      
      const entry = {
        type: f.type || "foto",
        label: f.label || label,
        name,
        url: url,
        fileName: fileName,
        path: f.path,
        dataURL: f.dataURL,
        file: f.file instanceof File ? f.file : undefined,
        size: f.size,
        uploadedAt: f.uploadedAt || f.createdAt,
        inputId: rec.id,
        recordTime: rec.createdAt || rec.waktu
      };
      
      files.push(entry);
    };

    console.log('🔍 [TIME-BASED] Searching files based on upload time...');
  
const allFilesWithMetadata = await loadFilesWithMetadata();
const recordTime = new Date(rec.createdAt || rec.waktu).getTime();
console.log(`🕐 Record created at: ${new Date(recordTime).toLocaleString('id-ID')}`);

const allSurveyFiles = allFilesWithMetadata.filter(f => f.folder === "survey-images");

// kalau ada counts fotoSurvey, pakai buat batas jumlah
const expectedCount =
  rec.counts?.fotoSurvey ||
  rec.totalFiles ||
  null;

let picked = pickNearestCluster(allSurveyFiles, recordTime);

// kalau kebanyakan, ambil yang paling dekat sesuai expectedCount
if (expectedCount && picked.length > expectedCount) {
  picked = [...picked]
    .sort((a,b) =>
      Math.abs(a.timestamp - recordTime) - Math.abs(b.timestamp - recordTime)
    )
    .slice(0, expectedCount)
    .sort((a,b) => a.timestamp - b.timestamp);
}

if (picked.length > 0) {
  console.log(`🎯 Picked ${picked.length} clustered files`);

  picked.forEach((file, index) => {
    pushFile({
      name: `survey_${index + 1}`,
      fileName: file.name,
      url: file.url,
      folder: file.folder,
      uploadedAt: file.timestamp ? new Date(file.timestamp).toISOString() : null,
      timeDiff: Math.abs(file.timestamp - recordTime),
      inputId: rec.id,
      timestamp: file.timestamp
    }, `Foto Survey ${index + 1}`, "time-cluster");
  });

} else {
  console.log("❌ No clustered files found, fallback latest 3");

  const latestFiles = allSurveyFiles
    .filter(f => f.timestamp)
    .sort((a,b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  latestFiles.forEach((file, index) => {
    pushFile({
      name: `fallback_${index + 1}`,
      fileName: file.name,
      url: file.url,
      folder: file.folder,
      uploadedAt: file.timestamp ? new Date(file.timestamp).toISOString() : null,
      inputId: rec.id,
      timestamp: file.timestamp
    }, `Foto ${index + 1}`, "fallback");
  });
}
    console.log('🔍 [SOURCE-INFO] Searching for sumber informasi photos...');

    // Cari foto yang cocok untuk sumber informasi berdasarkan waktu
    const allSumberFiles = allFilesWithMetadata
      .filter(f => f.folder === "sumber-informasi" && f.timestamp)
      .sort((a,b) => a.timestamp - b.timestamp);

    // 1) coba window ±5 menit dulu
    let sumberInfoFiles = allSumberFiles.filter(f => {
      const diff = Math.abs(f.timestamp - recordTime);
      return diff <= (2 * 60 * 1000);
    });

    // 2) kalau kosong, ambil cluster terdekat seperti survey
    if (sumberInfoFiles.length === 0) {
      console.log("🔄 sumber-informasi kosong di window, coba cluster terdekat...");
      sumberInfoFiles = pickNearestCluster(allSumberFiles, recordTime);
    }

    // 3) kalau masih kosong, ambil latest sesuai jumlah data sumbers dari DB
    if (sumberInfoFiles.length === 0) {
      const expected =
        (Array.isArray(rec.sumbers) && rec.sumbers.length) ||
        (Array.isArray(rec.sumberInformasi) && rec.sumberInformasi.length) ||
        3;

      console.log("🔄 sumber-informasi kosong juga, fallback latest:", expected);
      sumberInfoFiles = [...allSumberFiles].slice(-expected);
    }

    if (sumberInfoFiles.length > 0) {
      console.log(`🎯 Found ${sumberInfoFiles.length} sumber informasi files`);
      
      // Urutkan berdasarkan waktu
      sumberInfoFiles.sort((a, b) => a.timestamp - b.timestamp);
      
      // Simpan di vv.sumbers untuk digunakan di preview
      if ((!vv.sumbers || vv.sumbers.length === 0) && Array.isArray(rec.sumbers) && rec.sumbers.length) {
        console.log("🟡 Fallback vv.sumbers dari rec.sumbers (cluster sumber info tidak ketemu)");
        
        vv.sumbers = rec.sumbers.map((s, idx) => ({
          identitas: s.identitas || s.nama || s.detail || `Sumber Informasi ${idx + 1}`,
          foto: Array.isArray(s.foto)
            ? s.foto.map(f => (typeof f === "string" ? { url: f } : f))
            : []
        }));
      }
      
      // Tambahkan ke sumbers array
      sumberInfoFiles.forEach((file, index) => {
        let sumberDataFromDB = null;

        console.log('🔍 MENCARI DATA SUMBER INFORMASI:');
        console.log('   - rec.sumberInformasi:', rec.sumberInformasi);
        console.log('   - rec.sumbers:', rec.sumbers);

        if (rec.sumberInformasi && Array.isArray(rec.sumberInformasi) && rec.sumberInformasi[index]) {
          sumberDataFromDB = rec.sumberInformasi[index];
          console.log(`✅ Found sumber data from rec.sumberInformasi[${index}]:`, sumberDataFromDB);
        } 
        else if (rec.sumbers && Array.isArray(rec.sumbers) && rec.sumbers[index]) {
          sumberDataFromDB = rec.sumbers[index];
          console.log(`✅ Found sumber data from rec.sumbers[${index}]:`, sumberDataFromDB);
        }
        else if (rec.attachSurvey && rec.attachSurvey.sumberInformasi && Array.isArray(rec.attachSurvey.sumberInformasi) && rec.attachSurvey.sumberInformasi[index]) {
          sumberDataFromDB = rec.attachSurvey.sumberInformasi[index];
          console.log(`✅ Found sumber data from attachSurvey.sumberInformasi[${index}]:`, sumberDataFromDB);
        }
        else {
          console.log(`❌ No sumber data found for index ${index}, using fallback`);
        }
        
        // Tambahkan foto ke sumber informasi
        if (!vv.sumbers[index]) {
          vv.sumbers[index] = {
            identitas: sumberDataFromDB?.identitas || 
                      sumberDataFromDB?.nama ||
                      sumberDataFromDB?.detail || 
                      sumberDataFromDB?.keterangan ||
                      sumberDataFromDB?.sumber || 
                      `Sumber Informasi ${index + 1}`, 
            foto: []
          };
          
          console.log(`📝 Set identitas for sumber ${index + 1}:`, vv.sumbers[index].identitas);
        }
        
        if (!vv.sumbers[index].foto) {
          vv.sumbers[index].foto = [];
        }

        vv.sumbers[index].foto.push({
          name: `sumber_info_${index + 1}`,
          fileName: file.name,
          url: file.url,
          folder: file.folder,
          inputId: rec.id
        });
        
        console.log(`✅ Added photo to sumber informasi ${index + 1}: ${file.name}`);
      });
    } else {
      console.log('❌ No sumber informasi files found');
    }

    if (vv.sumbers && Array.isArray(vv.sumbers)) {
      console.log('🔍 Processing existing sumbers data:', vv.sumbers.length);
      
      vv.sumbers.forEach((sumber, index) => {
        if (sumber.foto && Array.isArray(sumber.foto)) {
          // Process each foto in the sumber
          sumber.foto.forEach((foto, fotoIndex) => {
            if (foto && !foto.url) {
              // Jika foto punya fileName tapi belum punya URL, generate URL
              if (foto.fileName) {
                const matchingFile = allFilesWithMetadata.find(file => 
                  file.name === foto.fileName && file.folder === 'sumber-informasi'
                );
                
                if (matchingFile) {
                  foto.url = matchingFile.url;
                  console.log(`✅ Assigned URL to sumber ${index + 1} foto ${fotoIndex + 1}: ${foto.fileName}`);
                }
              }
            }
          });
        }
      });
    }

    vv.id = rec.id || rec.local_id || rec.row_id || rec.uuid || `${rec.waktu || rec.created_at || Date.now()}__${rec.no_pl || rec.noPL || "nop"}__${rec.template || "tpl"}`;

    vv.createdAt = rec.createdAt || rec.waktu || rec.created_at || new Date().toISOString();
    vv.waktu     = rec.waktu     || vv.createdAt;

    // --- Template & label ---
    const tpl = (rec.template || "").toLowerCase();
    vv.template = rec.template || "";
    vv.jenisSurveyLabel = rec.jenisSurveyLabel || rec.jenis_survey_label || rec.jenisSurvei || rec.jenis_survei || rec.sifatCidera || "";
    vv.jenisSurvei = rec.jenisSurvei || rec.jenis_survei || (tpl.includes("survei_md") ? "Meninggal Dunia" : tpl.includes("survei_ll") ? "Luka-luka" : "");

    // --- Data umum / identitas ---
    vv.petugas     = rec.petugas || rec.petugasSurvei || "";
    vv.petugasSurvei = rec.petugasSurvei || rec.petugas || "";
    vv.korban      = rec.korban || rec.namaKorban || "";
    vv.namaKorban  = rec.namaKorban || rec.korban || "";
    vv.noPL        = rec.noPL || rec.no_pl || "";
    vv.noBerkas    = rec.noBerkas || "";
    vv.alamatKorban= rec.alamatKorban || "";
    vv.lokasiKecelakaan =
      rec.lokasiKecelakaan ??
      rec.lokasi_kecelakaan ??
      rec.tempatKecelakaan ??
      rec.tempat_kecelakaan ??
      "";
    vv.tempatKecelakaan = vv.lokasiKecelakaan;
    vv.wilayah     = rec.wilayah || "";
    vv.rumahSakit  = rec.rumahSakit || "";

    // 🔎 ambil container lampiran dari beberapa kemungkinan kolom
    const att = rec.attachSurvey || rec.attach_survey || rec.att || rec.attachments || {};

    console.log("🔍 [prepareForOutput] Mencari TTD dari berbagai sumber:");
    console.log("   - rec.petugas_ttd:", rec.petugas_ttd);
    console.log("   - rec.petugasTtd:", rec.petugasTtd);
    console.log("   - rec.attachSurvey:", rec.attachSurvey);
    console.log("   - rec.attachments:", rec.attachments);

    vv.petugasTtd = 
      rec.petugas_ttd ||         
      rec.petugasTtd ||           
      (rec.attachSurvey && typeof rec.attachSurvey === 'object' ? rec.attachSurvey.petugasTtd?.url : null) ||
      (rec.attachments && typeof rec.attachments === 'object' ? rec.attachments.petugas_ttd : null) || 
      null;

    console.log("✅ [prepareForOutput] Final vv.petugasTtd:", vv.petugasTtd);

    // --- Tanggal-tanggal ---
    vv.tglKecelakaan = rec.tglKecelakaan || rec.tanggalKecelakaan || rec.tgl_kecelakaan || "";
    vv.hariTanggal = rec.hariTanggal || rec.tanggalKecelakaan || vv.tglKecelakaan || "";
    vv.tglMasukRS       = rec.tglMasukRS || "";
    vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
    vv.tglJamKunjungan  = rec.tglJamKunjungan || "";

    // --- Konten narasi ---
    vv.uraian       = rec.uraianSurvei || rec.uraian || "";
    vv.kesimpulan   = rec.kesimpulanSurvei || rec.kesimpulan || "";
    vv.uraianKunjungan = rec.uraianKunjungan || "";
    vv.rekomendasi  = rec.rekomendasi || "";

    // --- Hubungan AW ---
    let hs = rec.hubunganSesuai;
    if (typeof hs === "string") {
      const s = hs.trim().toLowerCase();
      if (["ya","y","true","1","sesuai"].includes(s)) hs = true;
      else if (["tidak","tdk","no","n","false","0","tidak sesuai"].includes(s)) hs = false;
    }
    vv.hubunganSesuai = hs;

    // --- TTD/pejabat ---
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
    
    vv.fotoSurveyList = [];
    if (rec.foto_survey) {
      try {
        let fotoData = rec.foto_survey;
        if (typeof fotoData === "string" && fotoData.trim() !== "") {
          fotoData = JSON.parse(fotoData);
        }

        if (Array.isArray(fotoData)) {
          vv.fotoSurveyList = fotoData;

          // ✅ hanya push kalau belum ada foto survey dari cluster
          const alreadyHasSurvey = files.some(f =>
            /foto\s*survey/i.test(f.label || f.name || "")
          );

          if (!alreadyHasSurvey) {
            fotoData.forEach((foto, index) => {
              if (foto && (foto.url || foto.fileName || foto.name)) {
                pushFile(foto, `Foto Survey ${index + 1}`, "db-foto_survey");
              }
            });
          } else {
            console.log("🟢 Skip pushing rec.foto_survey karena sudah ada cluster");
          }
        }
      } catch (e) {
        console.error("❌ Error parsing foto_survey:", e);
      }
    }
    console.log("📸 [prepareForOutput] Final fotoSurveyList:", vv.fotoSurveyList);

    // ambil attachSurvey mentah
    const rawAttach =
      rec.attachSurvey || rec.attach_survey || rec.attachments || {};

    // normalisasi key -> canonical
    const CANON = {
      // map ss
      mapss: "mapSS",
      map_ss: "mapSS",
      mapSS: "mapSS",

      // barcode / qr
      barcode: "barcode",
      barcode_qr: "barcode",
      barcodeqr: "barcode",
      qr: "barcode",
      qrcode: "barcode",
      qr_code: "barcode",

      // foto survey
      fotosurvey: "fotoSurvey",
      foto_survey: "fotoSurvey",
      fotoSurvey: "fotoSurvey",
    };

    vv.attachSurvey = Object.entries(rawAttach).reduce((acc, [k, v]) => {
      const kk = String(k).trim();
      const canonKey = CANON[kk.toLowerCase()] || kk; // fallback biar gak ilang
      acc[canonKey] = v;
      return acc;
    }, {});
    console.log("🔍 [prepareForOutput] attachSurvey original:", rec.attachSurvey);
    console.log("🔍 [prepareForOutput] attachSurvey final:", vv.attachSurvey);

    console.log("🔍 [prepareForOutput] Processing photo sources:");
    console.log("   - fotoSurveyList:", vv.fotoSurveyList);
    console.log("   - attachSurvey:", vv.attachSurvey);

    if (vv.attachSurvey && typeof vv.attachSurvey === "object" && !Array.isArray(vv.attachSurvey)) {
      console.log("📸 Processing attachSurvey boolean flags");

      const folderMapping = {
        kk: "kk",
        ktp: "ktp",
        akta_kelahiran: "akta-kelahiran",
        buku_tabungan: "buku-tabungan",
        form_keterangan_ahli_waris: "form-ahli-waris",
        form_pengajuan_santunan: "form-pengajuan",
        surat_keterangan_kematian: "surat-kematian",
        map_ss: "survey-images",
        barcode_qr: "survey-images",
        fotoSurvey: "survey-images",
      };

      const skipAttachRegex = /ttd|signature|sumber[-_\s]*informasi/i;

      const pickedByFolder = {}; // { folder: Set(fileName) }

      Object.entries(vv.attachSurvey).forEach(([key, value]) => {
        const kLower = key.toLowerCase();
        if (skipAttachRegex.test(kLower) || value === false) return;

        if (value === true) {
          const targetFolder = folderMapping[key] || "survey-images";

          const folderFiles = allFilesWithMetadata.filter(
            (file) => file.folder === targetFolder && file.timestamp
          );

          if (folderFiles.length === 0) return;

          if (!pickedByFolder[targetFolder]) {
            pickedByFolder[targetFolder] = new Set();
          }

          let bestMatch = null;
          let smallestDiff = Infinity;

          folderFiles.forEach((file) => {
            if (pickedByFolder[targetFolder].has(file.name)) return;

            const timeDiff = Math.abs(file.timestamp - recordTime);
            if (timeDiff < smallestDiff && timeDiff < 2 * 60 * 1000) {
              smallestDiff = timeDiff;
              bestMatch = file;
            }
          });

          if (bestMatch && bestMatch.url) {
            pickedByFolder[targetFolder].add(bestMatch.name);

            const matchedObj = {
              name: key,
              fileName: bestMatch.name,
              url: bestMatch.url,
              folder: bestMatch.folder,
              inputId: rec.id,
              jenis: key,
              label: key,
            };

            pushFile(matchedObj, key);
            vv.attachSurvey[key] = matchedObj;
          } else {
            console.warn(`❌ No matching file found for ${key} in ${targetFolder}`);
          }
        } else if (value && (typeof value === "object" || typeof value === "string")) {
          pushFile(value, key);
        }
      });
    }
    console.log("✅ attachSurvey after bool-resolve:", vv.attachSurvey);

    // Root-level attachments
    ["ktp","kk","bukuTabungan","formPengajuan","formKeteranganAW","skKematian","aktaKelahiran"]
      .forEach((k) => pushFile(rec[k], k));

    vv.files = files;

    // Derivasi: kumpulan foto (untuk preview RS/LL)
    const isImage = (nOrUrl = "") => /\.(png|jpe?g|gif|webp|bmp)$/i.test(nOrUrl);
    vv.allPhotos = files.filter((f) =>
      isImage((f.name || "").toLowerCase()) || 
      isImage((f.url || "").toLowerCase()) || 
      isImage((f.fileName || "").toLowerCase()) ||
      f.type === "foto"
    );

    // DEBUG: Log semua foto yang ditemukan
    console.log("📸 [prepareForOutput] All photos found:", vv.allPhotos.length);
    vv.allPhotos.forEach((photo, idx) => {
      console.log(`   [${idx}]`, { 
        name: photo.name, 
        fileName: photo.fileName,
        url: photo.url,
        inputId: photo.inputId
      });
    });

    // Hitungan ringkas
    vv.counts = {
      singles: rec.rsList?.length || 0,
      fotoSurvey: (rec.fotoList?.length || rec.fotoSurveyList?.length || 0),
      fotoKejadian: rec.fotoKejadianList?.length || 0,
    };

    // "_updatedAt" untuk sorting di DataForm
    vv._updatedAt = rec.updated_at || rec.verified_at || rec.unverified_at || rec.waktu || rec.createdAt || rec.created_at || null;

    return vv;
  }

  const openPreview = useCallback(async (rec) => {
    try {
      // 1) ambil row detail dari tabel varian
      const { variant, row } = await fetchDetailFromSupabase(rec);

      console.log("🔍 Row dari database:", row);
      console.log("🔍 TTD dari database:", row?.petugas_ttd);

      // 2) normalisasi & gabung ke record awal (biar field-nya lengkap)
      const merged = row
        ? { ...rec, ...normalizeDetailRow(variant, row) }
        : rec;

      // 3) bentuk payload final untuk modal/preview
      const vv = await prepareForOutput(merged);

      console.log("🔥 variant:", variant);
      console.log("🔥 vv.template:", vv.template);
      console.log("🔥 vv.jenisSurvei:", vv.jenisSurvei);
      console.log("🔥 vv.sifatCidera:", vv.sifatCidera);

      // 4) pilih builder preview sesuai varian
      const createdBlobUrls = [];
      const objURL = (maybeFile) => {
        if (maybeFile instanceof File) {
          const u = URL.createObjectURL(maybeFile);
          createdBlobUrls.push(u);
          return u;
        }
        return null;
      };

      const vLower = (variant || "").toLowerCase();
      const tLower = (vv.template || "").toLowerCase(); // fallback kalau variant null

      if (vLower === "md" || tLower.includes("survei_md")) {
        const html = await buildPreviewHTML_MD(vv, objURL);
        setDetailData({ ...vv, __variant: "md", previewHTML: html });

      } else if (vLower === "ll" || tLower.includes("survei_ll")) {
        const html = await buildPreviewHTML_LL(vv, objURL);
        setDetailData({ ...vv, __variant: "ll", previewHTML: html });

      } else if (vLower === "rs" || tLower.includes("kunjungan")) {
        const html = await buildPreviewHTML_RS(vv, objURL);
        setDetailData({ ...vv, __variant: "rs", previewHTML: html });

      } else {
        setDetailData({ ...vv, __variant: "ll", previewHTML: null });
      }

      setBlobUrls(createdBlobUrls);
      setDetailOpen(true);
    } catch (e) {
      console.error("openPreview error:", e);
      alert("Gagal membuka detail. Cek console untuk detail error.");
    }
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
    const currentRows = rows;

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== payload.id) return r;
        const now = payload.timestamp;
        if (payload.action === "verify") {
          return {
            ...r,
            verified: true,
            verifiedAt: now,
            verifyNote: payload.note || undefined,
            verifyChecklist: payload.checks,
            status: "diproses",
          };
        }
        if (payload.action === "unverify") {
          return {
            ...r,
            verified: false,
            unverifiedAt: now,
            unverifyNote: payload.note || undefined,
            status: "terkirim",
          };
        }
        if (payload.action === "finish") {
          return {
            ...r,
            finishedAt: now,
            finishNote: payload.note || undefined,
            status: "selesai",
          };
        }
        if (payload.action === "reject") {
          return {
            ...r,
            verified: false,
            rejectedAt: now,
            rejectNote: payload.note || undefined,
            status: "ditolak",
          };
        }
        return r;
      })
    );

    try {
      const recToSync =
        currentRows.find((x) => x.id === payload.id) || { id: payload.id };
      await syncVerificationToSupabase(recToSync, payload);
    } catch (e) {
      console.error("❌ Sync verifikasi gagal:", e);
    } finally {
      // refresh dari server agar pasti konsisten
      await syncFromSupabase();
      closeVerify();
    }
  }, [rows, syncFromSupabase, closeVerify]);

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
          {loadedAt && (
            <span style={{ marginLeft: 8, fontSize: "0.9em", color: "#888" }}>
              • diperbarui {loadedAt.toLocaleTimeString("id-ID")}
            </span>
          )}
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
            <option value="survei_ll">Survei Luka-Luka</option>
            <option value="survei_md">Survei Meninggal Dunia</option>
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="terkirim">Terkirim</option>
            <option value="diproses">Diproses</option>
            <option value="selesai">Selesai</option>
            <option value="ditolak">Ditolak</option>
          </select>

          {/* ✅ TOMBOL REFRESH */}
          <button
            className="kawaii-button"
            onClick={syncFromSupabase}
            title="Refresh data dari server"
            style={{ whiteSpace: "nowrap" }}
          >
            🔄 Refresh
          </button>
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

             {filtered.map((r, i) => (
              <React.Fragment key={r.id || i}>
                <div
                  className="df-row"
                  role="row"
                  style={{ alignItems: "start" }}
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
                      minWidth: 0,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      padding: "4px 6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      {(() => {
                        const n = Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0));
                        return n ? "⭐".repeat(n) + "☆".repeat(5 - n) : "—";
                      })()}
                    </div>

                    {r.feedback && (
                      <div
                        title={r.feedback}
                        style={{
                          fontSize: "0.85em",
                          color: "#555",
                          marginTop: 4,
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
                      gap: 4,
                      justifyContent: "flex-start",
                      minWidth: 180,
                      padding: "2px 4px",
                    }}
                  >
                    <button className="kawaii-button" onClick={() => openPreview(r)}>
                      👀 Detail
                    </button>
                    <button className="kawaii-button" onClick={() => openVerify(r)}>
                      {r.verified ? "✅ Terverifikasi" : "🗂️ Verifikasi"}
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ))}
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
      .df-badge.st-diproses   { background: linear-gradient(180deg,#fff,#eafbf3); color:#0f7a4c; border:1px solid #bfead5; }
      .df-badge.st-selesai    { background: linear-gradient(180deg,#fff,#eef6ff); color:#1b5fb3; border:1px solid #cfe0ff; }
      .df-badge.st-ditolak    { background: linear-gradient(180deg,#fff,#fff4f4); color:#a30f2d; border:1px solid #f5c2c7; }


      .df-row .df-mono button{
        background: linear-gradient(180deg,#f0f8ff,#e5f4ff);
        border: 1px solid #bae6fd;
      }

      .df-row{
        border-bottom: 1px dashed var(--pink-sep);
      }
        /* =====================
   DataForm – Responsive CSS Fixes
   Paste this AFTER your existing <style> to override.
   Keeps desktop table; simplifies to 2–3 key columns on small screens.
   Columns order in your markup:
   1 No | 2 Waktu | 3 Template | 4 Jenis | 5 No. LP | 6 Korban | 7 Petugas | 8 Tgl Kejadian | 9 Status | 10 Rating | 11 Aksi
   ===================== */

/* ---- General polish ---- */
.df-wrap{ padding-inline:clamp(12px,2.4vw,24px); }
.df-card{ border-radius:16px; }
.df-scroll{ overflow-x:auto; -webkit-overflow-scrolling:touch; }

/* Desktop defaults remain a wide grid */
.df-table{ 
  /* slight tweaks so it doesn’t overflow excessively on laptops */
  min-width: 1024px; 
}

/* ---- Laptop / Tablet (≤ 1024px) ---- */
@media (max-width: 1024px){
  /* make flexible columns shrink nicer */
  .df-table{ 
    --df-cols: 2.5rem max-content max-content max-content
               minmax(12ch,1.2fr) minmax(10ch,1.1fr) minmax(10ch,1fr)
               max-content max-content minmax(16ch,1.1fr) fit-content(14rem);
    grid-template-columns: var(--df-cols);
  }
  .df-actions{ min-width: 12rem; }
}

/* ---- Mobile (≤ 768px) ----
   Hide less-critical columns and keep: Waktu(2), Korban(6), Status(9), Aksi(11)
   This dramatically improves readability on phones. */
@media (max-width: 768px){
  /* Hide columns: 1,3,4,5,7,8,10 */
  .df-thead > div:nth-child(1), .df-row > div:nth-child(1),
  .df-thead > div:nth-child(3), .df-row > div:nth-child(3),
  .df-thead > div:nth-child(4), .df-row > div:nth-child(4),
  .df-thead > div:nth-child(5), .df-row > div:nth-child(5),
  .df-thead > div:nth-child(7), .df-row > div:nth-child(7),
  .df-thead > div:nth-child(8), .df-row > div:nth-child(8),
  .df-thead > div:nth-child(10), .df-row > div:nth-child(10){ display:none; }

  /* Grid now: Waktu(2) | Korban(6) | Status(9) | Aksi(11) */
  .df-table{ 
    --df-cols: minmax(120px, .9fr) minmax(140px,1.1fr) max-content max-content; 
    grid-template-columns: var(--df-cols);
    min-width: 0; /* allow full shrink */
  }

  .df-th, .df-td{ padding: 10px 10px; }
  .df-badge{ font-size: .9rem; }

  /* Actions: compact buttons */
  .df-actions{ gap:6px; min-width:unset; }
  .df-actions .kawaii-button{ padding:8px 10px; font-size:.9rem; }
}

/* ---- Very small phones (≤ 480px) ----
   Keep 3 columns: Korban(6) grows; Waktu(2) and Status(9) auto; Aksi(11) wraps */
@media (max-width: 480px){
  /* additionally hide the Waktu header label text to save space but keep the value cells */
  .df-thead > div:nth-child(2){ text-indent:-9999px; line-height:0; }

  .df-table{
    --df-cols: minmax(160px,1fr) max-content max-content; /* Korban | Status | Aksi */
    grid-template-columns: var(--df-cols);
  }

  /* Reorder visually by flowing only the kept columns; cells will wrap naturally */
  .df-td, .df-th{ font-size: .95rem; }

  .df-actions .kawaii-button{ padding:8px 10px; font-size:.9rem; }
}

/* ---- Reduced motion / Dark mode polish ---- */
@media (prefers-reduced-motion: reduce){
  .kawaii-button{ transition:none; }
}
@media (prefers-color-scheme: dark){
  .df-card{ box-shadow:none; border-color:#4b2b3e; }
  .df-thead{ background: linear-gradient(180deg,#2a1f27,#221924); color:#f7eaf2; border-bottom-color:#4b2b3e; }
  .df-row > .df-td{ border-right-color:#3b2433; }
}

    `}
      </style>
      {/* ✅ TARUH TOAST DI SINI (tepat sebelum </div> terakhir) */}
    {toast && (
      <div
        className={`toast ${toast.type}`}
        onAnimationEnd={() => setToast(null)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          background: toast.type === "error" ? "#ffe5e5" : "#e8fff0",
          color: toast.type === "error" ? "#a30f2d" : "#0f7a4c",
          border: "1px solid",
          borderColor: toast.type === "error" ? "#ffb8b8" : "#bfead5",
          padding: "10px 14px",
          borderRadius: 10,
          fontWeight: 600,
          boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          animation: "toastHide 2.2s ease forwards",
          zIndex: 9999,
        }}
      >
        {toast.msg}
      </div>
    )}

    {/* ✅ keyframes juga taruh di bawahnya, SEBELUM </div> terakhir */}
    <style>{`
      @keyframes toastHide {
        0% { opacity: 0; transform: translateY(8px); }
        10% { opacity: 1; transform: translateY(0); }
        85% { opacity: 1; }
        100% { opacity: 0; transform: translateY(8px); }
      }
    `}</style>
    </div>
  );
}
