// src/services/api.js

import axios from "axios";

/* ───────────────────────── WELI Storage ───────────────────────── */

export const TOKEN_KEY = "weli_token";
export const ACADEMIA_STORAGE_KEY = "weli_selected_academia";
export const ACADEMIA_HEADER = "x-academia-id";

const API_DEBUG_KEY = "weli_api_debug";

/* ───────────────────────── Storage seguro ───────────────────────── */

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/* ───────────────────────── Debug ───────────────────────── */

const API_DEBUG =
  String(import.meta?.env?.VITE_API_DEBUG ?? "0") === "1" ||
  String(safeStorageGet(API_DEBUG_KEY) ?? "0") === "1";

/* ───────────────────────── Base URL ───────────────────────── */

const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url =
    (typeof envUrl === "string" && envUrl.trim()) ||
    "http://127.0.0.1:8000";

  url = url.trim();
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (url.endsWith("/")) url = url.slice(0, -1);

  if (!/\/api$/i.test(url)) url = `${url}/api`;

  if (import.meta.env.PROD && /(localhost|127\.0\.0\.1)/i.test(url)) {
    console.warn("[WELI] VITE_API_BASE_URL en producción apunta a localhost.");
  }

  return url;
};

export const API_BASE_URL = pickBaseUrl();

/* ───────────────────────── Axios instances ───────────────────────── */

export const apiPublic = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

export const apiPrivate = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

const api = apiPrivate;

/* ───────────────────────── Token ───────────────────────── */

export const getToken = () => {
  const token = safeStorageGet(TOKEN_KEY);
  return typeof token === "string" && token.trim() ? token.trim() : null;
};

export const clearToken = () => {
  safeStorageRemove(TOKEN_KEY);

  delete apiPrivate.defaults.headers.common.Authorization;
  delete apiPrivate.defaults.headers.common.authorization;
};

export const setToken = (token) => {
  const normalized = typeof token === "string" ? token.trim() : "";

  if (!normalized) {
    clearToken();
    return false;
  }

  const stored = safeStorageSet(TOKEN_KEY, normalized);
  if (!stored) return false;

  apiPrivate.defaults.headers.common.Authorization = `Bearer ${normalized}`;
  return true;
};

/* ───────────────────────── Academia seleccionada ───────────────────────── */

/**
 * Esta función se utiliza exclusivamente para resolver
 * la academia objetivo del Superadmin.
 *
 * Para Admin/Staff la academia proviene SIEMPRE del JWT.
 */
