// src/pages/DataAhliWaris.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvent } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";

/* --- perbaiki icon default (fallback) --- */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* --- heatmap custom --- */
function HeatmapLayer({ points, options }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const layer = L.heatLayer(points, {
      radius: 26,
      blur: 22,
      maxZoom: 17,
      minOpacity: 0.2,
      ...options,
    });
    layer.addTo(map);
    return () => map.removeLayer(layer);
  }, [map, points, options]);
  return null;
}

/* --- pin SVG berwarna (tanpa file icon) --- */
const makePin = (hex = "#ec4899") => {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='52' viewBox='0 0 36 52'>
      <path d='M18 0C8.06 0 0 8.06 0 18c0 11.25 13.5 30 18 34 4.5-4 18-22.75 18-34C36 8.06 27.94 0 18 0z' fill='${hex}'/>
      <circle cx='18' cy='18' r='7.2' fill='white' opacity='.95'/>
    </svg>`
  );
  return L.icon({
    iconUrl: `data:image/svg+xml;utf8,${svg}`,
    iconSize: [36, 52],
    iconAnchor: [18, 50],
    popupAnchor: [0, -44],
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    shadowSize: [36, 16],
    shadowAnchor: [10, 16],
  });
};

/* --- kategori & warna --- */
const PINKS = {
  RINGAN: "#f9a8d4", // < 10 jt
  SEDANG: "#f472b6", // 10–20 jt
  BERAT:  "#ec4899", // > 20 jt
};
const ICONS = {
  RINGAN: makePin(PINKS.RINGAN),
  SEDANG: makePin(PINKS.SEDANG),
  BERAT:  makePin(PINKS.BERAT),
};
const kategoriSantunan = (nominal) => {
  const n = Number(nominal || 0);
  if (n > 20000000) return "BERAT";
  if (n >= 10000000) return "SEDANG";
  return "RINGAN";
};

/* --- klik kosong untuk menutup panel --- */
function MapClickClose({ onClose }) {
  useMapEvent("click", () => onClose?.());
  return null;
}

/* --- Modal sederhana --- */
function Modal({ open, title, onClose, onSubmit, children, primaryText = "Simpan" }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Batal</button>
          <button className="btn primary" onClick={onSubmit}>{primaryText}</button>
        </div>
      </div>
    </div>
  );
}

export default function DataAhliWaris() {
  /* ====== DATA AWAL ====== */
  const initialPoints = useMemo(
    () => [
      {
        id: "1",
        lat: 0.471,
        lng: 101.454,
        jalan: "Jl. HR Soebrantas, Bukit Raya",
        korbanNama: "Dewi Kartika",
        korbanFoto:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=640&q=80&auto=format&fit=crop",
        ahliWarisNama: "Rudi Hartono",
        ahliWarisAlamat: "Kec. Bukit Raya, Kota Pekanbaru",
        santunan: 20000000,
        weight: 0.9,
      },
      {
        id: "2",
        lat: 0.5202,
        lng: 101.4162,
        jalan: "Jl. Tuanku Tambusai, Payung Sekaki",
        korbanNama: "Bima Pratama",
        korbanFoto:
          "https://images.unsplash.com/photo-1502767089025-6572583495b0?w=640&q=80&auto=format&fit=crop",
        ahliWarisNama: "Andre",
        ahliWarisAlamat: "Kec. Payung Sekaki, Kota Pekanbaru",
        santunan: 18000000,
        weight: 0.8,
      },
      {
        id: "3",
        lat: 0.5921,
        lng: 101.4512,
        jalan: "Jl. Yos Sudarso, Rumbai",
        korbanNama: "Citra Ayu",
        korbanFoto:
        "https://images.unsplash.com/photo-1552053831-71594a27632d?w=640&q=80&auto=format&fit=crop",
        ahliWarisNama: "Yudi Saputra",
        ahliWarisAlamat: "Kec. Rumbai, Kota Pekanbaru",
        santunan: 15000000,
        weight: 0.7,
      },
    ],
    []
  );

  const [pointsData, setPointsData] = useState(initialPoints);
  const [catFilter, setCatFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);

  /* ====== MODAL + FORM (Tambah / Edit) ====== */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    korbanNama: "",
    korbanFoto: "",       // URL opsional
    ahliWarisNama: "",
    ahliWarisAlamat: "",
    jalan: "",
    lat: "",
    lng: "",
    santunan: "",
  });

  const [uploadPreview, setUploadPreview] = useState("");  // dataURL dari file
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      korbanNama: "", korbanFoto: "", ahliWarisNama: "", ahliWarisAlamat: "",
      jalan: "", lat: "", lng: "", santunan: "",
    });
    setUploadPreview("");
    if (fileRef.current) fileRef.current.value = "";
    setMsg(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      korbanNama: row.korbanNama,
      korbanFoto: row.korbanFoto?.startsWith("http") ? row.korbanFoto : "",
      ahliWarisNama: row.ahliWarisNama,
      ahliWarisAlamat: row.ahliWarisAlamat,
      jalan: row.jalan,
      lat: String(row.lat),
      lng: String(row.lng),
      santunan: String(row.santunan),
    });
    setUploadPreview(row.korbanFoto?.startsWith("data:") ? row.korbanFoto : "");
    if (fileRef.current) fileRef.current.value = "";
    setMsg(null);
    setModalOpen(true);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setUploadPreview(""); return; }
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result.toString());
    reader.readAsDataURL(f);
  };

  const computeWeight = (rp) => {
    const cap = 30000000;
    const v = Math.max(0, Math.min(cap, Number(rp || 0)));
    return Number((v / cap).toFixed(2)) || 0.3;
  };

  const validate = () => {
    const req = ["korbanNama","ahliWarisNama","ahliWarisAlamat","jalan","lat","lng","santunan"];
    const miss = req.filter((k) => !String(form[k]).trim());
    if (miss.length) return "Lengkapi seluruh field bertanda *.";
    const lat = Number(form.lat), lng = Number(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return "Latitude/Longitude harus angka.";
    return "";
  };

  const submitForm = () => {
    const v = validate();
    if (v) { setMsg({ type: "err", text: v }); return; }

    const lat = Number(form.lat), lng = Number(form.lng);
    const foto = uploadPreview || form.korbanFoto ||
      "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=640&q=80&auto=format&fit=crop";
    const santunan = Number(String(form.santunan).replace(/[^\d]/g, ""));

    if (editingId) {
      const updated = pointsData.map(p =>
        p.id === editingId ? {
          ...p,
          korbanNama: form.korbanNama,
          korbanFoto: foto,
          ahliWarisNama: form.ahliWarisNama,
          ahliWarisAlamat: form.ahliWarisAlamat,
          jalan: form.jalan,
          lat, lng,
          santunan,
          weight: computeWeight(santunan),
        } : p
      );
      setPointsData(updated);
      setSelected(updated.find(p => p.id === editingId) || null);
      setModalOpen(false);
      return;
    }

    const p = {
      id: String(Date.now()), lat, lng,
      jalan: form.jalan,
      korbanNama: form.korbanNama,
      korbanFoto: foto,
      ahliWarisNama: form.ahliWarisNama,
      ahliWarisAlamat: form.ahliWarisAlamat,
      santunan,
      weight: computeWeight(santunan),
    };
    setPointsData(prev => [p, ...prev]);
    setSelected(p);
    setModalOpen(false);
  };

  const onDelete = (id) => {
    if (!confirm("Hapus data ini?")) return;
    setPointsData(pointsData.filter(p => p.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  /* ====== turunan ====== */
  const filtered = useMemo(() => {
    if (catFilter === "ALL") return pointsData;
    return pointsData.filter(p => kategoriSantunan(p.santunan) === catFilter);
  }, [pointsData, catFilter]);

  const heatPoints = useMemo(
    () => filtered.map(p => [p.lat, p.lng, p.weight ?? 0.5]),
    [filtered]
  );

  return (
    <div className="aw-wrap">
      <h1 className="aw-title"><span>Peta & Data Ahli Waris</span></h1>

      {/* Filter kategori santunan + tombol tambah */}
      <div className="topbar">
        <div className="aw-chips">
          {[
            {k:"ALL", lbl:"Semua"},
            {k:"RINGAN", lbl:"< 10 jt"},
            {k:"SEDANG", lbl:"10–20 jt"},
            {k:"BERAT", lbl:"> 20 jt"},
          ].map(it => (
            <button key={it.k}
              className={`chip ${catFilter===it.k?"active":""}`}
              onClick={()=>setCatFilter(it.k)}>
              {it.lbl}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={openAdd}>➕ Tambah Data</button>
      </div>

      {/* MAP + PANEL DETAIL (di atas) */}
      <div className="aw-card aw-map">
        <div className="legend">
          <span><i style={{background:PINKS.RINGAN}}/> Ringan</span>
          <span><i style={{background:PINKS.SEDANG}}/> Sedang</span>
          <span><i style={{background:PINKS.BERAT}}/> Berat</span>
        </div>

        <MapContainer center={[0.51,101.44]} zoom={12} scrollWheelZoom style={{height:"560px", width:"100%"}}>
          <TileLayer attribution='&copy; OpenStreetMap contributors'
                     url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          <HeatmapLayer points={heatPoints}/>
          <MapClickClose onClose={()=>setSelected(null)} />

          {filtered.map(t=>{
            const cat = kategoriSantunan(t.santunan);
            return (
              <Marker key={t.id}
                      position={[t.lat, t.lng]}
                      icon={ICONS[cat]}
                      eventHandlers={{ click: ()=>setSelected(t) }} />
            );
          })}
        </MapContainer>

        {/* Panel ala Google place card */}
        {selected && (
          <div className="place-card">
            <button className="close" onClick={()=>setSelected(null)}>✕</button>
            <div className="pc-img">
              <img src={selected.korbanFoto} alt={selected.korbanNama}/>
              <div className={`pc-chip ${(()=> {
                const k = kategoriSantunan(selected.santunan);
                if (k==="RINGAN") return "light";
                if (k==="SEDANG") return "mid";
                return "hard";
              })()}`}>
                {(() => {
                  const k = kategoriSantunan(selected.santunan);
                  return k==="RINGAN" ? "Ringan" : k==="SEDANG" ? "Sedang" : "Berat";
                })()}
              </div>
            </div>

            <div className="pc-body">
              <h2>{selected.korbanNama}</h2>
              <div className="meta">
                Santunan: <b>Rp {Number(selected.santunan).toLocaleString("id-ID")}</b>
              </div>

              <div className="addr">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#ec4899" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5"/></svg>
                {selected.jalan}
              </div>
              <div className="addr">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#ec4899" d="M12 12a5 5 0 0 0 5-5V5a5 5 0 0 0-10 0v2a5 5 0 0 0 5 5m7 1h-1.18a7 7 0 0 1-11.64 0H5a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0-3-3Z"/></svg>
                Ahli Waris: <b>{selected.ahliWarisNama}</b> — {selected.ahliWarisAlamat}
              </div>

              <div className="pc-actions">
                <a className="pc-btn"
                   href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                   target="_blank" rel="noreferrer">Rute</a>
                <a className="pc-btn ghost"
                   href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
                   target="_blank" rel="noreferrer">Google Maps</a>
                <button className="pc-btn" onClick={()=>openEdit(selected)}>Edit</button>
                <button className="pc-btn ghost" onClick={()=>onDelete(selected.id)}>Hapus</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TABEL + CRUD (di bawah peta) */}
      <div className="aw-card">
        <h3 className="card-title">Tabel Data Ahli Waris</h3>
        <div className="table-wrap">
          <table className="nice-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>No</th>
                <th>Foto</th>
                <th>Nama Korban</th>
                <th>Ahli Waris</th>
                <th>Alamat Ahli Waris</th>
                <th>Jalan / Lokasi</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Santunan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="df-empty">Tidak ada data.</td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>
                      <img
                        src={r.korbanFoto}
                        alt={r.korbanNama}
                        style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 8 }}
                      />
                    </td>
                    <td>{r.korbanNama}</td>
                    <td>{r.ahliWarisNama}</td>
                    <td>{r.ahliWarisAlamat}</td>
                    <td>{r.jalan}</td>
                    <td className="mono">{r.lat}</td>
                    <td className="mono">{r.lng}</td>
                    <td><b>Rp {Number(r.santunan).toLocaleString("id-ID")}</b></td>
                    <td>
                      <div className="df-actions">
                        <button className="df-btn" onClick={()=>openEdit(r)}>✏️</button>
                        <button className="df-btn df-danger" onClick={()=>onDelete(r.id)}>🗑️</button>
                        <button className="df-btn" onClick={()=>setSelected(r)}>📍</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM */}
      <Modal
        open={modalOpen}
        title={editingId ? "Edit Data" : "Tambah Data"}
        onClose={()=>setModalOpen(false)}
        onSubmit={submitForm}
        primaryText={editingId ? "Simpan Perubahan" : "Tambahkan"}
      >
        <div className="grid-form">
          <div className="field">
            <label>Nama Korban *</label>
            <input value={form.korbanNama} onChange={e=>setForm(f=>({...f, korbanNama:e.target.value}))}/>
          </div>
          <div className="field">
            <label>Nama Ahli Waris *</label>
            <input value={form.ahliWarisNama} onChange={e=>setForm(f=>({...f, ahliWarisNama:e.target.value}))}/>
          </div>
          <div className="field full">
            <label>Alamat Ahli Waris *</label>
            <input value={form.ahliWarisAlamat} onChange={e=>setForm(f=>({...f, ahliWarisAlamat:e.target.value}))}/>
          </div>
          <div className="field full">
            <label>Jalan / Lokasi *</label>
            <input value={form.jalan} onChange={e=>setForm(f=>({...f, jalan:e.target.value}))}/>
          </div>
          <div className="field">
            <label>Latitude *</label>
            <input value={form.lat} onChange={e=>setForm(f=>({...f, lat:e.target.value}))} placeholder="0.5073"/>
          </div>
          <div className="field">
            <label>Longitude *</label>
            <input value={form.lng} onChange={e=>setForm(f=>({...f, lng:e.target.value}))} placeholder="101.4477"/>
          </div>
          <div className="field">
            <label>Jumlah Santunan (Rp) *</label>
            <input value={form.santunan} onChange={e=>setForm(f=>({...f, santunan:e.target.value.replace(/[^\d]/g,"")}))}/>
          </div>
          <div className="field">
            <label>URL Foto (opsional)</label>
            <input value={form.korbanFoto} onChange={e=>setForm(f=>({...f, korbanFoto:e.target.value}))}/>
          </div>
          <div className="field full">
            <label>Upload Foto (opsional)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile}/>
            {(uploadPreview || form.korbanFoto) && (
              <div className="preview">
                <img src={uploadPreview || form.korbanFoto} alt="preview"/>
                <span className="muted small">Preview</span>
              </div>
            )}
          </div>
          {msg && <div className={`warn ${msg.type==="err"?"danger":""}`}>{msg.text}</div>}
        </div>
      </Modal>

      {/* STYLES */}
      <style>{`
        :root{
          --bg:#fff5f9;
          --text:#0f172a;
          --muted:#6b7280;
          --pink:#ec4899; --pink2:#f472b6; --pink3:#f9a8d4;
          --ring: rgba(236,72,153,.25);
        }
        .aw-wrap{padding:22px 16px 40px;background:radial-gradient(1200px 600px at 10% -20%, #ffe4ee, transparent 60%),radial-gradient(900px 500px at 100% 0%, #ffe9f3, transparent 60%),var(--bg);min-height:100dvh}
        .aw-title{text-align:center;margin:4px 0 18px;font-weight:900;letter-spacing:.4px;font-size:clamp(22px,4vw,36px)}
        .aw-title span{background:linear-gradient(90deg,#f9a8d4,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 12px rgba(236,72,153,.22))}
        .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;max-width:1100px;margin:0 auto 8px;}
        .aw-chips{display:flex;gap:8px;flex-wrap:wrap}
        .chip{border:none;border-radius:999px;padding:8px 14px;font-weight:800;background:#fff;color:#7a2e3b;box-shadow:0 6px 18px rgba(15,23,42,.06), inset 0 0 0 1px #ffe3ef;transition:.15s}
        .chip:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.09), inset 0 0 0 1px #ffd3e7}
        .chip.active{background:linear-gradient(90deg,#f9a8d4,#f472b6);color:#fff}

        .btn{border:none;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}
        .btn.primary{background:linear-gradient(90deg,#f472b6,#ec4899);color:#fff;box-shadow:0 10px 22px rgba(236,72,153,.25)}
        .btn.ghost{background:#fff;color:#ec4899;border:1px solid #ffd6e8}

        .aw-card{max-width:1100px;margin:12px auto;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(236,72,153,.15), inset 0 0 0 1px #ffe7f2;padding:16px}
        .card-title{margin:0 0 10px;font-weight:900;color:var(--text)}
        .table-wrap{border:1px dashed #ffd1d6;border-radius:12px;padding:8px;background:#fff}
        .nice-table{border-collapse:collapse;width:100%}
        .nice-table th,.nice-table td{border-bottom:1px dotted #ffd6e8;padding:10px;text-align:left}
        .nice-table thead th{background:#fff7fb}
        .df-empty{padding:18px;text-align:center;color:var(--muted)}
        .df-actions{display:flex;gap:6px}
        .df-btn{border:1px solid #ffd1d6;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
        .df-btn.df-danger{color:#b91c1c;border-color:#ffc4cc}

        .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace}

        .aw-map{padding:0;overflow:hidden;position:relative}
        .aw-map .leaflet-container{border-radius:18px;border:1px solid #ffe0ef;box-shadow:0 10px 30px rgba(236,72,153,.18)}
        .legend{position:absolute;z-index:500;right:14px;top:14px;background:#fff;border:1px solid #ffe0ef;border-radius:12px;padding:8px 10px;display:flex;gap:10px}
        .legend span{font-size:12px;color:#7a2e3b;display:flex;align-items:center;gap:6px}
        .legend i{display:inline-block;width:12px;height:12px;border-radius:3px}

        /* place card ala google */
        .place-card{position:absolute;z-index:600;left:14px;top:14px;width:min(420px,92vw);background:#fff;border-radius:18px;box-shadow:0 30px 70px rgba(15,23,42,.25);overflow:hidden;border:1px solid #ffe0ef}
        .close{position:absolute;right:10px;top:10px;border:0;background:#fff;border-radius:999px;width:32px;height:32px;box-shadow:0 6px 18px rgba(0,0,0,.15);cursor:pointer}
        .pc-img{position:relative;height:200px;background:#f3f4f6}
        .pc-img img{width:100%;height:100%;object-fit:cover;display:block}
        .pc-chip{position:absolute;left:12px;top:12px;color:#fff;font-size:12px;font-weight:900;padding:6px 10px;border-radius:999px;box-shadow:0 6px 16px rgba(0,0,0,.18)}
        .pc-chip.light{background:linear-gradient(90deg,#f9a8d4,#fbcfe8)}
        .pc-chip.mid{background:linear-gradient(90deg,#f472b6,#fb7185)}
        .pc-chip.hard{background:linear-gradient(90deg,#ec4899,#db2777)}
        .pc-body{padding:12px 14px 14px}
        .pc-body h2{margin:0 0 6px;font-size:18px;font-weight:900;color:#0f172a}
        .meta{font-size:12px;color:#6b7280;margin-bottom:8px}
        .addr{display:flex;gap:8px;align-items:flex-start;color:#0f172a;font-size:13px;margin:6px 0}
        .pc-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
        .pc-btn{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(90deg,#f472b6,#ec4899);color:#fff;text-decoration:none;padding:10px 12px;border-radius:12px;font-weight:900;box-shadow:0 10px 22px rgba(236,72,153,.25)}
        .pc-btn.ghost{background:#fff;color:#ec4899;border:1px solid #ffd6e8;box-shadow:none}

        /* Modal */
        .modal-backdrop{position:fixed;inset:0;background:rgba(17,24,39,.45);display:grid;place-items:center;z-index:900;padding:16px}
        .modal-card{width:min(980px,96vw);background:#fff;border-radius:18px;border:1px solid #ffd6e8;box-shadow:0 24px 60px rgba(236,72,153,.2);overflow:hidden}
        .modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px dashed #ffd6e8}
        .modal-head h3{margin:0;font-weight:900;color:#ef4f65}
        .modal-body{padding:14px}
        .modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:12px 14px;border-top:1px dashed #ffd6e8}
        .grid-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .grid-form .full{grid-column:1 / -1}
        .field{display:grid;gap:6px}
        .field input{border:1px solid #ffd6e8;border-radius:12px;padding:12px 14px;outline:none}
        .field input:focus{box-shadow:0 0 0 4px var(--ring)}
        .preview{display:inline-flex;align-items:center;gap:8px;margin-top:8px}
        .preview img{width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #ffd6e8}
        .warn{margin-top:6px;background:#fff3f5;border:1px dashed #ffb2c2;padding:10px 12px;border-radius:12px}
        .warn.danger{background:#ffe8ea;border-color:#ffc4cc;color:#7f1d1d}

        @media (max-width:720px){
          .grid-form{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );
}
