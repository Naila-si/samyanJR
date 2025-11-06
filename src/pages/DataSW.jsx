import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import '../styles/datasw.css';

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
      // escape CSV
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
  if (!q) return text;
  const parts = String(text).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "ig"));
  return parts.map((p,i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="hl">{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

export default function DataSW() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterHp, setFilterHp] = useState("all"); // all | ada | kosong
  const [loadedAt, setLoadedAt] = useState(null);
  const debounced = useDebouncedValue(search, 300);
  const firstLoad = useRef(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("data_sw")
        .select("*")
        .order("tgl_transaksi", { ascending: true })
        .limit(2000);

      if (error) {
        console.error("❌ Error fetching data_sw:", error);
        setRows([]);
      } else {
        setRows(data || []);
        setLoadedAt(new Date());
      }
      setLoading(false);
      firstLoad.current = false;
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (debounced) {
      const q = debounced.toLowerCase();
      out = out.filter(d =>
        Object.values(d).join(" ").toLowerCase().includes(q)
      );
    }
    if (filterHp === "ada") out = out.filter(d => (d.nomor_hp || "").trim() && (d.nomor_hp !== "0"));
    if (filterHp === "kosong") out = out.filter(d => !((d.nomor_hp || "").trim()) || d.nomor_hp === "0");
    return out;
  }, [rows, debounced, filterHp]);

  // PAGINATION
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    useEffect(() => {
    // reset ke halaman 1 saat hasil filter berubah / ukuran halaman berubah
    setPage(1);
    }, [debounced, filterHp, pageSize, rows]);

    const startIdx = (page - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const paginated = useMemo(
    () => filtered.slice(startIdx, endIdx),
    [filtered, startIdx, endIdx]
    );

  return (
    <div className="datasw-page">
      <header className="datasw-header">
        <div>
          <h1>🌸 Data SW</h1>
          <p className="muted small">
            {loading ? "Memuat…" : `${filtered.length} baris ditampilkan`}{loadedAt ? ` • diperbarui ${loadedAt.toLocaleTimeString("id-ID")}` : ""}
          </p>
        </div>
        <div className="dsw-actions">
          <button className="kawaii-btn ghost" onClick={() => exportCsv(filtered)}>⬇️ Export CSV</button>
          <button className="kawaii-btn" onClick={() => window.location.reload()}>🔄 Refresh</button>
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
            <button
              className={`chip ${filterHp === "all" ? "active" : ""}`}
              onClick={() => setFilterHp("all")}
            >Semua</button>
            <button
              className={`chip ${filterHp === "ada" ? "active" : ""}`}
              onClick={() => setFilterHp("ada")}
            >📱 Ada HP</button>
            <button
              className={`chip ${filterHp === "kosong" ? "active" : ""}`}
              onClick={() => setFilterHp("kosong")}
            >🚫 Tanpa HP</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">⏳ Memuat data...</div>
      ) : (
        <>
            {/* PAGER TOP */}
            {totalPages > 1 && (
            <div className="pager">
                <div className="pager-left">
                <span className="range">
                    {total ? `${startIdx + 1}–${endIdx} dari ${total}` : "0 data"}
                </span>
                <label className="page-size">
                    Tampilkan
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    </select>
                    / halaman
                </label>
                </div>
                <div className="pager-right">
                <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>⏮</button>
                <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>◀</button>
                <span className="page-num">Hal {page} / {totalPages}</span>
                <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>▶</button>
                <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>⏭</button>
                </div>
            </div>
            )}
            <div className="table-wrap">
            <table className="kawaii-table">
                <thead>
                <tr>
                    <th style={{minWidth:120}}>Tgl Transaksi</th>
                    <th style={{minWidth:120}}>No Polisi</th>
                    <th style={{minWidth:220}}>Nama Pemilik Terakhir</th>
                    <th style={{minWidth:120}}>Tgl Mati Yad</th>
                    <th style={{minWidth:100}}>Kode Gol</th>
                    <th style={{minWidth:360}}>Alamat</th>
                    <th style={{minWidth:130}}>Nomor HP</th>
                    <th style={{minWidth:140}}>NIK</th>
                    <th style={{minWidth:120}}>Provinsi</th>
                    <th style={{minWidth:200}}>Deskripsi Plat</th>
                </tr>
                </thead>
                <tbody>
                {paginated.map((row, i) => (
                    <tr key={i}>
                    <td>{row.tgl_transaksi || "-"}</td>
                    <td className="mono"><Highlight text={row.no_polisi} q={debounced} /></td>
                    <td><Highlight text={row.nama_pemilik_terakhir} q={debounced} /></td>
                    <td>{row.tgl_mati_yad || "-"}</td>
                    <td>
                        <span className="gol-badge">{row.kode_golongan || "-"}</span>
                    </td>
                    <td className="alamat"><Highlight text={row.alamat_pemilik_terakhir} q={debounced} /></td>
                    <td className={((row.nomor_hp||"") && row.nomor_hp!=="0") ? "" : "muted"}>
                        {row.nomor_hp && row.nomor_hp !== "0" ? row.nomor_hp : "—"}
                    </td>
                    <td className="mono"><Highlight text={row.nik || "-"} q={debounced} /></td>
                    <td>{row.prov_nama}</td>
                    <td><Highlight text={row.deskripsi_plat} q={debounced} /></td>
                    </tr>
                ))}
                {!paginated.length && (
                    <tr><td colSpan={10} style={{textAlign:"center", padding:"16px"}}>Tidak ada data yang cocok.</td></tr>
                )}
                </tbody>
            </table>
            </div>
            {/* PAGER BOTTOM */}
            {totalPages > 1 && (
            <div className="pager">
                <div className="pager-left">
                <span className="range">
                    {total ? `${startIdx + 1}–${endIdx} dari ${total}` : "0 data"}
                </span>
                <label className="page-size">
                    Tampilkan
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    </select>
                    / halaman
                </label>
                </div>
                <div className="pager-right">
                <button className="pg-btn" onClick={() => setPage(1)} disabled={page === 1}>⏮</button>
                <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>◀</button>
                <span className="page-num">Hal {page} / {totalPages}</span>
                <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>▶</button>
                <button className="pg-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>⏭</button>
                </div>
            </div>
            )}
        </>
      )}
    </div>
  );
}