// src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getToken, clearToken } from "../services/api";

/**
 * ProtectedRoute (WELI)
 * - mode: "admin" | "apoderado"
 * - roleIn: [1,2,3] (solo aplica a mode="admin")
 *
 * Reglas:
 * - Token requerido
 * - exp con margen 30s
 * - Apoderado: token debe ser type="apoderado"
 * - Admin/panel: token NO debe ser type="apoderado"
 * - roleIn: valida rol si se especifica, SIN borrar sesión (solo redirige)
 * - UX: rol 1/2 no pueden entrar a /super-dashboard/*
 * - SUPERADMIN (rol 3): si entra a rutas tenantizadas y no hay academia seleccionada => /super-dashboard
 */

const ADMIN_HOME = "/admin";
const SUPER_HOME = "/super-dashboard";
const APODERADO_HOME = "/portal-apoderado";
const APODERADO_CHANGE = "/portal-apoderado/cambiar-clave";

const ACADEMIA_STORAGE_KEY = "weli_selected_academia";

function safePathname(pathname) {
  const p = String(pathname || "");
  return p.startsWith("/") ? p : "/";
}

function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isExpired(decoded, skewSeconds = 30) {
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(decoded?.exp ?? 0);
  return exp > 0 && now >= exp - skewSeconds;
}

function getType(decoded) {
  const raw = String(decoded?.type ?? decoded?.user_type ?? "").toLowerCase().trim();
  // default tolerante: si no viene type, asumimos panel (admin/staff/superadmin)
  return raw || "panel";
}

function getRol(decoded) {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function hasSelectedAcademia() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);
    const id = Number(p?.id ?? 0);
    return Number.isFinite(id) && id > 0;
  } catch {
    return false;
  }
}

// Rutas que NO requieren academia aunque sean rol 3
function isNonTenantPath(pathname) {
  const p = safePathname(pathname);

  // públicas o no tenantizadas del panel/superadmin
  if (p === SUPER_HOME || p.startsWith(`${SUPER_HOME}/`)) return true;

  // login / logout / docs etc (por si acaso pasan por ProtectedRoute)
  if (p === "/login" || p === "/login-apoderado") return true;

  // si tienes panel admin raíz /admin, dejamos pasar (allí se muestran cards, no pega a tenant necesariamente)
  if (p === ADMIN_HOME || p.startsWith(`${ADMIN_HOME}/dashboard`)) return true;

  return false;
}

/**
 * Tenantizado: todo lo "operativo" del panel que depende de x-academia-id.
 * Ajusta prefijos si cambian tus rutas.
 */
function isTenantizedPanelPath(pathname) {
  const p = safePathname(pathname);

  // Cualquier ruta bajo /admin/* que no sea raíz, normalmente hace llamadas tenantizadas
  // (listar jugadores, pagos, agenda, etc.)
  if (p.startsWith(`${ADMIN_HOME}/`)) {
    // Excepciones: cosas globales del panel que no dependen de academia (si las tienes)
    // Ej: /admin/usuarios (si es global) => aquí DECIDES si requiere academia o no.
    // Para WELI multi-tenant, lo habitual: usuarios globales solo rol 1/3; puede ser no-tenant.
    // Por seguridad, marcamos tenantizado TODO lo operativo (jugadores/pagos/agenda/etc).
    const nonTenantAdminRoutes = new Set([
      `${ADMIN_HOME}`, // ya cubierto
      `${ADMIN_HOME}/crear-usuario`,
      `${ADMIN_HOME}/usuarios`,
    ]);
    if (nonTenantAdminRoutes.has(p)) return false;

    return true;
  }

  return false;
}

export default function ProtectedRoute({ children, roleIn = [], mode = "admin" }) {
  const location = useLocation();
  const pathname = safePathname(location?.pathname);

  const token = getToken?.() || "";

  const toLoginAdmin = (
    <Navigate to="/login" replace state={{ from: pathname || ADMIN_HOME }} />
  );

  const toLoginApoderado = (
    <Navigate to="/login-apoderado" replace state={{ from: pathname || APODERADO_HOME }} />
  );

  const safeClear = () => {
    try {
      clearToken?.();
    } catch {}
    try {
      localStorage.removeItem("user_info");
      localStorage.removeItem("apoderado_must_change_password");
      // NO borramos weli_selected_academia aquí: es selección, no credencial.
    } catch {}
  };

  const renderOk = () => (children ? children : <Outlet />);

  // 0) No token
  if (!token) return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;

  // 1) Decodificar token
  const decoded = decodeToken(token);
  if (!decoded) {
    safeClear();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }

  // 2) Expiración
  if (isExpired(decoded, 30)) {
    safeClear();
    return mode === "apoderado" ? toLoginApoderado : toLoginAdmin;
  }

  const type = getType(decoded);
  const rol = getRol(decoded);

  /* -------------------- MODO APODERADO -------------------- */
  if (mode === "apoderado") {
    if (type !== "apoderado") {
      // token del panel en portal apoderado => no lo borramos por agresión,
      // pero si quieres 100% separación, sí se borra.
      safeClear();
      return toLoginApoderado;
    }

    let mustChange = false;
    try {
      mustChange = localStorage.getItem("apoderado_must_change_password") === "1";
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

  /* -------------------- MODO ADMIN / PANEL -------------------- */
  // token apoderado intentando entrar al panel
  if (type === "apoderado") {
    safeClear();
    return toLoginAdmin;
  }

  // rol inválido => aquí NO hacemos “limpia por pánico” si el token existe:
  // pero si rol viene 0, es un token mal emitido. Se limpia.
  if (!rol || rol <= 0) {
    safeClear();
    return toLoginAdmin;
  }

  // UX: rol 1/2 intentando /super-dashboard => mandarlo a /admin (SIN borrar token)
  const wantsSuper = pathname === SUPER_HOME || pathname.startsWith(`${SUPER_HOME}/`);
  if (rol !== 3 && wantsSuper) return <Navigate to={ADMIN_HOME} replace />;

  // ✅ Rol 3: si intenta entrar a panel tenantizado sin academia seleccionada => /super-dashboard
  if (rol === 3) {
    const needsAcademia = isTenantizedPanelPath(pathname) && !isNonTenantPath(pathname);
    if (needsAcademia && !hasSelectedAcademia()) {
      return <Navigate to={SUPER_HOME} replace />;
    }
  }

  // roleIn: si la ruta exige roles, redirige a home correcta SIN borrar token
  if (Array.isArray(roleIn) && roleIn.length > 0 && !roleIn.includes(rol)) {
    return <Navigate to={rol === 3 ? SUPER_HOME : ADMIN_HOME} replace />;
  }

  return renderOk();
}
