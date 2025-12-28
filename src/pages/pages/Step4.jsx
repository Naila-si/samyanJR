import React, { useEffect, useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import { supabase } from "../../lib/supabaseClient";
import { toast } from "react-hot-toast";

// ===============================
// MAP jenis dokumen -> folder
// ===============================
const DOKUMEN_FOLDER_MAP = {
  ktp: "ktp",
  kk: "kk",
  bukuTabungan: "buku-tabungan",
  formPengajuan: "form-pengajuan",
  formKeteranganAW: "form-ahli-waris",
  skKematian: "surat-kematian",
  aktaKelahiran: "akta-kelahiran",
};

// ===============================
// HELPER: upload dokumen khusus
// (KTP/KK/dll) ke folder terpisah
// ===============================
async function uploadDokumenKhusus(file, jenisDokumen, recordId) {
  const recordIdFolder = recordId || Date.now();

  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileExt = file.name.split(".").pop();
    const fileName = `${timestamp}_${randomStr}_${jenisDokumen}.${fileExt}`;

    const folder = DOKUMEN_FOLDER_MAP[jenisDokumen];
    if (!folder) throw new Error(`Jenis dokumen tidak valid: ${jenisDokumen}`);

    const path = `${folder}/${recordIdFolder}/${fileName}`;
    console.log(`📤 Uploading ${jenisDokumen} ke ${path}...`);

    const { error } = await supabase.storage
      .from("foto-survey")
      .upload(path, file);
    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("foto-survey")
      .getPublicUrl(path);

    const result = {
      fileName,
      path,
      url: urlData.publicUrl,
      jenis: jenisDokumen,
      folder,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      type: file.type,
    };

    console.log(`✅ ${jenisDokumen} berhasil diupload:`, result.url);
    return result;
  } catch (error) {
    console.error(`❌ Error upload ${jenisDokumen}:`, error);
    throw error;
  }
}

// ===============================
// HELPER: upload semua dokumen
// dari attachSurvey
// ===============================
async function uploadSemuaDokumen(formData, recordId) {
  const results = { success: [], failed: [] };

  console.log(
    "📦 Processing dokumen untuk upload:",
    Object.keys(formData || {})
  );

  for (const [jenisDokumen, file] of Object.entries(formData || {})) {
    if (file && DOKUMEN_FOLDER_MAP[jenisDokumen]) {
      try {
        console.log(`🔄 Processing ${jenisDokumen}...`);
        const result = await uploadDokumenKhusus(file, jenisDokumen, recordId);
        results.success.push({ jenis: jenisDokumen, data: result });
      } catch (error) {
        results.failed.push({ jenis: jenisDokumen, error: error.message });
      }
    }
  }

  console.log("📊 Upload Summary:", {
    success: results.success.length,
    failed: results.failed.length,
    totalProcessed: results.success.length + results.failed.length,
  });

  return results;
}

// ===============================
// HELPER: normalisasi file -> dataURL/url
// support File | {file} | {dataURL} | {url} | string
// ===============================
const toDataURL = (file) =>
  new Promise((resolve) => {
    if (!file) return resolve("");
    if (typeof file === "string") return resolve(file);
    if (file.dataURL) return resolve(file.dataURL);
    if (file.url) return resolve(file.url);

    const blob =
      file instanceof Blob
        ? file
        : file.file instanceof Blob
        ? file.file
        : null;

    if (!blob) return resolve("");

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });

// ===============================
// HELPER: upload foto (satu item)
// ke bucket foto-survey
// ===============================
async function uploadFotoToStorage(
  supabaseClient,
  fileOrDataUrl,
  folder = "survey-images",
  recordId
) {
  const BUCKET_NAME = "foto-survey";
  const recordIdFolder = recordId || Date.now();

  // kalau sudah URL https langsung return stringnya
  if (typeof fileOrDataUrl === "string" && /^https?:\/\//.test(fileOrDataUrl)) {
    return fileOrDataUrl;
  }

  let body;
  let contentType = "application/octet-stream";
  let ext = "bin";
  let originalName = "file";

  // Data URL
  if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
    const [header, base64] = fileOrDataUrl.split(",");
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    contentType = mime;
    ext = mime.split("/")[1] || "jpg";

    const binary =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");

    const len = binary.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
    body = u8;

    originalName = `foto_${Date.now()}.${ext}`;
  }
  // File object
  else if (typeof File !== "undefined" && fileOrDataUrl instanceof File) {
    body = fileOrDataUrl;
    contentType = fileOrDataUrl.type || contentType;
    originalName = fileOrDataUrl.name || originalName;
    ext = (originalName.split(".").pop() || ext).toLowerCase();
  }
  // object {file: File}
  else if (
    fileOrDataUrl?.file &&
    typeof File !== "undefined" &&
    fileOrDataUrl.file instanceof File
  ) {
    const f = fileOrDataUrl.file;
    body = f;
    contentType = f.type || contentType;
    originalName = f.name || fileOrDataUrl.name || originalName;
    ext = (originalName.split(".").pop() || ext).toLowerCase();
  }
  // object {dataURL: string}
  else if (
    fileOrDataUrl?.dataURL &&
    typeof fileOrDataUrl.dataURL === "string"
  ) {
    return uploadFotoToStorage(
      supabaseClient,
      fileOrDataUrl.dataURL,
      folder,
      recordId
    );
  } else {
    console.warn("Format foto tidak dikenal:", fileOrDataUrl);
    return null;
  }

  const safeFolder = folder.replace(/^\/+|\/+$/g, "");
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 9);
  const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const baseName = `${recordIdFolder}_${timestamp}_${randomId}_${safeName}`;

  const filePath =
    safeFolder === "survey-images"
      ? `${safeFolder}/${baseName}`
      : `${safeFolder}/${recordIdFolder}/${baseName}`;

  console.log(`📤 Uploading to: ${filePath}, type: ${contentType}`);

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .upload(filePath, body, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: pubData } = supabaseClient.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  if (!pubData?.publicUrl) throw new Error("Failed to get public URL");

  return {
    url: pubData.publicUrl,
    path: filePath,
    name: originalName,
    fileName: `${timestamp}_${randomId}_${safeName}`,
    uploadedAt: new Date().toISOString(),
    size: body.size || body.length || 0,
    type: contentType,
  };
}

// ===============================
// HELPER: PDF -> images (dataURL)
// ===============================
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

// ===============================
// UPLOAD: TTD Petugas
// ===============================
async function uploadTTDPetugas(ttdFile) {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const finalFileName = `${timestamp}_${randomStr}.png`;
    const filePath = `ttd-petugas/${finalFileName}`;

    const { error } = await supabase.storage
      .from("foto-survey")
      .upload(filePath, ttdFile);
    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("foto-survey")
      .getPublicUrl(filePath);
    return urlData.publicUrl;
  } catch (error) {
    console.error("❌ Error upload TTD:", error);
    return null;
  }
}

// ===============================
// UPLOAD: Foto Survey umum
// (survey-images / folder lain)
// ===============================
async function uploadFotoSurvey(files, folder = "survey-images", recordId) {
  if (!Array.isArray(files) || files.length === 0) return [];

  const recordIdFolder = recordId || Date.now();
  console.log(`📤 Starting upload of ${files.length} files to ${folder}...`);

  const uploadPromises = files.map(async (fileItem, index) => {
    try {
      let fileToUpload;
      let fileName;
      let label = fileItem?.label || "Foto Survey";
      let type = fileItem?.type || "foto";

      if (fileItem instanceof File) {
        fileToUpload = fileItem;
        fileName = fileItem.name;
      } else if (fileItem?.file instanceof File) {
        fileToUpload = fileItem.file;
        fileName = fileItem.name || fileItem.file.name;
      } else if (fileItem?.url?.startsWith("blob:")) {
        const response = await fetch(fileItem.url);
        const blob = await response.blob();
        fileToUpload = new File(
          [blob],
          fileItem.name || `foto_${Date.now()}.png`,
          {
            type: blob.type || "image/png",
          }
        );
        fileName = fileToUpload.name;
      } else if (fileItem?.url?.startsWith("http")) {
        // sudah uploaded
        return fileItem;
      } else {
        return null;
      }

      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const uniqueFileName = `${recordIdFolder}_${timestamp}_${randomStr}_${fileName}`;

      const filePath =
        folder === "survey-images"
          ? `${folder}/${uniqueFileName}`
          : `${folder}/${recordIdFolder}/${uniqueFileName}`;

      console.log(
        `📤 Uploading ${index + 1}/${
          files.length
        }: ${label} - ${uniqueFileName}`
      );

      const { error } = await supabase.storage
        .from("foto-survey")
        .upload(filePath, fileToUpload, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) return null;

      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(filePath);

      return {
        name: fileName,
        fileName: uniqueFileName,
        path: filePath,
        url: urlData.publicUrl,
        size: fileToUpload.size,
        type: fileToUpload.type,
        label,
        category: type,
        uploadedAt: new Date().toISOString(),
        sumberIndex: fileItem?.sumberIndex,
        fotoIndex: fileItem?.fotoIndex,
        folder,
      };
    } catch (error) {
      console.error(`❌ Error uploading file ${index}:`, error);
      return null;
    }
  });

  const results = await Promise.all(uploadPromises);
  return results.filter(Boolean);
}

