// src/services/api.js
import axios from "axios";

export const TOKEN_KEY = "weli_token";
export const ACADEMIA_STORAGE_KEY = "weli_selected_academia";
export const ACADEMIA_HEADER = "x-academia-id";

/* -------------------- Debug toggle -------------------- */
const API_DEBUG =
  String(import.meta?.env?.VITE_API_DEBUG ?? "0") === "1" ||
  String(localStorage.getItem("weli_api_debug") ?? "0") === "1";

/* -------------------- Base URL (determinista) -------------------- */
const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url =
    (typeof envUrl === "string" && envUrl.trim()) || "http://127.0.0.1:8000";

  url = url.trim();
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (url.endsWith("/")) url = url.slice(0, -1);

  // Normaliza a /api
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

    // compat: "1"
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    // compat: {"id":1,...}
    const parsed = JSON.parse(raw);
    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? 0
    );
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/**
 * Decodifica payload JWT (base64url) robusto (UTF-8).
 * NO valida firma: solo para extraer claims livianos.
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const b64url = parts[1];
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);

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
  const u = p?.user ?? p?.payload ?? p ?? {};
  const raw = u?.rol_id ?? u?.role_id ?? u?.role ?? u?.rol ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function extractAcademiaIdFromToken(token) {
  const p = decodeJwtPayload(token);
  const u = p?.user ?? p?.payload ?? p ?? {};
  const raw =
    u?.academia_id ??
    u?.academy_id ??
    p?.academia_id ??
    p?.academy_id ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* -------------------- Path matcher (robusto) -------------------- */
function safePathFromAxiosUrl(url = "") {
  try {
    const u = String(url || "");
    if (!u) return "/";
    if (u.startsWith("http")) return new URL(u).pathname || "/";
    return u.startsWith("/") ? u : `/${u}`;
  } catch {
    return "/";
  }
}

/**
 * Decide si se debe enviar x-academia-id según URL.
 * Regla: SOLO endpoints tenantizados del panel. Nunca auth ni portal apoderado.
 */
function shouldSendAcademiaHeader(url = "") {
  const p = safePathFromAxiosUrl(url);

  // ❌ jamás a apoderado
  if (p.startsWith("/portal-apoderado")) return false;
  if (p.startsWith("/auth-apoderado")) return false;

  // ❌ jamás a auth panel
  if (p.startsWith("/auth")) return false;

  // ❌ recursos globales superadmin (no tenant)
  if (p.startsWith("/academias")) return false;

  // ✅ tenantizados
  const allowPrefixes = [
    "/jugadores",
    "/pagos-jugador",
    "/pagos_jugador",
    "/estadisticas",
    "/convocatorias",
    "/agenda",
    "/eventos",

    // ✅ catálogos tenantizados
    "/categorias",
    "/categoria",
    "/estado",
    "/estados",
    "/comunas",
    "/establecimientos-educ",
    "/prevision-medica",

    "/posiciones",
    "/sucursales_real",
    "/sucursales-real",
    "/situacion_pago",
    "/situacion-pago",
    "/tipo_pago",
    "/tipo-pago",

    "/medio-pago",
    "/medios-pago",

    "/usuarios",
  ];

  return allowPrefixes.some((pref) => p.startsWith(pref));
}

