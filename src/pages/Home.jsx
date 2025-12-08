import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAdminRefresh } from "../hooks/useAdminRefresh"; // ✅ samain

function Sparkline({ values = [], labels = [] }) {
  const w = 700, h = 220;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);

  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 40);
    return `${x},${y}`;
  });

  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "9rem", display: "flex", flexDirection: "column" }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="spark"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", flex: 1 }}
      >
        <defs>
          <linearGradient id="fillPink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopOpacity="0.3" stopColor="#ff7ca3" />
            <stop offset="100%" stopOpacity="0.1" stopColor="#ff7ca3" />
          </linearGradient>
        </defs>

        <polygon points={area} fill="url(#fillPink)" />

        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke="#ff5277"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {values.map((v, i) => {
          const x = i * stepX;
          const y = h - ((v - min) / range) * (h - 40);
          return (
            <circle key={i} cx={x} cy={y} r="4" fill="#ff5277" stroke="#fff" strokeWidth="2" />
          );
        })}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.75rem", color: "#7a6b7d", lineHeight: 1.3 }}>
        {labels?.map((label, i) => <span key={i}>{label}</span>) ||
          values.map((_, i) => <span key={i}>{i + 1}</span>)}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "pink", percent, loading = false }) {
  if (loading) {
    return (
      <article className="card stat loading">
        <div className="stat-top">
          <div className={`stat-dot ${color} skeleton`} />
          <div className="stat-label skeleton-text" />
        </div>
        <div className={`stat-value ${color} skeleton-text`} />
        {percent != null && (
          <>
            <div className="progress skeleton"><span style={{ width: "0%" }} /></div>
            <div className="stat-foot muted skeleton-text" />
          </>
        )}
      </article>
    );
  }

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

function SectionCard({ title, onSeeAll, children, loading = false }) {
  if (loading) {
    return (
      <section className="card table loading">
        <div className="card-header"><div className="card-title skeleton-text" /></div>
        <div className="skeleton-content">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-text" />
              <div className="skeleton-text" />
              <div className="skeleton-text" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="card table">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div className="card-title">{title}</div>
        {onSeeAll && (
          <button
            className="see-all-btn"
            onClick={onSeeAll}
            style={{
              background: "linear-gradient(90deg,#ff7ca3,#ff5277)",
              border: "none",
              color: "#fff",
              padding: "0.375rem 0.875rem",
              borderRadius: "1.25rem",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 0.1875rem 0.5rem rgba(255,82,119,0.35)",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              transition: "all 0.25s ease",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            See All <span style={{ fontSize: "0.875rem" }}>→</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function daysUntilExpiry(endDate) {
  try {
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    console.error("Error calculating days until expiry:", error);
    return NaN;
  }
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const currency = (n) =>
    (Number(n) || 0).toLocaleString("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });

  const [summary, setSummary] = useState({
    total: 0, selesai: 0, progress: 0, pending: 0, ditolak: 0,
  });
  const [trend, setTrend] = useState({ values: [], labels: [] });
  const [dataForm, setDataForm] = useState([]);
  const [dataAhliWaris, setDataAhliWaris] = useState([]);
  const [dataPKS, setDataPKS] = useState([]);
  const [pksExpiring, setPksExpiring] = useState({ expired: 0, expiringSoon: 0, active: 0 });

  async function generateTrendData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const { data: formsLast30Days, error } = await supabase
        .from("dataform")
        .select('"createdAt"')
        .gte('"createdAt"', thirtyDaysAgo.toISOString());

      if (error) {
        console.error("❌ Error fetching trend data:", error);
        return {
          values: [1, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4],
          labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        };
      }

      if (!formsLast30Days || formsLast30Days.length === 0) {
        return {
          values: Array(12).fill(0),
          labels: ["1","2","3","4","5","6","7","8","9","10","11","12"],
        };
      }

      const dailyCounts = {};
      const dateLabels = [];
      const today = new Date();

      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateKey = date.toISOString().split("T")[0];
        const label = date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
        dailyCounts[dateKey] = 0;
        dateLabels.push(label);
      }

      formsLast30Days?.forEach((form) => {
        if (form.createdAt) {
          const formDate = new Date(form.createdAt).toISOString().split("T")[0];
          if (dailyCounts[formDate] !== undefined) dailyCounts[formDate]++;
        }
      });

      return { values: Object.values(dailyCounts), labels: dateLabels };
    } catch (error) {
      console.error("Error in generateTrendData:", error);
      return {
        values: [1, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4],
        labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
      };
    }
  }

  // ✅ fetcher / onRefresh pola sama persis
  const fetcherDashboard = useCallback(async () => {
    const trendData = await generateTrendData();

    const { data: dataFormResult, error: dataFormError } = await supabase
      .from("dataform")
      .select('id, status, "createdAt"');

    if (dataFormError) console.error("Error fetching dataform:", dataFormError);

    const allForms = dataFormResult || [];
    const total = allForms.length;
    const selesai = allForms.filter((f) => f.status === "selesai").length;
    const progress = allForms.filter((f) => f.status === "diproses").length;
    const pending = allForms.filter((f) => f.status === "terkirim").length;
    const ditolak = allForms.filter((f) => f.status === "ditolak").length;

    const { data: recentForms } = await supabase
      .from("dataform")
      .select("id, korban, template, status, createdAt")
      .eq("status", "terkirim")
      .order("createdAt", { ascending: false })
      .limit(5);

    const formattedForms = recentForms?.map((form) => ({
      id: form.id,
      nama: form.korban || "Tanpa Nama",
      jenis:
        form.template === "kunjungan_rs" ? "Kunjungan RS"
        : form.template === "survei_md" ? "Survey MD"
        : form.template === "survei_ll" ? "Survey LL"
        : "Form",
      tanggal: new Date(form.createdAt).toLocaleDateString("id-ID"),
      status: "Terkirim",
    })) || [];

    const { data: ahliWarisData, error: awError } = await supabase
      .from("data_waris")
      .select("id, nama_korban, jenis_kelamin_aw, nama_penerima_aw, alamat_aw, jalan_aw, jumlah_santunan, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    const mappedAhliWaris = awError
      ? []
      : (ahliWarisData || []).map((r) => ({
          id: r.id,
          korban: r.nama_korban || "-",
          gender:
            r.jenis_kelamin_aw === "L" ? "Laki-laki"
            : r.jenis_kelamin_aw === "P" ? "Perempuan"
            : "-",
          ahli: r.nama_penerima_aw || "-",
          lokasi: r.alamat_aw || r.jalan_aw || "-",
          santunan: r.jumlah_santunan || 0,
          createdAt: r.created_at,
        }));

    if (awError) console.error("❌ Error fetch data_waris (Home):", awError);

    const { data: pksData } = await supabase
      .from("datapks")
      .select("*")
      .order("tgl_akhir", { ascending: true })
      .limit(5);

    let expiredCount = 0;
    let expiringSoonCount = 0;
    let activeCount = 0;

    const processedPksData =
      pksData?.map((pks) => {
        try {
          const endDate = new Date(pks.tgl_akhir);
          if (isNaN(endDate.getTime())) return null;

          const daysLeft = daysUntilExpiry(pks.tgl_akhir);
          if (isNaN(daysLeft)) return null;

          let status = "active";
          if (daysLeft <= 0) {
            expiredCount++;
            status = "expired";
          } else if (daysLeft <= 30) {
            expiringSoonCount++;
            status = "expiring-soon";
          } else {
            activeCount++;
            status = "active";
          }

          return {
            id: pks.id,
            rs: pks.nama_rs,
            wilayah: pks.wilayah,
            masa_berlaku: pks.masa_berlaku,
            awal: new Date(pks.tgl_awal).toLocaleDateString("id-ID"),
            akhir: new Date(pks.tgl_akhir).toLocaleDateString("id-ID"),
            no_perjanjian_rs: pks.no_perjanjian_rs,
            no_perjanjian_jr: pks.no_perjanjian_jr,
            daysLeft,
            status,
          };
        } catch (error) {
          console.error("Error processing PKS data:", error, pks);
          return null;
        }
      }).filter(Boolean) || [];

    return {
      trendData,
      summaryData: { total, selesai, progress, pending, ditolak },
      formattedForms,
      mappedAhliWaris,
      processedPksData,
      expCounts: { expiredCount, expiringSoonCount, activeCount },
    };
  }, []);

  const onRefresh = useCallback(async () => {
    const res = await fetcherDashboard();
    setTrend(res.trendData);
    setSummary(res.summaryData);
    setDataForm(res.formattedForms);
    setDataAhliWaris(res.mappedAhliWaris);
    setDataPKS(res.processedPksData);
    setPksExpiring({
      expired: res.expCounts.expiredCount,
      expiringSoon: res.expCounts.expiringSoonCount,
      active: res.expCounts.activeCount,
    });
    return res;
  }, [fetcherDashboard]);

  const { loading, loadedAt, toast, setToast, refresh } =
    useAdminRefresh(onRefresh, "Dashboard berhasil diperbarui"); // ✅ sama

  useEffect(() => {
    refresh(); // ✅ auto load pertama, aman no loop
  }, [refresh]);

  const pct = useMemo(() => ({
    selesai: summary.total > 0 ? Math.round((summary.selesai / summary.total) * 100) : 0,
    progress: summary.total > 0 ? Math.round((summary.progress / summary.total) * 100) : 0,
    pending: summary.total > 0 ? Math.round((summary.pending / summary.total) * 100) : 0,
  }), [summary]);

  return (
    <div className="dashx" style={{ padding: "1.25rem", backgroundColor: "#fafafa" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {/* HEAD */}
        <header className="dashx-head">
          <div>
            <h1>Home (Dashboard Analitik)</h1>
            <p className="muted">
              Hai <b>{user?.name || "Admin"}</b>, berikut ringkasan data real-time dari sistem.
            </p>

            {/* ✅ loadedAt sama kayak halaman lain */}
            <p className="muted small" style={{ marginTop: 4 }}>
              {loading ? "Memuat…" : `${summary.total} data total`}
              {loadedAt ? ` • diperbarui ${loadedAt.toLocaleTimeString("id-ID")}` : ""}
            </p>
          </div>

          <div className="head-actions">
            <select className="select">
              <option>Periode: 30 hari</option>
              <option>Periode: 90 hari</option>
              <option>Periode: 1 tahun</option>
            </select>

            {/* ✅ tombol refresh pakai refresh() */}
            <button className="btn-export" onClick={refresh} disabled={loading}>
              {loading ? "⏳ Loading..." : "🔄 Refresh"}
            </button>
          </div>
        </header>

        {/* KPI CARDS */}
        <section className="dashx-cards" style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
          <StatCard label="Total Pengajuan" value={summary.total} loading={loading} />
          <StatCard label="Selesai" value={summary.selesai} color="green" percent={pct.selesai} loading={loading} />
          <StatCard label="Progress" value={summary.progress} color="blue" percent={pct.progress} loading={loading} />
          <StatCard label="Pending" value={summary.pending} color="red" percent={pct.pending} loading={loading} />
        </section>

        {/* CHART & RINGKASAN */}
        <section className="dashx-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem", marginTop: "1.5rem" }}>
          <article className="card" style={{ padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "white" }}>
            <div className="card-title" style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem" }}>
              Trend Pengajuan Form (12 Hari Terakhir)
            </div>
            {loading ? (
              <div className="skeleton-chart">
                <div className="skeleton-bar" />
                <div className="skeleton-bar" />
                <div className="skeleton-bar" />
                <div className="skeleton-bar" />
              </div>
            ) : (
              <>
                <Sparkline
                  values={Array.isArray(trend?.values) ? trend.values : []}
                  labels={Array.isArray(trend?.labels) ? trend.labels : []}
                />
                <div className="legend" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", fontSize: "0.875rem", color: "#7a6b7d" }}>
                  <span className="dot pink" style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "#ff5277", display: "inline-block" }} />
                  Total: {Array.isArray(trend?.values) ? trend.values.reduce((a, b) => a + b, 0) : 0} pengajuan dalam 12 hari
                </div>
              </>
            )}
          </article>

          <article className="card" style={{ padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "white" }}>
            <div className="card-title" style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "1rem" }}>
              Ringkasan Status
            </div>
            {loading ? (
              <div className="skeleton-content">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-barlist">
                    <div className="skeleton-text" />
                    <div className="skeleton-bar" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ul className="barlist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: "0.75rem" }}>
                    <span className="name" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9375rem" }}>
                      <span className="dot green" style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "#0f7a4c" }} />
                      Selesai
                    </span>
                    <span className="bar" style={{ display: "block", height: "0.5rem", background: "#e0e0e0", marginTop: "0.25rem", borderRadius: "0.25rem" }}>
                      <i style={{ display: "block", height: "100%", background: "#a3d9a3", width: `${pct.selesai}%`, borderRadius: "0.25rem" }} />
                    </span>
                    <b style={{ display: "block", marginTop: "0.25rem", fontSize: "0.9375rem" }}>{summary.selesai}</b>
                  </li>
                  <li style={{ marginBottom: "0.75rem" }}>
                    <span className="name" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9375rem" }}>
                      <span className="dot blue" style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "#1b5fb3" }} />
                      Progress
                    </span>
                    <span className="bar" style={{ display: "block", height: "0.5rem", background: "#e0e0e0", marginTop: "0.25rem", borderRadius: "0.25rem" }}>
                      <i style={{ display: "block", height: "100%", background: "#a3c4ff", width: `${pct.progress}%`, borderRadius: "0.25rem" }} />
                    </span>
                    <b style={{ display: "block", marginTop: "0.25rem", fontSize: "0.9375rem" }}>{summary.progress}</b>
                  </li>
                  <li style={{ marginBottom: "0.75rem" }}>
                    <span className="name" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9375rem" }}>
                      <span className="dot red" style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "#a30f2d" }} />
                      Pending
                    </span>
                    <span className="bar" style={{ display: "block", height: "0.5rem", background: "#e0e0e0", marginTop: "0.25rem", borderRadius: "0.25rem" }}>
                      <i style={{ display: "block", height: "100%", background: "#ffb8b8", width: `${pct.pending}%`, borderRadius: "0.25rem" }} />
                    </span>
                    <b style={{ display: "block", marginTop: "0.25rem", fontSize: "0.9375rem" }}>{summary.pending}</b>
                  </li>
                </ul>
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#fff9fd", borderRadius: "0.5rem" }}>
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", fontWeight: "bold", color: "#b13a77" }}>
                    📊 Data PKS
                  </p>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.8125rem" }}>
                    <span style={{ color: "#a30f2d" }}>⛔ Expired: {pksExpiring.expired}</span>
                    <span style={{ color: "#d79300" }}>⚠️ Akan Expired: {pksExpiring.expiringSoon}</span>
                  </div>
                </div>
              </>
            )}
          </article>
        </section>

        {/* DATA FORM */}
        <SectionCard title="Data Form Terbaru" onSeeAll={() => navigate("/dataform")} loading={loading}>
          {!loading && (
            dataForm.length > 0 ? (
              <table className="nice-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Nama</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Jenis</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Tanggal</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dataForm.map((row, i) => (
                    <tr key={row.id || i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "0.75rem" }}>{row.nama}</td>
                      <td style={{ padding: "0.75rem" }}>{row.jenis}</td>
                      <td style={{ padding: "0.75rem" }}>{row.tanggal}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className={`status-badge ${row.status.toLowerCase()}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "#7a6b7d", background: "#fff9fd", borderRadius: "0.5rem", border: "2px dashed #ffd7ea" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📝</div>
                <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data form terbaru</p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem" }}>Belum ada pengajuan form dengan status "terkirim".</p>
              </div>
            )
          )}
        </SectionCard>

        {/* DATA AHLI WARIS */}
        <SectionCard title="Data Ahli Waris" onSeeAll={() => navigate("/data-waris")} loading={loading}>
          {!loading && (
            dataAhliWaris.length > 0 ? (
              <table className="nice-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Korban</th><th>Gender</th><th>Ahli Waris</th><th>Lokasi</th><th>Santunan</th>
                  </tr>
                </thead>
                <tbody>
                  {dataAhliWaris.map((row, i) => (
                    <tr key={row.id || i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "0.75rem" }}>{row.korban}</td>
                      <td style={{ padding: "0.75rem" }}>{row.gender}</td>
                      <td style={{ padding: "0.75rem" }}>{row.ahli}</td>
                      <td style={{ padding: "0.75rem" }}>{row.lokasi}</td>
                      <td style={{ padding: "0.75rem" }}>{currency(row.santunan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "#7a6b7d", background: "#fff9fd", borderRadius: "0.5rem", border: "2px dashed #ffd7ea" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>👨‍👩‍👧‍👦</div>
                <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data ahli waris</p>
              </div>
            )
          )}
        </SectionCard>

        {/* DATA PKS */}
        <SectionCard title="Data PKS" onSeeAll={() => navigate("/datapks")} loading={loading}>
          {!loading && (
            dataPKS.length > 0 ? (
              <table className="nice-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Rumah Sakit</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Wilayah</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Tgl Awal</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Tgl Akhir</th>
                    <th style={{ textAlign: "left", padding: "0.75rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dataPKS.map((row, i) => (
                    <tr key={row.id || i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "0.75rem" }}>{row.rs}</td>
                      <td style={{ padding: "0.75rem" }}>{row.wilayah}</td>
                      <td style={{ padding: "0.75rem" }}>{row.awal}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className={row.daysLeft <= 0 ? "expired" : row.daysLeft <= 30 ? "expiring-soon" : ""}>
                          {row.akhir}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className={`status-badge ${row.status}`}>
                          {isNaN(row.daysLeft) ? "ERROR"
                            : row.status === "expired" ? "EXPIRED"
                            : row.status === "expiring-soon" ? `${row.daysLeft} HARI`
                            : "AKTIF"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "#7a6b7d", background: "#fff9fd", borderRadius: "0.5rem", border: "2px dashed #ffd7ea" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏥</div>
                <p style={{ margin: 0, fontWeight: 600 }}>Belum ada data PKS</p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem" }}>Data kerja sama rumah sakit masih kosong.</p>
              </div>
            )
          )}
        </SectionCard>

        {/* GLOBAL STYLES */}
        <style>{`
          .dashx-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1.5rem;
            flex-wrap: wrap;
            gap: 1rem;
          }
          .dashx-head h1 {
            font-size: 1.5rem;
            margin: 0;
          }
          .muted {
            font-size: 0.9375rem;
            color: #666;
          }
          .select, .btn-export {
            padding: 0.375rem 0.75rem;
            font-size: 0.875rem;
            border: 1px solid #ddd;
            border-radius: 0.375rem;
          }
          .btn-export {
            background: #f0f0f0;
            cursor: pointer;
          }

          .stat {
            background: white;
            padding: 1.25rem;
            border-radius: 0.75rem;
            box-shadow: 0 0.125rem 0.375rem rgba(0,0,0,0.05);
          }
          .stat-top {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
          }
          .stat-dot {
            width: 0.75rem;
            height: 0.75rem;
            border-radius: 50%;
          }
          .stat-dot.pink { background: #ff5277; }
          .stat-dot.green { background: #0f7a4c; }
          .stat-dot.blue { background: #1b5fb3; }
          .stat-dot.red { background: #a30f2d; }
          .stat-label {
            font-size: 0.875rem;
            color: #7a6b7d;
          }
          .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
          }
          .stat-value.pink { color: #ff5277; }
          .stat-value.green { color: #0f7a4c; }
          .stat-value.blue { color: #1b5fb3; }
          .stat-value.red { color: #a30f2d; }
          .progress {
            height: 0.375rem;
            background: #f0f0f0;
            border-radius: 0.1875rem;
            margin: 0.5rem 0;
            overflow: hidden;
          }
          .progress span {
            display: block;
            height: 100%;
            background: currentColor;
          }
          .stat-foot {
            font-size: 0.8125rem;
          }

          .skeleton,
          .skeleton-text {
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            border-radius: 0.25rem;
          }
          .skeleton-text {
            height: 0.75rem;
            margin-bottom: 0.5rem;
          }
          .skeleton-bar {
            min-height: 1.25rem;
            flex: 1;
            border-radius: 0.25rem 0.25rem 0 0;
          }
          .skeleton-barlist {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
          }
          .skeleton-row {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
          }
          .skeleton-content .skeleton-text {
            flex: 1;
          }
          @keyframes loading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }

          .status-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 0.75rem;
            font-size: 0.6875rem;
            font-weight: 600;
            display: inline-block;
          }
          .status-badge.terkirim { background: #fff0f6; color: #b13a77; border: 1px solid #ffb6d6; }
          .status-badge.diproses { background: #e8f0ff; color: #1b5fb3; border: 1px solid #a3c4ff; }
          .status-badge.selesai { background: #e8f5e8; color: #0f7a4c; border: 1px solid #a3d9a3; }
          .status-badge.ditolak { background: #fff0f0; color: #a30f2d; border: 1px solid #ffb8b8; }
          .status-badge.expired { background: #fff0f0; color: #a30f2d; }
          .status-badge.expiring-soon { background: #fff9e8; color: #d79300; }
          .status-badge.active { background: #e8f5e8; color: #0f7a4c; }

          .expired { color: #a30f2d; font-weight: 600; }
          .expiring-soon { color: #d79300; font-weight: 600; }

          .spark { border-radius: 0.5rem; }

          .legend {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 0.75rem;
            font-size: 0.875rem;
            color: #7a6b7d;
          }
          .dot.pink {
            width: 0.5rem;
            height: 0.5rem;
            border-radius: 50%;
            background: #ff5277;
            display: inline-block;
          }

          .skeleton-chart {
            display: flex;
            align-items: end;
            gap: 0.375rem;
            height: 7.5rem;
            padding: 1.25rem 0;
          }
          .skeleton-bar {
            flex: 1;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            border-radius: 0.25rem 0.25rem 0 0;
            min-height: 1.25rem;
          }

          .nice-table th,
          .nice-table td {
            padding: 0.75rem;
            text-align: left;
            font-size: 0.9375rem;
          }
          .nice-table th {
            font-weight: 600;
            background-color: #fafafa;
          }
          .nice-table tbody tr:last-child {
            border-bottom: none;
          }

          @media (min-width: 768px) {
            .dashx-grid {
              grid-template-columns: 1fr 1fr;
            }
          }
        `}</style>
      </div>

      {/* ✅ TOAST pojok kanan bawah, sama model DataAhliWaris */}
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
