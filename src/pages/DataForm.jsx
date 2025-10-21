import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import FileDetailModal from "../components/FileDetailModal";

const LS_KEY = "formDataList";
const LS_VERIF = "spa_verifikator_queue";

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

function DetailModal({ open, data, onClose }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !data) return null;

  const fileBreakdown = (() => {
    const c = data.counts || {};
    const singles = Array.from({ length: c.singles || 0 }, (_, i) => ({
      label: `Dokumen ${i + 1}`,
      note: "Berkas tunggal",
    }));
    const fotoSurvey = Array.from({ length: c.fotoSurvey || 0 }, (_, i) => ({
      label: `Foto Survey ${i + 1}`,
      note: "Foto saat survei",
    }));
    const fotoKejadian = Array.from(
      { length: c.fotoKejadian || 0 },
      (_, i) => ({
        label: `Foto Kejadian ${i + 1}`,
        note: "Foto TKP/kejadian",
      })
    );

    if (Array.isArray(data.files) && data.files.length) {
      return data.files.map((f, idx) => ({
        ...f,
        label: f.label || f.name || `Berkas ${idx + 1}`,
      }));
    }
    return [...singles, ...fotoSurvey, ...fotoKejadian];
  })();

  const pairs = [
    ["ID", data.id],
    ["Waktu Submit", fmtDT(data.createdAt)],
    ["Template", data.template === "kunjungan_rs" ? "Kunjungan RS" : "Survei Ahli Waris",
    ],
    ["Jenis Survei", data.jenisSurveyLabel || "-"],
    ["Nomor PL", data.noPL || "-"],
    ["Nama Korban", data.korban || "-"],
    ["Nama Petugas", data.petugas || "-"],
    ["Tanggal Kejadian", fmtD(data.tanggalKecelakaan)],
    ["Status", data.status || "terkirim"],
    ["Terverifikasi", data.verified ? "Ya" : "Belum"],
    [
      "Ringkasan Berkas",
      `${data.totalFiles ?? 0} file (dok: ${
        data?.counts?.singles || 0
      }, foto survey: ${data?.counts?.fotoSurvey || 0}, foto kejadian: ${
        data?.counts?.fotoKejadian || 0
      })`,
    ],
  ];

  const copyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      alert("Detail (JSON) disalin ke clipboard.");
    } catch {
      alert("Gagal menyalin ke clipboard.");
    }
  };

  const styles = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "24px",
    },
    modal: {
      width: "min(920px, 100%)",
      maxHeight: "90vh",
      overflow: "auto",
      background: "#fff",
      borderRadius: "16px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    },
    head: {
      padding: "16px 20px",
      borderBottom: "1px solid #eee",
      display: "flex",
      gap: 12,
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      background: "#fff",
      zIndex: 1,
    },
    titleWrap: { display: "flex", alignItems: "center", gap: 12 },
    body: { padding: "20px", display: "grid", gap: 16 },
    grid: {
      display: "grid",
      gridTemplateColumns: "200px 1fr",
      rowGap: "10px",
      columnGap: "16px",
      alignItems: "start",
    },
    key: { color: "#666" },
    files: {
      display: "grid",
      gap: 8,
      gridTemplateColumns: "1fr 1fr",
    },
    fileItem: {
      border: "1px solid #eee",
      borderRadius: 10,
      padding: "10px 12px",
    },
    footer: {
      padding: "14px 20px",
      borderTop: "1px solid #eee",
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      position: "sticky",
      bottom: 0,
      background: "#fff",
    },
  };

  return (
    <div
      style={styles.overlay}
      onClick={onClose}
      aria-hidden={false}
      role="presentation"
    >
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        aria-describedby="detail-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.head}>
          <div style={styles.titleWrap}>
            <span>👀</span>
            <h2 id="detail-title" style={{ margin: 0 }}>
              Detail Pengajuan
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="df-btn df-ghost" onClick={copyJSON} title="Salin JSON">
              ⧉ Salin JSON
            </button>
            <button className="df-btn df-danger" onClick={onClose} title="Tutup">
              ✕
            </button>
          </div>
        </header>

        <div style={styles.body}>
          <p id="detail-desc" style={{ marginTop: 0, color: "#666" }}>
            Rincian lengkap data dan ringkasan berkas terlampir.
          </p>

          {/* Preview Laporan */}
          {data?.previewHTML ? (
            <div
              className="laporan-preview"
              style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8, marginTop: 16 }}
              dangerouslySetInnerHTML={{ __html: data.previewHTML }}
            />
          ) : (
            <p style={{ marginTop: 16 }}>Belum ada data laporan untuk ditampilkan.</p>
          )}
        </div>

        <footer style={styles.footer}>
          <button className="df-btn df-ghost" onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </div>
  );
}

