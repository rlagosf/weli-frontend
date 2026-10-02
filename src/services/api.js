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
   STORAGE HELPERS
========================================================= */

/**
 * El frontend no almacena:
 * - ciphertext;
 * - blind indexes;
 * - claves de cifrado;
 * - snapshots de usuario;
 * - snapshots de academia.
 *
 * Sólo persiste:
 * - JWT vigente;
 * - academia_id seleccionada por Superadmin.
 */

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

/**
 * Nunca se imprimen:
 * - Authorization;
 * - JWT;
 * - request body;
 * - respuestas completas;
 * - formularios;
 * - PII.
 */

const API_DEBUG =
  String(import.meta?.env?.VITE_API_DEBUG ?? "0") === "1" || String(safeStorageGet(API_DEBUG_KEY) ?? "0") === "1";

/* =========================================================
   BASE URL
========================================================= */

const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url = (typeof envUrl === "string" && envUrl.trim()) || "http://127.0.0.1:8000";

  url = url.trim();

  /* Elimina query/hash accidentales. */
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  url = url.replace(/\/+$/, "");

  /* El frontend opera siempre bajo /api. */
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
 * Endpoints públicos.
 *
 * Nunca deben enviar:
 * - Authorization;
 * - x-academia-id.
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
 * Cliente autenticado principal utilizado por WELI.
 */
const api = apiPrivate;

/* =========================================================
   TOKEN
========================================================= */

/**
 * El JWT permanece actualmente en localStorage para conservar
 * la arquitectura vigente.
 *
 * Una futura migración a cookie HttpOnly requiere cambios
 * coordinados entre backend y frontend.
 */

export const getToken = () => {
  const token = safeStorageGet(TOKEN_KEY);

  return typeof token === "string" && token.trim() ? token.trim() : null;
};

export const clearToken = () => {
  safeStorageRemove(TOKEN_KEY);

  removeHeaderIgnoreCase(apiPrivate.defaults.headers.common, "Authorization");

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("weli:sessionChanged"));
  }
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

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("weli:sessionChanged"));
  }

  return true;
};

/* =========================================================
   ACADEMIA SELECCIONADA
========================================================= */

/**
 * CONTRATO DEFINITIVO:
 *
 * Exclusivamente Superadmin.
 *
 * localStorage:
 *
 * weli_selected_academia = "5"
 *
 * No se permiten:
 * - JSON;
 * - nombre;
 * - deporte_id;
 * - RUT;
 * - email;
 * - dirección;
 * - estado;
 * - timestamp;
 * - ningún otro snapshot.
 *
 * Admin y Staff nunca obtienen tenant desde localStorage.
 */

