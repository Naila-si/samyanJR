import React, { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

// ----- data mock (gantikan dari API nanti)
const summary = { total: 128, selesai: 36, progress: 42, pending: 50 };
const trend = [8, 12, 10, 14, 20, 16, 22, 19, 25, 21, 28, 24];

// Mock data dari halaman lain
const dataForm = [
  { nama: "Form A", jenis: "Survey", tanggal: "2025-09-20", status: "Progress" },
  { nama: "Form B", jenis: "Laporan", tanggal: "2025-09-21", status: "Pending" },
];

const dataAhliWaris = [
  { korban: "Korban 1", gender: "Laki-laki", ahli: "Ahli Waris 1", lokasi: "Jl. Contoh No.1", santunan: 10000000 },
  { korban: "Korban 2", gender: "Perempuan", ahli: "Ahli Waris 2", lokasi: "Jl. Contoh No.2", santunan: 10500000 },
];

const dataPKS = [
  { rs: "RSUD Riau", wilayah: "Riau", awal: "2022-01-01", akhir: "2027-01-01", nomor: "PKS-001" },
  { rs: "RS Pekanbaru", wilayah: "Riau", awal: "2023-01-01", akhir: "2028-01-01", nomor: "PKS-002" },
];

// Sparkline responsive
function Sparkline({ values }) {
  const w = 700, h = 220;
  const max = Math.max(...values), min = Math.min(...values);
  const stepX = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x},${y}`;
  });
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" preserveAspectRatio="none">
      <defs>
        <linearGradient id="fillPink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopOpacity="1" stopColor="#ffe3ea"/>
          <stop offset="100%" stopOpacity="1" stopColor="#fff"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#fillPink)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#ee6d73" strokeWidth="4" />
    </svg>
  );
}

function StatCard({ label, value, color = "pink", percent }) {
  return (
    <article className="card stat">
      <div className="stat-top">
        <div className={`stat-dot ${color}`} />
        <div className="stat-label">{label}</div>
      </div>
      <div className={`stat-value ${color}`}>{value}</div>
      {percent != null && (
        <>
          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
          <div className="stat-foot muted">{percent}% dari total</div>
        </>
      )}
    </article>
  );
}

function SectionCard({ title, onSeeAll, children }) {
  return (
    <section className="card table">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="card-title">{title}</div>
        {onSeeAll && (
          <button
            className="see-all-btn"
            onClick={onSeeAll}
            style={{
              background: "linear-gradient(90deg,#ff7ca3,#ff5277)",
              border: "none",
              color: "#fff",
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 3px 8px rgba(255,82,119,0.35)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.25s ease",
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
          >
            See All <span style={{ fontSize: 14 }}>→</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pct = useMemo(() => ({
    selesai: Math.round((summary.selesai / summary.total) * 100),
    progress: Math.round((summary.progress / summary.total) * 100),
    pending: Math.round((summary.pending / summary.total) * 100),
  }), []);

  return (
    <div className="dashx">
      {/* HEAD */}
      <header className="dashx-head">
        <div>
          <h1>Home (Dashboard Analitik)</h1>
          <p className="muted">
            Hai <b>{user?.name || "Admin"}</b>, berikut ringkasan data dari berbagai halaman.
          </p>
        </div>

        <div className="head-actions">
          <select className="select">
            <option>Periode: 12 hari</option>
            <option>Periode: 30 hari</option>
            <option>Periode: 90 hari</option>
          </select>
          <button className="btn-export">Export</button>
        </div>
      </header>

      {/* KPI CARDS */}
      <section className="dashx-cards">
        <StatCard label="Total Pengajuan" value={summary.total} />
        <StatCard label="Selesai" value={summary.selesai} color="green" percent={pct.selesai} />
        <StatCard label="Progress" value={summary.progress} color="blue" percent={pct.progress} />
        <StatCard label="Pending" value={summary.pending} color="red" percent={pct.pending} />
      </section>

      {/* CHART & RINGKASAN */}
      <section className="dashx-grid">
        <article className="card">
          <div className="card-title">Trend Pengajuan (12 Hari)</div>
          <Sparkline values={trend} />
          <div className="legend"><span className="dot pink" /> Pengajuan per hari</div>
        </article>

        <article className="card">
          <div className="card-title">Ringkasan Status</div>
          <ul className="barlist">
            <li>
              <span className="name"><span className="dot green" /> Selesai</span>
              <span className="bar"><i style={{width: `${pct.selesai}%`}} /></span>
              <b>{summary.selesai}</b>
            </li>
            <li>
              <span className="name"><span className="dot blue" /> Progress</span>
              <span className="bar"><i style={{width: `${pct.progress}%`}} /></span>
              <b>{summary.progress}</b>
            </li>
            <li>
              <span className="name"><span className="dot red" /> Pending</span>
              <span className="bar"><i style={{width: `${pct.pending}%`}} /></span>
              <b>{summary.pending}</b>
            </li>
          </ul>
          <p className="muted small">* Data mock; hubungkan ke API nanti.</p>
        </article>
      </section>

      {/* DATA FORM */}
      <SectionCard title="Data Form Terbaru" onSeeAll={() => navigate("/data-form")}>
        <table className="nice-table">
          <thead>
            <tr><th>Nama</th><th>Jenis</th><th>Tanggal</th><th>Status</th></tr>
          </thead>
          <tbody>
            {dataForm.map((row, i) => (
              <tr key={i}>
                <td>{row.nama}</td>
                <td>{row.jenis}</td>
                <td>{row.tanggal}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* DATA AHLI WARIS */}
      <SectionCard title="Data Ahli Waris" onSeeAll={() => navigate("/data-ahli-waris")}>
        <table className="nice-table">
          <thead>
            <tr><th>Korban</th><th>Gender</th><th>Ahli Waris</th><th>Lokasi</th><th>Santunan</th></tr>
          </thead>
          <tbody>
            {dataAhliWaris.map((row, i) => (
              <tr key={i}>
                <td>{row.korban}</td>
                <td>{row.gender}</td>
                <td>{row.ahli}</td>
                <td>{row.lokasi}</td>
                <td>{row.santunan.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      {/* DATA PKS */}
      <SectionCard title="Data PKS" onSeeAll={() => navigate("/data-pks")}>
        <table className="nice-table">
          <thead>
            <tr><th>Rumah Sakit</th><th>Wilayah</th><th>Tanggal Awal</th><th>Tanggal Akhir</th><th>Nomor PKS</th></tr>
          </thead>
          <tbody>
            {dataPKS.map((row, i) => (
              <tr key={i}>
                <td>{row.rs}</td>
                <td>{row.wilayah}</td>
                <td>{row.awal}</td>
                <td>{row.akhir}</td>
                <td>{row.nomor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}