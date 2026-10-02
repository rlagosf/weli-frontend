// src/services/auth.js

import { apiPublic, apiPrivate, setToken, clearToken, getToken, clearSelectedAcademia, decodeJwtPayload } from "./api";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const DEFAULT_TIMEOUT_MS = 10_000;
const LOGOUT_TIMEOUT_MS = 8_000;
const MUST_CHANGE_PASSWORD_KEY = "apoderado_must_change_password";
const AUTH_DEBUG_KEY = "weli_auth_debug";

const PANEL_ROLES = new Set([1, 2, 3]);
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 200;

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

const AUTH_DEBUG =
  String(import.meta?.env?.VITE_AUTH_DEBUG ?? "0") === "1" || String(safeStorageGet(AUTH_DEBUG_KEY) ?? "0") === "1";

/* =========================================================
   RUT APODERADO
========================================================= */

/**
 * RUT interno WELI:
 * - sólo cuerpo numérico;
 * - sin puntos;
 * - sin guion;
 * - sin DV;
 * - exactamente 7 u 8 dígitos.
 */
function normalizeRut(rut) {
  return String(rut ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

function isValidRut(rut) {
  return /^\d{7,8}$/.test(rut);
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

/**
 * Combina un AbortSignal externo con el timeout interno
 * del servicio y permite distinguir timeout de cancelación.
 */
function buildAbortSignal({ signal, timeoutMs }) {
  const controller = new AbortController();
  const ms = Number(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let timer = null;
  let onAbort = null;
  let timedOut = false;

  if (Number.isFinite(ms) && ms > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch {}
    }, ms);
  }

  if (signal) {
    if (signal.aborted) {
      try {
        controller.abort();
      } catch {}
    } else {
      onAbort = () => {
        try {
          controller.abort();
        } catch {}
      };

      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {}
    }
  }

  const cleanup = () => {
    if (timer) clearTimeout(timer);

    if (signal && onAbort) {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {}
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut,
  };
}

/* =========================================================
   HTTP AUTH HELPER
========================================================= */

/**
 * LOGIN  -> apiPublic
 * LOGOUT -> apiPrivate
 *
 * apiPublic elimina Authorization y x-academia-id.
 * apiPrivate reconstruye Authorization desde la sesión actual.
 */
async function postWithTimeout(client, path, body, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const externalSignal = opts.signal;
  const t0 = performance.now();

  const { signal, cleanup, didTimeout } = buildAbortSignal({
    signal: externalSignal,
    timeoutMs,
  });

  try {
    const res = await client.post(path, body, { signal });

    if (AUTH_DEBUG) {
      const t1 = performance.now();

      console.log("[WELI AUTH]", path, "OK", {
        ms: Math.round(t1 - t0),
        status: res?.status,
        baseURL: res?.config?.baseURL,
      });
    }

    return res;
  } catch (err) {
    const status = Number(err?.status ?? err?.response?.status ?? 0);

    const canceled = err?.name === "AbortError" || err?.name === "CanceledError" || err?.code === "ERR_CANCELED";

    if (AUTH_DEBUG) {
      const t1 = performance.now();

      console.log("[WELI AUTH]", path, "FAIL", {
        ms: Math.round(t1 - t0),
        status,
        message: err?.message ?? "Error",
        timeout: didTimeout(),
        canceled,
      });
    }

    if (canceled && didTimeout()) {
      const timeoutError = new Error("TIMEOUT");
      timeoutError.code = "TIMEOUT";

      if (status) timeoutError.status = status;

      throw timeoutError;
    }

    throw err;
  } finally {
    cleanup();
  }
}

/* =========================================================
   VALIDACIÓN LOCAL JWT
========================================================= */

/**
 * Estas validaciones son únicamente controles de coherencia
 * del frontend.
 *
 * NO validan:
 * - firma;
 * - issuer;
 * - audience.
 *
 * La autenticidad continúa siendo responsabilidad exclusiva
 * del backend mediante jwt.verify().
 */

/* ---------------------------------------------------------
   TOKEN PANEL
--------------------------------------------------------- */

function validatePanelTokenLocal(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return {
      ok: false,
      rol: 0,
      academia_id: null,
    };
  }

  const rol = Number(payload?.rol_id ?? payload?.user?.rol_id ?? 0);

  if (!Number.isInteger(rol) || !PANEL_ROLES.has(rol)) {
    return {
      ok: false,
      rol: 0,
      academia_id: null,
    };
  }

  const exp = Number(payload?.exp ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(exp) || exp <= now) {
    return {
      ok: false,
      rol: 0,
      academia_id: null,
    };
  }

  const rawAcademia = payload?.academia_id ?? payload?.user?.academia_id ?? null;

  const academiaId = rawAcademia == null ? null : Number(rawAcademia);

  /**
   * Admin / Staff:
   * academia_id debe venir firmada dentro del JWT.
   */
  if ((rol === 1 || rol === 2) && (!Number.isInteger(academiaId) || academiaId <= 0)) {
    return {
      ok: false,
      rol,
      academia_id: null,
    };
  }

  /**
   * Superadmin:
   * academia_id puede ser NULL hasta que seleccione
   * explícitamente una academia.
   */
  return {
    ok: true,
    rol,
    academia_id: Number.isInteger(academiaId) && academiaId > 0 ? academiaId : null,
  };
}

/* ---------------------------------------------------------
   TOKEN APODERADO
--------------------------------------------------------- */

function validateApoderadoTokenLocal(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return {
      ok: false,
      type: "",
    };
  }

  const type = String(payload?.type ?? payload?.user?.type ?? payload?.payload?.type ?? "")
    .trim()
    .toLowerCase();

  if (type !== "apoderado") {
    return {
      ok: false,
      type,
    };
  }

  const exp = Number(payload?.exp ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(exp) || exp <= now) {
    return {
      ok: false,
      type,
    };
  }

  return {
    ok: true,
    type,
  };
}

/* =========================================================
   LIMPIEZA LOCAL
========================================================= */

/**
 * Limpia exclusivamente estado vigente de autenticación WELI.
 *
 * No existen:
 * - claves RAFC;
 * - user_info;
 * - snapshots de usuario.
 */
function clearLocalAuth() {
  clearToken();
  clearSelectedAcademia();
  safeStorageRemove(MUST_CHANGE_PASSWORD_KEY);

  /**
   * weli_auth_debug NO se elimina.
   * Es una configuración de desarrollo y no forma
   * parte de la sesión ni contiene PII.
   */
}

/* =========================================================
   LOGIN PANEL
========================================================= */

/**
 * POST /api/auth/login
 *
 * Body:
 * {
 *   nombre_usuario,
 *   password
 * }
 *
 * Admin/Staff:
 * academia_id viene desde DB y queda firmada en JWT.
 *
 * Superadmin:
 * selecciona academia posteriormente.
 */
export async function login(nombre_usuario, password, options = {}) {
  const username = String(nombre_usuario ?? "").trim();

  const secret = String(password ?? "");

  /* -------------------------------------------------------
     VALIDACIÓN LOCAL
  ------------------------------------------------------- */

  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    const error = new Error("Nombre de usuario inválido");

    error.code = "INVALID_USERNAME";
    throw error;
  }

  if (secret.length < MIN_PASSWORD_LENGTH || secret.length > MAX_PASSWORD_LENGTH) {
    const error = new Error("Contraseña inválida");

    error.code = "INVALID_PASSWORD";
    throw error;
  }

  try {
    /* -----------------------------------------------------
       LIMPIAR SESIÓN ANTERIOR
    ----------------------------------------------------- */

    clearLocalAuth();

    /* -----------------------------------------------------
       LOGIN PÚBLICO
    ----------------------------------------------------- */

    const res = await postWithTimeout(
      apiPublic,
      "/auth/login",
      {
        nombre_usuario: username,
        password: secret,
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        ...options,
      }
    );

    const data = res?.data ?? {};

    const token = typeof data?.token === "string" ? data.token.trim() : "";

    if (!token) {
      const error = new Error("El servidor no entregó un token válido");

      error.code = "NO_TOKEN";
      throw error;
    }

    /* -----------------------------------------------------
       VALIDAR JWT ANTES DE PERSISTIR
    ----------------------------------------------------- */

    const tokenInfo = validatePanelTokenLocal(token);

    if (!tokenInfo.ok) {
      clearToken();

      const error = new Error("El servidor entregó una sesión inválida");

      error.code = "INVALID_SESSION";
      throw error;
    }

    /* -----------------------------------------------------
       PERSISTIR SESIÓN
    ----------------------------------------------------- */

    const stored = setToken(token);

    if (!stored) {
      clearToken();

      const error = new Error("No fue posible almacenar la sesión");

      error.code = "TOKEN_STORAGE_ERROR";
      throw error;
    }

    /**
     * Nunca se restaura una academia seleccionada
     * anteriormente.
     *
     * Para Superadmin, una academia nueva debe elegirse
     * explícitamente desde SuperDashboard.
     */
    clearSelectedAcademia();

    if (AUTH_DEBUG) {
      console.log("[WELI AUTH] login context", {
        rol: tokenInfo.rol,
        academiaJwt: tokenInfo.academia_id,
        superadmin: tokenInfo.rol === 3,
      });
    }

    return res;
  } catch (err) {
    /**
     * Nunca dejamos una sesión parcial cuando el
     * proceso de autenticación falla.
     */
    clearToken();
    clearSelectedAcademia();
    safeStorageRemove(MUST_CHANGE_PASSWORD_KEY);

    if (AUTH_DEBUG || import.meta.env.DEV) {
      console.warn("[WELI] Error en login:", err?.message ?? "Error");
    }

    throw err;
  }
}

