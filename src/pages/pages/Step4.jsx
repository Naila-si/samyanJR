import React, { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "react-hot-toast";
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs";

export default function Step4({ data, setData, back, next }) {
  const [att, setAtt] = useState(data.attachSurvey || {});
  const [surveyStatus, setSurveyStatus] = useState([]);
  const [hasDownloadedPDF, setHasDownloadedPDF] = useState(false);
  const [mlResult, setMlResult] = useState({
    foto: "❌ Belum unggah",
    korban: "❌ Belum isi",
    lokasi: "❌ Belum isi",
    rumahSakit: "❌ Belum isi",
    uraian: "❌ Belum isi",
    rekomendasi: "❌ Belum isi",
  });
  const semuaBenar =
    mlResult &&
    Object.values(mlResult).every(
      (v) =>
        v === true ||
        (typeof v === "string" && (v.includes("✔") || v.includes("✅")))
    );

  // 🧩 Sinkronisasi lampiran ke data global
  useEffect(() => {
    setData?.({ ...data, attachSurvey: att });
  }, [att]);

  useEffect(() => {
    console.log("Step4 data:", data);
    console.log("🔍 Data dikirim ke checkForm:", data);
    checkForm(data);
  }, [data]);

  // 🧠 Logika utama penentuan status survey / ML
  useEffect(() => {
    if (!data) return;

    if (data.isSurvey) {
      const jenis = data.sifatCidera?.toUpperCase();
      if (jenis === "LL" || jenis === "LUKA-LUKA") {
        setSurveyStatus(surveyLLCompleteDetails(data));
      } else if (jenis === "MD" || jenis === "MENINGGAL DUNIA") {
        setSurveyStatus(surveyMDComplete(data));
      }
    } else {
      const result = checkForm(data);
      setMlResult(result);
    }
  }, [data]);

  // 1) status LL berdasar surveyStatus
  const dokumenOkLL =
    Array.isArray(surveyStatus) &&
    surveyStatus.length > 0 &&
    surveyStatus.every((x) => String(x.status).startsWith("✅"));

  // 2) status MD berdasar surveyStatus (kamu filter foto kalau mau)
  const dokumenOkMD =
    Array.isArray(surveyStatus) &&
    surveyStatus.length > 0 &&
    surveyStatus
      .filter((x) => x.key !== "fotoSurveyList")
      .every(
        (x) =>
          typeof x.status === "string" &&
          (x.status.includes("✔") || x.status.includes("✅"))
      );

  // 3) flag umum untuk render tombol/pesan
  const dokumenOk =
    data.isSurvey &&
    (
      (data.sifatCidera?.toUpperCase() === "MD" && dokumenOkMD) ||
      ((data.sifatCidera?.toUpperCase() === "LL" || data.sifatCidera?.toUpperCase() === "LUKA-LUKA") && dokumenOkLL)
    );

  // ✅ Versi aman & fleksibel
  async function uploadFotoToStorage(supabase, fileOrDataUrl, folder = "foto-survey") {
    const BUCKET_NAME = "foto-survey"; 

    // 0) Kalau sudah URL http(s), langsung kembalikan
    if (typeof fileOrDataUrl === "string" && /^https?:\/\//.test(fileOrDataUrl)) {
      return fileOrDataUrl;
    }

    // 1) Normalisasi input -> dapatkan body (Blob/File/Uint8Array), contentType, ext
    let body; 
    let contentType = "application/octet-stream";
    let ext = "bin";

    // a) Data URL (base64)
    if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
      const [header, base64] = fileOrDataUrl.split(",");
      const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
      contentType = mime;
      ext = mime.split("/")[1] || "jpg";

      // atob di browser; kalau Node/React Native, ganti dengan Buffer.from(base64, 'base64')
      const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
      const len = binary.length;
      const u8 = new Uint8Array(len);
      for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
      body = u8;

    // b) File / Blob
    } else if (typeof File !== "undefined" && fileOrDataUrl instanceof File) {
      body = fileOrDataUrl;
      contentType = fileOrDataUrl.type || "application/octet-stream";
      const name = fileOrDataUrl.name || "";
      ext = (name.split(".").pop() || (contentType.split("/")[1] || "bin")).toLowerCase();

    // c) { file: File } (beberapa komponen upload bungkus begini)
    } else if (fileOrDataUrl?.file && typeof File !== "undefined" && fileOrDataUrl.file instanceof File) {
      const f = fileOrDataUrl.file;
      body = f;
      contentType = f.type || "application/octet-stream";
      const name = f.name || "";
      ext = (name.split(".").pop() || (contentType.split("/")[1] || "bin")).toLowerCase();

    } else {
      console.warn("Format foto tidak dikenal:", fileOrDataUrl);
      return null;
    }

    // 2) Buat path unik. Jangan pakai leading slash.
    const safeFolder = folder.replace(/^\/+|\/+$/g, "");
    const filePath = `${safeFolder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    // 3) Upload ke bucket yang benar
    const { error: uploadError } = await supabase
      .storage
      .from("foto-survey")              
      .upload(filePath, body, {
        contentType,                  
        // upsert: true,              // aktifkan jika ingin overwrite path yang sama
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    // 4) Ambil URL
    //    - Jika bucket Public: getPublicUrl bisa dipakai.
    //    - Jika bucket Private: gunakan createSignedUrl (contoh di bawah).
    const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    const publicUrl = pub?.publicUrl;

    if (publicUrl) return publicUrl;

    // (Opsional) Kalau bucket private, generate signed URL 1 jam:
    const { data: signed, error: signErr } = await supabase
      .storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 60 * 60);
    if (signErr) throw signErr;
    return signed?.signedUrl || null;
  }

  // 🖨️ Fungsi Download / Cetak HTML (versi Kunjungan RS)
  async function saveKunjunganToSupabase(data) {
    try {
      // 1) Upload semua foto -> jadi array URL
      const fotoSurveyList = Array.isArray(data.fotoSurveyList) ? data.fotoSurveyList : [];
      const uploadedUrls = [];
      for (const f of fotoSurveyList) {
        const url = await uploadFotoToStorage(supabase, f, "foto-survey");
        if (url) uploadedUrls.push({ name: f?.name || "f", url });
      }

      // 2) Upload TTD kalau masih dataURL
      let ttdUrl = data.petugasTtd;
      if (ttdUrl && typeof ttdUrl === "string" && ttdUrl.startsWith("data:")) {
        ttdUrl = await uploadFotoToStorage(supabase, ttdUrl, "ttd-petugas");
      }

      // 3) Normalisasi tanggal (kalau masih Date)
      const toIso = (v) =>
        v instanceof Date ? v.toISOString() : (typeof v === "string" ? v : null);

      const payload = {
        petugas: data.petugas,
        petugas_jabatan: "Petugas Pelayanan",
        wilayah: data.wilayah,
        korban: data.korban,
        rumah_sakit: data.rumahSakit,
        lokasi_kecelakaan: data.lokasiKecelakaan,
        tanggal_kecelakaan: toIso(data.tanggalKecelakaan),
        tgl_masuk_rs: toIso(data.tglMasukRS),
        tgl_jam_notifikasi: toIso(data.tglJamNotifikasi),
        tgl_jam_kunjungan: toIso(data.tglJamKunjungan),
        uraian: data.uraianKunjungan,
        rekomendasi: data.rekomendasi,
        petugas_ttd: ttdUrl || null,
        foto_survey: uploadedUrls, 
      };

      const { data: inserted, error } = await supabase
        .from("form_kunjungan_rs")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Tersimpan ke Supabase:", inserted);
      return inserted.id;
    } catch (err) {
      console.error("❌ Gagal simpan Supabase:", err?.message || err);
      toast.error(`Gagal menyimpan data ke Supabase: ${err?.message || ""}`);
      return null;
    }
  }

  const openPrint = async () => {
    try {
      const vv = await prepareForOutput(data);
      const fotoList = vv.allPhotos || [];

      // Ambil foto-foto upload (kalau ada)
      const fotosHTML = fotoList.length
        ? fotoList
            .map(
              (f) => `
          <div style="margin:5px; text-align:center;">
            <img src="${f.dataURL}" alt="${f.name}" style="max-width:230px; max-height:230px; border:1px solid #999; border-radius:8px; margin:5px;"/>
            <div style="font-size:12px;">${f.name}</div>
          </div>`
            )
            .join("")
        : "<i>Tidak ada foto dilampirkan.</i>";

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      const petugasSrc = vv.petugasTtd || null;

      // === HTML TEMPLATE ===
      const srcdoc = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
    <meta charset="UTF-8">
    <title>LaporanKunjungan_${vv.korban || "Anon"}</title>
    <style>
      body {
        font-family: "Times New Roman", serif;
        background: #111;
        color: white;
        padding: 30px;
        line-height: 1.5;
      }
      .judul {
        text-align: center;
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        font-size: 14px;
      }
      td { padding: 4px 8px; vertical-align: top; }
      .label { width: 220px; color: rgba(0, 0, 0, 1); }
      .box {
        border: 1px solid #000000ff;
        padding: 8px;
        min-height: 100px;
        margin-top: 6px;
      }
      .foto-container {
        display: flex;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .ttd {
        margin-top: 40px;
        display: flex;
        justify-content: space-between;
        font-size: 14px;
      }
      .sign-img{ max-height:80px; max-width:260px; display:block; margin-top:8px; }
    </style>
    </head>
    <body>
      <div class="judul">
        LEMBAR HASIL CETAK KUNJUNGAN KE RUMAH SAKIT <br/>
        APLIKASI MOBILE PELAYANAN
      </div>

      <table>
        <tr><td class="label">NPP / Nama Petugas</td><td>: ${
          vv.petugas || "-"
        }</td></tr>
        <tr><td class="label">Loket Kantor / Wilayah</td><td>: ${
          vv.wilayah || "-"
        }</td></tr>
        <tr><td class="label">Nama Korban</td><td>: ${
          vv.korban || "-"
        }</td></tr>
        <tr><td class="label">Lokasi Kecelakaan</td><td>: ${
          vv.lokasiKecelakaan || "-"
        }</td></tr>
        <tr><td class="label">Kode RS / Nama RS</td><td>: ${
          vv.rumahSakit || "-"
        }</td></tr>
        <tr><td class="label">Tanggal Kecelakaan</td><td>: ${
          vv.tglKecelakaan || "-"
        }</td></tr>
        <tr><td class="label">Tanggal Masuk RS</td><td>: ${
          vv.tglMasukRS || "-"
        }</td></tr>
        <tr><td class="label">Tanggal & Jam Notifikasi</td><td>: ${
          vv.tglJamNotifikasi || "-"
        }</td></tr>
        <tr><td class="label">Tanggal & Jam Kunjungan</td><td>: ${
          vv.tglJamKunjungan || "-"
        }</td></tr>
      </table>

      <h4 style="color:#f55;margin-top:20px;">Uraian Hasil Kunjungan:</h4>
      <div class="box">${vv.uraianKunjungan || "<i>Belum diisi.</i>"}</div>

      <h4 style="color:#f55;margin-top:20px;">Rekomendasi / Kesimpulan:</h4>
      <div class="box">${vv.rekomendasi || "<i>Belum diisi.</i>"}</div>

      <p style="margin-top:10px;">
        Demikian laporan hasil kunjungan ke Rumah Sakit ini kami buat dengan sebenarnya sesuai dengan informasi yang kami peroleh.
      </p>

      <div class="ttd">
        <div>
          Mengetahui,<br/><br/><br/>
          <b>Andi Raharja, S.A.B</b><br/>
          <i>Kepala Bagian Operasional</i>
        </div>
        <div>
          Petugas yang melakukan kunjungan,<br/>
          ${petugasSrc ? `<img class="sign-img" src="${petugasSrc}" />` : "<br/><br/><br/>"}
          <b>${vv.petugas || "................................"}</b><br/>
          <i>${vv.petugasJabatan || ""}</i>
        </div>
      </div>

      <div class="foto-container">${fotosHTML}</div>
    </body>
    </html>
    `;

      // === Buat blob dari HTML ===
      const blob = new Blob([srcdoc], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      // === Simpan hasil ke form global
      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanKunjungan_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Kunjungan RS",
        },
      }));

      // === Cetak via iframe ===
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentDocument.title = `LaporanKunjungan_${safeName}`;
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (err) {
          console.error("Gagal print:", err);
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }
      };
      setHasDownloadedPDF(true);
      setData((prev) => ({ ...prev, sudahDownloadPDF: true }));
    } catch (err) {
      console.error("Gagal openPrint:", err);
    }
  };

  async function checkForm(data) {
    const result = {};
    const getVal = (v) => (typeof v === "string" ? v.trim() : v ?? "");

    const val = {
      foto: getVal(data.fotoSurveyList?.[0]),
      korban: getVal(data.korban),
      lokasi: getVal(data.lokasiKecelakaan),
      rumahSakit: getVal(data.rumahSakit),
      uraian: getVal(data.uraianKunjungan),
      rekomendasi: getVal(data.rekomendasi),
    };

    const isNonsense = (text) => {
      if (!text) return true;
      const lower = text.toLowerCase();

      // Kalau terlalu banyak huruf sama berulang (contoh: kkkkkkkk)
      if (/(.)\1{4,}/.test(lower)) { 
        console.log("⚠️ Nonsense karena huruf berulang"); 
        return true;
      }

      // Kalau tidak ada spasi dan panjangnya lebih dari 25
      if (!lower.includes(" ") && lower.length > 25) {
        console.log("⚠️ Nonsense karena tidak ada spasi dan panjang");
        return true;
      }

      // Kalau terlalu sedikit huruf vokal dibanding konsonan
      const vowels = (lower.match(/[aiueo]/g) || []).length;
      const ratio = vowels / lower.length;
      if (ratio < 0.3) {
        console.log("⚠️ Nonsense karena kekurangan vokal", ratio);
        return true;
      }

      // Kalau semua huruf random tanpa kata umum
      const commonWords = ["dan", "di", "ke", "yang", "untuk", "dengan", "karena"];
      const hasCommon = commonWords.some((w) => lower.includes(w));
      if (!hasCommon && lower.split(" ").length < 3) {
        console.log("⚠️ Nonsense karena kata terlalu sedikit atau tanpa kata umum");
        return true;
      }

      console.log("✅ Teks dianggap bermakna");
      return false;
    };

    const validLokasi = (text) => {
      if (!text) return false;
      const words = text.trim().split(/\s+/);
      if (words.length < 3) return false;
      const hasClue = /(jalan|jl\.|dekat|simpang|gedung|rumah|desa|kelurahan|kecamatan)/i.test(text);
      return hasClue;
    };

    console.log("🧩 Nilai akhir yang dicek:", val);

    // Foto
    if (!val.foto) result.foto = "❌ Belum unggah";
    else if (["clear", "baik", "jelas"].includes((data.fotoQuality || "").toLowerCase()))
      result.foto = "✅ Foto jelas";
    else result.foto = " ✅ Foto terlihat (tidak ada info kualitas)";

    // Nama Korban
    if (!val.korban) result.korban = "❌ Belum isi";
    else if (/\b(dr|mr|mrs|ir|s\.t|s\.kom)\b/i.test(val.korban))
      result.korban = "❌ Nama korban tidak boleh ada gelar";
    else result.korban = "✅ Nama korban sesuai ketentuan";

    // Lokasi
    if (!val.lokasi) result.lokasi = "❌ Belum isi";
    else if (!validLokasi(val.lokasi))
      result.lokasi = "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
    else result.lokasi = "✅ Lokasi lengkap";

    // Rumah Sakit
    if (!val.rumahSakit) result.rumahSakit = "❌ Belum isi";
    else if (val.rumahSakit !== val.rumahSakit.toUpperCase())
      result.rumahSakit = "❌ Nama RS tidak kapital semua";
    else result.rumahSakit = "✅ Nama RS kapital semua";

    // Uraian
    if (!val.uraian) result.uraian = "❌ Belum isi";
    else if (val.uraian.length < 20) result.uraian = "❌ Uraian terlalu singkat";
    else if (isNonsense(val.uraian)) result.uraian = "❌ Uraian tidak bermakna";
    else if (val.uraian.includes("sesuai ketentuan"))
      result.uraian = "✅ Uraian sesuai ketentuan";
    else result.uraian = "✅ Uraian deskriptif";

    // Rekomendasi
    if (!val.rekomendasi) result.rekomendasi = "❌ Belum isi";
    else if (val.rekomendasi.length < 15)
      result.rekomendasi = "❌ Rekomendasi terlalu pendek";
    else if (isNonsense(val.rekomendasi))
      result.rekomendasi = "❌ Rekomendasi tidak bermakna";
    else if (val.rekomendasi.includes("direkomendasikan"))
      result.rekomendasi = "✅ Rekomendasi sesuai ketentuan";
    else result.rekomendasi = "✅ Rekomendasi jelas";

    console.log("✅ Hasil akhir result:", result);
    setMlResult(result);
    setData((prev) => ({ ...prev, mlResult: result }));
    const allValid = Object.values(result).every(v => v.startsWith("✅"));
    if (allValid) {
      console.log("🎉 Semua hasil valid, simpan ke Supabase...");
      const savedId = await saveKunjunganToSupabase(data);
      if (savedId) {
        setData(prev => ({ ...prev, formSavedId: savedId }));
      }
    }
    return result;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  async function pdfToImages(file) {
    const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/png"));
    }
    return images;
  }

  async function saveSurveyToSupabase(raw) {
    const toISODate = (d) => {
      if (!d) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d);
      const t = new Date(d);
      return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
    };

    const sifat = String(raw.sifatCidera || '').toLowerCase().includes('md') ? 'meninggal' : 'luka';
    const jenisSurvei = typeof raw.jenisSurvei === 'string'
      ? raw.jenisSurvei.replace('keabsahan_waris','keabsahan_ahli_waris')
      : null;

    // ⚠️ gunakan nama kolom yang terlihat di screenshot:
    const payload = {
      no_pl:               raw.noPL || null,
      hari_tanggal:        toISODate(raw.hariTanggal || raw.tanggalKecelakaan) || null,
      petugas:             raw.petugas || raw.petugasSurvei || null,

      jenis_survei:        jenisSurvei,                         // text (bukan enum)
      jenis_lainnya:       jenisSurvei ? null : (raw.jenisSurveiLainnya || null),

      nama_korban:         raw.korban || raw.namaKorban || null,
      no_berkas:           raw.noBerkas || null,
      alamat_korban:       raw.alamatKorban || null,
      tempat_kecelakaan:        raw.tempatKecelakaan || raw.lokasiKecelakaan || null,   // <── beda nama
      tanggal_kecelakaan:       toISODate(raw.tanggalKecelakaan || raw.tglKecelakaan) || null, // <── beda nama
      hubungan_sesuai:        (typeof raw.hubunganSesuai === 'boolean') ? raw.hubunganSesuai : null, // <── beda nama

      sifat,               // text
      uraian:              raw.uraian ?? raw.uraianSurvei ?? raw.uraianKunjungan ?? null,
      kesimpulan:          raw.kesimpulanSurvei ?? null,

      // kolom ini ADA & jsonb → aman dipakai
      attachments: {
        ktp: !!raw.attachSurvey?.ktp,
        kk: !!raw.attachSurvey?.kk,
        buku_tabungan: !!raw.attachSurvey?.bukuTabungan,
        form_pengajuan_santunan: !!raw.attachSurvey?.formPengajuan,
        form_keterangan_ahli_waris: !!raw.attachSurvey?.formKeteranganAW,
        surat_keterangan_kematian: !!raw.attachSurvey?.skKematian,
        akta_kelahiran: !!raw.attachSurvey?.aktaKelahiran,
        map_ss: !!raw.attachSurvey?.mapSS,
        barcode_qr: !!raw.attachSurvey?.barcode,
        foto_survey_count: Array.isArray(raw.fotoSurveyList)
          ? raw.fotoSurveyList.length
          : Array.isArray(raw.attachSurvey?.fotoSurvey)
          ? raw.attachSurvey.fotoSurvey.length
          : 0,
      },
    };

    try {
      const { data: inserted, error } = await supabase
        .from('form_survei_aw')
        .insert(payload, { returning: 'representation' })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Survei tersimpan:', inserted);
      return inserted?.id ?? null;
    } catch (err) {
      const msg = [
        err?.message,
        err?.details && `details: ${err.details}`,
        err?.hint && `hint: ${err.hint}`,
        err?.code && `code: ${err.code}`,
      ].filter(Boolean).join(' | ');
      console.error('❌ Gagal simpan survei:', err);
      toast.error(`Gagal menyimpan data survei. ${msg}`);
      return null;
    }
  }

  // 🖨️ Fungsi Download / Cetak HTML (Versi Survey - Meninggal Dunia)
  const surveyMDComplete = (data) => {
    if (!data) return [];

    const v = data.v || data.form || data.survey || data.korban || data || {};

    const namaKorban =
      v.namaKorban ||
      v.korbanNama ||
      v.nama ||
      data.namaKorban ||
      data.korbanNama ||
      data.korban?.nama ||
      data.korban?.namaKorban ||
      data.form?.namaKorban ||
      data.survey?.namaKorban ||
      data.v?.namaKorban ||
      data.korban ||
      "";

    const tempatKecelakaan =
      v.tempatKecelakaan ||
      data.tempatKecelakaan ||
      data.lokasiKecelakaan ||
      data.kecelakaan?.tempat ||
      "";

    const att = data.attachSurvey || {};
    const result = {};

    const isFilled = (v) => !!(v && String(v).trim() !== "");

    // --- VALIDASI FILE WAJIB ---
    const wajibFiles = [
      "ktp",
      "kk",
      "bukuTabungan",
      "formPengajuan",
      "formKeteranganAW",
      "skKematian",
      "aktaKelahiran",
      "fotoSurvey",
    ];

    const labelMap = {
      ktp: "KTP",
      kk: "Kartu Keluarga",
      bukuTabungan: "Buku Tabungan",
      formPengajuan: "Form Pengajuan",
      formKeteranganAW: "Form Keterangan Ahli Waris",
      skKematian: "Surat Keterangan Kematian",
      aktaKelahiran: "Akta Kelahiran",
      fotoSurvey: "Foto Survei",
      namaKorban: "Nama Korban",
      alamatKorban: "Alamat Korban",
      tempatKecelakaan: "Tempat Kecelakaan",
      uraian: "Uraian & Kesimpulan",
    };

    wajibFiles.forEach((key) => {
      if (key === "fotoSurvey") {
        const list =
          Array.isArray(att.fotoSurvey) && att.fotoSurvey.length > 0
            ? att.fotoSurvey
            : Array.isArray(data.fotoSurveyList)
            ? data.fotoSurveyList
            : [];
        result[key] = list.length > 0 ? "✅ File sudah terunggah" : "❌ Belum unggah";
      } else {
        result[key] = att[key] ? "✅ File sudah terunggah" : "❌ Belum unggah";
      }
    });

    // --- VALIDASI TEKS ---
    const validLokasi = (text) => {
      if (!text) return false;
      const t = text.trim();
      if (t.length < 5) return false;

      // Deteksi koordinat decimal: -?DDD.DDDD, -?DDD.DDDD (contoh: 0.519822, 101.438505)
      const coordRe = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;

      // Kata kunci alamat / landmark / singkatan umum
      const keywords = [
        'jalan', 'jl', 'jl\\.', 'depan', 'seberang', 'sebelah', 'di depan', 'dekat',
        'simpang', 'persimpangan', 'plaza', 'mal', 'masjid', 'halte', 'ruko', 'stasiun',
        'terminal', 'rumah sakit', 'rs', 'puskesmas', 'minimarket', 'toko', 'bank',
        'kelurahan', 'kel\\.', 'kecamatan', 'kec\\.', 'kota', 'rt', 'rw'
      ];
      const keywordRe = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');

      // Valid jika ada koordinat OR ada kata kunci alamat (dan minimal 3 kata)
      if (coordRe.test(t)) return true;
      if (keywordRe.test(t) && t.split(/\s+/).length >= 3) return true;

      return false;
    };

    // Nama Korban
    if (!namaKorban) result.namaKorban = "❌ Belum isi";
    else if (/\b(dr|mr|mrs|ir|s.t|s.kom)\b/i.test(namaKorban))
      result.namaKorban = "❌ Nama korban tidak boleh ada gelar";
    else result.namaKorban = "✅ Nama korban sesuai ketentuan";

    // Alamat Korban
    if (!data.alamatKorban) result.alamatKorban = "❌ Belum isi";
    else if (!validLokasi(data.alamatKorban))
      result.alamatKorban = "❌ Alamat belum cukup detail (tambahkan RT/RW atau area)";
    else result.alamatKorban = "✅ Alamat lengkap";

    // Lokasi Kecelakaan
    if (!tempatKecelakaan) result.tempatKecelakaan = "❌ Belum isi";
    else if (!validLokasi(tempatKecelakaan))
      result.tempatKecelakaan =
        "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
    else result.tempatKecelakaan = "✅ Lokasi lengkap";

    // --- VALIDASI URAIAN & KESIMPULAN GABUNG ---
    const isi = (data.uraian || "").toLowerCase();

    const regexPlat = /[a-z]{1,2}\s?\d{3,4}\s?[a-z]{0,3}/i;
    const regexLokasi = /(jalan|jl.|simpang|dekat|seberang|kelurahan|kecamatan|kota|gedung|ruko|plaza|masjid)/i;
    const regexKendaraan = /(motor|mobil|truk|bus|angkot|sepeda)/i;
    const regexKronologi = /(menabrak|bertabrakan|terjatuh|terpeleset|terserempet|terlindas|terbentur|diserempet|mendadak|mengerem)/i;
    const regexKesimpulan = /(terjamin|tidak terjamin|dalam pertanggungan|disarankan)/i;

    const uraianCukup =
      isi.length > 50 &&
      regexPlat.test(isi) &&
      regexLokasi.test(isi) &&
      regexKendaraan.test(isi) &&
      regexKronologi.test(isi) &&
      regexKesimpulan.test(isi);

    if (!data.uraian)
      result.uraian = "❌ Belum isi uraian & kesimpulan";
    else if (!uraianCukup)
      result.uraian =
        "❌ Uraian & kesimpulan belum lengkap (harus memuat plat, lokasi, kendaraan, kronologi, dan status terjamin/tidak terjamin)";
    else
      result.uraian = "✅ Uraian & kesimpulan lengkap & informatif";

    const finalArray = Object.entries(result).map(([key, status]) => ({
      key,
      label: labelMap[key] || key,
      status,
    }));

    console.log("🧩 surveyMDComplete (analisis penuh):", finalArray);

    return finalArray;
  };

  const openPrintSurveyMD = async () => {
    try {
      const vv = await prepareForOutput(data);

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

      // helper konversi File ke dataURL
      const toDataURL = (file) =>
        new Promise((resolve) => {
          if (!file) return resolve("");
          if (typeof file === "string") return resolve(file);
          if (file.dataURL) return resolve(file.dataURL);
          if (file.url && file.url.startsWith("data:")) return resolve(file.url);
          if (file.url) return resolve(file.url); // URL publik
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        });

      const renderFotoCell = async (fotoField) => {
        if (!fotoField) return "-";

        const files = Array.isArray(fotoField) ? fotoField : [fotoField];

        const pieces = [];
        for (const f of files) {
          const src = await toDataURL(f);
          if (!src) continue;

          // jika ternyata PDF, tampilkan placeholder teks
          if (src.startsWith("data:application/pdf") || (f?.name || "").endsWith(".pdf")) {
            pieces.push(
              `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`
            );
            continue;
          }

          const isImg = src.startsWith("data:image") || /^https?:/.test(src);
          if (isImg) {
            pieces.push(
              `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;border:0.3mm solid #000;margin:1mm 0" />`
            );
          }
        }

        return pieces.length ? pieces.join("") : "-";
      };

      // === buat halaman per lampiran ===
      const filePages = [];
      if (data.attachSurvey) {
        const order = ["mapSS","barcode"];
        const ordered = [
          ...order.filter(k => k in data.attachSurvey).map(k => [k, data.attachSurvey[k]]),
          ...Object.entries(data.attachSurvey).filter(([k]) => !order.includes(k))
        ];
        for (const [key, file] of ordered) {
          if (!file) continue;
          const files = Array.isArray(file) ? file : [file];

          // 🧩 Tentukan grid & ukuran berdasarkan jumlah file
          const count = files.length;
          let cols = 1;
          let imgWidth = "100%";
          let imgHeight = "270mm";

          // 🩵 Default scaling per jumlah file
          if (count === 2) {
            cols = 2;
            imgWidth = "48%";
            imgHeight = "130mm";
          } else if (count === 3) {
            cols = 2;
            imgWidth = "48%";
            imgHeight = "130mm";
          } else if (count >= 4) {
            cols = 3;
            imgWidth = "31%";
            imgHeight = "90mm";
          }

          const imgsHTML = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const src = await toDataURL(f);
            if (!src) continue;

            // Kalau PDF → ubah ke gambar dulu
            if (
              src.startsWith("data:application/pdf") ||
              (f.name && f.name.endsWith(".pdf"))
            ) {
              try {
                const imgs = await pdfToImages(f);
                imgs.forEach((img, j) => {
                  imgsHTML.push(`
                  <img src="${src}" style="width:${imgWidth}; max-height:${imgHeight}; object-fit:contain; border:0.3mm solid #ccc; margin:4mm auto; display:block;"/>
                `);
                });
                continue;
              } catch (err) {
                console.error(
                  "Gagal convert PDF ke gambar:",
                  f.name || key,
                  err
                );
              }
            }

            // Kalau gambar biasa
            const isImage = src.startsWith("data:image");
            const content = isImage
              ? `<img src="${src}" style="width:${imgWidth}; height:auto; max-height:${imgHeight}; object-fit:contain; border:0.3mm solid #ccc; margin:2mm"/>`
              : `<div style="color:red; font-size:11pt">[File tidak dapat ditampilkan]</div>`;

            imgsHTML.push(content);
          }

          filePages.push(`
          <div style="text-align:center; margin:10mm 0; page-break-inside: avoid;">
            <div style="font-weight:bold; margin-bottom:4mm; page-break-before: always;">
              ${escapeHtml(key)}
            </div>
            <div style="
              display:flex;
              flex-wrap:wrap;
              justify-content:center;
              gap:4mm;
              page-break-inside: avoid;
            ">
              ${imgsHTML.join("")}
            </div>
          </div>
        `);
        }
      }
   
      const tableRowsParts = [];
      for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
        const r = vv.sumbers[i] || {};
        const fotoCell = await renderFotoCell(r.foto); // ⬅️ ambil foto dari tiap baris

        tableRowsParts.push(`
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${escapeHtml(r.identitas || "")}</td>
            <td>${fotoCell}</td>
          </tr>
        `);
      }
      const tableRows = tableRowsParts.join("");

      const petugasSrc = vv.petugasTtd || null;

      const htmlMain = 
      `<!DOCTYPE html>
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
      .sign-img{ max-height:28mm; max-width:80mm; display:block; }
      </style>
      </head>
      <body>
      <h1>LAPORAN HASIL SURVEI</h1>
      <h2>APLIKASI MOBILE PELAYANAN</h2>

      <div class="kv">
        <div>No. PL</div><div>:</div><div>${escapeHtml(vv.noPL || "-")}</div>
        <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(
          fmtDate(vv.hariTanggal)
        )}</div>
        <div>Petugas Survei</div><div>:</div><div>${escapeHtml(
          vv.petugas || "-"
        )}</div>
        <div>Jenis Survei</div><div>:</div><div>${escapeHtml(
          vv.jenisSurvei || "-"
        )}</div>
        <div>Nama Korban</div><div>:</div><div>${escapeHtml(vv.korban || "-")}</div>
        <div>No. Berkas</div><div>:</div><div>${escapeHtml(vv.noBerkas || "-")}</div>
        <div>Alamat Korban</div><div>:</div><div>${escapeHtml(
          vv.alamatKorban || "-"
        )}</div>
        <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(
          vv.tempatKecelakaan || "-"
        )} / ${escapeHtml(fmtDate(vv.tglKecelakaan))}</div>
        <div>Kesesuaian Hubungan AW</div><div>:</div><div>${
          vv.hubunganSesuai === ""
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
        <tbody>${
          tableRows ||
          '<tr><td style="text-align:center">1</td><td></td><td>-</td></tr>'
        }</tbody>
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
          <div class="space">${petugasSrc ? `<img class="sign-img" src="${petugasSrc}" />` : ""}</div>
          <div class="name">${escapeHtml(
            vv.petugas || "........................................"
          )}</div>
          <div>${escapeHtml(vv.petugasJabatan || "")}</div>
        </div>
      </div>

      ${filePages.join("")}

      </body></html>`;
    
      const safeHtml =
        typeof htmlMain === "string" ? htmlMain : String(htmlMain || "");
      const blob = new Blob([safeHtml], { type: "text/html" });
      if (!blob) throw new Error("Blob tidak terbentuk");
      const url = window.URL.createObjectURL(blob);

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanSurvey_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Survei Ahli Waris (MD)",
        },
      }));

      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentDocument.title = `LaporanSurvey_${safeName}`;
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (err) {
          console.error("Gagal print:", err);
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }
      };

      setHasDownloadedPDF(true);
      setData((prev) => ({ ...prev, sudahDownloadPDF: true }));
    } catch (err) {
      console.error("Gagal openPrintSurveyMD:", err);
    }
  };

  // 🖨️ Fungsi Download / Cetak HTML (Versi Survey - Luka-Luka)
  const openPrintSurveyLL = async () => {
    try {
      const vv = await prepareForOutput(data);
      const fotoListSafe = typeof fotoList !== "undefined" ? fotoList : [];

      const escapeHtml = (str = "") =>
        String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const fotoSources =
        vv.fotoSurvey && vv.fotoSurvey.length
          ? vv.fotoSurvey
          : data.attachSurvey?.fotoSurvey && data.attachSurvey.fotoSurvey.length
          ? data.attachSurvey.fotoSurvey
          : data.fotoSurveyList && data.fotoSurveyList.length
          ? data.fotoSurveyList
          : [];

      console.log("🖼️ fotoSources:", fotoSources);

      const convertToDataURL = (file) =>
        new Promise((resolve) => {
          if (!file) return resolve(null);
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });

      const fotos = await Promise.all(
        (fotoSources || []).map(async (f) => {
          if (typeof f === "string") return { url: f, name: "foto" };
          if (f instanceof Blob) return { url: await convertToDataURL(f), name: f.name || "foto" };
          let url = f?.url || f?.dataURL;
          if (!url && f?.file instanceof Blob) url = await convertToDataURL(f.file);
          return { ...f, url, name: f?.name || f?.file?.name || "foto" };
        })
      );

      console.log("🖼️ fotos setelah base64:", fotos);

      const imgsHTML = fotos
        .filter((x) => !!x.url)
        .map(
          (x) =>
            `<img src="${x.url}" alt="${escapeHtml(
              x.name
            )}" style="max-width:45%; margin:2mm; page-break-inside: avoid;" />`
        )
        .join("");

      console.log("🧩 fotoListSafe:", fotoListSafe);
      console.log("🖼️ fotoSources:", fotoSources);

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

      const toSrcList = async (fotoField) => {
        if (!fotoField) return [];
        const list = Array.isArray(fotoField) ? fotoField : [fotoField];

        const resolveOne = async (item) => {
          // string dataURL atau URL publik
          if (typeof item === "string") return item;
          // objek dengan dataURL/url
          if (item?.dataURL) return item.dataURL;
          if (item?.url) return item.url;
          // File/Blob
          if (item instanceof Blob || item?.file instanceof Blob) {
            const blob = item instanceof Blob ? item : item.file;
            return await convertToDataURL(blob);
          }
          return "";
        };

        const results = await Promise.all(list.map(resolveOne));
        // filter kosong & PDF (kita skip preview PDF di sel; tampilkan label teks)
        return results.filter(Boolean);
      };

      const renderFotoCell = async (fotoField) => {
        const srcs = await toSrcList(fotoField);
        if (!srcs.length) return "-";

        const pieces = srcs.map((src) => {
          const isPdf =
            src.startsWith("data:application/pdf") ||
            /\.pdf(\?|$)/i.test(src);
          if (isPdf) {
            return `<div style="font-size:10pt;color:#a00;margin:2mm 0">[PDF tidak bisa dipratinjau]</div>`;
          }
          return `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;border:0.3mm solid #000;margin:1mm 0" />`;
        });

        return pieces.join("");
      };

      const tableRowsParts = [];
        for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
          const r = vv.sumbers[i] || {};
          const fotoCell = await renderFotoCell(r.foto); 
          tableRowsParts.push(`
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td>${escapeHtml(r.identitas || "")}</td>
              <td>${fotoCell}</td>
            </tr>
          `);
        }
        const tableRows =
          tableRowsParts.join("") ||
          '<tr><td style="text-align:center">1</td><td></td><td>-</td></tr>';

        const petugasSrc = vv.petugasTtd || null;
      
      const mapSrc = data.attachSurvey?.mapSS?.url || "";
      const qrSrc  = data.attachSurvey?.barcode?.url || "";

      const lampiranHTML = `
        <div style="page-break-before:always"></div>
        <h1 style="text-align:left;font-size:16pt;margin:0 0 6mm">Lampiran</h1>
        <div style="display:grid;grid-template-columns:2fr 1.1fr;gap:6mm;align-items:start">
          <div>
            ${mapSrc ? `<img src="${mapSrc}" style="width:100%;height:auto;border:0.3mm solid #000;border-radius:2mm" />` : `<div style="height:80mm;border:0.3mm solid #000;border-radius:2mm"></div>`}
          </div>
          <div style="display:grid;grid-template-rows:auto auto;row-gap:6mm">
            <div>
              ${fotos?.[0]?.url ? `<img src="${fotos[0].url}" style="width:100%;height:auto;border:0.3mm solid #000;border-radius:2mm" />` : `<div style="height:46mm;border:0.3mm solid #000;border-radius:2mm"></div>`}
            </div>
            <div style="justify-self:center">
              ${qrSrc ? `<img src="${qrSrc}" style="width:42mm;height:42mm;border:0.3mm solid #000;border-radius:2mm;padding:2mm" />` : `<div style="width:42mm;height:42mm;border:0.3mm solid #000;border-radius:2mm"></div>`}
            </div>
          </div>
        </div>
        ${fotos.length > 1 ? `
          <div style="margin-top:6mm;display:flex;flex-wrap:wrap;gap:4mm">
            ${fotos.slice(1).map(x => `<img src="${x.url}" style="height:38mm;border:0.3mm solid #000;border-radius:2mm" />`).join("")}
          </div>` : ""}
      `;

      const srcdoc = 
      `<!DOCTYPE html><html><head><meta charset="utf-8"/>
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
      .sign-img{ max-height: 28mm }
      .name{ font-weight:bold; text-decoration:underline; }
      </style></head><body>
      <h1>LAPORAN HASIL SURVEI</h1>
      <h2>APLIKASI MOBILE PELAYANAN</h2>

      <div class="kv">
        <div>No. PL</div><div>:</div><div>${escapeHtml(vv.noPL || "-")}</div>
        <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(
          fmtDate(vv.hariTanggal)
        )}</div>
        <div>Petugas Survei</div><div>:</div><div>${escapeHtml(
          vv.petugas || "-"
        )}</div>
        <div>Jenis Survei</div><div>:</div><div>${escapeHtml(
          vv.jenisSurvei || "-"
        )}</div>

        <div>Nama Korban</div><div>:</div><div>${escapeHtml(
          vv.korban || "-"
        )}</div>
        <div>No. Berkas</div><div>:</div><div>${escapeHtml(
          vv.noBerkas || "-"
        )}</div>
        <div>Alamat Korban</div><div>:</div><div>${escapeHtml(
          vv.alamatKorban || "-"
        )}</div>
        <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(
          vv.tempatKecelakaan || "-"
        )} / ${escapeHtml(fmtDate(vv.tglKecelakaan))}</div>
        <div>Kesesuaian Hubungan AW</div><div>:</div><div>${
          vv.hubunganSesuai === ""
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
          <div class="space">${petugasSrc ? `<img class="sign-img" src="${petugasSrc}" />` : ""}</div>
          <div class="name">${escapeHtml(
            vv.petugas || "........................................"
          )}</div>
          <div>${escapeHtml(vv.petugasJabatan || "")}</div>
        </div>
      </div>

      ${lampiranHTML}

      </body></html>`;

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      const blob = new Blob([srcdoc], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanSurvey_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Survei Ahli Waris (LL)",
        },
      }));

      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentDocument.title = `LaporanSurvey_${safeName}`;
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (err) {
          console.error("Gagal print:", err);
        } finally {
          setTimeout(() => {
            document.body.removeChild(iframe);
            try { URL.revokeObjectURL(url); } catch {}
          }, 2000);
        }
      };

      setHasDownloadedPDF(true);
      setData((prev) => ({ ...prev, sudahDownloadPDF: true }));
    } catch (err) {
      console.error("Gagal openPrintSurveyLL:", err);
    }
  };

  function surveyLLCompleteDetails(data) {
    if (!data) return [];
    const v = data.v || data.form || data.survey || data.korban || data || {};

    const namaKorban =
      v.namaKorban || v.korbanNama || v.nama || data.namaKorban || data.korbanNama ||
      data.korban?.nama || data.korban?.namaKorban || data.form?.namaKorban ||
      data.survey?.namaKorban || data.v?.namaKorban || data.korban || "";

    const tempatKecelakaan =
      v.tempatKecelakaan || data.tempatKecelakaan || data.lokasiKecelakaan || data.kecelakaan?.tempat || "";

    const att = data.attachSurvey || {};
    const isFilled = (val) => !!(val && String(val).trim() !== "");

    // ===== regex yang lebih lengkap + helper cek =====
    const REGEX = {
      // plat: 1–2 huruf + 3–4 angka + 0–3 huruf (contoh: BM 5621 PQ)
      plat: /(?:^|\b)[a-z]{1,2}\s?\d{3,4}\s?[a-z]{0,3}(?=\b|[^a-z0-9])/i,
      // lokasi: tambah RS/RSUD dkk
      lokasi: /(jalan|jl\.|simpang|dekat|seberang|kelurahan|kecamatan|kota|gedung|ruko|plaza|masjid|rsud|rumah sakit|terminal|stasiun)/i,
      // kendaraan: tambah brand umum biar tetap lolos
      kendaraan: /(motor|mobil|truk|bus|angkot|sepeda|pick ?up|suv|minibus|suzuki|honda|yamaha|daihatsu|toyota|mitsubishi|isuzu)/i,
      // kronologi: tambahkan “diserempet”, “pindah jalur”, dll
      kronologi: /(menabrak|bertabrakan|tertabrak|menyerempet|diserempet|terserempet|menyenggol|tersenggol|terjatuh|terpeleset|tergelincir|terlindas|terbentur|rem mendadak|melawan arus|ban pecah|pindah jalur|memotong jalur|mendahului)/i,
      kesimpulan: /(terjamin|tidak terjamin|dalam pertanggungan|disarankan)/i,
    };

    const cekUraianCukup = (raw) => {
      const isi = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
      const match = {
        panjang: isi.length > 50,
        plat: REGEX.plat.test(isi),
        lokasi: REGEX.lokasi.test(isi),
        kendaraan: REGEX.kendaraan.test(isi),
        kronologi: REGEX.kronologi.test(isi),
        kesimpulan: REGEX.kesimpulan.test(isi),
      };
      console.log("🔎 LL.cekUraian:", match, "\nTeks:", raw);
      return { ok: Object.values(match).every(Boolean), detail: match };
    };

    // ===== validator lokasi umum =====
    const validLokasi = (text) => {
      if (!text) return false;
      const t = text.trim();
      if (t.length < 5) return false;
      const coordRe = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;
      const keywords = [
        "jalan","jl","jl\\.","depan","seberang","sebelah","di depan","dekat",
        "simpang","persimpangan","plaza","mal","masjid","halte","ruko","stasiun",
        "terminal","rumah sakit","rs","rsud","puskesmas","minimarket","toko","bank",
        "kelurahan","kel\\.","kecamatan","kec\\.","kota","rt","rw"
      ];
      const keywordRe = new RegExp(`\\b(${keywords.join("|")})\\b`, "i");
      if (coordRe.test(t)) return true;
      if (keywordRe.test(t) && t.split(/\s+/).length >= 3) return true;
      return false;
    };

    // ===== CEK URAIAN =====
    const { ok: uraianCukup, detail } = cekUraianCukup(data.uraian);

    // ===== bangun hasil =====
    const result = {};
    result.noPL = isFilled(data.noPL) ? "✅ No. PL terisi" : "❌ Belum isi";

    if (!namaKorban) result.namaKorban = "❌ Belum isi";
    else if (/\b(dr|mr|mrs|ir|s\.t|s\.kom)\b/i.test(namaKorban))
      result.namaKorban = "❌ Nama korban tidak boleh ada gelar";
    else result.namaKorban = "✅ Nama korban sesuai ketentuan";

    if (!data.alamatKorban) result.alamatKorban = "❌ Belum isi";
    else if (!validLokasi(data.alamatKorban))
      result.alamatKorban = "❌ Alamat belum cukup detail (tambahkan RT/RW atau area)";
    else result.alamatKorban = "✅ Alamat lengkap";

    if (!tempatKecelakaan) result.tempatKecelakaan = "❌ Belum isi";
    else if (!validLokasi(tempatKecelakaan))
      result.tempatKecelakaan = "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
    else result.tempatKecelakaan = "✅ Lokasi lengkap";

    if (!data.uraian) {
      result.uraian = "❌ Belum isi uraian & kesimpulan";
    } else if (!uraianCukup) {
      const kurang = Object.entries(detail)
        .filter(([, v]) => !v)
        .map(([k]) => ({
          panjang: "panjang minimal",
          plat: "plat nomor",
          lokasi: "lokasi",
          kendaraan: "jenis kendaraan",
          kronologi: "kronologi",
          kesimpulan: "status terjamin/tidak",
        }[k] || k))
        .join(", ");
      result.uraian = `❌ Uraian & kesimpulan belum lengkap (kurang: ${kurang})`;
    } else {
      result.uraian = "✅ Uraian & kesimpulan lengkap & informatif";
    }

    const listFoto =
      Array.isArray(att.fotoSurvey) && att.fotoSurvey.length > 0
        ? att.fotoSurvey
        : Array.isArray(data.fotoSurveyList)
        ? data.fotoSurveyList
        : [];
    result.fotoSurvey = listFoto.length > 0 ? "✅ File sudah terunggah" : "❌ Belum unggah";

    const finalArray = Object.entries(result).map(([key, status]) => ({
      key,
      label: {
        noPL: "No. PL",
        namaKorban: "Nama Korban",
        alamatKorban: "Alamat Korban",
        tempatKecelakaan: "Tempat Kecelakaan",
        uraian: "Uraian & Kesimpulan",
        fotoSurvey: "Foto Survei",
      }[key] || key,
      status,
    }));

    console.log("🧩 surveyLLCompleteDetails:", finalArray);
    return finalArray;
  }

  useEffect(() => {
    // expose ke global biar halaman lain bisa panggil
    window.__reportPrinters = {
      ll: () => openPrintSurveyLL(),
      md: () => openPrintSurveyMD(),
      rs: () => openPrint(),   // kunjungan RS
    };

    // bersihkan saat unmount
    return () => {
      try { delete window.__reportPrinters; } catch {}
    };
  }, [openPrintSurveyLL, openPrintSurveyMD, openPrint]);

  function surveyLLComplete(data) {
    const arr = surveyLLCompleteDetails(data);
    return Array.isArray(arr) && arr.length > 0 && arr.every((x) => String(x.status).startsWith("✅"));
  }

  const handleKirim = async () => {
    try {
      if (data.isSurvey) {
        // Untuk SURVEY gunakan dokumenOk (dokumenOkMD/LL sudah dihitung di atas)
        if (!dokumenOk) {
          toast.error("Lengkapi kelengkapan dokumen survei dulu ya 🙏");
          return;
        }
      } else {
        // Untuk KUNJUNGAN RS gunakan hasil ML (semuaBenar)
        if (!semuaBenar) {
          toast.error("Lengkapi hasil validasi Machine Learning dulu ya 🙏");
          return;
        }
      }

      // Simpan ke Supabase
      const savedId = data.isSurvey
        ? await saveSurveyToSupabase(data)      
        : await saveKunjunganToSupabase(data);
      if (savedId) {
        setData((prev) => ({
          ...prev,
          formSavedId: savedId,
          tersimpan: true,
        }));

        toast.success("✅ Data berhasil disimpan");

        next();
      }
    } catch (err) {
      console.error("❌ Error saat kirim data:", err);
      toast.error("Gagal menyimpan data ke database.");
    }
  };

  const disabledKirim = data.isSurvey
   ? (String(data.sifatCidera).toUpperCase().startsWith("MD") ? !dokumenOkMD : !dokumenOkLL)
   : !semuaBenar;

  // ===============================================
  // RENDER
  // ===============================================
  return (
    <div className="container">
      <h2 className="section-title">Validasi Kelengkapan Dokumen</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <SummaryRow label="Petugas" value={data.petugas || "-"} />
        <SummaryRow label="Korban" value={data.korban || "-"} />
        <SummaryRow
          label="Tanggal Kecelakaan"
          value={data.tglKecelakaan || "-"}
        />
        <SummaryRow label="Template" value={data.template || "-"} />
        <SummaryRow
          label="Catatan Kebutuhan"
          value={
            data.isSurvey
              ? data.sifatCidera === "luka-luka"
                ? "Survey (Luka-luka): hanya cek Foto Survey"
                : "Survey (MD): dokumen wajib lengkap"
              : "Kunjungan RS: hanya Foto Survey"
          }
        />
      </div>

      <hr className="card" />

      {/* 🔹 Untuk survey */}
      {data.isSurvey && (
        <div style={{ marginTop: 14 }}>
          <h3>{data.sifatCidera?.toUpperCase()?.startsWith("LL") ? "Status Kelengkapan (LL)" : "Status Berkas Wajib (MD)"}</h3>

          {surveyStatus.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
              <div>{item.label}</div>
              <div style={{ color: item.status.startsWith("✅") ? "green" : "red" }}>
                {item.status}
              </div>
            </div>
          ))}

          {!dokumenOk && (
            <div style={{ color: "red", marginTop: 6 }}>
              Ada data/dokumen yang belum lengkap. Silakan kembali ke Step 3 untuk melengkapi.
            </div>
          )}

          {/* tombol cetak MD */}
          {data.isSurvey && data.sifatCidera === "MD" && dokumenOk && (
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={openPrintSurveyMD}
                style={{
                  background: "linear-gradient(135deg, #c9b6ff, #e4b6ff)",
                  color: "#4b4b4b",
                  border: "2px solid #fff",
                  padding: "10px 22px",
                  borderRadius: "9999px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontFamily: "'Comic Neue', cursive",
                  fontSize: "15px",
                  boxShadow: "0 4px 10px rgba(200,160,255,0.5)",
                  transition: "all 0.25s ease",
                }}
                onMouseOver={(e) => {
                  e.target.style.transform = "scale(1.08)";
                  e.target.style.boxShadow = "0 6px 15px rgba(200,160,255,0.7)";
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = "scale(1)";
                  e.target.style.boxShadow = "0 4px 10px rgba(200,160,255,0.5)";
                }}
              >
                💜✨ Cetak Laporan (MD) ✨💜
              </button>
            </div>
          )}

          {/* tombol cetak LL */}
          {data.isSurvey && data.sifatCidera === "LL" && dokumenOk && (
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={openPrintSurveyLL}
                style={{
                  background: "linear-gradient(135deg, #ffb6c1, #ffc6ff)",
                  color: "#4b4b4b",
                  border: "2px solid #fff",
                  padding: "10px 22px",
                  borderRadius: "9999px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontFamily: "'Comic Neue', cursive",
                  fontSize: "15px",
                  boxShadow: "0 4px 10px rgba(255,182,193,0.5)",
                  transition: "all 0.25s ease",
                }}
                onMouseOver={(e) => {
                  e.target.style.transform = "scale(1.08)";
                  e.target.style.boxShadow = "0 6px 15px rgba(255,192,203,0.7)";
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = "scale(1)";
                  e.target.style.boxShadow = "0 4px 10px rgba(255,182,193,0.5)";
                }}
              >
                🌸✨ Cetak Laporan (LL) ✨🌸
              </button>
            </div>
          )}
        </div>
      )}

      {/* 🔹 Untuk kunjungan biasa */}
      {!data.isSurvey && (
        <div
          style={{
            padding: "12px 14px",
            background: "#f8faff",
            border: "1.5px dashed #9abaff",
            borderRadius: 14,
            marginTop: 14,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            Hasil Analisis Machine Learning
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Foto Survey: {data.mlResult?.foto}</li>
            <li>Nama Korban: {data. mlResult?.korban}</li>
            <li>Lokasi: {data.mlResult?.lokasi}</li>
            <li>Rumah Sakit: {data.mlResult?.rumahSakit}</li>
            <li>Uraian: {data.mlResult?.uraian}</li>
            <li>Rekomendasi: {data.mlResult?.rekomendasi}</li>
          </ul>

          {mlResult &&
            !Object.values(mlResult).some(
              (v) => typeof v === "string" && v.includes("Sedang dianalisis")
            ) && (
              <div style={{ marginTop: 14, textAlign: "right" }}>
                {semuaBenar ? (
                  <button
                    onClick={openPrint}
                    style={{
                      background: "linear-gradient(135deg, #a0e7e5, #b4f8c8)",
                      color: "#444",
                      border: "2px solid #fff",
                      padding: "10px 22px",
                      borderRadius: "9999px",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontFamily: "'Comic Neue', cursive",
                      fontSize: "15px",
                      boxShadow: "0 4px 10px rgba(160,231,229,0.6)",
                      transition: "all 0.25s ease",
                    }}
                    onMouseOver={(e) => {
                      e.target.style.transform = "scale(1.08)";
                      e.target.style.boxShadow = "0 6px 15px rgba(160,231,229,0.8)";
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = "scale(1)";
                      e.target.style.boxShadow = "0 4px 10px rgba(160,231,229,0.6)";
                    }}
                  >
                    🩵✨ Cetak Laporan Kunjungan ✨🩵
                  </button>
                ) : (
                  <p style={{ color: "#ff5555", marginTop: "10px" }}>
                    {/* ⚠️ Semua hasil Machine Learning harus benar sebelum bisa
                    mencetak laporan. */}
                  </p>
                )}
              </div>
            )}
        </div>
      )}

      <div className="footer" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={back}>
          Kembali
        </button>
        <button
          className="btn rose"
          onClick={handleKirim}
          disabled={disabledKirim}
          style={{
            opacity: disabledKirim ? 0.5 : 1,
            cursor: disabledKirim ? "not-allowed" : "pointer",
          }}
        >
          Kirim
        </button>
        {!data.isSurvey && !semuaBenar && (
          <p style={{ color: "red", marginTop: 8 }}>
            
          </p>
        )}
      </div>
    </div>
  );
}

