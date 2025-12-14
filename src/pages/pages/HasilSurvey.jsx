import React, { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

/* =========================================================
  THEME & UTIL
  ========================================================= */
const THEME = {
  accent: "#F7C7C4",
  accentStrong: "#E59E9A",
  ring: "#FBE6E5",
  ring2: "#F3D1CF",
};
const DEFAULT_TTD = "/andi-ttd.jpeg"; // pastikan ada di /public

const JENIS_SURVEI = [
  { value: "keterjaminan", label: "Keterjaminan Korban" },
  { value: "keabsahan_waris", label: "Keabsahan Ahli Waris" },
  { value: "keabsahan_biaya", label: "Keabsahan Biaya Perawatan" },
  { value: "lainnya", label: "Lainnya" },
];

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
async function fileToDataURL(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function toDataURL(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("not found");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}
function openPrintIframe(srcdoc) {
  const ifr = document.createElement("iframe");
  ifr.style.position = "fixed";
  ifr.style.right = "0";
  ifr.style.bottom = "0";
  ifr.style.width = "0";
  ifr.style.height = "0";
  ifr.style.border = "0";
  document.body.appendChild(ifr);
  ifr.onload = () => {
    setTimeout(() => {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
      setTimeout(() => document.body.removeChild(ifr), 600);
    }, 250);
  };
  ifr.srcdoc = srcdoc;
}
function downloadAs(filename, mime, data) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/* =========================================================
  MIC (Speech-to-Text)
  ========================================================= */
function Mic({ onText, title = "Dikte" }) {
  const recRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Browser belum mendukung Speech Recognition.");
    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
    const r = new SR();
    r.lang = "id-ID";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onText?.(e.results[0][0].transcript);
    r.onend = () => (recRef.current = null);
    recRef.current = r;
    r.start();
  };
  return (
    <button type="button" className="btn mic" onClick={start} title={title} aria-label="Dikte">
      🎤
    </button>
  );
}

/* =========================================================
  PLATE HELPERS & MINI DATABASE
  ========================================================= */
const VEHICLE_DB = {
  "BM-1520-EM": {
    noPolisi:"BM-1520-EM", pemilik:"DIAN WAHYUNI ESMAN", tglMati:"2024-08-28",
    gol:"DP", alamat:"JL. PERTANIAN NO. 13 RT. 003 RW. 002 DURI BARAT MANDAU BENGKALIS",
    hp:"0", nik:"1403095405784695", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1707-ZD": { noPolisi:"BM-1707-ZD", pemilik:"WIDYO SUDIRO", tglMati:"2024-08-03", gol:"DP",
    alamat:"DUSUN LUBUK BARU RT/RW 001/001 MEKAR JAYA KEC. KAMPAR KIRI TENGAH", hp:"", nik:"1401190508610001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1182-JS": { noPolisi:"BM-1182-JS", pemilik:"LUSIANA", tglMati:"2024-08-01", gol:"DP",
    alamat:"JL.PEMUDA NO.32 B RT.002 RW.005 KEL.TAMPAN KEC.PYG.SEKAKI P.BARU", hp:"", nik:"1471115307720002", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-8429-PF": { noPolisi:"BM-8429-PF", pemilik:"AGUSRI", tglMati:"2024-08-02", gol:"DP",
    alamat:"JL. JENDRAL SUDIRMAN RT/RW. 001/004 TELUK NILAP KUBU BABUSSALAM R", hp:"", nik:"1407010208820001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1024-TO": { noPolisi:"BM-1024-TO", pemilik:"RAHIMAH PURBA", tglMati:"2024-08-04", gol:"DP",
    alamat:"JL.SIDODADI / ARENGKA ATAS RT.002/010 KEL.MAHARATU KEC.MPY.DAMAI", hp:"0", nik:"1471096203590001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1809-AD": { noPolisi:"BM-1809-AD", pemilik:"AFRIZAL ABBAS", tglMati:"2024-08-07", gol:"DP",
    alamat:"JL. KETITIRAN NO.17 RT.01/07 KEL. KAMPUNG MELAYU KEC. SUKAJADI PE", hp:"0", nik:"1471011209580001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-8861-CJ": { noPolisi:"BM-8861-CJ", pemilik:"AGUSWEN AMRI", tglMati:"2024-08-01", gol:"DP",
    alamat:"DUSUN SAMUNDAM SELATAN DESA LUBUK TERAP RT 005 RW 001 KEL. LUBUK", hp:"", nik:"1405122008820004", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-9022-FA": { noPolisi:"BM-9022-FA", pemilik:"IBRAHIM", tglMati:"2024-08-07", gol:"DP",
    alamat:"DUSUN KOTO MENANTI RT/RW. 001/001 KEL. SALO TIMUR, KEC. SALO KAB.", hp:"082383428830", nik:"1401131308550001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1804-JZ": { noPolisi:"BM-1804-JZ", pemilik:"IKHSAN NOFRIANSYAH", tglMati:"2024-08-07", gol:"DP",
    alamat:"JL. CEMARA GG. CEMARA I NO.26 RT.02/05 KEL. SUKAMAJU KEC. SAIL PE", hp:"082189343253", nik:"1471030711920021", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1828-KD": { noPolisi:"BM-1828-KD", pemilik:"NURYATI", tglMati:"2024-08-09", gol:"DP",
    alamat:"SUKA RAJA, RT/RW 07/02 KEL. SUKARAJA KEC. LOGAS TANAH DARAT KAB.", hp:"0", nik:"1409084305890001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"
  },
  "BM-1801-X": { noPolisi:"BM-1801-X", pemilik:"NURYATI", tglMati:"2024-08-09", gol:"DP",
    alamat:"SUKA RAJA, RT/RW 07/02 KEL. SUKARAJA KEC. LOGAS TANAH DARAT KAB.", hp:"0", nik:"1409084305890001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1802-X": { noPolisi:"BM-1802-X", pemilik:"RETNO ACHIR SULISTIOWATI    EX.B", tglMati:"2024-08-03", gol:"DP",
    alamat:"KPR.I JL.DUA NO.23 RT.02/04 KEC.TUALANG KAB.SIAK", hp:"0", nik:"1408040003830006", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1803-X": { noPolisi:"BM-1803-X", pemilik:"ARI OKTANIA", tglMati:"2024-08-02", gol:"DP",
    alamat:"BUKIT LEMBAH SUBUR RT/RW 003/001 KERUMUTAN KAB. PELALAWAN RIAU", hp:"0", nik:"1405075510900001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi" 
   },
  "BM-1804-X": { noPolisi:"BM-1804-X", pemilik:"AZHAR", tglMati:"2024-08-04", gol:"DP",
    alamat:"JL. PEMBINA IV KOMP GTI RT.03/10 KEL. LEMBAH SARI KEC. RUMBAI PES", hp:"0", nik:"1471121005660002", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1805-X": { noPolisi:"BM-1805-X", pemilik:"BASRIZAL", tglMati:"2024-08-11", gol:"DP",
    alamat:"JL.SENI ALAM RT.0102 DS BALAI MAKAM KEC.MANDAU DURI", hp:"0", nik:"0", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1806-X": { noPolisi:"BM-1806-X", pemilik:"VERA LINA. D", tglMati:"2024-08-09", gol:"DP",
    alamat:"JL. FAJAR UJUNG RT 03/11 KEL. LB. BARAT KEC. P. SEKAKI PEKANBARU", hp:"0", nik:"1471111003140607", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1807-X": { noPolisi:"BM-1807-X", pemilik:"SUSYANTI SITORUS", tglMati:"2024-08-02", gol:"DP",
    alamat:"JL. JEND. SUDIRMAN RT. 001 RW. 001 BAGAN BATU BAGAN SINEMBAH KABU", hp:"0", nik:"1407054704760006", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1808-X": { noPolisi:"BM-1808-X", pemilik:"RAMADANIATI", tglMati:"2024-08-12", gol:"DP",
    alamat:"JL. SUKAKARYA GG GEMBIRA 71 RT 001 RW 003 KEL. TUAH KARYA KEC. TA", hp:"", nik:"1471085105860041", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1809-X": { noPolisi:"BM-1809-X", pemilik:"BOB MALIANTON", tglMati:"2024-08-01", gol:"DP",
    alamat:"SOREK SATU RT.03 RW.01 KEC.PANGKALAN KURAS KAB.PELALAWAN", hp:"", nik:"1405031202790006", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi" 
   },
  "BM-1810-X": { noPolisi:"BM-1810-X", pemilik:"M. YUSUF", tglMati:"2024-08-06", gol:"DP",
    alamat:"JL. PEPAYA UJUNG RT. 001 RW. 002 KEL. PANGKALAN KERINCI KOTA KEC.", hp:"0", nik:"1405021008660005", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1811-X": { noPolisi:"BM-1811-X", pemilik:"GANI BUDIMAN", tglMati:"2024-08-13", gol:"DP",
    alamat:"MEKAR JAYA RT.020 RW.007 KEL.MEKAR JAYA KEC.PANGKALAN KERINCI KAB", hp:"", nik:"1405022602780007", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1812-X": { noPolisi:"BM-1812-X", pemilik:"SYAFRUDIN.M", tglMati:"2024-08-01", gol:"DP",
    alamat:"JL.PURING BLOK AB 165 RT.14 DUMAI", hp:"0", nik:"0", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi" 
   },
  "BM-1813-X": { noPolisi:"BM-1813-X", pemilik:"NOFRIYANDA", tglMati:"2024-08-05", gol:"DP",
    alamat:"JL.BAHARUDDIN RT.005 RW.005 KEL.PEMATANGKAPAU KEC.KULIM P.BARU", hp:"0", nik:"0", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1814-X": { noPolisi:"BM-1814-X", pemilik:"YOHANES SYARANA MUAL", tglMati:"2024-08-03", gol:"DP",
    alamat:"JL.BINTARA NO.22 RT.03/06 PEKANBARU", hp:"0", nik:"0", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1815-X": { noPolisi:"BM-1815-X", pemilik:"ELMI YN", tglMati:"2024-08-06", gol:"DP",
    alamat:"JL.TAMAN SARI NO.23 RT.003 RW.007 KEL.TKR.SELATAN KEC.BKT.RAYA P.", hp:"0", nik:"1471075709560041", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi" 
  },
  "BM-1816-X": { noPolisi:"BM-1816-X", pemilik:"METRIANTO", tglMati:"2024-08-07", gol:"DP",
    alamat:"JL.PAHLAWAN KERJA GG.SUHADA NO.13 RT.002 RW.002 KEL.MAHARATU KEC.", hp:"0", nik:"0", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1817-X": { noPolisi:"BM-1817-X", pemilik:"ERIYANTO IDRIS", tglMati:"2024-08-09", gol:"DP",
    alamat:"JL. KESUMA GG. NUSA INDAH RT.017/RW.000 KEL JAYA MUKTI KEC. DUMAI", hp:"08127632193", nik:"1472022303700001", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1818-X": { noPolisi:"BM-1818-X", pemilik:"ROSNANI", tglMati:"2024-08-14", gol:"DP",
    alamat:"JL. PROF. M. YAMIN RT/RW. 008/- RIMBA SEKAMPUNG, DUMAI KOTA DUMAI", hp:"0", nik:"1472016409820081", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1819-X": { noPolisi:"BM-1819-X", pemilik:"FRIANDES", tglMati:"2024-08-13", gol:"DP",
    alamat:"JL.BANDES RT.0603 DURI BARAT MANDAU BENGKALIS", hp:"0", nik:"1403091205712210", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  
  },
  "BM-1820-X": { noPolisi:"BM-1820-X", pemilik:"ADINATA", tglMati:"2024-08-08", gol:"DP",
    alamat:"JL CAMAR XI NO.308 PERUM GRIYA SIDOMULYO PERMAI RT/RW 001/012 MAH", hp:"", nik:"1471091310910022", prov:"RIAU", deskripsi:"Hitam - Kendaraan Pribadi"  }

};

function normalizePlate(raw = "") {
  const s = raw.toUpperCase().replace(/\s+/g, " ").trim();
  const m = s.match(/^([A-Z]{1,2})[ -]?(\d{1,4})[ -]?([A-Z]{1,3})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function extractPlates(text = "") {
  const rx = /\b([A-Z]{1,2})[ -]?(\d{1,4})[ -]?([A-Z]{1,3})\b/gi;
  const found = new Set();
  let m;
  while ((m = rx.exec(text)) !== null) {
    const norm = normalizePlate(m[0]);
    if (norm) found.add(norm);
  }
  return [...found];
}
function buildPlatSummary(plates = []) {
  if (!plates.length) return "—";
  const blocks = plates.map((p) => {
    const rec = VEHICLE_DB[p];
    if (!rec) {
      return `${p}\nData plat tidak ada di database.`;
    }
    return [
      `${p}`,
      `Nama Pemilik Terakhir : ${rec.pemilik || '-'}`,
      `Tanggal Mati          : ${rec.tglMati || '-'}`,
      `Kode Golongan         : ${rec.gol || '-'}`,
      `Alamat Pemilik        : ${rec.alamat || '-'}`,
      `Nomor HP              : ${rec.hp || '-'}`,
      `NIK                   : ${rec.nik || '-'}`,
      `Provinsi              : ${rec.prov || '-'}`,
      `Deskripsi Plat        : ${rec.deskripsi || '-'}`,
    ].join("\n");
  });
  return blocks.join("\n\n");
}

/* =========================================================
  HALAMAN: HASIL SURVEI
  ========================================================= */
export default function HasilSurvey({ data = {}, setData, next, back, playBeep }) {

  const set = (k) => (e) => setData?.({ ...data, [k]: e.target.value });

  const ttdMode = data.ttdModeSurvey || "image";
  const setTtdMode = (m) => setData?.({ ...data, ttdModeSurvey: m });

  const [sumbers, setSumbers] = useState(
    data.sumbers || [{ id: Date.now(), identitas: "", ttd: "" }]
  );
  const addRow = () => setSumbers((r) => [...r, { id: Date.now(), identitas: "", ttd: "" }]);
  const delRow = (id) => setSumbers((r) => r.filter((x) => x.id !== id));
  const setRow = (id, key, val) =>
    setSumbers((r) => r.map((x) => (x.id === id ? { ...x, [key]: val } : x)));

  // lampiran
  const att = data.attachSurvey || {};
  const setAtt = (obj) => setData?.({ ...data, attachSurvey: { ...(data.attachSurvey || {}), ...obj } });
  const pushFotos = async (files) => {
    const list = Array.from(files || []);
    const arr = (att.fotoSurvey || []).slice();
    for (const f of list) arr.push({ name: f.name, file: f, url: await fileToDataURL(f) });
    setAtt({ fotoSurvey: arr });
  };

  useEffect(() => {
    const filesNeeded = [
      { key: "ktp", label: "KTP Korban" },
      { key: "kk", label: "Kartu Keluarga (KK)" },
      { key: "bukuTabungan", label: "Buku Tabungan Korban" },
      { key: "formPengajuan", label: "Formulir Pengajuan Santunan Jasaraharja" },
      { key: "formKeteranganAW", label: "Formulir Keterangan Ahli Waris" },
      { key: "skKematian", label: "Surat Keterangan Kematian" },
      { key: "aktaKelahiran", label: "Akta Kelahiran" },
    ];
    filesNeeded.forEach(f => {
      console.log(`Cek dokumen ${f.label}:`, att[f.key] ? "✔ Terunggah" : "⛔ Belum diunggah");
    });
    console.log("Cek fotoSurveyList:", (att.fotoSurvey || []).length ? "✔ Terunggah" : "⛔ Belum diunggah");
  }, [att]);

  const sifatCidera = data.sifatCidera || ""; // "MD" | "LL"
  const jenisSurvei = data.jenisSurvei || "";

  const v = {
    noPL: data.noPL || "",
    hariTanggal: data.hariTanggal || "",
    petugasSurvei: data.petugas || data.petugasSurvei || "",
    jenisSurvei,
    jenisSurveiLainnya: data.jenisSurveiLainnya || "",
    namaKorban: data.korban || data.namaKorban || "",
    noBerkas: data.noBerkas || "",
    alamatKorban: data.alamatKorban || "",
    tempatKecelakaan: data.tempatKecelakaan || data.lokasiKecelakaan || "",
    tanggalKecelakaan: data.tanggalKecelakaan || "",
    hubunganSesuai: data.hubunganSesuai ?? "",
    uraian: data.uraianSurvei || data.uraian || "",
    kesimpulan: data.kesimpulanSurvei || "",
    pejabatMengetahuiName: data.pejabatMengetahuiName || "Andi Raharja, S.A.B",
    pejabatMengetahuiJabatan: data.pejabatMengetahuiJabatan || "Kepala Bagian Operasional",
    pejabatMengetahuiTtd: data.pejabatMengetahuiTtd || "",
  };

  const [platRows, setPlatRows] = useState({});
  const [loadingPlat, setLoadingPlat] = useState(false);

  const detectedPlates = useMemo(() => extractPlates(v.uraian || ""), [v.uraian]);

  useEffect(() => {
    const fetchPlat = async () => {
      const plates = (detectedPlates || []).map(normalizePlate).filter(Boolean);
      if (!plates.length) {
        setPlatRows({});
        return;
      }
      setLoadingPlat(true);
      const { data: rows, error } = await supabase
        .from("data_sw")
        .select("no_polisi,nama_pemilik_terakhir,tgl_mati_yad,kode_golongan,alamat_pemilik_terakhir,nomor_hp,nik,prov_nama,deskripsi_plat")
        .in("no_polisi", plates);

      if (error) {
        console.error("❌ Gagal fetch data plat:", error.message);
        setPlatRows({});
      } else {
        const map = {};
        (rows || []).forEach(r => { map[(r.no_polisi || "").toUpperCase()] = r; });
        setPlatRows(map);
      }
      setLoadingPlat(false);
    };
    fetchPlat();
  }, [detectedPlates]);

  const platSummary = useMemo(() => {
    const plates = (detectedPlates || []).map(normalizePlate).filter(Boolean);
    if (!plates.length) return "—";

    const lines = plates.map(p => {
      const rec = platRows[p]; // hasil dari Supabase .in('no_polisi', ...)
      if (!rec) {
        // OPTIONAL fallback ke VEHICLE_DB kalau masih mau dipakai:
        const off = VEHICLE_DB?.[p];
        if (off) {
          return [
            `${p}`,
            `Nama Pemilik Terakhir : ${off.pemilik || "-"}`,
            `Tanggal Mati          : ${off.tglMati || "-"}`,
            `Kode Golongan         : ${off.gol || "-"}`,
            `Alamat Pemilik        : ${off.alamat || "-"}`,
            `Nomor HP              : ${off.hp || "-"}`,
            `NIK                   : ${off.nik || "-"}`,
            `Provinsi              : ${off.prov || "-"}`,
            `Deskripsi Plat        : ${off.deskripsi || "-"}`,
          ].join("\n");
        }
        // kalau tidak ada di DB & tidak ada fallback
        return `${p}\nData plat tidak ada di database.`;
      }
      // Format dari row Supabase
      return [
        `${p}`,
        `Nama Pemilik Terakhir : ${rec.nama_pemilik_terakhir || "-"}`,
        `Tanggal Mati          : ${fmtDate(rec.tgl_mati_yad)}`,
        `Kode Golongan         : ${rec.kode_golongan || "-"}`,
        `Alamat Pemilik        : ${rec.alamat_pemilik_terakhir || "-"}`,
        `Nomor HP              : ${rec.nomor_hp || "-"}`,
        `NIK                   : ${rec.nik || "-"}`,
        `Provinsi              : ${rec.prov_nama || "-"}`,
        `Deskripsi Plat        : ${rec.deskripsi_plat || "-"}`,
      ].join("\n");
    });

    return lines.join("\n\n");
  }, [detectedPlates, platRows]);


  // validasi
  const canNext = useMemo(() => {
    const base =
      v.petugasSurvei.trim() &&
      (v.hariTanggal || "").toString().length > 0 &&
      v.namaKorban.trim() &&
      v.tempatKecelakaan.trim();

    // yang bener-bener minimal WAJIB
    const lampiranMinimal =
      !!att.mapSS?.url &&
      !!att.barcode?.url &&
      (att.fotoSurvey || []).length > 0 &&
      !!att.petugasTtd?.url;

    // MD & LL sama-sama cuma butuh lampiran minimal
    if (sifatCidera === "MD" || sifatCidera === "LL") {
      return base && lampiranMinimal;
    }

    // kalau suatu saat ada jenis lain
    return base;
  }, [v, att, sifatCidera, sumbers]);

  const onUploadTtd = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataURL = await fileToDataURL(f);
    setData?.({ ...data, pejabatMengetahuiTtd: dataURL, ttdModeSurvey: "image" });
  };

  /* =================== CETAK & DOWNLOAD =================== */
  const buildHTML = async (mode = "print") => {
    let ttdData = null;
    if (ttdMode === "image") {
      ttdData = v.pejabatMengetahuiTtd || (await toDataURL(DEFAULT_TTD).catch(() => null));
    }
    const petugasTtdSrc = att.petugasTtd?.url || null;
    const forPrint = {
      ...v,
      ttdSrc: ttdData || null,
      petugasTtdSrc,
      sumbers,
      sifatCidera,
      platSummary, // tampil di bawah tabel pada output
    };
    return mode === "doc" ? makeDocHTML(forPrint) : makePrintHTML(forPrint);
  };

  const handlePrint = async () => {
    try {
      playBeep?.();
      const srcdoc = await buildHTML("print");
      openPrintIframe(srcdoc);
    } catch (e) {
      console.error(e);
      alert("Gagal menyiapkan PDF: " + e.message);
    }
  };

  const handleDownloadDoc = async () => {
    try {
      const html = await buildHTML("doc");
      downloadAs("Laporan_Hasil_Survei_AW.doc", "application/msword;charset=utf-8", html);
    } catch (e) {
      console.error(e);
      alert("Gagal menyiapkan dokumen: " + e.message);
    }
  };

  const handleNext = () => {
    if (!canNext) return alert("Lengkapi isian & lampiran wajib terlebih dahulu.");
    
    console.log("🔍 DATA SUMBER INFORMASI sebelum save:");
    console.log("   - Jumlah sumbers:", sumbers.length);
    
    sumbers.forEach((sumber, index) => {
      console.log(`   - Sumber ${index + 1}:`, {
        identitas: sumber.identitas,
        hasFoto: !!sumber.foto,
        fotoIsArray: Array.isArray(sumber.foto),
        fotoLength: sumber.foto?.length || 0,
        fotoStructure: sumber.foto?.map(f => ({
          hasFile: !!f.file,
          hasDataURL: !!f.dataURL,
          name: f.name
        }))
      });
    });

     const nextData = { 
        ...data, 
        sumbers,
        attachSurvey: att
      };

    // ✅ DEBUG: Cek data sebelum save
    console.log("🔍 DATA sebelum saveSurveyToSupabase:");
    console.log("   - attachSurvey:", data.attachSurvey);
    console.log("   - attachSurvey.fotoSurvey:", data.attachSurvey?.fotoSurvey);
    console.log("   - fotoSurveyList:", data.fotoSurveyList);
    
    setData?.({ ...data, sumbers });
    playBeep?.();
    next?.();
  };

  return (
    <div className="sv-wrap container">
      <div className="head">
        <div>
          <h2 className="title">Laporan Hasil Survei</h2>
          <div className="chips">
            <span className="chip">Langkah 3/5</span>
            <span className="chip alt">Sifat Cidera: {sifatCidera || "—"}</span>
            <span className="chip alt">
              Jenis Survei:{" "}
              {JENIS_SURVEI.find((j) => j.value === jenisSurvei)?.label ||
                (data.jenisSurveiLainnya ? `Lainnya: ${data.jenisSurveiLainnya}` : "—")}
            </span>
          </div>
        </div>
        {/* <div className="right-controls">
          <button type="button" className="btn ghost" onClick={handleDownloadDoc}>Download Dokumen</button>
          <button type="button" className="btn ghost" onClick={handlePrint}>Cetak PDF</button>
        </div> */}
      </div>

      {/* HEADER FORM */}
      <section className="card">
        <div className="row">
          <div>
            <label className="label">No. PL</label>
            <input className="input" value={v.noPL} onChange={set("noPL")} placeholder="PL/...." />
          </div>
          <div>
            <label className="label">Hari/Tanggal Survei</label>
            <input type="date" className="input" value={v.hariTanggal} onChange={set("hariTanggal")} />
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Petugas Survei <small className="hint">• Dikte</small></label>
            <div className="with-mic">
              <input className="input" value={v.petugasSurvei} onChange={set("petugasSurvei")} />
              <Mic onText={(t) => setData?.({ ...data, petugasSurvei: `${v.petugasSurvei} ${t}`.trim() })} />
            </div>
          </div>
          <div>
            <label className="label">Jenis Survei</label>
            <div className="seg">
              {JENIS_SURVEI.map((j) => (
                <label key={j.value} className={`pill ${jenisSurvei === j.value ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="jenis"
                    checked={jenisSurvei === j.value}
                    onChange={() =>
                      setData?.({
                        ...data,
                        jenisSurvei: j.value,
                        jenisSurveiLainnya: j.value === "lainnya" ? data.jenisSurveiLainnya || "" : "",
                      })
                    }
                  />
                  <span>{j.label}</span>
                </label>
              ))}
            </div>
            {jenisSurvei === "lainnya" && (
              <input
                className="input"
                placeholder="Tuliskan jenis survei lainnya…"
                value={data.jenisSurveiLainnya || ""}
                onChange={set("jenisSurveiLainnya")}
              />
            )}
          </div>
        </div>
      </section>

      {/* DATA KORBAN */}
      <section className="card">
        <div className="row-auto-2">
          <div>
            <label className="label">Nama Korban <small className="hint">• Dikte</small></label>
            <div className="with-mic">
              <input className="input" value={v.namaKorban} onChange={set("namaKorban")} />
              <Mic onText={(t) => setData?.({ ...data, namaKorban: `${v.namaKorban} ${t}`.trim() })} />
            </div>
          </div>

          <div>
            <label className="label">No. Berkas</label>
            <input className="input" value={v.noBerkas} onChange={set("noBerkas")} />
          </div>
        </div>

        <div className="row-auto-1">
          <div>
            <label className="label">
              Alamat Korban <small className="hint">• Dikte</small>
              <span className="info-icon cursor-pointer text-blue-500"
                title={`Mohon tuliskan alamat sejelas mungkin, meliputi:\n\n- Nama jalan\n- Kelurahan & Kecamatan\n- Titik koordinat`}>
                ℹ️
              </span>
            </label>
            <div className="with-mic">
              <textarea className="textarea" rows={3} value={v.alamatKorban} onChange={set("alamatKorban")} />
              <Mic onText={(t) => setData?.({ ...data, alamatKorban: `${v.alamatKorban} ${t}`.trim() })} />
            </div>
          </div>
        </div>

        <div className="row-auto-3">
          <div>
            <label className="label">
              Tempat Kecelakaan <small className="hint">• Dikte</small>
              <span className="info-icon cursor-pointer text-blue-500"
                title={`Mohon tuliskan alamat sejelas mungkin, meliputi:\n\n- Nama jalan\n- Dekat toko/gedung terkenal\n- Kelurahan & Kecamatan\n- Titik koordinat`}>
                ℹ️
              </span>
            </label>
            <div className="with-mic">
              <textarea className="textarea" rows={3} value={v.tempatKecelakaan} onChange={set("tempatKecelakaan")} />
              <Mic onText={(t) => setData?.({ ...data, tempatKecelakaan: `${v.tempatKecelakaan} ${t}`.trim() })} />
            </div>
          </div>

          <div>
            <label className="label">Tanggal Kecelakaan</label>
            <input type="date" className="input" value={data.tanggalKecelakaan} onChange={set("tanggalKecelakaan")} />
          </div>

          <div>
            <label className="label">Kesesuaian Hubungan AW</label>
            <select
              className="select"
              value={v.hubunganSesuai === "" ? "" : v.hubunganSesuai ? "sesuai" : "tidak"}
              onChange={(e) => setData?.({ ...data, hubunganSesuai: e.target.value === "sesuai" })}
            >
              <option value="">— Pilih —</option>
              <option value="sesuai">Sesuai</option>
              <option value="tidak">Tidak Sesuai</option>
            </select>
          </div>
        </div>
      </section>

      {/* SUMBER INFORMASI */}
      <section className="card">
        <div className="label">Sumber Informasi</div>
        <div className="table-like">
          <div className="th">No</div>
          <div className="th">Identitas/Detil Sumber Informasi & Metode Perolehan</div>
          <div className="th">Foto (TTD (PNG) / Saksi Mata)</div>

          {sumbers.map((r, idx) => (
            <React.Fragment key={r.id}>
              <div className="td no">{idx + 1}</div>

              <div className="td">
                <textarea
                  className="textarea"
                  rows={2}
                  value={r.identitas}
                  onChange={(e) => setRow(r.id, "identitas", e.target.value)}
                />
              </div>

              <div className="td">
                {/* Upload foto */}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    const fotoObjects = await Promise.all(
                      files.map(async (f) => {
                        const dataURL = await new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result);
                          reader.onerror = () => resolve("");
                          reader.readAsDataURL(f);
                        });
                        
                        // ✅ FORMAT YANG DIHARAPKAN oleh saveSurveyToSupabase
                        return {
                          file: f,                    // File object
                          dataURL: dataURL,           // Data URL untuk preview
                          name: f.name,               // Nama file
                          size: f.size,               // Ukuran file
                          type: f.type                // Tipe file
                        };
                      })
                    );
                    
                    // Simpan dengan format yang benar
                    setRow(r.id, "foto", fotoObjects.filter(Boolean));
                  }}
                />

                {/* Preview foto */}
                {r.foto && Array.isArray(r.foto) && r.foto.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {r.foto.map((fotoObj, i) => (
                      <img
                        key={i}
                        src={fotoObj.dataURL || fotoObj} // Support both old and new format
                        alt={`foto-${i}`}
                        style={{ width: "80px", height: "auto", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    ))}
                  </div>
                )}

                {sumbers.length > 1 && (
                  <button className="btn small" onClick={() => delRow(r.id)} style={{ marginTop: 6 }}>
                    Hapus
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn ghost" onClick={addRow}>+ Tambah Baris</button>
        </div>
      </section>

      {/* URAIAN & KESIMPULAN */}
      <section className="card">
        <label className="label">
          Uraian & Kesimpulan Hasil Survei <small className="hint">• Dikte</small>
          <span
            className="info-icon cursor-pointer text-blue-500"
            title={`Tuliskan hasil survei secara ringkas dan jelas, meliputi:\n\n• Nomor polisi / plat kendaraan yang terlibat\n• Nama lokasi kejadian (jalan, kelurahan, kecamatan)\n• Nama pengendara dan korban\n• Jenis kendaraan yang terlibat\n• Kronologi singkat kejadian\n• Hasil pemeriksaan atau keterangan RS (bila ada)\n• Kesimpulan akhir apakah korban terjamin atau tidak`}
          >
            ℹ️
          </span>
        </label>

        <div className="with-mic">
          <textarea
            className="textarea"
            rows={6}
            value={v.uraian}
            onChange={(e) =>
              setData(prev => ({
                ...prev,
                uraian: e.target.value,
                uraianSurvei: e.target.value,
              }))
            }
          />
          <Mic
            onText={(t) =>
              setData((prev) => ({
                ...prev,
                uraian: `${prev.uraian || ""} ${t}`.trim(),
                uraianSurvei: `${prev.uraianSurvei || ""} ${t}`.trim(),
              }))
            }
          />
        </div>

        {/* Badge plat DIPINDAH ke bawah textarea */}
        {!!detectedPlates.length && (
          <div className="plat-chips">
            {detectedPlates.map((p) => (
              <span
                key={p}
                className="chip alt"
                title={
                  VEHICLE_DB[p]
                    ? `${VEHICLE_DB[p].pemilik} • ${VEHICLE_DB[p].deskripsi}`
                    : "Data plat tidak ada di database"
                }
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* INFO PLAT: tampil DI BAWAH tabel */}
        <div className="info-plat">
          <div className="label small">Info Plat (auto dari uraian)</div>
          <pre className="plat-box">{platSummary}</pre>
        </div>
      </section>

      {/* LAMPIRAN */}
      <section className="card">
        <div className="label">Lampiran</div>
        {sifatCidera === "MD" && (
          <div className="grid-attach">
            {/* KTP */}
            <div className="attach">
              <FilePick
                label="KTP"
                onPick={(f) => setAtt({ ...att, ktp: f })}
                file={att.ktp}
              />
              {att.ktp?.url && (
                <div className="preview">
                  <img src={att.ktp.url} alt="KTP" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, ktp: null })}
                    aria-label="Hapus KTP"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Buku Tabungan */}
            <div className="attach">
              <FilePick
                label="Buku Tabungan"
                onPick={(f) => setAtt({ ...att, bukuTabungan: f })}
                file={att.bukuTabungan}
              />
              {att.bukuTabungan?.url && (
                <div className="preview">
                  <img src={att.bukuTabungan.url} alt="Buku Tabungan" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, bukuTabungan: null })}
                    aria-label="Hapus Buku Tabungan"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Formulir Pengajuan Santunan */}
            <div className="attach">
              <FilePick
                label="Formulir Pengajuan Santunan"
                onPick={(f) => setAtt({ ...att, formPengajuan: f })}
                file={att.formPengajuan}
              />
              {att.formPengajuan?.url && (
                <div className="preview">
                  <img src={att.formPengajuan.url} alt="Formulir Pengajuan Santunan" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, formPengajuan: null })}
                    aria-label="Hapus Formulir Pengajuan Santunan"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Formulir Keterangan Ahli Waris */}
            <div className="attach">
              <FilePick
                label="Formulir Keterangan Ahli Waris"
                onPick={(f) => setAtt({ ...att, formKeteranganAW: f })}
                file={att.formKeteranganAW}
              />
              {att.formKeteranganAW?.url && (
                <div className="preview">
                  <img src={att.formKeteranganAW.url} alt="Formulir Keterangan Ahli Waris" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, formKeteranganAW: null })}
                    aria-label="Hapus Formulir Keterangan Ahli Waris"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Surat Keterangan Kematian */}
            <div className="attach">
              <FilePick
                label="Surat Keterangan Kematian"
                onPick={(f) => setAtt({ ...att, skKematian: f })}
                file={att.skKematian}
              />
              {att.skKematian?.url && (
                <div className="preview">
                  <img src={att.skKematian.url} alt="Surat Keterangan Kematian" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, skKematian: null })}
                    aria-label="Hapus Surat Keterangan Kematian"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Kartu Keluarga (KK) */}
            <div className="attach">
              <FilePick
                label="Kartu Keluarga (KK)"
                onPick={(f) => setAtt({ ...att, kk: f })}
                file={att.kk}
              />
              {att.kk?.url && (
                <div className="preview">
                  <img src={att.kk.url} alt="Kartu Keluarga" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, kk: null })}
                    aria-label="Hapus Kartu Keluarga"
                  >✕</button>
                </div>
              )}
            </div>

            {/* Akta Kelahiran */}
            <div className="attach">
              <FilePick
                label="Akta Kelahiran"
                onPick={(f) => setAtt({ ...att, aktaKelahiran: f })}
                file={att.aktaKelahiran}
              />
              {att.aktaKelahiran?.url && (
                <div className="preview">
                  <img src={att.aktaKelahiran.url} alt="Akta Kelahiran" />
                  <button
                    className="btn-delete-thumb"
                    onClick={() => setAtt({ ...att, aktaKelahiran: null })}
                    aria-label="Hapus Akta Kelahiran"
                  >✕</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FOTO SURVEY */}
        <div style={{ marginTop: 10 }}>
          <label className="label">Foto Survey (boleh banyak, tanpa batas)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => pushFotos(e.target.files)}
          />
          {!!(att.fotoSurvey || []).length && (
            <div className="thumbs">
              {(att.fotoSurvey || []).map((x, i) => (
                <div key={i} className="preview">
                  <img src={x.url} alt={x.name} />
                  <button
                    className="btn-delete-thumb"
                    onClick={() =>
                      setAtt({
                        ...att,
                        fotoSurvey: att.fotoSurvey.filter((_, idx) => idx !== i),
                      })
                    }
                    aria-label="Hapus foto"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SS Peta / Map */}
        <div style={{ marginTop: 10 }}>
          <label className="label">SS Peta / Map</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const url = await fileToDataURL(f);
              setAtt({ ...att, mapSS: { name: f.name, file: f, url } });
            }}
          />
          {att.mapSS?.url && (
            <div className="thumbs">
              <div className="preview">
                <img src={att.mapSS.url} alt="SS Map" />
                <button
                  className="btn-delete-thumb"
                  onClick={() => setAtt({ ...att, mapSS: null })}
                >✕</button>
              </div>
            </div>
          )}
        </div>

        {/* Barcode / QR */}
        <div style={{ marginTop: 10 }}>
          <label className="label">Barcode / QR</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const url = await fileToDataURL(f);
              setAtt({ ...att, barcode: { name: f.name, file: f, url } });
            }}
          />
          {att.barcode?.url && (
            <div className="thumbs">
              <div className="preview">
                <img src={att.barcode.url} alt="Barcode/QR" />
                <button
                  className="btn-delete-thumb"
                  onClick={() => setAtt({ ...att, barcode: null })}
                >✕</button>
              </div>
            </div>
          )}
        </div>

        {/* TTD Petugas */}
        <div style={{ marginTop: 10 }}>
          <label className="label">TTD Petugas (PNG, latar transparan disarankan)</label>
          <input
            type="file"
            accept="image/png"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.type !== "image/png") {
                alert("Format harus PNG.");
                return;
              }
              const url = await fileToDataURL(f);
              setAtt({ ...att, petugasTtd: { name: f.name, file: f, url } });
            }}
          />
          {att.petugasTtd?.url && (
            <div className="thumbs">
              <div className="preview preview--wide">{/* lebih lebar utk tanda tangan */}
                <img src={att.petugasTtd.url} alt="TTD Petugas" />
                <button
                  className="btn-delete-thumb"
                  onClick={() => setAtt({ ...att, petugasTtd: null })}
                >✕</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AKSI */}
      <div className="actions">
        <button className="btn ghost" onClick={back}>Kembali</button>
        <button className="btn rose" onClick={handleNext} disabled={!canNext}>Selanjutnya</button>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* =========================================================
  KOMPONEN BANTUAN
  ========================================================= */
function FilePick({ label, onPick, file }) {
  return (
    <div className="filepick">
      <div className="label">{label}</div>
      <input type="file" onChange={(e) => onPick(e.target.files?.[0] || null)} />
      {file && <div className="helper">• {file.name}</div>}
    </div>
  );
}

/* =========================================================
  BUILDER HTML CETAK & WORD (INFO PLAT DI BAWAH)
  ========================================================= */
function makePrintHTML(v) {
  const tableRows = (v.sumbers || []).map((r, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${escapeHtml(r.identitas || "")}</td>
      <td>${escapeHtml(r.ttd || "")}</td>
    </tr>
  `).join("");

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
  .sign-img{ max-height: 28mm }
  .name{ font-weight:bold; text-decoration:underline; }
  .plat-section{ margin: 6mm 0 0 }
  .plat-box{ border:0.3mm solid #000; padding:2mm; white-space:pre-wrap; min-height:14mm }
  </style></head><body>
  <h1>LAPORAN HASIL SURVEI</h1>
  <h2>APLIKASI MOBILE PELAYANAN</h2>

  <div class="kv">
    <div>No. PL</div><div>:</div><div>${escapeHtml(v.noPL || "-")}</div>
    <div>Hari/Tanggal Survei</div><div>:</div><div>${escapeHtml(fmtDate(v.hariTanggal))}</div>
    <div>Petugas Survei</div><div>:</div><div>${escapeHtml(v.petugasSurvei || "-")}</div>
    <div>Jenis Survei</div><div>:</div><div>${escapeHtml(v.jenisSurvei || "")} ${escapeHtml(v.jenisSurvei === "lainnya" ? (v.jenisSurveiLainnya || "") : "")}</div>

    <div>Nama Korban</div><div>:</div><div>${escapeHtml(v.namaKorban || "-")}</div>
    <div>No. Berkas</div><div>:</div><div>${escapeHtml(v.noBerkas || "-")}</div>
    <div>Alamat Korban</div><div>:</div><div>${escapeHtml(v.alamatKorban || "-")}</div>
    <div>Tempat/Tgl. Kecelakaan</div><div>:</div><div>${escapeHtml(v.tempatKecelakaan || "-")} / ${escapeHtml(fmtDate(v.tanggalKecelakaan))}</div>
    <div>Kesesuaian Hubungan AW</div><div>:</div><div>${v.hubunganSesuai === "" ? "-" : (v.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")}</div>
  </div>

  <div style="font-weight:bold;margin:0 0 2mm">Sumber Informasi :</div>
  <table>
    <thead><tr>
      <th style="width:10mm">No</th>
      <th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th>
      <th style="width:35mm">Tanda Tangan</th>
    </tr></thead>
    <tbody>${tableRows || '<tr><td style="text-align:center">1</td><td></td><td></td></tr>'}</tbody>
  </table>

  <div class="plat-section">
    <div style="font-weight:bold;margin:0 0 2mm">Info Plat (auto dari uraian) :</div>
    <div class="plat-box">${escapeHtml(v.platSummary || "—")}</div>
  </div>

  <div style="font-weight:bold;margin:6mm 0 2mm">Uraian & Kesimpulan Hasil Survei :</div>
  <div class="box">${escapeHtml(v.uraian || "")}</div>

  <p style="margin:6mm 0 10mm;font-size:11pt">
    Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
  </p>

  <div class="signs">
    <div>
      <div class="lbl">Mengetahui,</div>
      <div class="space">
        ${v.ttdSrc ? `<img class="sign-img" src="${v.ttdSrc}" />` : ""}
      </div>
      <div class="name">${escapeHtml(v.pejabatMengetahuiName)}</div>
      <div>${escapeHtml(v.pejabatMengetahuiJabatan)}</div>
    </div>
    <div>
      <div class="lbl">Petugas Survei,</div>
      <div class="space">
        ${v.petugasTtdSrc ? `<img class="sign-img" src="${v.petugasTtdSrc}" />` : ""}
      </div>
      <div class="name">${escapeHtml(v.petugasSurvei || "........................................")}</div>
    </div>
  </div>
  </body></html>`;
}

function makeDocHTML(v) {
  const esc = (x = "") => escapeHtml(x);
  const kvRow = (label, value) => `
    <tr>
      <td style="width:170pt;padding:3pt 4pt;vertical-align:top">${label}</td>
      <td style="width:10pt;padding:3pt 0;vertical-align:top">:</td>
      <td style="padding:3pt 4pt;vertical-align:top;border-bottom:0.6pt dotted #000">${value}</td>
    </tr>`;

  const kv = [
    kvRow("No. PL", esc(v.noPL || "-")),
    kvRow("Hari/Tanggal Survei", esc(fmtDate(v.hariTanggal))),
    kvRow("Petugas Survei", esc(v.petugasSurvei || "-")),
    kvRow(
      "Jenis Survei",
      esc(v.jenisSurvei === "lainnya"
        ? `Lainnya: ${v.jenisSurveiLainnya || ""}`
        : (v.jenisSurvei || "-"))
    ),
    kvRow("Nama Korban", esc(v.namaKorban || "-")),
    kvRow("No. Berkas", esc(v.noBerkas || "-")),
    kvRow("Alamat Korban", esc(v.alamatKorban || "-")),
    kvRow("Tempat/Tgl. Kecelakaan", `${esc(v.tempatKecelakaan || "-")} / ${esc(fmtDate(v.tanggalKecelakaan))}`),
    kvRow("Kesesuaian Hubungan AW", v.hubunganSesuai === "" ? "-" : (v.hubunganSesuai ? "Sesuai" : "Tidak Sesuai")),
  ].join("");

  const sumberRows = (v.sumbers?.length ? v.sumbers : [{identitas:"",ttd:""}])
    .map((r, i) => `
      <tr>
        <td style="border:0.6pt solid #000;padding:4pt;text-align:center;width:22pt">${i + 1}</td>
        <td style="border:0.6pt solid #000;padding:4pt">${esc(r.identitas || "")}</td>
        <td style="border:0.6pt solid #000;padding:4pt;width:120pt">${esc(r.ttd || "")}</td>
      </tr>
    `).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Laporan Hasil Survei (DOC)</title>
  <style>
    body{ font-family:"Times New Roman",serif; font-size:11pt; color:#000; margin:0 }
    .page{ width: 180mm; margin: 12mm auto }
    h1{ margin:0; font-size:16pt; text-align:center; font-weight:bold }
    h2{ margin:2pt 0 8pt; font-size:12pt; text-align:center }
    table{ border-collapse:collapse; width:100% }
    .kv td{ padding:3pt 4pt; vertical-align:top }
    .tbl th,.tbl td{ border:0.6pt solid #000; padding:4pt; vertical-align:top }
    .box{ border:0.6pt solid #000; min-height:110pt; padding:4pt; white-space:pre-wrap }
    .signRow td{ vertical-align:top; width:50% }
    .signLbl{ margin:10pt 0 16pt }
    .ttdBox{ height:85pt }
    .ttdImg{ max-height:85pt }
    .name{ font-weight:bold; text-decoration:underline }
    .platBox{ border:0.6pt solid #000; padding:4pt; white-space:pre-wrap; min-height:60pt }
  </style>
</head>
<body>
  <div class="page">
    <h1>LAPORAN HASIL SURVEI</h1>
    <h2>APLIKASI MOBILE PELAYANAN</h2>

    <table class="kv">
      ${kv}
    </table>

    <div style="font-weight:bold;margin:8pt 0 4pt">Sumber Informasi :</div>
    <table class="tbl">
      <thead>
        <tr>
          <th style="width:22pt">No</th>
          <th>Identitas/Detil Sumber Informasi dan Metode Perolehan</th>
          <th style="width:120pt">Tanda Tangan</th>
        </tr>
      </thead>
      <tbody>
        ${sumberRows}
      </tbody>
    </table>

    <div style="font-weight:bold;margin:10pt 0 4pt">Info Plat (auto dari uraian) :</div>
    <div class="platBox">${esc(v.platSummary || "—")}</div>

    <div style="font-weight:bold;margin:10pt 0 4pt">Uraian & Kesimpulan Hasil Survei :</div>
    <div class="box">${esc(v.uraian || "")}</div>

    <p style="margin:10pt 0">
      Demikian laporan hasil survei ini dibuat dengan sebenarnya sesuai dengan informasi yang diperoleh.
    </p>

    <table class="signRow">
      <tr>
        <td>
          <div class="signLbl">Mengetahui,</div>
          <div class="ttdBox">
            ${v.ttdSrc ? `<img class="ttdImg" src="${v.ttdSrc}" />` : "&nbsp;"}
          </div>
          <div class="name">${esc(v.pejabatMengetahuiName)}</div>
          <div>${esc(v.pejabatMengetahuiJabatan)}</div>
        </td>
        <td>
          <div class="signLbl">Petugas Survei,</div>
          <div class="ttdBox">
            ${v.petugasTtdSrc ? `<img class="ttdImg" src="${v.petugasTtdSrc}" />` : "&nbsp;"}
          </div>
          <div class="name">${esc(v.petugasSurvei || "")}</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/* =========================================================
  CSS SCREEN (rapi + responsif)
  ========================================================= */
const css = `
/* ---------- base ---------- */
.sv-wrap{
  --accent:${THEME.accent}; --accent-strong:${THEME.accentStrong};
  --ring:${THEME.ring}; --ring-2:${THEME.ring2}; --ink:#2b2326; --muted:#776b71;
  color:var(--ink);
  overflow-x: clip;
}
.sv-wrap, .sv-wrap *{ box-sizing: border-box }
.sv-wrap.container{ padding-inline: clamp(10px,3.6vw,18px) }

/* ---------- header ---------- */
.head{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap }
.title{ margin:0; font-size:20px; font-weight:900; color:var(--accent-strong) }
.chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:6px }
.chip{ background:#FFF1F0; border:1.5px solid var(--ring-2); border-radius:999px; padding:6px 10px; font-weight:800; font-size:12px }
.chip.alt{ background:#FFE9E7 }
.right-controls{ display:flex; gap:8px; flex-wrap:wrap; margin-left:auto }

/* ---------- cards & grid ---------- */
.card{
  background:#fff; border:2px solid var(--ring-2); border-radius:16px;
  padding:clamp(14px,2.2vw,18px); margin-bottom:12px;
  box-shadow:0 10px 28px rgba(247,199,196,.25);
  overflow:hidden;
}
.card > *{ min-width:0 }

:root{
  --sv-gap: clamp(10px, 3vw, 16px);
  --sv-col-2-min: clamp(240px, 90vw, 340px);
  --sv-col-3-min: clamp(180px, 44vw, 240px);
}

.row{
  display:grid;
  grid-auto-flow: row dense;
  grid-template-columns: repeat(auto-fit, minmax(var(--sv-col-2-min), 1fr));
  gap: var(--sv-gap);
  align-items: start;
}
.row-3{
  display:grid;
  grid-auto-flow: row dense;
  grid-template-columns: repeat(auto-fit, minmax(var(--sv-col-3-min), 1fr));
  gap: var(--sv-gap);
  align-items: start;
}
.row-auto-1{ display:grid; grid-template-columns:1fr; gap:var(--sv-gap) }
.row-auto-2{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:var(--sv-gap) }
.row-auto-3{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:var(--sv-gap) }

/* ---------- form controls ---------- */
.label{ font-weight:800; margin-bottom:8px; display:block }
.label.small{ font-size:13px; opacity:.9; margin-top:10px }
.hint{ color:#c06; font-weight:800 }
.input,.select,.textarea{
  width:100%; padding:12px 14px; border-radius:12px; border:2px solid var(--ring-2);
  background:#FFF6F5; outline:none; font-size:15px; color:var(--ink); min-width:0;
}
.input:focus,.select:focus,.textarea:focus{ border-color:var(--accent); box-shadow:0 0 0 3px var(--ring) }

/* mic di kanan input */
.with-mic{ display:grid; grid-template-columns:1fr 44px; gap:10px; align-items:center }
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:.4rem; border-radius:14px; padding:10px 14px; font-weight:800; cursor:pointer; border:2px solid transparent }
.btn.ghost{ background:#FFE9E7; border-color:#F3B6B2; color:#6b2a35 }
.btn.rose{ background:#F7C7C4; border-color:#F3B6B2; color:#3b0a1a }
.btn.small{ padding:6px 10px; font-size:12px }
.btn.mic{ background:#fff; border:2px solid var(--ring-2) }

/* ---------- tabel sumber info (3 kolom) ---------- */
.table-like{
  display:grid;
  grid-template-columns:56px 1fr minmax(170px,240px);
  border:2px solid var(--ring-2); border-radius:12px; overflow:hidden
}
.th,.td{ padding:10px; border-bottom:1px solid #efefef; background:#fff }
.th{ font-weight:900; background:#FFF4F4 }
.td.no{ text-align:center }

/* Info plat di bawah */
.info-plat{ margin-top:12px }
.plat-box{
  background:#FFF6F5; border:2px solid var(--ring-2); border-radius:12px;
  padding:10px 12px; white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.plat-chips{ margin-top:8px; display:flex; gap:6px; flex-wrap:wrap }

/* mobile */
@media (max-width:720px){
  .table-like{ display:block }
  .th{ display:none }
  .td{ display:block; border-bottom:1px solid #efefef }
  .td.no::before{ content:"No"; display:block; font-weight:900; margin-bottom:6px }
}

/* ---------- lampiran ---------- */
.grid-attach{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap:12px;
}
.filepick{ min-width:0 }
.filepick input[type="file"]{ max-width:100% }
.filepick .helper{ font-size:12px; color:#6b6b6b; margin-top:6px; word-break: break-word }

.thumbs{ display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
.thumbs img{ width:clamp(72px, 9vw, 96px); height:clamp(72px, 9vw, 96px); object-fit:cover; border-radius:8px; border:1px solid #eee }

/* ---------- pill ---------- */
.seg{ display:flex; gap:10px; flex-wrap:wrap }
.pill{ display:inline-flex; align-items:center; gap:8px; border:2px solid var(--ring-2); padding:8px 12px; border-radius:999px; background:#fff; cursor:pointer }
.pill input{ accent-color:#c45 }
.pill.active{ background:#FFE9EF; border-color:#F3B6B2 }

/* ---------- misc ---------- */
.ttd-preview img{ height:56px; margin-top:6px }
.actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:10px; flex-wrap:wrap }

/* =======================================================
  MOBILE FIRST OVERRIDES
  ======================================================= */
@media (max-width:768px){
  .row,.row-3,.row-auto-1,.row-auto-2,.row-auto-3{
    grid-template-columns:1fr !important;
    gap:var(--sv-gap);
  }
  .with-mic{ grid-template-columns:1fr; gap:8px }
  .btn.mic{ width:44px; height:44px; justify-self:end }
  .input,.select,.textarea{ font-size:16px; min-height:44px; padding:12px 14px }
  .textarea{ min-height:96px; resize:vertical }
  .label{ font-size:clamp(13px,3.6vw,15px) }
  .actions{ justify-content:space-between; gap:12px }
}

/* tablet */
@media (min-width:769px) and (max-width:1024px){
  .row{ grid-template-columns:repeat(2,minmax(0,1fr)) }
  .row-3{ grid-template-columns:repeat(3,minmax(0,1fr)) }
}

/* very small phones */
@media (max-width:360px){
  .input,.select,.textarea{ padding:11px 12px }
}

/* === Kawaii delete button di BAWAH gambar === */
.thumbs > div{
  position: static !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: max-content;
}
.btn-delete-thumb{
  position: static;
  top: auto; right: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 2px solid #F3B6B2;
  background: linear-gradient(180deg, #FFDDE2, #FFC6CF);
  color: #4b0f1a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(243, 182, 178, .35), inset 0 1px 0 rgba(255,255,255,.65);
  transform: translateZ(0);
  transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
}
.btn-delete-thumb{ font-size: 0; }
.btn-delete-thumb::before{ content: "Hapus"; font-size: 12px; }
.btn-delete-thumb:hover{
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(243, 182, 178, .42), inset 0 1px 0 rgba(255,255,255,.7);
}
.btn-delete-thumb:active{ transform: translateY(0); filter: brightness(.97); }
.btn-delete-thumb:focus-visible{ outline: 0; box-shadow: 0 0 0 3px rgba(247, 199, 196, .55); }
@media (prefers-reduced-motion: reduce){ .btn-delete-thumb{ transition: none } }

.btn-delete{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 2px solid #F3B6B2;
  background: linear-gradient(180deg, #FFDDE2, #FFC6CF);
  color: #4b0f1a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(243, 182, 178, .35), inset 0 1px 0 rgba(255,255,255,.65);
  transform: translateZ(0);
  transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
}
.btn-delete::before{ content: "🗑️"; font-size: 14px; }
.btn-delete:hover{ transform: translateY(-1px) }
.btn-delete:active{ transform: translateY(0); filter: brightness(.97) }
.btn-delete:focus-visible{ outline: 0; box-shadow: 0 0 0 3px rgba(247,199,196,.55) }
/* Grid responsif untuk daftar lampiran */
.grid-attach{
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}

/* Satu item lampiran (FilePick + preview (opsional)) */
.attach{
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Container thumbnails (foto banyak / single) */
.thumbs{
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

/* Kartu preview gambar */
.preview{
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 12px;
  border: 1px solid #eee;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.preview img{
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Khusus tanda tangan lebih melebar */
.preview.preview--wide{
  width: 220px;
  height: 110px;
}

/* Tombol hapus kecil di pojok */
.btn-delete-thumb{
  position: absolute;
  top: -8px;
  right: -8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #f3a9b2;
  background: #ffd6dc;
  color: #333;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.12);
}

/* Kalau masih pakai .btn-delete lama, cegah jadi full-width */
.btn-delete{
  width: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
}

/* Opsional: kecilkan grid di layar sempit */
@media (max-width: 480px){
  .grid-attach{
    grid-template-columns: 1fr;
  }
}
.lampiran-hint{
  margin-top: 4px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--muted);
}
.lampiran-hint strong{
  font-weight: 800;
}
`;
