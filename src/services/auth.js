// src/services/auth.js
import api, { setToken, clearToken, getToken, TOKEN_KEY } from "./api";

/* ───────────────────────────────
   Config
──────────────────────────────── */
const AUTH_DEBUG =
  String(import.meta?.env?.VITE_AUTH_DEBUG ?? "0") === "1" ||
  String(localStorage.getItem("weli_auth_debug") ?? "0") === "1";

const DEFAULT_TIMEOUT_MS = 10_000;

// ✅ mismo storage que usa tu app para snapshot de academia
const ACADEMIA_STORAGE_KEY = "weli_selected_academia";

/** Normaliza: solo dígitos (RUT sin DV) */
function normalizeRut(rut) {
  return String(rut ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

/**
 * ✅ Lector robusto (alineado con src/services/api.js)
 * Soporta:
 *  - "1" (string/number)
 *  - {"id":1}, {"academia_id":1}, {"academiaId":1}
 */
function readSelectedAcademiaId() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    // Caso 1: guardado como número/string: "1"
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    // Caso 2: JSON
    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Une un signal externo con un timeout.
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

  return { signal: controller.signal, cleanup };
}

/** Wrapper para medir tiempos + timeout + abort externo */
async function postWithTimeout(path, body, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const externalSignal = opts.signal;

  const t0 = performance.now();
  const { signal, cleanup } = buildAbortSignal({ signal: externalSignal, timeoutMs });

  try {
    const res = await api.post(path, body, { signal });

    const t1 = performance.now();
    if (AUTH_DEBUG) {
      console.log("[WELI AUTH]", path, "OK", {
        ms: Math.round(t1 - t0),
        status: res?.status,
        baseURL: res?.config?.baseURL,
      });
    }

    return res;
  } catch (err) {
    const t1 = performance.now();

    const status = err?.status ?? err?.response?.status ?? 0;
    const msg = err?.message || err?.response?.data?.message || err?.response?.data?.error || "Error";

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
    // ✅ Si hay academia seleccionada, la mandamos.
    // Backend debe:
    // - exigirla solo si el usuario resultó rol 3
    // - ignorarla para roles 1/2 (su academia viene del JWT/DB)
    const academia_id = readSelectedAcademiaId();

    const body = {
      nombre_usuario,
      password,
      ...(academia_id ? { academia_id } : {}),
    };

    const res = await postWithTimeout("/auth/login", body, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      ...options,
    });

    const data = res?.data ?? {};
    if (data?.token) setToken(String(data.token));

    return res;
  } catch (err) {
    console.error("[WELI] Error en login:", err?.message || err);
    throw err;
  }
}

/* ───────────────────────────────
   LOGIN APODERADO
──────────────────────────────── */
export async function loginApoderado(rut, password, options = {}) {
  const rutClean = normalizeRut(rut);

  try {
    const res = await postWithTimeout(
      "/auth-apoderado/login",
      { rut: rutClean, password: String(password ?? "") },
      { timeoutMs: DEFAULT_TIMEOUT_MS, ...options }
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
   LOGOUTS
──────────────────────────────── */
async function safePostLogout(path) {
  const token = (typeof getToken === "function" ? getToken() : null) || localStorage.getItem(TOKEN_KEY);

  if (!token) return;

  try {
    await postWithTimeout(path, null, { timeoutMs: 8_000 });
  } catch {}
}

function clearLocalAuth() {
  clearToken();
  try {
    localStorage.removeItem("user_info");
    localStorage.removeItem("apoderado_must_change_password");
    localStorage.removeItem("weli_auth_debug"); // si quieres persistir debug, quita esta línea
  } catch {}
}

export async function logoutAdmin() {
  try {
    await safePostLogout("/auth/logout");
  } finally {
    clearLocalAuth();
  }
}

export async function logoutApoderado() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } finally {
    clearLocalAuth();
  }
}

export async function logoutAuto() {
  try {
    await safePostLogout("/auth-apoderado/logout");
  } catch {}
  try {
    await safePostLogout("/auth/logout");
  } catch {}
  clearLocalAuth();
}
