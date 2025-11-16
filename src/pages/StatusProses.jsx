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
          {footer ?? <button className="btn" onClick={onClose}>Tutup</button>}
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
    { key: "Terkirim",  color: "#b13a77", bg: "linear-gradient(180deg,#fff,#fff4f9)", val: counts.terkirim },
    { key: "Diproses",  color: "#0f7a4c", bg: "linear-gradient(180deg,#fff,#f2fff8)", val: counts.diproses },
    { key: "Selesai",   color: "#1b5fb3", bg: "linear-gradient(180deg,#fff,#eef5ff)", val: counts.selesai },
    { key: "Ditolak",   color: "#a30f2d", bg: "linear-gradient(180deg,#fff,#fff2f2)", val: counts.ditolak },
  ];
  return (
    <div className="stats-grid">
      {items.map((it) => (
        <div key={it.key} className="stat-card" style={{ background: it.bg, borderColor: "rgba(0,0,0,.06)" }}>
          <div className="stat-top">
            <span className="stat-dot" style={{ background: it.color }} />
            <span className="stat-label">{it.key}</span>
          </div>
          <div className="stat-val" style={{ color: it.color }}>{it.val ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

/* ====== Skeleton baris tabel saat loading ====== */
function SkeletonRow() {
  return (
    <tr className="skeleton-row">
      <td><div className="sk sk-70" /></td>
      <td><div className="sk sk-120" /></td>
      <td><div className="sk sk-90" /></td>
      <td><div className="sk sk-80" /></td>
      <td><div className="sk sk-60" /></td>
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
          <button className="toast-x" onClick={() => onClose(t.id)}>✕</button>
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

  console.log(`🔍 RAW DATA FROM ${table}:`, data && data[0]);
  
  // Cek khusus field lokasi
  if (data && data[0]) {
    const row = data[0];
    console.log("📍 Database row location fields:", {
      lokasi_kecelakaan: row.lokasi_kecelakaan,
      lokasiKecelakaan: row.lokasiKecelakaan, 
      tempat_kecelakaan: row.tempat_kecelakaan,
      tempatKecelakaan: row.tempatKecelakaan,
      lokasi: row.lokasi,
      tempat: row.tempat
    });
  }

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

  console.log("🔍 === DETAILED attachSurvey ANALYSIS ===");
  if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
    console.log("📋 attachSurvey keys:", Object.keys(vv.attachSurvey));
    
    Object.entries(vv.attachSurvey).forEach(([key, value]) => {
      console.log(`   ${key}:`, value);
      console.log(`   - type:`, typeof value);
      console.log(`   - isArray:`, Array.isArray(value));
      
      if (value && typeof value === 'object') {
        console.log(`   - object keys:`, Object.keys(value));
        console.log(`   - has url:`, !!value.url);
        console.log(`   - has path:`, !!value.path);
        console.log(`   - has fileName:`, !!value.fileName);
      }
    });
  } else {
    console.log("❌ attachSurvey is not object or is null");
  }

  const toSrc = (item, uniqueKey = "") => {
    console.log("🔄 [StatusProses] toSrc called with:", { 
      item, 
      uniqueKey,
      type: typeof item,
      keys: item ? Object.keys(item) : 'null'
    });
    
    if (!item) {
      console.log("❌ toSrc: item kosong");
      return "";
    }
    if (typeof item === "string") {
      console.log("✅ toSrc: item is string:", item);
      return item;
    }

    const cacheBuster = `?t=${Date.now()}&key=${uniqueKey}`;
    
    // ✅ Prioritaskan URL yang sudah ada (Supabase URL)
    if (item.url && typeof item.url === 'string') {
      console.log("✅ toSrc: Using existing URL:", item.url);
      return item.url + cacheBuster;
    }
    
    // ✅ Handle Supabase path
    if (item.path && typeof item.path === 'string') {
      console.log("🔄 toSrc: Generating URL from path:", item.path);
      try {
        const { data: urlData } = supabase.storage
          .from('foto-survey')
          .getPublicUrl(item.path);
        console.log("✅ toSrc: Generated URL from path:", urlData?.publicUrl);
        return urlData?.publicUrl ? urlData.publicUrl + cacheBuster : "";
      } catch (error) {
        console.error("❌ toSrc: Error generating URL from path:", error);
      }
    }
    
    if (item.fileName && typeof item.fileName === 'string') {
      console.log("🔄 toSrc: Generating URL from fileName:", item.fileName);
      
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
      
      console.log("📁 toSrc: Using folder:", folder);
      
      try {
        const fullPath = `${folder}/${item.fileName}`;
        const { data: urlData } = supabase.storage
          .from('foto-survey')
          .getPublicUrl(fullPath);
        console.log("✅ toSrc: Generated URL from fileName:", urlData?.publicUrl);
        return urlData?.publicUrl ? urlData.publicUrl + cacheBuster : "";
      } catch (error) {
        console.error("❌ toSrc: Error generating URL from fileName:", error);
      }
    }

    if (item.dataURL) {
      console.log("✅ toSrc: Using dataURL");
      return item.dataURL;
    }
    if (item.file instanceof File) {
      const url = objURL?.(item.file) || "";
      console.log("✅ toSrc: Using File object URL:", url);
      return url;
    }
    
    console.log("❌ toSrc: No valid source found");
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

    const filePages = [];
    if (vv.attachSurvey && typeof vv.attachSurvey === "object") {
      console.log("🔍 [StatusProses] Processing filePages dari attachSurvey...");
      console.log("📋 attachSurvey keys:", Object.keys(vv.attachSurvey));

      // Mapping key dari snake_case ke camelCase dan tentukan folder
      const keyMapping = {
        kk: { label: 'Kartu Keluarga (KK)', folder: 'kk' },
        ktp: { label: 'KTP Korban', folder: 'ktp' },
        map_ss: { label: 'Peta / Denah', folder: 'survey-images' },
        barcode_qr: { label: 'Barcode / QR Code', folder: 'survey-images' },
        buku_tabungan: { label: 'Buku Tabungan', folder: 'buku-tabungan' },
        akta_kelahiran: { label: 'Akta Kelahiran', folder: 'akta-kelahiran' },
        form_pengajuan_santunan: { label: 'Formulir Pengajuan Santunan', folder: 'form-pengajuan' },
        surat_keterangan_kematian: { label: 'Surat Keterangan Kematian', folder: 'surat-kematian' },
        form_keterangan_ahli_waris: { label: 'Formulir Keterangan Ahli Waris', folder: 'form-ahli-waris' }
      };

      for (const [key, value] of Object.entries(vv.attachSurvey)) {
        console.log(`📁 Processing key: ${key}`, { value, type: typeof value });
        
        const mapping = keyMapping[key];
        if (!mapping) {
          console.log(`❌ ${key}: No mapping found, skipping`);
          continue;
        }

        // Jika value adalah boolean true, cari file berdasarkan timestamp
        if (value === true) {
          console.log(`🔍 ${key}: Boolean true, searching for files...`);
          
          // Cari file di folder yang sesuai berdasarkan timestamp record
          try {
            const { data: files, error } = await supabase.storage
              .from('foto-survey')
              .list(mapping.folder);
            
            if (error) {
              console.error(`❌ Error listing files in ${mapping.folder}:`, error);
              continue;
            }

            if (!files || files.length === 0) {
              console.log(`❌ No files found in folder ${mapping.folder}`);
              continue;
            }

            console.log(`📁 Found ${files.length} files in ${mapping.folder}:`, files);

            // Cari file yang paling sesuai berdasarkan timestamp
            const recordTime = vv.createdAt ? new Date(vv.createdAt).getTime() : Date.now();
            let bestMatch = null;
            let smallestDiff = Infinity;

            files.forEach(file => {
              // Extract timestamp dari nama file
              const timestamp = extractTimestampFromFileName(file.name);
              if (timestamp) {
                const fileTime = new Date(timestamp).getTime();
                const timeDiff = Math.abs(fileTime - recordTime);
                
                if (timeDiff < smallestDiff && timeDiff < (2 * 60 * 1000)) { // 2 menit tolerance
                  smallestDiff = timeDiff;
                  bestMatch = file;
                }
              }
            });

            // Jika tidak ada yang match, ambil file terbaru
            if (!bestMatch && files.length > 0) {
              bestMatch = files[files.length - 1]; // File terakhir biasanya terbaru
              console.log(`🔄 ${key}: Using latest file as fallback`);
            }

            if (bestMatch) {
              console.log(`✅ ${key}: Best match found:`, bestMatch.name);
              const fileUrl = `https://zxtcrwaiwhveinfsjboe.supabase.co/storage/v1/object/public/foto-survey/${mapping.folder}/${bestMatch.name}`;
              
              const imgHTML = `
                <div style="text-align:center; margin:2mm; page-break-inside: avoid;">
                  <div style="font-size:9pt; margin-bottom:1mm; color:#666;">${mapping.label}</div>
                  <img src="${fileUrl}" 
                      style="max-width:100%; max-height:80mm; object-fit:contain; border:0.3mm solid #ccc;"
                      onerror="console.error('Gagal memuat: ${mapping.label}')"
                      onload="console.log('Berhasil memuat: ${mapping.label}')" />
                </div>`;
              
              filePages.push(`
                <div style="page-break-before: always; margin:10mm 0; padding:4mm; border-top:1px solid #000;">
                  <div style="font-weight:bold; font-size:12pt; margin-bottom:4mm; text-align:center;">
                    ${mapping.label}
                  </div>
                  <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4mm;">
                    ${imgHTML}
                  </div>
                </div>
              `);
            } else {
              console.log(`❌ ${key}: No suitable file found`);
            }

          } catch (error) {
            console.error(`❌ Error processing ${key}:`, error);
          }
        } 
        // Jika value adalah object/string, gunakan langsung
        else if (value && (typeof value === 'object' || typeof value === 'string')) {
          console.log(`✅ ${key}: Direct value, using toSrc`);
          const src = toSrc(value, key);
          if (src) {
            const imgHTML = `
              <div style="text-align:center; margin:2mm; page-break-inside: avoid;">
                <div style="font-size:9pt; margin-bottom:1mm; color:#666;">${mapping.label}</div>
                <img src="${src}" 
                    style="max-width:100%; max-height:80mm; object-fit:contain; border:0.3mm solid #ccc;"
                    onerror="console.error('Gagal memuat: ${mapping.label}')"
                    onload="console.log('Berhasil memuat: ${mapping.label}')" />
              </div>`;
            
            filePages.push(`
              <div style="page-break-before: always; margin:10mm 0; padding:4mm; border-top:1px solid #000;">
                <div style="font-weight:bold; font-size:12pt; margin-bottom:4mm; text-align:center;">
                  ${mapping.label}
                </div>
                <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:4mm;">
                  ${imgHTML}
                </div>
              </div>
            `);
          }
        } else {
          console.log(`❌ ${key}: Unsupported value type:`, typeof value);
        }
      }
    } else {
      console.log("❌ [StatusProses] attachSurvey tidak valid untuk filePages");
    }

    console.log("📄 [StatusProses] Final filePages count:", filePages.length);

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
  console.log("📍 === LOKASI KECELAKAAN DEBUG ===");
  console.log("📍 vv.lokasi_kecelakaan:", vv.lokasi_kecelakaan);
  console.log("📍 vv.lokasiKecelakaan:", vv.lokasiKecelakaan);
  console.log("📍 vv.tempatKecelakaan:", vv.tempatKecelakaan);

  // Cek semua keys yang ada di vv
  console.log("📍 All keys in vv:", Object.keys(vv));
  
  // Cari field yang mengandung "lokasi" atau "kecelakaan"
  const locationKeys = Object.keys(vv).filter(key => 
    key.toLowerCase().includes('lokasi') || 
    key.toLowerCase().includes('kecelakaan') ||
    key.toLowerCase().includes('tempat')
  );
  console.log("📍 Location-related keys:", locationKeys);
  
  locationKeys.forEach(key => {
    console.log(`📍 ${key}:`, vv[key]);
  });

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
            <tr><td class="label">Lokasi Kecelakaan</td><td>: ${escapeHtml(
              vv.lokasi_kecelakaan || 
              vv.lokasiKecelakaan || 
              vv.tempat_kecelakaan ||
              vv.tempatKecelakaan || 
              vv.lokasi ||
              vv.tempat ||
              vv.alamat_kejadian ||
              vv.alamatKejadian ||
              "-"
            )}</td></tr>
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
      el.style.setProperty("--tx", (Math.random() * 60 - 30) + "px");
      el.style.background = ["#ff5aa5","#8bc8ff","#7be2c2","#ffd37a","#b28cff"][i % 5];
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
      ver.stampedPdfUrl || r.files?.hasilFormPdf || r.files?.pdfUrl || "/Lembar_Kunjungan_RS_NAI.pdf";

    return {
      name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
      docType:
        r.template === "kunjungan_rs"
          ? "Kunjungan RS"
          : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
      dateMs: pickValidTime(r.updated_at, r.verified_at, r.unverified_at, r.waktu, r.createdAt),
      status: STATUS_MAP[(r.status || "").toLowerCase()] || "Terkirim",
      notes: {
        // baca top-level note jika ada, kalau tidak ada coba dari counts.verifikator
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

        // (opsional) jika ada kolom pemilik + user:
        // if (user?.id) q = q.eq("created_by", user.id);

        const { data: rows, error } = await q;
        if (error) throw error;

        const mapped = (rows || []).map(mapRowFromSupabase);
        if (!cancelled) {
          setData(mapped);
          setLoading(false);
          // simpan ke localStorage utk offline
          try { localStorage.setItem(LS_KEY, JSON.stringify(rows || [])); } catch {}
        }
      } catch {
        if (!cancelled) {
          // fallback ke localStorage
          const rows = getListSafe(LS_KEY);
          const mapped = rows.map((r) => ({
            name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
            docType:
              r.template === "kunjungan_rs"
                ? "Kunjungan RS"
                : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
            dateMs: pickValidTime(r._updatedAt, r.verifiedAt, r.unverifiedAt, r.waktu, r.createdAt),
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

    // Dengarkan perubahan localStorage (fallback)
    const onStorage = (e) => {
      if (e.key === LS_KEY) {
        const rows = getListSafe(LS_KEY);
        const mapped = rows.map((r) => ({
          name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
          docType:
            r.template === "kunjungan_rs"
              ? "Kunjungan RS"
              : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
          dateMs: pickValidTime(r._updatedAt, r.verifiedAt, r.unverifiedAt, r.waktu, r.createdAt),
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

    // Realtime Supabase: auto-refresh saat ada perubahan
    let ch;
    try {
      ch = supabase
        .channel("status_proses_user")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dataform" },
          () => { pullFromSupabase(); }
        )
        .subscribe();
    } catch {}

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      try { ch && supabase.removeChannel(ch); } catch {}
    };
  }, []); // kalau pakai auth: [user?.id]

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
        {verifyNote ? <p className="note">{verifyNote}</p> : <p className="muted">Tidak ada catatan.</p>}
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
        {!finishNote && !verifyNote && <p className="muted">Tidak ada catatan admin.</p>}
      </>
    );
  };

  const renderMissingContent = (row) => {
    const items = Array.isArray(row.missing) ? row.missing : [];
    return (
      <>
        {items.length > 0 ? (
          <ul className="missing-list">{items.map((m, idx) => <li key={idx}>{m}</li>)}</ul>
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
        <div style={{ 
          background: 'linear-gradient(180deg,#fff2f2,#ffe6e6)', 
          border: '2px solid #ffb8b8',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            color: '#a30f2d',
            fontWeight: 'bold',
            marginBottom: '8px'
          }}>
            <span>⛔</span>
            <span>Pengajuan Ditolak</span>
          </div>
          <p style={{ margin: 0, color: '#7a0a1f', fontSize: '14px' }}>
            Pengajuan Anda tidak dapat diproses. Silakan perbaiki kekurangan berikut dan ajukan kembali.
          </p>
        </div>

        {items.length > 0 && (
          <>
            <p className="muted" style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              Kekurangan yang perlu diperbaiki:
            </p>
            <ul className="missing-list" style={{ 
              background: '#fff9f9',
              border: '1px solid #ffd7d7',
              borderRadius: '8px',
              padding: '12px 12px 12px 32px',
              margin: '0 0 16px 0'
            }}>
              {items.map((m, idx) => (
                <li key={idx} style={{ marginBottom: '6px', color: '#a30f2d' }}>
                  {m}
                </li>
              ))}
            </ul>
          </>
        )}
        
        {row.notes?.rejectNote ? (
          <div style={{ 
            background: '#fff9fd', 
            border: '1px solid #ffd7ea', 
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#8e3d6f', fontSize: '14px' }}>
              📝 Catatan Admin:
            </p>
            <p style={{ margin: '8px 0 0 0', color: '#8e3d6f' }}>{row.notes.rejectNote}</p>
          </div>
        ) : (
          <p className="muted" style={{ fontStyle: 'italic' }}>
            Tidak ada catatan penolakan yang tercatat.
          </p>
        )}

        <div style={{ 
          background: 'linear-gradient(180deg,#f2fff8,#e8fff0)', 
          border: '2px solid #bfead5',
          borderRadius: '12px',
          padding: '16px',
          marginTop: '16px'
        }}>
          <p style={{ 
            margin: '0 0 12px 0', 
            color: '#0f7a4c', 
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🔄</span>
            Langkah Selanjutnya
          </p>
          <p style={{ margin: 0, color: '#0f7a4c', fontSize: '14px' }}>
            Klik tombol <strong>"Ulang Pengajuan"</strong> di bawah untuk memperbaiki dan mengajukan kembali formulir Anda.
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
        <button className="btn" onClick={() => setModalOpen(false)}>Tutup</button>
        <a className="btn primary" href={selectedRow.pdfUrl} target="_blank" rel="noreferrer">
          Unduh Laporan
        </a>
      </>
    ) : modalMode === "rejected" ? (
      <>
        <button className="btn" onClick={() => setModalOpen(false)}>Tutup</button>
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
      <button className="btn" onClick={() => setModalOpen(false)}>Tutup</button>
    )
  ) : null;

// Fungsi untuk download laporan (langsung buka print dialog)
const handleDownloadReport = async (record) => {
  const recordId = record._raw?.id || record._raw?.local_id;
  
  try {
    // Set loading untuk record tertentu
    setGeneratingPreviews(prev => ({ ...prev, [recordId]: true }));
    showToast('Menyiapkan laporan...', 'info');
    
    // Fetch data lengkap dari Supabase
    const { variant, row } = await fetchDetailFromSupabase(record._raw);
    const normalizedData = normalizeDetailRow(variant, row);
    
    // Prepare data untuk preview
    const vv = await prepareForOutput(normalizedData);
    vv.andiTtdUrl = ttdUrl || "/andi-ttd.jpeg";
    vv.__verStatus = record.status?.toLowerCase() === "selesai" ? "disetujui" : null;
    
    // Generate HTML berdasarkan variant
    let html = '';
    if (variant === 'md') {
      html = await buildPreviewHTML_MD(vv);
    } else if (variant === 'll') {
      html = buildPreviewHTML_LL(vv);
    } else if (variant === 'rs') {
      html = buildPreviewHTML_RS(vv);
    }
    
    // Buat new window untuk print
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup diblokir! Izinkan popup untuk download laporan', 'error');
      setGeneratingPreviews(prev => ({ ...prev, [recordId]: false }));
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Survey - ${record.name}</title>
          <style>
            body { 
              margin: 0; 
              font-family: "Times New Roman", Times, serif; 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact;
            }
            @media print {
              @page { margin: 12mm; size: A4; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Tunggu konten load lalu trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        setGeneratingPreviews(prev => ({ ...prev, [recordId]: false }));
        showToast('Laporan siap di-download', 'success');
      }, 500);
    };
    
  } catch (error) {
    console.error('Error generating report:', error);
    showToast('Gagal membuat laporan', 'error');
    setGeneratingPreviews(prev => ({ ...prev, [recordId]: false }));
  }
};

  return (
    <div className="status-page">
      <div className="ornamen theme-sky" aria-hidden="true" />
      <AutoAudio src="/voices/statusproses.mp3" />
      <ToastHost toasts={toasts} onClose={(id) => setToasts((xs) => xs.filter((x) => x.id !== id))} />

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
              <th onClick={() => setSortByDateDesc((v) => !v)} className="th-sort">
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
                    <td data-label="Jenis Dokumen" className="muted">{r.docType}</td>
                    <td data-label="Tanggal Pembaruan">
                      {new Date(r.dateMs).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td data-label="Status Proses">
                      <Badge status={r.status} />
                      {r.status === "Terkirim" && (r.notes?.unverifyNote || r._raw?.unverifyNote) && (
                        <div className="pending-comment">
                          <span className="cmt-icon">💬</span>
                          <span>{r.notes?.unverifyNote || r._raw?.unverifyNote}</span>
                        </div>
                      )}
                    </td>
                    <td data-label="Tindakan">
                      {r.status === "Terkirim" ? (
                        <span className="muted">-</span>
                      ) : r.status === "Diproses" ? (
                        <button
                          className="link link-strong"
                          onClick={() => { openWith("process", r); showToast("Membuka detail proses…", "info"); }}
                        >
                          Lihat Proses
                        </button>
                      ) : r.status === "Selesai" ? (
                        <button
                          className="link link-strong"
                          onClick={() => handleDownloadReport(r)}
                          disabled={generatingPreviews[r._raw?.id || r._raw?.local_id]}
                        >
                          {generatingPreviews[r._raw?.id || r._raw?.local_id] 
                            ? 'Menyiapkan...' 
                            : '📄 Unduh Laporan'}
                        </button>
                      ) : r.status === "Ditolak" ? (
                        <button
                          className="link link-strong"
                          onClick={() => { openWith("rejected", r); showToast("Menampilkan alasan penolakan.", "warn"); }}
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
          <button className="pager" onClick={() => goto(page - 1)} disabled={pageSafe === 1}>
            ‹
          </button>
          {Array.from({ length: totalPages }).slice(0, 7).map((_, idx) => {
            const p = idx + 1;
            return (
              <button key={p} className={`pager ${p === pageSafe ? "active" : ""}`} onClick={() => goto(p)}>
                {p}
              </button>
            );
          })}
          {totalPages > 7 && <span className="ellipsis">…</span>}
          <button className="pager" onClick={() => goto(page + 1)} disabled={pageSafe === totalPages}>
            ›
          </button>
        </div>
      </div>

      {/* Modal serbaguna */}
      <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)} footer={modalFooter}>
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
        .status-page > *:not(.ornamen){ position: relative; z-index: 1; }

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