/* =========================================================
   LOGIN APODERADO
========================================================= */

/**
 * POST /api/auth-apoderado/login
 *
 * Body:
 * {
 *   rut,
 *   password
 * }
 *
 * El RUT enviado utiliza exclusivamente el cuerpo
 * numérico de 7 u 8 dígitos.
 */
export async function loginApoderado(rut, password, options = {}) {
  const rutClean = normalizeRut(rut);
  const secret = String(password ?? "");

  /* -------------------------------------------------------
     VALIDACIÓN LOCAL
  ------------------------------------------------------- */

  if (!isValidRut(rutClean)) {
    const error = new Error("RUT inválido");

    error.code = "INVALID_RUT";
    throw error;
  }

  if (secret.length < MIN_PASSWORD_LENGTH || secret.length > MAX_PASSWORD_LENGTH) {
    const error = new Error("Contraseña inválida");

    error.code = "INVALID_PASSWORD";
    throw error;
  }

  try {
    /* -----------------------------------------------------
       LIMPIAR SESIÓN ANTERIOR
    ----------------------------------------------------- */

    /**
     * Una nueva sesión de apoderado reemplaza cualquier
     * sesión previa del panel.
     */
    clearLocalAuth();

    /* -----------------------------------------------------
       LOGIN PÚBLICO
    ----------------------------------------------------- */

    const res = await postWithTimeout(
      apiPublic,
      "/auth-apoderado/login",
      {
        rut: rutClean,
        password: secret,
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        ...options,
      }
    );

    const data = res?.data ?? {};

    const token = typeof data?.token === "string" ? data.token.trim() : "";

    if (!token) {
      const error = new Error("El servidor no entregó un token válido");

      error.code = "NO_TOKEN";
      throw error;
    }

    /* -----------------------------------------------------
       VALIDAR JWT ANTES DE PERSISTIR
    ----------------------------------------------------- */

    const tokenInfo = validateApoderadoTokenLocal(token);

    if (!tokenInfo.ok) {
      clearToken();

      const error = new Error("El servidor entregó una sesión de apoderado inválida");

      error.code = "INVALID_SESSION";
      throw error;
    }

    /* -----------------------------------------------------
       PERSISTIR JWT
    ----------------------------------------------------- */

    const stored = setToken(token);

    if (!stored) {
      clearToken();

      const error = new Error("No fue posible almacenar la sesión");

      error.code = "TOKEN_STORAGE_ERROR";
      throw error;
    }

    /**
     * Una sesión de apoderado jamás conserva contexto
     * seleccionado por un Superadmin.
     */
    clearSelectedAcademia();

    /* -----------------------------------------------------
       CAMBIO OBLIGATORIO DE CONTRASEÑA
    ----------------------------------------------------- */

    if (typeof data?.must_change_password !== "undefined") {
      const mustChange = data.must_change_password === true || Number(data.must_change_password) === 1;

      safeStorageSet(MUST_CHANGE_PASSWORD_KEY, mustChange ? "1" : "0");
    } else {
      safeStorageRemove(MUST_CHANGE_PASSWORD_KEY);
    }

    return res;
  } catch (err) {
    clearToken();
    clearSelectedAcademia();
    safeStorageRemove(MUST_CHANGE_PASSWORD_KEY);

    if (AUTH_DEBUG || import.meta.env.DEV) {
      console.warn("[WELI] Error en loginApoderado:", err?.message ?? "Error");
    }

    throw err;
  }
}

