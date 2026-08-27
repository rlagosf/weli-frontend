// src/pages/admin/login.jsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { login as loginService } from "../../services/auth";
import api, { apiPublic, getToken, setToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import logoOficial from "../../statics/logo/logo-oficial.png";
import logoWeli from "../../statics/logo/logo-weli.png";

const REQUEST_TIMEOUT_MS = 10_000;
const ACCENT = "#aa5013";

const SUPER_DASH_PATH = "/super-dashboard";
const ADMIN_DASH_PATH = "/admin";

const USER_INFO_KEY = "weli_user_info";
const ALLOWED_PANEL_ROLES = new Set([1, 2, 3]);

/* ───────────────────────── Storage ───────────────────────── */

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

function clearAcademiaScope() {
  safeStorageRemove(ACADEMIA_STORAGE_KEY);
}

function hardClearLocal() {
  clearToken();
  safeStorageRemove(USER_INFO_KEY);
  clearAcademiaScope();
}

/* ───────────────────────── Helpers ───────────────────────── */

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Contrato actual de auth.ts:
 *
 * {
 *   ok: true,
 *   token: "...",
 *   rol_id: 1,
 *   user: {...}
 * }
 *
 * Ya no se aceptan nombres históricos de tokens.
 */
function pickTokenFromPayload(payload) {
  const token = payload?.token;
  return typeof token === "string" && token.trim() ? token.trim() : "";
}

function pickUserFromPayload(payload) {
  return payload?.user && typeof payload.user === "object" ? payload.user : null;
}

function safePath(path, fallback = "") {
  if (typeof path !== "string") return fallback;

  const normalized = path.trim();

  if (!normalized.startsWith("/")) return fallback;
  if (normalized.startsWith("//")) return fallback;
  if (normalized.includes("\\")) return fallback;

  return normalized;
}

function decodePanelToken(token) {
  try {
    const decoded = jwtDecode(token);

    const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);
    const exp = Number(decoded?.exp ?? 0);

    if (!Number.isInteger(rol) || !ALLOWED_PANEL_ROLES.has(rol)) return null;
    if (!Number.isFinite(exp) || exp <= 0) return null;

    return {
      decoded,
      rol_id: rol,
      exp,
    };
  } catch {
    return null;
  }
}

function defaultByRole(rol_id) {
  return rol_id === 3 ? SUPER_DASH_PATH : ADMIN_DASH_PATH;
}

function isAllowedRedirectForRole(path, rol_id) {
  if (!path || !ALLOWED_PANEL_ROLES.has(rol_id)) return false;

  const isAdminPath = path === ADMIN_DASH_PATH || path.startsWith(`${ADMIN_DASH_PATH}/`);

  if (rol_id === 3) {
    return path === SUPER_DASH_PATH || path.startsWith(`${SUPER_DASH_PATH}/`) || isAdminPath;
  }

  return isAdminPath;
}

/* ───────────────────────── Componente ───────────────────────── */

