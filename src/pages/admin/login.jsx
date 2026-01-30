// src/pages/admin/login.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login as loginService } from "../../services/auth";
import Footer from "../../components/footer";
import IsLoading from "../../components/isLoading";
import logoRAFC from "../../statics/logos/logo-sin-fondo.png";

import { getToken, setToken, clearToken } from "../../services/api"; // ✅ unificado

const REQUEST_TIMEOUT_MS = 10_000;

// ✅ Estilo RAFC (nostalgia): rosa oficial
const ACCENT = "#e82d89";

/* ───────────────────────────────
   Helpers
─────────────────────────────── */
function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}

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

function pickUserFromPayload(payload) {
  return payload?.user || payload?.usuario || payload?.apoderado || null;
}

export default function Login() {
  const [form, setForm] = useState({ nombre_usuario: "", password: "" });
  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const rawRedirect = location?.state?.from || "/admin";
  const redirectTo =
    typeof rawRedirect === "string" && rawRedirect.startsWith("/")
      ? rawRedirect
      : "/admin";

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

    if (name === "password") {
      setForm((prev) => ({ ...prev, password: value }));
      return;
    }

    if (name === "nombre_usuario") {
      setForm((prev) => ({ ...prev, nombre_usuario: value.trimStart() }));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setMsgSafe("");

    const nombre_usuario = String(form.nombre_usuario ?? "").trim();
    const password = String(form.password ?? "");

    if (nombre_usuario.length < 3 || password.length < 4) {
      setMsgSafe("❌ Usuario y/o contraseña muy cortos");
      return;
    }

    setLoadingSafe(true);

    try {
      clearToken();
    } catch {}
    try {
      localStorage.removeItem("user_info");
      localStorage.removeItem("apoderado_must_change_password");
      localStorage.removeItem("rafc_token");
      localStorage.removeItem("rafc_auth_debug");
    } catch {}

    const t0 = performance.now();
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
        res = await loginService(nombre_usuario, password, {
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === "TypeError") {
          res = await loginService(nombre_usuario, password);
        } else {
          throw err;
        }
      }

      const t1 = performance.now();
      const payload = res?.data ?? res ?? {};

      const token = pickTokenFromPayload(payload);
      if (!token) {
        console.log("[LOGIN ADMIN UI] token missing", {
          ms: Math.round(t1 - t0),
          nombre_usuario,
          payloadKeys: Object.keys(payload || {}),
          payload,
        });
        setMsgSafe("❌ No se recibió token desde el servidor.");
        return;
      }

      setToken(String(token));

      const user = pickUserFromPayload(payload);
      if (user) {
        try {
          localStorage.setItem("user_info", safeJsonStringify(user));
        } catch {}
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      const status = err?.response?.status ?? err?.status;

      if (err?.name === "AbortError") {
        setMsgSafe("❌ El servidor tardó demasiado (timeout). Intenta nuevamente.");
      } else if (status === 400 || status === 401) {
        setMsgSafe("❌ Credenciales inválidas");
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

  // ✅ normalización focus: evita el “doble borde” (ring + outline/box-shadow del navegador)
  const INPUT_FOCUS_FIX = { outline: "none", boxShadow: "none" };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-[#1d0b0b] via-[#1d0b0b] to-[#e82d89] font-realacademy overflow-hidden">
      {/* FX RAFC: halos + textura diagonal */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-44 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full blur-3xl opacity-45"
          style={{
            background: "radial-gradient(circle, rgba(232,45,137,0.55), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-56 -left-40 w-[820px] h-[820px] rounded-full blur-3xl opacity-35"
          style={{
            background: "radial-gradient(circle, rgba(0,0,0,0.70), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.60) 0px, rgba(255,255,255,0.60) 1px, transparent 1px, transparent 14px)",
          }}
        />
      </div>

      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="relative w-full max-w-md px-4">
            <div
              className="relative rounded-[28px] p-[2px]"
              style={{
                background: `linear-gradient(135deg, rgba(232,45,137,0.95), rgba(255,255,255,0.15), rgba(232,45,137,0.55))`,
                clipPath:
                  "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
              }}
            >
              <div
                className="relative rounded-[28px] p-8 bg-black/55 border border-[#e82d89]/30"
                style={{
                  clipPath:
                    "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
                }}
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  <img
                    src="/LOGO_SIN_FONDO_ROSA.png"
                    alt="Ingresando..."
                    className="w-20 h-20 object-contain drop-shadow-[0_0_26px_rgba(232,45,137,0.9)]"
                    loading="eager"
                    decoding="async"
                  />
                  <p className="text-white font-extrabold tracking-widest uppercase text-sm">
                    Ingresando...
                  </p>
                  <IsLoading />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="flex-grow flex items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-md">
          <div
            className="relative p-[2px] rounded-[28px]"
            style={{
              background: `linear-gradient(135deg, rgba(232,45,137,0.95), rgba(255,255,255,0.15), rgba(232,45,137,0.55))`,
              clipPath:
                "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
            }}
          >
            <div
              className="relative rounded-[28px] px-10 py-10 overflow-hidden"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.80))",
                clipPath:
                  "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
              }}
            >
              <div className="relative flex flex-col items-center mb-7">
                <img
                  src={logoRAFC}
                  alt="Logo"
                  className="relative w-28 h-28 object-contain drop-shadow-[0_0_18px_rgba(232,45,137,0.35)]"
                  loading="eager"
                  decoding="async"
                />
                <h2
                  className="mt-4 text-center font-extrabold uppercase tracking-widest text-xl sm:text-2xl"
                  style={{ color: ACCENT }}
                >
                  Ingreso Administrativo
                </h2>
                <p className="mt-2 text-xs text-gray-700 text-center font-semibold tracking-wide">
                  Acceso Panel de Control
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
                <div className="space-y-2">
                  <label className="text-xs font-black tracking-widest uppercase text-gray-700">
                    Nombre de usuario
                  </label>
                  <input
                    name="nombre_usuario"
                    placeholder="Nombre de usuario"
                    autoComplete="username"
                    className="w-full rounded-xl px-4 py-3 border border-black/10 bg-white/85
                               focus:outline-none focus:ring-2 focus:ring-[#e82d89]/45 focus:border-[#e82d89]"
                    style={INPUT_FOCUS_FIX}
                    value={form.nombre_usuario}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black tracking-widest uppercase text-gray-700">
                    Contraseña
                  </label>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Contraseña"
                    className="w-full rounded-xl px-4 py-3 border border-black/10 bg-white/85
                               focus:outline-none focus:ring-2 focus:ring-[#e82d89]/45 focus:border-[#e82d89]"
                    style={INPUT_FOCUS_FIX}  // ✅ clave: igual que user (evita doble borde)
                    value={form.password}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl py-3 font-extrabold uppercase tracking-widest text-white transition duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: ACCENT,
                    boxShadow: "0 16px 40px rgba(232,45,137,0.28)",
                  }}
                >
                  {isLoading ? "Ingresando..." : "Ingresar"}
                </button>
              </form>

              {mensaje && (
                <p className="mt-4 text-center text-sm font-extrabold text-red-600">
                  {mensaje}
                </p>
              )}

              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-gray-600 font-semibold">
                <img src={logoRAFC} alt="WELI" className="w-4 h-4 object-contain opacity-90" />
                <span>Real Academy FC • Admin</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