// ===============================
// UPLOAD: Foto Sumber Informasi
// (folder: sumber-informasi)
// ===============================
async function uploadSumberInformasi(files, recordId) {
  if (!Array.isArray(files) || files.length === 0) return [];

  console.log(`📤 Upload sumber info: ${files.length} files`);

  const recordIdFolder = recordId || Date.now();

  const uploadPromises = files.map(async (fileItem, index) => {
    try {
      let fileToUpload;
      let fileName = fileItem?.name || `sumber_info_${Date.now()}.png`;

      if (fileItem?.file instanceof File) {
        fileToUpload = fileItem.file;
        fileName = fileItem?.name || fileItem.file.name;
      } else if (
        fileItem?.dataURL?.startsWith("data:") ||
        fileItem?.dataURL?.startsWith("blob:")
      ) {
        const response = await fetch(fileItem.dataURL);
        const blob = await response.blob();
        fileToUpload = new File([blob], fileName, {
          type: blob.type || "image/png",
        });
      } else if (fileItem instanceof File) {
        fileToUpload = fileItem;
        fileName = fileItem.name;
      } else if (
        typeof fileItem?.url === "string" &&
        fileItem.url.startsWith("http")
      ) {
        // ✅ sudah URL publik
        const hasImgExt = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(fileItem.url);
        if (hasImgExt) {
          return {
            ...fileItem,
            url: fileItem.url,
            folder: "sumber-informasi",
            category: "sumber_info",
            uploadedAt: fileItem.uploadedAt || new Date().toISOString(),
          };
        }

        // ❗ URL lama tanpa ekstensi → fetch lalu reupload
        const response = await fetch(fileItem.url);
        const blob = await response.blob();
        const mime = blob.type || "image/png";
        const extFromMime = mime.split("/")[1] || "png";

        fileName = fileItem?.name || `sumber_info_${Date.now()}.${extFromMime}`;
        fileToUpload = new File([blob], fileName, { type: mime });
      } else {
        return null;
      }

      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const hasExt = /\.[a-z0-9]{2,5}$/i.test(fileName);
      let fileExt = hasExt ? fileName.split(".").pop().toLowerCase() : "";
      if (!fileExt || fileExt === fileName.toLowerCase()) {
        // ambil dari mime type kalau nama ga ada ext
        const mimeExt = (fileToUpload.type || "").split("/")[1];
        fileExt = (mimeExt || "png").toLowerCase();
      }

      const uniqueFileName = `sumber_${fileItem?.sumberIndex || 0}_foto_${
        fileItem?.fotoIndex || 0
      }_${timestamp}_${randomStr}.${fileExt}`;
      const filePath = `sumber-informasi/${recordIdFolder}/${uniqueFileName}`;

      const { error } = await supabase.storage
        .from("foto-survey")
        .upload(filePath, fileToUpload, {
          cacheControl: "3600",
          upsert: false,
          contentType: fileToUpload.type || "image/png",
        });
      if (error) return null;

      const { data: urlData } = supabase.storage
        .from("foto-survey")
        .getPublicUrl(filePath);

      return {
        name: fileName,
        fileName: uniqueFileName,
        path: filePath,
        url: urlData.publicUrl,
        size: fileToUpload.size,
        type: fileToUpload.type,
        label: fileItem?.label || "Sumber Informasi",
        category: "sumber_info",
        uploadedAt: new Date().toISOString(),
        sumberIndex: fileItem?.sumberIndex,
        fotoIndex: fileItem?.fotoIndex,
        folder: "sumber-informasi",
      };
    } catch (error) {
      console.error(`❌ Error uploading sumber info ${index}:`, error);
      return null;
    }
  });

  const results = await Promise.all(uploadPromises);
  return results.filter(Boolean);
}

