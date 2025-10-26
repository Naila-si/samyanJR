import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";
import { supabase } from "../lib/supabaseClient";

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
        ${vv.__showTtd
          ? `<img src="${vv.__ttdUrl}" alt="TTD Andi" style="height:28mm;object-fit:contain;margin:4mm 0;"/>`
          : `<div class="space"></div>`}
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
    return `<!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8"/>
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
        ${vv.__showTtd
          ? `<img src="${vv.__ttdUrl}" alt="TTD Andi" style="height:28mm;object-fit:contain;margin:4mm 0;"/>`
          : `<div class="space"></div>`}
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
        Mengetahui,<br/>
        ${vv.__showTtd
          ? `<img src="${vv.__ttdUrl}" alt="TTD Andi" style="height:28mm;object-fit:contain;margin:8mm 0; display:block;"/>`
          : `<br/><br/><br/><br/>`}
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

export default function VerifikatorDashboard() {
  const { user, hasRole, logout } = useAuth();
  if (!hasRole("admin-verifikator")) return <Navigate to="/unauthorized" replace />;

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
      try { blobUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
    };
  }, [blobUrls]);

  const [ttdUrl, setTtdUrl] = useState("");

  useEffect(() => {
    setTtdUrl(new URL("andi-ttd.jpeg", window.location.origin).href);
  }, []);

  const loadReportHTML = useCallback(async (queueItem) => {
    if (!queueItem) return;
    setDetailLoading(true);
    setDetailHTML("");
    // bersihkan blob lama
    try { blobUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
    setBlobUrls([]);

    try {
      // Ambil row asli dari Supabase berdasar local_id
      let { data, error } = await supabase
        .from(queueItem.__table || "DataForm")
        .select("*")
        .eq("local_id", queueItem.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        // fallback kalau nama tabel lowercase
        let alt = await supabase
          .from("dataform")
          .select("*")
          .eq("local_id", queueItem.id)
          .limit(1)
          .maybeSingle();
        data = alt.data;
        error = alt.error;
      }
      if (error) throw error;
      if (!data) {
        setDetailHTML(`<div style="padding:16px;font-family:sans-serif">Data detail tidak ditemukan.</div>`);
        return;
      }

      // siapkan data untuk preview
      const vv = await prepareForOutput(data);
      const ver = (data.counts && data.counts.verifikator) || {};
      vv.__showTtd =
        ver.status === "disetujui" ||
        data.status === "selesai"  ||
        queueItem?.status === "disetujui";
      vv.__ttdUrl = ttdUrl || new URL("andi-ttd.jpeg", window.location.origin).href;
      console.log("TTD URL:", vv.__ttdUrl, "show?", vv.__showTtd, {
        template: data.template,
        sifat: data?.sifatCidera,
        status: data.status,
        verStatus: ver.status,
      });

      // utility untuk buat blob URL jika ada File
      const createdBlobUrls = [];
      const objURL = (maybeFile) => {
        if (maybeFile instanceof File) {
          const u = URL.createObjectURL(maybeFile);
          createdBlobUrls.push(u);
          return u;
        }
        return null;
      };

      // pilih template
      const template = (data.template || "").toLowerCase();
      const sifat = (data?.sifatCidera || "").toLowerCase();

      if (sifat.includes("meninggal") || template.includes("survei_md")) {
        const html = await buildPreviewHTML_MD(vv, objURL);
        setDetailHTML(html);
        setBlobUrls(createdBlobUrls);
        return;
      }
      if (sifat.includes("luka") || template.includes("survei_ll")) {
        const html = buildPreviewHTML_LL(vv, objURL);
        setDetailHTML(html);
        setBlobUrls(createdBlobUrls);
        return;
      }
      if (template.includes("kunjungan")) {
        const html = buildPreviewHTML_RS(vv, objURL);
        setDetailHTML(html);
        setBlobUrls(createdBlobUrls);
        return;
      }

      setDetailHTML(`<div style="padding:16px;font-family:sans-serif">Template tidak dikenali untuk preview.</div>`);
    } catch (e) {
      console.error(e);
      setDetailHTML(`<div style="padding:16px;font-family:sans-serif;color:#a00">Gagal memuat detail.</div>`);
    } finally {
      setDetailLoading(false);
    }
  }, [blobUrls, ttdUrl]);

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

  function mapRowToQueueItem(row) {
    // ambil status verifikator sub-flow dari JSONB counts.verifikator (kalau ada)
    const ver = (row.counts && row.counts.verifikator) || {};
    const verStatus = ver.status || (row.status === "selesai" ? "disetujui" : "menunggu");

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
      status: verStatus,                 // "menunggu" | "diperiksa" | "revisi" | "ditolak" | "disetujui"
      pdfUrl,
      stampPage: ver.stampPage || "",    // opsional
      stampedPdfUrl: ver.stampedPdfUrl,  // kalau pernah distempel & disimpan
      __rawCounts: row.counts || {},
      __table: "DataForm",
    };
  }

  const fetchQueue = useCallback(async () => {
     setLoading(true);
     try {
       // Ambil pengajuan yang sudah diverifikasi petugas & masuk antrean admin:
       // status "diproses" (menunggu putusan admin) dan "selesai" (sudah disetujui admin)
       let resp = await supabase
         .from("DataForm")
         .select("id, local_id, korban, status, verified, verified_at, verify_note, verify_checklist, waktu, updated_at, files, counts")
         .in("status", ["diproses", "selesai"])
         .order("updated_at", { ascending: false });

       // fallback kalau casing tabel beda
       if (resp.error) {
         if (resp.error.code === "PGRST116" || resp.error.status === 404 || resp.error.status === 500) {
           resp = await supabase
             .from("dataform")
             .select("id, local_id, korban, status, verified, verified_at, verify_note, verify_checklist, waktu, updated_at, files, counts")
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

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

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
      try { supabase.removeChannel(ch); } catch {}
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
    return { menunggu: by("menunggu"), disetujui: by("disetujui"), ditolak: by("ditolak"), revisi: by("revisi"), diperiksa: by("diperiksa") };
  }, [queue]);

  // Filter & sort daftar kiri
  const filtered = useMemo(() => {
    return queue
      .filter((i) => [i.id, i.pemohon, i.status].join(" ").toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  }, [queue, query]);

  const baseHref = (import.meta.env.BASE_URL || "/").replace(/\/+$/,"/"); 
  const asset = (p="") =>
    new URL(baseHref + String(p).replace(/^\/+/, ""), window.location.origin).href;

  // ===== Helpers: mapping status internal -> badge status (pending/progress/done) =====
  function mapDisplayStatus(internal) {
    switch (internal) {
      case "disetujui": return { label: "done",     className: "badge badge-done" };
      case "diperiksa":
      case "revisi":    return { label: "progress", className: "badge badge-progress" };
      case "ditolak":
      case "menunggu":
      default:          return { label: "pending",  className: "badge badge-pending" };
    }
  }

  // ===== Helpers: barcode =====
  function makeBarcodeDataURL(text) {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 2 });
    return canvas.toDataURL("image/png");
  }

  async function updateVerifikatorStatusToSupabase(item, nextStatus, patch = {}) {
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
      .from(item.__table || "DataForm")
      .update({
        status: nextMainStatus,
        counts: nextCounts,
        updated_at: nowIso,
      })
      .eq("local_id", item.id);

    if (error) throw error;
  }

  async function stampBarcodeOnPdf(pdfUrl, text, opts = {}) {
    const { page: targetPage = "last", position = "bottom-right", marginX = 36, marginY = 72 } = opts;

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
        x = marginX; y = height - marginY - barcodeHeight; break;
      case "top-right":
        x = width - marginX - barcodeWidth; y = height - marginY - barcodeHeight; break;
      case "bottom-left":
        x = marginX; y = marginY; break;
      case "bottom-right":
      default:
        x = width - marginX - barcodeWidth; y = marginY; break;
    }

    page.drawText(text, { x, y: y + barcodeHeight + 6, size: 8, color: rgb(0, 0, 0) });
    page.drawImage(pngImage, { x, y, width: barcodeWidth, height: barcodeHeight });

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
      const barcodeText = `${activeItem.id} | disetujui | ${new Date().toISOString().slice(0, 19)} | ${user?.name}`;

      const pageIdx = Number(activeItem.stampPage);
      const stampedUrl = await stampBarcodeOnPdf(
        activeItem.pdfUrl,
        barcodeText,
        { page: Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last" }
      );

      // === sinkron ke Supabase ===
      await updateVerifikatorStatusToSupabase(activeItem, "disetujui", {
        stampedPdfUrl: stampedUrl,
        stampedAt: new Date().toISOString(),
        stampedBy: user?.name || user?.id || "verifikator",
        stampPage: activeItem.stampPage || null,
      });

      // === update UI lokal ===
      setQueue(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl } : i));
      setSelectedGroup(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl } : i));
      setActivity(a => [
        { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menyetujui ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
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

      setQueue(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "ditolak" } : i));
      setSelectedGroup(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "ditolak" } : i));
      setActivity(a => [
        { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menolak ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
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

      setQueue(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "revisi" } : i));
      setSelectedGroup(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "revisi" } : i));
      setActivity(a => [
        { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Minta revisi ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
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

      setQueue(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "diperiksa" } : i));
      setSelectedGroup(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: "diperiksa" } : i));
      setActivity(a => [
        { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menandai diperiksa ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
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
          const text = `${item.id} | disetujui | ${new Date().toISOString().slice(0, 19)} | ${user?.name}`;
          const pageIdx = Number(item.stampPage);
          const url = await stampBarcodeOnPdf(
            item.pdfUrl,
            text,
            { page: Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last" }
          );
          await updateVerifikatorStatusToSupabase(item, "disetujui", {
            stampedPdfUrl: url,
            stampedAt: new Date().toISOString(),
            stampedBy: user?.name || user?.id || "verifikator",
            stampPage: item.stampPage || null,
          });
          updated.push({ ...item, status: "disetujui", stampedPdfUrl: url });
          setActivity((a) => [
            { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menyetujui ${item.id} (${item.pemohon})`, waktu: new Date().toLocaleString() },
            ...a,
          ]);
        } else {
          updated.push(item);
        }
      }

      setQueue((prev) => prev.map((q) => updated.find((u) => u.id === q.id) || q));
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
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Tambah berkas ${item.id} (${item.pemohon})`, waktu: new Date().toLocaleString() },
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
    setSelectedGroup((prev) => prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i)));
    // jika ID diubah & itu yang aktif, perbaiki activeIdx
    const newIdx = selectedGroup.findIndex((i) => i.id === editId);
    if (newIdx >= 0) {
      setActiveIdx(newIdx);
    }
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Ubah berkas ${editId}`, waktu: new Date().toLocaleString() },
      ...a,
    ]);
    setEditId(null);
  }

  function deleteItem(id) {
    if (!confirm(`Hapus berkas ${id}?`)) return;
    setQueue((prev) => prev.filter((i) => i.id !== id));
    setSelectedGroup((prev) => prev.filter((i) => i.id !== id));
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Hapus berkas ${id}`, waktu: new Date().toLocaleString() },
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
          <span>{user?.name} ({user?.role})</span>
          <button onClick={logout}>Keluar</button>
        </div>
      </header>

      {/* KPI */}
      <section className="kpi-grid">
        <div className="kpi-card"><div className="label">Menunggu (pending)</div><div className="value">{kpi.menunggu}</div></div>
        <div className="kpi-card"><div className="label">Sedang Diperiksa (progress)</div><div className="value">{kpi.diperiksa + kpi.revisi}</div></div>
        <div className="kpi-card"><div className="label">Ditolak (pending)</div><div className="value">{kpi.ditolak}</div></div>
        <div className="kpi-card"><div className="label">Disetujui (done)</div><div className="value">{kpi.disetujui}</div></div>
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
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginLeft: "auto" }}>
          <input
            placeholder="ID"
            value={newItem.id}
            onChange={(e) => setNewItem((s) => ({ ...s, id: e.target.value.trim() }))}
            style={{ width: 110 }}
          />
          <input
            placeholder="Pemohon"
            value={newItem.pemohon}
            onChange={(e) => setNewItem((s) => ({ ...s, pemohon: e.target.value }))}
            style={{ width: 140 }}
          />
          <input
            type="date"
            value={newItem.tanggal}
            onChange={(e) => setNewItem((s) => ({ ...s, tanggal: e.target.value }))}
          />
          <select
            value={newItem.status}
            onChange={(e) => setNewItem((s) => ({ ...s, status: e.target.value }))}
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
            onChange={(e) => setNewItem((s) => ({ ...s, pdfUrl: e.target.value }))}
            style={{ width: 180 }}
          />
          <input
            type="number"
            min={1}
            placeholder="Hal. stempel (opsional)"
            value={newItem.stampPage}
            onChange={(e) => setNewItem((s) => ({ ...s, stampPage: e.target.value }))}
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
          <div className="flex items-center mb-3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 className="font-semibold" style={{ margin: 0 }}>Daftar Berkas</h3>
            <span className="ml-auto text-sm text-gray-500" style={{ marginLeft: "auto", opacity: 0.7 }}>Total: {filtered.length}</span>
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
                  <tr key={row.id} className={activeItem?.id === row.id ? "selected" : ""}>
                    {/* ================== READ MODE ================== */}
                    {!isEditing && (
                      <>
                        <td>{row.id}</td>
                        <td>{row.pemohon}</td>
                        <td>
                          <span className={disp.className}>{disp.label}</span>
                          <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>({row.status})</span>
                        </td>
                        <td>{row.tanggal}</td>
                        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => { openGroupFor(row); setTimeout(() => loadReportHTML(row), 0); }}>
                            Lihat Berkas
                          </button>
                          <button onClick={() => startEdit(row)}>Edit</button>
                          <button onClick={() => deleteItem(row.id)}>Hapus</button>
                        </td>
                      </>
                    )}

                    {/* ================== EDIT MODE ================== */}
                    {isEditing && (
                      <>
                        <td>
                          <input
                            value={editForm.id}
                            onChange={(e) => setEditForm((s) => ({ ...s, id: e.target.value.trim() }))}
                            style={{ width: 110 }}
                          />
                        </td>
                        <td>
                          <input
                            value={editForm.pemohon}
                            onChange={(e) => setEditForm((s) => ({ ...s, pemohon: e.target.value }))}
                            style={{ width: 140 }}
                          />
                        </td>
                        <td>
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}
                          >
                            <option value="menunggu">menunggu (pending)</option>
                            <option value="diperiksa">diperiksa (progress)</option>
                            <option value="revisi">revisi (progress)</option>
                            <option value="ditolak">ditolak (pending)</option>
                            <option value="disetujui">disetujui (done)</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={editForm.tanggal}
                            onChange={(e) => setEditForm((s) => ({ ...s, tanggal: e.target.value }))}
                          />
                        </td>
                        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input
                            placeholder="/path.pdf"
                            value={editForm.pdfUrl}
                            onChange={(e) => setEditForm((s) => ({ ...s, pdfUrl: e.target.value }))}
                            style={{ width: 180 }}
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="Hal. stempel"
                            value={editForm.stampPage}
                            onChange={(e) => setEditForm((s) => ({ ...s, stampPage: e.target.value }))}
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
              Pilih baris di kiri untuk memuat hingga <b>10 berkas</b> milik pemohon yang sama.
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
                <div><b>ID</b><br />{activeItem?.id}</div>
                <div><b>Pemohon</b><br />{activeItem?.pemohon}</div>
                <div>
                  <b>Status</b><br />
                  {activeItem && (
                    <>
                      <span className={mapDisplayStatus(activeItem.status).className}>
                        {mapDisplayStatus(activeItem.status).label}
                      </span>
                      <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>
                        ({activeItem.status})
                      </span>
                    </>
                  )}
                </div>
                <div><b>Tanggal</b><br />{activeItem?.tanggal}</div>
              </div>

              {/* Preview PDF */}
              <div className="pdf-preview">
                {detailLoading ? (
                  <div style={{padding:12, opacity:.7}}>Memuat laporan…</div>
                ) : detailHTML ? (
                  <iframe
                    title="Laporan"
                    srcDoc={detailHTML}
                    sandbox="allow-same-origin allow-forms allow-scripts"
                    style={{ width: "100%", height: "100%", border: "0" }}
                  />
                ) : (
                  <div style={{padding:12, opacity:.7}}>Tidak ada konten.</div>
                )}
              </div>

              {/* Aksi */}
              <div className="actions">
                <button
                  className="approve"
                  onClick={handleApproveOne}
                  disabled={!activeItem || approvingOne || activeItem?.status === "disetujui"}
                  title="Setujui & tempel barcode untuk berkas aktif"
                >
                  {approvingOne ? "Memproses..." : "Setujui (jadi DONE)"}
                </button>

                <button className="reject" onClick={handleReject} disabled={!activeItem}>
                  Tolak (jadi PENDING)
                </button>

                <button className="revision" onClick={handleNeedRevision} disabled={!activeItem}>
                  Minta Revisi (PROGRESS)
                </button>

                <button className="revision" onClick={handleMarkInReview} disabled={!activeItem}>
                  Tandai Diperiksa (PROGRESS)
                </button>

                <button
                  className="approve"
                  onClick={handleApproveAll}
                  disabled={!selectedGroup.length || approvingAll}
                  title="Setujui semua berkas pada nama ini (maks 10)"
                >
                  {approvingAll ? "Memproses semua..." : `Setujui Semua (${selectedGroup.length})`}
                </button>

                {!!activeItem?.stampedPdfUrl && (
                  <a href={activeItem.stampedPdfUrl} download={`${activeItem.id}-stamped.pdf`}>
                    <button type="button" className="download">Unduh PDF Bertanda (aktif)</button>
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
          {!activity.length && <li className="text-sm" style={{ opacity: 0.6 }}>Belum ada aktivitas</li>}
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