function readSelectedAcademiaId() {
  try {
    const raw = safeStorageGet(ACADEMIA_STORAGE_KEY);
    if (!raw) return 0;

    /*
     * Formato simple:
     * "2"
     */
    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /*
     * Snapshot WELI:
     * { id: 2, ... }
     *
     * Se mantienen temporalmente aliases compatibles
     * mientras finalizamos la purga global.
     */
    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ??
      parsed?.academia_id ??
      parsed?.academiaId ??
      0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/* ───────────────────────── JWT decode local ───────────────────────── */

/**
 * Solo decodifica claims para decisiones de UI/header.
 *
 * NO valida firma.
 *
 * La autoridad real continúa siendo el backend mediante
 * authz.ts + jwt.verify().
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const b64url = parts[1];
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);

    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);

    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractRolFromToken(token) {
  const payload = decodeJwtPayload(token);
  const user = payload?.user ?? payload?.payload ?? payload ?? {};

  const raw = user?.rol_id ?? user?.role_id ?? user?.role ?? user?.rol ?? 0;
  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function extractAcademiaIdFromToken(token) {
  const payload = decodeJwtPayload(token);
  const user = payload?.user ?? payload?.payload ?? payload ?? {};

  const raw =
    user?.academia_id ??
    user?.academy_id ??
    payload?.academia_id ??
    payload?.academy_id ??
    0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0
    ? academiaId
    : 0;
}

/* ───────────────────────── URL helpers ───────────────────────── */

function safePathFromAxiosUrl(url = "") {
  try {
    const raw = String(url || "").trim();
    if (!raw) return "/";

    let path;

    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname || "/";
    } else {
      path = raw.startsWith("/") ? raw : `/${raw}`;
    }

    /*
     * Si accidentalmente llega una URL absoluta con /api,
     * trabajamos siempre sobre la ruta relativa al API.
     */
    if (path === "/api") return "/";
    if (path.startsWith("/api/")) path = path.slice(4);

    return path || "/";
  } catch {
    return "/";
  }
}

function joinUrl(baseURL, url) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  const path = String(url || "");

  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${base}${path}`;

  return `${base}/${path}`;
}

/* ───────────────────────── Tenant route matcher ───────────────────────── */

/**
 * Decide cuándo enviar x-academia-id.
 *
 * Nunca:
 * - auth panel
 * - portal apoderado
 * - auth apoderado
 * - listado global /academias
 *
 * Sí:
 * - endpoints tenantizados
 * - GET lógico /academias/:id
 *
 * El backend sigue siendo la autoridad final.
 */
function shouldSendAcademiaHeader(url = "") {
  const path = safePathFromAxiosUrl(url);

  /* Apoderado */
  if (path.startsWith("/portal-apoderado")) return false;
  if (path.startsWith("/auth-apoderado")) return false;

  /* Auth panel */
  if (path.startsWith("/auth")) return false;

  /*
   * Academias:
   *
   * /academias       → recurso global
   * /academias/      → recurso global
   * /academias/2     → academia efectiva
   */
  if (path === "/academias" || path === "/academias/") {
    return false;
  }

  if (/^\/academias\/\d+\/?$/.test(path)) {
    return true;
  }

  const tenantPrefixes = [
    "/jugadores",
    "/pagos-jugador",
    "/pagos_jugador",
    "/estadisticas",
    "/convocatorias",
    "/agenda",
    "/eventos",
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

  return tenantPrefixes.some((prefix) => path.startsWith(prefix));
}

/* ───────────────────────── Token inicial ───────────────────────── */

const bootToken = getToken();

if (bootToken) {
  apiPrivate.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
}

/* ───────────────────────── PUBLIC interceptor ───────────────────────── */

apiPublic.interceptors.request.use((config) => {
  const headers = config.headers ?? {};

  const plain =
    typeof headers?.toJSON === "function"
      ? headers.toJSON()
      : { ...headers };

  /*
   * Una petición pública nunca debe heredar
   * autenticación ni información tenant.
   */
  delete plain.Authorization;
  delete plain.authorization;
  delete plain[ACADEMIA_HEADER];

  config.headers = plain;
  return config;
});

/* ───────────────────────── PRIVATE interceptor ───────────────────────── */

apiPrivate.interceptors.request.use((config) => {
  const token = getToken();

  const headers = config.headers ?? {};

  const plain =
    typeof headers?.toJSON === "function"
      ? headers.toJSON()
      : { ...headers };

  /* Authorization */

  if (token) {
    plain.Authorization = `Bearer ${token}`;
  } else {
    delete plain.Authorization;
    delete plain.authorization;
  }

  /*
   * El interceptor siempre recalcula el tenant.
   * Nunca confía en un x-academia-id agregado previamente
   * por un componente.
   */
  delete plain[ACADEMIA_HEADER];

  let rol = 0;
  let academiaId = 0;

  if (token && shouldSendAcademiaHeader(config?.url)) {
    rol = extractRolFromToken(token);

    if (rol === 3) {
      /*
       * Superadmin:
       * academia objetivo elegida mediante selector WELI.
       */
      academiaId = readSelectedAcademiaId();
    } else if (rol === 1 || rol === 2) {
      /*
       * Admin / Staff:
       * SOLO academia firmada dentro del JWT.
       *
       * Se elimina definitivamente el fallback
       * hacia localStorage.
       */
      academiaId = extractAcademiaIdFromToken(token);
    }

    if (academiaId > 0) {
      plain[ACADEMIA_HEADER] = String(academiaId);
    }
  }

  if (API_DEBUG) {
    const full = joinUrl(config?.baseURL, config?.url);

    console.log(
      "[WELI API REQ]",
      (config?.method || "GET").toUpperCase(),
      full,
      {
        hasAuth: Boolean(plain.Authorization),
        rol,
        xAcademia: plain[ACADEMIA_HEADER] ?? null,
      }
    );
  }

  config.headers = plain;

  return config;
});

/* ───────────────────────── PRIVATE response interceptor ───────────────────────── */

apiPrivate.interceptors.response.use(
  (response) => response,

  (error) => {
    const isCanceled =
      error?.code === "ERR_CANCELED" ||
      error?.name === "CanceledError" ||
      axios.isCancel?.(error);

    const status = Number(error?.response?.status ?? 0);
    const data = error?.response?.data ?? null;

    /* ───────── Token inválido ───────── */

    if (status === 401) {
      const message = String(
        data?.message ??
        data?.detail ??
        data?.error ??
        ""
      ).toLowerCase();

      /*
       * authz.ts actualmente utiliza:
       *
       * UNAUTHORIZED
       * INVALID_TOKEN
       *
       * Se mantienen algunos mensajes anteriores
       * durante la transición.
       */
      const shouldClearToken =
        message.includes("invalid_token") ||
        message.includes("invalid token") ||
        message.includes("unauthorized") ||
        message.includes("token inválido") ||
        message.includes("token invalido") ||
        message.includes("token expirado") ||
        message.includes("expirado") ||
        message.includes("falta bearer") ||
        message.includes("token requerido") ||
        message.includes("jwt");

      if (shouldClearToken) {
        clearToken();
      }
    }

    /* ───────── Error normalizado ───────── */

    const method = error?.config?.method ?? null;
    const url = error?.config?.url ?? null;
    const baseURL = error?.config?.baseURL ?? null;

    const fullUrl = joinUrl(baseURL, url);
    const path = safePathFromAxiosUrl(url);

    const normalized = {
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
      isCanceled: Boolean(isCanceled),

      requestHint: {
        hasAuth: Boolean(error?.config?.headers?.Authorization),
        xAcademia:
          error?.config?.headers?.[ACADEMIA_HEADER] ??
          null,
      },

      ...(import.meta.env.DEV
        ? {
            response: error?.response ?? null,
            request: error?.request ?? null,
            config: error?.config ?? null,
            _raw: error,
          }
        : {}),
    };

    /*
     * No dejamos información detallada en consola de producción.
     */
    if (!isCanceled && (API_DEBUG || import.meta.env.DEV)) {
      const requestMethod = (method || "GET").toUpperCase();

      console.warn(
        `[WELI API FAIL] ${requestMethod} ${fullUrl} -> ${status}`,
        {
          status: normalized.status,
          path: normalized.path,
          code: normalized.code,
          message: normalized.message,
          hasAuth: normalized.requestHint.hasAuth,
          xAcademia: normalized.requestHint.xAcademia,
          isNetworkError:
            status === 0 ||
            String(normalized.message || "")
              .toLowerCase()
              .includes("network error") ||
            String(normalized.message || "")
              .toLowerCase()
              .includes("failed to fetch"),
        }
      );
    }

    return Promise.reject(normalized);
  }
);

/* ───────────────────────── Exports ───────────────────────── */

export default api;
export { decodeJwtPayload };