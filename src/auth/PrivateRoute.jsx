import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Pakai: <Route element={<PrivateRoute roles={['admin-verifikator']} />}> ... */
export default function PrivateRoute({ roles }) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user) return <Navigate to="/registrasi" replace state={{ from: loc }} />;

  if (roles) {
    const allowList = Array.isArray(roles) ? roles : [roles];
    if (!allowList.includes(user.role)) {
      // Role tidak diizinkan -> unauthorized
      return <Navigate to={redirectTo} replace state={{ from: loc }} />;
    }
  }
  return <Outlet />;
}
