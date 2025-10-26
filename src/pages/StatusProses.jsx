import React, { useMemo, useState, useEffect, useRef } from "react";

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

const STATUS_OPTIONS = ["Semua", "Selesai", "Diproses", "Terkirim"];

const STATUS_LABEL = {
  selesai: "Selesai",
  diproses: "Diproses",
  terkirim: "Terkirim",
};


const STATUS_FILTERS = {
  Semua: null,
  Selesai: ["selesai"],
  Diproses: ["diproses"],
  Terkirim: ["terkirim"],
};

function Badge({ status = "Terkirim" }) {
  return (
    <span className={`badge badge-${(status || "").toLowerCase()}`}>
      <span className="dot" />
      {status}
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
  } catch { return []; }
}

// status internal -> label UI (Indonesia)
const STATUS_MAP = { terkirim: "Terkirim", diproses: "Diproses", selesai: "Selesai" };

/* ========== Modal sederhana ========== */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Tutup</button>
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

export default function StatusProses() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Semua");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortByDateDesc, setSortByDateDesc] = useState(true);

  // modal state
  const [openModal, setOpenModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // 2) di dalam StatusProses()
  const [data, setData] = useState([]);

  // ambil data awal dari localStorage + dengarkan perubahan storage (biar auto-refresh)
  useEffect(() => {
    const pull = () => {
      const rows = getListSafe(LS_KEY);
      const mapped = rows.map((r) => ({
        // ➜ sesuaikan kolom tabelmu
        name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
        docType: r.template === "kunjungan_rs"
          ? "Kunjungan RS"
          : (r.jenisSurveyLabel || r.jenisSurvei || r.template || "-"),
        dateMs: pickValidTime(
          r._updatedAt,
          r.verifiedAt,
          r.unverifiedAt,
          r.waktu,
          r.createdAt
        ),
        status: STATUS_MAP[r.status] || "Terkirim",   // tampilkan label Indonesia
        comment: r.unverifyNote || r.verifyNote || "",
        action: "Upload", // kalau perlu aksi spesifik, silakan sesuaikan
        missing: r.missing || [], // kalau ada daftar kekurangan
      }));
      setData(mapped);
    };

    pull();
    const onStorage = (e) => { if (e.key === LS_KEY) pull(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  const openMissing = (row) => {
    setSelectedRow(row);
    setOpenModal(true);
  };

  return (
    <div className="status-page">
      <AutoAudio src="/voices/statusproses.mp3" />

      <header className="status-head">
        <h1>Status Proses</h1>
        <p className="muted">Lihat status terkini dan kelola proses</p>
      </header>

      {/* Toolbar */}
      <div className="status-toolbar">
        <div className="search">
          <span className="icon">🔍</span>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
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
            Tanggal
          </button>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
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
                Tanggal Pengajuan {sortByDateDesc ? "▾" : "▴"}
              </th>
              <th>Status Proses</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className="muted">{r.docType}</td>
                <td>
                  {new Date(r.dateMs).toLocaleDateString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </td>
                <td>
                  <Badge status={r.status} />
                  {/* Komentar jika Pending */}
                  {r.status === "Terkirim" && r.comment && (
                    <div className="pending-comment">
                      {/* ikon kecil komentar */}
                      <span className="cmt-icon">💬</span>
                      <span>{r.comment}</span>
                    </div>
                  )}
                </td>
                <td>
                  {r.status === "Terkirim" ? (
                    <button className="link" onClick={() => openMissing(r)}>
                      Lihat Kekurangan
                    </button>
                  ) : r.action === "Upload" ? (
                    <button className="link">Upload</button>
                  ) : (
                    <span className="muted">Submitted</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">Tidak ada data yang cocok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer controls */}
      <div className="table-footer">
        <div className="page-size">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          >
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Row</span>
        </div>

        <div className="pagination">
          <button className="pager" onClick={() => goto(page - 1)} disabled={pageSafe === 1}>‹</button>
          {Array.from({ length: totalPages }).slice(0, 7).map((_, idx) => {
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
          <button className="pager" onClick={() => goto(page + 1)} disabled={pageSafe === totalPages}>›</button>
        </div>
      </div>

      {/* Modal: daftar kekurangan */}
      <Modal
        open={openModal}
        title={selectedRow ? `Kekurangan Berkas — ${selectedRow.name}` : "Kekurangan Berkas"}
        onClose={() => setOpenModal(false)}
      >
        {selectedRow ? (
          <>
            {Array.isArray(selectedRow.missing) && selectedRow.missing.length > 0 ? (
              <ul className="missing-list">
                {selectedRow.missing.map((m, idx) => <li key={idx}>{m}</li>)}
              </ul>
            ) : (
              <p className="muted">Tidak ada daftar kekurangan yang tercatat.</p>
            )}
            {selectedRow.comment && (
              <p className="note">
                <strong>Catatan:</strong> {selectedRow.comment}
              </p>
            )}
            <div className="modal-actions">
              <button className="btn primary">Upload Sekarang</button>
              <button className="btn">Lihat Template</button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
