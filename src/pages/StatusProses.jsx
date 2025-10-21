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

/* ========== Data contoh (boleh ganti dari API) ========== */
/* Tambah field: comment (komentar singkat) & missing (array kekurangan) untuk status Pending */
const RAW_DATA = [
  { name: "Conducting User Research", docType: "User Research and Personas", date: "2024-07-01", status: "Done",     action: "Submitted" },
  { name: "Competitive Analysis Report", docType: "Competitive Analysis in Design", date: "2024-07-25", status: "Progress", action: "Upload" },
  { name: "Creating Wireframes", docType: "Wireframing and Prototyping", date: "2024-08-01", status: "Progress", action: "Upload" },
  { name: "Usability Testing and Feedback", docType: "Usability Testing and Iteration", date: "2024-08-22", status: "Pending", action: "Upload",
    comment: "Menunggu dokumen identitas & tanda tangan formulir.",
    missing: ["KTP (scan jelas)", "Formulir layanan (TTD pemohon)", "NPWP (opsional, jika ada)"] },
  { name: "Developing Visual Design Elements", docType: "Visual Design and Branding", date: "2024-08-29", status: "Pending", action: "Upload",
    comment: "Lengkapi bukti pembayaran retribusi.",
    missing: ["Bukti pembayaran retribusi", "Surat kuasa (bila dikuasakan)"] },
  { name: "Creating a Design System", docType: "Design Systems and Components", date: "2024-09-05", status: "Pending", action: "Upload",
    comment: "Perlu surat pernyataan keaslian dokumen.",
    missing: ["Surat pernyataan keaslian dokumen bermaterai"] },
  { name: "Handoff to Development", docType: "Design to Dev Handoff", date: "2024-09-12", status: "Pending", action: "Upload",
    comment: "Kelengkapan belum sesuai format file.",
    missing: ["File lampiran ubah ke PDF/JPG/PNG ≤ 10MB"] },
  { name: "Accessibility Review", docType: "WCAG Checklist", date: "2024-09-18", status: "Pending", action: "Upload",
    comment: "Mohon unggah checklist WCAG terbaru.",
    missing: ["Checklist WCAG (template terbaru)"] },
  { name: "Microcopy Review", docType: "Content & Microcopy", date: "2024-09-22", status: "Pending", action: "Upload",
    comment: "Perlu revisi redaksi pada formulir.",
    missing: ["Formulir revisi (versi terbaru)"] },
  { name: "Beta Feedback Summary", docType: "Feedback Summary", date: "2024-10-01", status: "Pending", action: "Upload",
    comment: "Tambahkan lampiran foto bukti tes lapangan.",
    missing: ["Foto dokumentasi uji coba (min. 2 file)"] },
  { name: "Stakeholder Sign-off", docType: "Approval Doc", date: "2024-10-05", status: "Progress", action: "Upload" },
  { name: "Final Prototype", docType: "Hi-Fi Prototype", date: "2024-10-08", status: "Progress", action: "Upload" },
  { name: "Release Notes v1.0", docType: "Release Notes", date: "2024-10-10", status: "Pending", action: "Upload",
    comment: "Butuh tanda tangan pejabat berwenang.",
    missing: ["TTD pejabat berwenang", "Stempel instansi (jika diperlukan)"] },
  { name: "Performance Test", docType: "Test Report", date: "2024-10-12", status: "Done", action: "Submitted" },
  { name: "Security Review", docType: "Security Checklist", date: "2024-10-15", status: "Pending", action: "Upload",
    comment: "Lampirkan checklist keamanan & hasil scan AV.",
    missing: ["Checklist keamanan", "Hasil scan antivirus (PDF)"] },
  { name: "Localization Pack", docType: "i18n Files", date: "2024-10-18", status: "Progress", action: "Upload" },
  { name: "Data Migration Plan", docType: "Migration Plan", date: "2024-10-20", status: "Pending", action: "Upload",
    comment: "Tambahkan jadwal rinci migrasi.",
    missing: ["Timeline migrasi (Gantt/CSV)", "Dokumen fallback plan"] },
  { name: "Rollout Plan", docType: "Rollout Strategy", date: "2024-10-22", status: "Pending", action: "Upload",
    comment: "Perlu rencana komunikasi pengguna.",
    missing: ["Rencana komunikasi (template)", "Draft email pengumuman"] },
  { name: "Training Material", docType: "Docs & Video", date: "2024-10-24", status: "Progress", action: "Upload" },
  { name: "Post-Launch Survey", docType: "Survey", date: "2024-10-26", status: "Pending", action: "Upload",
    comment: "Mohon unggah daftar pertanyaan survei.",
    missing: ["Daftar pertanyaan survei (PDF)"] },
];

const STATUS_OPTIONS = ["All", "Done", "Progress", "Pending"];

function Badge({ status }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

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

export default function StatusProses() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortByDateDesc, setSortByDateDesc] = useState(true);

  // modal state
  const [openModal, setOpenModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const filtered = useMemo(() => {
    let rows = RAW_DATA.filter((r) => {
      const matchText =
        r.name.toLowerCase().includes(q.toLowerCase()) ||
        r.docType.toLowerCase().includes(q.toLowerCase());
      const matchStatus = status === "All" ? true : r.status === status;
      return matchText && matchStatus;
    });

    rows.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortByDateDesc ? db - da : da - db;
    });

    return rows;
  }, [q, status, sortByDateDesc]);

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
          <span className="muted">Filter by</span>
          <button
            className={`chip ${sortByDateDesc ? "active" : ""}`}
            onClick={() => setSortByDateDesc((v) => !v)}
            title="Urutkan tanggal pengajuan"
          >
            dates
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              className={`chip ${status === s ? "active" : ""}`}
              onClick={() => { setStatus(s); setPage(1); }}
            >
              {s}
            </button>
          ))}
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
                  {new Date(r.date).toLocaleDateString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </td>
                <td>
                  <Badge status={r.status} />
                  {/* Komentar jika Pending */}
                  {r.status === "Pending" && r.comment && (
                    <div className="pending-comment">
                      {/* ikon kecil komentar */}
                      <span className="cmt-icon">💬</span>
                      <span>{r.comment}</span>
                    </div>
                  )}
                </td>
                <td>
                  {r.status === "Pending" ? (
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
