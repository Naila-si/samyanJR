import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./sidebar.css";

const COLLAPSE_KEY = "sidebar-collapsed";

export default function SidebarLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);          
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  });
  const [hoverPeek, setHoverPeek] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed);
  }, [collapsed]);

  // buat toggle submenu Data Ahli Waris
  const [awOpen, setAwOpen] = useState(false);
  useEffect(() => {
    if (pathname.startsWith("/data-ahli-waris")) {
      setAwOpen(true);
    }
  }, [pathname]);

  return (
    <div
      className={`sidebar-layout
        ${open ? "is-open" : ""}
        ${collapsed ? "is-collapsed" : ""}
        ${hoverPeek ? "is-peek" : ""}
      `}
    >
      {/* SIDEBAR */}
      <aside className="sb-side">
        {/* Bagian atas */}
        <div className="sb-top">
          <div className="sb-brand">
            <img src="/logo.png" alt="JR" className="sb-logo" />
          </div>

          <button
            className="sb-collapse"
            onClick={() => setCollapsed(v => !v)}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Bagian Menu */}
        <div className="sb-sec">Menu</div>
        <nav className="sb-nav">
          <NavLink end to="/home" className="sb-link">
            <span className="ico">🏠</span>
            <span className="label">Overview</span>
            <span className="sb-tooltip">Overview</span>
          </NavLink>

          <NavLink end to="/datasw" className="sb-link">
            <span className="ico">📊</span>
            <span className="label">Data SW</span>
            <span className="sb-tooltip">Data SW</span>
          </NavLink>

          <NavLink end to="/dataform" className="sb-link">
            <span className="ico">📁</span>
            <span className="label">Data Form</span>
            <span className="sb-tooltip">Data Form</span>
          </NavLink>

          {/* Group Data Ahli Waris */}
          <div className={`sb-group ${awOpen ? "open" : ""}`}>
           <button
              type="button"
              className="sb-link sb-link-group"
              onClick={() => setAwOpen(o => !o)}
            >
              <span className="ico">👨‍👩‍👧</span>
              <span className="label">Data Ahli Waris</span>
              <span className="chev">{awOpen ? "▾" : "▸"}</span>
              <span className="sb-tooltip">Data Ahli Waris</span>
            </button>

            {awOpen && (
              <div className="sb-subnav">
                <NavLink end to="/data-ahli-waris" className="sb-sublink">
                  <span className="dot" /> <span>Peta & Heatmap</span>
                </NavLink>
                <NavLink end to="/data-waris" className="sb-sublink">
                  <span className="dot" /> <span>Tabel Data Waris</span>
                </NavLink>
              </div>
            )}
          </div>

         <NavLink end to="/datapks" className="sb-link">
           <span className="ico">🤝</span>
           <span className="label">Data PKS</span>
           <span className="sb-tooltip">Data PKS</span>
          </NavLink>
        </nav>

        {/* Bagian bawah - Akun */}
        <div className="sb-sep" />
        <div className="sb-sec">Akun</div>

        <div className="sb-user">
          <div className="sb-user-avatar">
            {(user?.name || "A").slice(0, 1).toUpperCase()}
          </div>
          <div className="sb-user-meta">
            <div className="sb-user-name">{user?.name || "Admin"}</div>
            <div className="sb-user-role">{user?.role || "Administrator"}</div>
          </div>
        </div>

        <button className="sb-logout" onClick={logout}>
          Logout
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <section className="sb-main">
        {/* Toggle untuk mobile */}
        <button
          className="sb-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>

        <div className="sb-container">
          <Outlet />
        </div>
      </section>

      {/* Overlay untuk mobile */}
      {open && <div className="sb-overlay" onClick={() => setOpen(false)} />}
    </div>
  );
}
