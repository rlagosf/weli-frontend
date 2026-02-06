// src/services/api.js
import axios from "axios";

export const TOKEN_KEY = "weli_token";
export const ACADEMIA_STORAGE_KEY = "weli_selected_academia";
export const ACADEMIA_HEADER = "x-academia-id";

/* -------------------- Base URL (determinista) -------------------- */
const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url =
    (typeof envUrl === "string" && envUrl.trim()) || "http://127.0.0.1:8000";

  url = url.trim();
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (url.endsWith("/")) url = url.slice(0, -1);

  // Normaliza a /api (tu backend expone rutas bajo /api en la práctica)
  if (!/\/api$/i.test(url)) url = `${url}/api`;

  if (import.meta.env.PROD && /(localhost|127\.0\.0\.1)/i.test(url)) {
    console.warn("[WELI] VITE_API_BASE_URL en producción apunta a localhost.");
  }

  return url;
};

export const API_BASE_URL = pickBaseUrl();

/* -------------------- Token helpers -------------------- */
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  delete apiPrivate.defaults.headers.common.Authorization;
};

export const setToken = (token) => {
  if (token && typeof token === "string") {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    apiPrivate.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
};

/* -------------------- Academia helpers -------------------- */
function readSelectedAcademiaId() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return 0;

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/**
 * Decodifica payload JWT (base64url) robusto (soporta UTF-8).
 * NOTA: esto NO valida firma; es solo para extraer claims livianos (rol_id).
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const b64url = parts[1];
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);

    // atob -> bytes -> utf8
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);

    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractRolFromToken(token) {
  const p = decodeJwtPayload(token);
  const raw = p?.rol_id ?? p?.role_id ?? p?.role ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decide si se debe enviar x-academia-id según URL.
 * Regla: SOLO endpoints "tenantizados" del panel. Nunca auth ni portal apoderado.
 */
function shouldSendAcademiaHeader(url = "") {
  const u = String(url || "");

  // Normaliza: puede venir como "/ruta" o full URL si axios lo resolvió raro
  const path = u.startsWith("http") ? new URL(u).pathname : u;
  const p = path.startsWith("/") ? path : `/${path}`;

  // ❌ jamás a apoderado
  if (p.startsWith("/portal-apoderado")) return false;
  if (p.startsWith("/auth-apoderado")) return false;

  // ❌ jamás a auth panel
  if (p.startsWith("/auth")) return false;

  // ❌ recursos globales de superadmin (no tenant)
  if (p.startsWith("/academias")) return false;

  // ✅ tenantizados (ajustado a tus routers reales)
  const allowPrefixes = [
    "/jugadores",
    "/pagos-jugador",
    "/pagos_jugador",
    "/estadisticas",
    "/convocatorias",
    "/agenda",
    "/eventos",
    "/noticias",

    // catálogos (en WELI pueden ser tenantizados según tu regla)
    "/posiciones",
    "/sucursales_real",
    "/sucursales-real",
    "/prevision_medica",
    "/prevision-medica",
    "/tipo_pago",
    "/tipo-pago",
    "/situacion_pago",
    "/situacion-pago",
    "/usuarios", // usuarios: en tu modelo también es por academia (rol 1/3)
  ];

  return allowPrefixes.some((pref) => p.startsWith(pref));
}

/* -------------------- Axios instances -------------------- */
export const apiPublic = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  timeout: 15000,
});

export const apiPrivate = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  timeout: 15000,
});

const api = apiPrivate;

// Seteo inicial de Authorization
const bootToken = getToken();
if (bootToken) apiPrivate.defaults.headers.common.Authorization = `Bearer ${bootToken}`;

/* -------------------- Interceptors (PUBLIC) -------------------- */
apiPublic.interceptors.request.use((config) => {
  const headers = config.headers ?? {};
  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

  // blindaje: público nunca debe llevar auth ni tenant header
  delete plain.Authorization;
  delete plain.authorization;
  delete plain[ACADEMIA_HEADER];

  config.headers = plain;
  return config;
});

/* -------------------- Interceptors (PRIVATE) -------------------- */
apiPrivate.interceptors.request.use((config) => {
  const token = getToken();

  const headers = config.headers ?? {};
  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

  // Authorization
  if (token) plain.Authorization = `Bearer ${token}`;
  else {
    delete plain.Authorization;
    delete plain.authorization;
  }

  // x-academia-id
  // Regla práctica:
  // - Rol 3 (superadmin): SIEMPRE usa academia seleccionada para rutas tenantizadas.
  // - Rol 1/2: puedes mandar si existe seleccionada (no rompe). Si no hay, no mandes.
  // - Nunca mandes a auth ni portal apoderado (shouldSendAcademiaHeader ya lo evita).
  if (token && shouldSendAcademiaHeader(config?.url)) {
    const rol = extractRolFromToken(token);
    const academiaId = readSelectedAcademiaId();

    if (academiaId > 0 && (rol === 3 || rol === 1 || rol === 2)) {
      plain[ACADEMIA_HEADER] = String(academiaId);
    } else {
      delete plain[ACADEMIA_HEADER];
    }
  } else {
    delete plain[ACADEMIA_HEADER];
  }

  config.headers = plain;
  return config;
});

/* -------------------- Response normalizer (PRIVATE) -------------------- */
apiPrivate.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status ?? 0;
    const data = error?.response?.data ?? null;

    // ✅ solo 401 “real” limpia token
    if (status === 401) {
      const msg = String(data?.message || "").toLowerCase();
      const shouldClear =
        msg.includes("token inválido") ||
        msg.includes("token invalido") ||
        msg.includes("expirado") ||
        msg.includes("falta bearer") ||
        msg.includes("invalid token") ||
        msg.includes("jwt") ||
        msg.includes("unauthorized") ||
        msg.includes("token requerido");

      if (shouldClear) clearToken();
    }

    const norm = {
      status,
      url: error?.config?.url ?? null,
      method: error?.config?.method ?? null,
      baseURL: error?.config?.baseURL ?? null,
      message:
        (data && (data.message || data.detail || data.error)) ||
        error?.message ||
        "Error de red o del servidor",
      data,
      ...(import.meta.env.DEV
        ? {
            response: error?.response || null,
            request: error?.request || null,
            code: error?.code,
            config: error?.config,
            _raw: error,
          }
        : {}),
    };

    return Promise.reject(norm);
  }
);

export default api;
export { decodeJwtPayload };
