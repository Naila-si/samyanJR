import React, { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { NavLink, useNavigate } from "react-router-dom";

/* ========== Audio autoplay helper ========== */
function AutoAudio({ src }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const p = el.play?.();
    if (p && p.catch) p.catch(() => {});
  }, [src]);
  return (
    <audio ref={ref} autoPlay playsInline>
      <source src={src} type="audio/mpeg" />
    </audio>
  );
}

/* ==========================================
   KONFIGURASI STATUS & LABEL
   ========================================== */
const STATUS_OPTIONS = ["Semua", "Selesai", "Diproses", "Terkirim", "Ditolak"];

// status internal -> label UI (Indonesia)
const STATUS_MAP = {
  terkirim: "Terkirim",
  diproses: "Diproses",
  selesai: "Selesai",
  ditolak: "Ditolak",
};

const STATUS_FILTERS = {
  Semua: null,
  Selesai: ["selesai"],
  Diproses: ["diproses"],
  Terkirim: ["terkirim"],
  Ditolak: ["ditolak"],
};

const STATUS_EMOJI = {
  Terkirim: "📨",
  Diproses: "⚙️",
  Selesai: "✅",
  Ditolak: "⛔",
};

function Badge({ status = "Terkirim" }) {
  const s = status || "Terkirim";
  return (
    <span className={`badge badge-${(status || "").toLowerCase()}`}>
      <span className="dot" />
      <span className="badge-emoji" aria-hidden="true">
        {STATUS_EMOJI[s] || "📄"}
      </span>
      {s}
    </span>
  );
}