/* -------------------- URL helpers -------------------- */
function joinUrl(baseURL, url) {
  const b = String(baseURL || "").replace(/\/+$/, "");
  const u = String(url || "");
  if (!u) return b || "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${b}${u}`;
  return `${b}/${u}`;
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

  // ✅ Tenant header: rol 1/2/3 para rutas tenantizadas
  if (token && shouldSendAcademiaHeader(config?.url)) {
    const rol = extractRolFromToken(token);

    let academiaId = 0;

    if (rol === 3) {
      // superadmin: usa selector (academia target)
      academiaId = readSelectedAcademiaId();
    } else if (rol === 1 || rol === 2) {
      // admin/staff: usa academia del token (fuente de verdad)
      academiaId = extractAcademiaIdFromToken(token);

      // compat: si por alguna razón el token no trae, intenta selector
      if (!academiaId) academiaId = readSelectedAcademiaId();
    }

    if (academiaId > 0) plain[ACADEMIA_HEADER] = String(academiaId);
    else delete plain[ACADEMIA_HEADER];

    // Debug opt-in (request)
    if (API_DEBUG) {
      const full = joinUrl(config?.baseURL, config?.url);
      console.log("[API REQ]", (config?.method || "GET").toUpperCase(), full, {
        hasAuth: !!plain.Authorization,
        tokenLen: token?.length || 0,
        rol,
        xAcademia: plain[ACADEMIA_HEADER] ?? null,
      });
    }
  } else {
    delete plain[ACADEMIA_HEADER];

    if (API_DEBUG) {
      const full = joinUrl(config?.baseURL, config?.url);
      console.log("[API REQ]", (config?.method || "GET").toUpperCase(), full, {
        hasAuth: !!plain.Authorization,
        tokenLen: token?.length || 0,
        rol: token ? extractRolFromToken(token) : 0,
        xAcademia: null,
      });
    }
  }

  config.headers = plain;
  return config;
});

/* -------------------- Response normalizer (PRIVATE) -------------------- */
apiPrivate.interceptors.response.use(
  (res) => res,
  (error) => {
    const isCanceled =
      error?.code === "ERR_CANCELED" ||
      error?.name === "CanceledError" ||
      axios.isCancel?.(error);

    const status = error?.response?.status ?? 0;
    const data = error?.response?.data ?? null;

    // ✅ solo 401 “real” limpia token
    if (status === 401) {
      const msg = String(data?.message || data?.detail || "").toLowerCase();
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

    const method = error?.config?.method ?? null;
    const url = error?.config?.url ?? null;
    const baseURL = error?.config?.baseURL ?? null;
    const fullUrl = joinUrl(baseURL, url);
    const path = safePathFromAxiosUrl(url);

    const norm = {
      status,
      method,
      url,
      baseURL,
      fullUrl,
      path,
      message:
        (data && (data.message || data.detail || data.error)) ||
        error?.message ||
        "Error de red o del servidor",
      data,
      code: error?.code ?? null,
      isCanceled: !!isCanceled,
      requestHint: {
        hasAuth: !!error?.config?.headers?.Authorization,
        xAcademia: error?.config?.headers?.[ACADEMIA_HEADER] ?? null,
      },
      ...(import.meta.env.DEV
        ? {
            response: error?.response || null,
            request: error?.request || null,
            config: error?.config,
            _raw: error,
          }
        : {}),
    };

    if (!isCanceled) {
      const m = (method || "GET").toUpperCase();
      const st = status || 0;

      console.log(`[API FAIL] ${m} ${fullUrl} -> ${st}`, {
        status: norm.status,
        path: norm.path,
        url: norm.url,
        baseURL: norm.baseURL,
        code: norm.code,
        data: norm.data,
        hasAuth: norm.requestHint.hasAuth,
        xAcademia: norm.requestHint.xAcademia,
        isNetworkError:
          st === 0 ||
          String(norm.message || "").toLowerCase().includes("network error") ||
          String(norm.message || "").toLowerCase().includes("failed to fetch"),
      });
    }

    return Promise.reject(norm);
  }
);

export default api;
export { decodeJwtPayload };

/* -------------------- DEV helpers (para consola sin import) -------------------- */
if (import.meta.env.DEV) {
  // te evita el “Cannot use import statement outside a module”
  window.WELI = window.WELI || {};
  window.WELI.decodeJwtPayload = decodeJwtPayload;
  window.WELI.getToken = getToken;
  window.WELI.API_BASE_URL = API_BASE_URL;
}
