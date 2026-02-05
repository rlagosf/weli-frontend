// src/pages/admin/loginApoderado.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginApoderado as loginService } from "../../services/auth";
import Footer from "../../components/footer";
import IsLoading from "../../components/isLoading";

import logoOficial from "../../statics/logo/logo-oficial.png"; // ✅ imagen lateral
import logoWeli from "../../statics/logo/logo-weli.png"; // ✅ logo dentro del form (ajusta si tu nombre difiere)

import { getToken, setToken, clearToken } from "../../services/api"; // ✅ unificado

const REQUEST_TIMEOUT_MS = 10_000;

// 🎨 WELI (cobre)
const ACCENT = "#aa5013";

function onlyDigits(s = "") {
  return String(s).replace(/\D/g, "");
}

/* ───────────────────────────────
   Helpers
─────────────────────────────── */
function pickTokenFromPayload(payload) {
  return (
    payload?.weli_token ||
    payload?.token ||
    payload?.access_token ||
    payload?.jwt ||
    payload?.bearer ||
    payload?.auth_token ||
    payload?.rafc_token // legacy backend (solo lectura)
  );
}

export default function LoginApoderado() {
  const [form, setForm] = useState({ rut: "", password: "" });
  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const rawRedirect = location?.state?.from || "/portal-apoderado";
  const redirectTo =
    typeof rawRedirect === "string" && rawRedirect.startsWith("/")
      ? rawRedirect
      : "/portal-apoderado";

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        abortRef.current?.abort?.();
      } catch {}
    };
  }, []);

  // Si ya hay token, afuera al toque
  useEffect(() => {
    try {
      const t = getToken();
      if (t) navigate(redirectTo, { replace: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMsgSafe = useCallback((m) => {
    if (!mountedRef.current) return;
    setMensaje(m);
  }, []);

  const setLoadingSafe = useCallback((v) => {
    if (!mountedRef.current) return;
    setIsLoading(v);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "rut") {
      // 7 u 8 dígitos, sin DV
      const clean = onlyDigits(value).slice(0, 8);
      setForm((prev) => ({ ...prev, rut: clean }));
      return;
    }

    if (name === "password") {
      setForm((prev) => ({ ...prev, password: value }));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setMsgSafe("");

    const rut = onlyDigits(form.rut);
    const password = String(form.password ?? "");

    if (!(rut.length === 7 || rut.length === 8) || password.length < 4) {
      setMsgSafe("❌ RUT o contraseña inválidos");
      return;
    }

    setLoadingSafe(true);

    // limpiar sesión previa
    try {
      clearToken();
    } catch {}
    try {
      localStorage.removeItem("user_info");
      localStorage.removeItem("apoderado_must_change_password");
      localStorage.removeItem("rafc_token");
      localStorage.removeItem("rafc_auth_debug");
    } catch {}

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, REQUEST_TIMEOUT_MS);

    try {
      let res;
      try {
        res = await loginService(rut, password, { signal: controller.signal });
      } catch (err) {
        // compat fetch/axios
        if (err?.name === "TypeError") res = await loginService(rut, password);
        else throw err;
      }

      const payload = res?.data ?? res ?? {};
      const token = pickTokenFromPayload(payload);

      if (!token) {
        setMsgSafe("❌ No se recibió token desde el servidor.");
        return;
      }

      setToken(String(token));

      // Flag UI (backend igual manda y protege)
      const mustChange = payload?.must_change_password === true;
      try {
        localStorage.setItem(
          "apoderado_must_change_password",
          mustChange ? "1" : "0"
        );
      } catch {}

      if (mustChange) {
        navigate("/portal-apoderado/cambiar-clave", { replace: true });
        return;
      }

      // Defensa extra: asegura persistencia
      try {
        const t = getToken();
        if (!t) {
          setMsgSafe("❌ No se pudo persistir la sesión. Intenta nuevamente.");
          return;
        }
      } catch {}

      navigate(redirectTo, { replace: true });
    } catch (err) {
      const status = err?.response?.status ?? err?.status;

      if (err?.name === "AbortError") {
        setMsgSafe("❌ El servidor tardó demasiado (timeout). Intenta nuevamente.");
      } else if (status === 400 || status === 401) {
        const msg = err?.response?.data?.message;
        setMsgSafe(msg ? `❌ ${msg}` : "❌ Credenciales inválidas");
      } else if (status === 429) {
        const ra = Number(err?.response?.headers?.["retry-after"] ?? 0);
        setMsgSafe(
          ra ? `❌ Demasiados intentos. Espera ${ra}s.` : "❌ Demasiados intentos."
        );
      } else {
        const msg = err?.response?.data?.message || err?.message || "Error de conexión";
        setMsgSafe(`❌ ${msg}`);
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setLoadingSafe(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-ra-marron via-ra-terracotta to-ra-sand font-sans">
      {/* Halo / difuminado WELI (barato) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-44 left-1/2 -translate-x-1/2 w-[920px] h-[920px] rounded-full blur-3xl opacity-35"
          style={{
            background:
              "radial-gradient(circle, rgba(170,80,19,0.55), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-56 -left-40 w-[860px] h-[860px] rounded-full blur-3xl opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(109,88,41,0.75), transparent 60%)",
          }}
        />
      </div>

      {/* Overlay Loading */}
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
          {/* ✅ Form LEFT (para diferenciar del admin) */}
          <div className="w-full md:w-1/2 flex items-center justify-center py-10">
            <form
              onSubmit={handleLogin}
              className="w-full max-w-md px-6 sm:px-10 flex flex-col"
              autoComplete="on"
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
                  Portal Apoderados
                </h2>
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
                    placeholder="RUT sin puntos ni DV (ej: 16978094)"
                    inputMode="numeric"
                    autoComplete="username"
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.rut}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>
                {/* Password */}
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
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.password}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Mensaje error */}
                {mensaje && (
                  <div className="text-center text-sm font-bold text-red-300">
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

                <p className="text-xs text-white/50 text-center mt-3">
                  WELI • Portal Apoderados
                </p>
              </div>
            </form>
          </div>

          {/* ✅ Image RIGHT (desktop) */}
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
              {/* overlay para legibilidad/estética */}
              <div className="absolute inset-0 bg-black/25" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-white/90 text-lg font-extrabold tracking-wide">
                  Portal de Apoderados
                </p>
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
