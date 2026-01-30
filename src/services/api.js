// src/services/api.js
import axios from "axios";

export const TOKEN_KEY = "weli_token";

/* -------------------- Base URL (determinista) -------------------- */
const pickBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  let url =
    (typeof envUrl === "string" && envUrl.trim()) || "http://127.0.0.1:8000";

  url = url.trim();

  // Si alguien pegó una URL con query/hash, las quitamos
  url = url.split("#")[0].split("?")[0];

  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (url.endsWith("/")) url = url.slice(0, -1);

  // Asegura sufijo /api (solo una vez)
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

// Seteo inicial (opcional pero útil)
const bootToken = getToken();
if (bootToken) apiPrivate.defaults.headers.common.Authorization = `Bearer ${bootToken}`;

const api = apiPrivate;

/* -------------------- Interceptors (PUBLIC) -------------------- */
apiPublic.interceptors.request.use((config) => {
  const headers = config.headers ?? {};
  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };
  delete plain.Authorization;
  delete plain.authorization;
  config.headers = plain;
  return config;
});

/* -------------------- Interceptors (PRIVATE) -------------------- */
apiPrivate.interceptors.request.use((config) => {
  const token = getToken();

  const headers = config.headers ?? {};
  const plain = typeof headers?.toJSON === "function" ? headers.toJSON() : { ...headers };

  if (token) plain.Authorization = `Bearer ${token}`;
  else {
    delete plain.Authorization;
    delete plain.authorization;
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
      message:
        (data && (data.message || data.detail || data.error)) ||
        error?.message ||
        "Error de red o del servidor",
      data,
      // en prod, no arrastres _raw/config/request (evita filtraciones en logs)
      ...(import.meta.env.DEV
        ? { response: error?.response || null, request: error?.request || null, code: error?.code, config: error?.config, _raw: error }
        : {}),
    };

    return Promise.reject(norm);
  }
);

export default api;
