import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  fetchAllDataPks,
  upsertDataPks,
  deleteDataPksByLocalId,
} from "../lib/datapksRepo";
import { useAdminRefresh } from "../hooks/useAdminRefresh";
import "./DataPks.css";

const LS_KEY = "datapks_rows";
const firePKSChanged = () => {
  try {
    window.dispatchEvent(new CustomEvent("datapks:changed"));
  } catch {}
};

export default function DataPks() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    namaRS: "",
    wilayah: "RIAU",
    masaBerlaku: 5,
    tglAwal: "",
    tglAkhir: "",
    noRS: "",
    noJR: "",
  });

  // ===== Notifikasi state =====
  const [dueModal, setDueModal] = useState(false);
  const [dueGroups, setDueGroups] = useState({ overdue: [], h14: [], h30: [] });
  const lastLevelRef = useRef(null);

  const sirenCtxRef = useRef(null);
  const sirenOscRef = useRef([]);
  const sirenTimeoutRef = useRef(null);

  // ===== Helpers tanggal (FIX NaN) =====
  const normDate = (dStr) => {
    if (!dStr) return null;
    const d = new Date(dStr);
    if (!Number.isFinite(d.getTime())) return null; // ✅ invalid guard
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };

  const daysLeft = (end) => {
    const t = today().getTime();
    const nd = normDate(end);
    if (!nd) return Infinity; // ✅ kalau invalid, jangan bikin NaN
    const e = nd.getTime();
    return Math.ceil((e - t) / (1000 * 60 * 60 * 24));
  };

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  // ===== Pagination =====
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ===== Normalisasi wilayah + tanggal helper (FIX notifikasi) =====
  const normalizeRows = (arr) =>
    (arr || []).map((r) => {
      const tglAwal =
        r.tglAwal || r.tgl_awal || r.tanggal_awal || r.tanggalAwal || "";

      const tglAkhir =
        r.tglAkhir || r.tgl_akhir || r.tanggal_akhir || r.tanggalAkhir || "";

      return {
        ...r,
        tglAwal,
        tglAkhir,
        wilayah: r.wilayah === "DUMAI" ? "PWK. DUMAI" : r.wilayah || "RIAU",
      };
    });

  // ===== persist helper =====
  const persist = useCallback((arr) => {
    setRows(arr);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    firePKSChanged();
  }, []);

  // ===== FETCHER untuk useAdminRefresh =====
  const fetcherPks = useCallback(async () => {
    // 1) ambil remote
    const remote = await fetchAllDataPks();

    // 2) kalau remote ada isi, pakai remote
    if (Array.isArray(remote) && remote.length > 0) {
      const fixedRemote = normalizeRows(remote);
      localStorage.setItem(LS_KEY, JSON.stringify(fixedRemote));
      firePKSChanged();
      return fixedRemote;
    }

    // 3) fallback ke cache
    const cached = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return normalizeRows(cached);
  }, []);

  const onRefresh = useCallback(async () => {
    const data = await fetcherPks();
    persist(data);
    checkDue(data);
    return data;
  }, [fetcherPks, persist]);

  const { loading, loadedAt, toast, setToast, refresh } = useAdminRefresh(
    onRefresh,
    "Data PKS berhasil diperbarui"
  );

  // mount: tampilkan cache dulu, lalu refresh remote
  useEffect(() => {
    const cached = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    if (cached.length) {
      const fixedCache = normalizeRows(cached);
      persist(fixedCache);
    }
    refresh();
  }, [persist, refresh]);

  // ===== CRUD =====
  const resetForm = () => {
    setForm({
      namaRS: "",
      wilayah: "RIAU",
      masaBerlaku: 5,
      tglAwal: "",
      tglAkhir: "",
      noRS: "",
      noJR: "",
    });
    setEditing(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const namaRS = (form.namaRS || "").trim();
    if (!namaRS || !form.tglAwal || !form.tglAkhir) {
      alert("Lengkapi Nama RS, Tanggal Awal, dan Tanggal Akhir.");
      return;
    }
    if (new Date(form.tglAkhir) < new Date(form.tglAwal)) {
      alert("Tanggal Akhir tidak boleh lebih awal dari Tanggal Awal.");
      return;
    }

    const localId = editing ?? String(Date.now());
    const record = {
      id: localId,
      namaRS,
      wilayah: form.wilayah || "RIAU",
      masaBerlaku: Number(form.masaBerlaku) || 0,
      tglAwal: form.tglAwal,
      tglAkhir: form.tglAkhir,
      noRS: (form.noRS || "").trim(),
      noJR: (form.noJR || "").trim(),
    };

    try {
      await upsertDataPks(record);
      resetForm();
      await refresh(); // ✅ samain refresh global (toast + loadedAt)
    } catch (err) {
      console.error("Simpan ke Supabase gagal:", err);
      // simpan lokal agar tidak hilang
      const next = editing
        ? rows.map((r) => (r.id === editing ? record : r))
        : [record, ...rows];
      persist(normalizeRows(next));
      resetForm();
      alert(
        "Gagal menyimpan ke server. Disimpan lokal & akan dicoba sinkron lagi saat koneksi OK."
      );
    }
  };

  const onEdit = (r) => {
    setEditing(r.id);
    setForm({ ...r });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (id) => {
    if (!confirm("Hapus data ini?")) return;

    try {
      await deleteDataPksByLocalId(id);
    } catch (e) {
      console.warn("Hapus di Supabase gagal (akan tetap hapus lokal):", e);
    }

    const next = rows.filter((r) => r.id !== id);
    persist(next);
    if (editing === id) resetForm();

    await refresh(); // ✅ biar sinkron + toast
  };

  // ===== Sort → filter → paginate (ini jadi sumber tabel) =====
  const sortedFiltered = useMemo(() => {
    const key = q.trim().toLowerCase();
    const base = !key
      ? rows
      : rows.filter((r) =>
          [r.namaRS, r.wilayah, r.noRS, r.noJR]
            .join("|")
            .toLowerCase()
            .includes(key)
        );

    return base
      .map((r) => ({ ...r, _days: daysLeft(r.tglAkhir) }))
      .sort((a, b) => a._days - b._days);
  }, [rows, q]);

  const total = sortedFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStartIndex = (page - 1) * pageSize;
  const pageEndIndex = Math.min(page * pageSize, total);
  const currentRows = sortedFiltered.slice(pageStartIndex, pageEndIndex);

  useEffect(() => setPage(1), [q, pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // ====== Siren ======
  // ====== Siren (bisa distop) ======
  const siren = async (seconds = 3, cycles = 2) => {
    try {
      // kalau sebelumnya masih bunyi, stop dulu
      stopSiren();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      sirenCtxRef.current = ctx;
      sirenOscRef.current = [];

      const master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);

      const endAt = ctx.currentTime + seconds * cycles;

      for (let c = 0; c < cycles; c++) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.connect(master);

        const start = ctx.currentTime + c * seconds;
        const mid = start + seconds / 2;
        const stop = start + seconds;

        osc.frequency.setValueAtTime(550, start);
        osc.frequency.linearRampToValueAtTime(1050, mid);
        osc.frequency.linearRampToValueAtTime(550, stop);

        osc.start(start);
        osc.stop(stop);

        sirenOscRef.current.push(osc);
      }

      if (navigator.vibrate) {
        const pattern = [];
        for (let i = 0; i < cycles * 6; i++) pattern.push(220, 120);
        navigator.vibrate(pattern);
      }

      // auto-close context setelah selesai (kalau belum distop manual)
      sirenTimeoutRef.current = setTimeout(() => {
        try {
          ctx.close();
        } catch {}
        sirenCtxRef.current = null;
        sirenOscRef.current = [];
      }, (endAt - ctx.currentTime) * 1000 + 250);
    } catch {}
  };

  const stopSiren = () => {
    try {
      // stop vibrate
      if (navigator.vibrate) navigator.vibrate(0);

      // stop semua osc yang masih aktif
      (sirenOscRef.current || []).forEach((osc) => {
        try {
          osc.stop();
        } catch {}
        try {
          osc.disconnect();
        } catch {}
      });
      sirenOscRef.current = [];

      // close audio context
      if (sirenCtxRef.current) {
        try {
          sirenCtxRef.current.close();
        } catch {}
        sirenCtxRef.current = null;
      }

      // clear timeout auto-close
      if (sirenTimeoutRef.current) {
        clearTimeout(sirenTimeoutRef.current);
        sirenTimeoutRef.current = null;
      }
    } catch {}
  };

  const setSnooze = (ms) => {
  try { localStorage.setItem("datapks_snooze_until", String(Date.now() + ms)); } catch {}
  closeDueModal(); // stop siren + tutup
};

  const closeDueModal = () => {
    stopSiren();
    setDueModal(false);
  };

  // ===== Notifikasi & Modal =====
  const checkDue = (list = rows) => {
  // hormati snooze
  const snoozeUntil = Number(localStorage.getItem("datapks_snooze_until") || 0);
  if (Date.now() < snoozeUntil) return;

  const sorted = [...list]
    .map((r) => ({ ...r, _days: daysLeft(r.tglAkhir) }))
    .filter((r) => Number.isFinite(r._days))
    .sort((a, b) => a._days - b._days);

  const overdue = sorted.filter((r) => r._days <= 0);
  const h14 = sorted.filter((r) => r._days > 0 && r._days <= 14);
  const h30 = sorted.filter((r) => r._days > 14 && r._days <= 30);

  let level = null;
  if (overdue.length) level = "overdue";
  else if (h14.length) level = "h14";
  else if (h30.length) level = "h30";

  if (level) {
    setDueGroups({ overdue, h14, h30 });
    setDueModal(true);
    if (lastLevelRef.current !== level) {
      if (level === "overdue") siren(3, 3);
      else if (level === "h14") siren(2.5, 2);
      else siren(2, 2);
      lastLevelRef.current = level;
    }
  } else {
    setDueModal(false);
    setDueGroups({ overdue: [], h14: [], h30: [] });
    lastLevelRef.current = null;
  }
};


  useEffect(() => {
    if (rows.length) checkDue(rows);
  }, [rows]);
  useEffect(() => {
    const id = setInterval(() => checkDue(), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const badgeFor = (dLeft) => {
    if (dLeft <= 0)
      return {
        cls: "pill red",
        text: dLeft === 0 ? "Hari ini" : `${Math.abs(dLeft)} hari lewat`,
      };
    if (dLeft <= 14) return { cls: "pill red", text: `${dLeft} hari lagi` };
    if (dLeft <= 30) return { cls: "pill", text: `${dLeft} hari lagi` };
    return { cls: "pill green", text: `${dLeft} hari lagi` };
  };

  return (
    <div className="df-wrap">
      <div className="df-head">
        <div className="df-title">
          <span className="df-spark">📑</span>
          <h1>Data PKS</h1>
          <span className="df-ribbon">🤝</span>
        </div>
        <p className="df-sub">
          Notifikasi otomatis saat H-30, H-14, dan <b>jatuh tempo</b>. Wilayah:{" "}
          <b>RIAU</b> / <b>PWK. DUMAI</b>.
        </p>

        {/* ✅ status baris + waktu update */}
        <p className="muted small" style={{ marginTop: 4 }}>
          {loading ? "Memuat…" : `${total} baris ditampilkan`}
          {loadedAt
            ? ` • diperbarui ${loadedAt.toLocaleTimeString("id-ID")}`
            : ""}
        </p>
      </div>

      {/* Toolbar */}
      <div className="df-toolbar">
        <div className="df-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari RS / nomor perjanjian…"
          />
          <span className="df-emoji">🔎</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="df-btn df-primary"
            onClick={refresh}
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="df-card form-card">
        <h3 className="card-title" style={{ marginTop: 0 }}>
          {editing ? "Edit Data PKS" : "Tambah Data PKS"}
        </h3>

        <form onSubmit={onSubmit} className="grid-form">
          <div className="full field">
            <label>Nama RS *</label>
            <input
              value={form.namaRS}
              onChange={(e) =>
                setForm((f) => ({ ...f, namaRS: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Wilayah</label>
            <select
              value={form.wilayah}
              onChange={(e) =>
                setForm((f) => ({ ...f, wilayah: e.target.value }))
              }
            >
              <option value="RIAU">RIAU</option>
              <option value="PWK. DUMAI">PWK. DUMAI</option>
            </select>
          </div>

          <div className="field">
            <label>Masa Berlaku (th)</label>
            <input
              type="number"
              value={form.masaBerlaku}
              onChange={(e) =>
                setForm((f) => ({ ...f, masaBerlaku: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Tanggal Perjanjian Awal *</label>
            <input
              type="date"
              value={form.tglAwal}
              onChange={(e) =>
                setForm((f) => ({ ...f, tglAwal: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Tanggal Perjanjian Akhir *</label>
            <input
              type="date"
              value={form.tglAkhir}
              onChange={(e) =>
                setForm((f) => ({ ...f, tglAkhir: e.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Nomor Perjanjian RS</label>
            <input
              value={form.noRS}
              onChange={(e) => setForm((f) => ({ ...f, noRS: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Nomor Perjanjian JR</label>
            <input
              value={form.noJR}
              onChange={(e) => setForm((f) => ({ ...f, noJR: e.target.value }))}
            />
          </div>

          <div className="full" style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">
              {editing ? "Simpan" : "Tambahkan"}
            </button>
            {editing && (
              <button className="btn-ghost" type="button" onClick={resetForm}>
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Pager atas */}
      {total > 0 && (
        <div className="df-pager" style={{ marginTop: 8 }}>
          <div className="df-pager-left">
            <span className="df-pager-info">
              Menampilkan <b>{pageStartIndex + 1}</b>–<b>{pageEndIndex}</b> dari{" "}
              <b>{total}</b>
            </span>
          </div>
          <div className="df-pager-right">
            <label
              className="muted"
              htmlFor="page-size"
              style={{ marginRight: 8 }}
            >
              Baris / halaman
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="df-select"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="df-card table-wrap" style={{ marginTop: 14 }}>
        <table className="nice-table wide-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama RS</th>
              <th>Wilayah</th>
              <th>Masa</th>
              <th>Tgl Awal</th>
              <th>Tgl Akhir</th>
              <th>Jatuh Tempo</th>
              <th>No Perjanjian RS</th>
              <th>No Perjanjian JR</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={10} className="df-empty">
                  <div className="df-empty-emoji">🫥</div>
                  Tidak ada data
                </td>
              </tr>
            ) : (
              currentRows.map((r, i) => {
                const badge = badgeFor(r._days);
                const displayNo = pageStartIndex + i + 1;
                return (
                  <tr key={r.id}>
                    <td>{displayNo}</td>
                    <td>{r.namaRS}</td>
                    <td>{r.wilayah}</td>
                    <td>{r.masaBerlaku} th</td>
                    <td>{fmtDate(r.tglAwal)}</td>
                    <td>{fmtDate(r.tglAkhir)}</td>
                    <td>
                      <span className={badge.cls}>{badge.text}</span>
                    </td>
                    <td>{r.noRS}</td>
                    <td>{r.noJR}</td>
                    <td>
                      <div className="df-actions">
                        <button
                          className="df-btn"
                          onClick={() => onEdit(r)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="df-btn df-danger"
                          onClick={() => onDelete(r.id)}
                          title="Hapus"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pager bawah */}
        {total > 0 && (
          <div className="df-pager" style={{ marginTop: 10 }}>
            <div className="df-pager-left">
              <button
                className="btn-ghost"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                ⏮️
              </button>
              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ◀️ Prev
              </button>

              <span className="df-pager-info">
                Halaman <b>{page}</b> dari <b>{totalPages}</b>
                <span className="df-pager-sep">•</span>
                Menampilkan <b>{pageStartIndex + 1}</b>–<b>{pageEndIndex}</b>{" "}
                dari <b>{total}</b>
              </span>

              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next ▶️
              </button>
              <button
                className="btn-ghost"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                ⏭️
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==== MODAL Notifikasi (kamu boleh keep persis yang lama) ==== */}
      {dueModal && (
  <div className="due-overlay" onMouseDown={closeDueModal} onClick={closeDueModal}>
    <div
      className="due-modal fancy compact"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="due-header">
        <div className="due-header-icon">⏰</div>
        <div className="due-header-text">
          <h3>PKS Mendekati Jatuh Tempo</h3>
          <p>Cek segera agar tidak terlewat. Kamu bisa snooze kalau lagi sibuk.</p>
        </div>
        <button
          type="button"
          className="due-close"
          onClick={closeDueModal}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Tutup"
          title="Tutup"
        >✕</button>
      </div>

      {/* Stat chips */}
      <div className="due-stats">
        <div className="due-chip red">🚨 Overdue <span>{dueGroups.overdue.length}</span></div>
        <div className="due-chip amber">🟠 H-14 <span>{dueGroups.h14.length}</span></div>
        <div className="due-chip green">🟢 H-30 <span>{dueGroups.h30.length}</span></div>
      </div>

      {/* Isi daftar */}
      <div className="due-content">
        {dueGroups.overdue.length > 0 && (
          <section>
            <h4 className="due-sec">Sudah jatuh tempo / lewat</h4>
            <table className="due-table">
              <thead>
                <tr><th>Rumah Sakit</th><th>Berakhir</th><th>Status</th></tr>
              </thead>
              <tbody>
                {dueGroups.overdue.map((r) => (
                  <tr key={r.id}>
                    <td>{r.namaRS}</td>
                    <td>{fmtDate(r.tglAkhir)}</td>
                    <td><span className="due-badge red">Lewat</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {dueGroups.h14.length > 0 && (
          <section>
            <h4 className="due-sec" style={{borderColor:'#fdba74', color:'#b45309'}}>H-14</h4>
            <table className="due-table">
              <thead>
                <tr><th>Rumah Sakit</th><th>Sisa Hari</th><th>Status</th></tr>
              </thead>
              <tbody>
                {dueGroups.h14.map((r) => (
                  <tr key={r.id}>
                    <td>{r.namaRS}</td>
                    <td>{r._days} hari</td>
                    <td><span className="due-badge amber">Segera</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {dueGroups.h30.length > 0 && (
          <section>
            <h4 className="due-sec" style={{borderColor:'#86efac', color:'#166534'}}>H-30</h4>
            <table className="due-table">
              <thead>
                <tr><th>Rumah Sakit</th><th>Sisa Hari</th><th>Status</th></tr>
              </thead>
              <tbody>
                {dueGroups.h30.map((r) => (
                  <tr key={r.id}>
                    <td>{r.namaRS}</td>
                    <td>{r._days} hari</td>
                    <td><span className="due-badge green">Aman</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* Footer actions */}
      <div className="due-footer">
        <div className="due-footer-left">
          <button className="cta ghost" onClick={() => setSnooze(60 * 60 * 1000)} title="Sembunyikan 1 jam">🔕 Snooze 1 jam</button>
          <button className="cta ghost" onClick={() => setSnooze(24 * 60 * 60 * 1000)} title="Sembunyikan 1 hari">⏰ Snooze 1 hari</button>
        </div>
        <div className="due-footer-right">
          <button className="cta primary" onClick={closeDueModal}>Tutup</button>
        </div>
      </div>
    </div>
  </div>
)}

      {/* ✅ TOAST (samain pattern) */}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          onAnimationEnd={() => setToast(null)}
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            background: toast.type === "error" ? "#ffe5e5" : "#e8fff0",
            color: toast.type === "error" ? "#a30f2d" : "#0f7a4c",
            border: "1px solid",
            borderColor: toast.type === "error" ? "#ffb8b8" : "#bfead5",
            padding: "10px 14px",
            borderRadius: 10,
            fontWeight: 600,
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            animation: "toastHide 2.2s ease forwards",
            zIndex: 10000,
          }}
        >
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes toastHide {
          0% { opacity: 0; transform: translateY(8px); }
          10% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0; transform: translateY(8px); }
        }
      `}</style>
    </div>
  );
}
