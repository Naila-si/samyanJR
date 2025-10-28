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
  Ditolak: ["ditolak"], // NEW
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
        <div className="modal-footer">{footer ?? <button className="btn" onClick={onClose}>Tutup</button>}</div>
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

/* ==========================================
   KOMPONEN UTAMA
   ========================================== */
export default function StatusProses() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Semua");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortByDateDesc, setSortByDateDesc] = useState(true);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null); // 'missing' | 'process' | 'report' | 'rejected'
  const [selectedRow, setSelectedRow] = useState(null);

  // 2) data
  const [data, setData] = useState([]);

  // ambil data awal dari localStorage + dengarkan perubahan storage (biar auto-refresh)
  useEffect(() => {
    const pull = () => {
      const rows = getListSafe(LS_KEY);
      const mapped = rows.map((r) => ({
        // ➜ sesuaikan kolom tabelmu
        name: r.korban || r.namaKorban || r.noPL || "Tanpa Nama",
        docType:
          r.template === "kunjungan_rs"
            ? "Kunjungan RS"
            : r.jenisSurveyLabel || r.jenisSurvei || r.template || "-",
        dateMs: pickValidTime(r._updatedAt, r.verifiedAt, r.unverifiedAt, r.waktu, r.createdAt),
        // tampilkan label Indonesia dari status internal
        status: STATUS_MAP[(r.status || "").toLowerCase()] || "Terkirim",
        // catatan admin dari beragam tahap
        notes: {
          verifyNote: r.verifyNote || "",
          unverifyNote: r.unverifyNote || "",
          finishNote: r.finishNote || "",
          rejectNote: r.rejectNote || "",
        },
        action: "Upload",
        missing: r.missing || [],
        pdfUrl: r.pdfBlobUrl || r.pdfUrl || "/Lembar_Kunjungan_RS_NAI.pdf", // fallback
        _raw: r, // simpan raw jika perlu
      }));
      setData(mapped);
    };

    pull();
    const onStorage = (e) => {
      if (e.key === LS_KEY) pull();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const filtered = useMemo(() => {
    let rows = data.filter((r) => {
      const matchText =
        r.name.toLowerCase().includes(q.toLowerCase()) || r.docType.toLowerCase().includes(q.toLowerCase());
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

  // helpers buka modal sesuai mode
  const openWith = (mode, row) => {
    setSelectedRow(row);
    setModalMode(mode);
    setModalOpen(true);
  };

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
        <p className="muted">Pengajuan ini <b>DITOLAK</b>.</p>
        {items.length > 0 ? (
          <ul className="missing-list">{items.map((m, idx) => <li key={idx}>{m}</li>)}</ul>
        ) : null}
        {row.notes?.rejectNote ? (
          <p className="note">
            <strong>Alasan penolakan:</strong> {row.notes.rejectNote}
          </p>
        ) : (
          <p className="muted">Tidak ada catatan penolakan yang tercatat.</p>
        )}
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
    ) : (
      <button className="btn" onClick={() => setModalOpen(false)}>Tutup</button>
    )
  ) : null;

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
            Tanggal
          </button>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
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
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </td>
                <td>
                  <Badge status={r.status} />
                  {r.status === "Terkirim" && (r.notes?.unverifyNote || r._raw?.unverifyNote) && (
                    <div className="pending-comment">
                      <span className="cmt-icon">💬</span>
                      <span>{r.notes?.unverifyNote || r._raw?.unverifyNote}</span>
                    </div>
                  )}
                </td>
                <td>
                  {r.status === "Terkirim" ? (
                    <span className="muted">-</span>
                  ) : r.status === "Diproses" ? (
                    <button className="link" onClick={() => openWith("process", r)}>
                      Lihat Proses
                    </button>
                  ) : r.status === "Selesai" ? (
                    <button className="link" onClick={() => openWith("report", r)}>
                      Unduh Laporan
                    </button>
                  ) : r.status === "Ditolak" ? (
                    <button className="link" onClick={() => openWith("rejected", r)}>
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
                <td colSpan="5" className="empty">
                  Tidak ada data yang cocok.
                </td>
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
          <span>Row</span>
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
    </div>
  );
}