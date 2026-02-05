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

/**
 * Une un signal externo con un timeout.
 * Si se aborta cualquiera, abortamos el request.
 */
function buildAbortSignal({ signal, timeoutMs }) {
  const controller = new AbortController();
  const ms = Number(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let timer = null;
  let onAbort = null;

  if (ms > 0 && Number.isFinite(ms)) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, ms);
  }

  if (signal) {
    // Si el signal ya viene abortado, abortamos al toque.
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
      } catch {
        // nada
      }
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

  return { signal: controller.signal, cleanup };
}

/** Wrapper para medir tiempos + timeout + abort externo */
async function postWithTimeout(path, body, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const isPublic = Boolean(opts.isPublic);
  const externalSignal = opts.signal;

  const t0 = performance.now();

  const { signal, cleanup } = buildAbortSignal({ signal: externalSignal, timeoutMs });

  try {
    const res = await api.post(path, body, {
      signal,
      meta: { isPublic },
    });

    const t1 = performance.now();
    if (AUTH_DEBUG) {
      console.log("[WELI AUTH]", path, "OK", {
        ms: Math.round(t1 - t0),
        status: res?.status,
        baseURL: res?.config?.baseURL,
      });
    }

    return res; // ✅ respuesta completa (headers/status/data)
  } catch (err) {
    const t1 = performance.now();

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

    // axios: abort suele ser ERR_CANCELED; fetch: AbortError
    if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") {
      const e = new Error("TIMEOUT");
      e.code = "TIMEOUT";
      // dejamos status si venía
      if (status) e.status = status;
      throw e;
    }

    throw err;
  } finally {
    cleanup();
  }
}

/* ───────────────────────────────
   LOGIN (Admin/Staff/Superadmin)
   POST /api/auth/login -> { ok, token, rol_id, user }
──────────────────────────────── */
export async function login(nombre_usuario, password, options = {}) {
  try {
    const res = await postWithTimeout(
      "/auth/login",
      { nombre_usuario, password },
      { timeoutMs: DEFAULT_TIMEOUT_MS, isPublic: true, ...options }
    );

    const data = res?.data ?? {};
    if (data?.token) setToken(String(data.token));

    return res; // ✅ compat: tu UI hace res?.data ?? res
  } catch (err) {
    console.error("[WELI] Error en login:", err?.message || err);
    throw err;
  }
}

/* ───────────────────────────────
   LOGIN APODERADO
   POST /api/auth-apoderado/login -> { ok, token, must_change_password }
──────────────────────────────── */
export async function loginApoderado(rut, password, options = {}) {
  const rutClean = normalizeRut(rut);

  try {
    const res = await postWithTimeout(
      "/auth-apoderado/login",
      { rut: rutClean, password: String(password ?? "") },
      { timeoutMs: DEFAULT_TIMEOUT_MS, isPublic: true, ...options }
    );

    const data = res?.data ?? {};
    if (data?.token) setToken(String(data.token));

    try {
      if (typeof data?.must_change_password !== "undefined") {
        localStorage.setItem(
          "apoderado_must_change_password",
          String(data.must_change_password === true || Number(data.must_change_password) === 1 ? 1 : 0)
        );
      }
    } catch {}

    return res;
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

/** Logout Admin/Staff/Superadmin */
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
