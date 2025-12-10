export function buildSurveyHtmlClient(vv, { filePages = [], tableRows = "" } = {}) {
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
  const petugasSrc = vv.petugasTtd || null;

  const toPublicUrl = (fotoObj) => {
    if (!fotoObj) return "";

    // 1) kalau string langsung
    if (typeof fotoObj === "string") {
      const s = fotoObj.trim();
      if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
      // kalau string cuma filename, lanjut ke bawah
      fotoObj = { fileName: s };
    }

    // 2) prioritas url/dataURL yang udah jadi
    const direct =
      (fotoObj.url || fotoObj.dataURL || fotoObj.publicUrl || "").toString().trim();

    if (direct && (/^https?:\/\//i.test(direct) || /^data:image\//i.test(direct))) {
      return direct;
    }

    // 3) ambil filename/path
    let fn = (fotoObj.fileName || fotoObj.path || fotoObj.name || "")
      .toString()
      .trim();

    if (!fn) return "";

    // 4) kalau filename ternyata URL juga → pakai aja
    if (/^https?:\/\//i.test(fn) || /^data:image\//i.test(fn)) return fn;

    // 5) bersihin prefix folder biar ga dobel
    fn = fn.replace(/^\/?sumber-informasi\//i, "");

    // 6) encode per segment (biar spasi dll aman)
    const safePath = fn
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const fullPath = `sumber-informasi/${safePath}`;

    try {
      const { data } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(fullPath);

      return data?.publicUrl || "";
    } catch (e) {
      console.log("❌ toPublicUrl error:", e);
      return "";
    }
  };

  const autoTableRows =
    Array.isArray(vv.sumbers) && vv.sumbers.length
      ? vv.sumbers.map((r, i) => {
          const fotos = Array.isArray(r.foto) ? r.foto : (r.foto ? [r.foto] : []);
          const fotoHtml = fotos
            .map((f) => {
              const src = toPublicUrl(f);
              console.log("🧪 sumber foto src =", src, "raw =", f);
              if (!src) return "";
              return `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;" />`;
            })
            .join("");

          return `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td>${escapeHtml(r.identitas || "")}</td>
              <td>${fotoHtml || ""}</td>
            </tr>
          `;
        }).join("")
      : "";

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

  .lampiran-page{
    page-break-after: always;
    display:flex; align-items:center; justify-content:center;
    margin-top: 6mm; padding: 0; height: auto;
  }
  .lampiran-page:last-child{ page-break-after: auto; }
  .lampiran-img{ width: 100%; height: auto; max-height: 250mm; object-fit: contain; }
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
    <div class="value">${escapeHtml(vv.petugas || "")}</div>
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
    <div class="value">${escapeHtml(vv.korban || "")}</div>
    <div></div>
    <div class="label">No. Berkas</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.noBerkas || "")}</div>
  </div>

  <div class="row single">
    <div class="label">Alamat Korban</div><div class="colon">:</div>
    <div class="value">${escapeHtml(vv.alamatKorban || "")}</div>
  </div>

  <div class="row single">
    <div class="label">Tempat/Tgl. Kecelakaan</div><div class="colon">:</div>
    <div class="value">
      ${escapeHtml(vv.tempatKecelakaan || "")} / ${escapeHtml(fmtDate(vv.tglKecelakaan))}
    </div>
  </div>

  <div style="margin-top:2mm;">
    <span class="label">Kesesuaian hubungan Ahli Waris dengan Korban:</span>
    &nbsp;&nbsp;
    <b>${vv.hubunganSesuai === "" ? "-" : vv.hubunganSesuai ? "Sesuai" : "Tidak Sesuai"}</b>
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
      ${tableRows || autoTableRows || '<tr><td style="text-align:center">1</td><td></td><td></td></tr>'}
    </tbody>
  </table>

  <div style="margin-top:2mm;font-weight:bold;">Uraian dan Kesimpulan Hasil Survei :</div>
  <div class="box">${escapeHtml(vv.uraian || "")}</div>

  <p style="margin-top:4mm;">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </p>

  <div class="signs">
    <div class="sign-col">
      <div>Mengetahui,</div>
      <div class="sign-space"></div>
      <div class="sign-name">Andi Raharja</div>
      <div>Kepala Bagian Operasional</div>
    </div>

    <div class="sign-col">
      <div>Petugas Survei,</div>
      <div class="sign-space">
        ${petugasSrc ? `<img class="sign-img" src="${petugasSrc}" />` : ""}
      </div>
      <div class="sign-name">${escapeHtml(vv.petugas || "..............................")}</div>
      <div>${escapeHtml(vv.petugasJabatan || "")}</div>
    </div>
  </div>

  ${filePages.join("")}

</body>
</html>`;
}