// ===============================
// MAIN COMPONENT
// ===============================
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

  // ===============================
  // ✅ RECORD ID STABIL (1 SESSION = 1 ID)
  // ===============================
  const recordIdRef = useRef(
    data.id ||
      data.localId ||
      `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  // simpan balik ke global biar langkah lain ikut stabil
  useEffect(() => {
    if (!data.id && !data.localId) {
      setData((prev) => ({ ...prev, localId: recordIdRef.current }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===============================
  // ✅ GUARD BIAR SAVE CUMA SEKALI
  // ===============================
  const hasAutoSavedRef = useRef(false); // untuk autosave ML
  const isSavingRef = useRef(false); // lock saving (auto/manual)
  const hasManualSavedRef = useRef(false); // mencegah klik berulang

  // ===== status semua benar Kunjungan RS (ML)
  const semuaBenar =
    mlResult &&
    Object.values(mlResult).every(
      (v) =>
        v === true ||
        (typeof v === "string" && (v.includes("✔") || v.includes("✅")))
    );

  // ===== sync att -> data global
  useEffect(() => {
    setData?.({ ...data, attachSurvey: att });
  }, [att]);

  // ===== setup pdfjs worker (sekali)
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }, []);

  // ===============================
  // VALIDATOR KUNJUNGAN RS (ML)
  // ===============================
  const checkForm = useCallback(
    async (rawData) => {
      const result = {};
      const getVal = (v) => (typeof v === "string" ? v.trim() : v ?? "");

      const val = {
        foto: getVal(rawData.fotoSurveyList?.[0]),
        korban: getVal(rawData.korban),
        lokasi: getVal(rawData.lokasiKecelakaan),
        rumahSakit: getVal(rawData.rumahSakit),
        uraian: getVal(rawData.uraianKunjungan),
        rekomendasi: getVal(rawData.rekomendasi),
      };

      const isNonsense = (text) => {
        if (!text) return true;
        const lower = text.toLowerCase();
        if (/(.)\1{4,}/.test(lower)) return true;
        if (!lower.includes(" ") && lower.length > 25) return true;

        const vowels = (lower.match(/[aiueo]/g) || []).length;
        if (vowels / lower.length < 0.3) return true;

        const commonWords = [
          "dan",
          "di",
          "ke",
          "yang",
          "untuk",
          "dengan",
          "karena",
        ];
        const hasCommon = commonWords.some((w) => lower.includes(w));
        if (!hasCommon && lower.split(" ").length < 3) return true;

        return false;
      };

      const validLokasi = (text) => {
        if (!text) return false;
        const words = text.trim().split(/\s+/);
        if (words.length < 3) return false;
        return /(jalan|jl\.|dekat|simpang|gedung|rumah|desa|kelurahan|kecamatan)/i.test(
          text
        );
      };

      // FOTO
      if (!val.foto) result.foto = "❌ Belum unggah";
      else if (
        ["clear", "baik", "jelas"].includes(
          (rawData.fotoQuality || "").toLowerCase()
        )
      )
        result.foto = "✅ Foto jelas";
      else result.foto = "✅ Foto terlihat";

      // KORBAN
      if (!val.korban) result.korban = "❌ Belum isi";
      else if (/\b(dr|mr|mrs|ir|s\.t|s\.kom)\b/i.test(val.korban))
        result.korban = "❌ Nama korban tidak boleh ada gelar";
      else result.korban = "✅ Nama korban sesuai ketentuan";

      // LOKASI
      if (!val.lokasi) result.lokasi = "❌ Belum isi";
      else if (!validLokasi(val.lokasi))
        result.lokasi =
          "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
      else result.lokasi = "✅ Lokasi lengkap";

      // RS
      if (!val.rumahSakit) result.rumahSakit = "❌ Belum isi";
      else if (val.rumahSakit !== val.rumahSakit.toUpperCase())
        result.rumahSakit = "❌ Nama RS tidak kapital semua";
      else result.rumahSakit = "✅ Nama RS kapital semua";

      // URAIAN
      if (!val.uraian) result.uraian = "❌ Belum isi";
      else if (val.uraian.length < 20)
        result.uraian = "❌ Uraian terlalu singkat";
      else if (isNonsense(val.uraian))
        result.uraian = "❌ Uraian tidak bermakna";
      else if (val.uraian.includes("sesuai ketentuan"))
        result.uraian = "✅ Uraian sesuai ketentuan";
      else result.uraian = "✅ Uraian deskriptif";

      // REKOMENDASI
      if (!val.rekomendasi) result.rekomendasi = "❌ Belum isi";
      else if (val.rekomendasi.length < 15)
        result.rekomendasi = "❌ Rekomendasi terlalu pendek";
      else if (isNonsense(val.rekomendasi))
        result.rekomendasi = "❌ Rekomendasi tidak bermakna";
      else if (val.rekomendasi.includes("direkomendasikan"))
        result.rekomendasi = "✅ Rekomendasi sesuai ketentuan";
      else result.rekomendasi = "✅ Rekomendasi jelas";

      setMlResult(result);
      setData((prev) => ({ ...prev, mlResult: result }));

      // ✅ AUTO SAVE CUMA SEKALI
      const allValid = Object.values(result).every((v) =>
        String(v).startsWith("✅")
      );

      if (
        allValid &&
        !hasAutoSavedRef.current &&
        !isSavingRef.current &&
        !rawData.formSavedId
      ) {
        isSavingRef.current = true;
        try {
          const saved = await saveSurveyToSupabase(
            rawData,
            recordIdRef.current
          );

          if (saved) {
            hasAutoSavedRef.current = true;

            setData((prev) => ({
              ...prev,

              uraian: [
                rawData.uraian ?? "",
                rawData.sifatCidera === "MD"
                  ? "Korban meninggal dunia."
                  : "Korban mengalami luka-luka.",
              ]
                .filter(Boolean)
                .join("\n\n"),

              kesimpulan:
                rawData.sifatCidera === "MD"
                  ? "Berdasarkan hasil survei, korban dinyatakan meninggal dunia."
                  : "Berdasarkan hasil survei, korban mengalami luka-luka.",

              formSavedId: saved.id ?? saved,
            }));
          }
        } finally {
          isSavingRef.current = false;
        }
      }

      return result;
    },
    [setData]
  );

  // ===============================
  // Tentukan status Survey / ML
  // ===============================
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
      checkForm(data);
    }
  }, [data, checkForm]);

  // ===============================
  // Status dokumen survey
  // ===============================
  const dokumenOkLL =
    Array.isArray(surveyStatus) &&
    surveyStatus.length > 0 &&
    surveyStatus.every((x) => String(x.status).startsWith("✅"));

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

  const dokumenOk =
    data.isSurvey &&
    ((data.sifatCidera?.toUpperCase() === "MD" && dokumenOkMD) ||
      ((data.sifatCidera?.toUpperCase() === "LL" ||
        data.sifatCidera?.toUpperCase() === "LUKA-LUKA") &&
        dokumenOkLL));

  // ✅ UNIVERSAL VALID FLAG (Survey + RS)
  const sedangAnalisis =
    !data.isSurvey &&
    mlResult &&
    Object.values(mlResult).some(
      (v) => typeof v === "string" && v.includes("Sedang dianalisis")
    );

  const validSemua = data.isSurvey ? dokumenOk : semuaBenar && !sedangAnalisis;

  // ===============================
  // SAVE KUNJUNGAN RS (✅ recordId stabil)
  // ===============================
  async function saveKunjunganToSupabase(rawData, recordIdFromRef) {
    const recordId = rawData?.id || rawData?.localId || recordIdFromRef;

    try {
      const fotoSurveyList = Array.isArray(rawData.fotoSurveyList)
        ? rawData.fotoSurveyList
        : [];

      const uploadedFotos = [];
      for (const foto of fotoSurveyList) {
        try {
          const uploadResult = await uploadFotoToStorage(
            supabase,
            foto,
            "survey-images",
            recordId
          );
          if (uploadResult) uploadedFotos.push(uploadResult);
        } catch (e) {
          console.error("❌ gagal upload foto kunjungan:", e);
        }
      }

      // Upload TTD jika dataURL
      let ttdUrl = rawData.petugasTtd;
      if (ttdUrl && typeof ttdUrl === "string" && ttdUrl.startsWith("data:")) {
        try {
          const ttdMeta = await uploadFotoToStorage(
            supabase,
            ttdUrl,
            "ttd-petugas",
            recordId
          );
          ttdUrl = ttdMeta?.url || ttdUrl;
        } catch {}
      }

      const toIso = (v) => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "string") {
          const parsed = new Date(v);
          return isNaN(parsed.getTime()) ? v : parsed.toISOString();
        }
        return null;
      };

      const payload = {
        petugas: rawData.petugas?.trim() || null,
        petugas_jabatan: rawData.petugasJabatan?.trim() || "Petugas Pelayanan",
        wilayah: rawData.wilayah?.trim() || null,
        korban: rawData.korban?.trim() || null,
        rumah_sakit: rawData.rumahSakit?.trim() || null,
        lokasi_kecelakaan: rawData.lokasiKecelakaan?.trim() || null,
        tanggal_kecelakaan: toIso(rawData.tanggalKecelakaan),
        tgl_masuk_rs: toIso(rawData.tglMasukRS),
        tgl_jam_notifikasi: toIso(rawData.tglJamNotifikasi),
        tgl_jam_kunjungan: toIso(rawData.tglJamKunjungan),
        uraian: rawData.uraianKunjungan?.trim() || null,
        rekomendasi: rawData.rekomendasi?.trim() || null,
        petugas_ttd: ttdUrl || null,
        foto_survey: uploadedFotos.length ? uploadedFotos : null,
        created_at: new Date().toISOString(),
        local_id: recordId,
      };

      const { data: inserted, error } = await supabase
        .from("form_kunjungan_rs")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      toast.success("✅ Data kunjungan RS tersimpan");
      return inserted.id;
    } catch (err) {
      console.error("❌ Gagal simpan kunjungan:", err);
      toast.error(`Gagal menyimpan data kunjungan. ${err.message || err}`);
      return null;
    }
  }

  // ===============================
  // SAVE SURVEY (MD/LL) (✅ recordId stabil)
  // ===============================
  async function saveSurveyToSupabase(raw, recordIdFromRef) {
    const recordId = raw.id || raw.localId || recordIdFromRef;

    const toISODate = (d) => {
      if (!d) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d);
      const t = new Date(d);
      return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
    };

    const sifat = String(raw.sifatCidera || "")
      .toLowerCase()
      .includes("md")
      ? "meninggal"
      : "luka";

    const sifatText =
      raw.sifatCidera === "MD"
        ? "Korban meninggal dunia."
        : raw.sifatCidera === "LL"
        ? "Korban mengalami luka-luka."
        : "";

    const jenisSurvei =
      typeof raw.jenisSurvei === "string"
        ? raw.jenisSurvei.replace("keabsahan_waris", "keabsahan_ahli_waris")
        : null;

    // ===== upload TTD (attachSurvey lebih prioritas)
    let petugasTtdUrl = null;

    if (raw.attachSurvey?.petugasTtd) {
      const ttdData = raw.attachSurvey.petugasTtd;

      if (ttdData.file instanceof File) {
        petugasTtdUrl = await uploadTTDPetugas(ttdData.file);
      } else if (typeof ttdData.url === "string") {
        petugasTtdUrl = ttdData.url;
      } else if (typeof ttdData.dataURL === "string") {
        const uploaded = await uploadFotoToStorage(
          supabase,
          ttdData.dataURL,
          "ttd-petugas",
          recordId
        );
        petugasTtdUrl = uploaded?.url || null;
      }
    } else if (raw.petugasTtd instanceof File) {
      petugasTtdUrl = await uploadTTDPetugas(raw.petugasTtd);
    } else if (typeof raw.petugasTtd === "string" && raw.petugasTtd.trim()) {
      petugasTtdUrl = raw.petugasTtd.trim();
    }

    // ===== kumpulkan foto survey
    const allFotoFiles = [];
    if (Array.isArray(raw.attachSurvey?.fotoSurvey)) {
      allFotoFiles.push(...raw.attachSurvey.fotoSurvey);
    }
    if (raw.attachSurvey?.mapSS) {
      allFotoFiles.push({
        ...raw.attachSurvey.mapSS,
        label: "Peta Lokasi",
        type: "map",
      });
    }
    if (raw.attachSurvey?.barcode) {
      allFotoFiles.push({
        ...raw.attachSurvey.barcode,
        label: "Barcode/QR",
        type: "barcode",
      });
    }

    // ===== kumpulkan foto sumber info
    const allSumberInfoFiles = [];
    if (Array.isArray(raw.sumbers)) {
      raw.sumbers.forEach((sumber, index) => {
        if (Array.isArray(sumber.foto)) {
          sumber.foto.forEach((foto, fotoIndex) => {
            const isValid =
              foto?.file instanceof File ||
              (foto?.dataURL &&
                (foto.dataURL.startsWith("data:") ||
                  foto.dataURL.startsWith("blob:"))) ||
              (foto?.url &&
                (foto.url.startsWith("data:") ||
                  foto.url.startsWith("blob:") ||
                  foto.url.startsWith("http"))) ||
              (typeof foto === "string" &&
                (foto.startsWith("data:") ||
                  foto.startsWith("blob:") ||
                  foto.startsWith("http")));

            if (!isValid) return;

            allSumberInfoFiles.push({
              ...(typeof foto === "string"
                ? /^https?:\/\//.test(foto)
                  ? { url: foto }
                  : { dataURL: foto }
                : foto),
              label: `Sumber ${index + 1} - ${sumber.identitas || "Unknown"}`,
              type: "sumber_info",
              sumberIndex: index,
              fotoIndex,
            });
          });
        }
      });
    }

    // ===== upload dokumen wajib
    await uploadSemuaDokumen(raw.attachSurvey || {}, recordId);

    // ===== upload semua foto (folder stabil)
    const uploadedAllFotos = await uploadFotoSurvey(
      allFotoFiles,
      "survey-images",
      recordId
    );
    const uploadedSumberInfoFotos = await uploadSumberInformasi(
      allSumberInfoFiles,
      recordId
    );

    const sumbersLite = Array.isArray(raw.sumbers)
      ? raw.sumbers.map((r) => ({ identitas: r?.identitas || "" }))
      : [];

    const payload = {
      no_pl: raw.noPL || null,
      hari_tanggal: toISODate(raw.hariTanggal || raw.tanggalKecelakaan),
      petugas: raw.petugas || raw.petugasSurvei || null,

      jenis_survei: jenisSurvei,
      jenis_lainnya: jenisSurvei ? null : raw.jenisSurveiLainnya || null,

      nama_korban: raw.korban || raw.namaKorban || null,
      no_berkas: raw.noBerkas || null,
      alamat_korban: raw.alamatKorban || null,
      tempat_kecelakaan: raw.tempatKecelakaan || raw.lokasiKecelakaan || null,
      tanggal_kecelakaan: toISODate(raw.tanggalKecelakaan || raw.tglKecelakaan),
      hubungan_sesuai:
        typeof raw.hubunganSesuai === "boolean" ? raw.hubunganSesuai : null,

      sifat,
      uraian: [
        raw.uraian ?? raw.uraianSurvei ?? raw.uraianKunjungan ?? "",
        sifatText,
      ]
        .filter(Boolean)
        .join("\n\n"),

      kesimpulan:
        raw.kesimpulanSurvei ??
        (raw.sifatCidera === "MD"
          ? "Berdasarkan hasil survei, korban dinyatakan meninggal dunia."
          : "Berdasarkan hasil survei, korban mengalami luka-luka."),

      petugas_ttd: petugasTtdUrl,
      foto_survey: uploadedAllFotos,

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
        foto_survey_count: uploadedAllFotos.length,
        sumber_info_count: uploadedSumberInfoFotos.length,
      },

      sumbers: sumbersLite,
      local_id: recordId,
    };

    try {
      const { data: inserted, error: insErr } = await supabase
        .from("form_survei_aw")
        .insert(payload, { returning: "representation" })
        .select()
        .single();

      if (insErr) throw insErr;

      const surveyId = inserted.id;

      const sumbersWithUploadedFotos = (raw.sumbers || []).map(
        (sumber, index) => {
          const uploadedFotosForSumber = uploadedSumberInfoFotos.filter(
            (f) => f.sumberIndex === index
          );

          return {
            identitas: sumber.identitas || "",
            foto: uploadedFotosForSumber.map((f) => ({
              name: f.name,
              fileName: f.fileName,
              url: f.url,
              uploadedAt: f.uploadedAt,
            })),
            foto_count: uploadedFotosForSumber.length,
          };
        }
      );

      const { error: updErr } = await supabase
        .from("form_survei_aw")
        .update({
          sumbers: sumbersWithUploadedFotos,
          sumbers_paths: uploadedSumberInfoFotos,
        })
        .eq("id", surveyId);

      if (updErr) throw updErr;

      toast.success("✅ Data survei tersimpan");
      return {
        id: surveyId,
        fotoSurvey: uploadedAllFotos,
        fotoSumberInfo: uploadedSumberInfoFotos,
      };
    } catch (err) {
      console.error("❌ Gagal simpan survei:", err);
      toast.error(`Gagal menyimpan survei. ${err.message || err}`);
      return null;
    }
  }

  // ===============================
  // AUTO DRAFT WARIS kalau MD
  // ===============================
  async function createDraftWarisIfMD(savedSurvey, rawData) {
    try {
      const sifatTxt = String(rawData?.sifatCidera || "").toLowerCase();
      const isMD = sifatTxt.includes("md") || sifatTxt.includes("meninggal");
      if (!isMD) return;

      const surveyId = savedSurvey?.id || savedSurvey;
      if (!surveyId) return;

      const namaKorban =
        rawData.korban ||
        rawData.namaKorban ||
        rawData.korbanNama ||
        rawData.v?.namaKorban ||
        rawData.form?.namaKorban ||
        rawData.survey?.namaKorban ||
        null;

      const alamatKorban =
        rawData.alamatKorban ||
        rawData.v?.alamatKorban ||
        rawData.form?.alamatKorban ||
        null;

      const payloadWaris = {
        survey_id: surveyId,
        nama_korban: namaKorban,
        alamat_korban: alamatKorban,
        status: "draft",
      };

      const { error } = await supabase
        .from("data_waris")
        .insert([payloadWaris]);
      if (error) throw error;

      console.log("✅ Draft data_waris dibuat otomatis:", payloadWaris);
    } catch (err) {
      console.error("❌ createDraftWarisIfMD error:", err);
    }
  }

  // ===============================
  // PREPARE OUTPUT untuk print
  // ===============================
  const prepareForOutput = useCallback(async (rec) => {
    const vv = { ...rec };

    vv.petugas = rec.petugas || rec.petugasSurvei || "";
    vv.petugasJabatan = rec.petugasJabatan || "";
    vv.korban = rec.korban || rec.namaKorban || "";
    vv.namaKorban = vv.korban;
    vv.noPL = rec.noPL || rec.no_pl || "";
    vv.noBerkas = rec.noBerkas || rec.no_berkas || "";
    vv.alamatKorban = rec.alamatKorban || "";
    vv.tempatKecelakaan = rec.tempatKecelakaan || rec.lokasiKecelakaan || "";
    vv.wilayah = rec.wilayah || "";
    vv.rumahSakit = rec.rumahSakit || "";

    // TTD petugas
    if (!vv.petugasTtd) {
      const p = rec.attachSurvey?.petugasTtd;
      if (p?.dataURL) vv.petugasTtd = p.dataURL;
      else if (p?.url) vv.petugasTtd = p.url;
      else if (p?.file instanceof Blob) vv.petugasTtd = await toDataURL(p.file);
      else vv.petugasTtd = rec.petugasTtd || "";
    }

    vv.tglKecelakaan = rec.tglKecelakaan || rec.tanggalKecelakaan || "";
    vv.hariTanggal =
      rec.hariTanggal || rec.tanggalKecelakaan || vv.tglKecelakaan || "";
    vv.tglMasukRS = rec.tglMasukRS || "";
    vv.tglJamNotifikasi = rec.tglJamNotifikasi || "";
    vv.tglJamKunjungan = rec.tglJamKunjungan || "";

    const sc = (rec.sifatCidera || "").toLowerCase();
    vv.jenisSurvei =
      rec.jenisSurvei ||
      (sc.includes("md")
        ? "Meninggal Dunia"
        : sc.includes("ll")
        ? "Luka-luka"
        : "");

    let hs = rec.hubunganSesuai;
    if (typeof hs === "string") {
      const s = hs.trim().toLowerCase();
      if (["ya", "y", "true", "1", "sesuai"].includes(s)) hs = true;
      else if (
        ["tidak", "tdk", "no", "n", "false", "0", "tidak sesuai"].includes(s)
      )
        hs = false;
    }
    vv.hubunganSesuai = hs ?? "";

    const kesimpulanFinal =
      rec.sifatCidera === "MD"
        ? "Berdasarkan hasil survei, korban dinyatakan meninggal dunia."
        : rec.sifatCidera === "LL"
        ? "Berdasarkan hasil survei, korban mengalami luka-luka"
        : rec.kesimpulan || rec.kesimpulanSurvei || "";

    vv.uraian =
      (rec.uraianSurvei || rec.uraian || "") +
      (kesimpulanFinal ? `\n\nKesimpulan: ${kesimpulanFinal}` : "");

    vv.kesimpulan = kesimpulanFinal;

    if (!vv.uraian.trim() && rec.uraianKunjungan)
      vv.uraian = rec.uraianKunjungan;

    vv.uraianKunjungan = rec.uraianKunjungan || vv.uraian || "";
    vv.rekomendasi = rec.rekomendasi || "";

    const fotoCandidates = []
      .concat(rec.attachSurvey?.fotoSurvey || [])
      .concat(rec.fotoSurveyList || []);

    const allPhotos = [];
    for (const f of Array.isArray(fotoCandidates)
      ? fotoCandidates
      : [fotoCandidates]) {
      if (!f) continue;
      const name =
        f.name ||
        f.fileName ||
        f.filename ||
        f.label ||
        (typeof f === "string" ? f.split("/").pop() : "foto");

      const src = await toDataURL(f);
      if (!src) continue;
      if (/\.pdf(\?|$)/i.test(name) || src.startsWith("data:application/pdf"))
        continue;

      allPhotos.push({ name, dataURL: src });
    }

    vv.allPhotos = allPhotos;
    vv.attachSurvey = rec.attachSurvey || {};

    return vv;
  }, []);

  // ===============================
  // BUILD HTML Survey Client
  // ===============================
  function buildSurveyHtmlClient(vv, { filePages = [], tableRows = "" } = {}) {
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

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  body{
    font-family:"Times New Roman", Times, serif;
    color:#000;
    margin:0;
    font-size:11pt;
    line-height:1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header{
    text-align:center;
    font-weight:bold;
    font-size:12pt;
    letter-spacing:.4pt;
    text-transform:uppercase;
    margin-top:2mm;
  }
  .title{
    text-align:center;
    font-size:16pt;
    font-weight:bold;
    text-transform:uppercase;
    margin:3mm 0 7mm;
  }
  .row{
    display:grid;
    grid-template-columns: 48mm 4mm 1fr 18mm 40mm 4mm 1fr;
    column-gap:1.5mm;
    row-gap:1mm;
    margin:1.8mm 0;
    align-items:start;
  }
  .row.single{ grid-template-columns: 48mm 4mm 1fr; }
  .label{ white-space:nowrap; }
  .colon{ text-align:center; }
  .value{ white-space:pre-wrap; }
  .nopls{
    display:flex; justify-content:center; align-items:center; gap:3mm;
    margin:0 0 3mm;
  }
  .nopls .plval{
    min-width:70mm; text-align:center; border-bottom:0.35mm solid #000;
    padding:0 2mm 1mm;
  }
  .jenis-wrap{ margin:2mm 0 3mm; }
  .jenis-line{
    display:flex; flex-wrap:wrap; gap:10mm; margin-left:24mm; margin-top:1mm;
  }
  .lainnya-line{
    margin-left:24mm; margin-top:1.5mm;
    display:grid; grid-template-columns: 18mm 4mm 1fr; column-gap:1.5mm;
  }
  table{
    width:100%; border-collapse:collapse; margin:3mm 0 4mm; font-size:11pt;
  }
  th, td{ border:1px solid #000; padding:2mm 2.2mm; vertical-align:top; }
  th{ text-align:center; font-weight:bold; }
  .box{
    border:1px solid #000; padding:2.5mm; white-space:pre-wrap;
    height:auto; min-height:25mm;
  }
  .signs{
    display:grid; grid-template-columns:1fr 1fr;
    margin-top:8mm; column-gap:30mm;
  }
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
  .lampiran-img{
    width: 100%; height: auto; max-height: 250mm; object-fit: contain;
  }
</style>
</head>
<body>

  <div class="header">JASA RAHARJA WILAYAH RIAU</div>
  <div class="title">LAPORAN HASIL SURVEI</div>

  <div class="nopls">
    <div>No. PL/</div>
    <div class="value">${escapeHtml(vv.noPL || "")}</div>
  </div>

  <div class="row">
    <div class="label">Hari/tanggal survei</div>
    <div class="colon">:</div>
    <div class="value">${escapeHtml(fmtDate(vv.hariTanggal))}</div>
    <div></div>
    <div class="label">Petugas survei</div>
    <div class="colon">:</div>
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
      <div class="label">Lainnya</div>
      <div class="colon">:</div>
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
        '<tr><td style="text-align:center">1</td><td></td><td></td></tr>'
      }
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
      <div class="sign-name">${escapeHtml(
        vv.petugas || ".............................."
      )}</div>
      <div>${escapeHtml(vv.petugasJabatan || "")}</div>
    </div>
  </div>

  ${filePages.join("")}

</body>
</html>`;
  }

  // ===============================
  // PRINT KUNJUNGAN RS
  // ===============================
  const openPrint = useCallback(async () => {
    try {
      const vv = await prepareForOutput(data);
      const fotoList = vv.allPhotos || [];

      const fotosHTML = fotoList.length
        ? fotoList
            .map(
              (f) => `
          <div style="margin:5px; text-align:center;">
            <img src="${f.dataURL}" alt="${f.name}" style="max-width:230px; max-height:230px; border:1px solid #999; border-radius:8px; margin:5px;"/>
          </div>`
            )
            .join("")
        : "<i>Tidak ada foto dilampirkan.</i>";

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      const petugasSrc = vv.petugasTtd || null;

      const srcdoc = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
      <meta charset="UTF-8">
      <title>LaporanKunjungan_${vv.korban || "Anon"}</title>
      <style>
        body {
          font-family: "Times New Roman", serif;
          background: white;
          color: black;
          padding: 30px;
          line-height: 1.5;
        }
        .judul {
          text-align: center;
          font-weight: bold;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        table { width: 100%; font-size: 14px; }
        td { padding: 4px 8px; vertical-align: top; }
        .label { width: 220px; color: black; }
        .box {
          border: 1px solid #000;
          padding: 8px;
          min-height: 100px;
          margin-top: 6px;
        }
        .foto-container {
          display: flex; flex-wrap: wrap; margin-top: 10px;
        }
        .ttd {
          margin-top: 40px;
          display: flex; justify-content: space-between;
          font-size: 14px;
        }
        .sign-img {
          max-height: 80px;
          max-width: 260px;
          display: block;
          margin-top: 8px;
        }
        h4 { color: black; margin-top: 20px; }
      </style>
      </head>
      <body>
        <div class="judul">
          LEMBAR HASIL CETAK KUNJUNGAN KE RUMAH SAKIT <br/>
          APLIKASI MOBILE PELAYAN
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

        <h4>Uraian Hasil Kunjungan:</h4>
        <div class="box">${vv.uraianKunjungan || "<i>Belum diisi.</i>"}</div>

        <h4>Rekomendasi / Kesimpulan:</h4>
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
            ${
              petugasSrc
                ? `<img class="sign-img" src="${petugasSrc}" />`
                : "<br/><br/><br/>"
            }
            <b>${vv.petugas || "................................"}</b><br/>
            <i>${vv.petugasJabatan || ""}</i>
          </div>
        </div>

        <div class="foto-container">${fotosHTML}</div>
      </body>
      </html>
      `;

      const blob = new Blob([srcdoc], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanKunjungan_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Kunjungan RS",
        },
        sudahDownloadPDF: true,
      }));

      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentDocument.title = `LaporanKunjungan_${safeName}`;
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }
      };

      setHasDownloadedPDF(true);
    } catch (err) {
      console.error("Gagal openPrint:", err);
    }
  }, [data, prepareForOutput, setData]);

  // ===============================
  // surveyMDComplete & surveyLLCompleteDetails
  // (ISI TETAP PUNYAMU, nggak kuubah)
  // ===============================
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

    const isFilled = (val) => !!(val && String(val).trim() !== "");

    // --- VALIDASI FILE ---
    const baseWajibFiles = ["fotoSurvey"]; // selalu dicek (wajib)
    const optionalFiles = [
      "ktp",
      "kk",
      "bukuTabungan",
      "formPengajuan",
      "formKeteranganAW",
      "skKematian",
      "aktaKelahiran",
    ];

    // hanya cek dokumen opsional yang beneran ada di attachSurvey
    const dokumenYangDicek = [
      ...baseWajibFiles,
      ...optionalFiles.filter((key) => !!att[key]),
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

    dokumenYangDicek.forEach((key) => {
      if (key === "fotoSurvey") {
        const list =
          Array.isArray(att.fotoSurvey) && att.fotoSurvey.length > 0
            ? att.fotoSurvey
            : Array.isArray(data.fotoSurveyList)
            ? data.fotoSurveyList
            : [];

        result[key] =
          list.length > 0 ? "✅ File sudah terunggah" : "❌ Belum unggah";
      } else {
        result[key] = att[key] ? "✅ File sudah terunggah" : "❌ Belum unggah";
      }
    });

    const validLokasi = (text) => {
      if (!text) return false;
      const t = text.trim();
      if (t.length < 5) return false;

      const coordRe = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;
      const keywords = [
        "jalan",
        "jl",
        "jl\\.",
        "depan",
        "seberang",
        "sebelah",
        "di depan",
        "dekat",
        "simpang",
        "persimpangan",
        "plaza",
        "mal",
        "masjid",
        "halte",
        "ruko",
        "stasiun",
        "terminal",
        "rumah sakit",
        "rs",
        "puskesmas",
        "minimarket",
        "toko",
        "bank",
        "kelurahan",
        "kel\\.",
        "kecamatan",
        "kec\\.",
        "kota",
        "rt",
        "rw",
      ];
      const keywordRe = new RegExp(`\\b(${keywords.join("|")})\\b`, "i");

      if (coordRe.test(t)) return true;
      if (keywordRe.test(t) && t.split(/\s+/).length >= 3) return true;
      return false;
    };

    // --- VALIDASI FIELD TEKS ---
    if (!namaKorban) result.namaKorban = "❌ Belum isi";
    else if (/\b(dr|mr|mrs|ir|s\.t|s\.kom)\b/i.test(namaKorban))
      result.namaKorban = "❌ Nama korban tidak boleh ada gelar";
    else result.namaKorban = "✅ Nama korban sesuai ketentuan";

    if (!data.alamatKorban) result.alamatKorban = "❌ Belum isi";
    else if (!validLokasi(data.alamatKorban))
      result.alamatKorban =
        "❌ Alamat belum cukup detail (tambahkan RT/RW atau area)";
    else result.alamatKorban = "✅ Alamat lengkap";

    if (!tempatKecelakaan) result.tempatKecelakaan = "❌ Belum isi";
    else if (!validLokasi(tempatKecelakaan))
      result.tempatKecelakaan =
        "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
    else result.tempatKecelakaan = "✅ Lokasi lengkap";

    const isi = (data.uraian || "").toLowerCase();

    /* ===============================
   DETEKSI JENIS URAIAN
   =============================== */
    const isAhliWaris =
      /(ahli waris|lajang|anak ke|diasuh|kepala keluarga|istri|suami|orang tua|ayah|ibu|bapak)/i.test(
        isi
      );

    /* ===============================
   REGEX SURVEI BIASA
   =============================== */
    const regexPlat = /[a-z]{1,2}\s?\d{3,4}\s?[a-z]{0,3}/i;
    const regexLokasi =
      /(jalan|jl.|simpang|dekat|seberang|kelurahan|kecamatan|kota|gedung|ruko|plaza|masjid)/i;
    const regexKendaraan = /(motor|mobil|truk|bus|angkot|sepeda)/i;
    const regexKronologi =
      /(menabrak|bertabrakan|terjatuh|terpeleset|terserempet|terlindas|terbentur|diserempet|mendadak|mengerem)/i;
    const regexKesimpulanSurvei =
      /(terjamin|tidak terjamin|dalam pertanggungan|disarankan)/i;

    const uraianSurveiCukup =
      isi.length > 50 &&
      regexPlat.test(isi) &&
      regexLokasi.test(isi) &&
      regexKendaraan.test(isi) &&
      regexKronologi.test(isi) &&
      regexKesimpulanSurvei.test(isi);

    /* ===============================
   REGEX AHLI WARIS (AW)
   =============================== */
    const regexStatusKorban = /(meninggal dunia|meninggal|wafat|tewas)/i;

    const regexHubunganKeluarga =
      /(anak|orang tua|ayah|ibu|bapak|istri|suami|saudara|diasuh|ahli waris)/i;

    const regexKesimpulanAW =
      /(terjamin uu\s?34\/1964|tidak terjamin uu\s?34\/1964|dalam pertanggungan uu\s?34\/1964)/i;

    const uraianAWCukup =
      isi.length > 80 &&
      regexStatusKorban.test(isi) &&
      regexHubunganKeluarga.test(isi) &&
      regexKesimpulanAW.test(isi);

    /* ===============================
   VALIDASI FINAL URAIAN
   =============================== */
    if (!data.uraian) {
      result.uraian = "❌ Belum isi uraian & kesimpulan";
    } else if (isAhliWaris && !uraianAWCukup) {
      result.uraian =
        "❌ Uraian Ahli Waris belum lengkap (harus menjelaskan status korban, hubungan keluarga/ahli waris, dan kesimpulan UU 34/1964)";
    } else if (!isAhliWaris && !uraianSurveiCukup) {
      result.uraian =
        "❌ Uraian survei belum lengkap (harus memuat plat, lokasi, kendaraan, kronologi, dan status terjamin/tidak terjamin)";
    } else {
      result.uraian = "✅ Uraian & kesimpulan lengkap & sesuai ketentuan";
    }

    return Object.entries(result).map(([key, status]) => ({
      key,
      label: labelMap[key] || key,
      status,
    }));
  };

  function surveyLLCompleteDetails(data) {
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
    const isFilled = (val) => !!(val && String(val).trim() !== "");

    const REGEX = {
      plat: /(?:^|\b)[a-z]{1,2}\s?\d{3,4}\s?[a-z]{0,3}(?=\b|[^a-z0-9])/i,
      lokasi:
        /(jalan|jl\.|simpang|dekat|seberang|kelurahan|kecamatan|kota|gedung|ruko|plaza|masjid|rsud|rumah sakit|terminal|stasiun)/i,
      kendaraan:
        /(motor|mobil|truk|bus|angkot|sepeda|pick ?up|suv|minibus|suzuki|honda|yamaha|daihatsu|toyota|mitsubishi|isuzu)/i,
      kronologi:
        /(menabrak|bertabrakan|tertabrak|menyerempet|diserempet|terserempet|menyenggol|tersenggol|terjatuh|terpeleset|tergelincir|terlindas|terbentur|rem mendadak|melawan arus|ban pecah|pindah jalur|memotong jalur|mendahului)/i,
      kesimpulan: /(terjamin|tidak terjamin|dalam pertanggungan|disarankan)/i,
    };

    const cekUraianCukup = (raw) => {
      const isi = String(raw || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const match = {
        panjang: isi.length > 50,
        plat: REGEX.plat.test(isi),
        lokasi: REGEX.lokasi.test(isi),
        kendaraan: REGEX.kendaraan.test(isi),
        kronologi: REGEX.kronologi.test(isi),
        kesimpulan: REGEX.kesimpulan.test(isi),
      };
      return { ok: Object.values(match).every(Boolean), detail: match };
    };

    const validLokasi = (text) => {
      if (!text) return false;
      const t = text.trim();
      if (t.length < 5) return false;
      const coordRe = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;
      const keywords = [
        "jalan",
        "jl",
        "jl\\.",
        "depan",
        "seberang",
        "sebelah",
        "di depan",
        "dekat",
        "simpang",
        "persimpangan",
        "plaza",
        "mal",
        "masjid",
        "halte",
        "ruko",
        "stasiun",
        "terminal",
        "rumah sakit",
        "rs",
        "rsud",
        "puskesmas",
        "minimarket",
        "toko",
        "bank",
        "kelurahan",
        "kel\\.",
        "kecamatan",
        "kec\\.",
        "kota",
        "rt",
        "rw",
      ];
      const keywordRe = new RegExp(`\\b(${keywords.join("|")})\\b`, "i");
      if (coordRe.test(t)) return true;
      if (keywordRe.test(t) && t.split(/\s+/).length >= 3) return true;
      return false;
    };

    const { ok: uraianCukup, detail } = cekUraianCukup(data.uraian);

    const result = {};
    result.noPL = isFilled(data.noPL) ? "✅ No. PL terisi" : "❌ Belum isi";

    if (!namaKorban) result.namaKorban = "❌ Belum isi";
    else if (/\b(dr|mr|mrs|ir|s\.t|s\.kom)\b/i.test(namaKorban))
      result.namaKorban = "❌ Nama korban tidak boleh ada gelar";
    else result.namaKorban = "✅ Nama korban sesuai ketentuan";

    if (!data.alamatKorban) result.alamatKorban = "❌ Belum isi";
    else if (!validLokasi(data.alamatKorban))
      result.alamatKorban =
        "❌ Alamat belum cukup detail (tambahkan RT/RW atau area)";
    else result.alamatKorban = "✅ Alamat lengkap";

    if (!tempatKecelakaan) result.tempatKecelakaan = "❌ Belum isi";
    else if (!validLokasi(tempatKecelakaan))
      result.tempatKecelakaan =
        "❌ Lokasi belum cukup detail (tambah nama jalan/area/lokasi terdekat)";
    else result.tempatKecelakaan = "✅ Lokasi lengkap";

    if (!data.uraian) result.uraian = "❌ Belum isi uraian & kesimpulan";
    else if (!uraianCukup) {
      const kurang = Object.entries(detail)
        .filter(([, v]) => !v)
        .map(
          ([k]) =>
            ({
              panjang: "panjang minimal",
              plat: "plat nomor",
              lokasi: "lokasi",
              kendaraan: "jenis kendaraan",
              kronologi: "kronologi",
              kesimpulan: "status terjamin/tidak",
            }[k] || k)
        )
        .join(", ");
      result.uraian = `❌ Uraian & kesimpulan belum lengkap (kurang: ${kurang})`;
    } else result.uraian = "✅ Uraian & kesimpulan lengkap & informatif";

    const listFoto =
      Array.isArray(att.fotoSurvey) && att.fotoSurvey.length > 0
        ? att.fotoSurvey
        : Array.isArray(data.fotoSurveyList)
        ? data.fotoSurveyList
        : [];

    result.fotoSurvey =
      listFoto.length > 0 ? "✅ File sudah terunggah" : "❌ Belum unggah";

    return Object.entries(result).map(([key, status]) => ({
      key,
      label:
        {
          noPL: "No. PL",
          namaKorban: "Nama Korban",
          alamatKorban: "Alamat Korban",
          tempatKecelakaan: "Tempat Kecelakaan",
          uraian: "Uraian & Kesimpulan",
          fotoSurvey: "Foto Survei",
        }[key] || key,
      status,
    }));
  }

  // ===============================
  // PRINT Survey MD & LL (tetap punyamu)
  // ===============================
  const openPrintSurveyMD = useCallback(async () => {
    try {
      const vv = await prepareForOutput(data);

      const filePages = [];
      if (data.attachSurvey) {
        const order = ["mapSS", "barcode"];
        const ordered = [
          ...order
            .filter((k) => k in data.attachSurvey)
            .map((k) => [k, data.attachSurvey[k]]),
          ...Object.entries(data.attachSurvey).filter(
            ([k]) => !order.includes(k)
          ),
        ];

        const skipKeyRegex = /ttd|tanda\s*tangan|signature/i;

        for (const [key, fileGroup] of ordered) {
          if (!fileGroup) continue;
          if (skipKeyRegex.test(key)) continue;

          const files = Array.isArray(fileGroup) ? fileGroup : [fileGroup];
          for (const f of files) {
            const fname = (f?.name || f?.filename || "").toLowerCase();
            if (skipKeyRegex.test(fname)) continue;

            const src = await toDataURL(f);
            if (!src) continue;

            if (
              src.startsWith("data:application/pdf") ||
              (f?.name && f.name.endsWith(".pdf"))
            ) {
              try {
                const imgs = await pdfToImages(f);
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
                      [PDF tidak dapat ditampilkan]
                    </div>
                  </div>
                `);
              }
              continue;
            }

            const isImage =
              src.startsWith("data:image") || /^https?:/.test(src);
            filePages.push(`
              <div class="lampiran-page">
                ${
                  isImage
                    ? `<img src="${src}" class="lampiran-img" />`
                    : `<div style="color:red; font-size:11pt;text-align:center">[File tidak dapat ditampilkan]</div>`
                }
              </div>
            `);
          }
        }
      }

      const renderFotoCell = async (fotoField) => {
        if (!fotoField) return "";
        const files = Array.isArray(fotoField) ? fotoField : [fotoField];
        const pieces = [];
        for (const f of files) {
          const src = await toDataURL(f);
          if (!src) continue;
          if (src.startsWith("data:application/pdf")) {
            pieces.push(
              `<div style="font-size:10pt;color:#a00;">[PDF tidak bisa dipratinjau]</div>`
            );
            continue;
          }
          const isImg = src.startsWith("data:image") || /^https?:/.test(src);
          if (isImg)
            pieces.push(
              `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;" />`
            );
        }
        return pieces.join("");
      };

      const rows = [];
      for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
        const r = vv.sumbers[i] || {};
        const fotoCell = await renderFotoCell(r.foto);
        rows.push(`
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${r.identitas || ""}</td>
            <td>${fotoCell}</td>
          </tr>
        `);
      }

      const htmlMain = buildSurveyHtmlClient(vv, {
        filePages,
        tableRows: rows.join(""),
      });

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      const blob = new Blob([htmlMain], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);

      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanSurvey_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Survei Ahli Waris (MD)",
        },
        sudahDownloadPDF: true,
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
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }
      };

      setHasDownloadedPDF(true);
    } catch (err) {
      console.error("Gagal openPrintSurveyMD:", err);
    }
  }, [data, prepareForOutput, setData]);

  const openPrintSurveyLL = useCallback(async () => {
    try {
      const vv = await prepareForOutput(data);

      const attachSurvey = data.attachSurvey || {};
      const filePages = [];

      const onlyLLKeys = ["mapSS", "barcode", "fotoSurvey"];

      const pushFiles = async (fileGroup) => {
        if (!fileGroup) return;
        const files = Array.isArray(fileGroup) ? fileGroup : [fileGroup];

        for (const f of files) {
          if (!f) continue;
          const src = await toDataURL(f);
          if (!src) continue;

          const fname = (f?.name || f?.filename || "").toLowerCase();

          if (
            src.startsWith("data:application/pdf") ||
            fname.endsWith(".pdf")
          ) {
            filePages.push(`
              <div class="lampiran-page">
                <div style="font-size:10pt;color:#a00;text-align:center">
                  [PDF tidak bisa dipratinjau]
                </div>
              </div>
            `);
            continue;
          }

          const isImg =
            src.startsWith("data:image") ||
            src.startsWith("blob:") ||
            /^https?:/.test(src);

          filePages.push(`
            <div class="lampiran-page">
              ${
                isImg
                  ? `<img src="${src}" class="lampiran-img" />`
                  : `<div style="font-size:10pt;color:#a00;text-align:center">[File tidak dapat ditampilkan]</div>`
              }
            </div>
          `);
        }
      };

      for (const key of onlyLLKeys) {
        if (key === "fotoSurvey") {
          const fotoSurveyList =
            Array.isArray(attachSurvey.fotoSurvey) &&
            attachSurvey.fotoSurvey.length
              ? attachSurvey.fotoSurvey
              : Array.isArray(data.fotoSurveyList)
              ? data.fotoSurveyList
              : [];
          await pushFiles(fotoSurveyList);
        } else {
          await pushFiles(attachSurvey[key]);
        }
      }

      const renderFotoCell = async (fotoField) => {
        if (!fotoField) return "";
        const files = Array.isArray(fotoField) ? fotoField : [fotoField];
        const pieces = [];
        for (const f of files) {
          const src = await toDataURL(f);
          if (!src) continue;
          if (src.startsWith("data:application/pdf")) {
            pieces.push(
              `<div style="font-size:10pt;color:#a00;">[PDF tidak bisa dipratinjau]</div>`
            );
            continue;
          }
          const isImg = src.startsWith("data:image") || /^https?:/.test(src);
          if (isImg)
            pieces.push(
              `<img src="${src}" style="width:100%;max-height:45mm;object-fit:contain;" />`
            );
        }
        return pieces.join("");
      };

      const rows = [];
      for (let i = 0; i < (vv.sumbers?.length || 0); i++) {
        const r = vv.sumbers[i] || {};
        const fotoCell = await renderFotoCell(r.foto);
        rows.push(`
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${r.identitas || ""}</td>
            <td>${fotoCell}</td>
          </tr>
        `);
      }

      const htmlMain = buildSurveyHtmlClient(vv, {
        filePages,
        tableRows: rows.join(""),
      });

      const safeName = (vv.korban || "Anon")
        .replace(/\s+/g, "_")
        .replace(/[^\w_]/g, "");

      const blob = new Blob([htmlMain], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);

      setData((prev) => ({
        ...prev,
        hasilFormFile: {
          name: `LaporanSurvey_${safeName}.html`,
          dataURL: url,
          label: "Hasil Formulir Survei Ahli Waris (LL)",
        },
        sudahDownloadPDF: true,
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
        } finally {
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }
      };

      setHasDownloadedPDF(true);
    } catch (err) {
      console.error("Gagal openPrintSurveyLL:", err);
    }
  }, [data, prepareForOutput, setData]);

  // expose printer biar step lain bisa panggil
  useEffect(() => {
    window.__reportPrinters = {
      ll: () => openPrintSurveyLL(),
      md: () => openPrintSurveyMD(),
      rs: () => openPrint(),
    };
    return () => {
      try {
        delete window.__reportPrinters;
      } catch {}
    };
  }, [openPrintSurveyLL, openPrintSurveyMD, openPrint]);

  // ===============================
  // HANDLE KIRIM (✅ 1x aja)
  // ===============================
  const handleKirim = async () => {
    if (isSavingRef.current || hasManualSavedRef.current) return;

    // ✅ satu rule buat Survey + RS
    if (!validSemua) {
      toast.error(
        data.isSurvey
          ? "Lengkapi kelengkapan dokumen survei dulu ya 🙏"
          : "Lengkapi hasil validasi Machine Learning dulu ya 🙏"
      );
      return;
    }

    try {
      isSavingRef.current = true;

      let savedId = data.formSavedId;

      if (!savedId) {
        savedId = data.isSurvey
          ? await saveSurveyToSupabase(data, recordIdRef.current)
          : await saveKunjunganToSupabase(data, recordIdRef.current);
      }

      if (savedId) {
        hasManualSavedRef.current = true;

        setData((prev) => ({
          ...prev,
          formSavedId: savedId,
          tersimpan: true,
        }));

        if (data.isSurvey && savedId?.id) {
          await createDraftWarisIfMD(savedId, data);
        }

        next();
      }
    } catch (err) {
      console.error("❌ Error saat kirim data:", err);
      toast.error("Gagal menyimpan data ke database.");
    } finally {
      isSavingRef.current = false;
    }
  };

  const disabledKirim = !validSemua;

  // ===============================
  // 🎀 KAWAII BUTTON STYLE
  // ===============================
  const kawaiiBtnStyle = {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1.5px solid #ffd3e6",
    background:
      "linear-gradient(135deg, #fff0f7 0%, #f3f7ff 45%, #e9ffe9 100%)",
    color: "#7a2e5a",
    fontWeight: 800,
    letterSpacing: 0.3,
    boxShadow: "0 6px 14px rgba(255, 182, 220, .45)",
    cursor: "pointer",
    transition: "all .18s ease",
  };

  const kawaiiBtnHover = {
    transform: "translateY(-1px) scale(1.02)",
    boxShadow: "0 10px 18px rgba(255, 182, 220, .6)",
  };

  // ===============================
  // RENDER UI
  // ===============================
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

      {/* ===== SURVEY MODE ===== */}
      {data.isSurvey && (
        <div style={{ marginTop: 14 }}>
          <h3>
            {data.sifatCidera?.toUpperCase()?.startsWith("LL")
              ? "Status Kelengkapan (LL)"
              : "Status Berkas Wajib (MD)"}
          </h3>

          {surveyStatus.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 4,
              }}
            >
              <div>{item.label}</div>
              <div
                style={{
                  color: item.status.startsWith("✅") ? "green" : "red",
                }}
              >
                {item.status}
              </div>
            </div>
          ))}

          {!dokumenOk && (
            <div style={{ color: "red", marginTop: 6 }}>
              Ada data/dokumen yang belum lengkap. Silakan kembali ke Step 3
              untuk melengkapi.
            </div>
          )}

          {/* ✅ Cetak muncul hanya kalau validSemua */}
          {data.sifatCidera === "MD" && validSemua && (
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <KawaiiButton
                onClick={openPrintSurveyMD}
                style={kawaiiBtnStyle}
                hover={kawaiiBtnHover}
              >
                💜✨ Cetak Laporan (MD) ✨💜
              </KawaiiButton>
            </div>
          )}

          {data.sifatCidera === "LL" && validSemua && (
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <KawaiiButton
                onClick={openPrintSurveyLL}
                style={kawaiiBtnStyle}
                hover={kawaiiBtnHover}
              >
                🌸✨ Cetak Laporan (LL) ✨🌸
              </KawaiiButton>
            </div>
          )}
        </div>
      )}

      {/* ===== KUNJUNGAN RS MODE ===== */}
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
            <li>Nama Korban: {data.mlResult?.korban}</li>
            <li>Lokasi: {data.mlResult?.lokasi}</li>
            <li>Rumah Sakit: {data.mlResult?.rumahSakit}</li>
            <li>Uraian: {data.mlResult?.uraian}</li>
            <li>Rekomendasi: {data.mlResult?.rekomendasi}</li>
          </ul>

          {/* ✅ Cetak muncul hanya kalau validSemua */}
          {validSemua && (
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <KawaiiButton
                onClick={openPrint}
                style={kawaiiBtnStyle}
                hover={kawaiiBtnHover}
              >
                🩵✨ Cetak Laporan Kunjungan ✨🩵
              </KawaiiButton>
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
          disabled={disabledKirim || isSavingRef.current}
          style={{
            opacity: disabledKirim || isSavingRef.current ? 0.5 : 1,
            cursor:
              disabledKirim || isSavingRef.current ? "not-allowed" : "pointer",
          }}
        >
          Kirim
        </button>
      </div>
    </div>
  );
}

// ===============================
// SMALL COMPONENTS
// ===============================
function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

// 🎀 kawaii button wrapper (hover anime style)
function KawaiiButton({ children, style, hover, ...props }) {
  const [isHover, setIsHover] = useState(false);

  return (
    <button
      {...props}
      style={{ ...style, ...(isHover ? hover : null) }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      {children}
    </button>
  );
}
