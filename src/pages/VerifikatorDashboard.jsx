import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import { supabase } from "../lib/supabaseClient";

// ======================= PASTE START: PREVIEW + HELPERS =======================

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
  if (rec.id) {
    ors.push(`id.eq.${rec.id}`);
    ors.push(`local_id.eq.${rec.id}`);
  }
  if (rec.local_id) {
    ors.push(`local_id.eq.${rec.local_id}`);
  }
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

  const base = {
    id: row.local_id ?? row.id ?? row.uuid ?? null,
    createdAt: row.created_at ?? row.waktu ?? null,
    waktu: row.waktu ?? row.created_at ?? null,
    template:
      row.template ??
      (variant === "rs"
        ? "kunjungan_rs"
        : row.jenis_survei
        ? (() => {
            const js = String(row.jenis_survei).toLowerCase();
            const isMD =
              js.includes("meninggal") ||
              js.includes("md") ||
              js.includes("ahli waris");
            return `survei_${isMD ? "md" : "ll"}`;
          })()
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

    noBerkas: row.no_berkas ?? row.no_berkas_aw ?? row.noBerkasAW ?? null,
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
    row.attachSurvey ??
    row.attach_survey ??
    row.att ??
    row.attachments ??
    {};

  // list foto lain (kalau ada di kolom berbeda)
  base.rsList = parseMaybe(row.rs_list) ?? row.rs_list ?? [];
  base.fotoList = parseMaybe(row.foto_list) ?? row.foto_list ?? [];

  return base;
}

const cb = (checked) => (checked ? "☑" : "☐");
const dotLine = (text = "", minMm = 80) =>
  `<span class="dotline" style="min-width:${minMm}mm">${text || ""}</span>`;

function renderFotoLampiranSection({
  fotoSources = [],
  toSrc,
  escapeHtml,
  title = "FOTO YANG DILAMPIRKAN",
  captionPrefix = "Foto Survey",
}) {
  if (!fotoSources.length) {
    return `
      <div style="
        page-break-before:always;
        text-align:center;
        color:#666;
        font-style:italic;
        padding:12mm;
        border:0.3mm dashed #bbb;
        border-radius:2mm;
      ">
        Tidak ada foto yang dilampirkan.
      </div>
    `;
  }

  const fotosHTML = fotoSources
    .map((x, i) => {
      const src = toSrc(x, `lampiran-${i}`);
      if (!src) return "";

      const isPdf =
        src.startsWith("data:application/pdf") ||
        /\.pdf(\?|$)/i.test(src);
      const name = escapeHtml(
        x?.name || x?.fileName || `${captionPrefix} ${i + 1}`
      );

      if (isPdf) {
        return `
          <div style="
            width:80mm;
            border:0.3mm solid #ccc;
            border-radius:2mm;
            padding:3mm;
            text-align:center;
            font-size:10pt;
            color:#a00;
            page-break-inside:avoid;
          ">
            ${name}<br/>(PDF tidak bisa dipratinjau)
          </div>
        `;
      }

      return `
        <div style="
          width:80mm;
          border:0.3mm solid #ccc;
          border-radius:2mm;
          padding:3mm;
          text-align:center;
          background:#fff;
          page-break-inside:avoid;
        ">
          <img src="${src}" alt="${name}"
               style="
                 max-width:100%;
                 max-height:70mm;
                 object-fit:contain;
                 border:0.2mm solid #ddd;
                 border-radius:1.5mm;
               "
               onerror="this.style.display='none';
                        this.insertAdjacentHTML('afterend','<div style=\\'color:#a00\\'>Gagal memuat gambar</div>');"
          />
          <div style="margin-top:2mm;font-size:10pt;color:#333;">
            ${name}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  return `
    <div style="page-break-before:always; margin-top:8mm;">
      <h3 style="
        text-align:center;
        font-size:13pt;
        font-weight:bold;
        margin:0 0 6mm;
        text-transform:uppercase;
      ">
        ${escapeHtml(title)}
      </h3>

      <div style="
        display:flex;
        flex-wrap:wrap;
        gap:4mm;
        justify-content:center;
      ">
        ${fotosHTML}
      </div>
    </div>
  `;
}

async function buildPreviewHTML_MD(vv, objURL) {
  const escapeHtml = (str = "") =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  let __mdFilesMap = new Map();
  try {
    const allFilesMeta = await loadFilesWithMetadataCached();
    (allFilesMeta || []).forEach((f) => {
      const base = (f.name || "").toLowerCase().trim();
      if (base) __mdFilesMap.set(base, f);
    });
    console.log("🗂️ MD filesMap size:", __mdFilesMap.size);
  } catch (e) {
    console.warn("⚠️ MD gagal load metadata cache:", e);
  }

  const isDone =
    (vv.status && String(vv.status).toLowerCase() === "selesai") ||
    (vv.__verStatus && String(vv.__verStatus).toLowerCase() === "disetujui");

  const fotoSources = vv.allPhotos || [];
  const fotoLampiranPages = renderFotoLampiranSection({
  fotoSources: vv.allPhotos || [],
  toSrc,
  escapeHtml,
  title: "FOTO YANG DILAMPIRKAN",
  captionPrefix: "Foto Survey",
});

  console.log("📸 MD - allPhotos:", fotoSources);

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

  const toSrc = (item, uniqueKey = "") => {
    if (!item) return "";
    if (typeof item === "string") return item;

    const cacheBuster = `?t=${Date.now()}&key=${uniqueKey}`;

    if (item.url && typeof item.url === "string") {
      console.log("✅ Using existing URL:", item.url);
      return item.url + cacheBuster;
    }

    if (item.path && typeof item.path === "string") {
      console.log("🔄 Generating URL from path:", item.path);
      try {
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(item.path);
        return (urlData?.publicUrl || "") + cacheBuster;
      } catch (error) {
        console.error("❌ Error generating URL from path:", error);
      }
    }

    // ====== TAMBAHAN: fallback fileName basename -> cari nested path lewat map cache ======
    if (item.fileName && !item.path) {
      const baseName = item.fileName.split("/").pop().toLowerCase().trim();
      const found = __mdFilesMap.get(baseName);

      if (found?.path) {
        console.log(
          "🧩 MD fallback fileName -> path:",
          baseName,
          "=>",
          found.path
        );
        try {
          const { data: urlData } = supabase.storage
            .from("foto-survey")
            .getPublicUrl(found.path);
          return (urlData?.publicUrl || "") + cacheBuster;
        } catch (e) {
          console.error("❌ MD fallback getPublicUrl error:", e);
        }
      }
    }

    if (item.fileName && typeof item.fileName === "string") {
      console.log("🔄 Generating URL from fileName:", item.fileName);

      let folder = "survey-images";
      const folderMap = {
        ktp: "ktp",
        kk: "kk",
        bukuTabungan: "buku-tabungan",
        formPengajuan: "form-pengajuan",
        formKeteranganAW: "form-ahli-waris",
        skKematian: "surat-kematian",
        aktaKelahiran: "akta-kelahiran",

        // TAMBAHAN kalau ada jenis/key sumber informasi
        sumberInformasi: "sumber-informasi",
        sumber_informasi: "sumber-informasi",
      };

      // 1) kalau item udah punya folder info dari metadata/prepareForOutput
      if (item.folder === "sumber-informasi") {
        folder = "sumber-informasi";
      }
      // 2) kalau fileName udah include foldernya (nested), langsung pakai as-is
      else if (item.fileName.includes("sumber-informasi/")) {
        folder = ""; // biar fullPath = fileName doang
      }
      // 3) mapping jenis/key dokumen biasa
      else if (item.jenis && folderMap[item.jenis]) {
        folder = folderMap[item.jenis];
      } else if (item.key && folderMap[item.key]) {
        folder = folderMap[item.key];
      }

      console.log("📁 Using folder:", folder || "(inline path)");

      try {
        const fullPath = folder ? `${folder}/${item.fileName}` : item.fileName;
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(fullPath);
        return (urlData?.publicUrl || "") + cacheBuster;
      } catch (error) {
        console.error("❌ Error generating URL from fileName:", error);
      }
    }

    if (item.dataURL) return item.dataURL;
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
        src.startsWith("data:application/pdf") ||
        /\.pdf(\?|$)/i.test(src) ||
        (f?.name || "").toLowerCase().endsWith(".pdf");
      if (isPdf) {
        return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`;
      }
      return `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;border:0.3mm solid #000;margin:1mm 0" />`;
    });
    const joined = pieces.filter(Boolean).join("");
    return joined || "-";
  };

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

  const dokumenHTML = [];
  if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
    console.log("🔍 Processing dokumen dari attachSurvey...");

    const dokumenKeys = [
      "ktp",
      "kk",
      "bukuTabungan",
      "formPengajuan",
      "formKeteranganAW",
      "skKematian",
      "aktaKelahiran",
    ];
    const dokumenLabels = {
      ktp: "KTP Korban",
      kk: "Kartu Keluarga (KK)",
      bukuTabungan: "Buku Tabungan",
      formPengajuan: "Formulir Pengajuan Santunan",
      formKeteranganAW: "Formulir Keterangan Ahli Waris",
      skKematian: "Surat Keterangan Kematian",
      aktaKelahiran: "Akta Kelahiran",
    };

    dokumenKeys.forEach((key) => {
      const dokumen = vv.attachSurvey[key];
      console.log(`🔍 Processing ${key}:`, dokumen);

      if (dokumen && (dokumen.url || dokumen.path || dokumen.fileName)) {
        const src = toSrc({ ...dokumen, jenis: key });
        if (src) {
          const label = dokumenLabels[key] || key;
          console.log(`✅ Found ${key} dengan URL:`, src);

          dokumenHTML.push(`
            <div style="margin:10px; padding:12px; border:2px solid #4CAF50; border-radius:8px; background:#f1f8e9; text-align:center;">
              <div style="font-weight:bold; margin-bottom:8px; color:#333;">📄 ${label}</div>
              <img src="${src}" alt="${label}" 
                  style="max-width:200px; max-height:200px; border:1px solid #ccc; border-radius:4px;"
                  onerror="console.log('❌ Gagal load: ${label}')"/>
            </div>
          `);
        }
      }
    });
  }

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
            src.startsWith("data:application/pdf") ||
            /\.pdf(\?|$)/i.test(src) ||
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

  const petugasSrc = (() => {
    const raw = (vv.petugasTtd || "").toString().trim();
    console.log("🖼️ TTD untuk preview:", raw);

    if (!raw) {
      console.log("❌ TTD kosong di preview");
      return null;
    }

    if (raw.startsWith("http")) {
      console.log("✅ URL TTD valid:", raw);

      const testImg = new Image();
      testImg.onload = () => console.log("🖼️ TTD Image loaded successfully");
      testImg.onerror = () => console.log("❌ TTD Image failed to load");
      testImg.src = raw;

      return raw + "?t=" + Date.now();
    }

    return null;
  })();

  const dokumenSection =
    dokumenHTML.length > 0
      ? `
    <div style="page-break-before: always; margin-top: 20mm;">
      <h3 style="text-align:center; font-size:14pt; margin-bottom:10mm;">DOKUMEN PENDUKUNG</h3>
      <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10mm;">
        ${dokumenHTML.join("")}
      </div>
    </div>
  `
      : "";

    
  const htmlMain = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    body{
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      margin:0; font-family:"Times New Roman", Times, serif; color:#000;
      font-size:11pt; line-height:1.4;
    }

    .header-top{ text-align:center; font-weight:bold; margin-bottom:6mm; }
    .instansi{ font-size:12pt; font-weight:bold; }
    .judul{ font-size:16pt; font-weight:bold; margin-top:2mm; }

    .rowline{
      margin:2mm 0;
      white-space:nowrap;
    }

    .lbl{ font-weight:bold; }
    .dotline{
      display:inline-block;
      border-bottom:0.3mm dotted #000;
      min-width:60mm;
      height:4mm;
      vertical-align:bottom;
      padding:0 1.5mm;
    }

    .jenis-wrap{ margin-top:2mm; }
    .jenis-title{ font-weight:bold; margin-bottom:1mm; }
    .jenis-opsi{
      margin-left:8mm;
      display:flex;
      gap:10mm;
      flex-wrap:wrap;
    }
    .jenis-opsi span{ white-space:nowrap; }

    table{
      width:100%; border-collapse:collapse; margin:3mm 0 5mm; font-size:11pt
    }
    th, td{
      border:0.3mm solid #000; padding:2mm 2.4mm; vertical-align:top
    }
    th{ text-align:center; font-weight:bold; }

    .box{
      border:0.3mm solid #000; padding:2.5mm; min-height:28mm;
      white-space:pre-wrap;
    }

    .signs{
      display:grid; grid-template-columns:1fr 1fr; column-gap:30mm; margin-top:14mm;
      font-size:11pt; text-align:center;
    }
    .name{ font-weight:bold; text-decoration:underline; }
    .space{ height:28mm; }

    .sig-wrap { min-height:86px; display:flex; align-items:center; justify-content:center; }
    .sig-loader {
      width: 22px; height: 22px; border-radius: 50%;
      border: 3px solid #ddd; border-top-color: #888;
      animation: spin 0.9s linear infinite; margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <div class="header-top">
    <div class="instansi">JASA RAHARJA WILAYAH RIAU</div>
    <div class="judul">LAPORAN HASIL SURVEI</div>
  </div>

  <!-- No. PL/ / -->
  <div class="rowline">
    <span class="lbl">No. PL/</span>
    &nbsp;/&nbsp;
    ${dotLine(escapeHtml(vv.noPL || ""), 95)}
  </div>

  <!-- Hari/tanggal survei + Petugas survei satu baris -->
  <div class="rowline">
    <span class="lbl">Hari/tanggal survei</span> :
    ${dotLine(escapeHtml(fmtDate(vv.hariTanggal)), 85)}
    &nbsp;&nbsp;
    <span class="lbl" style="font-weight:normal">Petugas survei</span>
    ${dotLine(escapeHtml(vv.petugasSurvei || vv.petugas || ""), 70)}
  </div>

  <!-- Jenis survei -->
  <div class="jenis-wrap">
    <div class="jenis-title">Jenis survei</div>
    <div class="jenis-opsi">
      <span>Keterjaminan korban</span>
      <span>Keabsahan ahli waris</span>
      <span>Keabsahan biaya perawatan/pengobatan</span>
    </div>
    <div class="rowline" style="margin-left:8mm;margin-top:1mm;">
      Lainnya ${dotLine(
        escapeHtml(vv.jenisSurvei || vv.jenisSurveyLabel || "Meninggal Dunia"),
        135
      )}
    </div>
  </div>

  <!-- Identitas korban -->
  <div class="rowline" style="margin-top:4mm;">
    <span class="lbl">Nama korban</span> :
    ${dotLine(escapeHtml(vv.namaKorban || vv.korban || ""), 75)}
    &nbsp;&nbsp;
    <span class="lbl">No. Berkas</span>
    ${dotLine(escapeHtml(vv.noBerkas ?? ""), 55)}
  </div>

  <div class="rowline">
    <span class="lbl">Alamat Korban</span> :
    ${dotLine(escapeHtml(vv.alamatKorban || ""), 150)}
  </div>

  <div class="rowline">
    <span class="lbl">Tempat/Tgl. Kecelakaan</span> :
    ${dotLine(escapeHtml(vv.tempatKecelakaan || ""), 120)}
    &nbsp;/&nbsp;${escapeHtml(fmtDate(vv.tglKecelakaan))}
  </div>

  <!-- Kesesuaian hubungan AW pakai checkbox -->
  <div class="rowline" style="margin-top:2mm;">
    Kesesuaian hubungan Ahli Waris dengan Korban:
    &nbsp;&nbsp;${cb(vv.hubunganSesuai === true)} Sesuai
    &nbsp;&nbsp;${cb(vv.hubunganSesuai === false)} Tidak Sesuai
    &nbsp; berdasarkan pengecekan NIK Korban pada database Ditjen Dukcapil
    dengan output URL: https://dukcapil-dwh.jasaraharja.co.id
  </div>

  <div style="margin-top:4mm;font-weight:bold;">Sumber Informasi :</div>
  <table>
    <thead>
      <tr>
        <th style="width:10mm">No</th>
        <th>Identitas/Detil Sumber Informasi dan Metode Perolehan Informasi</th>
        <th style="width:45mm">Tanda Tangan</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div style="font-weight:bold;margin:2mm 0 2mm;">Uraian dan Kesimpulan Hasil Survei :</div>
  <div class="box">${escapeHtml(vv.uraian || vv.kesimpulan || "")}</div>

  <p style="margin:6mm 0 8mm;">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </p>

  <div class="signs">
    <div>
      <div style="margin-bottom:10mm;text-align:left;">Mengetahui,</div>
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
        </div>`
          : `<div class="space"></div>`
      }
      <div class="name">${escapeHtml(
        vv.pejabatMengetahuiName || "Andi Raharja"
      )}</div>
      <div>${escapeHtml(
        vv.pejabatMengetahuiJabatan || "Kepala Bagian Operasional"
      )}</div>
    </div>

    <div>
      <div style="margin-bottom:10mm;text-align:left;">Petugas Survei,</div>
      <div class="space"></div>
      ${
        petugasSrc
          ? `<img src="${petugasSrc}" alt="TTD Petugas"
              style="max-height:60px; display:block; margin:4px auto; border:1px solid #ccc;" />`
          : ""
      }
      <div class="name">${escapeHtml(
        vv.petugasSurvei || vv.petugas || "................................"
      )}</div>
      <div>${escapeHtml(vv.petugasJabatan || "")}</div>
    </div>
  </div>

  ${filePages.join("")}
  ${fotoLampiranPages}
</body>
</html>`;

  return htmlMain;
}

