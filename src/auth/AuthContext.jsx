// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";

/** Demo users (ganti nanti pakai API) */
const USERS = [
  { email: "registrasi@samyan.id", password: "reg2025!", role: "admin-registrasi", name: "Admin Registrasi" },
  { email: "verifikator@samyan.id", password: "ver2025!", role: "admin-verifikator", name: "Admin Verifikator" },
];

const LS_KEY = "spa_admin";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Hydrate session dari storage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY);
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem(LS_KEY);
        sessionStorage.removeItem(LS_KEY);
      }
    }
  }, []);

  // Sinkron antar tab (kalau logout/login di tab lain)
  useEffect(() => {
    function onStorage(e) {
      if (e.key === LS_KEY) {
        const payload = e.newValue;
        if (!payload) {
          setUser(null);
        } else {
          try {
            setUser(JSON.parse(payload));
          } catch {
            setUser(null);
          }
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function login({ email, password, remember }) {
    // DEMO: verifikasi lokal
    const found = USERS.find((u) => u.email === email && u.password === password);
    if (!found) return { ok: false, message: "Email atau password salah." };

    const { password: _p, ...publicUser } = found;
    setUser(publicUser);

    const payload = JSON.stringify(publicUser);
    if (remember) {
      localStorage.setItem(LS_KEY, payload);
      sessionStorage.removeItem(LS_KEY);
    } else {
      sessionStorage.setItem(LS_KEY, payload);
      localStorage.removeItem(LS_KEY);
    }

    return { ok: true, user: publicUser };
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(LS_KEY);
  }

  const hasRole = (...roles) => !!user && roles.includes(user.role);
  const isAuthenticated = !!user;

  const value = useMemo(
    () => ({ user, isAuthenticated, login, logout, hasRole }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
