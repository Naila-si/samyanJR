import React, { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient"; // ✅ NEW: tarik dari Supabase
// (opsional) kalau FE user juga punya auth:
// import { useAuth } from "../auth/AuthContext";

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

/* ==========================================
   KOMPONEN UTAMA
   ========================================== */
export default function StatusProses() {
  // (opsional) kalau app user juga punya auth:
  // const { user } = useAuth?.() ?? {};

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Semua");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortByDateDesc, setSortByDateDesc] = useState(true);
  const [loading, setLoading] = useState(true);

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
          .from("DataForm")
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
          { event: "*", schema: "public", table: "DataForm" },
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
                          onClick={() => { openWith("report", r); showToast("Siap mengunduh laporan.", "success"); }}
                        >
                          Unduh Laporan
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
      `}</style>
    </div>
  );
}
