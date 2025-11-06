import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/datasw.css";


/* ========== utils ========== */
function useDebouncedValue(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}


function exportCsv(rows, filename = "data_sw.csv") {
  if (!rows?.length) return;
  const cols = [
    "tgl_transaksi","no_polisi","nama_pemilik_terakhir","tgl_mati_yad",
    "kode_golongan","alamat_pemilik_terakhir","nomor_hp","nik","prov_nama","deskripsi_plat"
  ];
  const head = cols.join(",");
  const body = rows.map(r =>
    cols.map(k => {
      let val = r?.[k] ?? "";
      val = String(val).replaceAll('"','""');
      if (/[",\n]/.test(val)) val = `"${val}"`;
      return val;
    }).join(",")
  ).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}


function Highlight({ text = "", q = "" }) {
  if (!q) return <>{text}</>;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const parts = String(text).split(new RegExp(`(${safe})`, "ig"));
  return parts.map((p,i)=>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="hl">{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}


/* ========== form helpers ========== */
const emptyForm = () => ({
  tgl_transaksi: "", no_polisi: "", nama_pemilik_terakhir: "",
  tgl_mati_yad: "", kode_golongan: "", alamat_pemilik_terakhir: "",
  nomor_hp: "", nik: "", prov_nama: "", deskripsi_plat: ""
});
function validate(form){
  const e={};
  if(!form.no_polisi?.trim()) e.no_polisi="No. polisi wajib";
  if(!form.nik?.trim()) e.nik="NIK wajib";
  if(form.nomor_hp && !/^[0-9+ -]+$/.test(form.nomor_hp)) e.nomor_hp="Nomor HP tidak valid";
  return e;
}


/* ========== main component ========== */
export default function DataSW() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterHp, setFilterHp] = useState("all");
  const [loadedAt, setLoadedAt] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState(null);


  // modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create"); // create | edit
  const [form, setForm] = useState(emptyForm());
  const [formErrs, setFormErrs] = useState({});
  const [editingId, setEditingId] = useState(null);


  // detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);


  const debounced = useDebouncedValue(search, 300);
  const firstLoad = useRef(true);


  /* ---- fetch ---- */
  async function fetchData(){
    setLoading(true); setErrorMsg("");
    const { data, error } = await supabase
      .from("data_sw")
      .select("*")
      .order("tgl_transaksi", { ascending: true })
      .limit(2000);
    if(error){
      console.error(error);
      setErrorMsg(error.message || "Gagal memuat data");
      setRows([]);
    }else{
      setRows(data || []);
      setLoadedAt(new Date());
    }
    setLoading(false);
    firstLoad.current = false;
  }
  useEffect(()=>{ fetchData(); },[]);


  /* ---- filter ---- */
  const filtered = useMemo(()=>{
    let out = rows;
    if (debounced){
      const q = debounced.toLowerCase();
      out = out.filter(d => Object.values(d).join(" ").toLowerCase().includes(q));
    }
    if (filterHp === "ada") out = out.filter(d => (d.nomor_hp||"").trim() && d.nomor_hp!=="0");
    if (filterHp === "kosong") out = out.filter(d => !((d.nomor_hp||"").trim()) || d.nomor_hp==="0");
    return out;
  },[rows, debounced, filterHp]);


  /* ---- pagination ---- */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(()=>{ setPage(1); }, [debounced, filterHp, pageSize, rows]);
  const startIdx = (page-1)*pageSize;
  const endIdx = Math.min(startIdx+pageSize, total);
  const paginated = useMemo(()=>filtered.slice(startIdx, endIdx),[filtered,startIdx,endIdx]);


  /* ---- CRUD ---- */
  function openCreate(){
    setFormMode("create"); setForm(emptyForm()); setFormErrs({}); setEditingId(null); setIsFormOpen(true);
  }
  function openEdit(row){
    setFormMode("edit"); setEditingId(row.id ?? null); setForm({
      tgl_transaksi: row.tgl_transaksi ?? "", no_polisi: row.no_polisi ?? "",
      nama_pemilik_terakhir: row.nama_pemilik_terakhir ?? "", tgl_mati_yad: row.tgl_mati_yad ?? "",
      kode_golongan: row.kode_golongan ?? "", alamat_pemilik_terakhir: row.alamat_pemilik_terakhir ?? "",
      nomor_hp: row.nomor_hp ?? "", nik: row.nik ?? "", prov_nama: row.prov_nama ?? "",
      deskripsi_plat: row.deskripsi_plat ?? ""
    });
    setFormErrs({}); setIsFormOpen(true);
  }
  async function handleSubmit(e){
    e?.preventDefault();
    const errs = validate(form); setFormErrs(errs);
    if(Object.keys(errs).length) return;


    if(formMode === "create"){
      const { data, error } = await supabase.from("data_sw").insert([form]).select();
      if(error){ setToast({type:"error", msg:error.message || "Gagal menambah data"}); return; }
      setRows(prev => [ ...(data||[]), ...prev ]);
      setIsFormOpen(false);
      setToast({type:"success", msg:"Berhasil menambah data"});
    }else{
      let q = supabase.from("data_sw").update(form);
      if(editingId) q = q.eq("id", editingId);
      else q = q.eq("no_polisi", form.no_polisi).eq("nik", form.nik);
      const { data, error } = await q.select();
      if(error){ setToast({type:"error", msg:error.message || "Gagal mengubah data"}); return; }
      const key = (r)=> r.id ?? `${r.no_polisi}__${r.nik}`;
      setRows(prev=>{
        const m = new Map(prev.map(r=>[key(r), r]));
        (data||[]).forEach(r=>m.set(key(r), r));
        return Array.from(m.values());
      });
      setIsFormOpen(false);
      setToast({type:"success", msg:"Perubahan disimpan"});
    }
  }
  async function handleDelete(row){
    if(!window.confirm("Hapus data ini?")) return;
    let q = supabase.from("data_sw").delete();
    if(row.id) q = q.eq("id", row.id);
    else q = q.eq("no_polisi", row.no_polisi).eq("nik", row.nik);
    const { error } = await q;
    if(error){ setToast({type:"error", msg:error.message || "Gagal menghapus"}); return; }
    setRows(prev => prev.filter(r => row.id ? r.id !== row.id : !(r.no_polisi===row.no_polisi && r.nik===row.nik)));
    setToast({type:"success", msg:"Data terhapus"});
  }


  /* ---- detail ---- */
  function openDetail(row){
    setDetailRow(row); setDetailOpen(true);
  }


  /* ---- UI ---- */
  return (
    <div className="datasw-page">
      <header className="datasw-header">
        <div>
          <h1>🌸 Data SW</h1>
          <p className="muted small">
            {loading ? "Memuat…" : `${filtered.length} baris ditampilkan`}
            {loadedAt ? ` • diperbarui ${loadedAt.toLocaleTimeString("id-ID")}` : ""}
          </p>
          {errorMsg && <p className="err small">⚠️ {errorMsg}</p>}
        </div>
        <div className="dsw-actions">
          <button className="kawaii-btn" onClick={openCreate}>➕ Tambah Data</button>
          <button className="kawaii-btn ghost" onClick={()=>exportCsv(filtered)}>⬇️ Export CSV</button>
          <button className="kawaii-btn" onClick={fetchData}>🔄 Refresh</button>
        </div>
      </header>


      <div className="datasw-controls sticky">
        <div className="left">
          <div className="input-wrap">
            <span className="ico">🔍</span>
            <input
              type="text"
              placeholder="Cari nama / NIK / No. Polisi / alamat…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="chips">
            <button className={`chip ${filterHp==="all"?"active":""}`} onClick={()=>setFilterHp("all")}>Semua</button>
            <button className={`chip ${filterHp==="ada"?"active":""}`} onClick={()=>setFilterHp("ada")}>📱 Ada HP</button>
            <button className={`chip ${filterHp==="kosong"?"active":""}`} onClick={()=>setFilterHp("kosong")}>🚫 Tanpa HP</button>
          </div>
        </div>
      </div>


      {loading ? (
        <div className="loading">⏳ Memuat data...</div>
      ) : (
        <>
          {/* TOP PAGER */}
          {totalPages>1 && (
            <div className="pager">
              <div className="pager-left">
                <span className="range">{total?`${startIdx+1}–${endIdx} dari ${total}`:"0 data"}</span>
                <label className="page-size">
                  Tampilkan
                  <select value={pageSize} onChange={(e)=>setPageSize(Number(e.target.value))}>
                    <option value={25}>25</option><option value={50}>50</option>
                    <option value={100}>100</option><option value={200}>200</option>
                  </select>
                  / halaman
                </label>
              </div>
              <div className="pager-right">
                <button className="pg-btn" onClick={()=>setPage(1)} disabled={page===1}>⏮</button>
                <button className="pg-btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>◀</button>
                <span className="page-num">Hal {page} / {totalPages}</span>
                <button className="pg-btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>▶</button>
                <button className="pg-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>⏭</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="kawaii-table auto-width">
              <thead>
                <tr>
                  <th>Aksi</th>
                  <th>Tgl Transaksi</th>
                  <th>No Polisi</th>
                  <th>Nama Pemilik Terakhir</th>
                  <th>Tgl Mati Yad</th>
                  <th>Kode Gol</th>
                  <th>Alamat</th>
                  <th>Nomor HP</th>
                  <th>NIK</th>
                  <th>Provinsi</th>
                  <th>Deskripsi Plat</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((row, i) => {
                  const key = row.id ?? `${row.no_polisi || "x"}__${row.nik || i}`;
                  const hpKosong = !((row.nomor_hp||"").trim()) || row.nomor_hp==="0";
                  return (
                    <tr key={key} onDoubleClick={()=>openDetail(row)} className="row-hover">
                      <td className="aksi-col">
                        <button className="btn tiny" onClick={()=>openDetail(row)}>👁️ Detail</button>
                        <button className="btn tiny" onClick={()=>openEdit(row)}>✏️ Edit</button>
                        <button className="btn tiny danger" onClick={()=>handleDelete(row)}>🗑️ Hapus</button>
                      </td>
                      <td>{row.tgl_transaksi || "-"}</td>
                      <td className="mono"><Highlight text={row.no_polisi} q={debounced} /></td>
                      <td><Highlight text={row.nama_pemilik_terakhir} q={debounced} /></td>
                      <td>{row.tgl_mati_yad || "-"}</td>
                      <td><span className="gol-badge">{row.kode_golongan || "-"}</span></td>
                      <td className="alamat"><Highlight text={row.alamat_pemilik_terakhir} q={debounced} /></td>
                      <td className={hpKosong ? "muted": ""}>{hpKosong ? "—" : row.nomor_hp}</td>
                      <td className="mono"><Highlight text={row.nik || "-"} q={debounced} /></td>
                      <td>{row.prov_nama}</td>
                      <td><Highlight text={row.deskripsi_plat} q={debounced} /></td>
                    </tr>
                  );
                })}
                {!paginated.length && (
                  <tr><td colSpan={11} style={{textAlign:"center", padding:"16px"}}>Tidak ada data yang cocok.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BOTTOM PAGER */}
          {totalPages>1 && (
            <div className="pager">
              <div className="pager-left">
                <span className="range">{total?`${startIdx+1}–${endIdx} dari ${total}`:"0 data"}</span>
                <label className="page-size">
                  Tampilkan
                  <select value={pageSize} onChange={(e)=>setPageSize(Number(e.target.value))}>
                    <option value={25}>25</option><option value={50}>50</option>
                    <option value={100}>100</option><option value={200}>200</option>
                  </select>
                  / halaman
                </label>
              </div>
              <div className="pager-right">
                <button className="pg-btn" onClick={()=>setPage(1)} disabled={page===1}>⏮</button>
                <button className="pg-btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>◀</button>
                <span className="page-num">Hal {page} / {totalPages}</span>
                <button className="pg-btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>▶</button>
                <button className="pg-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>⏭</button>
              </div>
            </div>
          )}
        </>
      )}


      {/* toast */}
      {toast && (
        <div className={`toast ${toast.type === "error" ? "error" : "success"}`} onAnimationEnd={()=>setToast(null)}>
          {toast.msg}
        </div>
      )}


      {/* modal form */}
      {isFormOpen && (
        <div className="modal-backdrop" onClick={()=>setIsFormOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-head">
              <h3>{formMode==="create" ? "Tambah Data" : "Edit Data"}</h3>
              <button className="icon-btn" onClick={()=>setIsFormOpen(false)}>✖</button>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label><span>No. Polisi*</span>
                <input value={form.no_polisi} onChange={(e)=>setForm({...form,no_polisi:e.target.value.toUpperCase()})} placeholder="B 1234 ABC"/>
                {formErrs.no_polisi && <em className="err">{formErrs.no_polisi}</em>}
              </label>
              <label><span>NIK*</span>
                <input value={form.nik} onChange={(e)=>setForm({...form,nik:e.target.value})} placeholder="16 digit"/>
                {formErrs.nik && <em className="err">{formErrs.nik}</em>}
              </label>
              <label><span>Nama Pemilik</span>
                <input value={form.nama_pemilik_terakhir} onChange={(e)=>setForm({...form,nama_pemilik_terakhir:e.target.value})}/>
              </label>
              <label><span>Nomor HP</span>
                <input value={form.nomor_hp} onChange={(e)=>setForm({...form,nomor_hp:e.target.value})} placeholder="+62…"/>
                {formErrs.nomor_hp && <em className="err">{formErrs.nomor_hp}</em>}
              </label>
              <label><span>Alamat</span>
                <input value={form.alamat_pemilik_terakhir} onChange={(e)=>setForm({...form,alamat_pemilik_terakhir:e.target.value})}/>
              </label>
              <label><span>Provinsi</span>
                <input value={form.prov_nama} onChange={(e)=>setForm({...form,prov_nama:e.target.value})}/>
              </label>
              <label><span>Kode Golongan</span>
                <input value={form.kode_golongan} onChange={(e)=>setForm({...form,kode_golongan:e.target.value})}/>
              </label>
              <label><span>Deskripsi Plat</span>
                <input value={form.deskripsi_plat} onChange={(e)=>setForm({...form,deskripsi_plat:e.target.value})}/>
              </label>
              <label><span>Tgl Transaksi</span>
                <input type="date" value={form.tgl_transaksi||""} onChange={(e)=>setForm({...form,tgl_transaksi:e.target.value})}/>
              </label>
              <label><span>Tgl Mati YAD</span>
                <input type="date" value={form.tgl_mati_yad||""} onChange={(e)=>setForm({...form,tgl_mati_yad:e.target.value})}/>
              </label>


              <div className="modal-foot">
                <button type="button" className="btn ghost" onClick={()=>setIsFormOpen(false)}>Batal</button>
                <button type="submit" className="btn primary">{formMode==="create"?"Simpan":"Update"}</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* detail drawer */}
      {detailOpen && detailRow && (
        <div className="drawer-backdrop" onClick={()=>setDetailOpen(false)}>
          <aside className="drawer" onClick={(e)=>e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Detail Data</h3>
              <button className="icon-btn" onClick={()=>setDetailOpen(false)}>✖</button>
            </div>
            <div className="detail-grid">
              {[
                ["No. Polisi", detailRow.no_polisi],
                ["NIK", detailRow.nik],
                ["Nama Pemilik", detailRow.nama_pemilik_terakhir],
                ["Nomor HP", (!((detailRow.nomor_hp||"").trim()) || detailRow.nomor_hp==="0") ? "—" : detailRow.nomor_hp],
                ["Alamat", detailRow.alamat_pemilik_terakhir],
                ["Provinsi", detailRow.prov_nama],
                ["Kode Golongan", detailRow.kode_golongan],
                ["Deskripsi Plat", detailRow.deskripsi_plat],
                ["Tgl Transaksi", detailRow.tgl_transaksi || "-"],
                ["Tgl Mati YAD", detailRow.tgl_mati_yad || "-"]
              ].map(([k,v])=>(
                <div className="detail-row" key={k}>
                  <div className="detail-key">{k}</div>
                  <div className="detail-val">{v || "-"}</div>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <button className="btn tiny" onClick={()=>{ setDetailOpen(false); openEdit(detailRow); }}>✏️ Edit</button>
              <button className="btn tiny danger" onClick={()=>handleDelete(detailRow)}>🗑️ Hapus</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}