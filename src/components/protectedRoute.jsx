// src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getToken, clearToken } from "../services/api";

/**
 * ProtectedRoute
 * - mode: "admin" | "apoderado"
 * - roleIn: [1,2] etc. (solo aplica a admin/staff)
 *
 * Seguridad:
 * - Token requerido
 * - exp estricto con margen
 * - type del token debe calzar con mode
 * - En caso de mismatch => limpia sesión y manda a login correspondiente
 * - No deja “pistas” tipo "redirigir apoderado a admin" (corta y fuera)
 */
export default function ProtectedRoute({ children, roleIn = [], mode = "admin" }) {
  const location = useLocation();
  const token = getToken();

  const adminHome = "/admin";
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
    // ✅ ÚNICO punto de verdad de sesión: api.js
    // (borra token + header Authorization)
    try {
      clearToken();
    } catch {}

    // ✅ Artefactos de UI / cache local
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

    // ✅ Token vencido (margen 30s)
    if (decoded?.exp && now >= decoded.exp - 30) {
      safeClear();
      return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
    }

    const type = String(decoded?.type ?? decoded?.user_type ?? "").toLowerCase();
    const path = String(location.pathname || "");

    /* ───────────────────────────────
       MODO APODERADO
    ─────────────────────────────── */
    if (mode === "apoderado") {
      // Debe ser token de apoderado
      if (type !== "apoderado") {
        safeClear();
        return toLoginApoderado;
      }

      // UX-only: si debe cambiar clave, lo restringimos a cambiar-clave
      // (backend igual debe proteger endpoints)
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

    /* ───────────────────────────────
       MODO ADMIN / STAFF
    ─────────────────────────────── */
    // Si es token apoderado intentando entrar al admin => fuera (no revelar rutas)
    if (type === "apoderado") {
      safeClear();
      return toLoginAdmin;
    }

    // Para admin/staff: extraemos rol
    const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
    const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : null;

    // Si el router exige roles y no cumple => login (o podrías mandar a /admin)
    if (roleIn.length > 0 && (rol == null || !roleIn.includes(rol))) {
      safeClear();
      return toLoginAdmin;
    }

    return renderOk();
  } catch {
    safeClear();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }
}