export default function Login() {
  const [form, setForm] = useState({ nombre_usuario: "", password: "" });
  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const redirectRequested = safePath(location?.state?.from, "");

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  /* ───────────────────────── Mount ───────────────────────── */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      try {
        abortRef.current?.abort?.();
      } catch {}
    };
  }, []);

  const setMsgSafe = useCallback((message) => {
    if (mountedRef.current) setMensaje(message);
  }, []);

  const setLoadingSafe = useCallback((value) => {
    if (mountedRef.current) setIsLoading(value);
  }, []);

  /* ───────────────────────── Sesión existente ───────────────────────── */

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      const token = getToken() || "";
      if (!token) return;

      const tokenInfo = decodePanelToken(token);

      if (!tokenInfo) {
        hardClearLocal();
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      /*
       * Margen de 30 segundos para evitar entrar
       * con un token prácticamente expirado.
       */
      if (now >= tokenInfo.exp - 30) {
        hardClearLocal();
        return;
      }

      /*
       * Health público:
       * solo confirma disponibilidad del backend.
       * La verdadera validación del JWT la realiza
       * authz.ts en cada endpoint protegido.
       */
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);

      try {
        await apiPublic.get("/health", {
          signal: controller.signal,
        });

        if (!alive) return;

        /*
         * Ningún usuario debe conservar un selector tenant
         * procedente de una sesión anterior.
         *
         * - Admin/Staff usan academia_id del JWT.
         * - Superadmin elegirá academia nuevamente.
         */
        clearAcademiaScope();

        navigate(defaultByRole(tokenInfo.rol_id), {
          replace: true,
        });
      } catch {
        /*
         * Si el backend simplemente está caído,
         * no destruimos una sesión todavía válida.
         *
         * Solo evitamos la redirección automática.
         */
      } finally {
        clearTimeout(timer);
      }
    };

    void boot();

    return () => {
      alive = false;
    };
  }, [navigate]);

  /* ───────────────────────── Inputs ───────────────────────── */

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === "nombre_usuario") {
      setForm((prev) => ({
        ...prev,
        nombre_usuario: value.trimStart(),
      }));
      return;
    }

    if (name === "password") {
      /*
       * No se eliminan comillas ni caracteres especiales.
       *
       * La contraseña debe viajar exactamente como fue escrita.
       * SQL Injection se evita en auth.ts mediante query parametrizada.
       */
      setForm((prev) => ({
        ...prev,
        password: value,
      }));
    }
  };

  /* ───────────────────────── Login ───────────────────────── */

  const handleLogin = async (event) => {
    event.preventDefault();

    if (isLoading) return;

    setMsgSafe("");

    const nombre_usuario = String(form.nombre_usuario ?? "").trim();
    const password = String(form.password ?? "");

    /*
     * Mismos límites funcionales utilizados por LoginSchema
     * en auth.ts.
     */
    if (nombre_usuario.length < 3 || nombre_usuario.length > 80) {
      setMsgSafe("❌ El nombre de usuario debe contener entre 3 y 80 caracteres.");
      return;
    }

    if (password.length < 4 || password.length > 200) {
      setMsgSafe("❌ La contraseña debe contener entre 4 y 200 caracteres.");
      return;
    }

    setLoadingSafe(true);

    /*
     * Una nueva autenticación nunca hereda
     * datos de una sesión anterior.
     */
    hardClearLocal();

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await loginService(nombre_usuario, password, {
        signal: controller.signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      const payload = response?.data ?? response ?? {};
      const token = pickTokenFromPayload(payload);

      if (!token) {
        setMsgSafe("❌ El servidor no entregó un token de autenticación válido.");
        return;
      }

      /* ───────── Validar JWT recibido ───────── */

      const tokenInfo = decodePanelToken(token);

      if (!tokenInfo) {
        hardClearLocal();
        setMsgSafe("❌ El servidor entregó una sesión inválida.");
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      if (now >= tokenInfo.exp) {
        hardClearLocal();
        setMsgSafe("❌ El servidor entregó una sesión expirada.");
        return;
      }

      /*
       * El rol retornado fuera del JWT debe coincidir
       * con el rol firmado dentro del token.
       */
      const payloadRole = Number(payload?.rol_id ?? payload?.user?.rol_id ?? 0);

      if (!Number.isInteger(payloadRole) || payloadRole !== tokenInfo.rol_id) {
        hardClearLocal();
        setMsgSafe("❌ La información de sesión recibida es inconsistente.");
        return;
      }

      /* ───────── Persistir token WELI ───────── */

      const tokenStored = setToken(token);

      if (!tokenStored) {
        hardClearLocal();
        setMsgSafe("❌ No fue posible almacenar la sesión de forma local.");
        return;
      }

      /* ───────── Información visible del usuario ───────── */

      const user = pickUserFromPayload(payload);

      if (user) {
        const userJson = safeJsonStringify(user);

        if (userJson) {
          safeStorageSet(USER_INFO_KEY, userJson);
        }
      }

      /*
       * Nunca persistimos academia para Admin/Staff.
       *
       * api.js:
       * - rol 1/2 → academia_id desde JWT.
       * - rol 3   → selector posterior.
       */
      clearAcademiaScope();

      /* ───────── Redirect ───────── */

      const fallback = defaultByRole(tokenInfo.rol_id);

      const finalRedirect =
        redirectRequested && isAllowedRedirectForRole(redirectRequested, tokenInfo.rol_id)
          ? redirectRequested
          : fallback;

      navigate(finalRedirect, {
        replace: true,
      });
    } catch (error) {
      const status = Number(error?.response?.status ?? error?.status ?? 0);

      const message =
        error?.response?.data?.message ??
        error?.data?.message ??
        error?.message ??
        "";

      if (
        error?.code === "TIMEOUT" ||
        error?.code === "ECONNABORTED" ||
        error?.code === "ERR_CANCELED" ||
        error?.name === "AbortError" ||
        error?.name === "CanceledError"
      ) {
        setMsgSafe("❌ El servidor tardó demasiado. Intenta nuevamente.");
      } else if (status === 400 || status === 401) {
        /*
         * No diferenciamos usuario inexistente de contraseña incorrecta.
         */
        setMsgSafe("❌ Credenciales inválidas");
      } else if (status === 403) {
        setMsgSafe("❌ Acceso denegado");
      } else if (status === 429) {
        const retryAfter = Number(error?.response?.headers?.["retry-after"] ?? 0);

        setMsgSafe(
          retryAfter > 0
            ? `❌ Demasiados intentos. Intenta nuevamente en ${retryAfter} segundos.`
            : "❌ Demasiados intentos. Intenta nuevamente más tarde."
        );
      } else if (status >= 500) {
        setMsgSafe("❌ El servidor no pudo procesar el inicio de sesión.");
      } else {
        setMsgSafe(message ? `❌ ${message}` : "❌ No fue posible conectar con el servidor.");
      }
    } finally {
      clearTimeout(timeoutId);

      if (abortRef.current === controller) {
        abortRef.current = null;
      }

      setLoadingSafe(false);
    }
  };

  /* ───────────────────────── UI ───────────────────────── */

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-ra-marron via-ra-terracotta to-ra-sand font-sans">
      {/* Halo WELI */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-44 left-1/2 -translate-x-1/2 w-[920px] h-[920px] rounded-full blur-3xl opacity-35"
          style={{ background: "radial-gradient(circle, rgba(170,80,19,0.55), transparent 60%)" }}
        />

        <div
          className="absolute -bottom-56 -left-40 w-[860px] h-[860px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, rgba(109,88,41,0.75), transparent 60%)" }}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md px-4">
            <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-md p-8">
              <div className="flex flex-col items-center justify-center gap-3">
                <img
                  src={logoWeli}
                  alt="Ingresando..."
                  className="w-16 h-16 object-contain"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />

                <p className="text-white font-extrabold tracking-widest uppercase text-sm">
                  Ingresando...
                </p>

                <IsLoading />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
          {/* Imagen izquierda */}
          <div className="w-full hidden md:block md:w-1/2">
            <div className="relative h-full">
              <img
                className="h-full w-full object-cover"
                src={logoOficial}
                alt="WELI"
                loading="eager"
                decoding="async"
                draggable={false}
              />

              <div className="absolute inset-0 bg-black/25" />

              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-white/90 text-lg font-extrabold tracking-wide">
                  Administración WELI
                </p>

                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Orden, trazabilidad y control en un solo panel.
                </p>
              </div>
            </div>
          </div>

          {/* Formulario */}
          <div className="w-full md:w-1/2 flex items-center justify-center py-10">
            <form
              onSubmit={handleLogin}
              className="w-full max-w-md px-6 sm:px-10 flex flex-col"
              autoComplete="on"
              noValidate
            >
              <div className="flex flex-col items-center">
                <img
                  src={logoWeli}
                  alt="WELI"
                  className="w-16 h-16 object-contain"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />

                <h2 className="mt-4 text-3xl text-white font-extrabold tracking-tight">
                  Ingreso Panel
                </h2>

                <p className="text-sm text-white/70 mt-2 text-center">
                  Entrarás automáticamente al panel según tu rol.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {/* Usuario */}
                <div className="flex items-center w-full bg-transparent border border-white/20 h-12 rounded-full overflow-hidden pl-5 gap-3">
                  <svg
                    width="16"
                    height="11"
                    viewBox="0 0 16 11"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z"
                      fill="rgba(255,255,255,0.65)"
                    />
                  </svg>

                  <input
                    name="nombre_usuario"
                    type="text"
                    placeholder="Nombre de usuario"
                    autoComplete="username"
                    maxLength={80}
                    spellCheck={false}
                    autoCapitalize="none"
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.nombre_usuario}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Contraseña */}
                <div className="flex items-center w-full bg-transparent border border-white/20 h-12 rounded-full overflow-hidden pl-5 gap-3">
                  <svg
                    width="13"
                    height="17"
                    viewBox="0 0 13 17"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z"
                      fill="rgba(255,255,255,0.65)"
                    />
                  </svg>

                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Contraseña"
                    minLength={4}
                    maxLength={200}
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.password}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                {mensaje && (
                  <div className="text-center text-sm font-bold text-red-300" role="alert">
                    {mensaje}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full h-11 rounded-full text-white font-extrabold tracking-wide disabled:opacity-70 disabled:cursor-not-allowed transition-opacity"
                  style={{ backgroundColor: ACCENT }}
                >
                  {isLoading ? "Ingresando..." : "Ingresar"}
                </button>

                <p className="text-xs text-white/50 text-center mt-3">
                  WELI • Panel Administrativo
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}