export function getSelectedAcademiaId() {
  const raw = safeStorageGet(ACADEMIA_STORAGE_KEY);

  if (!raw) return 0;

  /*
   * Sólo se acepta representación decimal positiva.
   * Ejemplos válidos:
   *
   * "1"
   * "27"
   * "300"
   *
   * JSON queda rechazado automáticamente.
   */
  if (!/^[1-9]\d*$/.test(raw.trim())) {
    return 0;
  }

  const academiaId = Number(raw.trim());

  return Number.isSafeInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

export function setSelectedAcademiaId(academiaId) {
  const id = Number(academiaId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    clearSelectedAcademia();
    return false;
  }

  const stored = safeStorageSet(ACADEMIA_STORAGE_KEY, String(id));

  if (stored && typeof window !== "undefined") {
    window.dispatchEvent(new Event("weli:selectedAcademiaChanged"));
  }

  return stored;
}

export function clearSelectedAcademia() {
  safeStorageRemove(ACADEMIA_STORAGE_KEY);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("weli:selectedAcademiaChanged"));
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
 * - autenticidad.
 *
 * Se utiliza únicamente para comportamiento UI y construcción
 * controlada del request.
 *
 * La autoridad real continúa en backend:
 *
 * jwt.verify()
 *   ↓
 * requireAuth
 *   ↓
 * requireRoles
 *   ↓
 * getEffectiveAcademiaId
 */

export function decodeJwtPayload(token) {
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

export function extractRolFromToken(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) return 0;

  const raw = payload?.rol_id ?? payload?.user?.rol_id ?? payload?.role_id ?? payload?.role ?? payload?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

/**
 * Utilidad UI.
 *
 * Admin/Staff NO utilizan este valor para construir
 * x-academia-id.
 */
export function extractAcademiaIdFromToken(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) return 0;

  const raw = payload?.academia_id ?? payload?.user?.academia_id ?? payload?.academy_id ?? 0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* =========================================================
   URL HELPERS
========================================================= */

function safePathFromAxiosUrl(url = "") {
  try {
    const raw = String(url || "").trim();

    if (!raw) return "/";

    let path;

    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname || "/";
    } else {
      const clean = raw.split("#")[0].split("?")[0];

      path = clean.startsWith("/") ? clean : `/${clean}`;
    }

    if (path === "/api") {
      return "/";
    }

    if (path.startsWith("/api/")) {
      path = path.slice(4);
    }

    path = path.replace(/\/{2,}/g, "/");

    return path || "/";
  } catch {
    return "/";
  }
}

function joinUrl(baseURL, url) {
  const base = String(baseURL || "").replace(/\/+$/, "");

  const path = String(url || "");

  if (!path) return base;

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
 * Determina si un endpoint pertenece a un tenant Academia.
 *
 * SUPERADMIN
 * → x-academia-id desde getSelectedAcademiaId().
 *
 * ADMIN / STAFF
 * → nunca envían x-academia-id.
 * → academia_id proviene del JWT validado por backend.
 */

function isTenantRoute(url = "") {
  const path = safePathFromAxiosUrl(url);

  /* =======================================================
     PORTAL APODERADO
  ======================================================= */

  if (path.startsWith("/portal-apoderado")) {
    return false;
  }

  if (path.startsWith("/auth-apoderado")) {
    return false;
  }

  /* =======================================================
     AUTH PANEL
  ======================================================= */

  if (path.startsWith("/auth")) {
    return false;
  }

  /* =======================================================
     ACADEMIAS

     GET /academias
     ----------------
     Es administración GLOBAL de Superadmin.
     No necesita x-academia-id.

     GET /academias/:id
     --------------------
     Representa una academia concreta.

     Para Superadmin puede existir un tenant seleccionado,
     por lo que permitimos que el interceptor adjunte
     x-academia-id si corresponde.

     El backend continúa siendo la autoridad real.
  ======================================================= */

  if (path === "/academias" || path === "/academias/") {
    return false;
  }

  if (/^\/academias\/\d+\/?$/.test(path)) {
    return true;
  }

  /* =======================================================
     RECURSOS TENANTIZADOS
  ======================================================= */

  const tenantPrefixes = [
    /* -----------------------------------------------------
       Tema de academia

       CRÍTICO PARA SUPERADMIN:
       ThemeContext solicita /academia-tema después de que
       se selecciona una academia.

       Esto permite que api.js construya:

       x-academia-id: <academia seleccionada>
    ----------------------------------------------------- */

    "/academia-tema",

    /* -----------------------------------------------------
       Core
    ----------------------------------------------------- */

    "/jugadores",

    /* -----------------------------------------------------
       Finanzas
    ----------------------------------------------------- */

    "/pagos-jugador",
    "/pagos_jugador",

    "/cargos-jugador",

    /* -----------------------------------------------------
       Planes
    ----------------------------------------------------- */

    "/planes",

    "/plan-sucursales",

    "/plan-tarifas",

    "/jugador-planes",

    /* -----------------------------------------------------
       Tarifas
    ----------------------------------------------------- */

    "/tarifa-sucursales",

    /* -----------------------------------------------------
       Promociones
    ----------------------------------------------------- */

    "/promociones",

    "/promocion-planes",

    "/promocion-sucursales",

    "/promocion-tipos-pago",

    /* -----------------------------------------------------
       Estadísticas
    ----------------------------------------------------- */

    "/estadisticas",

    /* -----------------------------------------------------
       Convocatorias
    ----------------------------------------------------- */

    "/convocatorias",

    /* -----------------------------------------------------
       Agenda / Eventos
    ----------------------------------------------------- */

    "/agenda",

    "/eventos",

    /* -----------------------------------------------------
       Catálogos tenantizados
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       Usuarios
    ----------------------------------------------------- */

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

/**
 * apiPublic jamás permite:
 * - Authorization;
 * - x-academia-id.
 */

apiPublic.interceptors.request.use((config) => {
  const headers = config.headers ?? {};

  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

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

  /* -------------------------------------------------------
       AUTHORIZATION
    ------------------------------------------------------- */

  /*
   * Nunca confiamos en Authorization agregado manualmente
   * por un componente.
   */
  removeHeaderIgnoreCase(plain, "Authorization");

  if (token) {
    plain.Authorization = `Bearer ${token}`;
  }

  /* -------------------------------------------------------
       TENANT
    ------------------------------------------------------- */

  /*
   * Nunca confiamos en x-academia-id agregado manualmente.
   * Se elimina siempre antes de reconstruir el contexto.
   */
  removeHeaderIgnoreCase(plain, ACADEMIA_HEADER);

  let rol = 0;
  let academiaId = 0;

  const tenantRoute = Boolean(token) && isTenantRoute(config?.url);

  if (token && tenantRoute) {
    rol = extractRolFromToken(token);

    /* SUPERADMIN */
    if (rol === 3) {
      academiaId = getSelectedAcademiaId();

      if (academiaId > 0) {
        plain[ACADEMIA_HEADER] = String(academiaId);
      }
    }

    /* ADMIN / STAFF */
    if (rol === 1 || rol === 2) {
      academiaId = extractAcademiaIdFromToken(token);

      /*
       * Este valor sirve exclusivamente como contexto local.
       *
       * NO se envía:
       *
       * plain[ACADEMIA_HEADER]
       *
       * porque el backend debe obtener academia_id desde
       * el JWT firmado.
       */
    }
  }

  /* -------------------------------------------------------
       DEBUG SEGURO
    ------------------------------------------------------- */

  if (API_DEBUG) {
    const full = joinUrl(config?.baseURL, config?.url);

    console.log("[WELI API REQ]", (config?.method || "GET").toUpperCase(), full, {
      hasAuth: hasHeaderIgnoreCase(plain, "Authorization"),

      tenantRoute,

      rol,

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
  (response) => response,

  (error) => {
    const isCanceled =
      error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || Boolean(axios.isCancel?.(error));

    const status = Number(error?.response?.status ?? 0);

    const data = error?.response?.data ?? null;

    /* -----------------------------------------------------
       401 / SESIÓN
    ----------------------------------------------------- */

    if (status === 401) {
      const message = String(data?.message ?? data?.detail ?? data?.error ?? "").toLowerCase();

      const shouldClearSession =
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

      if (shouldClearSession) {
        clearToken();
        clearSelectedAcademia();
      }
    }

    /* -----------------------------------------------------
       ERROR NORMALIZADO
    ----------------------------------------------------- */

    const method = error?.config?.method ?? null;

    const url = error?.config?.url ?? null;

    const baseURL = error?.config?.baseURL ?? null;

    const fullUrl = joinUrl(baseURL, url);

    const path = safePathFromAxiosUrl(url);

    const requestHeaders = error?.config?.headers ?? {};

    /**
     * No incluimos:
     * - error.response completo;
     * - error.request;
     * - error.config;
     * - objetos Axios completos;
     * - request body.
     *
     * config puede contener JWT y datos personales.
     */

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
    };

    /* -----------------------------------------------------
       LOG DESARROLLO SEGURO
    ----------------------------------------------------- */

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
   EXPORT DEFAULT
========================================================= */

export default api;
