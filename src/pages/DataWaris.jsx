// src/pages/DataAhliWaris.jsx
import { useEffect, useMemo, useRef, useState } from "react";

const LS_KEY = "ahliwaris_points_v2";

// === Dummy 20 data ===
const DUMMY20 = Array.from({ length: 20 }, (_, i) => ({
  id: String(i + 1),
  korbanNama: `Korban ${i + 1}`,
  gender: i % 2 === 0 ? "L" : "P",
  korbanFoto:
    i % 2 === 0
      ? `https://randomuser.me/api/portraits/men/${(i % 50) + 1}.jpg`
      : `https://randomuser.me/api/portraits/women/${(i % 50) + 1}.jpg`,
  ahliWarisNama: `Ahli Waris ${i + 1}`,
  ahliWarisAlamat: `Kecamatan ${i + 1}, Kota Pekanbaru`,
  jalan: `Jl. Contoh No.${i + 1}, Pekanbaru`,
  lat: Number((0.5 + i * 0.001).toFixed(6)),
  lng: Number((101.44 + i * 0.001).toFixed(6)),
  santunan: 10_000_000 + i * 500_000,
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
}));

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
  const off = c * (1 - Math.min(Math.max(value, 0), 100) / 100);
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
          {value}%
        </text>
      </svg>
      <div style={{ marginTop: 4, fontSize: 14 }}>{label}</div>
    </div>
  );
}

