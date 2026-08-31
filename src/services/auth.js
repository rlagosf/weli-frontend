// src/services/auth.js

import {
  apiPublic,
  apiPrivate,
  setToken,
  clearToken,
  getToken,
  ACADEMIA_STORAGE_KEY,
  clearSelectedAcademia,
  decodeJwtPayload,
} from "./api";

/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_TIMEOUT_MS = 10_000;

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
  String(import.meta?.env?.VITE_AUTH_DEBUG ?? "0") === "1" || String(safeStorageGet("weli_auth_debug") ?? "0") === "1";

/* =========================================================
   RUT
========================================================= */

/**
 * RUT sin DV.
 *
 * En el modelo actual WELI el RUT numérico
 * se envía sin puntos, guion ni dígito verificador.
 */
function normalizeRut(rut) {
  return String(rut ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

/**
 * Combina:
 *
 * - AbortSignal externo
 * - timeout interno
 *
 * y además distingue un timeout real
 * de una cancelación solicitada por el componente.
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
    if (timer) {
      clearTimeout(timer);
    }

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
 * Permite decidir explícitamente si una llamada
 * pertenece al cliente público o privado.
 *
 * LOGIN:
 *   apiPublic
 *
 * LOGOUT:
 *   apiPrivate
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

    /*
     * Cancelación causada realmente
     * por nuestro timeout.
     */
    if (canceled && didTimeout()) {
      const timeoutError = new Error("TIMEOUT");

      timeoutError.code = "TIMEOUT";

      if (status) {
        timeoutError.status = status;
      }

      throw timeoutError;
    }

    /*
     * Cancelación externa:
     * dejamos que Axios conserve
     * su semántica original.
     */
    throw err;
  } finally {
    cleanup();
  }
}

/* =========================================================
   VALIDACIÓN LOCAL DEL TOKEN
========================================================= */

/**
 * IMPORTANTE:
 *
 * Solo validación de coherencia para frontend.
 *
 * NO verifica firma JWT.
 *
 * La autenticidad del token sigue dependiendo
 * exclusivamente del backend.
 */
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

  if (!Number.isInteger(rol) || ![1, 2, 3].includes(rol)) {
    return {
      ok: false,
      rol: 0,
      academia_id: null,
    };
  }

  /*
   * También podemos detectar localmente
   * expiración evidente.
   *
   * Esto NO reemplaza al backend.
   */
  const exp = Number(payload?.exp ?? 0);

  if (!Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return {
      ok: false,
      rol: 0,
      academia_id: null,
    };
  }

  const rawAcademia = payload?.academia_id ?? payload?.user?.academia_id ?? null;

  const academiaId = rawAcademia == null ? null : Number(rawAcademia);

  /*
   * Admin / Staff:
   * academia debe venir firmada.
   */
  if ((rol === 1 || rol === 2) && (!Number.isInteger(academiaId) || academiaId <= 0)) {
    return {
      ok: false,
      rol,
      academia_id: null,
    };
  }

  /*
   * Superadmin:
   * academia firmada puede ser NULL.
   */
  return {
    ok: true,
    rol,

    academia_id: Number.isInteger(academiaId) && academiaId > 0 ? academiaId : null,
  };
}

/* =========================================================
   LOGIN PANEL
========================================================= */

/**
 * POST /api/auth/login
 *
 * Body:
 *
 * {
 *   nombre_usuario,
 *   password
 * }
 *
 * NO:
 *
 * {
 *   academia_id
 * }
 *
 * La academia de Admin/Staff viene de DB
 * y queda firmada dentro del JWT.
 *
 * El Superadmin selecciona posteriormente
 * academia desde el SuperDashboard.
 */
