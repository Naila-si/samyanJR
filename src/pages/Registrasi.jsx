import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const DEMO = {
  reg: { email: "registrasi@samyan.id", password: "reg2025!" },
  ver: { email: "verifikator@samyan.id", password: "ver2025!" },
};

export default function Registrasi() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rolePick, setRolePick] = useState("");

  const fillDemo = (which) => {
    // setRolePick(which);
    // const { email, password } = DEMO[which];
    // setForm((s) => ({ ...s, email, password }));
  };

  // --- NEW: tentukan landing page per role
  function defaultRouteFor(role) {
    if (role === "admin-verifikator") return "/verifikator";          // dashboard verifikator
    if (role === "admin-registrasi") return "/home";     // dashboard registrasi (kalau ada)
    return "/home";
  }

  // --- NEW: hanya pakai state.from kalau cocok dengan role yang login
  function resolveRedirect(fromPath, role) {
    if (!fromPath) return defaultRouteFor(role);

    if (role === "admin-verifikator") {
      if (fromPath.startsWith("/verifikator")) return fromPath;
      return defaultRouteFor(role);
    }

    if (role === "admin-registrasi") {
      if (
        fromPath.startsWith("/registrasi-admin") ||
        fromPath.startsWith("/home") ||
        fromPath.startsWith("/dataform") ||
        fromPath.startsWith("/datapks") ||
        fromPath.startsWith("/data-ahli-waris") ||
        fromPath.startsWith("/data-waris")
      ) {
        return fromPath;
      }
      return defaultRouteFor(role);
    }

    return defaultRouteFor(role);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await login(form);
      if (!res?.ok) {
        setErr(res?.message || "Gagal login.");
        return;
      }

      // --- NEW: redirect sesuai role
      const role = res.user?.role;
      const from = loc.state?.from?.pathname;
      const target = resolveRedirect(from, role);
      nav(target, { replace: true });

    } catch (e2) {
      console.error("Login failed:", e2);
      setErr(e2?.message || "Gagal login.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page pink-bg">
      <div className="login-card">
        {/* LEFT / ASIDE */}
        <aside className="login-aside">
          <h1 className="login-title">Login Admin</h1>
          <p className="muted">
            Masuk sebagai <b>Admin Registrasi</b> atau <b>Admin Verifikator</b> untuk
            mengelola berkas dan proses VERINA.
          </p>

          <div className="role-chips">
            <button
              type="button"
              className={`role-chip ${rolePick === "reg" ? "active" : ""}`}
              onClick={() => fillDemo("reg")}
              title="Isi otomatis akun demo Admin Registrasi"
            >
              Admin Registrasi
            </button>
            <button
              type="button"
              className={`role-chip ${rolePick === "ver" ? "active" : ""}`}
              onClick={() => fillDemo("ver")}
              title="Isi otomatis akun demo Admin Verifikator"
            >
              Admin Verifikator
            </button>
          </div>

          <ul className="login-points">
            <li>Keamanan akun.</li>
            <li>Akses berbeda sesuai peran (registrasi / verifikasi).</li>
            {/* <li>UI cepat, ringan, dan responsif.</li> */}
          </ul>
        </aside>

        {/* RIGHT / FORM */}
        <form className="login-form" onSubmit={onSubmit} noValidate>
          {err && <div className="alert">{err}</div>}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="Ketik email kamu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label>Password</label>
            <div className="input-pass">
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-pass"
                onClick={() => setShowPass((v) => !v)}
                aria-label="Tampilkan/Sembunyikan password"
                title={showPass ? "Sembunyikan" : "Tampilkan"}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <label className="remember">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={(e) => setForm({ ...form, remember: e.target.checked })}
            />
            <span>Ingat saya di perangkat ini</span>
          </label>

          <button type="submit" className="btn-primary btn-large" disabled={submitting}>
            {submitting ? "Memproses..." : "Masuk"}
          </button>

          {/* <div className="help muted small">
            Tips: klik chip peran di kiri untuk mengisi email & password demo otomatis.
          </div> */}
        </form>
      </div>
    </div>
  );
}