// ===============================================
// 🔹 Helper Components & Functions
// ===============================================

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

async function prepareForOutput(rec) {
  const vv = { ...rec };

  // ========== 1) Identitas & meta ==========
  vv.petugas        = rec.petugas || rec.petugasSurvei || "";
  vv.petugasJabatan = rec.petugasJabatan || "";
  vv.korban         = rec.korban || rec.namaKorban || "";
  vv.namaKorban     = vv.korban;
  vv.noPL           = rec.noPL || rec.no_pl || "";
  vv.noBerkas       = rec.noBerkas || rec.no_berkas || "";
  vv.alamatKorban   = rec.alamatKorban || "";
  vv.tempatKecelakaan = rec.tempatKecelakaan || rec.lokasiKecelakaan || "";
  vv.wilayah        = rec.wilayah || "";
  vv.rumahSakit     = rec.rumahSakit || "";
  if (!vv.petugasTtd) {
   const p = rec.attachSurvey?.petugasTtd;
   if (p?.dataURL) vv.petugasTtd = p.dataURL;
   else if (p?.url) vv.petugasTtd = p.url;
   else if (p?.file instanceof Blob) {
     vv.petugasTtd = await toDataURL(p.file);
   } else {
     vv.petugasTtd = rec.petugasTtd || "";
   }
 }

  // tanggal2
  vv.tglKecelakaan  = rec.tglKecelakaan || rec.tanggalKecelakaan || "";
  vv.hariTanggal    = rec.hariTanggal || rec.tanggalKecelakaan || vv.tglKecelakaan || "";
  vv.tglMasukRS     = rec.tglMasukRS || "";
  vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
  vv.tglJamKunjungan  = rec.tglJamKunjungan || "";

  // normalisasi jenis survei
  const sc = (rec.sifatCidera || "").toLowerCase();
  vv.jenisSurvei = rec.jenisSurvei || (sc.includes("md") ? "Meninggal Dunia" : sc.includes("ll") ? "Luka-luka" : "");

  // hubungan AW → boolean / "-"
  let hs = rec.hubunganSesuai;
  if (typeof hs === "string") {
    const s = hs.trim().toLowerCase();
    if (["ya","y","true","1","sesuai"].includes(s)) hs = true;
    else if (["tidak","tdk","no","n","false","0","tidak sesuai"].includes(s)) hs = false;
  }
  vv.hubunganSesuai = hs ?? "";

  // ========== 2) Narasi untuk output ==========
  // SURVEI: gabungkan uraian + kesimpulan; KUNJUNGAN: pakai uraianKunjungan
  vv.uraian = (rec.uraianSurvei || rec.uraian || "")
    + (rec.kesimpulanSurvei ? `\n\nKesimpulan: ${rec.kesimpulanSurvei}` : "");
  if (!vv.uraian.trim() && rec.uraianKunjungan) vv.uraian = rec.uraianKunjungan;

  // Khusus kunjungan
  vv.uraianKunjungan = rec.uraianKunjungan || vv.uraian || "";
  vv.rekomendasi     = rec.rekomendasi || "";

  // ========== 3) Lampiran / Foto (samakan jadi dataURL) ==========
  const toDataURL = (file) =>
    new Promise((resolve) => {
      if (!file) return resolve("");
      if (typeof file === "string") return resolve(file); // url/dataURL string
      if (file.dataURL) return resolve(file.dataURL);
      if (file.url) return resolve(file.url);
      const blob = file instanceof Blob ? file : file.file instanceof Blob ? file.file : null;
      if (!blob) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });

  // sumber kemungkinan foto
  const fotoCandidates = []
    .concat(rec.attachSurvey?.fotoSurvey || [])
    .concat(rec.fotoSurveyList || []);

  // normalisasi ke {name, dataURL}
  const allPhotos = [];
  for (const f of (Array.isArray(fotoCandidates) ? fotoCandidates : [fotoCandidates])) {
    if (!f) continue;
    const name =
      f.name || f.fileName || f.filename || f.label || (typeof f === "string" ? f.split("/").pop() : "foto");
    const src = await toDataURL(f);
    if (!src) continue;
    // lewati PDF di grid foto (tetap akan tampil sebagai label teks di tabel)
    if (/\.pdf(\?|$)/i.test(name) || src.startsWith("data:application/pdf")) continue;
    allPhotos.push({ name, dataURL: src });
  }
  vv.allPhotos = allPhotos;

  // tetap simpan attachSurvey mentah (MD/LL butuh halaman per-lampiran)
  vv.attachSurvey = rec.attachSurvey || {};

  return vv;
}

