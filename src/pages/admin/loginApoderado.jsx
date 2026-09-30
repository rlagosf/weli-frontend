// src/pages/admin/loginApoderado.jsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { loginApoderado as loginService } from "../../services/auth";
import { clearToken, getToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import logoOficial from "../../statics/logo/logo-oficial.png";
import logoWeli from "../../statics/logo/logo-weli.png";

/* =========================================================
   CONSTANTES
========================================================= */

const ACCENT = "#aa5013";
const PORTAL_ROOT = "/portal-apoderado";
const MAX_PASSWORD_LENGTH = 200;
const MUST_CHANGE_PASSWORD_KEY = "apoderado_must_change_password";

/* =========================================================
   HELPERS
========================================================= */

/**
 * RUT interno WELI:
 * - sólo cuerpo numérico
 * - sin puntos
 * - sin guion
 * - sin DV
 * - 7 u 8 dígitos
 */
function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

/**
 * Decodificación local exclusivamente para decisiones de UI.
 * NO valida firma, issuer ni audience.
 * La autoridad continúa siendo el backend.
 */
function decodeApoderadoToken(token) {
  try {
    const decoded = jwtDecode(token);
    const type = String(decoded?.type ?? decoded?.user?.type ?? decoded?.payload?.type ?? "")
      .trim()
      .toLowerCase();
    const exp = Number(decoded?.exp ?? 0);
    const now = Math.floor(Date.now() / 1000);

    if (type !== "apoderado") return null;
    if (!Number.isFinite(exp) || exp <= now) return null;

    return { decoded, type, exp };
  } catch {
    return null;
  }
}

/**
 * Un login de apoderado sólo puede redirigir dentro
 * del árbol /portal-apoderado.
 */
function safeApoderadoRedirect(value) {
  if (typeof value !== "string") return PORTAL_ROOT;

  const path = value.trim();

  if (path === PORTAL_ROOT || path.startsWith(`${PORTAL_ROOT}/`)) {
    return path;
  }

  return PORTAL_ROOT;
}

/**
 * Obtiene mensajes del contrato normalizado de api.js,
 * conservando compatibilidad con errores Axios anteriores.
 */
function getErrorStatus(error) {
  return Number(error?.status ?? error?.response?.status ?? 0);
}

function getBackendMessage(error) {
  return (
    error?.data?.message ??
    error?.data?.detail ??
    error?.data?.error ??
    error?.response?.data?.message ??
    error?.response?.data?.detail ??
    error?.response?.data?.error ??
    ""
  );
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function LoginApoderado() {
  const [form, setForm] = useState({ rut: "", password: "" });
  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = safeApoderadoRedirect(location?.state?.from);

  const submittingRef = useRef(false);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  /* =======================================================
     CICLO DE VIDA
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      try {
        abortRef.current?.abort?.();
      } catch {}

      abortRef.current = null;
      submittingRef.current = false;
    };
  }, []);

  /* =======================================================
     SESIÓN EXISTENTE
  ======================================================= */

  /**
   * Sólo una sesión JWT realmente perteneciente a un
   * apoderado puede provocar redirección automática.
   *
   * Un JWT del panel administrativo no se interpreta como
   * sesión del portal y tampoco se elimina desde aquí.
   */
  useEffect(() => {
    try {
      const token = getToken();

      if (token && decodeApoderadoToken(token)) {
        navigate(redirectTo, { replace: true });
      }
    } catch {}

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =======================================================
     SETTERS SEGUROS
  ======================================================= */

  const setMsgSafe = useCallback((message) => {
    if (mountedRef.current) setMensaje(message);
  }, []);

  const setLoadingSafe = useCallback((value) => {
    if (mountedRef.current) setIsLoading(value);
  }, []);

  /* =======================================================
     INPUTS
  ======================================================= */

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === "rut") {
      setForm((prev) => ({ ...prev, rut: onlyDigits(value).slice(0, 8) }));
      return;
    }

    if (name === "password") {
      setForm((prev) => ({ ...prev, password: value }));
    }
  };

  /* =======================================================
     LOGIN
  ======================================================= */

  const handleLogin = async (event) => {
    event.preventDefault();

    // Bloqueo real contra doble submit.
    if (submittingRef.current) return;

    const rut = onlyDigits(form.rut);
    const password = String(form.password ?? "");

    setMsgSafe("");

    /* -----------------------------------------------------
       VALIDACIÓN LOCAL
    ----------------------------------------------------- */

    if (!(rut.length === 7 || rut.length === 8) || password.length < 4 || password.length > MAX_PASSWORD_LENGTH) {
      setMsgSafe("❌ RUT o contraseña inválidos");
      return;
    }

    submittingRef.current = true;
    setLoadingSafe(true);

    /* -----------------------------------------------------
       ESTADO OPERACIONAL DEL PORTAL
    ----------------------------------------------------- */

    /**
     * Antes de una nueva autenticación se limpia solamente
     * el flag de cambio obligatorio de contraseña.
     *
     * No se persisten:
     * - RUT
     * - contraseña
     * - nombre
     * - email
     * - teléfono
     * - datos de jugadores
     */
    try {
      localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
    } catch {}

    /* -----------------------------------------------------
       PETICIÓN
    ----------------------------------------------------- */

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      /**
       * services/auth.js mantiene la responsabilidad de:
       * - llamar al backend;
       * - recibir el JWT;
       * - persistirlo mediante setToken();
       * - entregar must_change_password.
       *
       * Este componente NO vuelve a ejecutar setToken().
       */
      const res = await loginService(rut, password, {
        signal: controller.signal,
      });

      const payload = res?.data ?? res ?? {};

      /* ---------------------------------------------------
         VALIDAR SESIÓN PERSISTIDA
      --------------------------------------------------- */

      const token = getToken();

      if (!token) {
        setMsgSafe("❌ No se pudo persistir la sesión. Intenta nuevamente.");
        return;
      }

      /**
       * Verificación defensiva adicional.
       * Si por cualquier anomalía se almacenó un JWT que no
       * pertenece a un apoderado, se elimina inmediatamente.
       */
      if (!decodeApoderadoToken(token)) {
        clearToken();
        setMsgSafe("❌ El servidor entregó una sesión inválida.");
        return;
      }

      /* ---------------------------------------------------
         CAMBIO OBLIGATORIO DE CONTRASEÑA
      --------------------------------------------------- */

      const mustChange = payload?.must_change_password === true || Number(payload?.must_change_password) === 1;

      /**
       * Único estado adicional persistido por este componente.
       * Es un flag operacional 0/1 y no contiene PII.
       */
      try {
        localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, mustChange ? "1" : "0");
      } catch {}

      if (mustChange) {
        navigate("/portal-apoderado/cambiar-clave", {
          replace: true,
        });
        return;
      }

      /* ---------------------------------------------------
         REDIRECCIÓN
      --------------------------------------------------- */

      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (!mountedRef.current) return;

      const status = getErrorStatus(err);
      const code = String(err?.code ?? "");
      const name = String(err?.name ?? "");

      /* ---------------------------------------------------
         TIMEOUT / CANCELACIÓN
      --------------------------------------------------- */

      if (code === "TIMEOUT" || code === "ECONNABORTED") {
        setMsgSafe("❌ El servidor tardó demasiado (timeout). Intenta nuevamente.");
        return;
      }

      if (name === "AbortError" || name === "CanceledError" || code === "ERR_CANCELED") {
        return;
      }

      /* ---------------------------------------------------
         CREDENCIALES
      --------------------------------------------------- */

      if (status === 400 || status === 401) {
        /**
         * No revelamos si el problema corresponde a:
         * - RUT inexistente
         * - contraseña incorrecta
         */
        setMsgSafe("❌ Credenciales inválidas");
        return;
      }

      /* ---------------------------------------------------
         RATE LIMIT
      --------------------------------------------------- */

      if (status === 429) {
        const retryAfter = Number(
          err?.data?.retryAfter ?? err?.data?.retry_after ?? err?.response?.headers?.["retry-after"] ?? 0
        );

        setMsgSafe(
          retryAfter > 0
            ? `❌ Demasiados intentos. Espera ${retryAfter}s.`
            : "❌ Demasiados intentos. Intenta nuevamente más tarde."
        );

        return;
      }

      /* ---------------------------------------------------
         ACCESO / SERVIDOR / RED
      --------------------------------------------------- */

      if (status === 403) {
        setMsgSafe("❌ Acceso denegado");
        return;
      }

      if (status >= 500) {
        setMsgSafe("❌ El servidor no pudo procesar el inicio de sesión.");
        return;
      }

      const backendMessage = getBackendMessage(err);
      const errorMessage = backendMessage || err?.message || "No fue posible conectar con el servidor.";

      setMsgSafe(`❌ ${errorMessage}`);
    } finally {
      abortRef.current = null;
      submittingRef.current = false;
      setLoadingSafe(false);
    }
  };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-ra-marron via-ra-terracotta to-ra-sand font-sans">
      {/* Halo WELI */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-44 left-1/2 -translate-x-1/2 w-[920px] h-[920px] rounded-full blur-3xl opacity-35"
          style={{
            background: "radial-gradient(circle, rgba(170,80,19,0.55), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-56 -left-40 w-[860px] h-[860px] rounded-full blur-3xl opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(109,88,41,0.75), transparent 60%)",
          }}
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
                <p className="text-white font-extrabold tracking-widest uppercase text-sm">Ingresando...</p>
                <IsLoading />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contenido */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm">
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
                <h2 className="mt-4 text-3xl text-white font-extrabold tracking-tight">Portal Apoderados</h2>
                <p className="text-sm text-white/70 mt-2 text-center">
                  Revisa pagos, estados de cuenta y el avance del jugador.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {/* RUT */}
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
                    name="rut"
                    type="text"
                    placeholder="RUT sin puntos ni DV (ej: 16978094)"
                    inputMode="numeric"
                    autoComplete="username"
                    maxLength={8}
                    pattern="[0-9]*"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.rut}
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
                    maxLength={MAX_PASSWORD_LENGTH}
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.password}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Mensaje */}
                {mensaje && (
                  <div className="text-center text-sm font-bold text-red-300" role="alert">
                    {mensaje}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full h-11 rounded-full text-white font-extrabold tracking-wide disabled:opacity-70 disabled:cursor-not-allowed transition-opacity"
                  style={{ backgroundColor: ACCENT }}
                >
                  {isLoading ? "Ingresando..." : "Ingresar"}
                </button>

                <p className="text-xs text-white/50 text-center mt-3">WELI • Portal Apoderados</p>
              </div>
            </form>
          </div>

          {/* Imagen desktop */}
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
                <p className="text-white/90 text-lg font-extrabold tracking-wide">Portal de Apoderados</p>
                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Pagos, estado de cuentas y avance del jugador en un solo lugar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
