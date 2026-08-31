// src/services/api.js

import axios from "axios";

/* =========================================================
   WELI STORAGE
========================================================= */

export const TOKEN_KEY = "weli_token";
export const ACADEMIA_STORAGE_KEY = "weli_selected_academia";
export const ACADEMIA_HEADER = "x-academia-id";

const API_DEBUG_KEY = "weli_api_debug";

/* =========================================================
   STORAGE SEGURO
========================================================= */

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

/* =========================================================
   HEADERS HELPERS
========================================================= */

/**
 * Elimina un header sin depender del casing.
 *
 * Ejemplos equivalentes:
 *
 * Authorization
 * authorization
 *
 * x-academia-id
 * X-Academia-Id
 */
function removeHeaderIgnoreCase(headers, headerName) {
  if (!headers || !headerName) return;

  const target = String(headerName).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === target) {
      delete headers[key];
    }
  }
}

function hasHeaderIgnoreCase(headers, headerName) {
  if (!headers || !headerName) return false;

  const target = String(headerName).toLowerCase();

  return Object.keys(headers).some((key) => String(key).toLowerCase() === target);
}

function getHeaderIgnoreCase(headers, headerName) {
  if (!headers || !headerName) return undefined;

  const target = String(headerName).toLowerCase();

  const found = Object.keys(headers).find((key) => String(key).toLowerCase() === target);

  return found ? headers[found] : undefined;
}

/* =========================================================
   DEBUG
========================================================= */

const API_DEBUG =
  String(import.meta?.env?.VITE_API_DEBUG ?? "0") === "1" || String(safeStorageGet(API_DEBUG_KEY) ?? "0") === "1";

/* =========================================================
   BASE URL
========================================================= */

const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url = (typeof envUrl === "string" && envUrl.trim()) || "http://127.0.0.1:8000";

  url = url.trim();

  /*
   * No permitimos que query/hash formen parte
   * accidentalmente de la URL base.
   */
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  url = url.replace(/\/+$/, "");

  /*
   * El frontend trabaja siempre contra /api.
   */
  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }

  if (import.meta.env.PROD && /(localhost|127\.0\.0\.1)/i.test(url)) {
    console.warn("[WELI] VITE_API_BASE_URL en producción apunta a localhost.");
  }

  return url;
};

export const API_BASE_URL = pickBaseUrl();

/* =========================================================
   AXIOS INSTANCES
========================================================= */

/**
 * Solo endpoints realmente públicos.
 *
 * Nunca:
 * - Authorization
 * - x-academia-id
 */
export const apiPublic = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  timeout: 15000,
});

/**
 * Endpoints autenticados.
 */
export const apiPrivate = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  timeout: 15000,
});

/**
 * Alias histórico utilizado por componentes actuales.
 */
const api = apiPrivate;

/* =========================================================
   TOKEN
========================================================= */

export const getToken = () => {
  const token = safeStorageGet(TOKEN_KEY);

  return typeof token === "string" && token.trim() ? token.trim() : null;
};

export const clearToken = () => {
  safeStorageRemove(TOKEN_KEY);

  /*
   * Eliminamos cualquier Authorization persistente
   * del axios instance.
   */
  removeHeaderIgnoreCase(apiPrivate.defaults.headers.common, "Authorization");
};

export const setToken = (token) => {
  const normalized = typeof token === "string" ? token.trim() : "";

  if (!normalized) {
    clearToken();
    return false;
  }

  const stored = safeStorageSet(TOKEN_KEY, normalized);

  if (!stored) {
    return false;
  }

  apiPrivate.defaults.headers.common.Authorization = `Bearer ${normalized}`;

  return true;
};

/* =========================================================
   ACADEMIA SELECCIONADA
========================================================= */

/**
 * Exclusivamente para SUPERADMIN.
 *
 * Admin y Staff nunca deben depender
 * de localStorage para determinar su tenant.
 */
export function clearSelectedAcademia() {
  safeStorageRemove(ACADEMIA_STORAGE_KEY);
}