// ========= MiniBar (satu kategori) =========
function MiniBar({ title, data }) {
  // data: [{label, value}]
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
  // ====== DATA STATE ======
  const [rows, setRows] = useState([]);
  const persist = (arr) => {
    setRows(arr);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  };

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        setRows(JSON.parse(saved));
        return;
      } catch {}
    }
    persist(DUMMY20);
  }, []);

  // ====== TABLE CONTROL ======
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 5;

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
    // kalau hasil filter/urut bikin halaman melebihi total, kembalikan ke 1
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // ====== GRAFIK (semua berdasar "paged") ======
  // Bulanan: sum, count, avg dari 5 data yang tampil
  const monthlyAgg = useMemo(() => {
    if (paged.length === 0) return [];
    const map = new Map();
    for (const r of paged) {
      const t = r.createdAt ? new Date(r.createdAt) : new Date();
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
      const sum = (map.get(key)?.sum || 0) + (r.santunan || 0);
      const count = (map.get(key)?.count || 0) + 1;
      map.set(key, { sum, count, year: t.getFullYear(), month: t.getMonth() });
    }
    const ordered = [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([_, v]) => ({
        label: new Date(v.year, v.month, 1).toLocaleDateString("id-ID", { month: "short" }),
        sum: v.sum,
        count: v.count,
        avg: Math.round(v.sum / v.count),
      }));
    return ordered.slice(-6);
  }, [paged]);

  const barSantunan = monthlyAgg.map((d) => ({ label: d.label, value: d.sum }));
  const barKorban = monthlyAgg.map((d) => ({ label: d.label, value: d.count }));
  const barRata = monthlyAgg.map((d) => ({ label: d.label, value: d.avg }));

  // Donut (berdasar paged)
  const donutData = useMemo(() => {
    const total = paged.length || 1;
    const l = paged.filter((r) => r.gender === "L").length;
    const p = paged.filter((r) => r.gender === "P").length;
    const pl = Math.round((l / total) * 100);
    const pp = Math.round((p / total) * 100);
    // placeholder usia (tanpa field umur). Jika nanti ada field umur, ubah logikanya.
    const u17 = 0;
    const a18 = 100;
    return { p: pp, l: pl, u17, a18 };
  }, [paged]);

  // ====== CRUD (modal tambah/edit) ======
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const fileRef = useRef(null);
  const [preview, setPreview] = useState("");

  const [form, setForm] = useState({
    korbanNama: "",
    gender: "L",
    fotoUrl: "",
    ahliWarisNama: "",
    ahliWarisAlamat: "",
    jalan: "",
    lat: "",
    lng: "",
    santunan: "",
  });

  // revoke preview blob
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      korbanNama: "",
      gender: "L",
      fotoUrl: "",
      ahliWarisNama: "",
      ahliWarisAlamat: "",
      jalan: "",
      lat: "",
      lng: "",
      santunan: "",
    });
    if (fileRef.current) fileRef.current.value = "";
    setPreview("");
    setOpenModal(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      korbanNama: row.korbanNama,
      gender: row.gender || "L",
      fotoUrl: row.korbanFoto?.startsWith("http") ? row.korbanFoto : "",
      ahliWarisNama: row.ahliWarisNama,
      ahliWarisAlamat: row.ahliWarisAlamat,
      jalan: row.jalan,
      lat: String(row.lat),
      lng: String(row.lng),
      santunan: String(row.santunan),
    });
    setPreview(row.korbanFoto?.startsWith("blob:") ? row.korbanFoto : "");
    if (fileRef.current) fileRef.current.value = "";
    setOpenModal(true);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return setPreview("");
    const url = URL.createObjectURL(f);
    setPreview(url);
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

  const submitForm = () => {
    const v = validate();
    if (v) {
      alert(v);
      return;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const santunan = Number(String(form.santunan).replace(/[^\d]/g, ""));
    const foto =
      preview ||
      (form.fotoUrl?.trim() ||
        "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=600&q=80&auto=format&fit=crop");

    if (editingId) {
      const updated = rows.map((r) =>
        r.id === editingId
          ? {
              ...r,
              korbanNama: form.korbanNama.trim(),
              gender: form.gender,
              korbanFoto: foto,
              ahliWarisNama: form.ahliWarisNama.trim(),
              ahliWarisAlamat: form.ahliWarisAlamat.trim(),
              jalan: form.jalan.trim(),
              lat,
              lng,
              santunan,
            }
          : r
      );
      persist(updated);
      setOpenModal(false);
      return;
    }

    const newRow = {
      id: String(Date.now()),
      korbanNama: form.korbanNama.trim(),
      gender: form.gender,
      korbanFoto: foto,
      ahliWarisNama: form.ahliWarisNama.trim(),
      ahliWarisAlamat: form.ahliWarisAlamat.trim(),
      jalan: form.jalan.trim(),
      lat,
      lng,
      santunan,
      createdAt: new Date().toISOString(),
    };
    persist([newRow, ...rows]);
    setOpenModal(false);
  };

  const onDelete = (id) => {
    if (!confirm("Hapus data ini?")) return;
    persist(rows.filter((r) => r.id !== id));
  };

  const onResetDummy = () => {
    if (!confirm("Reset ke 20 data dummy?")) return;
    persist(DUMMY20);
    setPage(1);
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
        <p className="df-sub">Semua grafik di bawah akan mengikuti data yang tampil pada tabel.</p>
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
          <button className="df-btn" onClick={onResetDummy}>
            🔁 Reset Dummy
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="df-card table-wrap" style={{ marginTop: 12 }}>
        <table className="nice-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>No</th>
              <th>Foto</th>
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
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="df-empty">
                  <div className="df-empty-emoji">🫥</div>
                  Tidak ada data.
                </td>
              </tr>
            ) : (
              paged.map((r, i) => (
                <tr key={r.id}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td>
                    <img
                      src={r.korbanFoto}
                      alt={r.korbanNama}
                      style={{ width: 60, height: 48, objectFit: "cover", borderRadius: 8 }}
                    />
                  </td>
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
                      <button className="df-btn df-danger" onClick={() => onDelete(r.id)}>
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
            <button className="pager" disabled={page <= 1} onClick={() => setPage(1)}>
              «
            </button>
            <button className="pager" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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

      {/* CHARTS – mengikuti "paged" */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
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
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Santunan Berdasarkan Usia & Jenis Kelamin</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <Donut value={donutData.p} color="#ef4f65" label="Perempuan" />
          <Donut value={donutData.l} color="#60a5fa" label="Laki-laki" />
          <Donut value={donutData.u17} color="#f4c20d" label="0 – 17 tahun" />
          <Donut value={donutData.a18} color="#d9a7ea" label="18 tahun ke atas" />
        </div>
      </div>

      {/* ===== MODAL TAMBAH/EDIT ===== */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title={editingId ? "Edit Data Ahli Waris" : "Tambah Data"}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpenModal(false)}>
              Batal
            </button>
            <button className="btn-primary" onClick={submitForm}>
              {editingId ? "Simpan Perubahan" : "Tambahkan"}
            </button>
          </>
        }
      >
        <div className="grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Nama Korban *</label>
            <input
              value={form.korbanNama}
              onChange={(e) => setForm((f) => ({ ...f, korbanNama: e.target.value }))}
              placeholder="mis. Dewi Kartika"
            />
          </div>
          <div className="field">
            <label>Gender *</label>
            <select
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>URL Foto (opsional)</label>
            <input
              value={form.fotoUrl}
              onChange={(e) => setForm((f) => ({ ...f, fotoUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Upload Foto (opsional)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} />
            {(preview || form.fotoUrl) && (
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                <img
                  src={preview || form.fotoUrl}
                  alt="preview"
                  style={{
                    width: 120,
                    height: 90,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid #f0c9cf",
                  }}
                />
                <span className="muted" style={{ fontSize: 12 }}>
                  Pratinjau gambar
                </span>
              </div>
            )}
          </div>

          <div className="field">
            <label>Nama Ahli Waris *</label>
            <input
              value={form.ahliWarisNama}
              onChange={(e) => setForm((f) => ({ ...f, ahliWarisNama: e.target.value }))}
              placeholder="mis. Rudi Hartono"
            />
          </div>
          <div className="field">
            <label>Alamat Ahli Waris *</label>
            <input
              value={form.ahliWarisAlamat}
              onChange={(e) => setForm((f) => ({ ...f, ahliWarisAlamat: e.target.value }))}
              placeholder="Kecamatan, Kota"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Jalan / Lokasi *</label>
            <input
              value={form.jalan}
              onChange={(e) => setForm((f) => ({ ...f, jalan: e.target.value }))}
              placeholder="mis. Jl. HR Soebrantas, Bukit Raya"
            />
          </div>

          <div className="field">
            <label>Latitude *</label>
            <input
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              placeholder="0.5073"
            />
          </div>
          <div className="field">
            <label>Longitude *</label>
            <input
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              placeholder="101.4477"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Jumlah Santunan (Rp) *</label>
            <input
              value={form.santunan}
              onChange={(e) =>
                setForm((f) => ({ ...f, santunan: e.target.value.replace(/[^\d]/g, "") }))
              }
              placeholder="20000000"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
