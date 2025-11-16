import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import { supabase } from "../lib/supabaseClient";

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
            ? `survei_${String(row.jenis_survei).toLowerCase().includes("meninggal") ? "md" : "ll"}`
            : "")),

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

async function buildPreviewHTML_MD(vv, objURL) {
  console.log("🔍 MD preview FULL data:", vv);
  console.log("📸 MD - allPhotos DETAIL:", vv.allPhotos);
  console.log("📄 MD - attachSurvey DETAIL:", vv.attachSurvey);

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

  const fotoSources = vv.allPhotos || [];
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
        
        // ✅ Prioritaskan URL yang sudah ada (Supabase URL)
        if (item.url && typeof item.url === 'string') {
          console.log("✅ Using existing URL:", item.url);
          return item.url;
        }
        
        // ✅ Handle Supabase path
        if (item.path && typeof item.path === 'string') {
          console.log("🔄 Generating URL from path:", item.path);
          try {
            const { data: urlData } = supabase.storage
              .from('foto-survey')
              .getPublicUrl(item.path);
            return urlData?.publicUrl || "";
          } catch (error) {
            console.error("❌ Error generating URL from path:", error);
          }
        }
        
        if (item.fileName && typeof item.fileName === 'string') {
          console.log("🔄 Generating URL from fileName:", item.fileName);
          
          // Tentukan folder berdasarkan jenis dokumen
          let folder = 'survey-images'; // default
          
          // Mapping folder untuk dokumen
          const folderMap = {
            ktp: 'ktp',
            kk: 'kk',
            bukuTabungan: 'buku-tabungan', 
            formPengajuan: 'form-pengajuan',
            formKeteranganAW: 'form-ahli-waris',
            skKematian: 'surat-kematian',
            aktaKelahiran: 'akta-kelahiran'
          };
          
          // Cari folder berdasarkan key/item properties
          if (item.jenis && folderMap[item.jenis]) {
            folder = folderMap[item.jenis];
          } else if (item.key && folderMap[item.key]) {
            folder = folderMap[item.key];
          }
          
          console.log("📁 Using folder:", folder);
          
          try {
            const fullPath = `${folder}/${item.fileName}`;
            const { data: urlData } = supabase.storage
              .from('foto-survey')
              .getPublicUrl(fullPath);
            return urlData?.publicUrl || "";
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

    const dokumenHTML = [];
    if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
      console.log("🔍 Processing dokumen dari attachSurvey...");
      
      const dokumenKeys = ['ktp', 'kk', 'bukuTabungan', 'formPengajuan', 'formKeteranganAW', 'skKematian', 'aktaKelahiran'];
      const dokumenLabels = {
        ktp: 'KTP Korban',
        kk: 'Kartu Keluarga (KK)',
        bukuTabungan: 'Buku Tabungan',
        formPengajuan: 'Formulir Pengajuan Santunan',
        formKeteranganAW: 'Formulir Keterangan Ahli Waris',
        skKematian: 'Surat Keterangan Kematian',
        aktaKelahiran: 'Akta Kelahiran'
      };
      
      dokumenKeys.forEach(key => {
        const dokumen = vv.attachSurvey[key];
        console.log(`🔍 Processing ${key}:`, dokumen);
        
        if (dokumen && (dokumen.url || dokumen.path || dokumen.fileName)) {
          const src = toSrc({...dokumen, jenis: key});
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

    const petugasSrc = (() => {
      const raw = (vv.petugasTtd || "").toString().trim();
      console.log("🖼️ TTD untuk preview:", raw);
      
      if (!raw) {
        console.log("❌ TTD kosong di preview");
        return null;
      }

      // Jika sudah URL lengkap
      if (raw.startsWith('http')) {
        console.log("✅ URL TTD valid:", raw);
        
        // Test image loading
        const testImg = new Image();
        testImg.onload = () => console.log("🖼️ TTD Image loaded successfully");
        testImg.onerror = () => console.log("❌ TTD Image failed to load");
        testImg.src = raw;
        
        return raw + '?t=' + Date.now(); // Cache busting
      }
      
      return null;
    })();

    console.log("🔍 Final petugasSrc untuk HTML:", petugasSrc);

    const dokumenSection = dokumenHTML.length > 0 ? `
      <div style="page-break-before: always; margin-top: 20mm;">
        <h3 style="text-align:center; font-size:14pt; margin-bottom:10mm;">DOKUMEN PENDUKUNG</h3>
        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10mm;">
          ${dokumenHTML.join('')}
        </div>
      </div>
    ` : '';

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
               : `<div class="space"></div>`
           }
          <div class="name">${escapeHtml("Andi Raharja, S.A.B")}</div>
          <div>${escapeHtml("Kepala Bagian Operasional")}</div>
        </div>
        <div>
          <div class="lbl">Petugas Survei,</div>
          <div class="space"></div>
          ${petugasSrc
            ? `<img 
                src="${petugasSrc}" 
                alt="TTD Petugas" 
                style="max-height:60px; display:block; margin:4px auto; border:1px solid #ccc;" 
                onerror="console.log('❌ TTD gagal dimuat')"
              />`
            : "<div class='space'></div>"
          }
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

  const fotoSources = vv.allPhotos || [];
  console.log("📸 LL - allPhotos:", fotoSources);

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
        
        // ✅ Prioritaskan URL yang sudah ada (Supabase URL)
        if (item.url && typeof item.url === 'string') {
          console.log("✅ Using existing URL:", item.url);
          return item.url;
        }
        
        // ✅ Handle Supabase path
        if (item.path && typeof item.path === 'string') {
          console.log("🔄 Generating URL from path:", item.path);
          try {
            const { data: urlData } = supabase.storage
              .from('foto-survey')
              .getPublicUrl(item.path);
            return urlData?.publicUrl || "";
          } catch (error) {
            console.error("❌ Error generating URL from path:", error);
          }
        }
        
        // ✅ Handle fileName untuk fallback
        if (item.fileName && typeof item.fileName === 'string') {
          console.log("🔄 toSrc: Trying fileName:", item.fileName);
          try {
              // Coba dengan folder survey-images
              const fullPath = `survey-images/${item.fileName}`;
              const { data: urlData } = supabase.storage
                  .from('foto-survey')
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

  const imgsHTML = fotoSources
      .map((x) => {
        const src = toSrc(x);
        if (!src) {
          console.log("❌ Skipping foto - no source:", x);
          return "";
        }
        
        const isPdf = src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src);
        if (isPdf) {
          return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`;
        }
        
        const name = escapeHtml(x?.name || x?.fileName || "foto");
        console.log("✅ Rendering foto:", name, src);
        
        return `
          <div style="margin:10px; text-align:center;">
            <img src="${src}" alt="${name}" 
                 style="max-width:250px; max-height:250px; border:1px solid #ccc; border-radius:6px;"
                 onerror="console.error('Failed to load image:', this.src)"/>
            <div style="font-size:12px; color:#333; margin-top:5px;">${name}</div>
          </div>`;
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

    const petugasSrc = (() => {
      const raw = (vv.petugasTtd || "").toString().trim();
      console.log("🖼️ TTD untuk preview:", raw);
      
      if (!raw) {
        console.log("❌ TTD kosong di preview");
        return null;
      }

      // Jika sudah URL lengkap
      if (raw.startsWith('http')) {
        console.log("✅ URL TTD valid:", raw);
        
        // Test image loading
        const testImg = new Image();
        testImg.onload = () => console.log("🖼️ TTD Image loaded successfully");
        testImg.onerror = () => console.log("❌ TTD Image failed to load");
        testImg.src = raw;
        
        return raw + '?t=' + Date.now(); // Cache busting
      }
      
      return null;
    })();

    console.log("🔍 Final petugasSrc untuk HTML:", petugasSrc);

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
      .sig-wrap { min-height:86px; display:flex; align-items:center; justify-content:center; }
      .sig-loader {
        width: 22px; height: 22px; border-radius: 50%;
        border: 3px solid #ddd; border-top-color: #888;
        animation: spin 0.9s linear infinite; margin: 0 auto;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
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
               : `<div class="space"></div>`
           }
          <div class="name">${escapeHtml("Andi Raharja, S.A.B")}</div>
          <div>${escapeHtml("Kepala Bagian Operasional")}</div>
        </div>
        <div>
          <div class="lbl">Petugas Survei,</div>
          <div class="space"></div>
          ${petugasSrc
            ? `<img 
                src="${petugasSrc}" 
                alt="TTD Petugas" 
                style="max-height:60px; display:block; margin:4px auto; border:1px solid #ccc;" 
                onerror="console.log('❌ TTD gagal dimuat')"
              />`
            : "<div class='space'></div>"
          }
          <div class="name">${escapeHtml(vv.petugasSurvei || vv.petugas || "........................................")}</div>
          <div>${escapeHtml(vv.petugasJabatan || "")}</div>
        </div>
      </div>

      <div class="foto-container">${imgsHTML || "<i>Tidak ada foto dilampirkan.</i>"}</div>
    </body></html>`;
  }

function buildPreviewHTML_RS(vv, objURL) {
  console.log("🔍 RS preview FULL data:", vv);
  console.log("🔍 foto_survey structure:", vv.foto_survey);
  console.log("🔍 attachSurvey structure:", vv.attachSurvey);

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

    // DEBUG DETAIL: Cek struktur lengkap
  console.log("🔍 === DETAILED STRUCTURE ANALYSIS ===");
  console.log("🔍 Full vv object:", JSON.stringify(vv, null, 2));
  console.log("🔍 attachSurvey type:", typeof vv.attachSurvey);
  console.log("🔍 attachSurvey value:", vv.attachSurvey);

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

    console.log("📸 === CHECKING ALL PHOTO SOURCES ===");
    console.log("📸 vv.foto_survey:", vv.foto_survey);
    console.log("📸 vv.attachSurvey:", vv.attachSurvey);
    console.log("📸 vv.fotoSurveyList:", vv.fotoSurveyList);
    console.log("📸 vv.allPhotos:", vv.allPhotos);
    console.log("📸 vv.attachments:", vv.attachments);

  const fotoCandidates = vv.allPhotos || [];
      console.log("✅ Using allPhotos:", fotoCandidates.length);
      console.log("✅ allPhotos content:", fotoCandidates);
  
      // PRIORITAS 1: Cari dari fotoSurveyList (ternyata di sini datanya)
      if (vv.fotoSurveyList && Array.isArray(vv.fotoSurveyList) && vv.fotoSurveyList.length > 0) {
          console.log("✅✅✅ FOUND fotoSurveyList with photos:", vv.fotoSurveyList.length);
          // fotoCandidates.push(...vv.fotoSurveyList);
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
      
      console.log("✅ Final foto candidates:", fotoCandidates);
      console.log("✅ Number of candidates:", fotoCandidates.length);
  
      // 🧪 TEST MANUAL - Tambahkan ini sebelum const toSrc
      console.log("🧪 === TEST MANUAL SUPABASE URL ===");
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
                const fullPath = `survey-images/${fotoObj.fileName}`;
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
              
              const fileUrl = `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/survey-images/${file.name}`;
              
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

      const { data: sumberInfoFiles, error: sumberInfoError } = await supabase.storage
        .from('foto-survey')
        .list('sumber-informasi');
      
      if (!sumberInfoError && sumberInfoFiles) {
        const sumberInfoWithUrl = await Promise.all(
          sumberInfoFiles.map(async (file) => {
            try {
              const timestampFromName = extractTimestampFromFileName(file.name);
              const fileUrl = `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/sumber-informasi/${file.name}`;
              
              return {
                ...file,
                url: fileUrl,
                folder: 'sumber-informasi',
                uploadedAt: timestampFromName,
                timestamp: timestampFromName ? new Date(timestampFromName).getTime() : null
              };
            } catch (error) {
              console.error(`❌ Error processing sumber-info file ${file.name}:`, error);
              return null;
            }
          })
        );
        
        const validSumberInfoFiles = sumberInfoWithUrl.filter(Boolean);
        allFiles = [...allFiles, ...validSumberInfoFiles];
        console.log('✅ Loaded sumber-informasi files:', validSumberInfoFiles.length);
      }

      // === TAMBAHAN: LOAD FOLDER DOKUMEN ===
      const docFolders = ['kk', 'ktp', 'akta-kelahiran', 'buku-tabungan', 'form-ahli-waris', 'form-pengajuan', 'surat-kematian'];
      
      for (const folder of docFolders) {
        try {
          console.log(`📁 Loading documents from: ${folder}`);
          
          const { data: docFiles, error: docError } = await supabase.storage
            .from('foto-survey')
            .list(folder);
          
          if (!docError && docFiles) {
            const docFilesWithMetadata = await Promise.all(
              docFiles.map(async (file) => {
                try {
                  const timestampFromName = extractTimestampFromFileName(file.name);
                  const fileUrl = `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/${folder}/${file.name}`;
                  
                  return {
                    ...file,
                    url: fileUrl,
                    folder: folder,
                    uploadedAt: timestampFromName,
                    timestamp: timestampFromName ? new Date(timestampFromName).getTime() : null
                  };
                } catch (error) {
                  console.error(`❌ Error processing ${folder} file ${file.name}:`, error);
                  return null;
                }
              })
            );
            
            const validDocFiles = docFilesWithMetadata.filter(Boolean);
            allFiles = [...allFiles, ...validDocFiles];
            console.log(`✅ Loaded ${validDocFiles.length} files from ${folder}`);
          }
        } catch (error) {
          console.error(`❌ Error loading from ${folder}:`, error);
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

  function clearPreviousInputState() {
    if (window.previewData) {
      window.previewData.allPhotos = [];
      window.previewData.attachSurvey = {};
      window.previewData.fotoSurveyList = [];
    }
    
    // Clear URL cache
    if (window.objURLCache) {
      Object.values(window.objURLCache).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      window.objURLCache = {};
    }
    
    console.log("🧹 Previous input state cleared");
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

    const pushFile = (f, label = "Lampiran", source = "unknown") => {
      if (!f) {
        console.log(`❌ Skip ${label} - null/undefined`);
        return;
      }

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
  
    // Load files dengan metadata (timestamp dari nama file)
    const allFilesWithMetadata = await loadFilesWithMetadata();
    
    const recordTime = new Date(rec.createdAt || rec.waktu).getTime();
    console.log(`🕐 Record created at: ${new Date(recordTime).toLocaleString('id-ID')}`);
    if (rec.createdAt || rec.waktu) {
      const timeRelevantFiles = allFilesWithMetadata.filter(file => {
        if (file.folder !== 'survey-images') return false;
        if (!file.timestamp) {
          console.log(`❌ Skip ${file.name} - no timestamp`);
          return false;
        }
        
        const fileTime = file.timestamp;
        const timeDiff = Math.abs(fileTime - recordTime);
        const isRelevant = timeDiff <= (5 * 60 * 1000); // ± 5 menit
        
        if (isRelevant) {
          console.log(`✅ Time match: ${file.name} | File: ${new Date(fileTime).toLocaleString('id-ID')} | Record: ${new Date(recordTime).toLocaleString('id-ID')} | Diff: ${Math.round(timeDiff/1000)} detik`);
        } else {
          console.log(`❌ Time mismatch: ${file.name} | Diff: ${Math.round(timeDiff/1000)} detik`);
        }
        
        return isRelevant;
      });
      
      if (timeRelevantFiles.length > 0) {
        console.log(`🎯 Found ${timeRelevantFiles.length} time-relevant files`);
        
        // Urutkan berdasarkan waktu upload (terlama ke terbaru)
        timeRelevantFiles.sort((a, b) => a.timestamp - b.timestamp);
        
        // Tambahkan ke files
        timeRelevantFiles.forEach((file, index) => {
          pushFile({
            name: `survey_${index + 1}`,
            fileName: file.name,
            url: file.url,
            folder: file.folder,
            uploadedAt: new Date(file.timestamp).toISOString(),
            timeDiff: Math.abs(file.timestamp - recordTime),
            inputId: rec.id,
            timestamp: file.timestamp
          }, `Foto Survey ${index + 1}`, "time-based-filter");
        });
      } else {
        console.log('❌ No time-relevant files found');
        
        // Fallback: tampilkan info semua file survey-images
        const allSurveyFiles = allFilesWithMetadata.filter(f => f.folder === 'survey-images');
        console.log('📋 All survey files with timestamps:');
        allSurveyFiles.forEach(file => {
          const fileTime = file.timestamp ? new Date(file.timestamp).toLocaleString('id-ID') : 'Unknown';
          console.log(`   - ${file.name}: ${fileTime}`);
        });
        
        // Fallback: tampilkan 3 file terbaru dari survey-images
        if (allSurveyFiles.length > 0) {
          console.log('🔄 Fallback: showing latest 3 survey files');
          const latestFiles = allSurveyFiles
            .filter(f => f.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
          
          latestFiles.forEach((file, index) => {
            pushFile({
              name: `fallback_${index + 1}`,
              fileName: file.name,
              url: file.url,
              folder: file.folder,
              uploadedAt: new Date(file.timestamp).toISOString(),
              inputId: rec.id
            }, `Foto ${index + 1}`, "fallback");
          });
        }
      }
    }

    console.log('🔍 [SOURCE-INFO] Searching for sumber informasi photos...');

    // Cari foto yang cocok untuk sumber informasi berdasarkan waktu
    const sumberInfoFiles = allFilesWithMetadata.filter(file => {
      if (file.folder !== 'sumber-informasi') return false;
      if (!file.timestamp) return false;
      
      // Gunakan logika waktu yang sama seperti survey-images
      const fileTime = file.timestamp;
      const timeDiff = Math.abs(fileTime - recordTime);
      const isRelevant = timeDiff <= (5 * 60 * 1000); // ± 5 menit
      
      if (isRelevant) {
        console.log(`✅ Sumber info match: ${file.name} | Diff: ${Math.round(timeDiff/1000)} detik`);
      }
      
      return isRelevant;
    });

    if (sumberInfoFiles.length > 0) {
      console.log(`🎯 Found ${sumberInfoFiles.length} sumber informasi files`);
      
      // Urutkan berdasarkan waktu
      sumberInfoFiles.sort((a, b) => a.timestamp - b.timestamp);
      
      // Simpan di vv.sumbers untuk digunakan di preview
      if (!vv.sumbers || !Array.isArray(vv.sumbers)) {
        vv.sumbers = [];
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
    vv.tempatKecelakaan = rec.tempatKecelakaan || rec.lokasiKecelakaan || "";
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
            console.log("📸 [prepareForOutput] Processing foto_survey from database:", rec.foto_survey);
            
            let fotoData = rec.foto_survey;
            
            // Jika string, parse JSON
            if (typeof fotoData === 'string' && fotoData.trim() !== '') {
                fotoData = JSON.parse(fotoData);
            }
            
            // Jika array, process
            if (Array.isArray(fotoData)) {
                vv.fotoSurveyList = fotoData;
                console.log("✅ foto_survey processed, count:", fotoData.length);
                
                // Push ke files
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

    vv.attachSurvey = rec.attachSurvey || rec.attach_survey || rec.attachments || {};
    console.log("🔍 [prepareForOutput] attachSurvey original:", rec.attachSurvey);
    console.log("🔍 [prepareForOutput] attachSurvey final:", vv.attachSurvey);

    console.log("🔍 [prepareForOutput] Processing photo sources:");
    console.log("   - fotoSurveyList:", vv.fotoSurveyList);
    console.log("   - attachSurvey:", vv.attachSurvey);

    if (vv.attachSurvey && typeof vv.attachSurvey === 'object' && !Array.isArray(vv.attachSurvey)) {
      console.log("📸 Processing attachSurvey boolean flags");
      
      const folderMapping = {
        kk: 'kk',
        ktp: 'ktp', 
        akta_kelahiran: 'akta-kelahiran',
        buku_tabungan: 'buku-tabungan',
        form_keterangan_ahli_waris: 'form-ahli-waris',
        form_pengajuan_santunan: 'form-pengajuan',
        surat_keterangan_kematian: 'surat-kematian',
        map_ss: 'survey-images',
        barcode_qr: 'survey-images'
      };

      Object.entries(vv.attachSurvey).forEach(([key, value]) => {
        if (key.toLowerCase().includes('ttd') || key.toLowerCase().includes('signature') || value === false) {
          return;
        }
        
        if (value === true) {
          console.log(`🔍 Looking for file matching key: ${key}`);
          
          const targetFolder = folderMapping[key] || 'survey-images';
          console.log(`📁 Searching in folder: ${targetFolder} for key: ${key}`);

          // === PASTIKAN PAKAI bestMatch BUKAN matchingFile ===
          // Cari file di folder yang sesuai berdasarkan timestamp
          const folderFiles = allFilesWithMetadata.filter(file => file.folder === targetFolder);
          
          if (folderFiles.length === 0) {
            console.log(`❌ No files found in folder ${targetFolder}`);
            return;
          }

          // Cari file dengan timestamp terdekat ke record time
          let bestMatch = null;
          let smallestDiff = Infinity;

          folderFiles.forEach(file => {
            if (file.timestamp) {
              const timeDiff = Math.abs(file.timestamp - recordTime);
              
              // Untuk dokumen, gunakan tolerance yang lebih longgar (2 menit)
              if (timeDiff < smallestDiff && timeDiff < (2 * 60 * 1000)) {
                smallestDiff = timeDiff;
                bestMatch = file;
              }
            }
          });

          // === INI YANG PERLU DIPERBAIKI ===
          // PASTIKAN PAKAI bestMatch, BUKAN matchingFile
          if (bestMatch && bestMatch.url) {
            console.log(`✅ Found matching file for ${key}:`, bestMatch.name, `| Time diff: ${smallestDiff}ms`);
            pushFile({
              name: key,
              fileName: bestMatch.name,
              url: bestMatch.url,
              folder: bestMatch.folder,
              inputId: rec.id,
              jenis: key
            }, key);
          } else {
            console.warn(`❌ No matching file found for ${key} in folder ${targetFolder}`);
            console.log(`📋 Available files in ${targetFolder}:`, folderFiles.map(f => f.name));
          }
        }
        // Jika value adalah object/string, langsung push
        else if (value && (typeof value === 'object' || typeof value === 'string')) {
          pushFile(value, key);
        }
      });
    }

    // Process array sources
    pushFile(rec.fotoSurveyList, "Foto Survey");
    pushFile(rec.fotoList, "Foto Survey");

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

export default function VerifikatorDashboard() {
  const { user, hasRole, logout } = useAuth();
  if (!hasRole("admin-verifikator"))
    return <Navigate to="/unauthorized" replace />;

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
    stampPage: "", // kosong = terakhir (default), isi angka 1-based untuk target halaman
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

  // revoke blob url saat unmount / ganti dokumen
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

  const loadReportHTML = useCallback(
    async (queueItem) => {
      if (!queueItem) return;
      setDetailLoading(true);
      setDetailHTML("");
      try {
        blobUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch {}
      setBlobUrls([]);

      try {
        // 1) Ambil row "dataform" dasar (punyamu sudah benar)
        let { data: base, error } = await supabase
          .from(queueItem.__table || "dataform")
          .select("*")
          .eq("local_id", queueItem.id)
          .maybeSingle();

        if (error) throw error;
        if (!base) {
          setDetailHTML(
            `<div style="padding:16px;font-family:sans-serif">Data detail tidak ditemukan.</div>`
          );
          return;
        }

        // 2) Enrich dari tabel varian (RS / MD / LL) pakai helper yang sudah kamu buat
        const { variant, row } = await fetchDetailFromSupabase(base);
        const merged = row
          ? { ...base, ...normalizeDetailRow(variant, row) }
          : base;

        // 3) Bentuk output final untuk preview
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

        // 4) Render sesuai varian
        const template = (vv.template || "").toLowerCase();
        const sifat = (vv.sifatCidera || vv.jenisSurvei || "").toLowerCase();

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
    [blobUrls]
  );

  const openPreview = useCallback(async (rec) => {
    try {
      // 1) ambil row detail dari tabel varian
      const { variant, row } = await fetchDetailFromSupabase(rec);

      // 2) normalisasi & gabung ke record awal (biar field-nya lengkap)
      const merged = row
        ? { ...rec, ...normalizeDetailRow(variant, row) }
        : rec;

      // 3) bentuk payload final untuk modal/preview
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

      // 4) pilih builder preview sesuai varian (punyamu sudah ada)
      const template = (vv.template || "").toLowerCase();
      const sifat = (vv.sifatCidera || vv.jenisSurvei || "").toLowerCase();
      const createdBlobUrls = [];
      const objURL = (maybeFile) => {
        if (maybeFile instanceof File) {
          const u = URL.createObjectURL(maybeFile);
          createdBlobUrls.push(u);
          return u;
        }
        return null;
      };

      if (sifat.includes("meninggal") || template.includes("survei_md")) {
        const html = await buildPreviewHTML_MD(vv, objURL);
        setDetailData({ ...vv, __variant: "md", previewHTML: html });
      } else if (sifat.includes("luka") || template.includes("survei_ll")) {
        const html = buildPreviewHTML_LL(vv, objURL);
        setDetailData({ ...vv, __variant: "ll", previewHTML: html });
      } else if (template.includes("kunjungan")) {
        const html = buildPreviewHTML_RS(vv, objURL);
        setDetailData({ ...vv, __variant: "rs", previewHTML: html });
      } else {
        // fallback: tetap tampilkan tanpa HTML khusus
        setDetailData({ ...vv, __variant: "ll", previewHTML: null });
      }

      setBlobUrls(createdBlobUrls);
      setDetailOpen(true);
    } catch (e) {
      console.error("openPreview error:", e);
      alert("Gagal membuka detail. Cek console untuk detail error.");
    }
  }, []);

  function mapRowToQueueItem(row) {
    // ambil status verifikator sub-flow dari JSONB counts.verifikator (kalau ada)
    const ver = (row.counts && row.counts.verifikator) || {};
    const verStatus =
      ver.status || (row.status === "selesai" ? "disetujui" : "menunggu");

    // tanggal referensi yang rapi
    const t =
      row.verified_at ||
      row.updated_at ||
      row.waktu ||
      row.createdAt ||
      new Date().toISOString();

    // sumber PDF (kalau kamu simpan path-nya di files/verifikator)
    const files = row.files || {};
    const verFiles = files.verifikator || {};
    const pdfUrl =
      verFiles.pdfUrl ||
      files.pdfUrl ||
      files.hasilFormPdf ||
      "/Lembar_Kunjungan_RS_NAI.pdf"; // fallback

    return {
      // pakai local_id sebagai kunci utama (sesuai flow kamu)
      id: row.local_id || row.id,
      pemohon: row.korban || "-",
      tanggal: String(t).slice(0, 10),
      status: verStatus, // "menunggu" | "diperiksa" | "revisi" | "ditolak" | "disetujui"
      pdfUrl,
      stampPage: ver.stampPage || "", // opsional
      stampedPdfUrl: ver.stampedPdfUrl, // kalau pernah distempel & disimpan
      __rawCounts: row.counts || {},
      __table: "dataform",
    };
  }

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      // Ambil pengajuan yang sudah diverifikasi petugas & masuk antrean admin:
      // status "diproses" (menunggu putusan admin) dan "selesai" (sudah disetujui admin)
      let resp = await supabase
        .from("dataform")
        .select(
          "id, local_id, korban, status, verified, verified_at, verify_note, verify_checklist, waktu, updated_at, files, counts"
        )
        .in("status", ["diproses", "selesai"])
        .order("updated_at", { ascending: false });

      // fallback kalau casing tabel beda
      if (resp.error) {
        if (
          resp.error.code === "PGRST116" ||
          resp.error.status === 404 ||
          resp.error.status === 500
        ) {
          resp = await supabase
            .from("dataform")
            .select(
              "id, local_id, korban, status, verified, verified_at, verify_note, verify_checklist, waktu, updated_at, files, counts"
            )
            .in("status", ["diproses", "selesai"])
            .order("updated_at", { ascending: false });
        }
      }
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

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const ch = supabase
      .channel("verifikator_dataform")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "DataForm" },
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
    if (selectedGroup.length && selectedGroup[activeIdx]) {
      loadReportHTML(selectedGroup[activeIdx]);
    }
  }, [activeIdx]);

  // KPI
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

  // Filter & sort daftar kiri
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

  const baseHref = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
  const asset = (p = "") =>
    new URL(baseHref + String(p).replace(/^\/+/, ""), window.location.origin)
      .href;

  // ===== Helpers: mapping status internal -> badge status (pending/progress/done) =====
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

  // ===== Helpers: barcode =====
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

  async function updateVerifikatorStatusToSupabase(
    item,
    nextStatus,
    patch = {}
  ) {
    const nowIso = new Date().toISOString();

    const currentCounts = item.__rawCounts || {};
    const nextCounts = {
      ...currentCounts,
      verifikator: {
        ...(currentCounts.verifikator || {}),
        status: nextStatus, // "disetujui" | "ditolak" | "revisi" | "diperiksa" | "menunggu"
        ...patch,
      },
    };

    const nextMainStatus = nextStatus === "disetujui" ? "selesai" : "diproses";

    // update by local_id (bukan id UUID table)
    const { error } = await supabase
      .from(item.__table || "dataform")
      .update({
        status: nextMainStatus,
        counts: nextCounts,
        updated_at: nowIso,
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
      pageIndex = pages.length - 1; // default: last
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

  // ====== Aksi untuk item aktif ======
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

      // === sinkron ke Supabase ===
      await updateVerifikatorStatusToSupabase(activeItem, "disetujui", {
        stampedPdfUrl: stampedUrl,
        stampedAt: new Date().toISOString(),
        stampedBy: user?.name || user?.id || "verifikator",
        stampPage: activeItem.stampPage || null,
      });

      // === update UI lokal ===
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

  async function handleReject() {
    if (!activeItem) return;
    try {
      await updateVerifikatorStatusToSupabase(activeItem, "ditolak", {
        rejectedAt: new Date().toISOString(),
        rejectedBy: user?.name || user?.id || "verifikator",
        // rejectNote: "...", // (opsional) tambahkan dari input kalau perlu
      });

      setQueue((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "ditolak" } : i
        )
      );
      setSelectedGroup((prev) =>
        prev.map((i) =>
          i.id === activeItem.id ? { ...i, status: "ditolak" } : i
        )
      );
      setActivity((a) => [
        {
          id: "A-" + Math.random().toString(36).slice(2, 7),
          teks: `Menolak ${activeItem.id} (${activeItem.pemohon})`,
          waktu: new Date().toLocaleString(),
        },
        ...a,
      ]);
    } catch (e) {
      console.error(e);
      alert("Gagal menolak berkas.");
    }
  }

  async function handleNeedRevision() {
    if (!activeItem) return;
    try {
      await updateVerifikatorStatusToSupabase(activeItem, "revisi", {
        revisionAt: new Date().toISOString(),
        revisionBy: user?.name || user?.id || "verifikator",
        // revisionNote: "...", // (opsional)
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

  // ====== Saat klik baris di tabel kiri: buka group nama (≤10) ======
  function openGroupFor(row) {
    const group = queue
      .filter((i) => i.pemohon === row.pemohon)
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
      .slice(0, 10);

    setSelectedGroup(group);
    const idx = group.findIndex((g) => g.id === row.id);
    setActiveIdx(idx >= 0 ? idx : 0);
  }

  // ====== CRUD handlers ======
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
    // sinkron group jika berkas aktif sedang diedit
    setSelectedGroup((prev) =>
      prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i))
    );
    // jika ID diubah & itu yang aktif, perbaiki activeIdx
    const newIdx = selectedGroup.findIndex((i) => i.id === editId);
    if (newIdx >= 0) {
      setActiveIdx(newIdx);
    }
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
    <div className="page">
      {/* Header */}
      <header className="v-header">
        <div>
          <h1>Dashboard Verifikator</h1>
          <p>Ringkasan & persetujuan berkas “data form”.</p>
        </div>
        <div className="right">
          <span>
            {user?.name} ({user?.role})
          </span>
          <button onClick={logout}>Keluar</button>
        </div>
      </header>

      {/* KPI */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Menunggu (pending)</div>
          <div className="value">{kpi.menunggu}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Sedang Diperiksa (progress)</div>
          <div className="value">{kpi.diperiksa + kpi.revisi}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Ditolak (pending)</div>
          <div className="value">{kpi.ditolak}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Disetujui (done)</div>
          <div className="value">{kpi.disetujui}</div>
        </div>
      </section>

      {/* Toolbar + CREATE */}
      <section className="toolbar" style={{ alignItems: "center" }}>
        <input
          placeholder="Cari ID / pemohon / status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={fetchQueue} disabled={loading}>
          {loading ? "Muat..." : "Segarkan Data"}
        </button>

        {/* Form tambah cepat */}
        <form
          onSubmit={handleCreate}
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginLeft: "auto",
          }}
        >
          <input
            placeholder="ID"
            value={newItem.id}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, id: e.target.value.trim() }))
            }
            style={{ width: 110 }}
          />
          <input
            placeholder="Pemohon"
            value={newItem.pemohon}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, pemohon: e.target.value }))
            }
            style={{ width: 140 }}
          />
          <input
            type="date"
            value={newItem.tanggal}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, tanggal: e.target.value }))
            }
          />
          <select
            value={newItem.status}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, status: e.target.value }))
            }
          >
            <option value="menunggu">menunggu (pending)</option>
            <option value="diperiksa">diperiksa (progress)</option>
            <option value="revisi">revisi (progress)</option>
            <option value="ditolak">ditolak (pending)</option>
            <option value="disetujui">disetujui (done)</option>
          </select>
          <input
            placeholder="/path.pdf"
            value={newItem.pdfUrl}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, pdfUrl: e.target.value }))
            }
            style={{ width: 180 }}
          />
          <input
            type="number"
            min={1}
            placeholder="Hal. stempel (opsional)"
            value={newItem.stampPage}
            onChange={(e) =>
              setNewItem((s) => ({ ...s, stampPage: e.target.value }))
            }
            style={{ width: 160 }}
            title="Kosongkan untuk halaman terakhir"
          />
          <button type="submit">Tambah</button>
        </form>
      </section>

      {/* Grid: Daftar & Detail */}
      <section className="main-grid">
        {/* Daftar kiri */}
        <div className="card">
          <div
            className="flex items-center mb-3"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <h3 className="font-semibold" style={{ margin: 0 }}>
              Daftar Berkas
            </h3>
            <span
              className="ml-auto text-sm text-gray-500"
              style={{ marginLeft: "auto", opacity: 0.7 }}
            >
              Total: {filtered.length}
            </span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
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

                return (
                  <tr
                    key={row.id}
                    className={activeItem?.id === row.id ? "selected" : ""}
                  >
                    {/* ================== READ MODE ================== */}
                    {!isEditing && (
                      <>
                        <td>{row.id}</td>
                        <td>{row.pemohon}</td>
                        <td>
                          <span className={disp.className}>{disp.label}</span>
                          <span
                            style={{
                              marginLeft: 8,
                              opacity: 0.6,
                              fontSize: 12,
                            }}
                          >
                            ({row.status})
                          </span>
                        </td>
                        <td>{row.tanggal}</td>
                        <td
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <button
                            onClick={() => {
                              openGroupFor(row);
                              setTimeout(() => loadReportHTML(row), 0);
                            }}
                          >
                            Lihat Berkas
                          </button>
                          <button onClick={() => startEdit(row)}>Edit</button>
                          <button onClick={() => deleteItem(row.id)}>
                            Hapus
                          </button>
                        </td>
                      </>
                    )}

                    {/* ================== EDIT MODE ================== */}
                    {isEditing && (
                      <>
                        <td>
                          <input
                            value={editForm.id}
                            onChange={(e) =>
                              setEditForm((s) => ({
                                ...s,
                                id: e.target.value.trim(),
                              }))
                            }
                            style={{ width: 110 }}
                          />
                        </td>
                        <td>
                          <input
                            value={editForm.pemohon}
                            onChange={(e) =>
                              setEditForm((s) => ({
                                ...s,
                                pemohon: e.target.value,
                              }))
                            }
                            style={{ width: 140 }}
                          />
                        </td>
                        <td>
                          <select
                            value={editForm.status}
                            onChange={(e) =>
                              setEditForm((s) => ({
                                ...s,
                                status: e.target.value,
                              }))
                            }
                          >
                            <option value="menunggu">menunggu (pending)</option>
                            <option value="diperiksa">
                              diperiksa (progress)
                            </option>
                            <option value="revisi">revisi (progress)</option>
                            <option value="ditolak">ditolak (pending)</option>
                            <option value="disetujui">disetujui (done)</option>
                          </select>
                        </td>
                        <td>
                          <input
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
                        <td
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <input
                            placeholder="/path.pdf"
                            value={editForm.pdfUrl}
                            onChange={(e) =>
                              setEditForm((s) => ({
                                ...s,
                                pdfUrl: e.target.value,
                              }))
                            }
                            style={{ width: 180 }}
                          />
                          <input
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
                            style={{ width: 140 }}
                            title="Kosongkan untuk halaman terakhir"
                          />
                          <button onClick={saveEdit}>Simpan</button>
                          <button onClick={cancelEdit}>Batal</button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={5}>Tidak ada data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail kanan */}
        <div className="card">
          <h3 className="font-semibold">Detail Berkas</h3>

          {!selectedGroup.length ? (
            <div className="text-sm" style={{ opacity: 0.6 }}>
              Pilih baris di kiri untuk memuat hingga <b>10 berkas</b> milik
              pemohon yang sama.
            </div>
          ) : (
            <>
              {/* Tabs ID untuk berkas-berkas nama ini */}
              <div className="tabs">
                {selectedGroup.map((it, idx) => (
                  <button
                    key={it.id}
                    onClick={() => setActiveIdx(idx)}
                    className={`tab ${idx === activeIdx ? "active" : ""}`}
                    title={`${it.id} • ${it.tanggal} • ${it.status}`}
                  >
                    {it.id}
                  </button>
                ))}
              </div>

              {/* Info singkat berkas aktif */}
              <div className="detail-grid">
                <div>
                  <b>ID</b>
                  <br />
                  {activeItem?.id}
                </div>
                <div>
                  <b>Pemohon</b>
                  <br />
                  {activeItem?.pemohon}
                </div>
                <div>
                  <b>Status</b>
                  <br />
                  {activeItem && (
                    <>
                      <span
                        className={
                          mapDisplayStatus(activeItem.status).className
                        }
                      >
                        {mapDisplayStatus(activeItem.status).label}
                      </span>
                      <span
                        style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}
                      >
                        ({activeItem.status})
                      </span>
                    </>
                  )}
                </div>
                <div>
                  <b>Tanggal</b>
                  <br />
                  {activeItem?.tanggal}
                </div>
              </div>

              {/* Preview PDF */}
              <div className="pdf-preview">
                {detailLoading ? (
                  <div style={{ padding: 12, opacity: 0.7 }}>
                    Memuat laporan…
                  </div>
                ) : detailHTML ? (
                  <iframe
                    title="Laporan"
                    srcDoc={detailHTML}
                    sandbox="allow-same-origin allow-forms allow-scripts"
                    style={{ width: "100%", height: "100%", border: "0" }}
                  />
                ) : (
                  <div style={{ padding: 12, opacity: 0.7 }}>
                    Tidak ada konten.
                  </div>
                )}
              </div>

              {/* Aksi */}
              <div className="actions">
                <button
                  className="approve"
                  onClick={handleApproveOne}
                  disabled={
                    !activeItem ||
                    approvingOne ||
                    activeItem?.status === "disetujui"
                  }
                  title="Setujui & tempel barcode untuk berkas aktif"
                >
                  {approvingOne ? "Memproses..." : "Setujui (jadi DONE)"}
                </button>

                <button
                  className="reject"
                  onClick={handleReject}
                  disabled={!activeItem}
                >
                  Tolak (jadi PENDING)
                </button>

                <button
                  className="revision"
                  onClick={handleNeedRevision}
                  disabled={!activeItem}
                >
                  Minta Revisi (PROGRESS)
                </button>

                <button
                  className="revision"
                  onClick={handleMarkInReview}
                  disabled={!activeItem}
                >
                  Tandai Diperiksa (PROGRESS)
                </button>

                <button
                  className="approve"
                  onClick={handleApproveAll}
                  disabled={!selectedGroup.length || approvingAll}
                  title="Setujui semua berkas pada nama ini (maks 10)"
                >
                  {approvingAll
                    ? "Memproses semua..."
                    : `Setujui Semua (${selectedGroup.length})`}
                </button>

                {!!activeItem?.stampedPdfUrl && (
                  <a
                    href={activeItem.stampedPdfUrl}
                    download={`${activeItem.id}-stamped.pdf`}
                  >
                    <button type="button" className="download">
                      Unduh PDF Bertanda (aktif)
                    </button>
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Aktivitas */}
      <section className="activity">
        <h3>Aktivitas Terakhir</h3>
        <ul>
          {activity.map((a) => (
            <li key={a.id}>
              <div>{a.teks}</div>
              <div className="time">{a.waktu}</div>
            </li>
          ))}
          {!activity.length && (
            <li className="text-sm" style={{ opacity: 0.6 }}>
              Belum ada aktivitas
            </li>
          )}
        </ul>
      </section>

      {/* BADGE STYLES (bisa dipindah ke index.css, ini inlined biar cepat) */}
      <style>{`
        .badge{ padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-block; }
        .badge-pending{ color:#7a2b2b; background:#ffe3e3; border:1px solid #ffc9c9; }
        .badge-progress{ color:#5a4100; background:#fff1c2; border:1px solid #ffe18f; }
        .badge-done{ color:#064c2a; background:#c7f9e5; border:1px solid #95f0d1; }
      `}</style>
    </div>
  );
}