function readSelectedAcademiaId() {
  try {
    const raw = safeStorageGet(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return 0;
    }

    /*
     * Compatibilidad con almacenamiento simple:
     *
     * "2"
     */
    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /*
     * Formato actual WELI:
     *
     * {
     *   id: 2,
     *   nombre: "...",
     *   ...
     * }
     */
    const parsed = JSON.parse(raw);

    /*
     * `id` es el estándar actual.
     *
     * Los aliases se mantienen temporalmente
     * para no romper snapshots antiguos.
     */
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/* =========================================================
   JWT DECODE LOCAL
========================================================= */

/**
 * IMPORTANTE:
 *
 * Esto NO valida:
 * - firma;
 * - issuer;
 * - audience;
 * - expiración criptográfica.
 *
 * Se utiliza exclusivamente para decisiones
 * de interfaz y construcción de headers.
 *
 * La autoridad continúa siendo:
 *
 * backend
 *   ↓
 * jwt.verify()
 *   ↓
 * requireAuth
 *   ↓
 * requireRoles
 *   ↓
 * getEffectiveAcademiaId
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");

    if (parts.length !== 3) {
      return null;
    }

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

/* =========================================================
   JWT CLAIM HELPERS
========================================================= */

/**
 * Prioriza el formato JWT actual.
 *
 * Después conserva aliases antiguos
 * durante la transición.
 */
function extractRolFromToken(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return 0;
  }

  const raw =
    payload?.rol_id ??
    payload?.user?.rol_id ??
    payload?.payload?.rol_id ??
    payload?.role_id ??
    payload?.role ??
    payload?.rol ??
    0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

/**
 * Se mantiene para compatibilidad/UI.
 *
 * No se utiliza para construir el header
 * de Admin/Staff.
 */
function extractAcademiaIdFromToken(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return 0;
  }

  const raw =
    payload?.academia_id ?? payload?.user?.academia_id ?? payload?.payload?.academia_id ?? payload?.academy_id ?? 0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* =========================================================
   URL HELPERS
========================================================= */

function safePathFromAxiosUrl(url = "") {
  try {
    const raw = String(url || "").trim();

    if (!raw) {
      return "/";
    }

    let path;

    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname || "/";
    } else {
      path = raw.startsWith("/") ? raw : `/${raw}`;
    }

    /*
     * Por seguridad trabajamos siempre
     * sobre path relativo al API.
     */
    if (path === "/api") {
      return "/";
    }

    if (path.startsWith("/api/")) {
      path = path.slice(4);
    }

    /*
     * Evita dobles slash.
     */
    path = path.replace(/\/{2,}/g, "/");

    return path || "/";
  } catch {
    return "/";
  }
}

function joinUrl(baseURL, url) {
  const base = String(baseURL || "").replace(/\/+$/, "");

  const path = String(url || "");

  if (!path) {
    return base;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${base}${path}`;
  }

  return `${base}/${path}`;
}

/* =========================================================
   TENANT ROUTE MATCHER
========================================================= */

/**
 * Determina si un recurso opera dentro
 * de una academia.
 *
 * MUY IMPORTANTE:
 *
 * shouldSendAcademiaHeader()
 * NO significa que todos estos endpoints
 * recibirán necesariamente el header.
 *
 * Posteriormente el interceptor verifica el rol:
 *
 * SUPERADMIN
 *     ↓
 * x-academia-id ✅
 *
 * ADMIN / STAFF
 *     ↓
 * x-academia-id ❌
 * academia firmada JWT ✅
 */
function isTenantRoute(url = "") {
  const path = safePathFromAxiosUrl(url);

  /* ───────── Apoderado ───────── */

  if (path.startsWith("/portal-apoderado")) {
    return false;
  }

  if (path.startsWith("/auth-apoderado")) {
    return false;
  }

  /* ───────── Auth panel ───────── */

  if (path.startsWith("/auth")) {
    return false;
  }

  /* ───────── Academias ───────── */

  /*
   * Listado/administración global.
   */
  if (path === "/academias" || path === "/academias/") {
    return false;
  }

  /*
   * Recurso lógico de academia seleccionada.
   */
  if (/^\/academias\/\d+\/?$/.test(path)) {
    return true;
  }

  /*
   * Todos los endpoints que utilizan
   * contexto de academia.
   */
  const tenantPrefixes = [
    /* Core */
    "/jugadores",

    /* Finanzas */
    "/pagos-jugador",
    "/pagos_jugador",
    "/cargos-jugador",

    /* Planes */
    "/planes",
    "/plan-sucursales",
    "/plan-tarifas",
    "/jugador-planes",

    /* Tarifas */
    "/tarifa-sucursales",

    /* Promociones */
    "/promociones",
    "/promocion-planes",
    "/promocion-sucursales",
    "/promocion-tipos-pago",

    /* Estadísticas */
    "/estadisticas",

    /* Convocatorias */
    "/convocatorias",

    /* Agenda / eventos */
    "/agenda",
    "/eventos",

    /* Catálogos tenantizados / compatibles */
    "/categorias",
    "/categoria",

    "/estado",
    "/estados",

    "/comunas",

    "/establecimientos-educ",

    "/prevision-medica",

    "/posiciones",

    "/sucursales-real",
    "/sucursales_real",

    "/situacion-pago",
    "/situacion_pago",

    "/tipo-pago",
    "/tipo_pago",

    "/medio-pago",
    "/medios-pago",

    /* Usuarios */
    "/usuarios",
  ];

  return tenantPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/* =========================================================
   TOKEN INICIAL
========================================================= */

const bootToken = getToken();

if (bootToken) {
  apiPrivate.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
}

/* =========================================================
   PUBLIC REQUEST INTERCEPTOR
========================================================= */

apiPublic.interceptors.request.use((config) => {
  const headers = config.headers ?? {};

  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

  /*
   * La instancia pública nunca debe filtrar:
   *
   * - JWT
   * - tenant
   */
  removeHeaderIgnoreCase(plain, "Authorization");

  removeHeaderIgnoreCase(plain, ACADEMIA_HEADER);

  config.headers = plain;

  return config;
});

/* =========================================================
   PRIVATE REQUEST INTERCEPTOR
========================================================= */

apiPrivate.interceptors.request.use((config) => {
  const token = getToken();

  const headers = config.headers ?? {};

  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

  /* ─────────────────────────────────────────
       Authorization
    ───────────────────────────────────────── */

  removeHeaderIgnoreCase(plain, "Authorization");

  if (token) {
    plain.Authorization = `Bearer ${token}`;
  }

  /* ─────────────────────────────────────────
       Academia
    ───────────────────────────────────────── */

  /*
   * Nunca confiamos en un header manual
   * agregado por un componente.
   *
   * Lo eliminamos primero y posteriormente
   * lo reconstruimos bajo nuestras reglas.
   */
  removeHeaderIgnoreCase(plain, ACADEMIA_HEADER);

  let rol = 0;
  let academiaId = 0;

  const tenantRoute = Boolean(token) && isTenantRoute(config?.url);

  if (token && tenantRoute) {
    rol = extractRolFromToken(token);

    /*
     * ÚNICAMENTE SUPERADMIN
     * controla x-academia-id desde frontend.
     */
    if (rol === 3) {
      academiaId = readSelectedAcademiaId();

      if (academiaId > 0) {
        plain[ACADEMIA_HEADER] = String(academiaId);
      }
    }

    /*
     * ADMIN / STAFF
     *
     * NO enviamos x-academia-id.
     *
     * Su tenant proviene exclusivamente
     * del JWT firmado.
     */
    if (rol === 1 || rol === 2) {
      academiaId = extractAcademiaIdFromToken(token);

      /*
       * Solo se obtiene para debug/UI.
       *
       * NO:
       *
       * plain[ACADEMIA_HEADER] = academiaId
       */
    }
  }

  /* ─────────────────────────────────────────
       Debug
    ───────────────────────────────────────── */

  if (API_DEBUG) {
    const full = joinUrl(config?.baseURL, config?.url);

    console.log("[WELI API REQ]", (config?.method || "GET").toUpperCase(), full, {
      hasAuth: hasHeaderIgnoreCase(plain, "Authorization"),

      tenantRoute,

      rol,

      /*
       * Para Admin/Staff esto puede mostrar
       * la academia del JWT solo como debug,
       * pero NO significa que el header
       * haya sido enviado.
       */
      effectiveAcademiaHint: academiaId || null,

      xAcademia: getHeaderIgnoreCase(plain, ACADEMIA_HEADER) ?? null,
    });
  }

  config.headers = plain;

  return config;
});

/* =========================================================
   PRIVATE RESPONSE INTERCEPTOR
========================================================= */

apiPrivate.interceptors.response.use(
  /*
   * Respuesta normal.
   */
  (response) => response,

  /*
   * Error.
   */
  (error) => {
    const isCanceled =
      error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || Boolean(axios.isCancel?.(error));

    const status = Number(error?.response?.status ?? 0);

    const data = error?.response?.data ?? null;

    /* =====================================================
       401 / TOKEN
    ===================================================== */

    if (status === 401) {
      const message = String(data?.message ?? data?.detail ?? data?.error ?? "").toLowerCase();

      /*
       * Compatible con:
       *
       * index.ts
       * authz.ts
       * routers antiguos
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
        message.includes("token sin academia válida") ||
        message.includes("token sin academia valida") ||
        message.includes("jwt");

      if (shouldClearToken) {
        clearToken();
      }
    }

    /* =====================================================
       ERROR NORMALIZADO
    ===================================================== */

    const method = error?.config?.method ?? null;

    const url = error?.config?.url ?? null;

    const baseURL = error?.config?.baseURL ?? null;

    const fullUrl = joinUrl(baseURL, url);

    const path = safePathFromAxiosUrl(url);

    const requestHeaders = error?.config?.headers ?? {};

    const normalized = {
      status,
      method,
      url,
      baseURL,
      fullUrl,
      path,

      message: (data && (data.message || data.detail || data.error)) || error?.message || "Error de red o del servidor",

      data,

      code: error?.code ?? null,

      isCanceled: Boolean(isCanceled),

      requestHint: {
        hasAuth: hasHeaderIgnoreCase(requestHeaders, "Authorization"),

        xAcademia: getHeaderIgnoreCase(requestHeaders, ACADEMIA_HEADER) ?? null,
      },

      /*
       * Datos internos solamente
       * durante desarrollo.
       */
      ...(import.meta.env.DEV
        ? {
            response: error?.response ?? null,

            request: error?.request ?? null,

            config: error?.config ?? null,

            _raw: error,
          }
        : {}),
    };

    /* =====================================================
       LOG DESARROLLO
    ===================================================== */

    if (!isCanceled && (API_DEBUG || import.meta.env.DEV)) {
      const requestMethod = (method || "GET").toUpperCase();

      console.warn(`[WELI API FAIL] ${requestMethod} ${fullUrl} -> ${status}`, {
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
      });
    }

    return Promise.reject(normalized);
  }
);

/* =========================================================
   EXPORTS
========================================================= */

export default api;

export { decodeJwtPayload, extractRolFromToken, extractAcademiaIdFromToken };
