// src/components/ProtectedRoute.jsx

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../services/api";

const ADMIN_HOME = "/admin";
const SUPER_HOME = "/super-dashboard";
const APODERADO_HOME = "/portal-apoderado";
const APODERADO_CHANGE = "/portal-apoderado/cambiar-clave";

const USER_INFO_KEY = "weli_user_info";
const PANEL_ROLES = new Set([1, 2, 3]);
const PANEL_TYPES = new Set(["admin", "user", "staff", "superadmin"]);

/* ───────────────────────── Helpers ───────────────────────── */

function safePathname(pathname) {
  const path = String(pathname || "").trim();

  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/";
  }

  return path;
}

function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isExpired(decoded, skewSeconds = 30) {
  const exp = Number(decoded?.exp ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(exp) || exp <= 0) return true;

  return now >= exp - skewSeconds;
}

function getType(decoded) {
  return String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();
}

function getRol(decoded) {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && PANEL_ROLES.has(rol) ? rol : 0;
}

function getAcademiaId(decoded) {
  const academiaId = Number(
    decoded?.academia_id ??
    decoded?.user?.academia_id ??
    0
  );

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

function hasSelectedAcademia() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return false;

    /*
     * Formato simple:
     * "2"
     */
    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return true;
    }

    /*
     * Formato snapshot:
     * { id: 2, nombre: "...", ... }
     */
    const parsed = JSON.parse(raw);
    const academiaId = Number(parsed?.id ?? parsed?.academia_id ?? 0);

    return Number.isInteger(academiaId) && academiaId > 0;
  } catch {
    return false;
  }
}

function safeClearSession() {
  try {
    clearToken();
  } catch {}

  try {
    localStorage.removeItem(USER_INFO_KEY);
    localStorage.removeItem("apoderado_must_change_password");
  } catch {}

  /*
   * Deliberadamente NO eliminamos weli_selected_academia.
   *
   * Esa clave representa una selección de tenant del Superadmin,
   * no una credencial.
   */
}

/* ───────────────────────── Tenant routes ───────────────────────── */

/**
 * Rutas que un Superadmin puede visitar
 * sin seleccionar previamente una academia.
 */
function isNonTenantPath(pathname) {
  const path = safePathname(pathname);

  if (path === SUPER_HOME || path.startsWith(`${SUPER_HOME}/`)) {
    return true;
  }

  if (path === "/login" || path === "/login-apoderado") {
    return true;
  }

  /*
   * /admin y dashboard pueden actuar como entrada general
   * sin exigir todavía un tenant.
   */
  if (path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/dashboard`)) {
    return true;
  }

  return false;
}

/**
 * Rutas operativas que dependen de una academia efectiva.
 *
 * Para Admin/Staff la academia sale del JWT.
 * Para Superadmin proviene de weli_selected_academia
 * y api.js la transforma en x-academia-id.
 */
function isTenantizedPanelPath(pathname) {
  const path = safePathname(pathname);

  if (!path.startsWith(`${ADMIN_HOME}/`)) {
    return false;
  }

  const nonTenantAdminRoutes = new Set([
    ADMIN_HOME,
    `${ADMIN_HOME}/crear-usuario`,
    `${ADMIN_HOME}/usuarios`,
  ]);

  return !nonTenantAdminRoutes.has(path);
}

/* ───────────────────────── Component ───────────────────────── */

export default function ProtectedRoute({ children, roleIn = [], mode = "admin" }) {
  const location = useLocation();
  const pathname = safePathname(location?.pathname);

  const token = getToken() || "";

  const renderOk = () => children || <Outlet />;

  const toLoginAdmin = (
    <Navigate to="/login" replace state={{ from: pathname || ADMIN_HOME }} />
  );

  const toLoginApoderado = (
    <Navigate
      to="/login-apoderado"
      replace
      state={{ from: pathname || APODERADO_HOME }}
    />
  );

  /* ───────── 1. Token requerido ───────── */

  if (!token) {
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }

  /* ───────── 2. Token decodificable ───────── */

  const decoded = decodeToken(token);

  if (!decoded) {
    safeClearSession();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }

  /* ───────── 3. Expiración ───────── */

  if (isExpired(decoded, 30)) {
    safeClearSession();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }

  const type = getType(decoded);

  /* ───────────────────────── APODERADO ───────────────────────── */

  if (mode === "apoderado") {
    if (type !== "apoderado") {
      safeClearSession();
      return toLoginApoderado;
    }

    let mustChange = false;

    try {
      mustChange =
        localStorage.getItem("apoderado_must_change_password") === "1";
    } catch {}

    const isInsidePortal = pathname.startsWith(APODERADO_HOME);
    const isChangeRoute = pathname.startsWith(APODERADO_CHANGE);

    if (isInsidePortal && mustChange && !isChangeRoute) {
      return <Navigate to={APODERADO_CHANGE} replace />;
    }

    if (isInsidePortal && !mustChange && isChangeRoute) {
      return <Navigate to={APODERADO_HOME} replace />;
    }

    return renderOk();
  }

  /* ───────────────────────── PANEL WELI ───────────────────────── */

  /*
   * Solo aceptamos explícitamente tipos pertenecientes
   * al panel WELI.
   *
   * Ya no existe fallback automático "panel".
   */
  if (!PANEL_TYPES.has(type)) {
    safeClearSession();
    return toLoginAdmin;
  }

  const rol = getRol(decoded);

  /*
   * Solo roles conocidos:
   * 1 Admin
   * 2 Staff
   * 3 Superadmin
   */
  if (!rol) {
    safeClearSession();
    return toLoginAdmin;
  }

  /* ───────── Admin / Staff ───────── */

  if (rol === 1 || rol === 2) {
    /*
     * La academia debe existir dentro del JWT firmado.
     *
     * NO se consulta weli_selected_academia para estos roles.
     */
    const academiaId = getAcademiaId(decoded);

    if (!academiaId) {
      safeClearSession();
      return toLoginAdmin;
    }
  }

  /* ───────── Super-dashboard ───────── */

  const wantsSuper =
    pathname === SUPER_HOME ||
    pathname.startsWith(`${SUPER_HOME}/`);

  /*
   * Admin y Staff no pueden entrar al espacio Superadmin.
   * No borramos sesión: simplemente los devolvemos a /admin.
   */
  if (rol !== 3 && wantsSuper) {
    return <Navigate to={ADMIN_HOME} replace />;
  }

  /* ───────── Tenant Superadmin ───────── */

  if (rol === 3) {
    const needsAcademia =
      isTenantizedPanelPath(pathname) &&
      !isNonTenantPath(pathname);

    /*
     * Superadmin necesita seleccionar academia antes de
     * acceder a funcionalidad tenantizada.
     */
    if (needsAcademia && !hasSelectedAcademia()) {
      return <Navigate to={SUPER_HOME} replace />;
    }
  }

  /* ───────── roleIn ───────── */

  if (Array.isArray(roleIn) && roleIn.length > 0) {
    const allowedRoles = roleIn
      .map(Number)
      .filter((role) => Number.isInteger(role) && PANEL_ROLES.has(role));

    if (!allowedRoles.includes(rol)) {
      const destination = rol === 3 ? SUPER_HOME : ADMIN_HOME;

      /*
       * Protección contra loop:
       *
       * Si la propia ruta HOME está configurada con un roleIn
       * incorrecto, no hacemos Navigate(destination) hacia sí misma
       * indefinidamente.
       */
      if (pathname === destination) {
        return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
      }

      return <Navigate to={destination} replace />;
    }
  }

  return renderOk();
}