function VerifyModal({ open, data, onClose, onSubmit }) {
  const [checks, setChecks] = useState({ lengkap: false, valid: false, jelas: false });
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("verify");

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
    setMode(data.verified ? "unverify" : "verify");
    setChecks({ lengkap: false, valid: false, jelas: false });
    setNote("");
  }, [data]);

  if (!open || !data) return null;

  const canConfirm =
    mode === "verify" ? checks.lengkap && checks.valid && checks.jelas : note.trim().length > 0;

  const styles = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10000,
      padding: 24,
    },
    modal: {
      width: "min(680px,100%)",
      background: "#fff",
      borderRadius: 16,
      boxShadow: "0 20px 60px rgba(0,0,0,.2)",
      maxHeight: "88vh",
      overflow: "auto",
    },
    head: {
      padding: "16px 20px",
      borderBottom: "1px solid #eee",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      position: "sticky",
      top: 0,
      background: "#fff",
      zIndex: 1,
    },
    body: { padding: 20, display: "grid", gap: 12 },
    footer: {
      padding: "14px 20px",
      borderTop: "1px solid #eee",
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      position: "sticky",
      bottom: 0,
      background: "#fff",
    },
    checkbox: { display: "flex", alignItems: "center", gap: 10 },
    textarea: {
      width: "100%",
      minHeight: 90,
      padding: 10,
      border: "1px solid #ddd",
      borderRadius: 10,
      fontFamily: "inherit",
      resize: "vertical",
    },
    badge: {
      padding: "2px 8px",
      borderRadius: 999,
      border: "1px solid #eee",
      background: data.verified ? "#fff7f7" : "#f2fff7",
      color: data.verified ? "#b10000" : "#007a2e",
      fontSize: 12,
    },
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.head}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{mode === "verify" ? "✅" : "↩︎"}</span>
            <h2 id="verify-title" style={{ margin: 0 }}>
              {mode === "verify" ? "Verifikasi Pengajuan" : "Batalkan Verifikasi"}
            </h2>
          </div>
          <span style={styles.badge}>
            {data.verified ? "Status: Terverifikasi" : "Status: Belum Terverifikasi"}
          </span>
        </header>

        <div style={styles.body}>
          <div style={{ color: "#666" }}>
            <strong>ID:</strong> <span className="df-mono">{data.id}</span> • {data.korban} — {data.jenisSurveyLabel || data.template}
          </div>

          {mode === "verify" ? (
            <>
              <div style={{ marginTop: 6 }}>Checklist sebelum verifikasi:</div>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={checks.lengkap}
                  onChange={(e) => setChecks((c) => ({ ...c, lengkap: e.target.checked }))}
                />
                Data utama lengkap & konsisten
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={checks.valid}
                  onChange={(e) => setChecks((c) => ({ ...c, valid: e.target.checked }))}
                />
                Dokumen pendukung valid (bukan duplikat/kadaluarsa)
              </label>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={checks.jelas}
                  onChange={(e) => setChecks((c) => ({ ...c, jelas: e.target.checked }))}
                />
                Foto terbaca dan jelas
              </label>

              <div>
                <div style={{ marginTop: 8, marginBottom: 6 }}>Catatan (opsional)</div>
                <textarea
                  style={styles.textarea}
                  value={note}
                  placeholder="Masukkan catatan verifikasi (opsional)…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 6, color: "#444" }}>
                Beri alasan pembatalan verifikasi (wajib):
              </div>
              <textarea
                style={styles.textarea}
                value={note}
                placeholder="Contoh: Ditemukan perbedaan tanggal di dokumen…"
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          )}
        </div>

        <footer style={styles.footer}>
          <button className="df-btn df-ghost" onClick={onClose}>Batal</button>
          <button
            className={`df-btn ${canConfirm ? "" : "disabled"}`}
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
            {mode === "verify" ? "✓ Konfirmasi Verifikasi" : "Batalkan Verifikasi"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function DataForm() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [templ, setTempl] = useState("all");
  const [status, setStatus] = useState("all");
  const [expandedRows, setExpandedRows] = useState({});

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyData, setVerifyData] = useState(null);

  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [fileModalData, setFileModalData] = useState(null);
  const openFileModal = (rec) => {
    setFileModalData(rec);
    setFileModalOpen(true);
  };
  const closeFileModal = () => {
    setFileModalOpen(false);
    setFileModalData(null);
  };

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("formDataList") || "[]");
    setRows(stored);
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (templ === "all" ? true : r.template === templ))
      .filter((r) => (status === "all" ? true : (r.status || "terkirim") === status))
      .filter((r) => {
        if (!q.trim()) return true;
        const hay = `${r.korban || ""}|${r.petugas || ""}|${r.noPL || ""}|${r.jenisSurveyLabel || ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [rows, q, templ, status]);

  const pill = (t) => {
    if (!t) return <span className="df-pill">-</span>;

    const template = t.toLowerCase();

    let label = "Survei Ahli Waris";
    if (template.includes("kunjungan")) label = "Kunjungan RS";

    return <span className={`df-pill ${template}`}>{label}</span>;
  };

  const badge = (s) => <span className={`df-badge st-${s || "terkirim"}`}>{s || "terkirim"}</span>;

  const clearAll = () => {
    if (!confirm("Hapus semua data form tersimpan?")) return;
    localStorage.removeItem(LS_KEY);
    setRows([]);
  };

  const openPreview = useCallback(async(rec) => {
    if (!rec) return;
    const vv = rec;
    const template = (rec.template || "").toLowerCase();
    const sifat = (rec?.sifatCidera || "").toLowerCase();

  console.log("DEBUG SIFAT:", sifat, rec);
    if (template.includes("kunjungan")) {
      const fotoList = rec.fotoList || [];

      const foto = await Promise.all(
        fotoList.map(f => {
          if (f.dataURL || f.url) return f;
          if (f instanceof File) {
            return new Promise(resolve => {
              const reader = new FileReader();
              reader.onload = e => resolve({ name: f.name, dataURL: e.target.result });
              reader.readAsDataURL(f);
            });
          }
          return f;
        })
      );

      console.log("Context this:", this);
      console.log("Apakah ada data di scope ini?", typeof data, typeof item);

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

      const reportHTML = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <title>Laporan Kunjungan RS - ${vv.korban || "Anon"}</title>
          <style>
            body { font-family:"Times New Roman", serif; color:#000; background:#fff; padding:40px 50px; line-height:1.6; }
            h2 { text-align:center; text-transform:uppercase; font-size:18px; font-weight:bold; margin-bottom:0; }
            h3 { text-align:center; margin-top:4px; font-size:14px; font-weight:normal; }
            table { width:100%; border-collapse:collapse; margin-top:20px; font-size:14px; }
            td { padding:4px 6px; vertical-align:top; }
            .label { width:220px; font-weight:bold; }
            .section-title { font-weight:bold; margin-top:20px; text-transform:uppercase; }
            .box { border:1px solid #000; padding:10px; margin-top:6px; min-height:60px; }
            .ttd { display:flex; justify-content:space-between; margin-top:60px; font-size:14px; text-align:center; }
            .foto-container { display:flex; flex-wrap:wrap; margin-top:30px; gap:10px; }
            .footer-note { margin-top:30px; font-size:14px; text-align:justify; }
            button { display:inline-block; padding:8px 16px; border:1px solid #000; background:#fff; cursor:pointer; margin-bottom:16px; }
          </style>
        </head>
        <body>
          <button onclick="window.print()">🖨️ Cetak / Simpan PDF</button>

          <h2>LEMBAR HASIL KUNJUNGAN KE RUMAH SAKIT</h2>
          <h3>APLIKASI MOBILE PELAYANAN</h3>

          <table>
            <tr><td class="label">NPP / Nama Petugas</td><td>: ${vv.petugas || "-"}</td></tr>
            <tr><td class="label">Loket Kantor / Wilayah</td><td>: ${vv.wilayah || "-"}</td></tr>
            <tr><td class="label">Nama Korban</td><td>: ${vv.korban || "-"}</td></tr>
            <tr><td class="label">Lokasi Kecelakaan</td><td>: ${vv.lokasiKecelakaan || "-"}</td></tr>
            <tr><td class="label">Kode RS / Nama RS</td><td>: ${vv.rumahSakit || "-"}</td></tr>
            <tr><td class="label">Tanggal Kecelakaan</td><td>: ${vv.tglKecelakaan || "-"}</td></tr>
            <tr><td class="label">Tanggal Masuk RS</td><td>: ${vv.tglMasukRS || "-"}</td></tr>
            <tr><td class="label">Tanggal & Jam Notifikasi</td><td>: ${vv.tglJamNotifikasi || "-"}</td></tr>
            <tr><td class="label">Tanggal & Jam Kunjungan</td><td>: ${vv.tglJamKunjungan || "-"}</td></tr>
          </table>

          <div class="section-title">Uraian Hasil Kunjungan:</div>
          <div class="box">${vv.uraianKunjungan || "<i>Belum diisi.</i>"}</div>

          <div class="section-title">Rekomendasi / Kesimpulan:</div>
          <div class="box">${vv.rekomendasi || "<i>Belum diisi.</i>"}</div>

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
              Petugas yang melakukan kunjungan,<br/><br/><br/><br/>
              <b>${vv.petugas || "................................"}</b><br/>
              <i>${vv.petugasJabatan || ""}</i>
            </div>
          </div>

          <div class="foto-container">${fotosHTML}</div>
        </body>
        </html>
      `;

      setDetailData({ ...rec, previewHTML: reportHTML });
      setDetailOpen(true);
      return;
    }

    if (sifat.includes("meninggal")) {
    const fileList = rec.fileList || [];
    
    const fileHTML = fileList.length
      ? fileList
          .map((f) => {
            const src =
              f.dataURL || f.url || (f.file ? URL.createObjectURL(f.file) : "");
            const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name || "");
            return `
              <div style="margin:6px; display:inline-block; text-align:center;">
                ${
                  isImg
                    ? `<div style="border:1px solid #000; width:160px; height:120px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                        <img src="${src}" alt="${f.name}" style="max-width:100%; max-height:100%;" />
                      </div>`
                    : `<div style="border:1px dashed #000; width:160px; height:120px; display:flex; align-items:center; justify-content:center;">
                        <a href="${src}" target="_blank" rel="noreferrer">${f.name}</a>
                      </div>`
                }
                <div style="font-size:11px; margin-top:4px;">${f.name}</div>
              </div>
            `;
          })
          .join("")
      : "<i style='color:#666;'>Tidak ada file dilampirkan.</i>";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Laporan Hasil Survei (Meninggal Dunia)</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body {
              font-family: "Times New Roman", serif;
              color: #000;
              background: #fff;
              font-size: 11pt;
              line-height: 1.45;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              padding: 15mm;
            }
            h2 {
              text-align: center;
              font-size: 18pt;
              margin: 0;
              text-transform: uppercase;
            }
            h3 {
              text-align: center;
              font-size: 12pt;
              margin-top: 4px;
              font-weight: normal;
            }
            .section-title {
              font-weight: bold;
              margin-top: 14px;
              margin-bottom: 4px;
              text-transform: uppercase;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 52mm 5mm 1fr;
              row-gap: 3px;
              margin-top: 10px;
            }
            .box {
              border: 1px solid #000;
              padding: 8px;
              min-height: 50px;
              white-space: pre-wrap;
            }
            .file-container {
              display: flex;
              flex-wrap: wrap;
              margin-top: 8px;
              gap: 8px;
            }
            .signs {
              display: flex;
              justify-content: space-between;
              margin-top: 40px;
            }
            .sign-box {
              text-align: center;
              width: 45%;
            }
            .name {
              font-weight: bold;
              text-decoration: underline;
              margin-top: 60px;
            }
            button {
              display: inline-block;
              padding: 6px 12px;
              border: 1px solid #000;
              background: #fff;
              cursor: pointer;
              margin-bottom: 16px;
            }
          </style>
        </head>
        <body>
          <button onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
          
          <h2>LAPORAN HASIL SURVEI</h2>
          <h3>(KASUS MENINGGAL DUNIA)</h3>
          
          <div class="info-grid">
            <div>Nama Korban</div><div>:</div><div>${vv.namaKorban || "-"}</div>
            <div>Nama Ahli Waris</div><div>:</div><div>${vv.namaAhliWaris || "-"}</div>
            <div>No. Berkas</div><div>:</div><div>${vv.noBerkas || "-"}</div>
            <div>Alamat Korban</div><div>:</div><div>${vv.alamatKorban || "-"}</div>
            <div>Tanggal Kecelakaan</div><div>:</div><div>${vv.tanggalKecelakaan || "-"}</div>
            <div>Tanggal Survei</div><div>:</div><div>${vv.hariTanggal || "-"}</div>
            <div>Petugas Survei</div><div>:</div><div>${vv.petugasSurvei || vv.petugas || "-"}</div>
          </div>

          <div class="section-title">Uraian & Kesimpulan</div>
          <div class="box">${vv.uraian || vv.kesimpulan || "<i>Belum diisi.</i>"}</div>

          <div class="section-title">Berkas Terlampir</div>
          <div class="file-container">${fileHTML}</div>

          <p style="margin-top:16px;text-align:justify;">
            Demikian laporan hasil survei kasus meninggal dunia ini dibuat dengan sebenarnya
            sesuai dengan informasi yang diperoleh di lapangan.
          </p>

          <div class="signs">
            <div class="sign-box">
              Mengetahui,<br/><br/><br/>
              <div class="name">Andi Raharja, S.A.B</div>
              <div>Kepala Bagian Operasional</div>
            </div>
            <div class="sign-box">
              Petugas Survei,<br/><br/><br/>
              <div class="name">${vv.petugasSurvei || vv.petugas || "................................"}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    setDetailData({ ...rec, previewHTML: html });
    setDetailOpen(true);
    return;
  }

    if (sifat.toLowerCase().includes("luka")) {
      const html = `
        <div style="padding:1rem;">
          <h2>🤕 Laporan Hasil Survei (Luka-luka)</h2>
          <p><b>Nama Korban:</b> ${vv.namaKorban || "-"}</p>
          <p><b>Jenis Cidera:</b> ${vv.sifatCidera || "-"}</p>
          <h3>Foto Terlampir:</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">${fotoHTML}</div>
        </div>
      `;

      setDetailData({ ...rec, previewHTML: html });
      setDetailOpen(true);
      return;
    }

    else {
      alert("Template tidak dikenali atau belum disiapkan preview-nya.");
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailData(null);
  }, []);

  const openVerify = useCallback((rec) => {
    setVerifyData(rec);
    setVerifyOpen(true);
  }, []);
  const closeVerify = useCallback(() => {
    setVerifyOpen(false);
    setVerifyData(null);
  }, []);

  const applyVerification = useCallback((payload) => {
    setRows((prev) => {
      const next = prev.map((r) => {
        if (r.id !== payload.id) return r;
        const now = payload.timestamp;

        if (payload.action === "verify") {
          try {
            const raw = localStorage.getItem(LS_VERIF);
            const arr = raw ? JSON.parse(raw) : [];

            if (!arr.some((item) => item.id === r.id)) {
              arr.unshift({
                id: r.id,
                pemohon: r.korban,
                status: "menunggu",
                tanggal: now.slice(0, 10),
                pdfUrl: r.pdfBlobUrl || "/Lembar_Kunjungan_RS_NAI.pdf",
              });
              localStorage.setItem(LS_VERIF, JSON.stringify(arr));
            }
          } catch (e) {
            console.error("Gagal simpan ke verifikator:", e);
          }

          return {
            ...r,
            verified: true,
            verifiedAt: now,
            verifyNote: payload.note || undefined,
            verifyChecklist: payload.checks,
          };
        }
      });

      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
    closeVerify();
  }, [closeVerify]);

  return (
    <div className="df-wrap">
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
          Rekap pengajuan dari halaman SPA. Silakan verifikasi data yang masuk—klik baris untuk detail, atau gunakan tombol aksi di kanan.
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
            <option value="survei_aw">Survei Ahli Waris</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="terkirim">Terkirim</option>
            <option value="diproses">Diproses</option>
            <option value="selesai">Selesai</option>
          </select>
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
          <div className="df-scroll">
            <div className="df-table" role="table" aria-label="Data Form">
              <div className="df-thead"
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "30px 110px 110px 120px 200px 120px 120px 150px 140px 100px 140px 100px",
                  gap: "6px",
                }}
              >
                <div>No</div>
                <div>Waktu</div>
                <div>Template</div>
                <div>Jenis Survei</div>
                <div>No. LP</div>
                <div>Korban</div>
                <div>Petugas</div>
                <div>Tgl. Kejadian</div>
                <div>Berkas</div>
                <div>Status</div>
                <div>Rating</div>
                <div>Aksi</div>
              </div>

              {filtered.map((r, i) => {
              // 🔍 Gabungkan semua file dari berbagai jenis
              const allFiles = [];

              // === Hasil Kunjungan ===
              if (r.fotoSurveyList?.length) {
                allFiles.push(
                  ...r.fotoSurveyList.map(f => ({
                    type: "foto",
                    name: f.name,
                    dataURL: f.dataURL,
                  }))
                );
              }

              // if (r.laporanRSList?.length) {
              //   allFiles.push(
              //     ...r.laporanRSList.map(f => ({
              //       type: "laporanRS",
              //       name: f.name,
              //       dataURL: f.dataURL,
              //     }))
              //   );
              // }

              console.log("📦 hasilFormFile:", r.hasilFormFile);

              // if (r.hasilFormFile) {
              //   allFiles.push({
              //     type: "hasilForm",
              //     label: r.hasilFormFile.label || "Hasil Formulir Kunjungan RS",
              //     name: r.hasilFormFile.name,
              //     dataURL: r.hasilFormFile.dataURL,
              //   });
              // }

              // === Hasil Survey (versi robust: cek banyak kemungkinan lokasi & format) ===
              const surveyFiles = [
                { key: "ktp", label: "KTP Korban" },
                { key: "kk", label: "Kartu Keluarga (KK)" },
                { key: "bukuTabungan", label: "Buku Tabungan" },
                { key: "formPengajuan", label: "Formulir Pengajuan Santunan" },
                { key: "formKeteranganAW", label: "Formulir Keterangan Ahli Waris" },
                { key: "skKematian", label: "Surat Keterangan Kematian" },
                { key: "aktaKelahiran", label: "Akta Kelahiran" },
              ];

              // helper: push file ke allFiles dalam format konsisten
              const pushFile = (f, suggestedLabel = "Berkas") => {
                if (!f) return;

                // Jika array of files
                if (Array.isArray(f)) {
                  f.forEach(ff => pushFile(ff, suggestedLabel));
                  return;
                }

                // Jika object — cek berbagai kemungkinan properti
                if (typeof f === "object") {
                  const name =
                    f.name ||
                    f.fileName ||
                    f.filename ||
                    f.label ||
                    suggestedLabel;

                  // ambil kemungkinan sumber data file
                  const dataURL =
                    f.dataURL ||
                    f.url ||
                    f.path ||
                    f.data ||
                    (f.file instanceof File ? URL.createObjectURL(f.file) : f.file) ||
                    (typeof f.file === "string" ? f.file : null);

                  if (!dataURL) {
                    console.warn("⚠️ Tidak ada dataURL/URL/data untuk file:", name, f);
                    return;
                  }

                  allFiles.push({
                    type: /\.(jpg|jpeg|png|gif|webp)$/i.test(name) ? "foto" : "berkas",
                    label: f.label || suggestedLabel,
                    name: name || "Unknown",
                    dataURL,
                  });
                  return;
                }

                // Jika string (asumsi URL)
                if (typeof f === "string") {
                  allFiles.push({
                    type: /\.(jpg|jpeg|png|gif|webp)$/i.test(f) ? "foto" : "berkas",
                    label: suggestedLabel,
                    name: f.split("/").pop() || suggestedLabel,
                    dataURL: f,
                  });
                }
              };

              // 1) Jika r.attachSurvey adalah object dengan many keys, masukkan semua isinya
              if (r.attachSurvey && typeof r.attachSurvey === "object" && !Array.isArray(r.attachSurvey)) {
                Object.keys(r.attachSurvey).forEach(k => {
                  const val = r.attachSurvey[k];
                  // gunakan label dari surveyFiles jika key cocok, kalau tidak gunakan key sebagai label
                  const meta = surveyFiles.find(s => s.key === k);
                  pushFile(val, meta ? meta.label : k);
                });
              }

              Object.entries(r.attachSurvey || {}).forEach(([k, v]) => {
                console.log("🧱 Detail attachSurvey entry:", k);
                try {
                  console.log("🪣 Nilai lengkap:", JSON.stringify(v, null, 2));
                } catch {
                  console.log("❌ Gagal stringify:", v);
                }
              });

              // 2) Beberapa implementasi pakai attachList (array)
              if (Array.isArray(r.attachList) && r.attachList.length) {
                r.attachList.forEach(f => pushFile(f, f.label || f.name || "Lampiran"));
              }

              // 3) Hasil form file single
              if (r.hasilFormFile) {
                pushFile(r.hasilFormFile, r.hasilFormFile.label || r.hasilFormFile.name || "Hasil Form");
              }

              // 4) Cek root-level keys yang mungkin menyimpan file per-key (r.ktp, r.kk, ...)
              surveyFiles.forEach(f => {
                const candidates = [
                  r[f.key],
                  r.data?.[f.key],
                  r.att?.[f.key],
                  r[f.key + "File"], // kemungkinan naming lain
                ];
                const found = candidates.find(x => !!x);
                if (found) pushFile(found, f.label);
              });

              // 5) Cek fotoSurveyList / fotoSurvey / fotoList / fotoSurveyList
              if (Array.isArray(r.fotoSurveyList) && r.fotoSurveyList.length) {
                r.fotoSurveyList.forEach(f => pushFile(f, f.name || "Foto Survey"));
              }
              if (Array.isArray(r.fotoSurvey) && r.fotoSurvey.length) {
                r.fotoSurvey.forEach(f => pushFile(f, f.name || "Foto Survey"));
              }
              if (Array.isArray(r.fotoList) && r.fotoList.length) {
                r.fotoList.forEach(f => pushFile(f, f.name || "Foto"));
              }

              // 6) Jika masih kosong, coba parse r.attachments (kadang dipakai)
              if (r.attachments && typeof r.attachments === "object") {
                // jika array
                if (Array.isArray(r.attachments)) {
                  r.attachments.forEach(f => pushFile(f, f.name || "Lampiran"));
                } else {
                  Object.keys(r.attachments).forEach(k => pushFile(r.attachments[k], k));
                }
              }

              // debug: tampilkan ringkasan agar gampang cek di console
              console.log("📦 r.attachSurvey (preview):", r.attachSurvey);
              console.log("📦 r.attachList (preview):", r.attachList);
              console.log("📦 r.hasilFormFile (preview):", r.hasilFormFile);
              console.log("📁 Total allFiles:", allFiles.length, allFiles);

              if (r.attachSurvey && typeof r.attachSurvey === "object") {
                console.log("🧩 Semua key di attachSurvey:", Object.keys(r.attachSurvey));
                Object.keys(r.attachSurvey).forEach(k => {
                  console.log("🧱 Detail attachSurvey entry:", k, r.attachSurvey[k]);
                  if (!allFiles.some(f => f.name?.includes(k) || f.label?.includes(k))) {
                    console.warn("⚠️ Tidak terdaftar di allFiles:", k, r.attachSurvey[k]);
                  }
                });
              }

              return (
                <React.Fragment key={r.id || i}>
                  <div
                    className="df-row"
                    role="row"
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "30px 110px 110px 120px 200px 120px 120px 150px 140px 100px 140px 160px",
                      gap: "6px",
                      alignItems: "start",
                    }}
                  >
                    <div>{i + 1}</div>
                    <div className="df-mono">{fmtDT(r.waktu)}</div>
                    <div>{pill(r.template)}</div>
                    <div>{r.jenisSurveyLabel || r.jenisSurvei || "-"}</div>
                    <div className="df-mono">{r.noPL || "-"}</div>
                    <div>{r.korban || "-"}</div>
                    <div>{r.petugas || "-"}</div>
                    <div className="df-mono">{fmtD(r.tanggalKecelakaan)}</div>

                    {(() => {
                      let content;

                      // 🔍 Deteksi jenis form
                      const isSurveyMeninggal =
                        r.template?.toLowerCase().includes("meninggal") ||
                        r.jenisSurvei?.toLowerCase().includes("meninggal");

                      if (isSurveyMeninggal) {
                        // === Kalau survei meninggal ===
                        content = (
                          <div className="df-mono" style={{ paddingRight: "4px", marginBottom: "2px" }}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "2px",
                                alignItems: "flex-start",
                              }}
                            >
                              {allFiles.length > 0 ? (
                                <span>
                                  📁 {[...new Map(allFiles.map(f => [f.name, f]))].size} File Terunggah
                                </span>
                              ) : (
                                <span>0 file</span>
                              )}

                              <button
                                onClick={() => openFileModal(r)}
                                style={{
                                  marginTop: "2px",
                                  background: "#e5f4ff",
                                  border: "1px solid #bae6fd",
                                  borderRadius: "4px",
                                  padding: "2px 6px",
                                  cursor: "pointer",
                                  fontSize: "0.85em",
                                }}
                              >
                                👀 Lihat Berkas
                              </button>
                            </div>

                            {expandedRows[r.id] && (
                              <div className="folder-files">
                                {allFiles.map((f, idx) => (
                                  <div key={idx}>
                                    {f.type === "foto" ? "📷" : "📄"}{" "}
                                    <a href={f.dataURL} download={f.name}>
                                      {f.label || f.name}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        content = (
                          <div className="df-mono" style={{ paddingRight: "4px", marginBottom: "2px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "flex-start" }}>
                              {allFiles.length > 0 ? (
                                <span>📁 {[...new Map(allFiles.map(f => [f.name, f]))].size} File Terunggah</span>
                              ) : (
                                <span>0 file</span>
                              )}
                              <button
                                onClick={() => openFileModal(r)}
                                style={{
                                  marginTop: "2px",
                                  background: "#e5f4ff",
                                  border: "1px solid #bae6fd",
                                  borderRadius: "4px",
                                  padding: "2px 6px",
                                  cursor: "pointer",
                                  fontSize: "0.85em",
                                }}
                              >
                                👀 Lihat Berkas
                              </button>
                            </div>
                            {expandedRows[r.id] && (
                              <div className="folder-files">
                                {allFiles
                                  .filter(f => f.type === "foto")
                                  .map((f, idx) => (
                                    <div key={idx}>
                                      📷 <a href={f.dataURL} download={f.name}>{f.name}</a>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return content;
                    })()}

                    <div>{badge(r.status)}</div>
                    {/* Kolom Rating */}
                    <div style={{
                      minWidth: "200px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: "2px 4px"
                    }}>
                      {r.rating ? "⭐".repeat(r.rating) + "☆".repeat(5 - r.rating) : "—"}
                      {r.feedback && (
                        <div
                          title={r.feedback}
                          style={{
                            fontSize: "0.75em",
                            color: "#555",
                            marginTop: "2px",
                            maxWidth: "160px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
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
                        gap: "4px",
                        justifyContent: "flex-start",
                        minWidth: "180px",
                        padding: "2px 4px",
                      }}
                    >
                      <button onClick={() => openVerify(r)} style={{ fontSize: "0.85em", padding: "2px 6px" }}>
                        {r.verified ? "✓ Terverifikasi" : "Verifikasi"}
                      </button>
                      <button onClick={() => openPreview(r)} style={{ fontSize: "0.85em", padding: "2px 6px" }}>
                        📄 Detail
                      </button>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            </div>
          </div>
        )}
      </section>

      {/* Modal Detail */}
      <DetailModal open={detailOpen} data={detailData} onClose={closeDetail} />

      {/* Modal Verifikasi */}
      <VerifyModal
        open={verifyOpen}
        data={verifyData}
        onClose={closeVerify}
        onSubmit={applyVerification}
      />

      {/* Modal Detail Berkas */}
      <FileDetailModal open={fileModalOpen} data={fileModalData} onClose={closeFileModal} />
    </div>
  );
}
