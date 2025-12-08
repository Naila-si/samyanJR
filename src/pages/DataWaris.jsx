import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAdminRefresh } from "../hooks/useAdminRefresh";

// ========= Mini helpers =========
const currency = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ========= Modal (reusable) =========
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div
      className="sb-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,.45)",
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="df-card"
        style={{
          width: "min(960px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 20,
          border: "1px solid #f3d9de",
          boxShadow: "0 24px 60px rgba(238,109,115,.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 18px", borderBottom: "1px dashed #ffd1d6" }}>
          <h3 style={{ margin: 0, fontWeight: 800, color: "#ef4f65" }}>{title}</h3>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        <div
          style={{
            padding: 14,
            borderTop: "1px dashed #ffd1d6",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

// ========= Donut SVG simple =========
function Donut({ value, color = "#ef4f65", label = "" }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Number.isFinite(value) ? value : 0;
  const off = c * (1 - Math.min(Math.max(v, 0), 100) / 100);
  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f6e7ea" strokeWidth="16" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontWeight="800"
          fontSize="18"
          fill="#111827"
        >
          {v}%
        </text>
      </svg>
      <div style={{ marginTop: 4, fontSize: 14 }}>{label}</div>
    </div>
  );
}

// ========= MiniBar (satu kategori) =========
function MiniBar({ title, data }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div
      className="df-card"
      style={{
        padding: 14,
        borderRadius: 16,
        border: "1px solid #ffd1d6",
        background: "#fff",
        width: "100%",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
        {data.map((d, i) => (
          <div key={i} style={{ width: 22, display: "grid", alignItems: "end" }}>
            <div
              title={`${d.label} : ${currency(d.value)}`}
              style={{
                height: `${(d.value / max) * 100}%`,
                background: "#ef4f65",
                borderRadius: 6,
                opacity: 0.92,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
        {data.map((d, i) => (
          <span key={i} style={{ width: 22, textAlign: "center" }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DataAhliWaris() {
  const [rows, setRows] = useState([]);

  const fetcherWaris = useCallback(async () => {
    const { data, error } = await supabase
      .from("data_waris")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((r) => ({
      id: r.id,
      korbanNama: r.nama_korban,
      gender: r.jenis_kelamin_aw,
      ahliWarisNama: r.nama_penerima_aw || "",
      ahliWarisAlamat: r.alamat_aw || "",
      jalan: r.jalan_aw || "",
      lat: r.lat_aw ?? "",
      lng: r.lng_aw ?? "",
      santunan: r.jumlah_santunan ?? 0,
      createdAt: r.created_at,
    }));
  }, []);

  const onRefresh = useCallback(async () => {
    const mapped = await fetcherWaris();
    setRows(mapped);
    return mapped;
  }, [fetcherWaris]);

  const { loading, loadedAt, toast, setToast, refresh } =
    useAdminRefresh(onRefresh, "Data ahli waris berhasil diperbarui");

  useEffect(() => {
    refresh(); // ✅ sekarang aman, ga loop
  }, [refresh]);

  // ====== TABLE CONTROL ======
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // filtered = data yang ngikut search + sort (ini jadi sumber grafik)
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    const base = !key
      ? rows
      : rows.filter((r) =>
          [r.korbanNama, r.ahliWarisNama, r.ahliWarisAlamat, r.jalan]
            .join("|")
            .toLowerCase()
            .includes(key)
        );

    const dir = sort.dir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (sort.key === "santunan") return (a.santunan - b.santunan) * dir;
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return (ta - tb) * dir;
    });

    return sorted;
  }, [rows, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const from = (page - 1) * pageSize;
    return filtered.slice(from, from + pageSize);
  }, [filtered, page]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // ====== GRAFIK (BERDASAR filtered, bukan paged) ======

  // 1) Monthly aggregate: sum santunan + count korban per bulan, ambil last 6 bulan yang ada datanya
  const monthlyAgg = useMemo(() => {
    if (filtered.length === 0) return [];

    const map = new Map();

    for (const r of filtered) {
      const t = r.createdAt ? new Date(r.createdAt) : new Date();
      const key = monthKey(t);

      const prev = map.get(key) || {
        sum: 0,
        count: 0,
        year: t.getFullYear(),
        month: t.getMonth(),
      };

      prev.sum += Number(r.santunan || 0);
      prev.count += 1;
      map.set(key, prev);
    }

    const ordered = [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([_, v]) => ({
        label: new Date(v.year, v.month, 1).toLocaleDateString("id-ID", {
          month: "short",
        }),
        sum: v.sum,
        count: v.count,
        avg: v.count ? Math.round(v.sum / v.count) : 0,
      }));

    return ordered.slice(-6);
  }, [filtered]);

  const barSantunan = monthlyAgg.map((d) => ({ label: d.label, value: d.sum }));
  const barKorban = monthlyAgg.map((d) => ({ label: d.label, value: d.count }));
  const barRata = monthlyAgg.map((d) => ({ label: d.label, value: d.avg }));

  // 2) Donut real: proporsi gender dari jumlah korban + proporsi santunan
  const donutData = useMemo(() => {
    const totalKorban = filtered.length || 1;

    const lKorban = filtered.filter((r) => r.gender === "L").length;
    const pKorban = filtered.filter((r) => r.gender === "P").length;

    const totalSantunan = filtered.reduce((a, r) => a + Number(r.santunan || 0), 0) || 1;
    const lSant = filtered
      .filter((r) => r.gender === "L")
      .reduce((a, r) => a + Number(r.santunan || 0), 0);
    const pSant = filtered
      .filter((r) => r.gender === "P")
      .reduce((a, r) => a + Number(r.santunan || 0), 0);

    return {
      korbanP: Math.round((pKorban / totalKorban) * 100),
      korbanL: Math.round((lKorban / totalKorban) * 100),
      santP: Math.round((pSant / totalSantunan) * 100),
      santL: Math.round((lSant / totalSantunan) * 100),
    };
  }, [filtered]);

  // ====== CRUD (modal tambah/edit) ======
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    korbanNama: "",
    gender: "L",
    ahliWarisNama: "",
    ahliWarisAlamat: "",
    jalan: "",
    lat: "",
    lng: "",
    santunan: "",
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({
      korbanNama: "",
      gender: "L",
      ahliWarisNama: "",
      ahliWarisAlamat: "",
      jalan: "",
      lat: "",
      lng: "",
      santunan: "",
    });
    setOpenModal(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      korbanNama: row.korbanNama,
      gender: row.gender || "L",
      ahliWarisNama: row.ahliWarisNama,
      ahliWarisAlamat: row.ahliWarisAlamat,
      jalan: row.jalan,
      lat: String(row.lat),
      lng: String(row.lng),
      santunan: String(row.santunan),
    });
    setOpenModal(true);
  };

  const validate = () => {
    const req = [
      "korbanNama",
      "gender",
      "ahliWarisNama",
      "ahliWarisAlamat",
      "jalan",
      "lat",
      "lng",
      "santunan",
    ];
    const miss = req.filter((k) => !String(form[k]).trim());
    if (miss.length) return "Lengkapi semua field bertanda *.";

    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const sant = Number(String(form.santunan).replace(/[^\d]/g, ""));
    if ([lat, lng].some(Number.isNaN)) return "Latitude/Longitude harus angka.";
    if (Number.isNaN(sant) || sant <= 0) return "Santunan harus angka > 0.";
    return "";
  };

  const submitForm = async () => {
    const v = validate();
    if (v) return alert(v);

    const payload = {
      nama_korban: form.korbanNama.trim(),
      jenis_kelamin_aw: form.gender,
      nama_penerima_aw: form.ahliWarisNama.trim(),
      alamat_aw: form.ahliWarisAlamat.trim(),
      jalan_aw: form.jalan.trim(),
      lat_aw: Number(form.lat),
      lng_aw: Number(form.lng),
      jumlah_santunan: Number(String(form.santunan).replace(/[^\d]/g, "")),
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("data_waris")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("data_waris").insert([payload]);
        if (error) throw error;
      }

      setOpenModal(false);
      await fetcherWaris();
    } catch (err) {
      console.error("❌ submitForm gagal:", err);
      alert("Gagal menyimpan data.");
    }
  };

  const onDelete = async (id) => {
    if (!confirm("Hapus data ini?")) return;
    try {
      const { error } = await supabase.from("data_waris").delete().eq("id", id);
      if (error) throw error;
      await fetcherWaris();
    } catch (err) {
      console.error("❌ delete gagal:", err);
      alert("Gagal hapus data.");
    }
  };

  return (
    <div className="df-wrap">
      {/* Header */}
      <div className="df-head">
        <div className="df-title">
          <span className="df-spark">✨</span>
          <h1>Data Ahli Waris</h1>
          <span className="df-ribbon">🎀</span>
        </div>
        <p className="df-sub">
          Semua grafik ngikutin data tabel (hasil search + sort).
        </p>
        <p className="muted small" style={{ marginTop: 4 }}>
          {loading ? "Memuat…" : `${filtered.length} baris ditampilkan`}
          {loadedAt ? ` • diperbarui ${loadedAt.toLocaleTimeString("id-ID")}` : ""}
        </p>
      </div>

      {/* Toolbar */}
      <div className="df-toolbar">
        <div className="df-search">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama korban / ahli waris / jalan…"
          />
          <span className="df-emoji">🔎</span>
        </div>

        <div className="df-filters">
          <span className="muted small">Urut:</span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":");
              setSort({ key: k, dir: d });
              setPage(1);
            }}
          >
            <option value="createdAt:desc">Terbaru</option>
            <option value="createdAt:asc">Terlama</option>
            <option value="santunan:desc">Santunan tertinggi</option>
            <option value="santunan:asc">Santunan terendah</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="df-btn df-primary" onClick={openAdd}>
            ➕ Tambah Data
          </button>
          <button className="df-btn" onClick={refresh} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="df-card table-wrap" style={{ marginTop: 12 }}>
        <table className="nice-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Korban</th>
              <th>Gender</th>
              <th>Ahli Waris</th>
              <th>Alamat Ahli Waris</th>
              <th>Jalan / Lokasi</th>
              <th>Santunan</th>
              <th>Input</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="df-empty">
                  Loading data...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="df-empty">
                  <div className="df-empty-emoji">🫥</div>
                  Tidak ada data.
                </td>
              </tr>
            ) : (
              paged.map((r, i) => (
                <tr key={r.id}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td>{r.korbanNama}</td>
                  <td>{r.gender === "L" ? "Laki-laki" : "Perempuan"}</td>
                  <td>{r.ahliWarisNama}</td>
                  <td>{r.ahliWarisAlamat}</td>
                  <td>{r.jalan}</td>
                  <td>{currency(r.santunan)}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>
                    <div className="df-actions">
                      <button className="df-btn" onClick={() => openEdit(r)}>
                        ✏️ Edit
                      </button>
                      <button
                        className="df-btn df-danger"
                        onClick={() => onDelete(r.id)}
                      >
                        🗑️ Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* pagination */}
        <div className="table-footer">
          <div />
          <div className="pagination">
            <button
              className="pager"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              «
            </button>
            <button
              className="pager"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </button>
            <span className="pager active">{page}</span>
            <span className="ellipsis">/ {totalPages}</span>
            <button
              className="pager"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
            <button
              className="pager"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              »
            </button>
          </div>
        </div>
      </div>

      {/* CHARTS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginTop: 12,
        }}
      >
        <MiniBar title="Santunan / Bulan" data={barSantunan} />
        <MiniBar title="Jumlah Korban / Bulan" data={barKorban} />
        <MiniBar title="Rata-rata Santunan / Bulan" data={barRata} />
      </div>

      <div
        className="df-card"
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 16,
          border: "1px solid #ffd1d6",
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Proporsi Gender & Santunan
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          <Donut value={donutData.korbanP} color="#ef4f65" label="Korban Perempuan" />
          <Donut value={donutData.korbanL} color="#60a5fa" label="Korban Laki-laki" />
          <Donut value={donutData.santP} color="#f4c20d" label="Santunan utk P" />
          <Donut value={donutData.santL} color="#d9a7ea" label="Santunan utk L" />
        </div>
      </div>

      {/* ===== MODAL TAMBAH/EDIT ===== */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title={editingId ? "Edit Data Ahli Waris" : "Tambah Data"}
        footer={
          <>
            <button
              className="btn-ghost"
              onClick={() => setOpenModal(false)}
            >
              Batal
            </button>
            <button className="btn-primary" onClick={submitForm}>
              {editingId ? "Simpan Perubahan" : "Tambahkan"}
            </button>
          </>
        }
      >
        <div
          className="grid-form"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div className="field">
            <label>Nama Korban *</label>
            <input
              value={form.korbanNama}
              onChange={(e) =>
                setForm((f) => ({ ...f, korbanNama: e.target.value }))
              }
              placeholder="mis. Dewi Kartika"
            />
          </div>

          <div className="field">
            <label>Gender *</label>
            <select
              value={form.gender}
              onChange={(e) =>
                setForm((f) => ({ ...f, gender: e.target.value }))
              }
            >
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          <div className="field">
            <label>Nama Ahli Waris *</label>
            <input
              value={form.ahliWarisNama}
              onChange={(e) =>
                setForm((f) => ({ ...f, ahliWarisNama: e.target.value }))
              }
              placeholder="mis. Rudi Hartono"
            />
          </div>

          <div className="field">
            <label>Alamat Ahli Waris *</label>
            <input
              value={form.ahliWarisAlamat}
              onChange={(e) =>
                setForm((f) => ({ ...f, ahliWarisAlamat: e.target.value }))
              }
              placeholder="Kecamatan, Kota"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Jalan / Lokasi *</label>
            <input
              value={form.jalan}
              onChange={(e) =>
                setForm((f) => ({ ...f, jalan: e.target.value }))
              }
              placeholder="mis. Jl. HR Soebrantas, Bukit Raya"
            />
          </div>

          <div className="field">
            <label>Latitude *</label>
            <input
              value={form.lat}
              onChange={(e) =>
                setForm((f) => ({ ...f, lat: e.target.value }))
              }
              placeholder="0.5073"
            />
          </div>

          <div className="field">
            <label>Longitude *</label>
            <input
              value={form.lng}
              onChange={(e) =>
                setForm((f) => ({ ...f, lng: e.target.value }))
              }
              placeholder="101.4477"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Jumlah Santunan (Rp) *</label>
            <input
              value={form.santunan}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  santunan: e.target.value.replace(/[^\d]/g, ""),
                }))
              }
              placeholder="20000000"
            />
          </div>
        </div>
      </Modal>
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
            zIndex: 9999,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* ✅ KEYFRAMES taruh barengan sama toast */}
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