/* =========================================================
   LOGOUT HELPER
========================================================= */

/**
 * El logout utiliza apiPrivate porque debe enviar
 * el Bearer correspondiente a la sesión actual.
 *
 * La limpieza local se realizará igualmente aunque
 * el backend no responda.
 */
async function safePostLogout(path) {
  const token = getToken();

  if (!token) return;

  try {
    await postWithTimeout(apiPrivate, path, null, {
      timeoutMs: LOGOUT_TIMEOUT_MS,
    });
  } catch {
    /**
     * Logout idempotente desde el frontend.
     * La sesión local se limpiará de todas formas.
     */
  }
}

/* =========================================================
   LOGOUT PANEL
========================================================= */

export async function logoutAdmin() {
  try {
    await safePostLogout("/auth/logout");
  } finally {
    clearLocalAuth();
  }
}

/* =========================================================
   LOGOUT APODERADO
========================================================= */

export async function logoutApoderado() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } finally {
    clearLocalAuth();
  }
}

/* =========================================================
   LOGOUT AUTOMÁTICO
========================================================= */

/**
 * Se mantiene para componentes que todavía no conocen
 * explícitamente el tipo de sesión.
 *
 * Ambos endpoints se consideran idempotentes desde
 * la perspectiva del frontend.
 */
export async function logoutAuto() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } catch {}

  try {
    await safePostLogout("/auth/logout");
  } catch {}

  clearLocalAuth();
}