export async function login(nombre_usuario, password, options = {}) {
  const username = String(nombre_usuario ?? "").trim();

  const secret = String(password ?? "");

  /*
   * Validación básica de cliente.
   *
   * La validación real permanece en backend/Zod.
   */
  if (!username) {
    const error = new Error("Nombre de usuario requerido");

    error.code = "INVALID_USERNAME";

    throw error;
  }

  if (!secret) {
    const error = new Error("Contraseña requerida");

    error.code = "INVALID_PASSWORD";

    throw error;
  }

  try {
    /*
     * Eliminamos contexto de una sesión
     * anterior antes de autenticar.
     *
     * Especialmente importante si el usuario
     * anterior era Superadmin.
     */
    clearToken();

    clearSelectedAcademia?.();

    safeStorageRemove("user_info");

    safeStorageRemove("apoderado_must_change_password");

    /*
     * LOGIN SIEMPRE PÚBLICO.
     *
     * Esto garantiza que no viaje:
     *
     * Authorization viejo
     * x-academia-id viejo
     */
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

    /*
     * Sanity check local.
     *
     * No autentica criptográficamente.
     */
    const tokenInfo = validatePanelTokenLocal(token);

    if (!tokenInfo.ok) {
      clearToken();

      const error = new Error("El servidor entregó una sesión inválida");

      error.code = "INVALID_SESSION";

      throw error;
    }

    /*
     * Solo almacenamos después de comprobar
     * que el token tiene una estructura
     * coherente con WELI.
     */
    const stored = setToken(token);

    if (!stored) {
      const error = new Error("No fue posible almacenar la sesión");

      error.code = "TOKEN_STORAGE_ERROR";

      throw error;
    }

    /*
     * Por seguridad NO restauramos ninguna
     * academia seleccionada anteriormente.
     *
     * Superadmin tendrá que seleccionar
     * academia explícitamente.
     */
    clearSelectedAcademia?.();

    if (AUTH_DEBUG) {
      console.log("[WELI AUTH] login context", {
        rol: tokenInfo.rol,

        academiaJwt: tokenInfo.academia_id,

        superadmin: tokenInfo.rol === 3,
      });
    }

    return res;
  } catch (err) {
    /*
     * Evitamos dejar media sesión
     * cuando el login no termina.
     */
    clearToken();

    if (AUTH_DEBUG || import.meta.env.DEV) {
      console.warn("[WELI] Error en login:", err?.message || err);
    }

    throw err;
  }
}

/* =========================================================
   LOGIN APODERADO
========================================================= */

export async function loginApoderado(rut, password, options = {}) {
  const rutClean = normalizeRut(rut);

  const secret = String(password ?? "");

  if (!rutClean) {
    const error = new Error("RUT requerido");

    error.code = "INVALID_RUT";

    throw error;
  }

  if (!secret) {
    const error = new Error("Contraseña requerida");

    error.code = "INVALID_PASSWORD";

    throw error;
  }

  try {
    /*
     * Una nueva sesión de apoderado reemplaza
     * cualquier sesión del panel anterior.
     */
    clearToken();

    clearSelectedAcademia?.();

    safeStorageRemove("user_info");

    /*
     * LOGIN APODERADO TAMBIÉN ES PÚBLICO.
     */
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

    const stored = setToken(token);

    if (!stored) {
      const error = new Error("No fue posible almacenar la sesión");

      error.code = "TOKEN_STORAGE_ERROR";

      throw error;
    }

    /*
     * Contexto de academia del panel nunca
     * debe sobrevivir una sesión apoderado.
     */
    clearSelectedAcademia?.();

    if (typeof data?.must_change_password !== "undefined") {
      const mustChange = data.must_change_password === true || Number(data.must_change_password) === 1;

      safeStorageSet("apoderado_must_change_password", mustChange ? "1" : "0");
    } else {
      safeStorageRemove("apoderado_must_change_password");
    }

    return res;
  } catch (err) {
    clearToken();

    if (AUTH_DEBUG || import.meta.env.DEV) {
      console.warn("[WELI] Error en loginApoderado:", err?.message || err);
    }

    throw err;
  }
}

/* =========================================================
   LOGOUT HELPER
========================================================= */

async function safePostLogout(path) {
  const token = getToken();

  if (!token) {
    return;
  }

  try {
    /*
     * LOGOUT usa apiPrivate porque aquí
     * sí necesitamos enviar el Bearer token.
     */
    await postWithTimeout(apiPrivate, path, null, {
      timeoutMs: 8_000,
    });
  } catch {
    /*
     * Logout es idempotente desde frontend.
     *
     * Aunque el servidor no responda,
     * limpiamos la sesión local.
     */
  }
}

/* =========================================================
   CLEAR LOCAL AUTH
========================================================= */

function clearLocalAuth() {
  clearToken();

  /*
   * Muy importante:
   *
   * nunca dejar la academia elegida por
   * un Superadmin anterior.
   */
  clearSelectedAcademia?.();

  /*
   * Fallback por compatibilidad por si
   * clearSelectedAcademia no estuviese
   * disponible durante alguna transición.
   */
  if (ACADEMIA_STORAGE_KEY) {
    safeStorageRemove(ACADEMIA_STORAGE_KEY);
  }

  safeStorageRemove("user_info");

  safeStorageRemove("apoderado_must_change_password");

  /*
   * No eliminamos weli_auth_debug.
   *
   * Es configuración de desarrollo,
   * no información de sesión.
   */
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
 * Se conserva para componentes que todavía
 * no conocen explícitamente el tipo de sesión.
 *
 * Los endpoints son idempotentes desde
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
