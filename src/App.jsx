// src/App.jsx
import { Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";

import SpaHero from "./components/SpaHero.jsx";
import Home from "./pages/Home.jsx";

import FormPage from "./pages/pages/FormPage.jsx";
import DataForm from "./pages/DataForm.jsx";
import StatusProses from "./pages/StatusProses.jsx";
import DokumenPage from "./pages/DokumenPage.jsx";
import Registrasi from "./pages/Registrasi.jsx";
import PrivateRoute from "./auth/PrivateRoute";
import SidebarLayout from "./layouts/SidebarLayout.jsx";
import DataPks from "./pages/DataPks.jsx";
import DataAhliWaris from "./pages/DataAhliWaris.jsx";
import DataWaris from "./pages/DataWaris.jsx";
import DataSW from "./pages/DataSW.jsx";
import VerifikatorDashboard from "./pages/VerifikatorDashboard.jsx";
import Verifikator from "./pages/Verifikator.jsx";

export default function App() {
  const loc = useLocation();

  const HIDE_ON = ["/home", "/dataform", "/datapks", "/data-ahli-waris", "/data-waris", "/verifikator", "/datasw"];
  const showNavbar = !HIDE_ON.some((p) => loc.pathname.startsWith(p));

  return (
    <div className="app">
      {showNavbar && (
        <header className="navbar">
          <div className="nav-left">
            <img src="/logo.png" alt="Jasa Raharja" className="logo" />
          </div>

          <nav className="nav-links">
            <NavLink to="/" end className="nav-link">Dashboard</NavLink>
            {/* <NavLink to="/dokumen" end className="nav-link">Dokumen</NavLink> */}
            <NavLink to="/form" end className="nav-link">Form</NavLink>
            <NavLink to="/status" className="nav-link">Status Proses</NavLink>
          </nav>

          <NavLink to="/registrasi" className="btn-registrasi">Registrasi</NavLink>
        </header>
      )}

      <main>
        <Routes>
          {/* ===== Halaman publik (navbar tampil) ===== */}
          <Route path="/" element={<SpaHero />} />
          <Route path="/form" element={<FormPage />} />
          <Route path="/registrasi" element={<Registrasi />} />
          <Route path="/dokumen" element={<DokumenPage/>} />

          {/* Status publik: dukung tanpa dan dengan :requestId */}
          <Route path="/status" element={<StatusProses />} />
          <Route path="/statusproses/:requestId" element={<StatusProses />} />

          {/* ===== Halaman internal (wajib login) + sidebar ===== */}
          <Route element={<PrivateRoute roles={["admin-registrasi", "admin-verifikator"]} />}>
            <Route element={<SidebarLayout />}>
              <Route path="/home" element={<Home />} />

              {/* DataForm internal: dukung /dataform dan /dataform/:requestId */}
              <Route path="/dataform" element={<DataForm />} />
              <Route path="/dataform/:requestId" element={<DataForm />} />

              <Route path="/datapks" element={<DataPks />} />
              <Route path="/data-ahli-waris" element={<DataAhliWaris />} />
              <Route path="/data-waris" element={<DataWaris />} />
              <Route path="/datasw" element={<DataSW />} />
            </Route>
          </Route>

          {/* ===== Halaman khusus role: admin-verifikator ===== */}
          <Route element={<PrivateRoute roles="admin-verifikator" />}>
            {/* Dashboard verifikator: dukung dengan dan tanpa :requestId */}
            <Route path="/verifikator" element={<VerifikatorDashboard />} />
            <Route path="/verifikator/:requestId" element={<VerifikatorDashboard />} />
            {/* Halaman kerja detail berkas (opsional, jika pakai id) */}
            <Route path="/verifikator/berkas" element={<Verifikator />} />
            <Route path="/verifikator/berkas/:requestId" element={<Verifikator />} />
          </Route>

          {/* Unauthorized & Fallback */}
          <Route path="/unauthorized" element={<div style={{ padding: 24 }}>Tidak berwenang</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
