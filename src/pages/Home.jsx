import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function Sparkline({ values = [], labels = [] }) {
  const w = 700, h = 220;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  
  const stepX = w / (values.length - 1 || 1);
  
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 40); // Beri margin 40px di bottom
    return `${x},${y}`;
  });
  
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '140px' }}>
      <svg 
        viewBox={`0 0 ${w} ${h}`} 
        className="spark" 
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="fillPink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopOpacity="0.3" stopColor="#ff7ca3"/>
            <stop offset="100%" stopOpacity="0.1" stopColor="#ff7ca3"/>
          </linearGradient>
        </defs>
        
        {/* Area fill */}
        <polygon points={area} fill="url(#fillPink)" />
        
        {/* Line */}
        <polyline 
          points={pts.join(" ")} 
          fill="none" 
          stroke="#ff5277" 
          strokeWidth="3" 
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {values.map((v, i) => {
          const x = i * stepX;
          const y = h - ((v - min) / range) * (h - 40);
          return (
            <circle 
              key={i}
              cx={x} 
              cy={y} 
              r="4" 
              fill="#ff5277" 
              stroke="#fff" 
              strokeWidth="2"
            />
          );
        })}
      </svg>
      
      {/* X-axis labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '8px',
        fontSize: '10px',
        color: '#7a6b7d'
      }}>
        {labels?.map((label, i) => (
          <span key={i}>{label}</span>
        )) || values.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
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
          <div className="stat-label skeleton-text"></div>
        </div>
        <div className={`stat-value ${color} skeleton-text`}></div>
        {percent != null && (
          <>
            <div className="progress skeleton"><span style={{ width: "0%" }} /></div>
            <div className="stat-foot muted skeleton-text"></div>
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
        <div className="card-header">
          <div className="card-title skeleton-text"></div>
        </div>
        <div className="skeleton-content">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-text"></div>
              <div className="skeleton-text"></div>
              <div className="skeleton-text"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

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

// Helper function untuk menghitung hari sampai expired
function daysUntilExpiry(endDate) {
  try {
    const end = new Date(endDate);
    const today = new Date();
    
    // Reset waktu ke 00:00:00 untuk perbandingan yang akurat
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (error) {
    console.error('Error calculating days until expiry:', error);
    return NaN;
  }
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ 
    total: 0, 
    selesai: 0, 
    progress: 0, 
    pending: 0 
  });
  const [trend, setTrend] = useState({ values: [], labels: [] });
  const [dataForm, setDataForm] = useState([]);
  const [dataAhliWaris, setDataAhliWaris] = useState([]);
  const [dataPKS, setDataPKS] = useState([]);
  const [pksExpiring, setPksExpiring] = useState({ expired: 0, expiringSoon: 0 });

  // Helper function untuk generate data trend 30 hari terakhir
  async function generateTrendData() {
    console.log('🔍 Starting generateTrendData...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
      console.log('📅 Fetching data from:', thirtyDaysAgo.toISOString());
      const { data: formsLast30Days } = await supabase
        .from('dataform')
        .select('"createdAt"')
        .gte('"createdAt"', thirtyDaysAgo.toISOString());
      
      if (error) {
        console.error('❌ Error fetching trend data:', error);
        return {
          values: [1, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4],
          labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
        };
      }
      
      console.log('✅ Forms found:', formsLast30Days?.length || 0);
      
      // Jika tidak ada data, return default
      if (!formsLast30Days || formsLast30Days.length === 0) {
        console.log('📭 No forms found, returning default data');
        return {
          values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
        };
      }

      const dailyCounts = {};
      const dateLabels = [];
      const today = new Date();
      
      // Generate last 12 days
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const label = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        
        dailyCounts[dateKey] = 0;
        dateLabels.push(label);
      }
      
      console.log('📅 Date range initialized:', Object.keys(dailyCounts));

      // Count forms per day
      let countedForms = 0;
      formsLast30Days?.forEach(form => {
        if (form.createdAt) {
          const formDate = new Date(form.createdAt).toISOString().split('T')[0];
          if (dailyCounts[formDate] !== undefined) {
            dailyCounts[formDate]++;
            countedForms++;
          }
        }
      });
      
      console.log('📊 Forms counted:', countedForms);

      const trendValues = Object.values(dailyCounts);
      
      console.log('🎯 Final trend data:', {
        values: trendValues,
        labels: dateLabels
      });

      return {
        values: trendValues,
        labels: dateLabels
      };
      
    } catch (error) {
      console.error('Error in generateTrendData:', error);
      return {
        values: [1, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4],
        labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
      };
    }
  }

  // Fetch data dari Supabase
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
       const trendData = await generateTrendData();
       console.log('📊 Trend data received:', trendData);
       setTrend(trendData);
    
      // 2. Data summary (seperti sebelumnya)
      const { data: dataFormResult, error: dataFormError } = await supabase
        .from('dataform')
        .select('id, status, "createdAt"');
        
      if (dataFormError) {
        console.error('Error fetching dataform:', dataFormError);
      }
      
      // Untuk sementara, skip tabel lain yang error
      const allForms = dataFormResult || [];

      // Hitung summary
      const total = allForms.length;
      const selesai = allForms.filter(f => f.status === 'selesai').length;
      const progress = allForms.filter(f => f.status === 'diproses').length;
      const pending = allForms.filter(f => f.status === 'terkirim').length;
      const ditolak = allForms.filter(f => f.status === 'ditolak').length;

      setSummary({ total, selesai, progress, pending, ditolak });

      // 2. Data untuk trend (contoh: pengajuan per hari 30 hari terakhir)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Mock trend data (bisa diganti dengan query real)
      const mockTrend = Array.from({ length: 12 }, () => 
        Math.floor(Math.random() * 10) + 5
      );
      setTrend(mockTrend);

      // 3. Data form terbaru
      const { data: recentForms } = await supabase
        .from('dataform')
        .select('id, korban, template, status, createdAt')
        .eq('status', 'terkirim')
        .order('createdAt', { ascending: false })
        .limit(5);

      console.log('📋 Recent forms:', recentForms);

      // Debug: Cek data mentah dari database
      if (recentForms && recentForms.length > 0) {
        console.log('✅ Data form ditemukan:', recentForms);
        recentForms.forEach((form, index) => {
          console.log(`   Form ${index + 1}:`, {
            korban: form.korban,
            status: form.status,
            template: form.template,
            createdAt: form.createdAt
          });
        });
      } else {
        console.log('❌ Tidak ada data form dengan status terkirim');
        
        // Coba query tanpa filter status untuk debug
        const { data: allForms } = await supabase
          .from('dataform')
          .select('id, korban, template, status, createdAt')
          .order('createdAt', { ascending: false })
          .limit(5);
        
        console.log('🔍 Semua data form (tanpa filter):', allForms);
        
        if (allForms && allForms.length > 0) {
          console.log('📊 Status yang ada di database:');
          allForms.forEach(form => {
            console.log(`   - ${form.korban}: ${form.status}`);
          });
        }
      }

      const formattedForms = recentForms?.map(form => {
        const formatted = {
          nama: form.korban || 'Tanpa Nama',
          jenis: form.template === 'kunjungan_rs' ? 'Kunjungan RS' : 
                form.template === 'survei_md' ? 'Survey MD' : 
                form.template === 'survei_ll' ? 'Survey LL' : 'Form',
          tanggal: new Date(form.createdAt).toLocaleDateString('id-ID'),
          status: 'Terkirim'
        };
        console.log('📝 Formatted form:', formatted);
        return formatted;
      }) || [];

      console.log('🎯 Final dataForm state:', formattedForms);
      setDataForm(formattedForms);

      setDataForm(recentForms?.map(form => ({
        nama: form.korban || 'Tanpa Nama',
        jenis: form.template === 'kunjungan_rs' ? 'Kunjungan RS' : 
               form.template === 'survei_md' ? 'Survey MD' : 
               form.template === 'survei_ll' ? 'Survey LL' : 'Form',
        tanggal: new Date(form.createdAt).toLocaleDateString('id-ID'),
        status: 'Terkirim'
      })) || []);

      // 4. Data ahli waris (contoh dari tabel form_survei_aw)
      const { data: ahliWarisData } = await supabase
        .from('form_survei_aw')
        .select('nama_korban, jenis_kelamin, nama_ahli_waris, alamat_korban')
        .limit(5);

      setDataAhliWaris(ahliWarisData?.map(item => ({
        korban: item.nama_korban || 'Tidak ada data',
        gender: item.jenis_kelamin === 'L' ? 'Laki-laki' : 
                item.jenis_kelamin === 'P' ? 'Perempuan' : 'Tidak diketahui',
        ahli: item.nama_ahli_waris || 'Tidak ada data',
        lokasi: item.alamat_korban || 'Tidak ada data',
        santunan: Math.floor(Math.random() * 5000000) + 5000000 // Mock data
      })) || []);

      // 5. Data PKS dan hitung yang expired/akan expired
      const { data: pksData } = await supabase
        .from('datapks')
        .select('*')
        .order('tgl_akhir', { ascending: true })
        .limit(10);

      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      let expiredCount = 0;
      let expiringSoonCount = 0;
      let activeCount = 0;

      const processedPksData = pksData?.map(pks => {
        try {
          const endDate = new Date(pks.tgl_akhir);
          
          // Validasi tanggal
          if (isNaN(endDate.getTime())) {
            console.warn('Invalid date for PKS:', pks.id, pks.tgl_akhir);
            return null;
          }
          
          const daysLeft = daysUntilExpiry(pks.tgl_akhir);
          
          console.log(`PKS ${pks.nama_rs}: ${pks.tgl_akhir} -> ${daysLeft} hari`); // Debug log
          
          // Jika daysLeft NaN, skip perhitungan
          if (isNaN(daysLeft)) {
            return null;
          }
          
          let status = 'active';
          if (daysLeft <= 0) {
            expiredCount++;
            status = 'expired';
          } else if (daysLeft <= 30) {
            expiringSoonCount++;
            status = 'expiring-soon';
          } else {
            activeCount++;
            status = 'active';
          }

          return {
            id: pks.id,
            rs: pks.nama_rs,
            wilayah: pks.wilayah,
            masa_berlaku: pks.masa_berlaku,
            awal: new Date(pks.tgl_awal).toLocaleDateString('id-ID'),
            akhir: new Date(pks.tgl_akhir).toLocaleDateString('id-ID'),
            no_perjanjian_rs: pks.no_perjanjian_rs,
            no_perjanjian_jr: pks.no_perjanjian_jr,
            daysLeft: daysLeft,
            status: status
          };
        } catch (error) {
          console.error('Error processing PKS data:', error, pks);
          return null;
        }
      }).filter(Boolean) || []; // Filter out null values

      console.log('Processed PKS data:', processedPksData); // Debug log

      setDataPKS(processedPksData);
      setPksExpiring({ 
        expired: expiredCount, 
        expiringSoon: expiringSoonCount,
        active: activeCount 
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setTrend({
        values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
      });
    } finally {
      setLoading(false);
    }
  };

  const pct = useMemo(() => ({
    selesai: summary.total > 0 ? Math.round((summary.selesai / summary.total) * 100) : 0,
    progress: summary.total > 0 ? Math.round((summary.progress / summary.total) * 100) : 0,
    pending: summary.total > 0 ? Math.round((summary.pending / summary.total) * 100) : 0,
  }), [summary]);

  return (
    <div className="dashx">
      {/* HEAD */}
      <header className="dashx-head">
        <div>
          <h1>Home (Dashboard Analitik)</h1>
          <p className="muted">
            Hai <b>{user?.name || "Admin"}</b>, berikut ringkasan data real-time dari sistem.
          </p>
        </div>

        <div className="head-actions">
          <select className="select">
            <option>Periode: 30 hari</option>
            <option>Periode: 90 hari</option>
            <option>Periode: 1 tahun</option>
          </select>
          <button className="btn-export" onClick={fetchDashboardData}>
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* KPI CARDS */}
      <section className="dashx-cards">
        <StatCard 
          label="Total Pengajuan" 
          value={summary.total} 
          loading={loading}
        />
        <StatCard 
          label="Selesai" 
          value={summary.selesai} 
          color="green" 
          percent={pct.selesai}
          loading={loading}
        />
        <StatCard 
          label="Progress" 
          value={summary.progress} 
          color="blue" 
          percent={pct.progress}
          loading={loading}
        />
        <StatCard 
          label="Pending" 
          value={summary.pending} 
          color="red" 
          percent={pct.pending}
          loading={loading}
        />
      </section>

      {/* CHART & RINGKASAN */}
      <section className="dashx-grid">
        <article className="card">
          <div className="card-title">Trend Pengajuan Form (12 Hari Terakhir)</div>
          {loading ? (
            <div className="skeleton-chart">
              <div className="skeleton-bar"></div>
              <div className="skeleton-bar"></div>
              <div className="skeleton-bar"></div>
              <div className="skeleton-bar"></div>
            </div>
          ) : (
            <>
              <Sparkline 
                values={Array.isArray(trend?.values) ? trend.values : []} 
                labels={Array.isArray(trend?.labels) ? trend.labels : []} 
              />
              <div className="legend">
                <span className="dot pink" /> 
                Total: {Array.isArray(trend?.values) ? trend.values.reduce((a, b) => a + b, 0) : 0} pengajuan dalam 12 hari
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card-title">Ringkasan Status</div>
          {loading ? (
            <div className="skeleton-content">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton-barlist">
                  <div className="skeleton-text"></div>
                  <div className="skeleton-bar"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
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
              <div style={{ marginTop: '16px', padding: '12px', background: '#fff9fd', borderRadius: '8px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#b13a77' }}>
                  📊 Data PKS
                </p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                  <span style={{ color: '#a30f2d' }}>⛔ Expired: {pksExpiring.expired}</span>
                  <span style={{ color: '#d79300' }}>⚠️ Akan Expired: {pksExpiring.expiringSoon}</span>
                </div>
              </div>
            </>
          )}
        </article>
      </section>

      {/* DATA FORM */}
      <SectionCard 
        title="Data Form Terbaru" 
        onSeeAll={() => navigate("/dataform")}
        loading={loading}
      >
        {!loading && (
          <>
            {dataForm.length > 0 ? (
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
                      <td>
                        <span className={`status-badge ${row.status.toLowerCase()}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px', 
                color: '#7a6b7d',
                background: '#fff9fd',
                borderRadius: '8px',
                border: '2px dashed #ffd7ea'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
                <p style={{ margin: 0, fontWeight: '600' }}>Tidak ada data form terbaru</p>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                  Belum ada pengajuan form dengan status "terkirim"
                </p>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* DATA AHLI WARIS */}
      <SectionCard 
        title="Data Ahli Waris" 
        onSeeAll={() => navigate("/data-waris")}
        loading={loading}
      >
        {!loading && (
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
        )}
      </SectionCard>

      {/* DATA PKS */}
      <SectionCard 
        title="Data PKS" 
        onSeeAll={() => navigate("/datapks")}
        loading={loading}
      >
        {!loading && (
          <table className="nice-table">
            <thead>
              <tr>
                <th>Rumah Sakit</th>
                <th>Wilayah</th>
                <th>Tanggal Awal</th>
                <th>Tanggal Akhir</th>
                <th>Sisa Hari</th>
              </tr>
            </thead>
            <tbody>
              {dataPKS.map((row, i) => (
                <tr key={i}>
                  <td>{row.rs}</td>
                  <td>{row.wilayah}</td>
                  <td>{row.awal}</td>
                  <td>
                    <span className={row.daysLeft <= 0 ? 'expired' : row.daysLeft <= 30 ? 'expiring-soon' : ''}>
                      {row.akhir}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${row.status}`}>
                      {isNaN(row.daysLeft) ? 'ERROR' : 
                      row.status === 'expired' ? 'EXPIRED' : 
                      row.status === 'expiring-soon' ? `${row.daysLeft} HARI` : 
                      'AKTIF'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Tambahkan CSS untuk styling */}
      <style>{`
        .loading .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
        }
        
        .skeleton-text {
          height: 12px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 8px;
        }
        
        .skeleton-chart {
          display: flex;
          align-items: end;
          gap: 8px;
          height: 120px;
          padding: 20px 0;
        }
        
        .skeleton-bar {
          flex: 1;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px 4px 0 0;
          min-height: 20px;
        }
        
        .skeleton-barlist {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .skeleton-row {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .skeleton-content .skeleton-text {
          flex: 1;
        }
        
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        
        .status-badge.selesai {
          background: #e8f5e8;
          color: #0f7a4c;
        }
        
        .status-badge.progress {
          background: #e8f0ff;
          color: #1b5fb3;
        }
        
        .status-badge.pending {
          background: #fff0f0;
          color: #a30f2d;
        }
        
        .status-badge.expired {
          background: #fff0f0;
          color: #a30f2d;
        }
        
        .status-badge.expiring-soon {
          background: #fff9e8;
          color: #d79300;
        }
        
        .status-badge.active {
          background: #e8f5e8;
          color: #0f7a4c;
        }
        
        .expired {
          color: #a30f2d;
          font-weight: 600;
        }
        
        .expiring-soon {
          color: #d79300;
          font-weight: 600;
        }
        
        .status-badge.terkirim {
          background: #fff0f6;
          color: #b13a77;
          border: 1px solid #ffb6d6;
        }

        .status-badge.diproses {
          background: #e8f0ff;
          color: #1b5fb3;
          border: 1px solid #a3c4ff;
        }

        .status-badge.selesai {
          background: #e8f5e8;
          color: #0f7a4c;
          border: 1px solid #a3d9a3;
        }

        .status-badge.ditolak {
          background: #fff0f0;
          color: #a30f2d;
          border: 1px solid #ffb8b8;
        }

        .spark {
          border-radius: 8px;
        }

        .legend {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 12px;
          color: #7a6b7d;
        }

        .dot.pink {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff5277;
          display: inline-block;
        }

        .skeleton-chart {
          display: flex;
          align-items: end;
          gap: 6px;
          height: 120px;
          padding: 20px 0;
        }

        .skeleton-bar {
          flex: 1;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 4px 4px 0 0;
          min-height: 20px;
        }
      `}</style>
    </div>
  );
}