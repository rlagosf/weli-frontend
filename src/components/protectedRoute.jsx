// src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getToken, clearToken } from "../services/api";

/**
 * ProtectedRoute
 * - mode: "admin" | "apoderado"
 * - roleIn: [1,2,3] etc. (solo aplica a mode="admin")
 *
 * Reglas:
 * - Token requerido
 * - exp con margen 30s
 * - En apoderado: token debe ser type="apoderado"
 * - En admin: token NO debe ser apoderado (panel)
 * - roleIn: valida rol si se especifica, SIN borrar sesión (solo redirige)
 * - UX: rol 1/2 no pueden entrar a /super-dashboard/*
 */
export default function ProtectedRoute({ children, roleIn = [], mode = "admin" }) {
  const location = useLocation();
  const token = getToken?.() || "";

  const adminHome = "/admin";
  const superDashboard = "/super-dashboard";
  const apoderadoHome = "/portal-apoderado";
  const apoderadoChange = "/portal-apoderado/cambiar-clave";

  const toLoginAdmin = (
    <Navigate to="/login" replace state={{ from: location.pathname || adminHome }} />
  );

  const toLoginApoderado = (
    <Navigate
      to="/login-apoderado"
      replace
      state={{ from: location.pathname || apoderadoHome }}
    />
  );

  const safeClear = () => {
    try { clearToken?.(); } catch {}
    try {
      localStorage.removeItem("user_info");
      localStorage.removeItem("apoderado_must_change_password");
    } catch {}
  };

  const renderOk = () => (children ? children : <Outlet />);

  if (!token) return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;

  try {
    const decoded = jwtDecode(token);
    const now = Math.floor(Date.now() / 1000);

    // Token vencido (margen 30s)
    if (decoded?.exp && now >= decoded.exp - 30) {
      safeClear();
      return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
    }

    const rawType = String(decoded?.type ?? decoded?.user_type ?? "").toLowerCase();
    const type = rawType || "panel"; // tolerante
    const path = String(location.pathname || "");

    /* -------------------- MODO APODERADO -------------------- */
    if (mode === "apoderado") {
      if (type !== "apoderado") {
        safeClear();
        return toLoginApoderado;
      }

      let mustChange = false;
      try {
        mustChange = localStorage.getItem("apoderado_must_change_password") === "1";
      } catch {}

      const isInsidePortal = path.startsWith(apoderadoHome);
      const isChangeRoute = path.startsWith(apoderadoChange);

      if (isInsidePortal && mustChange && !isChangeRoute) {
        return <Navigate to={apoderadoChange} replace />;
      }

      if (isInsidePortal && !mustChange && isChangeRoute) {
        return <Navigate to={apoderadoHome} replace />;
      }

      return renderOk();
    }

    /* -------------------- MODO ADMIN/PANEL -------------------- */
    if (type === "apoderado") {
      safeClear();
      return toLoginAdmin;
    }

    const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
    const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : null;

    if (rol == null) {
      safeClear();
      return toLoginAdmin;
    }

    // UX: si rol 1/2 intenta entrar a /super-dashboard/* => lo mandamos a /admin
    const wantsSuper = path === superDashboard || path.startsWith(`${superDashboard}/`);
    if (rol !== 3 && wantsSuper) return <Navigate to={adminHome} replace />;

    // roleIn: si la ruta exige roles, redirige a home correcta SIN borrar token
    if (Array.isArray(roleIn) && roleIn.length > 0 && !roleIn.includes(rol)) {
      return <Navigate to={rol === 3 ? superDashboard : adminHome} replace />;
    }

    return renderOk();
  } catch {
    safeClear();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }
}
