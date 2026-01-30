// src/services/auth.js
import api, { setToken, clearToken, getToken, TOKEN_KEY } from "./api";

/* ───────────────────────────────
   Config
──────────────────────────────── */
const AUTH_DEBUG =
  String(import.meta?.env?.VITE_AUTH_DEBUG ?? "0") === "1" ||
  String(localStorage.getItem("weli_auth_debug") ?? "0") === "1";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Normaliza: solo dígitos (RUT sin DV) */
function normalizeRut(rut) {
  return String(rut ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Wrapper para medir tiempos y cortar requests colgados */
async function postWithTimeout(path, body, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const isPublic = Boolean(opts.isPublic);

  const t0 = performance.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await api.post(path, body, {
      signal: controller.signal,
      meta: { isPublic },
    });

    const t1 = performance.now();
    if (AUTH_DEBUG) {
      console.log("[WELI AUTH]", path, "OK", {
        ms: Math.round(t1 - t0),
        baseURL: res?.config?.baseURL,
      });
    }

    return res.data;
  } catch (err) {
    const t1 = performance.now();

    // api.js normaliza: preferimos err.status / err.message
    const status = err?.status ?? err?.response?.status ?? 0;
    const msg =
      err?.message ||
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      "Error";

    if (AUTH_DEBUG) {
      console.log("[WELI AUTH]", path, "FAIL", {
        ms: Math.round(t1 - t0),
        status,
        msg,
        url: err?.config?.url,
        baseURL: err?.config?.baseURL,
      });
    }

    if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") {
      const e = new Error("TIMEOUT");
      e.code = "TIMEOUT";
      throw e;
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────────────
   LOGIN (Admin/Staff)
   POST /api/auth/login -> { token }
──────────────────────────────── */
export async function login(nombre_usuario, password, options = {}) {
  try {
    const data = await postWithTimeout(
      "/auth/login",
      { nombre_usuario, password },
      { timeoutMs: 10_000, isPublic: true, ...options }
    );

    // backend actual: { token }
    if (data?.token) setToken(data.token);
    return data;
  } catch (err) {
    console.error("[WELI] Error en login:", err?.message || err);
    throw err;
  }
}

/* ───────────────────────────────
   LOGIN APODERADO
   POST /api/auth-apoderado/login -> { token, must_change_password }
──────────────────────────────── */
export async function loginApoderado(rut, password) {
  const rutClean = normalizeRut(rut);

  try {
    const data = await postWithTimeout(
      "/auth-apoderado/login",
      { rut: rutClean, password: String(password ?? "") },
      { timeoutMs: 10_000, isPublic: true }
    );

    if (data?.token) setToken(data.token);

    try {
      if (typeof data?.must_change_password !== "undefined") {
        localStorage.setItem(
          "apoderado_must_change_password",
          String(Number(data.must_change_password) === 1 ? 1 : 0)
        );
      }
    } catch {}

    return data;
  } catch (err) {
    console.error("[WELI] Error en loginApoderado:", err?.message || err);
    throw err;
  }
}

/* ───────────────────────────────
   LOGOUTS con auditoría
──────────────────────────────── */
async function safePostLogout(path) {
  const token =
    (typeof getToken === "function" ? getToken() : null) ||
    localStorage.getItem(TOKEN_KEY);

  if (!token) return;

  try {
    await postWithTimeout(path, null, { timeoutMs: 8_000, isPublic: false });
  } catch {
    // logout no debe bloquear cierre de sesión local
  }
}

function clearLocalAuth() {
  clearToken();
  try {
    localStorage.removeItem("user_info");
    localStorage.removeItem("apoderado_must_change_password");
    localStorage.removeItem("weli_auth_debug");
  } catch {}
}

/** Logout Admin/Staff */
export async function logoutAdmin() {
  try {
    await safePostLogout("/auth/logout");
  } finally {
    clearLocalAuth();
  }
}

/** Logout Apoderado */
export async function logoutApoderado() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } finally {
    clearLocalAuth();
  }
}

/** Logout “inteligente” */
export async function logoutAuto() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } catch {}
  try {
    await safePostLogout("/auth/logout");
  } catch {}
  clearLocalAuth();
}
