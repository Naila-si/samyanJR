import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAllDataPks, upsertDataPks, deleteDataPksByLocalId } from "../lib/datapksRepo";
import "./DataPks.css";

const LS_KEY = "datapks_rows";
const firePKSChanged = () => {
  try { window.dispatchEvent(new CustomEvent("datapks:changed")); } catch {}
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

  // ===== Helpers tanggal =====
  const normDate = (dStr) => {
    if (!dStr) return null;
    const d = new Date(dStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };
  const daysLeft = (end) => {
    const t = today().getTime();
    const e = normDate(end)?.getTime() ?? 0;
    return Math.ceil((e - t) / (1000 * 60 * 60 * 24));
  };
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
      : "-";

  // ===== Pagination =====
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sort → filter → paginate (urutkan dulu biar konsisten)
  const sortedFiltered = useMemo(() => {
    const base = (!q.trim()
      ? rows
      : rows.filter((r) =>
          [r.namaRS, r.wilayah, r.noRS, r.noJR]
            .join("|")
            .toLowerCase()
            .includes(q.trim().toLowerCase())
        )
    )
      .map((r) => ({ ...r, _days: daysLeft(r.tglAkhir) }))
      .sort((a, b) => a._days - b._days);

    return base;
  }, [rows, q]);

  const total = sortedFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStartIndex = (page - 1) * pageSize;
  const pageEndIndex = Math.min(page * pageSize, total);
  const currentRows = sortedFiltered.slice(pageStartIndex, pageEndIndex);

  // Pastikan page valid saat filter/rows berubah
  useEffect(() => {
    // reset ke halaman 1 kalau pencarian atau pageSize berubah
    setPage(1);
  }, [q, pageSize]);

  useEffect(() => {
    // clamp kalau total halaman berkurang
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  useEffect(() => {
    // 1) Ambil dari cache lokal dulu biar UI cepat muncul
    const cached = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    if (cached.length) {
      // Normalisasi wilayah di cache
      const fixedCache = cached.map(r => ({
        ...r,
        wilayah: r.wilayah === "DUMAI" ? "PWK. DUMAI" : r.wilayah,
      }));
      setRows(fixedCache);
      localStorage.setItem(LS_KEY, JSON.stringify(fixedCache));
      firePKSChanged();
    }

    // 2) Coba ambil dari Supabase
    (async () => {
      try {
        const remote = await fetchAllDataPks();

        if (Array.isArray(remote) && remote.length > 0) {
          // Normalisasi wilayah hasil fetch
          const fixedRemote = remote.map(r => ({
            ...r,
            wilayah: r.wilayah === "DUMAI" ? "PWK. DUMAI" : r.wilayah,
          }));

          setRows(fixedRemote);
          localStorage.setItem(LS_KEY, JSON.stringify(fixedRemote));
          firePKSChanged();
        } else {
          console.warn("[DataPKS] Remote kosong, keep local cache.");
        }
      } catch (e) {
        console.error("[DataPKS] Fetch Supabase gagal, keep local cache:", e);
        // biarkan rows tetap pakai cache yang sudah di-set di atas
      }
    })();
  }, []);

  const persist = (arr) => {
    setRows(arr);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
    firePKSChanged();
  };

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

    // validasi sederhana
    const namaRS = (form.namaRS || "").trim();
    if (!namaRS || !form.tglAwal || !form.tglAkhir) {
      alert("Lengkapi Nama RS, Tanggal Awal, dan Tanggal Akhir.");
      return;
    }
    if (new Date(form.tglAkhir) < new Date(form.tglAwal)) {
      alert("Tanggal Akhir tidak boleh lebih awal dari Tanggal Awal.");
      return;
    }

    // record konsisten
    const localId = editing ?? String(Date.now());
    const record = {
      id: localId,
      namaRS: namaRS,
      wilayah: form.wilayah || "RIAU",
      masaBerlaku: Number(form.masaBerlaku) || 0,
      tglAwal: form.tglAwal,
      tglAkhir: form.tglAkhir,
      noRS: (form.noRS || "").trim(),
      noJR: (form.noJR || "").trim(),
    };

    try {
      const saved = await upsertDataPks(record); // sinkron server
      const next = editing ? rows.map((r) => (r.id === editing ? saved : r)) : [saved, ...rows];
      persist(next);
      resetForm();
    } catch (err) {
      console.error("Simpan ke Supabase gagal:", err);
      // simpan lokal agar tidak hilang
      const next = editing ? rows.map((r) => (r.id === editing ? record : r)) : [record, ...rows];
      persist(next);
      resetForm();
      alert("Gagal menyimpan ke server. Disimpan lokal & akan dicoba sinkron lagi saat koneksi OK.");
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
      await deleteDataPksByLocalId(id); // hapus di Supabase
    } catch (e) {
      console.warn("Hapus di Supabase gagal (akan tetap hapus lokal):", e);
    }

    const next = rows.filter((r) => r.id !== id);
    persist(next);
    if (editing === id) resetForm();
  };

  // ===== Filter pencarian =====
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return !key
      ? rows
      : rows.filter((r) => [r.namaRS, r.wilayah, r.noRS, r.noJR].join("|").toLowerCase().includes(key));
  }, [rows, q]);

  // ====== Siren ======
  const siren = async (seconds = 3, cycles = 2) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
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
      }
      if (navigator.vibrate) {
        const pattern = [];
        for (let i = 0; i < cycles * 6; i++) pattern.push(220, 120);
        navigator.vibrate(pattern);
      }
      setTimeout(() => ctx.close(), (endAt - ctx.currentTime) * 1000 + 200);
    } catch {}
  };

  // ===== Notifikasi & Modal =====
  const checkDue = (list = rows) => {
    const sorted = [...list].map((r) => ({ ...r, _days: daysLeft(r.tglAkhir) }));
    sorted.sort((a, b) => a._days - b._days);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    const id = setInterval(() => checkDue(), 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badgeFor = (dLeft) => {
    if (dLeft <= 0) return { cls: "pill red", text: dLeft === 0 ? "Hari ini" : `${Math.abs(dLeft)} hari lewat` };
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
          Notifikasi otomatis saat H-30, H-14, dan <b>jatuh tempo</b>. Wilayah: <b>RIAU</b> / <b>PWK. DUMAI</b>.
        </p>
      </div>

      {/* Toolbar */}
      <div className="df-toolbar">
        <div className="df-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari RS / nomor perjanjian…" />
          <span className="df-emoji">🔎</span>
        </div>
      </div>

      {/* Form */}
      <div className="df-card form-card">
        <h3 className="card-title" style={{ marginTop: 0 }}>{editing ? "Edit Data PKS" : "Tambah Data PKS"}</h3>
        <form onSubmit={onSubmit} className="grid-form">
          <div className="full field">
            <label>Nama RS *</label>
            <input value={form.namaRS} onChange={(e) => setForm((f) => ({ ...f, namaRS: e.target.value }))} />
          </div>

          <div className="field">
            <label>Wilayah</label>
            <select value={form.wilayah} onChange={(e) => setForm((f) => ({ ...f, wilayah: e.target.value }))}>
              <option value="RIAU">RIAU</option>
              <option value="PWK. DUMAI">PWK. DUMAI</option>
            </select>
          </div>

          <div className="field">
            <label>Masa Berlaku (th)</label>
            <input type="number" value={form.masaBerlaku} onChange={(e) => setForm((f) => ({ ...f, masaBerlaku: e.target.value }))} />
          </div>

          <div className="field">
            <label>Tanggal Perjanjian Awal *</label>
            <input type="date" value={form.tglAwal} onChange={(e) => setForm((f) => ({ ...f, tglAwal: e.target.value }))} />
          </div>

          <div className="field">
            <label>Tanggal Perjanjian Akhir *</label>
            <input type="date" value={form.tglAkhir} onChange={(e) => setForm((f) => ({ ...f, tglAkhir: e.target.value }))} />
          </div>

          <div className="field">
            <label>Nomor Perjanjian RS</label>
            <input value={form.noRS} onChange={(e) => setForm((f) => ({ ...f, noRS: e.target.value }))} />
          </div>
          <div className="field">
            <label>Nomor Perjanjian JR</label>
            <input value={form.noJR} onChange={(e) => setForm((f) => ({ ...f, noJR: e.target.value }))} />
          </div>

          <div className="full" style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">{editing ? "Simpan" : "Tambahkan"}</button>
            {editing && <button className="btn-ghost" type="button" onClick={resetForm}>Batal</button>}
          </div>
        </form>
      </div>

      {/* Tabel */}
      {/* Pager Atas: hanya page size + info */}
      {total > 0 && (
        <div className="df-pager" style={{ marginTop: 8 }}>
          <div className="df-pager-left">
            <span className="df-pager-info">
              Menampilkan <b>{pageStartIndex + 1}</b>–<b>{pageEndIndex}</b> dari <b>{total}</b>
            </span>
          </div>
          <div className="df-pager-right">
            <label className="muted" htmlFor="page-size" style={{ marginRight: 8 }}>
              Baris / halaman
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="df-select"
              aria-label="Baris per halaman"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      <div className="df-card table-wrap" style={{ marginTop: 14 }}>
        <table className="nice-table wide-table">
          <colgroup>
            <col style={{width: '56px'}} />
            <col style={{width: '320px'}} />
            <col style={{width: '110px'}} />
            <col style={{width: '80px'}} />
            <col style={{width: '120px'}} />
            <col style={{width: '120px'}} />
            <col style={{width: '140px'}} />
            <col style={{width: '260px'}} />
            <col style={{width: '220px'}} />
            <col style={{width: '110px'}} />
          </colgroup>
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
                    <td data-label="No">{displayNo}</td>
                    <td data-label="Nama RS">{r.namaRS}</td>
                    <td data-label="Wilayah">{r.wilayah}</td>
                    <td data-label="Masa">{r.masaBerlaku} th</td>
                    <td data-label="Tgl Awal">{fmtDate(r.tglAwal)}</td>
                    <td data-label="Tgl Akhir">{fmtDate(r.tglAkhir)}</td>
                    <td data-label="Jatuh Tempo">
                      <span className={badge.cls}>{badge.text}</span>
                    </td>
                    <td data-label="No Perjanjian RS">{r.noRS}</td>
                    <td data-label="No Perjanjian JR">{r.noJR}</td>
                    <td data-label="Aksi">
                      <div className="df-actions">
                        <button className="df-btn" onClick={() => onEdit(r)} title="Edit">✏️</button>
                        <button className="df-btn df-danger" onClick={() => onDelete(r.id)} title="Hapus">🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pager Bawah: tombol panah + info */}
        {total > 0 && (
          <div className="df-pager" style={{ marginTop: 10 }}>
            <div className="df-pager-left">
              <button
                className="btn-ghost"
                onClick={() => setPage(1)}
                disabled={page === 1}
                title="Halaman pertama"
                aria-label="Halaman pertama"
              >
                ⏮️
              </button>
              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                title="Sebelumnya"
                aria-label="Halaman sebelumnya"
              >
                ◀️ Prev
              </button>

              <span className="df-pager-info">
                Halaman <b>{page}</b> dari <b>{totalPages}</b>
                <span className="df-pager-sep">•</span>
                Menampilkan <b>{pageStartIndex + 1}</b>–<b>{pageEndIndex}</b> dari <b>{total}</b>
              </span>

              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                title="Berikutnya"
                aria-label="Halaman berikutnya"
              >
                Next ▶️
              </button>
              <button
                className="btn-ghost"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                title="Halaman terakhir"
                aria-label="Halaman terakhir"
              >
                ⏭️
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==== MODAL Notifikasi: tampilkan SEMUA data, modal scrollable ==== */}
      {dueModal && (
        <div
          className="due-overlay"                 // <<< ganti: bukan sb-overlay lagi
          onClick={() => setDueModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",                      // paksa tampil
            placeItems: "center",
            padding: 16,
            cursor: "pointer",
            zIndex: 9999,                         // di atas segalanya
            background:
              "radial-gradient(1200px 600px at 100% -20%, rgba(255,227,234,.7), transparent 60%), rgba(17,24,39,.45)"
          }}
        >
          <div
            className="df-card due-modal"
            role="dialog" aria-modal="true" aria-labelledby="due-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 96vw)",
              maxHeight: "84vh",
              overflow: "auto",
              background: "#fff",
              border: "2px solid #ff8ea0",
              boxShadow: "0 28px 80px rgba(238,109,115,.35)",
              animation: "pulseGlow 1.2s ease-in-out infinite",
              borderRadius: 16
            }}
          >
            <div style={{ padding: "16px 20px 8px" }}>
              <h3 id="due-title" style={{ margin: 0, color: "#b91c1c", fontWeight: 900 }}>
                🚨 Peringatan PKS
              </h3>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Berikut daftar RS yang <b>jatuh tempo</b> atau akan berakhir dalam <b>30 hari</b>.
              </p>
            </div>

            {/* Lewat / H0 */}
            {dueGroups.overdue.length > 0 && (
              <>
                <h4 className="due-sec">Lewat / Hari Ini ({dueGroups.overdue.length})</h4>
                <table className="due-table">
                  <colgroup>
                    <col style={{width:'56px'}}/><col style={{width:'320px'}}/>
                    <col style={{width:'140px'}}/><col style={{width:'160px'}}/>
                    <col style={{width:'180px'}}/>
                  </colgroup>
                  <thead>
                    <tr><th>No</th><th>Nama RS</th><th>Wilayah</th><th>Tgl Akhir</th><th>Keterangan</th></tr>
                  </thead>
                  <tbody>
                    {dueGroups.overdue.map((d,i)=>(
                      <tr key={`over-${d.id}`}>
                        <td>{i+1}</td>
                        <td>{d.namaRS}</td>
                        <td>{d.wilayah}</td>
                        <td>{fmtDate(d.tglAkhir)}</td>
                        <td><span className="due-badge red">{d._days===0?"Hari ini":`${Math.abs(d._days)} hari lewat`}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* ≤ 14 hari */}
            {dueGroups.h14.length > 0 && (
              <>
                <h4 className="due-sec">≤ 14 Hari ({dueGroups.h14.length})</h4>
                <table className="due-table">
                  <colgroup>
                    <col style={{width:'56px'}}/><col style={{width:'320px'}}/>
                    <col style={{width:'140px'}}/><col style={{width:'160px'}}/>
                    <col style={{width:'160px'}}/>
                  </colgroup>
                  <thead>
                    <tr><th>No</th><th>Nama RS</th><th>Wilayah</th><th>Tgl Akhir</th><th>Sisa</th></tr>
                  </thead>
                  <tbody>
                    {dueGroups.h14.map((d,i)=>(
                      <tr key={`h14-${d.id}`}>
                        <td>{i+1}</td>
                        <td>{d.namaRS}</td>
                        <td>{d.wilayah}</td>
                        <td>{fmtDate(d.tglAkhir)}</td>
                        <td><span className="due-badge red">{d._days} hari lagi</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* ≤ 30 hari */}
            {dueGroups.h30.length > 0 && (
              <>
                <h4 className="due-sec">≤ 30 Hari ({dueGroups.h30.length})</h4>
                <table className="due-table">
                  <colgroup>
                    <col style={{width:'56px'}}/><col style={{width:'320px'}}/>
                    <col style={{width:'140px'}}/><col style={{width:'160px'}}/>
                    <col style={{width:'160px'}}/>
                  </colgroup>
                  <thead>
                    <tr><th>No</th><th>Nama RS</th><th>Wilayah</th><th>Tgl Akhir</th><th>Sisa</th></tr>
                  </thead>
                  <tbody>
                    {dueGroups.h30.map((d,i)=>(
                      <tr key={`h30-${d.id}`}>
                        <td>{i+1}</td>
                        <td>{d.namaRS}</td>
                        <td>{d.wilayah}</td>
                        <td>{fmtDate(d.tglAkhir)}</td>
                        <td><span className="due-badge amber">{d._days} hari lagi</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12 }}>
              <button className="btn-primary" onClick={() => setDueModal(false)}>Mengerti</button>
            </div>
          </div>

          {/* CSS kecil khusus modal (boleh tetap di sini) */}
          <style>{`
            .due-sec{ margin:14px 0 8px; color:#b91c1c; font-weight:800; border-left:4px solid #ff9aa2; padding-left:8px; }
            .due-table{ width:100%; border-collapse:separate; border-spacing:0; margin-bottom:12px; border:1px solid #ffe1ea; border-radius:12px; overflow:hidden; }
            .due-table thead th{ background:#fff6f9; color:#111; font-weight:800; font-size:14px; padding:12px 14px; letter-spacing:.2px; border-bottom:1px dashed #ffd1d6; }
            .due-table tbody td{ padding:12px 14px; vertical-align:middle; border-bottom:1px dashed #ffe3ea; }
            .due-table tbody tr:last-child td{ border-bottom:0; }
            .due-table tbody tr:nth-child(even) td{ background:#fffafb; }
            .due-table tbody tr:hover td{ background:#fff2f6; }
            .due-badge{ display:inline-block; padding:6px 10px; border-radius:999px; font-weight:800; font-size:12px; line-height:1; white-space:nowrap; border:1px solid; background:#fff; }
            .due-badge.red{ color:#b91c1c; border-color:#fecaca; background:#fff1f2; }
            .due-badge.amber{ color:#b45309; border-color:#fcd34d; background:#fff7ed; }
            .due-badge.green{ color:#166534; border-color:#bbf7d0; background:#ecfdf5; }
            @keyframes pulseGlow{0%,100%{box-shadow:0 28px 80px rgba(238,109,115,.35)}50%{box-shadow:0 36px 96px rgba(238,109,115,.55)}}
            .df-pager{
              display:flex; align-items:center; justify-content:space-between;
              gap:12px;
            }
            .df-pager-left{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
            .df-pager-right{ display:flex; align-items:center; gap:8px; }
            .df-pager-info{ color:#374151; }
            .df-pager-sep{ margin:0 6px; color:#9CA3AF; }
            .df-select{ padding:6px 10px; border-radius:8px; border:1px solid #E5E7EB; }
            .btn-ghost[disabled]{ opacity:.45; cursor:not-allowed; }
          `}</style>
        </div>
      )}
    </div>
  );
}