// 1) taruh di atas komponen
const LS_KEY = "formDataList";
function getListSafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ========== Modal sederhana serbaguna ========== */
function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          {footer ?? (
            <button className="btn" onClick={onClose}>
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function pickValidTime(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

/* ====== Stat cards kecil ====== */
function StatCards({ counts }) {
  const items = [
    {
      key: "Terkirim",
      color: "#b13a77",
      bg: "linear-gradient(180deg,#fff,#fff4f9)",
      val: counts.terkirim,
    },
    {
      key: "Diproses",
      color: "#0f7a4c",
      bg: "linear-gradient(180deg,#fff,#f2fff8)",
      val: counts.diproses,
    },
    {
      key: "Selesai",
      color: "#1b5fb3",
      bg: "linear-gradient(180deg,#fff,#eef5ff)",
      val: counts.selesai,
    },
    {
      key: "Ditolak",
      color: "#a30f2d",
      bg: "linear-gradient(180deg,#fff,#fff2f2)",
      val: counts.ditolak,
    },
  ];
  return (
    <div className="stats-grid">
      {items.map((it) => (
        <div
          key={it.key}
          className="stat-card"
          style={{
            background: it.bg,
            borderColor: "rgba(0,0,0,.06)",
          }}
        >
          <div className="stat-top">
            <span className="stat-dot" style={{ background: it.color }} />
            <span className="stat-label">{it.key}</span>
          </div>
          <div className="stat-val" style={{ color: it.color }}>
            {it.val ?? 0}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ====== Skeleton baris tabel saat loading ====== */
function SkeletonRow() {
  return (
    <tr className="skeleton-row">
      <td>
        <div className="sk sk-70" />
      </td>
      <td>
        <div className="sk sk-120" />
      </td>
      <td>
        <div className="sk sk-90" />
      </td>
      <td>
        <div className="sk sk-80" />
      </td>
      <td>
        <div className="sk sk-60" />
      </td>
    </tr>
  );
}

/* ====== Toast mini pojok kanan ====== */
function ToastHost({ toasts, onClose }) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.variant || "info"}`}>
          <div className="toast-msg">{t.message}</div>
          <button className="toast-x" onClick={() => onClose(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

const detectVariant = (d) => {
  const t = (d.template || "").toLowerCase();
  const s = (
    d.jenisSurvei ||
    d.jenisSurveyLabel ||
    d.sifatCidera ||
    ""
  ).toLowerCase();
  if (t.includes("kunjungan")) return "rs";
  if (t.includes("survei_md") || s.includes("meninggal")) return "md";
  if (t.includes("survei_ll") || s.includes("luka")) return "ll";
  return "ll";
};

const TABLE_BY_VARIANT = {
  rs: "form_kunjungan_rs",
  md: "form_survei_aw", // MD & LL sama-sama di tabel ini
  ll: "form_survei_aw",
};

async function fetchDetailFromSupabase(rec) {
  const variant = detectVariant(rec);
  const table = TABLE_BY_VARIANT[variant];

  const ors = [];
  if (rec.id) ors.push(`id.eq.${rec.id}`);
  if (rec.noPL) ors.push(`no_pl.eq.${rec.noPL}`);

  // khusus RS
  if (variant === "rs") {
    if (rec.local_id) ors.push(`local_id.eq.${rec.local_id}`);
    if (rec.korban) ors.push(`korban.eq.${rec.korban}`);
  } else {
    // survei_aw (MD/LL)
    if (rec.korban) ors.push(`nama_korban.eq.${rec.korban}`);
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
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };

  const rawFotoSurvey =
    parseMaybe(row.foto_survey) ??
    parseMaybe(row.foto_survey_list) ??
    row.foto_survey ??
    row.foto_survey_list ??
    [];

  const fotoSurveyList = Array.isArray(rawFotoSurvey)
    ? rawFotoSurvey
    : rawFotoSurvey && typeof rawFotoSurvey === "object"
    ? Object.values(rawFotoSurvey)
    : [];

  const base = {
    id: row.local_id ?? row.id ?? row.uuid ?? null,
    createdAt: row.created_at ?? row.waktu ?? null,
    waktu: row.waktu ?? row.created_at ?? null,
    template:
      row.template ??
      (variant === "rs"
        ? "kunjungan_rs"
        : row.jenis_survei
        ? `survei_${
            String(row.jenis_survei).toLowerCase().includes("meninggal")
              ? "md"
              : "ll"
          }`
        : ""),

    // umum
    korban: row.korban ?? row.nama_korban ?? null,
    petugas: row.petugas ?? row.petugas_survei ?? null,
    jenisSurvei: row.jenis_survei ?? row.jenisSurvei ?? null,
    jenisSurveyLabel:
      row.jenis_survei_label ??
      row.jenisSurveyLabel ??
      row.jenis_survei ??
      null,
    noPL: row.no_pl ?? row.noPL ?? null,
    hubunganSesuai: row.hubungan_sesuai ?? null,
    sumbers: parseMaybe(row.sumbers) ?? row.sumbers ?? [],
    uraian: row.uraian ?? null,

    tanggalKecelakaan:
      row.tanggal_kecelakaan ??
      row.tanggalkecelakaan ??
      row.tgl_kecelakaan ??
      null,
    tglKecelakaan: row.tgl_kecelakaan ?? row.tanggal_kecelakaan ?? null,
    hariTanggal: row.hari_tanggal ?? row.hariTanggal ?? null,

    noBerkas: row.no_berkas ?? null,
    alamatKorban: row.alamat_korban ?? null,
    tempatKecelakaan: row.tempat_kecelakaan ?? row.lokasi_kecelakaan ?? null,

    status: row.status ?? "terkirim",
    verified: !!row.verified,
    verifiedAt: row.verified_at ?? null,
    verifyNote: row.verify_note ?? null,
    verifyChecklist:
      parseMaybe(row.verify_checklist) ?? row.verify_checklist ?? null,
    unverifiedAt: row.unverified_at ?? null,
    unverifyNote: row.unverify_note ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectNote: row.reject_note ?? null,
    finishedAt: row.finished_at ?? null,
    finishNote: row.finish_note ?? null,

    rating: row.rating ?? row.rating_value ?? null,
    feedback: row.feedback ?? row.feedback_text ?? null,
    petugasTtd: row.petugas_ttd || null,

    foto_survey: rawFotoSurvey,
    fotoSurveyList,
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
      : rawFotoSurvey && typeof rawFotoSurvey === "object"
      ? Object.values(rawFotoSurvey)
      : [];

    Object.assign(base, {
      wilayah: row.wilayah ?? null,
      lokasiKecelakaan: row.lokasi_kecelakaan ?? row.tempat_kecelakaan ?? null,
      rumahSakit: row.rumah_sakit ?? row.nama_rs ?? null,
      tglMasukRS: row.tgl_masuk_rs ?? row.tanggal_masuk_rs ?? null,
      tglJamNotifikasi: row.tgl_jam_notifikasi ?? null,
      tglJamKunjungan: row.tgl_jam_kunjungan ?? null,
      uraianKunjungan: row.uraian_kunjungan ?? row.uraian ?? null,
      rekomendasi: row.rekomendasi ?? null,

      petugasJabatan: row.petugas_jabatan ?? null,
      petugasTtd: row.petugas_ttd ?? null,
      fotoSurveyList,
    });
  }

  base.attachSurvey =
    parseMaybe(row.attach_survey) ??
    parseMaybe(row.attachSurvey) ??
    parseMaybe(row.att) ??
    parseMaybe(row.attachments) ??
    row.attachSurvey ??
    row.attach_survey ??
    row.att ??
    row.attachments ??
    {};

  base.rsList = parseMaybe(row.rs_list) ?? row.rs_list ?? [];
  base.fotoList = parseMaybe(row.foto_list) ?? row.foto_list ?? [];

  return base;
}

function extractTimestampFromFileName(fileName) {
  const pattern1 = fileName.match(/^(\d+)_/);
  if (pattern1 && pattern1[1]) {
    const timestamp = parseInt(pattern1[1]);
    if (!isNaN(timestamp) && timestamp > 1600000000000) {
      return new Date(timestamp).toISOString();
    }
  }

  const pattern2 = fileName.match(/(\d{10,13})/);
  if (pattern2 && pattern2[1]) {
    const timestamp = parseInt(pattern2[1]);
    if (!isNaN(timestamp) && timestamp > 1600000000000) {
      return new Date(timestamp).toISOString();
    }
  }

  return null;
}

function normalizeIdentityTokens(rec = {}) {
  const tokens = [];
  const push = (v) => {
    if (!v) return;
    const s = String(v).trim();
    if (!s) return;
    tokens.push(s.toLowerCase().replace(/\s+/g, "").replace(/[^\w]/g, ""));
  };

  push(rec.id || rec.local_id || rec.uuid);
  push(rec.noPL || rec.no_pl);
  push(rec.korban || rec.namaKorban || rec.nama_korban);
  push(rec.template);

  // buang duplikat
  return [...new Set(tokens)].filter(Boolean);
}

function fileMatchesIdentity(fileOrName = "", tokens = []) {
  if (!tokens.length) return false;

  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^\w]/g, "");

  const baseName = normalize(
    typeof fileOrName === "string" ? fileOrName : fileOrName.name
  );

  const basePath = normalize(
    typeof fileOrName === "string"
      ? ""
      : fileOrName.fullPath || fileOrName.path || fileOrName.fileName || ""
  );

  return tokens.some((t) => {
    if (!t) return false;
    return baseName.includes(t) || basePath.includes(t);
  });
}

async function listFilesTwoLevels(bucket, rootFolder) {
  const out = [];

  // level 1: isi rootFolder (biasanya subfolder recordId)
  const { data: level1, error: e1 } = await supabase.storage
    .from(bucket)
    .list(rootFolder);

  if (e1 || !level1) return out;

  for (const item of level1) {
    // kalau item ini file langsung
    if (item.id) {
      out.push({ ...item, fullPath: `${rootFolder}/${item.name}` });
      continue;
    }

    // kalau item ini folder (recordId) -> list level 2
    const subFolder = `${rootFolder}/${item.name}`;
    const { data: level2, error: e2 } = await supabase.storage
      .from(bucket)
      .list(subFolder);

    if (e2 || !level2) continue;

    for (const f of level2) {
      if (!f.id) continue; // skip folder lagi
      out.push({ ...f, fullPath: `${subFolder}/${f.name}` });
    }
  }

  return out;
}

async function loadFilesWithMetadata() {
  let allFiles = [];

  try {
    // ✅ survey-images kemungkinan juga 2 level
    const surveyImagesFiles = await listFilesTwoLevels(
      "foto-survey",
      "survey-images"
    );
    if (surveyImagesFiles?.length) {
      const filesWithMetadata = await Promise.all(
        surveyImagesFiles.map(async (file) => {
          try {
            const timestampFromName = extractTimestampFromFileName(file.name);
            const publicBase =
              "https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/";

            const encodedPath = String(file.fullPath)
              .split("/")
              .map(encodeURIComponent)
              .join("/");

            const fileUrl = publicBase + encodedPath;
            return {
              ...file,
              url: fileUrl,
              folder: "survey-images",
              uploadedAt: timestampFromName,
              timestamp: timestampFromName
                ? new Date(timestampFromName).getTime()
                : null,
            };
          } catch {
            return null;
          }
        })
      );
      allFiles = [...allFiles, ...filesWithMetadata.filter(Boolean)];
    }

    // ✅ sumber-informasi juga 2 level
    const sumberInfoFiles = await listFilesTwoLevels(
      "foto-survey",
      "sumber-informasi"
    );
    if (sumberInfoFiles?.length) {
      const sumberInfoWithUrl = await Promise.all(
        sumberInfoFiles.map(async (file) => {
          try {
            const timestampFromName = extractTimestampFromFileName(file.name);
            const fileUrl =
              `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/` +
              `foto-survey/${file.fullPath}`;
            return {
              ...file,
              url: fileUrl,
              folder: "sumber-informasi",
              uploadedAt: timestampFromName,
              timestamp: timestampFromName
                ? new Date(timestampFromName).getTime()
                : null,
            };
          } catch {
            return null;
          }
        })
      );
      allFiles = [...allFiles, ...sumberInfoWithUrl.filter(Boolean)];
    }

    // (sisanya docFolders tetap)
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
      const docs = await listFilesTwoLevels("foto-survey", folder);
      const docsWithMeta = await Promise.all(
        docs.map(async (file) => {
          try {
            const timestampFromName = extractTimestampFromFileName(file.name);
            const fileUrl =
              `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/` +
              `foto-survey/${file.fullPath}`;

            return {
              ...file,
              url: fileUrl,
              folder,
              uploadedAt: timestampFromName,
              timestamp: timestampFromName
                ? new Date(timestampFromName).getTime()
                : null,
            };
          } catch {
            return null;
          }
        })
      );

      allFiles = [...allFiles, ...docsWithMeta.filter(Boolean)];
    }
  } catch (error) {
    console.error("❌ Error loading files with metadata:", error);
  }

  return allFiles;
}

// ============================
// CACHE untuk metadata storage
// ============================
let _filesMetaCache = {
  at: 0,
  data: null,
  promise: null,
};

async function loadFilesWithMetadataCached(maxAgeMs = 5 * 60 * 1000) {
  const now = Date.now();

  // kalau masih fresh, pakai cache
  if (_filesMetaCache.data && now - _filesMetaCache.at < maxAgeMs) {
    return _filesMetaCache.data;
  }

  // kalau ada request yang lagi jalan, tunggu itu aja
  if (_filesMetaCache.promise) {
    return _filesMetaCache.promise;
  }

  _filesMetaCache.promise = (async () => {
    const data = await loadFilesWithMetadata();
    _filesMetaCache = { at: Date.now(), data, promise: null };
    return data;
  })();

  return _filesMetaCache.promise;
}

// optional kalau mau force refresh manual nanti
function invalidateFilesMetaCache() {
  _filesMetaCache = { at: 0, data: null, promise: null };
}

async function prepareForOutput(rec, variant = detectVariant(rec)) {
  const vv = {
    allPhotos: [],
    sumbers: [],
    fotoSurveyList: [],
    attachSurvey: {},
    files: [],
  };

  const files = [];

  const pushFile = (f, label = "Lampiran", source = "unknown") => {
    if (!f) return;

    const hasValidIdentifier = f.fileName || f.path || f.url || f.name;
    if (!hasValidIdentifier && typeof f !== "string") return;

    if (typeof f === "string") {
      files.push({
        label,
        name: f.split("/").pop() || label,
        fileName: f,
        url: f,
        source,
      });
      return;
    }

    const name = f.name || f.fileName || f.filename || f.label || label;
    const url = f.url || f.dataURL;
    const fileName = f.fileName || f.path || f.filename;

    files.push({
      type: f.type || "foto",
      label: f.label || label,
      name,
      url,
      fileName,
      path: f.path,
      dataURL: f.dataURL,
      file: f.file instanceof File ? f.file : undefined,
      size: f.size,
      uploadedAt: f.uploadedAt || f.createdAt,
      inputId: rec.id,
      recordTime: rec.createdAt || rec.waktu,
      source,
    });
  };

  const allFilesWithMetadata = await loadFilesWithMetadataCached();

  const recordTimeMs = pickValidTime(rec.createdAt, rec.waktu, rec.created_at);
  const identityTokens = normalizeIdentityTokens(rec);

  if (variant === "md") {
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
      const folderFiles = allFilesWithMetadata.filter(
        (f) =>
          f.folder === folder &&
          !String(f.name).includes(".emptyFolderPlaceholder")
      );

      // match by waktu ±30 menit
      const timeRelevant = folderFiles.filter((file) => {
        if (!file.timestamp) return false;
        const diff = Math.abs(file.timestamp - recordTimeMs);
        return diff <= 30 * 60 * 1000; // ✅ longgarin 30 menit
      });

      // match by identity token
      const identityRelevant = folderFiles.filter((file) =>
        fileMatchesIdentity(file, identityTokens)
      );

      const merged = [...timeRelevant, ...identityRelevant].filter(
        (v, i, arr) => arr.findIndex((x) => x.name === v.name) === i
      );

      // fallback kalau kosong: ambil semua file yang path-nya mengandung recordId/noPL
      if (merged.length === 0) {
        const ridTokens = identityTokens.filter((t) => t.length >= 6); // biar ga terlalu umum
        const byPath = folderFiles.filter((f) =>
          ridTokens.some((t) =>
            String(f.fullPath || "")
              .toLowerCase()
              .includes(t)
          )
        );
        merged.push(...byPath);
      }

      merged
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .forEach((file) => {
          pushFile(
            {
              name: file.name,
              fileName: file.fullPath,
              url: file.url,
              folder: file.folder,
              uploadedAt: file.timestamp
                ? new Date(file.timestamp).toISOString()
                : file.uploadedAt,
              timestamp: file.timestamp,
            },
            folder, // label pakai nama folder biar jelas
            timeRelevant.includes(file)
              ? "storage:doc:time"
              : "storage:doc:identity"
          );
        });
    }
  }

  console.log(
    "ALL FILES META:",
    allFilesWithMetadata.map((f) => ({
      folder: f.folder,
      name: f.name,
      fullPath: f.fullPath,
      timestamp: f.timestamp,
    }))
  );

  // ============================
  // 1) NGOROK FOTO SURVEY (survey-images)
  //    by waktu ±5m ATAU identity match
  // ============================
  const surveyFiles = allFilesWithMetadata.filter(
    (f) => f.folder === "survey-images"
  );

  const timeRelevantSurvey = surveyFiles.filter((file) => {
    if (!file.timestamp) return false;
    const diff = Math.abs(file.timestamp - recordTimeMs);
    return diff <= 5 * 60 * 1000;
  });

  const identityRelevantSurvey = surveyFiles.filter((file) =>
    fileMatchesIdentity(file, identityTokens)
  );

  // gabung + dedupe by name
  const mergedSurvey = [
    ...timeRelevantSurvey,
    ...identityRelevantSurvey,
  ].filter((v, i, arr) => arr.findIndex((x) => x.name === v.name) === i);

  if (mergedSurvey.length === 0) {
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^\w]/g, "");

    // ambil token dari id asli uploader juga (kalau ada)
    const rawRid = [
      rec.id,
      rec.local_id,
      rec.uuid,
      rec.recordId, // kalau suatu saat kamu simpen ini
      rec._raw?.id, // kalau rec masih bawa _raw
      rec._raw?.local_id,
    ]
      .filter(Boolean)
      .map((x) => norm(x));

    // token angka besar (timestamp) dari id juga oke
    const ridTokens = [...new Set([...identityTokens, ...rawRid])].filter(
      (t) => t.length >= 6
    );

    const byPath = surveyFiles.filter((f) => {
      const p = norm(f.fullPath || "");
      const n = norm(f.name || "");
      return ridTokens.some((t) => p.includes(t) || n.includes(t));
    });

    mergedSurvey.push(...byPath);
  }

  // ============================
  // 2) NGOROK SUMBER INFORMASI (sumber-informasi)
  //    by waktu ±5m ATAU identity
  // ============================
  const sumberFiles = allFilesWithMetadata.filter(
    (f) => f.folder === "sumber-informasi"
  );

  const timeRelevantSumber = sumberFiles.filter((file) => {
    if (!file.timestamp) return false;
    const diff = Math.abs(file.timestamp - recordTimeMs);
    return diff <= 5 * 60 * 1000;
  });

  const identityRelevantSumber = sumberFiles.filter((file) =>
    fileMatchesIdentity(file, identityTokens)
  );

  const mergedSumber = [
    ...timeRelevantSumber,
    ...identityRelevantSumber,
  ].filter((v, i, arr) => arr.findIndex((x) => x.name === v.name) === i);

  if (mergedSumber.length > 0) {
    mergedSumber
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .forEach((file, index) => {
        let sumberDataFromDB = null;
        if (rec.sumberInformasi?.[index])
          sumberDataFromDB = rec.sumberInformasi[index];
        else if (rec.sumbers?.[index]) sumberDataFromDB = rec.sumbers[index];
        else if (rec.attachSurvey?.sumberInformasi?.[index])
          sumberDataFromDB = rec.attachSurvey.sumberInformasi[index];

        if (!vv.sumbers[index]) {
          vv.sumbers[index] = {
            identitas:
              sumberDataFromDB?.identitas ||
              sumberDataFromDB?.nama ||
              sumberDataFromDB?.detail ||
              sumberDataFromDB?.keterangan ||
              sumberDataFromDB?.sumber ||
              `Sumber Informasi ${index + 1}`,
            foto: [],
          };
        }
        vv.sumbers[index].foto ||= [];
        const fotoObj = {
          name: `sumber_info_${index + 1}`,
          fileName: file.fullPath,
          url: file.url,
          folder: file.folder,
          inputId: rec.id,
        };

        // ✅ masuk ke struktur sumbers
        vv.sumbers[index].foto.push(fotoObj);

        // ✅ IMPORTANT: masuk juga ke files/allPhotos
        pushFile(
          fotoObj,
          `Foto Sumber Informasi ${index + 1}`,
          timeRelevantSumber.includes(file)
            ? "storage:sumber:time"
            : "storage:sumber:identity"
        );
      });
  }

  // ============================
  // 3) PRIORITAS FOTO MULTI-SUMBER
  //    fotoSurveyList → allPhotos(storage) → attachSurvey → foto_survey
  // ============================

  // (a) fotoSurveyList dari record
  vv.fotoSurveyList = [];
  if (rec.fotoSurveyList?.length) {
    vv.fotoSurveyList = rec.fotoSurveyList;
    rec.fotoSurveyList.forEach((f, i) =>
      pushFile(f, `Foto Survey ${i + 1}`, "record:fotoSurveyList")
    );
  } else if (rec.foto_survey) {
    try {
      let fotoData = rec.foto_survey;
      if (typeof fotoData === "string") fotoData = JSON.parse(fotoData);
      if (Array.isArray(fotoData)) {
        vv.fotoSurveyList = fotoData;
        fotoData.forEach((f, i) =>
          pushFile(f, `Foto Survey ${i + 1}`, "record:foto_survey")
        );
      }
    } catch {}
  }

  // (b) attachSurvey (boleh boolean / object / array) -> jadi file entries
  vv.attachSurvey =
    rec.attachSurvey || rec.attach_survey || rec.attachments || {};

  if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
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
    };

    Object.entries(vv.attachSurvey).forEach(([key, value]) => {
      const kLower = key.toLowerCase();

      // ✅ NEW: kalau LL, skip dokumen2 ini
      const isDocKey = [
        "kk",
        "ktp",
        "akta_kelahiran",
        "buku_tabungan",
        "form_keterangan_ahli_waris",
        "form_pengajuan_santunan",
        "surat_keterangan_kematian",
        "form_pengajuan",
        "form_keteranganaw",
        "sk_kematian",
        "aktaKelahiran",
        "bukuTabungan",
      ].some((dk) => kLower.includes(dk.replace(/_/g, "")));

      if (variant === "ll" && isDocKey) return;

      if (kLower.includes("ttd") || kLower.includes("signature")) return;

      if (value === true) {
        const targetFolder = folderMapping[key] || "survey-images";
        const folderFiles = allFilesWithMetadata.filter(
          (f) => f.folder === targetFolder
        );

        let bestMatch = null;
        let smallestDiff = Infinity;

        folderFiles.forEach((file) => {
          // 1) kalau compatible identity → pilih dulu
          if (fileMatchesIdentity(file.name, identityTokens)) {
            bestMatch = file;
            smallestDiff = 0;
            return;
          }

          // 2) fallback time ±10 menit
          if (!file.timestamp) return;
          const diff = Math.abs(file.timestamp - recordTimeMs);
          if (diff < smallestDiff && diff <= 10 * 60 * 1000) {
            smallestDiff = diff;
            bestMatch = file;
          }
        });

        if (bestMatch?.url) {
          pushFile(
            {
              name: key,
              fileName: bestMatch.name,
              url: bestMatch.url,
              folder: bestMatch.folder,
              uploadedAt: bestMatch.uploadedAt,
            },
            key,
            smallestDiff === 0
              ? "record:attachSurvey:identity"
              : "record:attachSurvey:time"
          );
        }
      } else if (value) {
        pushFile(value, key, "record:attachSurvey:value");
      }
    });
  }

  // (c) fallback lain-lain
  pushFile(rec.fotoList, "Foto Survey", "record:fotoList");
  pushFile(rec.fotoSurveyList, "Foto Survey", "record:fotoSurveyList");
  if (variant === "md") {
    [
      "ktp",
      "kk",
      "bukuTabungan",
      "formPengajuan",
      "formKeteranganAW",
      "skKematian",
      "aktaKelahiran",
    ].forEach((k) => pushFile(rec[k], k, `record:${k}`));
  }

  // ============================
  // 4) DEDUPE + BUILD allPhotos
  // ============================
  const isImage = (nOrUrl = "") => /\.(png|jpe?g|gif|webp|bmp)$/i.test(nOrUrl);

  // dedupe global by key (url/path/fileName/name)
  const seen = new Set();
  const uniqFiles = [];
  for (const f of files) {
    const raw = (f.url || f.path || f.fileName || f.name || "").split("?")[0];
    const key = raw.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqFiles.push(f);
  }

  vv.files = uniqFiles;

  // allPhotos: gabungan seluruh image dari files
  vv.allPhotos = uniqFiles.filter(
    (f) =>
      isImage((f.name || "").toLowerCase()) ||
      isImage((f.url || "").toLowerCase()) ||
      isImage((f.fileName || "").toLowerCase()) ||
      f.type === "foto"
  );

  vv.id =
    rec.id ||
    rec.local_id ||
    rec.row_id ||
    rec.uuid ||
    `${rec.waktu || rec.created_at || Date.now()}__${
      rec.no_pl || rec.noPL || "nop"
    }__${rec.template || "tpl"}`;

  vv.createdAt =
    rec.createdAt || rec.waktu || rec.created_at || new Date().toISOString();
  vv.waktu = rec.waktu || vv.createdAt;

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
    (tpl.includes("survei_md")
      ? "Meninggal Dunia"
      : tpl.includes("survei_ll")
      ? "Luka-luka"
      : "");

  vv.petugas = rec.petugas || rec.petugasSurvei || "";
  vv.petugasSurvei = rec.petugasSurvei || rec.petugas || "";
  vv.korban = rec.korban || rec.namaKorban || "";
  vv.namaKorban = rec.namaKorban || rec.korban || "";
  vv.noPL = rec.noPL || rec.no_pl || "";
  vv.noBerkas = rec.noBerkas || "";
  vv.alamatKorban = rec.alamatKorban || "";
  vv.tempatKecelakaan = rec.tempatKecelakaan || rec.lokasiKecelakaan || "";
  vv.wilayah = rec.wilayah || "";
  vv.rumahSakit = rec.rumahSakit || "";

  vv.lokasi_kecelakaan =
    rec.lokasi_kecelakaan ||
    rec.lokasiKecelakaan ||
    rec.tempat_kecelakaan ||
    rec.tempatKecelakaan ||
    rec.lokasi ||
    rec.tempat ||
    rec.alamat_kejadian ||
    rec.alamatKejadian ||
    "";
  vv.lokasiKecelakaan = vv.lokasi_kecelakaan;
  vv.tempatKecelakaan = vv.lokasi_kecelakaan;

  vv.petugasTtd =
    rec.petugas_ttd ||
    rec.petugasTtd ||
    (rec.attachSurvey && typeof rec.attachSurvey === "object"
      ? rec.attachSurvey.petugasTtd?.url
      : null) ||
    null;

  vv.tglKecelakaan =
    rec.tglKecelakaan || rec.tanggalKecelakaan || rec.tgl_kecelakaan || "";
  vv.hariTanggal =
    rec.hariTanggal || rec.tanggalKecelakaan || vv.tglKecelakaan || "";
  vv.tglMasukRS = rec.tglMasukRS || "";
  vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
  vv.tglJamKunjungan = rec.tglJamKunjungan || "";
  vv.uraian = rec.uraianSurvei || rec.uraian || "";
  vv.kesimpulan = rec.kesimpulanSurvei || rec.kesimpulan || "";
  vv.uraianKunjungan = rec.uraianKunjungan || "";
  vv.rekomendasi = rec.rekomendasi || "";

  let hs = rec.hubunganSesuai;
  if (typeof hs === "string") {
    const s = hs.trim().toLowerCase();
    if (["ya", "y", "true", "1", "sesuai"].includes(s)) hs = true;
    else if (
      ["tidak", "tdk", "no", "n", "false", "0", "tidak sesuai"].includes(s)
    )
      hs = false;
  }
  vv.hubunganSesuai = hs;

  vv.petugasJabatan = rec.petugasJabatan || "";
  vv.pejabatMengetahuiName = rec.pejabatMengetahuiName || "Andi Raharja, S.A.B";
  vv.pejabatMengetahuiJabatan =
    rec.pejabatMengetahuiJabatan || "Kepala Bagian Operasional";

  vv.status = rec.status || "terkirim";
  vv.verified = !!rec.verified;
  vv.verifiedAt = rec.verifiedAt || rec.verified_at || null;
  vv.verifyNote = rec.verifyNote || rec.verify_note || null;
  vv.verifyChecklist = rec.verifyChecklist || rec.verify_checklist || null;
  vv.unverifiedAt = rec.unverifiedAt || rec.unverified_at || null;
  vv.unverifyNote = rec.unverifyNote || rec.unverify_note || null;

  vv.rating = rec.rating ?? rec.rating_value ?? rec.star ?? null;
  vv.feedback = rec.feedback ?? rec.feedback_text ?? rec.ulasan ?? null;

  vv.counts = {
    singles: rec.rsList?.length || 0,
    fotoSurvey: rec.fotoList?.length || rec.fotoSurveyList?.length || 0,
    fotoKejadian: rec.fotoKejadianList?.length || 0,
  };

  vv._updatedAt =
    rec.updated_at ||
    rec.verified_at ||
    rec.unverified_at ||
    rec.waktu ||
    rec.createdAt ||
    rec.created_at ||
    null;

  return vv;
}

function esc(x) {
  return String(x ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTanggal(idDate) {
  if (!idDate) return "";
  try {
    return new Date(idDate).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(idDate);
  }
}

// shared builder untuk LL/MD sesuai template SURVEY AW terbaru
function buildPreviewHTML_AW(vv, jenisKey = "LL") {
  const jenisLabel = vv.jenisSurveyLabel || vv.jenisSurvei || jenisKey;
  // ===== Checkbox printer-friendly =====
  const cb = (checked) =>
    `<span class="cb"><span class="box">${
      checked ? "✓" : "&nbsp;"
    }</span></span>`;

  // Normalisasi label jenis survei agar matching
  const jenisNorm = String(jenisLabel || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const isKeterjaminan = /keterjaminan/.test(jenisNorm);
  const isKeabsahanAW = /ahli\s*waris|keabsahan.*(aw|ahli\s*waris)/.test(
    jenisNorm
  );
  const isKeabsahanBiaya = /biaya|perawatan|pengobatan/.test(jenisNorm);
  const jenisLainnyaText =
    !isKeterjaminan && !isKeabsahanAW && !isKeabsahanBiaya
      ? vv.jenisLainnya || vv.jenis_survei_lainnya || jenisLabel
      : "";
  const noPL = vv.noPL || vv.no_pl || "";
  const noBerkas = vv.noBerkas || vv.no_berkas || "";
  const hariTanggalSurvei =
    vv.hariTanggal || fmtTanggal(vv.waktu || vv.createdAt);
  const petugas = vv.petugasSurvei || vv.petugas || "";
  const korban = vv.namaKorban || vv.korban || "";
  const alamatKorban = vv.alamatKorban || vv.alamat_korban || "";
  const tempatTglKec = [
    vv.tempatKecelakaan || vv.lokasiKecelakaan || vv.lokasi_kecelakaan || "",
    fmtTanggal(
      vv.tglKecelakaan || vv.tanggalKecelakaan || vv.tgl_kecelakaan || ""
    ),
  ]
    .filter(Boolean)
    .join(", ");

  const hs = vv.hubunganSesuai;
  const hsSesuai = hs === true ? "☑" : "☐";
  const hsTidak = hs === false ? "☑" : "☐";

  // =========================
  // ✅ PUBLIC URL BUILDER
  // =========================
  const publicBase =
    "https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/";

  const toPublicUrl = (p) => {
    if (!p) return "";
    const encoded = String(p).split("/").map(encodeURIComponent).join("/");
    return publicBase + encoded;
  };

  // penting: jangan paksa survey-images doang
  const KNOWN_FOLDERS = [
    "survey-images",
    "sumber-informasi",
    "kk",
    "ktp",
    "akta-kelahiran",
    "buku-tabungan",
    "form-ahli-waris",
    "form-pengajuan",
    "surat-kematian",
  ];

  const normalizeStoragePath = (rawPath = "") => {
    let p = String(rawPath).trim().replace(/^\/+/, "");
    if (!p) return "";

    // kalau udah ada folder known (biarin)
    if (KNOWN_FOLDERS.some((f) => p.startsWith(f + "/"))) return p;

    // kalau ada folder tapi beda style (underscores), normalisasi dikit
    p = p.replace(/^akta_kelahiran\//i, "akta-kelahiran/");
    p = p.replace(/^buku_tabungan\//i, "buku-tabungan/");
    p = p.replace(/^form_ahli_waris\//i, "form-ahli-waris/");
    p = p.replace(/^form_pengajuan\//i, "form-pengajuan/");
    p = p.replace(/^surat_kematian\//i, "surat-kematian/");
    p = p.replace(/^sumber_informasi\//i, "sumber-informasi/");
    p = p.replace(/^survey_images\//i, "survey-images/");

    // kalau setelah normalisasi jadi known, ok
    if (KNOWN_FOLDERS.some((f) => p.startsWith(f + "/"))) return p;

    // fallback default ke survey-images (buat string nama file mentah)
    return `survey-images/${p}`;
  };

  // =========================
  // ✅ toSrc FOLDER-AGNOSTIC
  // =========================
  const toSrc = (fotoObj) => {
    if (!fotoObj) return "";

    // string
    if (typeof fotoObj === "string") {
      const s = fotoObj.trim();
      if (!s) return "";
      if (/^(https?:\/\/|data:)/i.test(s)) return s;

      const storagePath = normalizeStoragePath(s);
      return toPublicUrl(storagePath);
    }

    // object url langsung
    if (fotoObj.url && /^(https?:\/\/|data:)/i.test(fotoObj.url)) {
      return fotoObj.url;
    }

    // prioritas path / fileName
    const rawPath =
      fotoObj.fullPath ||
      fotoObj.path ||
      fotoObj.fileName ||
      fotoObj.filename ||
      fotoObj.name ||
      "";

    const storagePath = normalizeStoragePath(rawPath);
    if (storagePath) return toPublicUrl(storagePath);

    return fotoObj.dataURL || "";
  };

  // =========================
  // ✅ merge semua foto (dedupe)
  // =========================
  const mergeFotos = (...arrs) => {
    const out = [];
    const seen = new Set();

    for (const a of arrs.flat()) {
      if (!a) continue;
      const key = (
        typeof a === "string"
          ? a
          : a.url || a.fullPath || a.fileName || a.path || a.name || ""
      )
        .split("?")[0]
        .toLowerCase();

      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  };

  // kumpulin semua sumber foto
  const allPhotoSourcesRaw = mergeFotos(
    vv.fotoSurveyList || [],
    vv.allPhotos || [],
    vv.foto_survey || [],
    vv.attachSurvey && typeof vv.attachSurvey === "object"
      ? Object.values(vv.attachSurvey).flat()
      : []
  );

  // ✅ FILTER: foto dari folder sumber-informasi jangan ikut lampiran
  const isSumberInfoFoto = (f) => {
    if (!f) return false;

    // kalau string path
    if (typeof f === "string") {
      return f.includes("sumber-informasi/");
    }

    const p =
      f.fullPath || f.path || f.fileName || f.filename || f.url || f.name || "";

    return String(p).includes("sumber-informasi/");
  };

  const allPhotoSources = allPhotoSourcesRaw.filter(
    (f) => !isSumberInfoFoto(f)
  );

  // =========================
  // ✅ Sumber Informasi Rows (isi foto di kolom Tanda Tangan)
  // =========================
  const sumbers = Array.isArray(vv.sumbers) ? vv.sumbers : [];

  const sumberRows =
    sumbers.length > 0
      ? sumbers
          .map((s, i) => {
            const identitas =
              s?.identitas ||
              s?.nama ||
              s?.detail ||
              s?.keterangan ||
              `Sumber Informasi ${i + 1}`;

            // ambil foto sumber pertama
            const fotoSumber =
              (Array.isArray(s?.foto) && s.foto[0]) ||
              (Array.isArray(s?.photos) && s.photos[0]) ||
              null;

            const fotoHtml = fotoSumber
              ? `<img src="${toSrc(fotoSumber)}"
                      alt="Foto Sumber ${i + 1}"
                      style="height:70px; max-width:140px; object-fit:contain; display:block; margin:0 auto;"
                      onerror="this.style.display='none';" />`
              : `<div style="height:70px;"></div>`;

            return `
              <tr>
                <td class="center">${i + 1}</td>
                <td>${esc(identitas)}</td>
                <td class="center" style="height:46px;">
                  ${fotoHtml}
                </td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td class="center">1</td>
          <td>—</td>
          <td class="center" style="height:46px;"></td>
        </tr>
      `;

  // =========================
  // ✅ GROUP FOTO BY FOLDER
  // =========================
  const FOLDER_ORDER = [
    "survey-images",
    "ktp",
    "kk",
    "akta-kelahiran",
    "buku-tabungan",
    "form-ahli-waris",
    "form-pengajuan",
    "surat-kematian",
  ];

  const FOLDER_LABEL = {
    "survey-images": "FOTO SURVEY",
    ktp: "DOKUMEN KTP",
    kk: "DOKUMEN KK",
    "akta-kelahiran": "AKTA KELAHIRAN",
    "buku-tabungan": "BUKU TABUNGAN",
    "form-ahli-waris": "FORM AHLI WARIS",
    "form-pengajuan": "FORM PENGAJUAN",
    "surat-kematian": "SURAT KEMATIAN",
    unknown: "LAMPIRAN LAINNYA",
  };

  const detectFolderOfFoto = (f) => {
    if (!f) return "unknown";

    // kalau object dari prepareForOutput biasanya sudah ada folder
    if (typeof f === "object" && f.folder) return f.folder;

    // kalau string / atau object tanpa folder, coba tebak dari path/url/name
    const raw =
      typeof f === "string"
        ? f
        : f.fullPath ||
          f.path ||
          f.fileName ||
          f.filename ||
          f.url ||
          f.name ||
          "";

    const s = String(raw || "").toLowerCase();

    // match prefix folder known
    const known = [
      "survey-images",
      "sumber-informasi",
      "kk",
      "ktp",
      "akta-kelahiran",
      "buku-tabungan",
      "form-ahli-waris",
      "form-pengajuan",
      "surat-kematian",
    ];

    for (const k of known) {
      if (s.includes(k + "/")) return k;
    }

    return "unknown";
  };

  const groupFotosByFolder = (fotoArr = []) => {
    const map = {};
    for (const f of fotoArr) {
      const folder = detectFolderOfFoto(f);
      (map[folder] ||= []).push(f);
    }

    // sort tiap grup by timestamp kalau ada
    Object.values(map).forEach((arr) => {
      arr.sort((a, b) => {
        const ta = (typeof a === "object" && a.timestamp) || 0;
        const tb = (typeof b === "object" && b.timestamp) || 0;
        return ta - tb;
      });
    });

    return map;
  };

  // =========================
  // ✅ FOTO LAMPIRAN PAGES (semua)
  // =========================
  const grouped = groupFotosByFolder(allPhotoSources);

  const fotoLampiranPages =
    FOLDER_ORDER.map((folderKey) => {
      const fotos = grouped[folderKey] || [];
      if (!fotos.length) return "";

      // ✅ survey-images 1 halaman bisa 6 foto
      // ✅ dokumen lain 1 foto / halaman
      const perPage = folderKey === "survey-images" ? 6 : 1;

      return renderFotoLampiranSection({
        fotoSources: fotos,
        toSrc,
        escapeHtml: esc,
        title: FOLDER_LABEL[folderKey] || folderKey,
        captionPrefix: FOLDER_LABEL[folderKey] || "Lampiran",
        perPage,
      });
    }).join("") +
    (grouped.unknown?.length
      ? renderFotoLampiranSection({
          fotoSources: grouped.unknown,
          toSrc,
          escapeHtml: esc,
          title: FOLDER_LABEL.unknown,
          captionPrefix: "Lampiran",
          perPage: 1, // unknown juga 1 per halaman biar rapi
        })
      : "");

  // =========================
  // TTD tampil jika selesai
  // =========================
  const showAndi = vv.__verStatus === "disetujui";
  const andiTtdImg = showAndi
    ? `<img src="${esc(vv.andiTtdUrl || "")}"
             alt="TTD Andi"
             style="height:70px; object-fit:contain;" />`
    : `<div style="height:70px;"></div>`;

  const petugasTtdImg = vv.petugasTtd
    ? `<img src="${esc(vv.petugasTtd)}"
             alt="TTD Petugas"
             style="height:70px; object-fit:contain;" />`
    : `<div style="height:70px;"></div>`;

  // =========================
  // RETURN HTML
  // =========================
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Laporan Hasil Survei ${esc(jenisKey)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: "Times New Roman", serif; font-size: 12.5pt; color:#000; }
    .kop { font-weight:700; text-align:left; margin-bottom:6px; }
    .judul { text-align:center; font-weight:700; font-size:14.5pt; margin:8px 0 12px; }
    .no-pl { margin: 6px 0 10px; }
    .row { display:flex; gap:8px; margin:3px 0; }
    .label { width:160px; }
    .val { flex:1; }
    table { width:100%; border-collapse: collapse; margin-top:6px; }
    th, td { border:1px solid #000; padding:6px 6px; vertical-align:top; }
    th { text-align:center; font-weight:700; }
    .center { text-align:center; }
    .muted { font-size:11.5pt; }
    .section-gap { margin-top:10px; }
    .ttd-wrap { width:100%; margin-top:18px; display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .ttd-box { text-align:center; }
    .ttd-name { margin-top:6px; font-weight:700; text-decoration:underline; }
    .ttd-role { margin-top:2px; }
    .page-break{
  page-break-before: always;   /* legacy */
  break-before: page;          /* modern */
}
  /* ===== LAMPIRAN LAYOUT ADAPTIVE ===== */
.lampiran-page{ margin-top: 18px; }
.lampiran-title{
  font-weight: bold; text-transform: uppercase; margin-bottom: 10px;
}

/* base */
.lampiran-wrap{ display: grid; gap: 10px; }
.lampiran-item{
  border:1px solid #ddd; border-radius:8px; background:#f9f9f9;
  padding:8px; text-align:center;
}
.lampiran-item img{
  width:100%; height:auto; object-fit:contain; border:1px solid #ccc; border-radius:6px;
}
.lampiran-cap{ font-size:11px; color:#333; margin-top:6px; word-break:break-word; }

/* 1 foto => full page-ish */
.wrap-1{ grid-template-columns: 1fr; }
.lampiran-item.one img{
  max-height: 78vh;   /* hampir 1 halaman */
}

/* 2 foto => 2 baris (lebih aman buat print A4) */
.wrap-2{ grid-template-columns: 1fr; }
.lampiran-item.two img{
  max-height: 36vh;   /* 2 foto muat 1 page */
}

/* 3 foto => 3 baris */
.wrap-3{ grid-template-columns: 1fr; }
.lampiran-item.three img{
  max-height: 24vh;   /* 3 foto muat 1 page */
}

/* >3 foto => grid kecil */
.wrap-many{
  grid-template-columns: repeat(3, 1fr);
}
.lampiran-item.many img{
  max-height: 22vh;
}

/* PDF style kecil */
.lampiran-pdf{
  padding:12px; background:#fff; border:1px dashed #d32f2f;
}
.lampiran-pdf-ico{ font-size:14px; color:#d32f2f; margin-bottom:4px; }
  /* ===== Checkboxes ===== */
  .cb { display:inline-block; vertical-align:middle; margin-right:6px; }
  .cb .box{
    display:inline-grid; place-items:center;
    width:12pt; height:12pt; border:1.2pt solid #000; margin-right:4px;
    font-weight:700; line-height:1; font-size:10pt;
  }
  .line { display:inline-block; min-width:180px; border-bottom:1px dashed #000; }
  .center-block { text-align:center; }
  .no-pl-wrap{
    display:flex; align-items:center; justify-content:center;
    margin: 8px 0 12px;
  }
  .no-pl-box{
    display:inline-block; padding:4px 10px; border:1px solid #000; border-radius:4px;
    font-weight:700;
  }
  </style>
</head>
<body>
  <div class="kop">JASA RAHARJA WILAYAH RIAU</div>

  <div class="judul">LAPORAN HASIL SURVEI</div>

    <div class="no-pl-wrap">
      <div class="no-pl-box">No. PL / ${esc(noPL || "—")}</div>
    </div>

  <div class="row">
    <div class="label">Hari / tanggal survei</div>
    <div class="val">: ${esc(hariTanggalSurvei)}</div>
    <div style="width:18px;"></div>
    <div class="label" style="width:120px;">Petugas survei</div>
    <div class="val">: ${esc(petugas)}</div>
  </div>

    <div class="section-gap">
    <div style="font-weight:700; margin-bottom:4px;">Jenis survei</div>
    <div>
      ${cb(isKeterjaminan)} Keterjaminan korban&nbsp;&nbsp;&nbsp;
      ${cb(isKeabsahanAW)} Keabsahan ahli waris&nbsp;&nbsp;&nbsp;
      ${cb(isKeabsahanBiaya)} Keabsahan biaya perawatan/pengobatan
      <div style="margin-top:6px;">
        ${cb(!!jenisLainnyaText)} Lainnya
        : <span class="line">${esc(jenisLainnyaText || "")}</span>
      </div>
    </div>
  </div>

  <div class="section-gap">
    <div class="row">
      <div class="label">Nama korban</div>
      <div class="val">: ${esc(korban)}</div>
      <div style="width:18px;"></div>
      <div class="label" style="width:120px;">No. Berkas</div>
      <div class="val">: ${esc(noBerkas)}</div>
    </div>

    <div class="row">
      <div class="label">Alamat korban</div>
      <div class="val">: ${esc(alamatKorban)}</div>
    </div>

    <div class="row">
      <div class="label">Tempat/Tgl. Kecelakaan</div>
      <div class="val">: ${esc(tempatTglKec)}</div>
    </div>
  </div>

    <div class="section-gap">
    <div style="margin-bottom:2px;">
      Kesesuaian hubungan Ahli Waris dengan Korban:
      &nbsp;&nbsp;${cb(hs === true)} Sesuai
      &nbsp;&nbsp;${cb(hs === false)} Tidak Sesuai
    </div>
    <div class="muted">
      berdasarkan pengecekan NIK Korban pada database Ditjen Dukcapil dengan output URL:
      https://dukcapil-dwh.jasaraharja.co.id
    </div>
  </div>

  <div class="section-gap" style="margin-top:14px;">
    <div style="font-weight:700; margin-bottom:4px;">Sumber Informasi :</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px;">No</th>
          <th>Identitas/Detil Sumber Informasi dan Metode Perolehan Informasi</th>
          <th style="width:160px;">Tanda Tangan</th>
        </tr>
      </thead>
      <tbody>
        ${sumberRows}
      </tbody>
    </table>
  </div>

  <div class="section-gap" style="margin-top:14px;">
    <div style="font-weight:700;">Uraian dan Kesimpulan Hasil Survei :</div>
    <div style="margin-top:6px; white-space:pre-wrap; min-height:120px;">
      ${esc(vv.uraian || "")}
      ${vv.kesimpulan ? "\\nKESIMPULAN:\\n" + esc(vv.kesimpulan) : ""}
    </div>
  </div>

  <div class="section-gap" style="margin-top:12px;">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </div>

  <div class="ttd-wrap">
    <div class="ttd-box">
      <div>Mengetahui,</div>
      ${andiTtdImg}
      <div class="ttd-name">${esc(
        vv.pejabatMengetahuiName || "Andi Raharja"
      )}</div>
      <div class="ttd-role">${esc(
        vv.pejabatMengetahuiJabatan || "Kepala Bagian Operasional"
      )}</div>
    </div>

    <div class="ttd-box">
      <div>Petugas Survei,</div>
      ${petugasTtdImg}
      <div class="ttd-name">${esc(petugas)}</div>
      <div class="ttd-role">&nbsp;</div>
    </div>
  </div>

  ${fotoLampiranPages}

</body>
</html>
  `;
}

// ====== wrapper MD & LL ======
async function buildPreviewHTML_MD(vv) {
  return buildPreviewHTML_AW(vv, "MD");
}

function buildPreviewHTML_LL(vv) {
  return buildPreviewHTML_AW(vv, "LL");
}

function renderFotoLampiranSection({
  fotoSources = [],
  toSrc,
  escapeHtml,
  title = "FOTO LAMPIRAN",
  captionPrefix = "Foto",
  perPage = 6,
}) {
  if (!Array.isArray(fotoSources) || fotoSources.length === 0) return "";

  // pecah jadi halaman2 sesuai perPage (tetap dipakai sebagai "max per halaman")
  const pages = [];
  for (let i = 0; i < fotoSources.length; i += perPage) {
    pages.push(fotoSources.slice(i, i + perPage));
  }

  const renderOneFoto = (foto, idxGlobal, pageCount) => {
    const src = toSrc(foto);
    if (!src) return "";

    const name = escapeHtml(
      foto?.name ||
        foto?.fileName ||
        foto?.originalName ||
        `${captionPrefix} ${idxGlobal + 1}`
    );

    const isPdf =
      src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);

    if (isPdf) {
      return `
        <div class="lampiran-card lampiran-pdf">
          <div class="lampiran-pdf-ico">📄 PDF</div>
          <div class="lampiran-cap">${name}</div>
        </div>
      `;
    }

    // class adaptive berdasarkan jumlah foto di halaman tsb
    const itemClass =
      pageCount === 1
        ? "lampiran-item one"
        : pageCount === 2
        ? "lampiran-item two"
        : pageCount === 3
        ? "lampiran-item three"
        : "lampiran-item many";

    return `
      <div class="${itemClass}">
        <img src="${src}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.innerHTML='Gagal memuat gambar';" />
        <div class="lampiran-cap">${name}</div>
      </div>
    `;
  };

  return pages
    .map((pageFotos, pageIndex) => {
      const startIndex = pageIndex * perPage;
      const pageCount = pageFotos.length;

      // container class adaptive
      const wrapClass =
        pageCount === 1
          ? "lampiran-wrap wrap-1"
          : pageCount === 2
          ? "lampiran-wrap wrap-2"
          : pageCount === 3
          ? "lampiran-wrap wrap-3"
          : "lampiran-wrap wrap-many";

      const fotoHtml = pageFotos
        .map((f, i) => renderOneFoto(f, startIndex + i, pageCount))
        .join("");

      return `
        <div class="page-break"></div>
        <div class="lampiran-page">
          <div class="lampiran-title">
            ${escapeHtml(title)} ${
        pages.length > 1 ? `(Hal ${pageIndex + 1})` : ""
      }
          </div>
          <div class="${wrapClass}">
            ${fotoHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function buildPreviewHTML_RS(vv) {
  const escapeHtml = (str = "") =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const isDone =
    (vv.status && String(vv.status).toLowerCase() === "selesai") ||
    (vv.__verStatus && String(vv.__verStatus).toLowerCase() === "disetujui");

  // =========================
  // KUMPULIN FOTO (tetap sama logikamu)
  // =========================
  const fotoCandidates = [];

  if (Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length > 0) {
    fotoCandidates.push(...vv.fotoSurveyList);
  } else if (Array.isArray(vv.allPhotos) && vv.allPhotos.length > 0) {
    fotoCandidates.push(...vv.allPhotos);
  } else if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
    if (Array.isArray(vv.attachSurvey)) {
      fotoCandidates.push(...vv.attachSurvey);
    } else {
      Object.entries(vv.attachSurvey).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item, i) => {
            if (item && typeof item === "object") fotoCandidates.push(item);
            else if (item)
              fotoCandidates.push({ url: item, name: `Foto ${i + 1}` });
          });
        } else if (value && typeof value === "object") {
          fotoCandidates.push(value);
        } else if (typeof value === "string" && /^https?:\/\//.test(value)) {
          fotoCandidates.push({ url: value, name: key });
        }
      });
    }
  } else if (vv.foto_survey) {
    if (Array.isArray(vv.foto_survey)) fotoCandidates.push(...vv.foto_survey);
    else if (typeof vv.foto_survey === "string") {
      try {
        const parsed = JSON.parse(vv.foto_survey);
        if (Array.isArray(parsed)) fotoCandidates.push(...parsed);
      } catch {}
    }
  }

  const seenFoto = new Set();
  const uniqFotoCandidates = [];

  const normalizeFotoKey = (f) => {
    if (!f) return "";
    let raw =
      (typeof f === "string" && f) ||
      f.url ||
      f.path ||
      f.fileName ||
      f.name ||
      "";
    raw = String(raw).split("?")[0].split("#")[0];
    const base = raw.split("/").pop() || raw;
    const norm = base
      .replace(/^(foto|survey)[_-]?\d{6,}[_-]?/i, "")
      .replace(/^\d{10,13}[_-]?/i, "")
      .toLowerCase()
      .trim();
    return (norm || base).toLowerCase().trim();
  };

  for (const f of fotoCandidates) {
    const key = normalizeFotoKey(f);
    if (!key) continue;
    if (seenFoto.has(key)) continue;
    seenFoto.add(key);
    uniqFotoCandidates.push(f);
  }

  const toSrc = (fotoObj) => {
    if (!fotoObj) return "";
    if (typeof fotoObj === "string") return fotoObj;
    if (fotoObj.url && typeof fotoObj.url === "string") return fotoObj.url;

    if (fotoObj.path && typeof fotoObj.path === "string") {
      try {
        let storagePath = fotoObj.path;
        if (!storagePath.includes("survey-images/")) {
          storagePath = `survey-images/${storagePath}`;
        }
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(storagePath);
        return urlData?.publicUrl || "";
      } catch {}
    }

    if (fotoObj.fileName && typeof fotoObj.fileName === "string") {
      try {
        const fullPath = fotoObj.fileName.includes("survey-images/")
          ? fotoObj.fileName
          : `survey-images/${fotoObj.fileName}`;
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(fullPath);
        return urlData?.publicUrl || "";
      } catch {}
    }

    if (fotoObj.dataURL && typeof fotoObj.dataURL === "string") {
      return fotoObj.dataURL;
    }
    return "";
  };

  // =========================
  // LAMPIRAN FOTO (terpisah)
  // =========================
  const fotoLampiranPages = renderFotoLampiranSection({
    fotoSources: uniqFotoCandidates,
    toSrc,
    escapeHtml,
    title: "FOTO YANG DILAMPIRKAN",
    captionPrefix: "Foto Survey",
    perPage: 6, // max per halaman, adaptive tetap jalan
  });

  // =========================
  // TTD PETUGAS
  // =========================
  const petugasSrc = (() => {
    const raw = (vv.petugas_ttd || vv.petugasTtd || "").toString().trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;

    let storagePath = raw;
    if (!raw.includes("/")) storagePath = `ttd-petugas/${raw}`;
    else if (raw.startsWith("ttd-petugas/")) storagePath = raw;

    try {
      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(storagePath);

      return urlData?.publicUrl || null;
    } catch {
      return null;
    }
  })();

  // =========================
  // REPORT HTML (HALAMAN 1 SAJA)
  // =========================
  const reportHTML = `
  <h2>LEMBAR HASIL KUNJUNGAN KE RUMAH SAKIT</h2>
  <h3>APLIKASI MOBILE PELAYANAN</h3>

  <table>
    <tr><td class="label">NPP / Nama Petugas</td><td>: ${escapeHtml(
      vv.petugas || "-"
    )}</td></tr>
    <tr><td class="label">Loket Kantor / Wilayah</td><td>: ${escapeHtml(
      vv.wilayah || "-"
    )}</td></tr>
    <tr><td class="label">Nama Korban</td><td>: ${escapeHtml(
      vv.korban || "-"
    )}</td></tr>
    <tr><td class="label">Lokasi Kecelakaan</td><td>: ${escapeHtml(
      vv.lokasiKecelakaan || "-"
    )}</td></tr>
    <tr><td class="label">Kode RS / Nama RS</td><td>: ${escapeHtml(
      vv.rumah_sakit || vv.rumahSakit || "-"
    )}</td></tr>
    <tr><td class="label">Tanggal Kecelakaan</td><td>: ${escapeHtml(
      vv.tanggal_kecelakaan || vv.tglKecelakaan || "-"
    )}</td></tr>
    <tr><td class="label">Tanggal Masuk RS</td><td>: ${escapeHtml(
      vv.tgl_masuk_rs || vv.tglMasukRS || "-"
    )}</td></tr>
    <tr><td class="label">Tanggal & Jam Notifikasi</td><td>: ${escapeHtml(
      vv.tgl_jam_notifikasi || vv.tglJamNotifikasi || "-"
    )}</td></tr>
    <tr><td class="label">Tanggal & Jam Kunjungan</td><td>: ${escapeHtml(
      vv.tgl_jam_kunjungan || vv.tglJamKunjungan || "-"
    )}</td></tr>
  </table>

  <div class="section-title">Uraian Hasil Kunjungan:</div>
  <div class="box">${
    escapeHtml(vv.uraian || vv.uraianKunjungan || "") || "<i>Belum diisi.</i>"
  }</div>

  <div class="section-title">Rekomendasi / Kesimpulan:</div>
  <div class="box">${
    escapeHtml(vv.rekomendasi || "") || "<i>Belum diisi.</i>"
  }</div>

  <div class="footer-note">
    Demikian laporan hasil kunjungan ke Rumah Sakit ini kami buat dengan sebenarnya sesuai dengan informasi yang kami peroleh.
  </div>

  <div class="ttd">
    <div>
      Mengetahui,<br/>
      ${
        isDone
          ? `
        <div class="sig-wrap">
          <div class="sig-loader" id="andi-ttd-loader"></div>
          <img src="${escapeHtml(vv.andiTtdUrl || "/andi-ttd.jpeg")}"
               alt="TTD Andi"
               style="max-height:80px; display:block; margin:4px auto;"
               onload="document.getElementById('andi-ttd-loader')?.remove()"
               onerror="(function(n){ if(n) n.innerText='(gagal memuat TTD)'; })(document.getElementById('andi-ttd-loader'))" />
        </div>
      `
          : `<br/><br/><br/>`
      }
      <b>Andi Raharja, S.A.B</b><br/>
      <i>Kepala Bagian Operasional</i>
    </div>
    <div>
      Petugas yang melakukan kunjungan,<br/><br/>
      ${
        petugasSrc
          ? `<img src="${petugasSrc}" alt="TTD Petugas" style="max-height:80px; display:block; margin:4px auto;" onerror="this.style.display='none'"/>`
          : "<br/><br/><br/>"
      }
      <b>${escapeHtml(
        vv.petugas || "................................"
      )}</b><br/>
      <i>${escapeHtml(vv.petugas_jabatan || vv.petugasJabatan || "")}</i>
    </div>
  </div>
  `;

  // =========================
  // FINAL RETURN (REPORT + LAMPIRAN TERPISAH)
  // =========================
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
      .footer-note { margin-top:30px; font-size:14px; text-align:justify; }
      .sig-wrap { min-height:86px; display:flex; align-items:center; justify-content:center; }
      .sig-loader {
        width: 22px; height: 22px; border-radius: 50%;
        border: 3px solid #ddd; border-top-color: #888;
        animation: spin 0.9s linear infinite; margin: 0 auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ====== PAGE BREAK ====== */
      .page-break{
        page-break-before: always;
        break-before: page;
      }

      /* ===== LAMPIRAN LAYOUT ADAPTIVE (punyamu tetap) ===== */
      .lampiran-page{ margin-top: 18px; }
      .lampiran-title{
        font-weight: bold; text-transform: uppercase; margin-bottom: 10px;
      }
      .lampiran-wrap{ display: grid; gap: 10px; }
      .lampiran-item{
        border:1px solid #ddd; border-radius:8px; background:#f9f9f9;
        padding:8px; text-align:center;
      }
      .lampiran-item img{
        width:100%; height:auto; object-fit:contain; border:1px solid #ccc; border-radius:6px;
      }
      .lampiran-cap{ font-size:11px; color:#333; margin-top:6px; word-break:break-word; }
      .wrap-1{ grid-template-columns: 1fr; }
      .lampiran-item.one img{ max-height: 78vh; }
      .wrap-2{ grid-template-columns: 1fr; }
      .lampiran-item.two img{ max-height: 36vh; }
      .wrap-3{ grid-template-columns: 1fr; }
      .lampiran-item.three img{ max-height: 24vh; }
      .wrap-many{ grid-template-columns: repeat(3, 1fr); }
      .lampiran-item.many img{ max-height: 22vh; }
      .lampiran-pdf{ padding:12px; background:#fff; border:1px dashed #d32f2f; }
      .lampiran-pdf-ico{ font-size:14px; color:#d32f2f; margin-bottom:4px; }
    </style>
  </head>
  <body>

    ${reportHTML}

    ${fotoLampiranPages}

  </body>
  </html>`;
}

/* ==========================================
   KOMPONEN UTAMA
   ========================================== */
export default function StatusProses() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Semua");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortByDateDesc, setSortByDateDesc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [generatingPreviews, setGeneratingPreviews] = useState({});
  const navigate = useNavigate();

  const [ttdUrl, setTtdUrl] = useState("");
  useEffect(() => {
    setTtdUrl(new URL("andi-ttd.jpeg", window.location.origin).href);
  }, []);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  // 2) data
  const [data, setData] = useState([]);
  const [toasts, setToasts] = useState([]);

  const burstConfetti = (variant = "info") => {
    if (variant !== "success") return;
    const n = 22;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.className = "confetti";
      el.style.left = Math.random() * 100 + "%";
      el.style.setProperty("--tx", Math.random() * 60 - 30 + "px");
      el.style.background = [
        "#ff5aa5",
        "#8bc8ff",
        "#7be2c2",
        "#ffd37a",
        "#b28cff",
      ][i % 5];
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    }
  };
  const showToast = (message, variant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((xs) => [...xs, { id, message, variant }]);
    burstConfetti(variant);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 2600);
  };

  /* ------------------------------
     SOURCE: Supabase (+ fallback LS)
     ------------------------------ */
  const mapRowFromSupabase = (r) => {
    const ver = (r.counts && r.counts.verifikator) || {};
    const publicPdf =
      ver.stampedPdfUrl ||
      r.files?.hasilFormPdf ||
      r.files?.pdfUrl ||
      "/Lembar_Kunjungan_RS_NAI.pdf";

    return {
      name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
      docType:
        r.template === "kunjungan_rs"
          ? "Kunjungan RS"
          : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
      dateMs: pickValidTime(
        r.updated_at,
        r.verified_at,
        r.unverified_at,
        r.waktu,
        r.createdAt
      ),
      status: STATUS_MAP[(r.status || "").toLowerCase()] || "Terkirim",
      notes: {
        verifyNote: r.verify_note || ver.verifyNote || "",
        unverifyNote: r.unverify_note || ver.unverifyNote || "",
        finishNote: r.finish_note || ver.finishNote || "",
        rejectNote: r.reject_note || ver.rejectNote || "",
      },
      action: "Upload",
      missing: (r.counts && r.counts.missing) || [],
      pdfUrl: publicPdf,
      _raw: r,
    };
  };

  useEffect(() => {
    let cancelled = false;

    async function pullFromSupabase() {
      try {
        if (!supabase) throw new Error("Supabase not available");
        setLoading(true);

        let q = supabase
          .from("dataform")
          .select(
            "id, local_id, korban, template, jenisSurvei, jenisSurveyLabel, status, verified_at, unverified_at, waktu, updated_at, files, counts, verify_note, unverify_note, finish_note, reject_note"
          )
          .in("status", ["terkirim", "diproses", "selesai", "ditolak"])
          .order("updated_at", { ascending: false });

        const { data: rows, error } = await q;
        if (error) throw error;

        const mapped = (rows || []).map(mapRowFromSupabase);
        if (!cancelled) {
          setData(mapped);
          setLoading(false);
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(rows || []));
          } catch {}
        }
      } catch {
        if (!cancelled) {
          const rows = getListSafe(LS_KEY);
          const mapped = rows.map((r) => ({
            name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
            docType:
              r.template === "kunjungan_rs"
                ? "Kunjungan RS"
                : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
            dateMs: pickValidTime(
              r._updatedAt,
              r.verifiedAt,
              r.unverifiedAt,
              r.waktu,
              r.createdAt
            ),
            status: STATUS_MAP[(r.status || "").toLowerCase()] || "Terkirim",
            notes: {
              verifyNote: r.verifyNote || "",
              unverifyNote: r.unverifyNote || "",
              finishNote: r.finishNote || "",
              rejectNote: r.rejectNote || "",
            },
            action: "Upload",
            missing: r.missing || [],
            pdfUrl: r.pdfBlobUrl || r.pdfUrl || "/Lembar_Kunjungan_RS_NAI.pdf",
            _raw: r,
          }));
          setData(mapped);
          setLoading(false);
        }
      }
    }

    pullFromSupabase();

    const onStorage = (e) => {
      if (e.key === LS_KEY) {
        const rows = getListSafe(LS_KEY);
        const mapped = rows.map((r) => ({
          name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
          docType:
            r.template === "kunjungan_rs"
              ? "Kunjungan RS"
              : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
          dateMs: pickValidTime(
            r._updatedAt,
            r.verifiedAt,
            r.unverifiedAt,
            r.waktu,
            r.createdAt
          ),
          status: STATUS_MAP[(r.status || "").toLowerCase()] || "Terkirim",
          notes: {
            verifyNote: r.verifyNote || "",
            unverifyNote: r.unverifyNote || "",
            finishNote: r.finishNote || "",
            rejectNote: r.rejectNote || "",
          },
          action: "Upload",
          missing: r.missing || [],
          pdfUrl: r.pdfBlobUrl || r.pdfUrl || "/Lembar_Kunjungan_RS_NAI.pdf",
          _raw: r,
        }));
        setData(mapped);
      }
    };
    window.addEventListener("storage", onStorage);

    let ch;
    try {
      ch = supabase
        .channel("status_proses_user")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dataform" },
          () => {
            pullFromSupabase();
          }
        )
        .subscribe();
    } catch {}

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      try {
        ch && supabase.removeChannel(ch);
      } catch {}
    };
  }, []);

  /* ------------------------------
     FILTERING / PAGINATION
     ------------------------------ */
  const filtered = useMemo(() => {
    let rows = data.filter((r) => {
      const matchText =
        r.name.toLowerCase().includes(q.toLowerCase()) ||
        r.docType.toLowerCase().includes(q.toLowerCase());
      const matchStatus = status === "Semua" ? true : r.status === status;
      return matchText && matchStatus;
    });

    rows.sort((a, b) => {
      const da = Number(a.dateMs || 0);
      const db = Number(b.dateMs || 0);
      return sortByDateDesc ? db - da : da - db;
    });

    return rows;
  }, [q, status, sortByDateDesc, data]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const start = (pageSafe - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const goto = (p) => setPage(Math.min(totalPages, Math.max(1, p)));

  const openWith = (mode, row) => {
    setSelectedRow(row);
    setModalMode(mode);
    setModalOpen(true);
  };

  const summaries = useMemo(() => {
    const c = { terkirim: 0, diproses: 0, selesai: 0, ditolak: 0 };
    for (const r of data) {
      const s = (r.status || "").toLowerCase();
      if (s === "terkirim") c.terkirim++;
      else if (s === "diproses") c.diproses++;
      else if (s === "selesai") c.selesai++;
      else if (s === "ditolak") c.ditolak++;
    }
    return c;
  }, [data]);

  const renderProcessContent = (row) => {
    const { verifyNote } = row.notes || {};
    return (
      <>
        <p className="muted">Catatan admin saat verifikasi:</p>
        {verifyNote ? (
          <p className="note">{verifyNote}</p>
        ) : (
          <p className="muted">Tidak ada catatan.</p>
        )}
      </>
    );
  };

  const renderReportContent = (row) => {
    const { finishNote, verifyNote } = row.notes || {};
    return (
      <>
        {finishNote && (
          <>
            <p className="muted">Catatan akhir admin:</p>
            <p className="note">{finishNote}</p>
          </>
        )}
        {verifyNote && !finishNote && (
          <>
            <p className="muted">Catatan admin:</p>
            <p className="note">{verifyNote}</p>
          </>
        )}
        {!finishNote && !verifyNote && (
          <p className="muted">Tidak ada catatan admin.</p>
        )}
      </>
    );
  };

  const renderMissingContent = (row) => {
    const items = Array.isArray(row.missing) ? row.missing : [];
    return (
      <>
        {items.length > 0 ? (
          <ul className="missing-list">
            {items.map((m, idx) => (
              <li key={idx}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tidak ada daftar kekurangan yang tercatat.</p>
        )}
        {row.notes?.unverifyNote && (
          <p className="note">
            <strong>Catatan:</strong> {row.notes.unverifyNote}
          </p>
        )}
      </>
    );
  };

  const renderRejectedContent = (row) => {
    const items = Array.isArray(row.missing) ? row.missing : [];
    return (
      <>
        <div
          style={{
            background: "linear-gradient(180deg,#fff2f2,#ffe6e6)",
            border: "2px solid #ffb8b8",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#a30f2d",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            <span>⛔</span>
            <span>Pengajuan Ditolak</span>
          </div>
          <p style={{ margin: 0, color: "#7a0a1f", fontSize: "14px" }}>
            Pengajuan Anda tidak dapat diproses. Silakan perbaiki kekurangan
            berikut dan ajukan kembali.
          </p>
        </div>

        {items.length > 0 && (
          <>
            <p
              className="muted"
              style={{ fontWeight: "bold", marginBottom: "8px" }}
            >
              Kekurangan yang perlu diperbaiki:
            </p>
            <ul
              className="missing-list"
              style={{
                background: "#fff9f9",
                border: "1px solid #ffd7d7",
                borderRadius: "8px",
                padding: "12px 12px 12px 32px",
                margin: "0 0 16px 0",
              }}
            >
              {items.map((m, idx) => (
                <li key={idx} style={{ marginBottom: "6px", color: "#a30f2d" }}>
                  {m}
                </li>
              ))}
            </ul>
          </>
        )}

        {row.notes?.rejectNote ? (
          <div
            style={{
              background: "#fff9fd",
              border: "1px solid #ffd7ea",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: "bold",
                color: "#8e3d6f",
                fontSize: "14px",
              }}
            >
              📝 Catatan Admin:
            </p>
            <p style={{ margin: "8px 0 0 0", color: "#8e3d6f" }}>
              {row.notes.rejectNote}
            </p>
          </div>
        ) : (
          <p className="muted" style={{ fontStyle: "italic" }}>
            Tidak ada catatan penolakan yang tercatat.
          </p>
        )}

        <div
          style={{
            background: "linear-gradient(180deg,#f2fff8,#e8fff0)",
            border: "2px solid #bfead5",
            borderRadius: "12px",
            padding: "16px",
            marginTop: "16px",
          }}
        >
          <p
            style={{
              margin: "0 0 12px 0",
              color: "#0f7a4c",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🔄</span>
            Langkah Selanjutnya
          </p>
          <p style={{ margin: 0, color: "#0f7a4c", fontSize: "14px" }}>
            Klik tombol <strong>"Ulang Pengajuan"</strong> di bawah untuk
            memperbaiki dan mengajukan kembali formulir Anda.
          </p>
        </div>
      </>
    );
  };

  const modalTitle = selectedRow
    ? modalMode === "process"
      ? `Proses – ${selectedRow.name}`
      : modalMode === "report"
      ? `Unduh Laporan – ${selectedRow.name}`
      : modalMode === "rejected"
      ? `Ditolak – ${selectedRow.name}`
      : `Kekurangan Berkas — ${selectedRow.name}`
    : "";

  const modalBody = selectedRow
    ? modalMode === "process"
      ? renderProcessContent(selectedRow)
      : modalMode === "report"
      ? renderReportContent(selectedRow)
      : modalMode === "rejected"
      ? renderRejectedContent(selectedRow)
      : renderMissingContent(selectedRow)
    : null;

  const modalFooter = selectedRow ? (
    modalMode === "report" ? (
      <>
        <button className="btn" onClick={() => setModalOpen(false)}>
          Tutup
        </button>
        <a
          className="btn primary"
          href={selectedRow.pdfUrl}
          target="_blank"
          rel="noreferrer"
        >
          Unduh Laporan
        </a>
      </>
    ) : modalMode === "rejected" ? (
      <>
        <button className="btn" onClick={() => setModalOpen(false)}>
          Tutup
        </button>
        <button
          className="btn primary"
          onClick={() => {
            setModalOpen(false);
            navigate("/form");
          }}
        >
          📝 Ulang Pengajuan
        </button>
      </>
    ) : (
      <button className="btn" onClick={() => setModalOpen(false)}>
        Tutup
      </button>
    )
  ) : null;

  const withTimeout = (promise, ms = 10000, label = "Operasi") =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
      ),
    ]);

  // key stabil per row (dipakai buat generatingPreviews)
  const getRecordKey = (row) => {
    const raw = row?._raw || row || {};
    return (
      raw.id ||
      raw.local_id ||
      raw.uuid ||
      row?.id ||
      row?.local_id ||
      row?.uuid ||
      row?.noPL ||
      `${row?.name || "row"}__${row?.dateMs || ""}`
    );
  };

  /* ============================================================
     ✨ UNDUH LAPORAN ALA VERIFIKATOR DASHBOARD
     - Jika sudah ada stamped PDF => buka langsung
     - Kalau belum ada => generate HTML preview => print via iframe
     - Andi TTD muncul hanya saat status selesai (done)
     ============================================================ */
  const handleDownloadReport = async (record) => {
    const recordKey = getRecordKey(record);

    try {
      setGeneratingPreviews((prev) => ({ ...prev, [recordKey]: true }));
      showToast("Menyiapkan laporan...", "info");

      // 1) ambil detail SEBENARNYA dari tabel sesuai varian
      const { variant, row } = await withTimeout(
        fetchDetailFromSupabase(record._raw),
        45000,
        "Ambil detail"
      );
      if (!row) throw new Error("Detail row tidak ditemukan");

      const normalizedData = normalizeDetailRow(variant, row);

      // 2) cek stamped pdf terbaru di detail (bukan list)
      const ver =
        (normalizedData.counts && normalizedData.counts.verifikator) || {};
      const stampedPdfUrl =
        ver.stampedPdfUrl ||
        normalizedData.files?.hasilFormPdf ||
        normalizedData.files?.pdfUrl ||
        null;

      const isRealPdf =
        stampedPdfUrl &&
        typeof stampedPdfUrl === "string" &&
        stampedPdfUrl.trim() !== "" &&
        !stampedPdfUrl.includes("/Lembar_Kunjungan_RS_NAI.pdf");

      if (isRealPdf) {
        showToast("Membuka laporan PDF...", "info");
        window.open(stampedPdfUrl, "_blank", "noopener,noreferrer");
        showToast("Laporan dibuka", "success");
        setGeneratingPreviews((prev) => ({ ...prev, [recordKey]: false }));
        return;
      }

      // 3) kalau belum ada pdf, generate HTML preview sesuai record
      const vv = await withTimeout(
        prepareForOutput(
          {
            ...normalizedData,
            createdAt:
              record._raw?.created_at ||
              record._raw?.waktu ||
              normalizedData.createdAt,
            waktu: record._raw?.waktu || normalizedData.waktu,
            id: record._raw?.id || record._raw?.local_id || normalizedData.id,
            local_id: record._raw?.local_id || normalizedData.local_id,
          },
          variant
        ),
        45000,
        "Siapkan lampiran"
      );

      vv.andiTtdUrl = ttdUrl || "/andi-ttd.jpeg";

      // ✅ robust done detection (RS/MD/LL)
      const rawStatus = String(
        normalizedData.status ||
          record._raw?.status ||
          record.status || // label dari tabel list ("Selesai")
          ""
      ).toLowerCase();

      const done =
        rawStatus === "selesai" ||
        rawStatus === "disetujui" ||
        normalizedData.finishedAt ||
        normalizedData.verifiedAt ||
        normalizedData.verified ||
        record._raw?.finished_at ||
        record._raw?.verified_at;

      // set flag buat AW & RS
      vv.__verStatus = done ? "disetujui" : null;

      // optional tapi bagus: supaya RS builder kebaca juga
      vv.status = normalizedData.status || record._raw?.status || vv.status;

      let html = "";
      if (variant === "md") html = await buildPreviewHTML_MD(vv);
      else if (variant === "ll") html = buildPreviewHTML_LL(vv);
      else if (variant === "rs") html = buildPreviewHTML_RS(vv);

      // 4) BUKA TAB BARU pakai blob url (anti ketuker)
      printHtmlViaIframe(html);

      showToast("Membuka jendela cetak...", "success");
      setGeneratingPreviews((prev) => ({ ...prev, [recordKey]: false }));
    } catch (error) {
      console.error("Error generating report:", error);
      showToast("Gagal membuat laporan", "error");
      setGeneratingPreviews((prev) => ({ ...prev, [recordKey]: false }));
    }
  };

  function printHtmlViaIframe(html) {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.setAttribute("aria-hidden", "true");

      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error("iframe document not available");

      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      };

      const doPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("print() blocked:", e);
        }
        // cleanup pasti jalan max 15 detik
        setTimeout(cleanup, 45000);
      };

      // trigger cepat: max nunggu 800ms
      const fastTimer = setTimeout(doPrint, 800);

      iframe.onload = () => {
        clearTimeout(fastTimer);
        // kasih sedikit waktu render font/image
        setTimeout(doPrint, 200);
      };
    } catch (e) {
      console.error("printHtmlViaIframe error:", e);
      // fallback tab baru
      const blob = new Blob([html], { type: "text/html;charset=utf-8" }); // ✅ Blob, bukan Bob
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  return (
    <div className="status-page">
      <div className="ornamen theme-sky" aria-hidden="true" />
      <AutoAudio src="/voices/statusproses.mp3" />
      <ToastHost
        toasts={toasts}
        onClose={(id) => setToasts((xs) => xs.filter((x) => x.id !== id))}
      />

      <header className="status-head">
        <h1>Status Proses</h1>
        <p className="muted">Lihat status terkini dan kelola proses</p>
        <StatCards counts={summaries} />
      </header>

      {/* Toolbar */}
      <div className="status-toolbar">
        <div className="search">
          <span className="icon">🔍</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama berkas atau jenis dokumen…"
          />
        </div>

        <div className="filters">
          <span className="muted">Filter</span>
          <button
            className={`chip ${sortByDateDesc ? "active" : ""}`}
            onClick={() => setSortByDateDesc((v) => !v)}
            title="Urutkan tanggal pengajuan"
          >
            <span className="chip-dot" />
            Tanggal
          </button>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              showToast(`Filter: ${e.target.value}`, "info");
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="status-table">
          <thead>
            <tr>
              <th>Nama Berkas</th>
              <th>Jenis Dokumen</th>
              <th
                onClick={() => setSortByDateDesc((v) => !v)}
                className="th-sort"
              >
                Tanggal Pembaruan {sortByDateDesc ? "▾" : "▴"}
              </th>
              <th>Status Proses</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </>
            ) : (
              <>
                {visible.map((r, i) => (
                  <tr key={r._raw?.local_id ?? r._raw?.id ?? i}>
                    <td data-label="Nama Berkas">{r.name}</td>
                    <td data-label="Jenis Dokumen" className="muted">
                      {r.docType}
                    </td>
                    <td data-label="Tanggal Pembaruan">
                      {new Date(r.dateMs).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td data-label="Status Proses">
                      <Badge status={r.status} />
                      {r.status === "Terkirim" &&
                        (r.notes?.unverifyNote || r._raw?.unverifyNote) && (
                          <div className="pending-comment">
                            <span className="cmt-icon">💬</span>
                            <span>
                              {r.notes?.unverifyNote || r._raw?.unverifyNote}
                            </span>
                          </div>
                        )}
                    </td>
                    <td data-label="Tindakan">
                      {r.status === "Terkirim" ? (
                        <span className="muted">-</span>
                      ) : r.status === "Diproses" ? (
                        <button
                          className="link link-strong"
                          onClick={() => {
                            openWith("process", r);
                            showToast("Membuka detail proses…", "info");
                          }}
                        >
                          Lihat Proses
                        </button>
                      ) : r.status === "Selesai" ? (
                        (() => {
                          const k = getRecordKey(r); // ✅ key stabil
                          const isGen = !!generatingPreviews[k];

                          return (
                            <button
                              className="link link-strong"
                              onClick={() => handleDownloadReport(r)}
                              disabled={isGen} // ✅ disable hanya row ini
                            >
                              {isGen ? "Menyiapkan..." : "📄 Unduh Laporan"}
                            </button>
                          );
                        })()
                      ) : r.status === "Ditolak" ? (
                        <button
                          className="link link-strong"
                          onClick={() => {
                            openWith("rejected", r);
                            showToast("Menampilkan alasan penolakan.", "warn");
                          }}
                        >
                          Lihat Kekurangan
                        </button>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}

                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      Tidak ada data yang cocok.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer controls */}
      <div className="table-footer">
        <div className="page-size">
          <span>Tampilkan</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>Baris</span>
        </div>
        <div className="pagination">
          <button
            className="pager"
            onClick={() => goto(page - 1)}
            disabled={pageSafe === 1}
          >
            ‹
          </button>
          {Array.from({ length: totalPages })
            .slice(0, 7)
            .map((_, idx) => {
              const p = idx + 1;
              return (
                <button
                  key={p}
                  className={`pager ${p === pageSafe ? "active" : ""}`}
                  onClick={() => goto(p)}
                >
                  {p}
                </button>
              );
            })}
          {totalPages > 7 && <span className="ellipsis">…</span>}
          <button
            className="pager"
            onClick={() => goto(page + 1)}
            disabled={pageSafe === totalPages}
          >
            ›
          </button>
        </div>
      </div>

      {/* Modal serbaguna */}
      <Modal
        open={modalOpen}
        title={modalTitle}
        onClose={() => setModalOpen(false)}
        footer={modalFooter}
      >
        {modalBody}
      </Modal>
      <style>{`
        /* ===== THEME ===== */
        :root {
          --ink: #2a2530;
          --muted: #7a6b7d;
          --bg: #fff9fc;
          --panel: #ffffff;
          --brand-1: #ff5aa5;
          --brand-2: #ffb6d6;
          --brand-3: #ffe2f0;
          --ok: #15a46a;
          --warn: #d79300;
          --err: #cf2a4a;
          --shadow: 0 12px 32px rgba(255, 90, 165, .18);
          --radius-lg: 16px;
          --radius-md: 12px;
          --radius-sm: 10px;
          --border: 1px solid rgba(255, 90, 165, .2);
        }
        /* ===== PAGE ===== */
        .status-page {
          color: var(--ink);
          background:
            radial-gradient(1200px 400px at 100% -10%, #fff0f7 0%, transparent 50%),
            radial-gradient(800px 300px at -10% 0%, #f8fbff 0%, transparent 60%),
            var(--bg);
          min-height: 100dvh;
          padding: clamp(12px, 2.5vw, 24px);
        }

        .status-head {
          margin: 8px 0 18px;
        }
        .status-head h1 {
          margin: 0 0 4px;
          font-size: clamp(22px, 2.2vw, 28px);
          letter-spacing: .2px;
        }
        .status-head .muted { color: var(--muted); }

        /* ===== TOOLBAR ===== */
        .status-toolbar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          background: linear-gradient(180deg,#fff,#fff6fb);
          border: var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow);
          padding: 12px;
          margin-bottom: 14px;
        }

        .status-toolbar .search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1px solid #f2d6e6;
          border-radius: 12px;
          padding: 10px 12px;
        }
        .status-toolbar .search .icon { opacity: .7 }
        .status-toolbar .search input {
          border: none; outline: none; width: 100%;
          font-size: 14px; background: transparent;
        }

        .status-toolbar .filters {
          display: flex; align-items: center; gap: 10px;
        }
        .status-toolbar .filters .muted { color: var(--muted); }

        .chip {
          border: 1px solid #ffd7ea;
          background: linear-gradient(180deg,#fff,#fff1f7);
          padding: 8px 12px; border-radius: 999px; cursor: pointer;
          font-weight: 600; color: #b13a77;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .chip.active, .chip:hover {
          box-shadow: 0 6px 16px rgba(255,90,165,.18);
          transform: translateY(-1px);
        }
        .status-toolbar select {
          border: 1px solid #e7e2ea; border-radius: 10px;
          padding: 8px 10px; background:#fff;
        }

        /* ===== TABLE WRAP ===== */
        .table-wrap {
          background: var(--panel);
          border: var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow);
          overflow: hidden;
        }

        /* ===== DESKTOP TABLE ===== */
        .status-table {
          width: 100%;
          border-collapse: collapse;
        }
        .status-table thead th {
          position: sticky; top: 0; z-index: 1;
          background: linear-gradient(180deg,#fff0f7,#ffe3ef);
          color: #6b2752;
          text-align: left;
          border-bottom: 2px solid #ffd7ea;
          padding: 12px 10px;
          font-weight: 700;
        }
        .status-table tbody td {
          border-top: 1px dashed rgba(255,90,165,.25);
          padding: 12px 10px;
          vertical-align: top;
        }
        .status-table tbody tr:hover td {
          background: linear-gradient(180deg,#fff8fc,#fff);
        }

        .th-sort { cursor: pointer; }
        .empty {
          text-align: center; padding: 28px 10px; color: var(--muted);
        }

        /* ===== BADGES ===== */
        .badge {
          display:inline-flex; align-items:center; gap:8px;
          padding: 6px 10px; font-weight: 700; border-radius: 999px;
          border: 1px solid;
          background: #fff;
          font-size: 12px;
        }
        .badge .dot {
          width: 8px; height: 8px; border-radius: 999px; display:inline-block;
        }
        .badge-terkirim { border-color:#ffd7ea; color:#b13a77; background: linear-gradient(180deg,#fff,#fff4f9); }
        .badge-terkirim .dot { background:#b13a77; }

        .badge-diproses { border-color:#bfead5; color:#0f7a4c; background: linear-gradient(180deg,#fff,#f2fff8); }
        .badge-diproses .dot { background:#0f7a4c; }

        .badge-selesai { border-color:#cfe0ff; color:#1b5fb3; background: linear-gradient(180deg,#fff,#eef5ff); }
        .badge-selesai .dot { background:#1b5fb3; }

        .badge-ditolak { border-color:#f5c2c7; color:#a30f2d; background: linear-gradient(180deg,#fff,#fff2f2); }
        .badge-ditolak .dot { background:#a30f2d; }

        /* ===== LINK-BUTTONS ===== */
        .link {
          border: 1px solid #ffd7ea;
          background: linear-gradient(180deg,#fff,#fff1f7);
          padding: 8px 12px; border-radius: 10px; cursor: pointer;
          color: #b13a77; font-weight: 700;
          transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
          text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
        }
        .link:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(255,90,165,.18); }
        .link:active { transform: translateY(0); }
        .link-strong::before { content: "⚡ "; }

        /* ===== PENDING COMMENT ===== */
        .pending-comment {
          margin-top: 6px;
          display: flex; gap: 6px; align-items: flex-start;
          background: #fff9fd; border: 1px dashed #ffd7ea; border-radius: 8px;
          padding: 6px 8px; color: #8e3d6f; font-size: 12px;
        }
        .cmt-icon { line-height: 1 }

        /* ===== FOOTER / PAGINATION ===== */
        .table-footer {
          margin-top: 10px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; flex-wrap: wrap;
        }

        .page-size {
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid #f2d6e6; border-radius: 12px; padding: 8px 10px;
        }

        .pager {
          border: 1px solid #e7e2ea; background: #fff; color: var(--ink);
          border-radius: 10px; padding: 8px 10px; cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease;
        }
        .pager:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.08); }
        .pager.active { border-color: #ff8fc2; background: linear-gradient(180deg,#fff,#fff0f6); color: #b13a77; font-weight: 800; }
        .ellipsis { padding: 0 4px; color: var(--muted); }

        /* ===== MODAL ===== */
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 50;
          background: rgba(255, 230, 245, .65);
          backdrop-filter: blur(6px);
          display: grid; place-items: center; padding: 18px;
          animation: fadeIn .15s ease-out;
        }
        .modal-card {
          width: min(720px, 100%);
          background: linear-gradient(180deg,#fff,#fff7fb);
          border: var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow);
          overflow: hidden;
          transform-origin: center;
          animation: popIn .15s ease-out;
        }
        .modal-header, .modal-footer {
          padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
          background: linear-gradient(180deg,#fff0f7,#ffe3ef);
          border-bottom: 1px solid #ffd7ea;
        }
        .modal-footer { border-top: 1px solid #ffd7ea; border-bottom: none; }
        .modal-body { padding: 14px; background: #fff; }
        .modal-close {
          border: 1px solid #ffb6d6; border-radius: 10px; background: #fff;
          padding: 6px 10px; cursor: pointer; color: #b13a77; font-weight: 800;
        }
        .btn {
          border: 1px solid #e7e2ea; background:#fff; color: var(--ink);
          border-radius: 10px; padding: 8px 12px; cursor: pointer;
        }
        .btn.primary {
          border-color: #ff8fc2;
          background: linear-gradient(180deg,#ffd6e7,#fff0f7);
          color: #b13a77; font-weight: 800;
        }

        /* Notes list inside modals */
        .note {
          background: #fff9fd; border: 1px solid #ffd7ea; border-radius: 8px;
          padding: 10px 12px; color: #8e3d6f;
        }
        .missing-list { padding-left: 18px; }
        .muted { color: var(--muted); }

        /* ===== ANIM ===== */
        @keyframes fadeIn { from { opacity: .2 } to { opacity: 1 } }
        @keyframes popIn { from { opacity:.5; transform: scale(.98) } to { opacity:1; transform: scale(1) } }

        /* ====== RESPONSIVE (HP) ======
          - Di layar ≤ 768px: tabel berubah jadi "kartu"
          - Header tetap cantik, toolbar jadi stack
        */
        @media (max-width: 768px) {
          .status-toolbar {
            grid-template-columns: 1fr;
            padding: 10px;
            gap: 10px;
          }

          .status-table thead { display: none; }
          .status-table, .status-table tbody, .status-table tr, .status-table td {
            display: block; width: 100%;
          }

          .status-table tbody tr {
            border: 1px solid #ffe0ef;
            border-radius: 14px;
            box-shadow: var(--shadow);
            background: #fff;
            margin: 10px;
            padding: 10px 10px 6px;
          }

          .status-table tbody td {
            border: none; padding: 8px 0; position: relative;
          }

          .status-table tbody td::before {
            content: attr(data-label);
            display: block;
            font-size: 12px;
            color: var(--muted);
            margin-bottom: 4px;
          }

          .table-footer {
            gap: 12px;
            flex-direction: column;
            align-items: stretch;
          }
        }
        /* ===== STAT CARDS ===== */
        .stats-grid{
          display:grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap:12px;
          margin: 10px 0 14px;
        }
        .stat-card{
          border: var(--border);
          border-radius: 14px;
          padding: 12px;
          box-shadow: var(--shadow);
        }
        .stat-top{ display:flex; align-items:center; gap:8px; color: var(--muted); font-weight:700; }
        .stat-dot{ width:10px; height:10px; border-radius:999px; }
        .stat-label{ font-size:12px; }
        .stat-val{ font-size:28px; font-weight:900; line-height:1; margin-top:4px; }

        @media (max-width: 768px){
          .stats-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
        }

        /* ===== SKELETON ===== */
        .skeleton-row td { padding: 12px 10px; }
        .sk{
          height: 12px; border-radius: 999px;
          background: linear-gradient(90deg, #f5e7ef 0%, #fdf4fa 50%, #f5e7ef 100%);
          background-size: 200% 100%;
          animation: skShine 1.1s linear infinite;
        }
        .sk.sk-60{ width:60px } .sk.sk-70{ width:70px } .sk.sk-80{ width:80px }
        .sk.sk-90{ width:90px } .sk.sk-120{ width:120px }
        @keyframes skShine { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

        /* ===== TOAST ===== */
        .toast-host{
          position: fixed; right: 14px; bottom: 14px; z-index: 60;
          display: grid; gap: 8px; width: min(360px, 90vw);
        }
        .toast{
          display:flex; align-items: center; justify-content: space-between; gap: 10px;
          border: 1px solid #ffd7ea; border-radius: 12px; background:#fff;
          box-shadow: 0 8px 18px rgba(0,0,0,.06);
          padding: 10px 12px; animation: fadeIn .12s ease-out;
        }
        .toast.info   { border-color:#ffd7ea; background: linear-gradient(180deg,#fff,#fff7fb); color:#8e3d6f; }
        .toast.success{ border-color:#bfead5; background: linear-gradient(180deg,#fff,#f2fff8); color:#0f7a4c; }
        .toast.warn   { border-color:#ffe2a1; background: linear-gradient(180deg,#fff,#fff9e8); color:#7a5500; }
        .toast.error  { border-color:#f5c2c7; background: linear-gradient(180deg,#fff,#fff2f2); color:#a30f2d; }
        .toast-msg{ font-weight: 700; }
        .toast-x{
          border: 1px solid #e7e2ea; background:#fff; color:#7a6b7d; border-radius: 8px;
          padding: 2px 8px; cursor: pointer;
        }

        /* ===== CHIP & SELECT (rapiin area Filter) ===== */
        .chip{
          display: inline-flex; align-items: center; gap: 8px;
        }
        .chip .chip-dot{
          width: 8px; height: 8px; border-radius: 999px; background: #ff8fc2;
        }
        .chip.active .chip-dot{ background:#b13a77; }

        .select-wrap{
          position: relative;
          background:#fff;
          border: 1px solid #f2d6e6; border-radius: 12px;
          padding: 0; height: 38px; display: flex; align-items: center;
        }
        .select-wrap::after{
          content:"▾"; position:absolute; right:10px; color:#b13a77; pointer-events:none; font-weight:900;
        }
        .select-wrap select{
          appearance: none; -webkit-appearance: none; -moz-appearance: none;
          border: none; outline: none; background: transparent;
          padding: 8px 28px 8px 10px; border-radius: 12px; height: 38px;
          color: var(--ink);
        }  
        .ornamen{
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .ornamen::before{
          content:"";
          position:absolute;
          top:-32px; right:-18px;
          width:min(560px,46vw);
          height:min(440px,40vh);
          opacity:.85;                         /* dinaikkan */
          filter: drop-shadow(0 8px 22px rgba(0,0,0,.06));
          background:
            /* layer titik putih */
            radial-gradient(#ffffff 1.6px, transparent 1.6px) 0 0/16px 16px,
            radial-gradient(#ffffff 1.6px, transparent 1.6px) 8px 8px/16px 16px;
          /* bentuk kapsul */
          mask-image: radial-gradient(70% 70% at 75% 30%, #000 60%, transparent 75%);
          border-radius: 28px;
          mix-blend-mode: screen;
        }

        .ornamen::after{
          content:"";
          position:absolute;
          left:-28px; bottom:-36px;
          width:min(760px,62vw);
          height:min(380px,36vh);
          opacity:.95;                         /* dinaikkan */
          background:
            /* gelombang terang utama */
            radial-gradient(120% 160% at 0% 100%, #ffffff 0%, rgba(255,255,255,.9) 40%, rgba(255,255,255,0) 72%),
            /* aksen warna tema (di-override di kelas tema) */
            var(--ornamen-accent, radial-gradient(90% 120% at 20% 70%, rgba(255,170,210,.25), rgba(255,170,210,0) 70%));
          mask-image: radial-gradient(100% 90% at 20% 100%, #000 60%, transparent 82%);
          border-radius: 40px;
          transform: rotate(-2deg);
          mix-blend-mode: lighten;
        }

        .status-page::after{
          content:"";
          position: fixed;
          inset:0;
          pointer-events:none;
          z-index: 0;
          opacity:.10;  /* dari .06 -> .10 */
          background-image: url("data:image/svg+xml;utf8,\
            <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>\
              <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/></filter>\
              <rect width='100%' height='100%' filter='url(#n)' opacity='0.40' fill='#fff'/>\
            </svg>");
          background-size: 200px 200px; /* lebih rapat */
        }

        .ornamen.theme-bubblegum::before{
          /* tumpuk titik pink samar di bawah titik putih */
          background:
            radial-gradient(rgba(255,145,200,.25) 1.6px, transparent 1.6px) 0 0/16px 16px,
            radial-gradient(rgba(255,145,200,.25) 1.6px, transparent 1.6px) 8px 8px/16px 16px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 0 0/12px 12px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 6px 6px/12px 12px;
        }
        .ornamen.theme-bubblegum{
          --ornamen-accent: radial-gradient(90% 120% at 18% 72%, rgba(255,145,200,.35), rgba(255,145,200,0) 72%);
        }

        /* 2) Sky – biru lembut, kontras di latar pink */
        .ornamen.theme-sky::before{
          background:
            radial-gradient(rgba(120,160,255,.25) 1.6px, transparent 1.6px) 0 0/16px 16px,
            radial-gradient(rgba(120,160,255,.25) 1.6px, transparent 1.6px) 8px 8px/16px 16px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 0 0/12px 12px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 6px 6px/12px 12px;
        }
        .ornamen.theme-sky{
          --ornamen-accent: radial-gradient(95% 130% at 22% 70%, rgba(140,175,255,.35), rgba(140,175,255,0) 72%);
        }

        /* 3) Mint – hijau segar */
        .ornamen.theme-mint::before{
          background:
            radial-gradient(rgba(80,210,170,.25) 1.6px, transparent 1.6px) 0 0/16px 16px,
            radial-gradient(rgba(80,210,170,.25) 1.6px, transparent 1.6px) 8px 8px/16px 16px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 0 0/12px 12px,
            radial-gradient(#ffffff 1.2px, transparent 1.2px) 6px 6px/12px 12px;
        }
        .ornamen.theme-mint{
          --ornamen-accent: radial-gradient(95% 130% at 22% 70%, rgba(80,210,170,.35), rgba(80,210,170,0) 72%);
        }

        /* RESPONSIVE: kecilkan sedikit supaya tetap subtle di hp */
        @media (max-width: 768px){
          .ornamen::before{ width: 72vw; height: 34vh; opacity:.8; }
          .ornamen::after{ width: 82vw; height: 30vh; opacity:.95; }
        }
        /* Pastikan konten di atas ornamen */
        .status-page > *:not(.ornamen):not(.modal-backdrop){ 
          position: relative; 
          z-index: 1; 
        }

        /* Sedikit padding supaya ornamen tidak terlalu mepet di hp kecil */
        @media (max-width: 768px){
          .ornamen::before{ width: 68vw; height: 32vh; opacity:.5; }
          .ornamen::after{ width: 78vw; height: 28vh; opacity:.9; }
        }
        .status-head::after,
        .status-toolbar::after{
          content:"";
          position:absolute; inset:0 0 auto 0; height: 40%;
          pointer-events:none; border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,.65), rgba(255,255,255,0));
          mix-blend-mode: screen;
        }
        .status-head{ position:relative; }
        .status-toolbar{ position:relative; }
        /* ===== Badge emoji spacing ===== */
        .badge-emoji { font-size: 14px; margin-right: 2px; }

        /* ===== Confetti mini ===== */
        .confetti{
          position: fixed; bottom: -12px; width: 8px; height: 8px; border-radius: 2px;
          z-index: 70; opacity: .95;
          animation: confettiUp 1.1s ease-out forwards;
        }
        @keyframes confettiUp{
          0%   { transform: translate(calc(var(--tx, 0px)), 0) rotate(0deg); }
          100% { transform: translate(calc(var(--tx, 0px)), -92vh) rotate(540deg); opacity: 0; }
        }
        .status-page {
          padding-top: 2px !important; 
        }

        .status-head {
          margin-top: 0 !important;
          padding-top: 0px;
        }

        body {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }

        /* Kalau mau garis merah navbar lebih deket ke konten */
        header, .navbar, .top-bar {
          margin-bottom: 0 !important;
        }

        /* optional: buat kesan “menyatu” */
        .status-page::before {
          content: "";
          display: block;
          height: 12px;
        }

         @media print {
          .no-print {
            display: none !important;
          }
          
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          .page-break {
            page-break-before: always;
          }
          
          img {
            max-width: 100% !important;
            height: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