function buildPreviewHTML_LL(vv, objURL) {
  console.log("🔍 LL preview FULL data:", vv);
  console.log("📸 LL - allPhotos DETAIL:", vv.allPhotos);

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

  // === toSrc LL ASLI kamu (nggak aku ubah logicnya) ===
  const toSrc = (item, uniqueKey = "") => {
    if (!item) return "";
    if (typeof item === "string") return item;

    const cacheBuster = `?t=${Date.now()}&key=${uniqueKey}`;

    if (item.url && typeof item.url === "string") {
      console.log("✅ Using existing URL:", item.url);
      return item.url; // keep as-is
    }

    if (item.path && typeof item.path === "string") {
      console.log("🔄 Generating URL from path:", item.path);
      try {
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(item.path);
        return urlData?.publicUrl || "";
      } catch (error) {
        console.error("❌ Error generating URL from path:", error);
      }
    }

    if (item.fileName && typeof item.fileName === "string") {
      console.log("🔄 toSrc: Trying fileName:", item.fileName);
      try {
        const fullPath = `survey-images/${item.fileName}`;
        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(fullPath);

        const generatedUrl = urlData?.publicUrl;
        if (generatedUrl) {
          console.log("✅ toSrc: Generated URL from fileName:", generatedUrl);
          return generatedUrl;
        }
      } catch (error) {
        console.error("❌ toSrc: Error generating URL from fileName:", error);
      }
    }

    if (item.dataURL) return item.dataURL;
    if (item.file instanceof File) return objURL?.(item.file) || "";
    return "";
  };

  // ===== FOTO UTAMA =====
  const fotoSources = vv.allPhotos || [];
  const fotoLampiranPages = renderFotoLampiranSection({
  fotoSources: vv.allPhotos || [],
  toSrc,
  escapeHtml,
  title: "FOTO YANG DILAMPIRKAN",
  captionPrefix: "Foto Survey",
});

  // ===== SUMBER INFORMASI (asli kamu) =====
  const sumbers = Array.isArray(vv.sumbers) ? vv.sumbers : [];
  const tableRows =
    sumbers.length > 0
      ? sumbers
          .map((r, i) => {
            const fotos =
              (Array.isArray(r?.foto) ? r.foto : r?.foto ? [r.foto] : [])
                .map((f) => {
                  const s = toSrc(f);
                  if (!s) return "";
                  const isPdf =
                    s.startsWith("data:application/pdf") ||
                    /\.pdf(\?|$)/i.test(s);
                  if (isPdf)
                    return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF]</div>`;
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

  // ===== TTD PETUGAS (asli kamu) =====
  const petugasSrc = (() => {
    const raw = (vv.petugasTtd || "").toString().trim();
    console.log("🖼️ TTD untuk preview:", raw);
    if (!raw) return null;
    if (raw.startsWith("http")) return raw + "?t=" + Date.now();
    return null;
  })();

  // ===== Jenis survei (buat layout checkbox) =====
  const jenis = (vv.jenisSurvei || "").toLowerCase();
  const isKetKorban = jenis.includes("keterjaminan");
  const isKeabsWaris =
    jenis.includes("ahli waris") || jenis.includes("keabsahan_ahli_waris");
  const isKeabsBiaya = jenis.includes("biaya");

  const lainnyaTxt =
    !isKetKorban && !isKeabsWaris && !isKeabsBiaya
      ? vv.jenisSurveiLainnya || vv.jenisSurvei || ""
      : vv.jenisSurveiLainnya || "";

  const chk = (on) => (on ? "☑" : "☐");

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  body{
    font-family:"Times New Roman", Times, serif;
    color:#000; margin:0; font-size:11pt; line-height:1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .header{ text-align:center;font-weight:bold;font-size:12pt;letter-spacing:.4pt;text-transform:uppercase;margin-top:2mm; }
  .title{ text-align:center;font-size:16pt;font-weight:bold;text-transform:uppercase;margin:3mm 0 7mm; }

  .row{
    display:grid;
    grid-template-columns: 48mm 4mm 1fr 18mm 40mm 4mm 1fr;
    column-gap:1.5mm; row-gap:1mm; margin:1.8mm 0; align-items:start;
  }
  .row.single{ grid-template-columns: 48mm 4mm 1fr; }
  .label{ white-space:nowrap; }
  .colon{ text-align:center; }
  .value{ white-space:pre-wrap; }

  .nopls{ display:flex; justify-content:center; align-items:center; gap:3mm; margin:0 0 3mm; }
  .nopls .plval{
    min-width:70mm;text-align:center;border-bottom:0.35mm solid #000;padding:0 2mm 1mm;
  }

  .jenis-wrap{ margin:2mm 0 3mm; }
  .jenis-line{ display:flex; flex-wrap:wrap; gap:10mm; margin-left:24mm; margin-top:1mm; }
  .lainnya-line{
    margin-left:24mm;margin-top:1.5mm;
    display:grid; grid-template-columns: 18mm 4mm 1fr; column-gap:1.5mm;
  }

  table{ width:100%; border-collapse:collapse; margin:3mm 0 4mm; font-size:11pt; }
  th, td{ border:1px solid #000; padding:2mm 2.2mm; vertical-align:top; }
  th{ text-align:center; font-weight:bold; }

  .box{ border:1px solid #000; padding:2.5mm; white-space:pre-wrap; min-height:25mm; }

  .signs{ display:grid; grid-template-columns:1fr 1fr; margin-top:8mm; column-gap:30mm; }
  .sign-col{ text-align:center; }
  .sign-space{ height:28mm; }
  .sign-img{ max-height:28mm; max-width:70mm; display:block; margin:0 auto; }
  .sign-name{ font-weight:bold; text-decoration:underline; }

  /* FOTO di halaman baru */
  .foto-section{
    margin-top:8mm;
    page-break-before: always;
  }
  .foto-title{
    text-align:center;
    font-weight:bold;
    font-size:13pt;
    margin-bottom:4mm;
    text-transform:uppercase;
  }
  .foto-grid{
    display:flex;
    flex-wrap:wrap;
    gap:4mm;
    justify-content:center;
  }
  .foto-item{
    width:78mm;
    border:0.3mm solid #ccc;
    border-radius:2mm;
    padding:2.5mm;
    text-align:center;
    page-break-inside:avoid;
    background:#fff;
  }
  .foto-item img{
    max-width:100%;
    max-height:70mm;
    object-fit:contain;
    border:0.2mm solid #ddd;
    border-radius:1.5mm;
  }
  .foto-caption{
    font-size:10pt;
    color:#333;
    margin-top:2mm;
    word-break:break-word;
  }
  .foto-empty{
    text-align:center; color:#666; font-style:italic;
    padding:8mm; border:0.3mm dashed #bbb; border-radius:2mm;
  }

  .sig-wrap { min-height:86px; display:flex; align-items:center; justify-content:center; }
  .sig-loader {
    width: 22px; height: 22px; border-radius: 50%;
    border: 3px solid #ddd; border-top-color: #888;
    animation: spin 0.9s linear infinite; margin: 0 auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

  <div class="header">JASA RAHARJA WILAYAH RIAU</div>
  <div class="title">LAPORAN HASIL SURVEI</div>

  <div class="nopls">
    <div>No. PL/</div>
    <div class="plval value">${escapeHtml(vv.noPL || "")}</div>
  </div>

  <div class="row">
    <div class="label">Hari/tanggal survei</div><div class="colon">:</div>
    <div class="value">${escapeHtml(fmtDate(vv.hariTanggal))}</div>
    <div></div>
    <div class="label">Petugas survei</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.petugasSurvei || vv.petugas || "")}</div>
  </div>

  <div class="jenis-wrap">
    <div class="row single" style="margin-bottom:0;">
      <div class="label">Jenis survei</div><div class="colon"></div><div></div>
    </div>

    <div class="jenis-line">
      <div>${chk(isKetKorban)} Keterjaminan korban</div>
      <div>${chk(isKeabsWaris)} Keabsahan ahli waris</div>
      <div>${chk(isKeabsBiaya)} Keabsahan biaya perawatan/pengobatan</div>
    </div>

    <div class="lainnya-line">
      <div class="label">Lainnya</div><div class="colon">:</div>
      <div class="value">${escapeHtml(lainnyaTxt || "")}</div>
    </div>
  </div>

  <div class="row">
    <div class="label">Nama korban</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.namaKorban || vv.korban || "")}</div>
    <div></div>
    <div class="label">No. Berkas</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.noBerkas ?? "")}</div>
  </div>

  <div class="row single">
    <div class="label">Alamat Korban</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.alamatKorban || "")}</div>
  </div>

  <div class="row single">
    <div class="label">Tempat/Tgl. Kecelakaan</div><div class="colon">:</div>
    <div class="value">
      ${escapeHtml(vv.tempatKecelakaan || "")} / ${escapeHtml(
    fmtDate(vv.tglKecelakaan)
  )}
    </div>
  </div>

  <div style="margin-top:2mm;">
    <span class="label">Kesesuaian hubungan Ahli Waris dengan Korban:</span>
    &nbsp;&nbsp;
    <b>${
      vv.hubunganSesuai === ""
        ? "-"
        : vv.hubunganSesuai
        ? "Sesuai"
        : "Tidak Sesuai"
    }</b>
    &nbsp;&nbsp; berdasarkan pengecekan NIK Korban pada database Ditjen Dukcapil dengan output URL:
    https://dukcapil-dwh.jasaraharja.co.id
  </div>

  <div style="margin-top:4mm;font-weight:bold;">Sumber Informasi :</div>
  <table>
    <thead>
      <tr>
        <th style="width:10mm">No</th>
        <th>Identitas/Detil Sumber Informasi dan Metode Perolehan Informasi</th>
        <th style="width:40mm">Tanda Tangan</th>
      </tr>
    </thead>
    <tbody>
      ${
        tableRows ||
        autoTableRows ||
        '<tr><td style="text-align:center">1</td><td></td><td></td></tr>'
      }
    </tbody>
  </table>

  <div style="margin-top:2mm;font-weight:bold;">Uraian dan Kesimpulan Hasil Survei :</div>
  <div class="box">${escapeHtml(vv.uraian || vv.kesimpulan || "")}</div>

  <p style="margin-top:4mm;">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </p>

  <div class="signs">
    <div class="sign-col">
      <div style="margin-bottom:10mm;text-align:left;">Mengetahui,</div>
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
        </div>`
          : `<div class="sign-space"></div>`
      }
      <div class="sign-name">${escapeHtml("Andi Raharja")}</div>
      <div>${escapeHtml("Kepala Bagian Operasional")}</div>
    </div>

    <div class="sign-col">
      <div style="margin-bottom:10mm;text-align:left;">Petugas Survei,</div>
      <div class="sign-space">
        ${petugasSrc ? `<img class="sign-img" src="${petugasSrc}" />` : ""}
      </div>
      <div class="sign-name">${escapeHtml(
        vv.petugasSurvei || vv.petugas || ".............................."
      )}</div>
      <div>${escapeHtml(vv.petugasJabatan || "")}</div>
    </div>
  </div>

  ${fotoLampiranPages}

</body>
</html>`;
}

function buildPreviewHTML_RS(vv, objURL) {
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

  if (vv.attachSurvey) {
    if (Array.isArray(vv.attachSurvey)) {
      console.log("📋 attachSurvey is ARRAY");
      vv.attachSurvey.forEach((item, idx) => {
        console.log(`   [${idx}]`, item);
        console.log(`      - type:`, typeof item);
        console.log(`      - keys:`, item ? Object.keys(item) : "null");
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

  // PRIORITAS 1: fotoSurveyList
  if (Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length > 0) {
    console.log("✅ RS pakai fotoSurveyList:", vv.fotoSurveyList.length);
    fotoCandidates.push(...vv.fotoSurveyList);

    // PRIORITAS 1b: allPhotos kalau fotoSurveyList kosong
  } else if (Array.isArray(vv.allPhotos) && vv.allPhotos.length > 0) {
    console.log("🔄 RS fallback ke allPhotos:", vv.allPhotos.length);
    fotoCandidates.push(...vv.allPhotos);

    // PRIORITAS 2: attachSurvey kalau dua di atas kosong
  } else if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
    console.log("🔄 RS fallback ke attachSurvey");

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

    // PRIORITAS 3: foto_survey
  } else if (vv.foto_survey) {
    console.log("🔄 RS fallback ke foto_survey");
    if (Array.isArray(vv.foto_survey)) fotoCandidates.push(...vv.foto_survey);
    else if (typeof vv.foto_survey === "string") {
      try {
        const parsed = JSON.parse(vv.foto_survey);
        if (Array.isArray(parsed)) fotoCandidates.push(...parsed);
      } catch {}
    }
  }

  console.log("📸 RS fotoCandidates before dedupe:", fotoCandidates.length);

  const seenFoto = new Set();
  const uniqFotoCandidates = [];

  const normalizeFotoKey = (f) => {
    if (!f) return "";

    // prioritas pakai url → biasanya paling “asli”
    let raw =
      (typeof f === "string" && f) ||
      f.url ||
      f.path ||
      f.fileName ||
      f.name ||
      "";

    raw = String(raw).split("?")[0].split("#")[0];
    const base = raw.split("/").pop() || raw;

    // NORMALISASI:
    // buang prefix auto seperti:
    // foto_1764495690107.jpeg, survey_1764....jpg, 1764_xxx.jpg
    const norm = base
      .replace(/^(foto|survey)[_-]?\d{6,}[_-]?/i, "") // hapus "foto_123456..."
      .replace(/^\d{10,13}[_-]?/i, "") // hapus timestamp di depan
      .toLowerCase()
      .trim();

    // kalau norm kosong, fallback ke base
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
    if (!fotoObj) {
      console.log("❌ fotoObj is null/undefined");
      return "";
    }

    console.log("🔍 Processing foto object:", fotoObj);

    // Case 1: Jika fotoObj adalah string langsung (URL)
    if (typeof fotoObj === "string") {
      console.log("✅ Using string as URL:", fotoObj);
      return fotoObj;
    }

    // Case 2: Prioritaskan URL yang sudah ada
    if (fotoObj.url && typeof fotoObj.url === "string") {
      console.log("✅ Using existing URL:", fotoObj.url);
      return fotoObj.url;
    }

    // Case 3: Handle path Supabase - PERBAIKI: survey-images (bukan survey_images)
    if (fotoObj.path && typeof fotoObj.path === "string") {
      console.log("🔄 Generating URL from path:", fotoObj.path);
      try {
        // PERBAIKAN: Gunakan survey-images (dengan DASH)
        let storagePath = fotoObj.path;

        // Jika path tidak mengandung folder survey-images, tambahkan
        if (!storagePath.includes("survey-images/")) {
          storagePath = `survey-images/${storagePath}`;
        }

        const { data: urlData } = supabase.storage
          .from("foto-survey")
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
    if (fotoObj.fileName && typeof fotoObj.fileName === "string") {
      console.log("🔄 Generating URL from fileName:", fotoObj.fileName);
      try {
        // PERBAIKAN: Gunakan folder survey-images (dengan DASH)
        const fullPath = fotoObj.fileName.includes("survey-images/")
          ? fotoObj.fileName
          : `survey-images/${fotoObj.fileName}`;

        const { data: urlData } = supabase.storage
          .from("foto-survey")
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

    // Case 5: Data URL
    if (fotoObj.dataURL && typeof fotoObj.dataURL === "string") {
      console.log("✅ Using dataURL");
      return fotoObj.dataURL;
    }

    console.log("❌ No valid source found for foto object");
    return "";
  };

  const processedFotos = uniqFotoCandidates
    .map((foto, index) => {
      console.log(`🔄 Processing candidate ${index}:`, foto);
      const src = toSrc(foto);
      if (!src) return null;

      const name = escapeHtml(
        foto.name ||
          foto.fileName ||
          foto.originalName ||
          `Foto Survey ${index + 1}`
      );

      const isPdf =
        src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);

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
                ${
                  foto.uploadedAt
                    ? `<div style="font-size:10px; color:#888; margin-top:2px;">
                        ${new Date(foto.uploadedAt).toLocaleDateString("id-ID")}
                    </div>`
                    : ""
                }
            </div>`;
    })
    .filter(Boolean);

  const fotoSources = uniqFotoCandidates; // ini sumber kandidat asli sebelum diproses
const fotoLampiranPages = renderFotoLampiranSection({
  fotoSources: uniqFotoCandidates,
  toSrc,
  escapeHtml,
  title: "FOTO YANG DILAMPIRKAN",
  captionPrefix: "Foto Survey",
});


  const fotosHTML =
    processedFotos.length > 0
      ? processedFotos.join("")
      : `<div style="text-align:center; color:#666; font-style:italic; padding:20px; border:1px dashed #ccc; border-radius:8px;">
          Tidak ada foto yang dilampirkan
          <br/><small>Debug: attachSurvey=${
            vv.attachSurvey ? "exists" : "null"
          }, foto_survey=${vv.foto_survey ? "exists" : "null"}, candidates=${
          fotoCandidates.length
        }</small>
        </div>`;

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
    if (!raw.includes("/")) {
      storagePath = `ttd-petugas/${raw}`;
    } else if (raw.startsWith("ttd-petugas/")) {
      storagePath = raw;
    }

    console.log("🔄 Using TTD storage path:", storagePath);

    try {
      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(storagePath);

      const generatedUrl = urlData?.publicUrl;
      console.log("🔗 Generated TTD URL:", generatedUrl);

      return generatedUrl;
    } catch (error) {
      console.error("❌ Error generating TTD URL:", error);
      return null;
    }
  })();

  console.log("vv:", vv);
  console.log("vv.korban:", vv?.korban);

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
      .sig-wrap { min-height:86px; display:flex; align-items:center; justify-content:center; }
      .sig-loader {
        width: 22px; height: 22px; border-radius: 50%;
        border: 3px solid #ddd; border-top-color: #888;
        animation: spin 0.9s linear infinite; margin: 0 auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
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
            ? `<img src="${petugasSrc}" alt="TTD Petugas" style="max-height:80px; display:block; margin:4px auto;" 
              onerror="this.style.display='none'"/>`
            : "<br/><br/><br/>"
        }
        <b>${escapeHtml(
          vv.petugas || "................................"
        )}</b><br/>
        <i>${escapeHtml(vv.petugas_jabatan || vv.petugasJabatan || "")}</i>
      </div>
    </div>

    ${fotoLampiranPages}

  </body>
  </html>`;
}

function extractTimestampFromFileName(fileName) {
  console.log(`🔍 Extracting timestamp from: ${fileName}`);

  const pattern1 = fileName.match(/^(\d+)_/);
  if (pattern1 && pattern1[1]) {
    const timestamp = parseInt(pattern1[1]);
    if (!isNaN(timestamp) && timestamp > 1600000000000) {
      console.log(`✅ Extracted timestamp: ${timestamp} from ${fileName}`);
      return new Date(timestamp).toISOString();
    }
  }

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

async function listRecursive(bucket, prefix, depth = 2) {
  const out = [];

  async function walk(currentPrefix, currentDepth, topFolder) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(currentPrefix);

    if (error) {
      console.error("❌ list error", currentPrefix, error);
      return;
    }
    if (!data) return;

    for (const item of data) {
      const isFolder = !item.id;
      // supabase storage list: folder biasanya id=null + name=folderName

      if (isFolder && currentDepth > 0) {
        await walk(
          `${currentPrefix}/${item.name}`.replace(/^\//, ""),
          currentDepth - 1,
          topFolder
        );
      } else if (!isFolder) {
        const fullPath = `${currentPrefix}/${item.name}`.replace(/^\//, "");
        out.push({
          ...item,
          path: fullPath,
          folder: topFolder || currentPrefix.split("/")[0],
        });
      }
    }
  }

  await walk(prefix, depth, prefix.split("/")[0]);
  return out;
}

async function loadFilesWithMetadata() {
  console.log("🔍 Loading files with metadata...");

  let allFiles = [];

  try {
    // ===== survey-images (biasanya flat, tapi aman juga rekursif) =====
    const surveyImagesFiles = await listRecursive(
      "foto-survey",
      "survey-images",
      2
    );

    const surveyWithMeta = surveyImagesFiles.map((file) => {
      const timestampFromName = extractTimestampFromFileName(file.name);
      const fallbackIso =
        file.created_at || file.updated_at || file.last_accessed_at || null;

      const finalIso = timestampFromName || fallbackIso;

      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(file.path);

      return {
        ...file,
        url: urlData?.publicUrl || "",
        uploadedAt: finalIso,
        timestamp: finalIso ? new Date(finalIso).getTime() : null,
      };
    });

    allFiles.push(...surveyWithMeta);

    // ===== sumber-informasi =====
    const sumberInfoFiles = await listRecursive(
      "foto-survey",
      "sumber-informasi",
      2
    );

    const sumberWithMeta = sumberInfoFiles.map((file) => {
      const timestampFromName = extractTimestampFromFileName(file.name);
      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(file.path);

      return {
        ...file,
        url: urlData?.publicUrl || "",
        uploadedAt: timestampFromName,
        timestamp: timestampFromName
          ? new Date(timestampFromName).getTime()
          : null,
      };
    });

    allFiles.push(...sumberWithMeta);

    // ===== dokumen per folder (INI YANG PENTING) =====
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
      console.log(`📁 Loading documents recursively from: ${folder}`);

      const docFiles = await listRecursive("foto-survey", folder, 2);

      const docWithMeta = docFiles.map((file) => {
        const timestampFromName = extractTimestampFromFileName(file.name);
        const fallbackIso =
          file.created_at || file.updated_at || file.last_accessed_at || null;

        const finalIso = timestampFromName || fallbackIso;

        const { data: urlData } = supabase.storage
          .from("foto-survey")
          .getPublicUrl(file.path);

        return {
          ...file,
          url: urlData?.publicUrl || "",
          uploadedAt: finalIso,
          timestamp: finalIso ? new Date(finalIso).getTime() : null,
        };
      });

      allFiles.push(...docWithMeta);
      console.log(
        `✅ Loaded ${docWithMeta.length} files from ${folder} (nested)`
      );
    }
  } catch (error) {
    console.error("❌ Error loading files with metadata:", error);
  }

  console.log("📚 TOTAL ALL FILES LOADED:", allFiles.length);

  const filesByFolder = {};
  allFiles.forEach((file) => {
    if (!filesByFolder[file.folder]) filesByFolder[file.folder] = 0;
    filesByFolder[file.folder]++;
  });
  console.log("📊 FILES COUNT BY FOLDER:", filesByFolder);

  return allFiles;
}

function clearPreviousInputState() {
  if (window.previewData) {
    window.previewData.allPhotos = [];
    window.previewData.attachSurvey = {};
    window.previewData.fotoSurveyList = [];
  }

  if (window.objURLCache) {
    Object.values(window.objURLCache).forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    window.objURLCache = {};
  }

  console.log("🧹 Previous input state cleared");
}

// ===== CACHE GLOBAL UNTUK STORAGE LIST =====
let __filesMetadataCache = null;
let __filesMetadataPromise = null;

async function loadFilesWithMetadataCached() {
  if (__filesMetadataCache) return __filesMetadataCache;
  if (__filesMetadataPromise) return __filesMetadataPromise;

  __filesMetadataPromise = (async () => {
    try {
      const files = await loadFilesWithMetadata();
      __filesMetadataCache = files || [];
      return __filesMetadataCache;
    } catch (e) {
      console.warn("⚠️ loadFilesWithMetadataCached failed:", e);
      __filesMetadataCache = [];
      return __filesMetadataCache;
    } finally {
      __filesMetadataPromise = null;
    }
  })();

  return __filesMetadataPromise;
}

async function prepareForOutput(rec) {
  const vv = {
    allPhotos: [],
    sumbers: [],
    fotoSurveyList: [],
    attachSurvey: {},
    files: [],
  };

  const files = [];

  const seenFiles = new Set();

  const canonicalKeyOf = (f) => {
    if (!f) return "";

    let raw =
      (typeof f === "string" && f) ||
      f.fileName ||
      f.path ||
      f.url ||
      f.name ||
      "";

    raw = String(raw);

    // buang query/hash
    raw = raw.split("?")[0].split("#")[0];

    // ambil basename
    const base = raw.split("/").pop() || raw;

    return base.toLowerCase().trim();
  };

  const pushFile = (f, label = "Lampiran", source = "unknown") => {
    if (!f) {
      return;
    }

    if (Array.isArray(f)) {
      f.forEach((item) => pushFile(item, label, source));
      return;
    }

    const hasValidIdentifier = f.fileName || f.path || f.url || f.name;
    if (!hasValidIdentifier) {
      console.log(`❌ Skip ${label} - no valid identifier`, f);
      return;
    }

    const ckey = canonicalKeyOf(f);
    if (ckey && seenFiles.has(ckey)) {
      console.log(`🟡 Skip duplicate (${ckey}) from ${source}`);
      return;
    }
    if (ckey) seenFiles.add(ckey);

    console.log(`✅ Adding file from ${source}:`, {
      label,
      fileName: f.fileName,
      path: f.path,
      name: f.name,
      ckey,
    });

    if (typeof f === "string") {
      files.push({
        label,
        name: f.split("/").pop() || label,
        fileName: f,
        url: f,
      });
      return;
    }

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
      recordTime: rec.createdAt || rec.waktu,
      __ckey: ckey,
    };

    files.push(entry);
  };

  const matchByIdentity = (file, rec) => {
    const name = (file.name || "").toLowerCase();

    const id = String(rec.id || rec.local_id || "").toLowerCase();
    const noPL = String(rec.noPL || rec.no_pl || "").toLowerCase();
    const korban = String(rec.korban || rec.namaKorban || rec.nama_korban || "")
      .toLowerCase()
      .replace(/\s+/g, "");

    if (id && name.includes(id)) return true;
    if (noPL && name.includes(noPL)) return true;

    // optional kalau nama korban dipakai di filename
    if (korban && name.replace(/\s+/g, "").includes(korban)) return true;

    return false;
  };

  console.log("🔍 [TIME-BASED] Searching files based on upload time...");

  const allFilesWithMetadata = await loadFilesWithMetadataCached();
  if (!allFilesWithMetadata || allFilesWithMetadata.length === 0) {
    console.warn(
      "⚠️ Metadata storage kosong / gagal load. Lanjut tanpa lampiran."
    );
  }

  const recordTime = new Date(rec.createdAt || rec.waktu).getTime();
  console.log(
    `🕐 Record created at: ${new Date(recordTime).toLocaleString("id-ID")}`
  );

  if (rec.createdAt || rec.waktu) {
    const allSurveyFiles = allFilesWithMetadata.filter(
      (f) => f.folder === "survey-images"
    );

    // 1) coba identity match dulu
    const identityFiles = allSurveyFiles.filter((f) => matchByIdentity(f, rec));

    let chosen = identityFiles;

    if (chosen.length === 0) {
      // 2) fallback time window dipersempit (90 detik)
      chosen = allSurveyFiles.filter((file) => {
        if (!file.timestamp) return false;
        const timeDiff = Math.abs(file.timestamp - recordTime);
        return timeDiff <= 2 * 60 * 1000;
      });
    }

    if (chosen.length > 0) {
      console.log(`🎯 Found ${chosen.length} relevant survey files`);

      chosen
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .forEach((file, index) => {
          pushFile(
            {
              name: `survey_${index + 1}`,
              fileName: file.name,
              url: file.url,
              folder: file.folder,
              uploadedAt: file.timestamp
                ? new Date(file.timestamp).toISOString()
                : null,
              inputId: rec.id,
              timestamp: file.timestamp,
            },
            `Foto Survey ${index + 1}`,
            identityFiles.length > 0 ? "identity-filter" : "time-based-filter"
          );
        });
    } else {
      console.log("❌ No relevant survey files found");
    }
  }

  console.log("🔍 [SOURCE-INFO] Searching for sumber informasi photos...");

  const sumberInfoFiles = allFilesWithMetadata.filter((file) => {
    if (file.folder !== "sumber-informasi") return false;
    if (!file.timestamp) return false;

    const fileTime = file.timestamp;
    const timeDiff = Math.abs(fileTime - recordTime);
    const isRelevant = timeDiff <= 5 * 60 * 1000;

    if (isRelevant) {
      console.log(
        `✅ Sumber info match: ${file.name} | Diff: ${Math.round(
          timeDiff / 1000
        )} detik`
      );
    }

    return isRelevant;
  });

  if (sumberInfoFiles.length > 0) {
    console.log(`🎯 Found ${sumberInfoFiles.length} sumber informasi files`);

    sumberInfoFiles.sort((a, b) => a.timestamp - b.timestamp);

    if (!vv.sumbers || !Array.isArray(vv.sumbers)) {
      vv.sumbers = [];
    }

    sumberInfoFiles.forEach((file, index) => {
      let sumberDataFromDB = null;

      console.log("🔍 MENCARI DATA SUMBER INFORMASI:");
      console.log("   - rec.sumberInformasi:", rec.sumberInformasi);
      console.log("   - rec.sumbers:", rec.sumbers);

      if (
        rec.sumberInformasi &&
        Array.isArray(rec.sumberInformasi) &&
        rec.sumberInformasi[index]
      ) {
        sumberDataFromDB = rec.sumberInformasi[index];
        console.log(
          `✅ Found sumber data from rec.sumberInformasi[${index}]:`,
          sumberDataFromDB
        );
      } else if (
        rec.sumbers &&
        Array.isArray(rec.sumbers) &&
        rec.sumbers[index]
      ) {
        sumberDataFromDB = rec.sumbers[index];
        console.log(
          `✅ Found sumber data from rec.sumbers[${index}]:`,
          sumberDataFromDB
        );
      } else if (
        rec.attachSurvey &&
        rec.attachSurvey.sumberInformasi &&
        Array.isArray(rec.attachSurvey.sumberInformasi) &&
        rec.attachSurvey.sumberInformasi[index]
      ) {
        sumberDataFromDB = rec.attachSurvey.sumberInformasi[index];
        console.log(
          `✅ Found sumber data from attachSurvey.sumberInformasi[${index}]:`,
          sumberDataFromDB
        );
      } else {
        console.log(
          `❌ No sumber data found for index ${index}, using fallback`
        );
      }

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

        console.log(
          `📝 Set identitas for sumber ${index + 1}:`,
          vv.sumbers[index].identitas
        );
      }

      if (!vv.sumbers[index].foto) {
        vv.sumbers[index].foto = [];
      }

      vv.sumbers[index].foto.push({
        name: `sumber_info_${index + 1}`,
        fileName: file.name,
        url: file.url,
        folder: file.folder,
        inputId: rec.id,
      });

      console.log(
        `✅ Added photo to sumber informasi ${index + 1}: ${file.name}`
      );
    });
  } else {
    console.log("❌ No sumber informasi files found");
  }

  if (vv.sumbers && Array.isArray(vv.sumbers)) {
    console.log("🔍 Processing existing sumbers data:", vv.sumbers.length);

    vv.sumbers.forEach((sumber, index) => {
      if (sumber.foto && Array.isArray(sumber.foto)) {
        sumber.foto.forEach((foto, fotoIndex) => {
          if (foto && !foto.url) {
            if (foto.fileName) {
              const matchingFile = allFilesWithMetadata.find(
                (file) =>
                  file.name === foto.fileName &&
                  file.folder === "sumber-informasi"
              );

              if (matchingFile) {
                foto.url = matchingFile.url;
                console.log(
                  `✅ Assigned URL to sumber ${index + 1} foto ${
                    fotoIndex + 1
                  }: ${foto.fileName}`
                );
              }
            }
          }
        });
      }
    });
  }

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

  vv.template = rec.template || "";
  vv.jenisSurveyLabel =
    rec.jenisSurveyLabel ||
    rec.jenis_survey_label ||
    rec.jenisSurvei ||
    rec.jenis_survei ||
    rec.sifatCidera ||
    "";
  vv.jenisSurvei = rec.jenisSurvei ?? "";

  vv.petugas = rec.petugas ?? "";
  vv.petugasSurvei = rec.petugasSurvei || rec.petugas || "";
  vv.korban = rec.korban || rec.namaKorban || "";
  vv.noPL = rec.noPL ?? "";
  vv.noBerkas =
    rec.noBerkas ?? rec.no_berkas ?? rec.no_berkas_aw ?? rec.noBerkasAW ?? "";
  vv.alamatKorban = rec.alamatKorban ?? "";
  vv.lokasiKecelakaan =
    rec.lokasiKecelakaan ??
    rec.lokasi_kecelakaan ??
    rec.tempatKecelakaan ??
    rec.tempat_kecelakaan ??
    "";
  vv.tempatKecelakaan = vv.lokasiKecelakaan;
  vv.wilayah = rec.wilayah || "";
  vv.rumahSakit = rec.rumahSakit || "";

  console.log("🔍 [prepareForOutput] Mencari TTD dari berbagai sumber:");
  console.log("   - rec.petugas_ttd:", rec.petugas_ttd);
  console.log("   - rec.petugasTtd:", rec.petugasTtd);
  console.log("   - rec.attachSurvey:", rec.attachSurvey);
  console.log("   - rec.attachments:", rec.attachments);

  vv.petugasTtd =
    rec.petugas_ttd ||
    rec.petugasTtd ||
    (rec.attachSurvey && typeof rec.attachSurvey === "object"
      ? rec.attachSurvey.petugasTtd?.url
      : null) ||
    (rec.attachments && typeof rec.attachments === "object"
      ? rec.attachments.petugas_ttd
      : null) ||
    null;

  console.log("✅ [prepareForOutput] Final vv.petugasTtd:", vv.petugasTtd);

  vv.tglKecelakaan = rec.tglKecelakaan ?? "";
  vv.hariTanggal = rec.hariTanggal ?? "";
  vv.tglMasukRS = rec.tglMasukRS || "";
  vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
  vv.tglJamKunjungan = rec.tglJamKunjungan || "";

  vv.uraian = rec.uraian ?? "";
  vv.kesimpulan = rec.kesimpulan ?? "";
  vv.uraianKunjungan = rec.uraianKunjungan || "";
  vv.rekomendasi = rec.rekomendasi || "";

  console.log("🔎 HS sources MD:", {
    top: rec.hubunganSesuai,
    checklist: rec.verifyChecklist?.hubunganSesuai,
    checklist_snake: rec.verify_checklist?.hubunganSesuai,
    attach_aw: rec.attachSurvey?.hubungan_aw,
    attach: rec.attachSurvey?.hubunganSesuai,
  });

  let hs =
    rec.hubunganSesuai ??
    rec.verifyChecklist?.hubunganSesuai ??
    rec.verify_checklist?.hubunganSesuai ??
    rec.attachSurvey?.hubunganSesuai ??
    rec.attachSurvey?.hubungan_aw ??
    rec.hubungan_aw ??
    rec.hubunganSesuaiAW ??
    null;
  if (typeof hs === "string") {
    const s = hs.trim().toLowerCase();
    if (["ya", "y", "true", "1", "sesuai"].includes(s)) hs = true;
    else if (
      ["tidak", "tdk", "no", "n", "false", "0", "tidak sesuai"].includes(s)
    )
      hs = false;
    else if (s === "") hs = null;
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

  vv.fotoSurveyList = [];
  if (rec.foto_survey) {
    try {
      let fotoData = rec.foto_survey;

      if (typeof fotoData === "string" && fotoData.trim() !== "") {
        fotoData = JSON.parse(fotoData);
      }

      if (Array.isArray(fotoData)) {
        vv.fotoSurveyList = fotoData;
        console.log("✅ foto_survey processed, count:", fotoData.length);

        fotoData.forEach((foto, index) => {
          if (foto && (foto.url || foto.fileName || foto.name)) {
            pushFile(foto, `Foto Survey ${index + 1}`);
          }
        });
      }
    } catch (error) {
      console.error("❌ Error parsing foto_survey:", error);
      vv.fotoSurveyList = [];
    }
  } else {
    console.log("📸 [prepareForOutput] No foto_survey found, set empty array");
  }

  console.log("📸 [prepareForOutput] Final fotoSurveyList:", vv.fotoSurveyList);

  vv.attachSurvey = rec.attachSurvey ?? {};
  console.log("🔍 [prepareForOutput] attachSurvey original:", rec.attachSurvey);
  console.log("🔍 [prepareForOutput] attachSurvey final:", vv.attachSurvey);

  console.log("🔍 [prepareForOutput] Processing photo sources:");
  console.log("   - fotoSurveyList:", vv.fotoSurveyList);
  console.log("   - attachSurvey:", vv.attachSurvey);

  if (
    vv.attachSurvey &&
    typeof vv.attachSurvey === "object" &&
    !Array.isArray(vv.attachSurvey)
  ) {
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
    };

    Object.entries(vv.attachSurvey).forEach(([key, value]) => {
      if (
        key.toLowerCase().includes("ttd") ||
        key.toLowerCase().includes("signature") ||
        value === false
      ) {
        return;
      }

      if (value === true) {
        console.log(`🔍 Looking for file matching key: ${key}`);

        const targetFolder = folderMapping[key] || "survey-images";
        console.log(`📁 Searching in folder: ${targetFolder} for key: ${key}`);

        const folderFiles = allFilesWithMetadata.filter(
          (file) => file.folder === targetFolder
        );

        if (folderFiles.length === 0) {
          console.log(`❌ No files found in folder ${targetFolder}`);
          return;
        }

        let bestMatch = null;
        let smallestDiff = Infinity;

        folderFiles.forEach((file) => {
          if (file.timestamp) {
            const timeDiff = Math.abs(file.timestamp - recordTime);

            if (timeDiff < smallestDiff && timeDiff < 2 * 60 * 1000) {
              smallestDiff = timeDiff;
              bestMatch = file;
            }
          }
        });

        if (bestMatch && bestMatch.url) {
          console.log(
            `✅ Found matching file for ${key}:`,
            bestMatch.name,
            `| Time diff: ${smallestDiff}ms`
          );
          pushFile(
            {
              name: key,
              fileName: bestMatch.name,
              url: bestMatch.url,
              folder: bestMatch.folder,
              inputId: rec.id,
              jenis: key,
            },
            key
          );
        } else {
          console.warn(
            `❌ No matching file found for ${key} in folder ${targetFolder}`
          );
          console.log(
            `📋 Available files in ${targetFolder}:`,
            folderFiles.map((f) => f.name)
          );
        }
      } else if (
        value &&
        (typeof value === "object" || typeof value === "string")
      ) {
        pushFile(value, key);
      }
    });
  }

  pushFile(rec.fotoSurveyList, "Foto Survey");
  pushFile(rec.fotoList, "Foto Survey");

  [
    "ktp",
    "kk",
    "bukuTabungan",
    "formPengajuan",
    "formKeteranganAW",
    "skKematian",
    "aktaKelahiran",
  ].forEach((k) => pushFile(rec[k], k));

  vv.files = files;

  const seen2 = new Set();
  vv.files = vv.files.filter((f) => {
    const k = canonicalKeyOf(f);
    if (!k) return true;
    if (seen2.has(k)) return false;
    seen2.add(k);
    return true;
  });

  const isImage = (nOrUrl = "") => /\.(png|jpe?g|gif|webp|bmp)$/i.test(nOrUrl);
  vv.allPhotos = files.filter(
    (f) =>
      isImage((f.name || "").toLowerCase()) ||
      isImage((f.url || "").toLowerCase()) ||
      isImage((f.fileName || "").toLowerCase()) ||
      f.type === "foto"
  );

  console.log("📸 [prepareForOutput] All photos found:", vv.allPhotos.length);
  vv.allPhotos.forEach((photo, idx) => {
    console.log(`   [${idx}]`, {
      name: photo.name,
      fileName: photo.fileName,
      url: photo.url,
      inputId: photo.inputId,
    });
  });

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

/* =========================
   COMPONENT DASHBOARD
   ========================= */
export default function VerifikatorDashboard() {
  const { user, hasRole, logout } = useAuth();
  if (!hasRole("admin-verifikator"))
    return <Navigate to="/unauthorized" replace />;

  const [isPreviewMax, setIsPreviewMax] = useState(false);
  const lastLoadedIdRef = useRef(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [activity, setActivity] = useState([]);

  const [selectedGroup, setSelectedGroup] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeItem = selectedGroup[activeIdx] || null;

  const [newItem, setNewItem] = useState({
    id: "",
    pemohon: "",
    tanggal: new Date().toISOString().slice(0, 10),
    status: "menunggu",
    pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
    stampPage: "",
  });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    id: "",
    pemohon: "",
    tanggal: "",
    status: "menunggu",
    pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
    stampPage: "",
  });

  const [detailHTML, setDetailHTML] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [blobUrls, setBlobUrls] = useState([]);

  useEffect(() => {
    return () => {
      try {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch {}
    };
  }, [blobUrls]);

  const [ttdUrl, setTtdUrl] = useState("");
  useEffect(() => {
    setTtdUrl(new URL("andi-ttd.jpeg", window.location.origin).href);
  }, []);

   const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      let resp = await supabase
        .from("dataform")
        .select(
          "id, local_id, korban, status, verified, verified_at, verify_note, verify_checklist, waktu, updated_at, files, counts"
        )
        .in("status", ["diproses", "selesai"])
        .order("updated_at", { ascending: false });

      if (resp.error) throw resp.error;

      const items = (resp.data || []).map(mapRowToQueueItem);
      setQueue(items);
    } catch (e) {
      console.error("fetchQueue error:", e);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);
  
    const handleRefreshAll = useCallback(async () => {
    try {
      setLoading(true);

      // stop loop reload detail
      lastLoadedIdRef.current = null;

      // bersihin preview & group
      setSelectedGroup([]);
      setActiveIdx(0);
      setDetailHTML("");
      setDetailLoading(false);

      // revoke blob lama
      try {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch {}
      setBlobUrls([]);

      // optional: bersihin input cache global kalau kepake
      try {
        clearPreviousInputState();
      } catch {}

      // reload queue dari supabase
      await fetchQueue();

      // optional: reset activity biar "fresh"
      // setActivity([]);

    } catch (e) {
      console.error("refresh error:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchQueue, blobUrls]);

  const loadReportHTML = useCallback(
    async (queueItem) => {
      if (!queueItem) return;
      setDetailLoading(true);
      setDetailHTML("");

      try {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch {}
      setBlobUrls((prev) => {
        try {
          prev.forEach((u) => URL.revokeObjectURL(u));
        } catch {}
        return [];
      });

      try {
        const qid = String(queueItem.id);

        let { data: base, error } = await supabase
          .from(queueItem.__table || "dataform")
          .select("*")
          .or(`local_id.eq.${qid},id.eq.${qid}`)
          .order("createdAt", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (!base) {
          setDetailHTML(
            `<div style="padding:16px;font-family:sans-serif">Data detail tidak ditemukan.</div>`
          );
          return;
        }

        const { variant, row } = await fetchDetailFromSupabase(base);
        const merged = row
          ? { ...base, ...normalizeDetailRow(variant, row) }
          : base;

        console.log("CHECK no berkas", {
          base_no_berkas: base.no_berkas,
          norm_noBerkas: normalizeDetailRow(variant, row).noBerkas,
          merged_noBerkas: merged.noBerkas,
        });

        const vv = await prepareForOutput(merged);
        vv.andiTtdUrl =
          ttdUrl ||
          new URL(
            (import.meta.env.BASE_URL || "/") + "andi-ttd.jpeg",
            window.location.origin
          ).href;
        vv.__verStatus =
          (merged?.counts &&
            merged.counts.verifikator &&
            merged.counts.verifikator.status) ||
          null;

        const template = (vv.template || "").toLowerCase();
        const sifat = (vv.sifatCidera || vv.jenisSurvei || "").toLowerCase();

        console.log("TEMPLATE PICKER:", {
          template,
          sifat,
          jenisSurvei: vv.jenisSurvei,
          jenisSurveyLabel: vv.jenisSurveyLabel,
        });

        const createdBlobUrls = [];
        const objURL = (maybeFile) => {
          if (maybeFile instanceof File) {
            const u = URL.createObjectURL(maybeFile);
            createdBlobUrls.push(u);
            return u;
          }
          return null;
        };

        let html;
        if (template.includes("kunjungan")) {
          html = buildPreviewHTML_RS(vv, objURL);
        } else if (
          sifat.includes("meninggal") ||
          template.includes("survei_md")
        ) {
          html = await buildPreviewHTML_MD(vv, objURL);
        } else {
          html = buildPreviewHTML_LL(vv, objURL);
        }

        setDetailHTML(html);
        setBlobUrls(createdBlobUrls);
      } catch (e) {
        console.error(e);
        setDetailHTML(
          `<div style="padding:16px;font-family:sans-serif;color:#a00">Gagal memuat detail.</div>`
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [ttdUrl, blobUrls]
  );

  function mapRowToQueueItem(row) {
    const ver = (row.counts && row.counts.verifikator) || {};
    const verStatus =
      ver.status || (row.status === "selesai" ? "disetujui" : "menunggu");

    const t =
      row.verified_at ||
      row.updated_at ||
      row.waktu ||
      row.createdAt ||
      new Date().toISOString();

    const files = row.files || {};
    const verFiles = files.verifikator || {};
    const pdfUrl =
      verFiles.pdfUrl ||
      files.pdfUrl ||
      files.hasilFormPdf ||
      "/Lembar_Kunjungan_RS_NAI.pdf";

    return {
      id: row.local_id || row.id,
      pemohon: row.korban || "-",
      tanggal: String(t).slice(0, 10),
      status: verStatus,
      pdfUrl,
      stampPage: ver.stampPage || "",
      stampedPdfUrl: ver.stampedPdfUrl,
      __rawCounts: row.counts || {},
      __table: "dataform",
    };
  }

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const ch = supabase
      .channel("verifikator_dataform")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dataform" },
        fetchQueue
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [fetchQueue]);

  useEffect(() => {
    const item = selectedGroup[activeIdx];
    if (!item) return;

    const idStr = String(item.id);
    if (lastLoadedIdRef.current === idStr) return; // stop loop

    lastLoadedIdRef.current = idStr;
    loadReportHTML(item);
  }, [activeIdx, selectedGroup, loadReportHTML]);

  const kpi = useMemo(() => {
    const by = (s) => queue.filter((q) => q.status === s).length;
    return {
      menunggu: by("menunggu"),
      disetujui: by("disetujui"),
      ditolak: by("ditolak"),
      revisi: by("revisi"),
      diperiksa: by("diperiksa"),
    };
  }, [queue]);

  const filtered = useMemo(() => {
    return queue
      .filter((i) =>
        [i.id, i.pemohon, i.status]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  }, [queue, query]);

  function mapDisplayStatus(internal) {
    switch (internal) {
      case "disetujui":
        return { label: "done", className: "badge badge-done" };
      case "diperiksa":
      case "revisi":
        return { label: "progress", className: "badge badge-progress" };
      case "ditolak":
      case "menunggu":
      default:
        return { label: "pending", className: "badge badge-pending" };
    }
  }

  function makeBarcodeDataURL(text) {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 40,
      width: 2,
    });
    return canvas.toDataURL("image/png");
  }

  async function updateVerifikatorStatusToSupabase(item, nextStatus, patch = {}) {
  const nowIso = new Date().toISOString();
  const currentCounts = item.__rawCounts || {};

  const nextCounts = {
    ...currentCounts,
    verifikator: {
      ...(currentCounts.verifikator || {}),
      status: nextStatus,
      ...patch,
    },
  };

  // ✅ status utama biar konsisten untuk halaman Status Proses
  let nextMainStatus = "diproses";
  if (nextStatus === "disetujui") nextMainStatus = "selesai";
  else if (nextStatus === "ditolak") nextMainStatus = "ditolak";
  else if (nextStatus === "revisi") nextMainStatus = "revisi";
  else if (nextStatus === "diperiksa") nextMainStatus = "diproses";

  // ✅ opsional tapi penting: copy info penting ke kolom top-level juga
  const topLevelPatch = {};
  if (nextStatus === "disetujui") {
    topLevelPatch.verified = true;
    topLevelPatch.verified_at = patch.stampedAt || nowIso;
    topLevelPatch.verify_note = patch.verifyNote || null;
    topLevelPatch.verify_checklist = patch.verifyChecklist || null;
  }
  if (nextStatus === "ditolak") {
    topLevelPatch.rejected_at = patch.rejectedAt || nowIso;
    topLevelPatch.reject_note = patch.rejectNote || null;
  }

  const { error } = await supabase
    .from(item.__table || "dataform")
    .update({
      status: nextMainStatus,
      counts: nextCounts,
      updated_at: nowIso,
      ...topLevelPatch,
    })
    .eq("local_id", item.id);

  if (error) throw error;
}


  async function stampBarcodeOnPdf(pdfUrl, text, opts = {}) {
    const {
      page: targetPage = "last",
      position = "bottom-right",
      marginX = 36,
      marginY = 72,
    } = opts;

    const pngDataUrl = makeBarcodeDataURL(text);
    const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
    const pdfBytes = await (await fetch(pdfUrl)).arrayBuffer();

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const pages = pdfDoc.getPages();
    let pageIndex;
    if (typeof targetPage === "number" && !Number.isNaN(targetPage)) {
      pageIndex = Math.max(0, Math.min(pages.length - 1, targetPage));
    } else if (targetPage === "first") {
      pageIndex = 0;
    } else {
      pageIndex = pages.length - 1;
    }
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    const barcodeWidth = 220;
    const barcodeHeight = (pngImage.height / pngImage.width) * barcodeWidth;

    let x, y;
    switch (position) {
      case "top-left":
        x = marginX;
        y = height - marginY - barcodeHeight;
        break;
      case "top-right":
        x = width - marginX - barcodeWidth;
        y = height - marginY - barcodeHeight;
        break;
      case "bottom-left":
        x = marginX;
        y = marginY;
        break;
      case "bottom-right":
      default:
        x = width - marginX - barcodeWidth;
        y = marginY;
        break;
    }

    page.drawText(text, {
      x,
      y: y + barcodeHeight + 6,
      size: 8,
      color: rgb(0, 0, 0),
    });
    page.drawImage(pngImage, {
      x,
      y,
      width: barcodeWidth,
      height: barcodeHeight,
    });

    const newPdf = await pdfDoc.save();
    const blob = new Blob([newPdf], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }

  const [approvingOne, setApprovingOne] = useState(false);
  async function handleApproveOne() {
    if (!activeItem) return;
    try {
      setApprovingOne(true);
      const barcodeText = `${activeItem.id} | disetujui | ${new Date()
        .toISOString()
        .slice(0, 19)} | ${user?.name}`;

      const pageIdx = Number(activeItem.stampPage);
      const stampedUrl = await stampBarcodeOnPdf(
        activeItem.pdfUrl,
        barcodeText,
        {
          page: Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last",
        }
      );

      await updateVerifikatorStatusToSupabase(activeItem, "disetujui", {
        stampedPdfUrl: stampedUrl,
        stampedAt: new Date().toISOString(),
        stampedBy: user?.name || user?.id || "verifikator",
        stampPage: activeItem.stampPage || null,
      });

      setQueue((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl }
            : i
        )
      );
      setSelectedGroup((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl }
            : i
        )
      );

      setActivity((a) => [
        {
          id: "A-" + Math.random().toString(36).slice(2, 7),
          teks: `Menyetujui ${activeItem.id} (${activeItem.pemohon})`,
          waktu: new Date().toLocaleString(),
        },
        ...a,
      ]);

      await loadReportHTML({ ...activeItem, status: "disetujui" });
    } catch (e) {
      console.error(e);
      alert("Gagal menyetujui / menempel barcode.");
    } finally {
      setApprovingOne(false);
    }
  }

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

    async function handleRejectSubmit() {
    if (!activeItem) return;
    const note = rejectNote.trim();
    if (!note) {
      alert("Catatan penolakan wajib diisi.");
      return;
    }

    try {
      setRejecting(true);

      await updateVerifikatorStatusToSupabase(activeItem, "ditolak", {
        rejectedAt: new Date().toISOString(),
        rejectedBy: user?.name || user?.id || "verifikator",
        rejectNote: note,          // <-- ini masuk ke counts.verifikator
      });

      // update list state
      setQueue((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? { ...i, status: "ditolak", rejectNote: note }
            : i
        )
      );
      setSelectedGroup((prev) =>
        prev.map((i) =>
          i.id === activeItem.id
            ? { ...i, status: "ditolak", rejectNote: note }
            : i
        )
      );

      setActivity((a) => [
        {
          id: "A-" + Math.random().toString(36).slice(2, 7),
          teks: `Menolak ${activeItem.id} (${activeItem.pemohon}) — ${note}`,
          waktu: new Date().toLocaleString(),
        },
        ...a,
      ]);

      setRejectOpen(false);
      setRejectNote("");
      await loadReportHTML({ ...activeItem, status: "ditolak" });
    } catch (e) {
      console.error(e);
      alert("Gagal menolak berkas.");
    } finally {
      setRejecting(false);
    }
  }


  async function handleNeedRevision() {
    if (!activeItem) return;
    try {
      await updateVerifikatorStatusToSupabase(activeItem, "revisi", {
        revisionAt: new Date().toISOString(),
        revisionBy: user?.name || user?.id || "verifikator",
      });

      setQueue((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "revisi" } : i
        )
      );
      setSelectedGroup((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "revisi" } : i
        )
      );

      setActivity((a) => [
        {
          id: "A-" + Math.random().toString(36).slice(2, 7),
          teks: `Minta revisi ${activeItem.id} (${activeItem.pemohon})`,
          waktu: new Date().toLocaleString(),
        },
        ...a,
      ]);
    } catch (e) {
      console.error(e);
      alert("Gagal mengubah status ke revisi.");
    }
  }

  async function handleMarkInReview() {
    if (!activeItem) return;
    try {
      await updateVerifikatorStatusToSupabase(activeItem, "diperiksa", {
        inReviewAt: new Date().toISOString(),
        inReviewBy: user?.name || user?.id || "verifikator",
      });

      setQueue((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "diperiksa" } : i
        )
      );
      setSelectedGroup((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "diperiksa" } : i
        )
      );

      setActivity((a) => [
        {
          id: "A-" + Math.random().toString(36).slice(2, 7),
          teks: `Menandai diperiksa ${activeItem.id} (${activeItem.pemohon})`,
          waktu: new Date().toLocaleString(),
        },
        ...a,
      ]);
    } catch (e) {
      console.error(e);
      alert("Gagal menandai sebagai diperiksa.");
    }
  }

  const [approvingAll, setApprovingAll] = useState(false);
  async function handleApproveAll() {
    if (!selectedGroup.length) return;
    try {
      setApprovingAll(true);
      const updated = [];

      for (const item of selectedGroup) {
        if (item.status !== "disetujui") {
          const text = `${item.id} | disetujui | ${new Date()
            .toISOString()
            .slice(0, 19)} | ${user?.name}`;
          const pageIdx = Number(item.stampPage);
          const url = await stampBarcodeOnPdf(item.pdfUrl, text, {
            page:
              Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last",
          });

          await updateVerifikatorStatusToSupabase(item, "disetujui", {
            stampedPdfUrl: url,
            stampedAt: new Date().toISOString(),
            stampedBy: user?.name || user?.id || "verifikator",
            stampPage: item.stampPage || null,
          });

          updated.push({ ...item, status: "disetujui", stampedPdfUrl: url });
          setActivity((a) => [
            {
              id: "A-" + Math.random().toString(36).slice(2, 7),
              teks: `Menyetujui ${item.id} (${item.pemohon})`,
              waktu: new Date().toLocaleString(),
            },
            ...a,
          ]);
        } else {
          updated.push(item);
        }
      }

      setQueue((prev) =>
        prev.map((q) => updated.find((u) => u.id === q.id) || q)
      );
      setSelectedGroup(updated);
    } catch (e) {
      console.error(e);
      alert("Gagal mass approve.");
    } finally {
      setApprovingAll(false);
    }
  }

  function openGroupFor(row) {
    const group = queue
      .filter((i) => i.pemohon === row.pemohon)
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
      .slice(0, 10);

    setSelectedGroup(group);
    const idx = group.findIndex((g) => g.id === row.id);
    setActiveIdx(idx >= 0 ? idx : 0);
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newItem.id || !newItem.pemohon) {
      alert("ID & Pemohon wajib diisi");
      return;
    }
    if (queue.some((q) => q.id === newItem.id)) {
      alert("ID sudah ada.");
      return;
    }
    if (newItem.stampPage && Number(newItem.stampPage) < 1) {
      alert("Halaman stempel minimal 1 atau kosongkan.");
      return;
    }
    const item = { ...newItem };
    setQueue((prev) => [item, ...prev]);
    setActivity((a) => [
      {
        id: "A-" + Math.random().toString(36).slice(2, 7),
        teks: `Tambah berkas ${item.id} (${item.pemohon})`,
        waktu: new Date().toLocaleString(),
      },
      ...a,
    ]);
    setNewItem({
      id: "",
      pemohon: "",
      tanggal: new Date().toISOString().slice(0, 10),
      status: "menunggu",
      pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
      stampPage: "",
    });
  }

  function startEdit(row) {
    setEditId(row.id);
    setEditForm({ ...row });
  }
  function cancelEdit() {
    setEditId(null);
  }
  function saveEdit() {
    if (!editForm.id || !editForm.pemohon) {
      alert("ID & Pemohon wajib diisi");
      return;
    }
    setQueue((prev) =>
      prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i))
    );
    setSelectedGroup((prev) =>
      prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i))
    );
    const newIdx = selectedGroup.findIndex((i) => i.id === editId);
    if (newIdx >= 0) setActiveIdx(newIdx);

    setActivity((a) => [
      {
        id: "A-" + Math.random().toString(36).slice(2, 7),
        teks: `Ubah berkas ${editId}`,
        waktu: new Date().toLocaleString(),
      },
      ...a,
    ]);
    setEditId(null);
  }

  function deleteItem(id) {
    if (!confirm(`Hapus berkas ${id}?`)) return;
    setQueue((prev) => prev.filter((i) => i.id !== id));
    setSelectedGroup((prev) => prev.filter((i) => i.id !== id));
    setActivity((a) => [
      {
        id: "A-" + Math.random().toString(36).slice(2, 7),
        teks: `Hapus berkas ${id}`,
        waktu: new Date().toLocaleString(),
      },
      ...a,
    ]);
  }

  return (
    <div className="vd-page">
      {/* ===== Top Bar ===== */}
      <header className="vd-topbar">
        <div className="vd-title">
          <h1>Dashboard Verifikator</h1>
          <p>Ringkasan & persetujuan berkas “data form”.</p>
        </div>

        <div className="vd-user">
          <div className="vd-userchip">
            <div className="vd-avatar">
              {(user?.name || "V").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="vd-username">{user?.name}</div>
              <div className="vd-role">{user?.role}</div>
            </div>
          </div>
          <button
            className="vd-btn vd-btn-refresh"
            onClick={handleRefreshAll}
            disabled={loading}
            title="Reload semua data & preview"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="vd-btn vd-btn-ghost" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>

      {/* ===== KPI ===== */}
      <section className="vd-kpi">
        <div className="vd-kpi-card vd-kpi-pending">
          <div className="vd-kpi-label">Menunggu</div>
          <div className="vd-kpi-value">{kpi.menunggu}</div>
          <div className="vd-kpi-sub">Pending</div>
        </div>

        <div className="vd-kpi-card vd-kpi-progress">
          <div className="vd-kpi-label">Dalam Proses</div>
          <div className="vd-kpi-value">{kpi.diperiksa + kpi.revisi}</div>
          <div className="vd-kpi-sub">Diperiksa / Revisi</div>
        </div>

        <div className="vd-kpi-card vd-kpi-reject">
          <div className="vd-kpi-label">Ditolak</div>
          <div className="vd-kpi-value">{kpi.ditolak}</div>
          <div className="vd-kpi-sub">Pending</div>
        </div>

        <div className="vd-kpi-card vd-kpi-done">
          <div className="vd-kpi-label">Disetujui</div>
          <div className="vd-kpi-value">{kpi.disetujui}</div>
          <div className="vd-kpi-sub">Done</div>
        </div>
      </section>

      {/* ===== Toolbar + Create Form ===== */}
      <section className="vd-toolbar">
        <div className="vd-searchbox">
          <input
            className="vd-input"
            placeholder="Cari ID / pemohon / status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      {/* ===== Main Grid ===== */}
      <section className="vd-main">
        {/* LEFT: List */}
        <div className="vd-card vd-list">
          <div className="vd-cardhead">
            <h3>Daftar Berkas</h3>
            <div className="vd-muted">Total: {filtered.length}</div>
          </div>

          <div className="vd-tablewrap">
            <table className="vd-table">
              <thead>
                <tr>
                  {/* <th>ID</th> */}
                  <th>Pemohon</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                  <th style={{ width: 220 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const disp = mapDisplayStatus(row.status);
                  const isEditing = editId === row.id;
                  const isSelected = activeItem?.id === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`${isSelected ? "vd-row-selected" : ""}`}
                    >
                      {!isEditing && (
                        <>
                          {/* <td className="vd-id">{row.id}</td> */}
                          <td>{row.pemohon}</td>
                          <td>
                            <span className={`vd-badge ${disp.className}`}>
                              {disp.label}
                            </span>
                            <span className="vd-substatus">({row.status})</span>
                          </td>
                          <td>{row.tanggal}</td>
                          <td className="vd-actions">
                            <button
                              className="vd-btn vd-btn-xs"
                              onClick={() => openGroupFor(row)}
                            >
                              Lihat
                            </button>
                            {/* <button
                              className="vd-btn vd-btn-xs vd-btn-ghost"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button> */}
                            {/* <button
                              className="vd-btn vd-btn-xs vd-btn-danger"
                              onClick={() => deleteItem(row.id)}
                            >
                              Hapus
                            </button> */}
                          </td>
                        </>
                      )}

                      {isEditing && (
                        <>
                          <td>
                            <input
                              className="vd-input vd-input-sm"
                              value={editForm.id}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  id: e.target.value.trim(),
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="vd-input vd-input-sm"
                              value={editForm.pemohon}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  pemohon: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <select
                              className="vd-input vd-input-sm"
                              value={editForm.status}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  status: e.target.value,
                                }))
                              }
                            >
                              <option value="menunggu">menunggu</option>
                              <option value="diperiksa">diperiksa</option>
                              <option value="revisi">revisi</option>
                              <option value="ditolak">ditolak</option>
                              <option value="disetujui">disetujui</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="vd-input vd-input-sm"
                              type="date"
                              value={editForm.tanggal}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  tanggal: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="vd-actions">
                            <input
                              className="vd-input vd-input-md"
                              placeholder="/path.pdf"
                              value={editForm.pdfUrl}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  pdfUrl: e.target.value,
                                }))
                              }
                            />
                            <input
                              className="vd-input vd-input-sm"
                              type="number"
                              min={1}
                              placeholder="Hal. stempel"
                              value={editForm.stampPage}
                              onChange={(e) =>
                                setEditForm((s) => ({
                                  ...s,
                                  stampPage: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="vd-btn vd-btn-xs vd-btn-primary"
                              onClick={saveEdit}
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              className="vd-btn vd-btn-xs vd-btn-ghost"
                              onClick={cancelEdit}
                            >
                              Batal
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="vd-empty">
                      Tidak ada data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Detail / Preview */}
        <div
          className={`vd-card vd-detail ${isPreviewMax ? "vd-detail-max" : ""}`}
        >
          <div className="vd-cardhead">
            <h3>Detail Berkas</h3>
            {/* {!!selectedGroup.length && (
              <div className="vd-muted">
                {activeIdx + 1}/{selectedGroup.length}
              </div>
            )} */}
          </div>

          {!selectedGroup.length ? (
            <div className="vd-emptybig">
              Pilih baris di kiri untuk memuat <b>berkas</b> milik
              pemohon.
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="vd-tabs">
                {selectedGroup.map((it, idx) => (
                  <button
                    key={it.id}
                    onClick={() => setActiveIdx(idx)}
                    className={`vd-tab ${idx === activeIdx ? "active" : ""}`}
                    title={`${it.id} • ${it.tanggal} • ${it.status}`}
                  >
                    {it.id}
                  </button>
                ))}
              </div>

              {/* Quick meta */}
              <div className="vd-meta">
                {/* <div>
                  <div className="vd-meta-label">ID</div>
                  <div className="vd-meta-val">{activeItem?.id}</div>
                </div> */}
                <div>
                  <div className="vd-meta-label">Pemohon</div>
                  <div className="vd-meta-val">{activeItem?.pemohon}</div>
                </div>
                <div>
                  <div className="vd-meta-label">Status</div>
                  <div className="vd-meta-val">
                    <span
                      className={`vd-badge ${
                        mapDisplayStatus(activeItem.status).className
                      }`}
                    >
                      {mapDisplayStatus(activeItem.status).label}
                    </span>
                    <span className="vd-substatus">({activeItem.status})</span>
                  </div>
                </div>
                <div>
                  <div className="vd-meta-label">Tanggal</div>
                  <div className="vd-meta-val">{activeItem?.tanggal}</div>
                </div>
              </div>

              {/* Preview frame */}
              <div
                className={`vd-preview ${isPreviewMax ? "vd-preview-max" : ""}`}
              >
                <div className="vd-preview-toolbar">
                  <button
                    className="vd-btn vd-btn-xs"
                    onClick={() => setIsPreviewMax((v) => !v)}
                  >
                    {isPreviewMax ? "Kecilkan" : "Perbesar"}
                  </button>
                </div>

                {detailLoading ? (
                  <div className="vd-preview-loading">
                    <div className="vd-spinner" />
                    Memuat laporan…
                  </div>
                ) : detailHTML ? (
                  <iframe
                    title="Laporan"
                    srcDoc={detailHTML}
                    sandbox="allow-same-origin allow-forms allow-scripts"
                    className="vd-iframe"
                  />
                ) : (
                  <div className="vd-preview-loading">Tidak ada konten.</div>
                )}
              </div>

              {/* Actions */}
              <div className="vd-actionbar">
                <button
                  className="vd-btn vd-btn-primary"
                  onClick={handleApproveOne}
                  disabled={
                    !activeItem ||
                    approvingOne ||
                    activeItem?.status === "disetujui"
                  }
                >
                  {approvingOne ? "Memproses..." : "Setujui"}
                </button>

                <button
                  className="vd-btn vd-btn-danger"
                  onClick={() => {
                    if (!activeItem) return;
                    setRejectNote("");
                    setRejectOpen(true);
                  }}
                  disabled={!activeItem}
                >
                  Tolak
                </button>

                {/* <button
                  className="vd-btn"
                  onClick={handleNeedRevision}
                  disabled={!activeItem}
                >
                  Minta Revisi
                </button> */}

                {/* <button
                  className="vd-btn"
                  onClick={handleMarkInReview}
                  disabled={!activeItem}
                >
                  Tandai Diperiksa
                </button> */}

                {/* <button
                  className="vd-btn vd-btn-primary"
                  onClick={handleApproveAll}
                  disabled={!selectedGroup.length || approvingAll}
                >
                  {approvingAll
                    ? "Memproses..."
                    : `Setujui Semua (${selectedGroup.length})`}
                </button> */}

                {/* {!!activeItem?.stampedPdfUrl && (
                  <a
                    href={activeItem.stampedPdfUrl}
                    download={`${activeItem.id}-stamped.pdf`}
                    className="vd-download"
                  >
                    Unduh PDF Bertanda
                  </a>
                )} */}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ===== Activity ===== */}
      <section className="vd-card vd-activity">
        <div className="vd-cardhead">
          <h3>Aktivitas Terakhir</h3>
          <div className="vd-muted">{activity.length} item</div>
        </div>

        <ul className="vd-activity-list">
          {activity.map((a) => (
            <li key={a.id}>
              <div className="vd-activity-text">{a.teks}</div>
              <div className="vd-activity-time">{a.waktu}</div>
            </li>
          ))}
          {!activity.length && (
            <li className="vd-empty">Belum ada aktivitas</li>
          )}
        </ul>
      </section>

      {/* ===== Reject Modal ===== */}
      {rejectOpen && (
        <div className="vd-modal-backdrop" onClick={() => !rejecting && setRejectOpen(false)}>
          <div className="vd-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="vd-modal-title">Tolak Berkas</h3>

            <div className="vd-modal-meta">
              <div><b>ID:</b> {activeItem?.id}</div>
              <div><b>Pemohon:</b> {activeItem?.pemohon}</div>
            </div>

            <label className="vd-modal-label">
              Catatan Penolakan <span style={{color:"#a01339"}}>*wajib</span>
            </label>
            <textarea
              className="vd-input vd-modal-textarea"
              rows={4}
              placeholder="Tulis alasan penolakan..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              autoFocus
            />

            <div className="vd-modal-actions">
              <button
                className="vd-btn vd-btn-ghost"
                onClick={() => setRejectOpen(false)}
                disabled={rejecting}
              >
                Batal
              </button>

              <button
                className="vd-btn vd-btn-danger"
                onClick={handleRejectSubmit}
                disabled={rejecting || !rejectNote.trim()}
                title={!rejectNote.trim() ? "Catatan wajib diisi" : "Kirim penolakan"}
              >
                {rejecting ? "Mengirim..." : "Kirim Penolakan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== STYLE (NEW UI) ===== */}
      <style>{`
  :root{
    --bg: #fff7fb;
    --bg2:#ffe8f3;
    --card: rgba(255,255,255,0.9);
    --card-strong: rgba(255,255,255,0.98);
    --line: rgba(255, 140, 190, 0.28);
    --text: #3b0a2a;
    --muted: rgba(59,10,42,0.6);
    --accent: #ff7ac8;
    --accent2: #ffb3de;
    --good: #19b97a;
    --warn: #f2a93b;
    --bad: #ff5a7a;
  }

  .vd-page{
    min-height:100vh;
    background:
      radial-gradient(1100px 600px at -10% -20%, #ffd6ea 0%, transparent 60%),
      radial-gradient(900px 520px at 110% -10%, #ffe3f3 0%, transparent 55%),
      radial-gradient(700px 500px at 50% 110%, #fff0f8 0%, transparent 60%),
      linear-gradient(180deg, var(--bg), var(--bg2));
    color: var(--text);
    padding: 18px;
    display:flex;
    flex-direction:column;
    gap:14px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }

  /* top bar */
  .vd-topbar{
    display:flex;
    gap:12px;
    align-items:center;
    justify-content:space-between;
    background: linear-gradient(135deg, #fff, #fff5fb);
    border:1px solid var(--line);
    border-radius:16px;
    padding:14px 16px;
    box-shadow: 0 8px 26px rgba(255, 122, 200, 0.12);
  }
  .vd-title h1{
    margin:0;
    font-size:20px;
    font-weight:900;
    letter-spacing:.3px;
    color:#4b0f36;
  }
  .vd-title p{
    margin:4px 0 0;
    color:var(--muted);
    font-size:13px;
  }
  .vd-user{
    display:flex;
    gap:10px;
    align-items:center;
  }
  .vd-userchip{
    display:flex;
    gap:8px;
    align-items:center;
    padding:6px 8px;
    border:1px solid var(--line);
    background: var(--card);
    border-radius:999px;
  }
  .vd-avatar{
    width:30px;height:30px;border-radius:50%;
    display:grid;place-items:center;
    font-weight:900;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color:white;
    box-shadow: 0 6px 14px rgba(255, 122, 200, 0.35);
  }
  .vd-username{ font-weight:800; font-size:13px; line-height:1.1; }
  .vd-role{ font-size:11px; color:var(--muted); }

  /* KPI */
  .vd-kpi{
    display:grid;
    grid-template-columns: repeat(4,1fr);
    gap:12px;
  }
  .vd-kpi-card{
    position:relative;
    padding:14px 14px 12px;
    border-radius:16px;
    border:1px solid var(--line);
    background: var(--card);
    box-shadow: 0 6px 18px rgba(255, 122, 200, 0.10);
    overflow:hidden;
  }
  .vd-kpi-card::after{
    content:"";
    position:absolute; inset:-50% -30% auto auto;
    width:180px;height:180px;border-radius:50%;
    filter: blur(45px);
    opacity:.8;
  }
  .vd-kpi-pending::after{ background:#ffd1e8; }
  .vd-kpi-progress::after{ background:#ffe7b5; }
  .vd-kpi-reject::after{ background:#ffc1c9; }
  .vd-kpi-done::after{ background:#c9f6e2; }

  .vd-kpi-label{ font-size:12px; font-weight:800; color:#651544; }
  .vd-kpi-value{ font-size:26px; font-weight:900; margin-top:4px; }
  .vd-kpi-sub{ font-size:11px; color:var(--muted); margin-top:2px; }

  /* toolbar */
  .vd-toolbar{
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    align-items:center;
    background: var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    padding:10px;
    box-shadow: 0 4px 14px rgba(255, 122, 200, 0.08);
  }
  .vd-searchbox{
    display:flex;
    gap:8px;
    align-items:center;
    flex:1 1 280px;
  }
  .vd-create{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    align-items:center;
    justify-content:flex-end;
    flex:2 1 520px;
  }

  /* inputs */
  .vd-input{
    background: #ffffff;
    border:1px solid var(--line);
    color: var(--text);
    padding:8px 10px;
    border-radius:10px;
    outline:none;
    font-size:13px;
    transition:.15s ease;
    min-width: 0;
    box-shadow: inset 0 0 0 1px rgba(255, 170, 215, 0.12);
  }
  .vd-input:focus{
    border-color: rgba(255, 122, 200, 0.9);
    box-shadow: 0 0 0 3px rgba(255, 122, 200, 0.18);
    background: #fff;
  }
  .vd-input-sm{ width:120px; }
  .vd-input-md{ width:180px; }

  /* buttons */
  .vd-btn{
    background: #fff;
    border:1px solid var(--line);
    color: #5a113f;
    padding:8px 12px;
    border-radius:10px;
    font-size:13px;
    font-weight:800;
    cursor:pointer;
    transition:.15s ease;
    white-space:nowrap;
    box-shadow: 0 4px 10px rgba(255, 122, 200, 0.10);
  }
  .vd-btn:hover{
    transform: translateY(-1px);
    background: #fff0f9;
  }
  .vd-btn:disabled{ opacity:.55; cursor:not-allowed; transform:none; }

  .vd-btn-xs{ padding:6px 8px; font-size:12px; border-radius:8px; }
  .vd-btn-primary{
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border: none;
    color: white;
    box-shadow: 0 8px 20px rgba(255, 122, 200, 0.40);
  }
  .vd-btn-primary:hover{ filter:brightness(1.05); }
  .vd-btn-danger{
    background: #fff;
    border-color: rgba(255, 90, 122, 0.8);
    color: #a01339;
  }
  .vd-btn-danger:hover{ background:#ffe9ee; }
  .vd-btn-ghost{
    background: transparent;
    border-color: var(--line);
    box-shadow:none;
  }

  /* main */
  .vd-main{
    display:grid;
    grid-template-columns: 0.8fr 2.2fr;  /* kiri lebih kecil, kanan lebih lebar */
    gap:12px;
    align-items:start;
  }

  .vd-card{
    background: var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow: 0 8px 22px rgba(255, 122, 200, 0.10);
  }
  .vd-cardhead{
    display:flex; align-items:center; justify-content:space-between;
    padding:4px 4px 10px;
    border-bottom:1px dashed rgba(255, 122, 200, 0.35);
    margin-bottom:8px;
  }
  .vd-cardhead h3{
    margin:0; font-size:15px; font-weight:900;
  }
  .vd-muted{ font-size:12px; color: var(--muted); }

  /* list table */
  .vd-tablewrap{
    overflow:auto; max-height:70vh; border-radius:12px;
  }
  .vd-table{
    width:100%;
    border-collapse:separate;
    border-spacing:0 6px;
    font-size:13px;
    min-width:720px;
  }
  .vd-table thead th{
    text-align:left;
    font-weight:900;
    font-size:12px;
    color:#6b1a4a;
    padding:8px 10px;
  }
  .vd-table tbody tr{
    background: var(--card-strong);
    border:1px solid var(--line);
    transition:.12s ease;
  }
  .vd-table tbody tr:hover{
    transform: translateY(-1px);
    background: #fff0f9;
  }
  .vd-table td{
    padding:10px;
    border-top:1px solid transparent;
    border-bottom:1px solid transparent;
  }
  .vd-row-selected{
    outline:2px solid rgba(255, 122, 200, 0.9);
    background: rgba(255, 205, 230, 0.65) !important;
  }
  .vd-id{ font-weight:900; letter-spacing:.2px; }
  .vd-actions{ display:flex; gap:6px; flex-wrap:wrap; }

  /* badges (reuse your mapping class) */
  .vd-badge{
    padding:4px 10px; border-radius:999px; font-size:11px; font-weight:900;
    display:inline-block;
  }
  .badge-pending{ color:#8a1f4f; background:#ffd7ea; border:1px solid #ffb0d4; }
  .badge-progress{ color:#7a5200; background:#ffe9b8; border:1px solid #ffd989; }
  .badge-done{ color:#0a6a44; background:#ccf6e6; border:1px solid #9aeccc; }
  .vd-substatus{ margin-left:8px; color:var(--muted); font-size:11px; }

  .vd-empty, .vd-emptybig{
    color:var(--muted); font-size:13px; text-align:center; padding:18px;
  }
  .vd-emptybig{ padding:30px 16px; }

  /* detail */
  .vd-tabs{
    display:flex; gap:6px; flex-wrap:wrap;
    padding:6px;
    background: #fff;
    border:1px solid var(--line);
    border-radius:12px;
    margin-bottom:8px;
    position:sticky; top:0; z-index:2;
  }
  .vd-tab{
    background: #fff;
    border:1px solid var(--line);
    color:#5a113f;
    padding:6px 10px;
    border-radius:10px;
    font-size:12px;
    font-weight:900;
    cursor:pointer;
    opacity:.85;
    transition:.12s ease;
  }
  .vd-tab.active{
    opacity:1;
    border-color: rgba(255, 122, 200, 0.9);
    background: #ffe8f3;
    box-shadow: inset 0 0 0 1px rgba(255, 122, 200, 0.25);
  }

  .vd-meta{
    display:grid;
    grid-template-columns: repeat(4,1fr);
    gap:8px;
    margin-bottom:8px;
  }
  .vd-meta > div{
    background: #fff;
    border:1px solid var(--line);
    border-radius:12px;
    padding:8px 10px;
  }
  .vd-meta-label{ font-size:11px; color:var(--muted); font-weight:800; }
  .vd-meta-val{ font-size:13px; font-weight:900; margin-top:2px; }

  /* PREVIEW BIG + STICKY */
  .vd-preview{
    height:72vh;
    min-height:420px;
    border-radius:14px;
    overflow:hidden;
    border:1px solid var(--line);
    background:#fff;
    position:sticky;
    top:72px;
  }
  .vd-iframe{
    width:100%;
    height:100%;
    border:0;
    background:white;
  }
  .vd-preview-loading{
    height:100%;
    display:grid;
    place-items:center;
    gap:10px;
    color:var(--muted);
    font-size:13px;
  }
  .vd-spinner{
    width:22px;height:22px;border-radius:50%;
    border:3px solid rgba(255, 122, 200, 0.25);
    border-top-color: rgba(255, 122, 200, 0.9);
    animation: spin .8s linear infinite;
  }
  @keyframes spin{ to{ transform:rotate(360deg);} }

  .vd-actionbar{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    margin-top:10px;
    padding-top:8px;
    border-top:1px dashed rgba(255, 122, 200, 0.35);
  }
  .vd-download{
    margin-left:auto;
    text-decoration:none;
    padding:8px 12px;
    border-radius:10px;
    background: #fff;
    border:1px solid var(--line);
    font-weight:900;
    color:#5a113f;
    box-shadow: 0 4px 10px rgba(255, 122, 200, 0.10);
  }
  .vd-download:hover{ background: #fff0f9; }

  /* activity */
  .vd-activity{ margin-top:0; }
  .vd-activity-list{
    list-style:none; padding:0; margin:0;
    display:flex; flex-direction:column; gap:8px;
  }
  .vd-activity-list li{
    background: #fff;
    border:1px solid var(--line);
    border-radius:12px;
    padding:8px 10px;
  }
  .vd-activity-text{ font-size:13px; font-weight:800; }
  .vd-activity-time{ font-size:11px; color:var(--muted); margin-top:2px; }

  /* responsive */
  @media (max-width: 1100px){
    .vd-kpi{ grid-template-columns: repeat(2,1fr); }
    .vd-main{ grid-template-columns:1fr; }
    .vd-table{ min-width:680px; }
    .vd-preview{ position:relative; top:auto; height:60vh; }
    .vd-meta{ grid-template-columns: repeat(2,1fr); }
  }
  @media (max-width: 640px){
    .vd-page{ padding:12px; }
    .vd-topbar{ flex-direction:column; align-items:flex-start; }
    .vd-user{ width:100%; justify-content:space-between; }
    .vd-kpi{ grid-template-columns:1fr; }
    .vd-searchbox{ flex-direction:column; align-items:stretch; }
    .vd-create{ justify-content:flex-start; }
    .vd-input-sm, .vd-input-md{ width:100%; }
    .vd-table{ min-width:560px; font-size:12px; }
    .vd-preview{ height:65vh; min-height:360px; }
    .vd-actionbar .vd-btn{ flex:1 1 auto; }
    .vd-download{ width:100%; text-align:center; margin-left:0; }
  }
  .vd-preview-toolbar{
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 5;
  }

  /* mode fullscreen */
  .vd-preview-max{
    position: fixed !important;
    inset: 10px;                 /* jarak tipis dari pinggir */
    height: auto !important;
    width: auto !important;
    z-index: 9999;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  }
  .vd-preview-max .vd-iframe{
    height: 100%;
  }
  /* biar detail jadi stacking context yang rapi */
  .vd-detail{
    position: relative;
  }

  /* preview jangan ketiban elemen lain */
  .vd-preview{
    position: sticky;   /* kamu udah pakai sticky, keep */
    top: 72px;
    z-index: 1;         /* layer preview */
    margin-bottom: 14px;/* jarak aman sebelum actionbar */
  }

  /* actionbar pasti di bawah, ga numpang */
  .vd-actionbar{
    position: relative;
    z-index: 2;               /* layer di atas card, tapi tetap di bawah preview karena layout */
    background: var(--card-strong);
    padding: 8px;
    border-radius: 12px;
    margin-top: 6px;
  }

  /* kalau fullscreen preview, actionbar jangan ikut niban */
  .vd-preview-max ~ .vd-actionbar{
    display: none;
  }
  /* saat preview fullscreen, sembunyiin UI detail lain */
  .vd-detail-max .vd-cardhead,
  .vd-detail-max .vd-tabs,
  .vd-detail-max .vd-meta{
    display: none !important;
  }

  /* optional: biar yang di belakang nggak bisa diklik */
  .vd-detail-max{
    pointer-events: none;
  }
  .vd-detail-max .vd-preview{
    pointer-events: auto;
  }
    .vd-btn-refresh{
    background:#fff;
    border:1px dashed rgba(255, 122, 200, 0.9);
  }
  .vd-btn-refresh:hover{
    background:#fff0f9;
  }
    /* ===== MODAL REJECT ===== */
  .vd-modal-backdrop{
    position:fixed;
    inset:0;
    background:rgba(30,0,18,0.35);
    display:grid;
    place-items:center;
    z-index:10000;
    padding:18px;
    backdrop-filter: blur(2px);
  }
  .vd-modal{
    width:min(520px, 100%);
    background: var(--card-strong);
    border:1px solid var(--line);
    border-radius:16px;
    padding:14px;
    box-shadow:0 18px 50px rgba(0,0,0,0.22);
  }
  .vd-modal-title{
    margin:0 0 8px;
    font-size:16px;
    font-weight:900;
    color:#4b0f36;
  }
  .vd-modal-meta{
    font-size:12px;
    color:var(--muted);
    display:flex;
    gap:14px;
    flex-wrap:wrap;
    margin-bottom:10px;
  }
  .vd-modal-label{
    font-size:12px;
    font-weight:800;
    margin-bottom:6px;
    display:block;
    color:#651544;
  }
  .vd-modal-textarea{
    width:100%;
    resize:vertical;
    min-height:90px;
    line-height:1.4;
  }
  .vd-modal-actions{
    margin-top:10px;
    display:flex;
    justify-content:flex-end;
    gap:8px;
  }
`}</style>
    </div>
  );
}