// 🔹 2. Bangun HTML template hasil form
function buildBundleHtml(v) {
  const fotoHTML =
    v.allPhotos && v.allPhotos.length
      ? v.allPhotos
          .map(
            (f, i) => `
              <div class="foto-item">
                <img src="${f.dataURL}" alt="Foto ${i + 1}" />
                <p>Foto ${i + 1}: ${f.name || "-"}</p>
              </div>`
          )
          .join("")
      : "<p><em>Tidak ada foto yang diunggah</em></p>";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Laporan Kunjungan RS</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; }
          h1 { text-align: center; color: #1e3a8a; }
          .info p { margin: 6px 0; }
          .foto-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 16px;
            margin-top: 20px;
          }
          .foto-item {
            background: white;
            border: 1px solid #ccc;
            border-radius: 10px;
            padding: 10px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
          }
          .foto-item img {
            width: 100%;
            max-height: 180px;
            object-fit: cover;
            border-radius: 8px;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <h1>Laporan Hasil Kunjungan RS</h1>
        <div class="info">
          <p><strong>Nama Korban:</strong> ${v.korban}</p>
          <p><strong>Lokasi Kejadian:</strong> ${v.lokasiKecelakaan}</p>
          <p><strong>Rumah Sakit:</strong> ${v.rumahSakit}</p>
          <p><strong>Uraian Hasil Kunjungan:</strong><br/>${
            v.uraianKunjungan
          }</p>
          <p><strong>Kesimpulan / Rekomendasi:</strong><br/>${v.rekomendasi}</p>
        </div>

        <h2 style="margin-top:30px;">Foto Dokumentasi</h2>
        <div class="foto-grid">${fotoHTML}</div>

        <div class="footer">
          <p>Dicetak otomatis dari sistem pada ${new Date().toLocaleString(
            "id-ID"
          )}</p>
        </div>
      </body>
    </html>
  `;
}

// 🔹 3. Cetak via iframe (biar gak buka tab baru)
function printViaIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  // hapus iframe setelah print
  setTimeout(() => document.body.removeChild(iframe), 2000);
}

// cek dokumen untuk kunjungan RS biasa (hanya foto)
async function checkFotoOnly(data) {
  console.log("===== checkFotoOnly =====");
  console.log("Data diterima:", data);

  await new Promise((r) => setTimeout(r, 200));

  const fotoList =
    Array.isArray(data.attachSurvey?.fotoSurvey) &&
    data.attachSurvey.fotoSurvey.length > 0
      ? data.attachSurvey.fotoSurvey
      : Array.isArray(data.fotoSurveyList)
      ? data.fotoSurveyList
      : [];

  const hasFoto = fotoList.length > 0;
  console.log("Foto ditemukan:", fotoList);

  if (hasFoto && typeof setData === "function") {
    setData((prev) => ({
      ...prev,
      att: {
        ...(prev.att || {}),
        fotoSurvey: fotoList,
      },
    }));
  }

  const status = hasFoto ? "✔ Lengkap" : "⛔ Belum diunggah";

  const detail = hasFoto
    ? fotoList.map((f, i) => ({
        label: `Foto ${i + 1}`,
        name: f.name || `file_${i + 1}`,
        status: "✔ Terbaca",
      }))
    : [];

  return [{ key: "fotoSurveyList", label: "Foto Survey", status, detail }];
}
