// src/pages/VerifikatorDashboard.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PDFDocument, rgb } from "pdf-lib";
import JsBarcode from "jsbarcode";

export default function VerifikatorDashboard() {
  const { user, hasRole, logout } = useAuth();
  if (!hasRole("admin-verifikator")) return <Navigate to="/unauthorized" replace />;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // DEMO data — ganti nanti dari API
  const [queue, setQueue] = useState(() => {
    try {
      const raw = localStorage.getItem("spa_verifikator_queue");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [activity, setActivity] = useState([]);

  // ====== state untuk multi-berkas per nama (tabs) ======
  const [selectedGroup, setSelectedGroup] = useState([]); // array berkas milik nama yang sama (≤10)
  const [activeIdx, setActiveIdx] = useState(0);          // index berkas aktif di group
  const activeItem = selectedGroup[activeIdx] || null;

  // ====== CRUD state ======
  const [newItem, setNewItem] = useState({
    id: "",
    pemohon: "",
    tanggal: new Date().toISOString().slice(0, 10),
    status: "menunggu",
    pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
    stampPage: "", // kosong = terakhir (default), isi angka 1-based untuk target halaman
  });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({
    id: "",
    pemohon: "",
    tanggal: "",
    status: "menunggu",
    pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
    stampPage: "",
  });

  // ====== Fetch dari API (stub) ======
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      // const res = await fetch("/api/forms?scope=verifikasi");
      // const data = await res.json();
      // setQueue(data.items);
      // setActivity(data.activity);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("spa_verifikator_queue", JSON.stringify(queue));
  }, [queue]);

  // KPI
  const kpi = useMemo(() => {
    const by = (s) => queue.filter((q) => q.status === s).length;
    return { menunggu: by("menunggu"), disetujui: by("disetujui"), ditolak: by("ditolak"), revisi: by("revisi"), diperiksa: by("diperiksa") };
  }, [queue]);

  // Filter & sort daftar kiri
  const filtered = useMemo(() => {
    return queue
      .filter((i) => [i.id, i.pemohon, i.status].join(" ").toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  }, [queue, query]);

  // ===== Helpers: mapping status internal -> badge status (pending/progress/done) =====
  function mapDisplayStatus(internal) {
    switch (internal) {
      case "disetujui": return { label: "done",     className: "badge badge-done" };
      case "diperiksa":
      case "revisi":    return { label: "progress", className: "badge badge-progress" };
      case "ditolak":
      case "menunggu":
      default:          return { label: "pending",  className: "badge badge-pending" };
    }
  }

  // ===== Helpers: barcode =====
  function makeBarcodeDataURL(text) {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 2 });
    return canvas.toDataURL("image/png");
  }

  // ====== Stempel barcode ke PDF: dukung halaman target & posisi ======
  async function stampBarcodeOnPdf(pdfUrl, text, opts = {}) {
    const { page: targetPage = "last", position = "bottom-right", marginX = 36, marginY = 72 } = opts;

    const pngDataUrl = makeBarcodeDataURL(text);
    const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
    const pdfBytes = await (await fetch(pdfUrl)).arrayBuffer();

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const pages = pdfDoc.getPages();
    let pageIndex;
    if (typeof targetPage === "number" && !Number.isNaN(targetPage)) {
      pageIndex = Math.max(0, Math.min(pages.length - 1, targetPage));
    } else if (targetPage === "first") {
      pageIndex = 0;
    } else {
      pageIndex = pages.length - 1; // default: last
    }
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    const barcodeWidth = 220;
    const barcodeHeight = (pngImage.height / pngImage.width) * barcodeWidth;

    let x, y;
    switch (position) {
      case "top-left":
        x = marginX; y = height - marginY - barcodeHeight; break;
      case "top-right":
        x = width - marginX - barcodeWidth; y = height - marginY - barcodeHeight; break;
      case "bottom-left":
        x = marginX; y = marginY; break;
      case "bottom-right":
      default:
        x = width - marginX - barcodeWidth; y = marginY; break;
    }

    page.drawText(text, { x, y: y + barcodeHeight + 6, size: 8, color: rgb(0, 0, 0) });
    page.drawImage(pngImage, { x, y, width: barcodeWidth, height: barcodeHeight });

    const newPdf = await pdfDoc.save();
    const blob = new Blob([newPdf], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }

  // ====== Aksi untuk item aktif ======
  const [approvingOne, setApprovingOne] = useState(false);
  async function handleApproveOne() {
    if (!activeItem) return;
    try {
      setApprovingOne(true);
      const barcodeText = `${activeItem.id} | disetujui | ${new Date().toISOString().slice(0, 19)} | ${user?.name}`;
      // stampPage (1-based) => 0-based index; kosong => "last"
      const pageIdx = Number(activeItem.stampPage);
      const stampedUrl = await stampBarcodeOnPdf(
        activeItem.pdfUrl,
        barcodeText,
        { page: Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last" }
      );

      setQueue((prev) =>
        prev.map((i) => (i.id === activeItem.id ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl } : i))
      );
      setSelectedGroup((prev) =>
        prev.map((i) => (i.id === activeItem.id ? { ...i, status: "disetujui", stampedPdfUrl: stampedUrl } : i))
      );
      setActivity((a) => [
        { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menyetujui ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
        ...a,
      ]);
    } catch (e) {
      console.error(e);
      alert("Gagal menyetujui / menempel barcode.");
    } finally {
      setApprovingOne(false);
    }
  }

  const [approvingAll, setApprovingAll] = useState(false);
  async function handleApproveAll() {
    if (!selectedGroup.length) return;
    try {
      setApprovingAll(true);
      const updated = [];

      for (const item of selectedGroup) {
        if (item.status !== "disetujui") {
          const text = `${item.id} | disetujui | ${new Date().toISOString().slice(0, 19)} | ${user?.name}`;
          const pageIdx = Number(item.stampPage);
          const url = await stampBarcodeOnPdf(
            item.pdfUrl,
            text,
            { page: Number.isFinite(pageIdx) && pageIdx >= 1 ? pageIdx - 1 : "last" }
          );
          updated.push({ ...item, status: "disetujui", stampedPdfUrl: url });
          setActivity((a) => [
            { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menyetujui ${item.id} (${item.pemohon})`, waktu: new Date().toLocaleString() },
            ...a,
          ]);
        } else {
          updated.push(item);
        }
      }

      setQueue((prev) => prev.map((q) => updated.find((u) => u.id === q.id) || q));
      setSelectedGroup(updated);
    } catch (e) {
      console.error(e);
      alert("Gagal mass approve.");
    } finally {
      setApprovingAll(false);
    }
  }

  function handleReject() {
    if (!activeItem) return;
    setQueue((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "ditolak" } : i)));
    setSelectedGroup((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "ditolak" } : i)));
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Menolak ${activeItem.id} (${activeItem.pemohon})`, waktu: new Date().toLocaleString() },
      ...a,
    ]);
  }

  function handleNeedRevision() {
    if (!activeItem) return;
    setQueue((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "revisi" } : i)));
    setSelectedGroup((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "revisi" } : i)));
  }

  function handleMarkInReview() {
    if (!activeItem) return;
    setQueue((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "diperiksa" } : i)));
    setSelectedGroup((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, status: "diperiksa" } : i)));
  }

  // ====== Saat klik baris di tabel kiri: buka group nama (≤10) ======
  function openGroupFor(row) {
    const group = queue
      .filter((i) => i.pemohon === row.pemohon)
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
      .slice(0, 10);

    setSelectedGroup(group);
    const idx = group.findIndex((g) => g.id === row.id);
    setActiveIdx(idx >= 0 ? idx : 0);
  }

  // ====== CRUD handlers ======
  function handleCreate(e) {
    e.preventDefault();
    if (!newItem.id || !newItem.pemohon) {
      alert("ID & Pemohon wajib diisi");
      return;
    }
    if (queue.some((q) => q.id === newItem.id)) {
      alert("ID sudah ada.");
      return;
    }
    if (newItem.stampPage && Number(newItem.stampPage) < 1) {
      alert("Halaman stempel minimal 1 atau kosongkan.");
      return;
    }
    const item = { ...newItem };
    setQueue((prev) => [item, ...prev]);
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Tambah berkas ${item.id} (${item.pemohon})`, waktu: new Date().toLocaleString() },
      ...a,
    ]);
    setNewItem({
      id: "",
      pemohon: "",
      tanggal: new Date().toISOString().slice(0, 10),
      status: "menunggu",
      pdfUrl: "/Lembar_Kunjungan_RS_NAI.pdf",
      stampPage: "",
    });
  }

  function startEdit(row) {
    setEditId(row.id);
    setEditForm({ ...row });
  }

  function cancelEdit() {
    setEditId(null);
  }

  function saveEdit() {
    if (!editForm.id || !editForm.pemohon) {
      alert("ID & Pemohon wajib diisi");
      return;
    }
    setQueue((prev) =>
      prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i))
    );
    // sinkron group jika berkas aktif sedang diedit
    setSelectedGroup((prev) => prev.map((i) => (i.id === editId ? { ...i, ...editForm } : i)));
    // jika ID diubah & itu yang aktif, perbaiki activeIdx
    const newIdx = selectedGroup.findIndex((i) => i.id === editId);
    if (newIdx >= 0) {
      setActiveIdx(newIdx);
    }
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Ubah berkas ${editId}`, waktu: new Date().toLocaleString() },
      ...a,
    ]);
    setEditId(null);
  }

  function deleteItem(id) {
    if (!confirm(`Hapus berkas ${id}?`)) return;
    setQueue((prev) => prev.filter((i) => i.id !== id));
    setSelectedGroup((prev) => prev.filter((i) => i.id !== id));
    setActivity((a) => [
      { id: "A-" + Math.random().toString(36).slice(2, 7), teks: `Hapus berkas ${id}`, waktu: new Date().toLocaleString() },
      ...a,
    ]);
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="v-header">
        <div>
          <h1>Dashboard Verifikator</h1>
          <p>Ringkasan & persetujuan berkas “data form”.</p>
        </div>
        <div className="right">
          <span>{user?.name} ({user?.role})</span>
          <button onClick={logout}>Keluar</button>
        </div>
      </header>

      {/* KPI */}
      <section className="kpi-grid">
        <div className="kpi-card"><div className="label">Menunggu (pending)</div><div className="value">{kpi.menunggu}</div></div>
        <div className="kpi-card"><div className="label">Sedang Diperiksa (progress)</div><div className="value">{kpi.diperiksa + kpi.revisi}</div></div>
        <div className="kpi-card"><div className="label">Ditolak (pending)</div><div className="value">{kpi.ditolak}</div></div>
        <div className="kpi-card"><div className="label">Disetujui (done)</div><div className="value">{kpi.disetujui}</div></div>
      </section>

      {/* Toolbar + CREATE */}
      <section className="toolbar" style={{ alignItems: "center" }}>
        <input
          placeholder="Cari ID / pemohon / status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={fetchQueue} disabled={loading}>
          {loading ? "Muat..." : "Segarkan Data"}
        </button>

        {/* Form tambah cepat */}
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginLeft: "auto" }}>
          <input
            placeholder="ID"
            value={newItem.id}
            onChange={(e) => setNewItem((s) => ({ ...s, id: e.target.value.trim() }))}
            style={{ width: 110 }}
          />
          <input
            placeholder="Pemohon"
            value={newItem.pemohon}
            onChange={(e) => setNewItem((s) => ({ ...s, pemohon: e.target.value }))}
            style={{ width: 140 }}
          />
          <input
            type="date"
            value={newItem.tanggal}
            onChange={(e) => setNewItem((s) => ({ ...s, tanggal: e.target.value }))}
          />
          <select
            value={newItem.status}
            onChange={(e) => setNewItem((s) => ({ ...s, status: e.target.value }))}
          >
            <option value="menunggu">menunggu (pending)</option>
            <option value="diperiksa">diperiksa (progress)</option>
            <option value="revisi">revisi (progress)</option>
            <option value="ditolak">ditolak (pending)</option>
            <option value="disetujui">disetujui (done)</option>
          </select>
          <input
            placeholder="/path.pdf"
            value={newItem.pdfUrl}
            onChange={(e) => setNewItem((s) => ({ ...s, pdfUrl: e.target.value }))}
            style={{ width: 180 }}
          />
          <input
            type="number"
            min={1}
            placeholder="Hal. stempel (opsional)"
            value={newItem.stampPage}
            onChange={(e) => setNewItem((s) => ({ ...s, stampPage: e.target.value }))}
            style={{ width: 160 }}
            title="Kosongkan untuk halaman terakhir"
          />
          <button type="submit">Tambah</button>
        </form>
      </section>

      {/* Grid: Daftar & Detail */}
      <section className="main-grid">
        {/* Daftar kiri */}
        <div className="card">
          <div className="flex items-center mb-3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 className="font-semibold" style={{ margin: 0 }}>Daftar Berkas</h3>
            <span className="ml-auto text-sm text-gray-500" style={{ marginLeft: "auto", opacity: 0.7 }}>Total: {filtered.length}</span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Pemohon</th>
                <th>Status</th>
                <th>Tanggal</th>
                <th style={{ width: 220 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const disp = mapDisplayStatus(row.status);
                const isEditing = editId === row.id;

                return (
                  <tr key={row.id} className={activeItem?.id === row.id ? "selected" : ""}>
                    {/* ================== READ MODE ================== */}
                    {!isEditing && (
                      <>
                        <td>{row.id}</td>
                        <td>{row.pemohon}</td>
                        <td>
                          <span className={disp.className}>{disp.label}</span>
                          <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>({row.status})</span>
                        </td>
                        <td>{row.tanggal}</td>
                        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => openGroupFor(row)}>Lihat (≤10 nama ini)</button>
                          <button onClick={() => startEdit(row)}>Edit</button>
                          <button onClick={() => deleteItem(row.id)}>Hapus</button>
                        </td>
                      </>
                    )}

                    {/* ================== EDIT MODE ================== */}
                    {isEditing && (
                      <>
                        <td>
                          <input
                            value={editForm.id}
                            onChange={(e) => setEditForm((s) => ({ ...s, id: e.target.value.trim() }))}
                            style={{ width: 110 }}
                          />
                        </td>
                        <td>
                          <input
                            value={editForm.pemohon}
                            onChange={(e) => setEditForm((s) => ({ ...s, pemohon: e.target.value }))}
                            style={{ width: 140 }}
                          />
                        </td>
                        <td>
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}
                          >
                            <option value="menunggu">menunggu (pending)</option>
                            <option value="diperiksa">diperiksa (progress)</option>
                            <option value="revisi">revisi (progress)</option>
                            <option value="ditolak">ditolak (pending)</option>
                            <option value="disetujui">disetujui (done)</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={editForm.tanggal}
                            onChange={(e) => setEditForm((s) => ({ ...s, tanggal: e.target.value }))}
                          />
                        </td>
                        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input
                            placeholder="/path.pdf"
                            value={editForm.pdfUrl}
                            onChange={(e) => setEditForm((s) => ({ ...s, pdfUrl: e.target.value }))}
                            style={{ width: 180 }}
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="Hal. stempel"
                            value={editForm.stampPage}
                            onChange={(e) => setEditForm((s) => ({ ...s, stampPage: e.target.value }))}
                            style={{ width: 140 }}
                            title="Kosongkan untuk halaman terakhir"
                          />
                          <button onClick={saveEdit}>Simpan</button>
                          <button onClick={cancelEdit}>Batal</button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={5}>Tidak ada data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail kanan */}
        <div className="card">
          <h3 className="font-semibold">Detail Berkas</h3>

          {!selectedGroup.length ? (
            <div className="text-sm" style={{ opacity: 0.6 }}>
              Pilih baris di kiri untuk memuat hingga <b>10 berkas</b> milik pemohon yang sama.
            </div>
          ) : (
            <>
              {/* Tabs ID untuk berkas-berkas nama ini */}
              <div className="tabs">
                {selectedGroup.map((it, idx) => (
                  <button
                    key={it.id}
                    onClick={() => setActiveIdx(idx)}
                    className={`tab ${idx === activeIdx ? "active" : ""}`}
                    title={`${it.id} • ${it.tanggal} • ${it.status}`}
                  >
                    {it.id}
                  </button>
                ))}
              </div>

              {/* Info singkat berkas aktif */}
              <div className="detail-grid">
                <div><b>ID</b><br />{activeItem?.id}</div>
                <div><b>Pemohon</b><br />{activeItem?.pemohon}</div>
                <div>
                  <b>Status</b><br />
                  {activeItem && (
                    <>
                      <span className={mapDisplayStatus(activeItem.status).className}>
                        {mapDisplayStatus(activeItem.status).label}
                      </span>
                      <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>
                        ({activeItem.status})
                      </span>
                    </>
                  )}
                </div>
                <div><b>Tanggal</b><br />{activeItem?.tanggal}</div>
              </div>

              {/* Preview PDF */}
              <div className="pdf-preview">
                {activeItem && (
                  <embed
                    src={
                      (activeItem.stampedPdfUrl || activeItem.pdfUrl) +
                      `#toolbar=0&navpanes=0&page=${
                        Number(activeItem.stampPage) >= 1 ? Number(activeItem.stampPage) : 1
                      }`
                    }
                    type="application/pdf"
                    width="100%"
                    height="100%"
                  />
                )}
              </div>

              {/* Aksi */}
              <div className="actions">
                <button
                  className="approve"
                  onClick={handleApproveOne}
                  disabled={!activeItem || approvingOne || activeItem?.status === "disetujui"}
                  title="Setujui & tempel barcode untuk berkas aktif"
                >
                  {approvingOne ? "Memproses..." : "Setujui (jadi DONE)"}
                </button>

                <button className="reject" onClick={handleReject} disabled={!activeItem}>
                  Tolak (jadi PENDING)
                </button>

                <button className="revision" onClick={handleNeedRevision} disabled={!activeItem}>
                  Minta Revisi (PROGRESS)
                </button>

                <button className="revision" onClick={handleMarkInReview} disabled={!activeItem}>
                  Tandai Diperiksa (PROGRESS)
                </button>

                <button
                  className="approve"
                  onClick={handleApproveAll}
                  disabled={!selectedGroup.length || approvingAll}
                  title="Setujui semua berkas pada nama ini (maks 10)"
                >
                  {approvingAll ? "Memproses semua..." : `Setujui Semua (${selectedGroup.length})`}
                </button>

                {!!activeItem?.stampedPdfUrl && (
                  <a href={activeItem.stampedPdfUrl} download={`${activeItem.id}-stamped.pdf`}>
                    <button type="button" className="download">Unduh PDF Bertanda (aktif)</button>
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Aktivitas */}
      <section className="activity">
        <h3>Aktivitas Terakhir</h3>
        <ul>
          {activity.map((a) => (
            <li key={a.id}>
              <div>{a.teks}</div>
              <div className="time">{a.waktu}</div>
            </li>
          ))}
          {!activity.length && <li className="text-sm" style={{ opacity: 0.6 }}>Belum ada aktivitas</li>}
        </ul>
      </section>

      {/* BADGE STYLES (bisa dipindah ke index.css, ini inlined biar cepat) */}
      <style>{`
        .badge{ padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-block; }
        .badge-pending{ color:#7a2b2b; background:#ffe3e3; border:1px solid #ffc9c9; }
        .badge-progress{ color:#5a4100; background:#fff1c2; border:1px solid #ffe18f; }
        .badge-done{ color:#064c2a; background:#c7f9e5; border:1px solid #95f0d1; }
      `}</style>
    </div>
  );
}
