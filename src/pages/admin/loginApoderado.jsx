// src/pages/admin/loginApoderado.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginApoderado as loginService } from "../../services/auth";
import Footer from "../../components/footer";
import IsLoading from "../../components/isLoading";
import logoRAFC from "../../statics/logos/logo-sin-fondo.png";

import { getToken, setToken, clearToken } from "../../services/api"; // ✅ unificado

const REQUEST_TIMEOUT_MS = 10_000;

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

  const setMsgSafe = useCallback((m) => {
    if (!mountedRef.current) return;
    setMensaje(m);
  }, []);

  const setLoadingSafe = useCallback((v) => {
    if (!mountedRef.current) return;
    setIsLoading(v);
  }, []);

  // ✅ Si ya hay token, respeta redirect
  useEffect(() => {
    try {
      const t = getToken();
      if (t) navigate(redirectTo, { replace: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ✅ Limpieza fuerte previa (token + session artifacts)
    try {
      clearToken(); // weli_token + Authorization header
    } catch {}
    try {
      localStorage.removeItem("user_info");
      localStorage.removeItem("apoderado_must_change_password");
      // purga legacy
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
        res = await loginService(rut, password, { signal: controller.signal });
      } catch (err) {
        if (err?.name === "TypeError") {
          res = await loginService(rut, password);
        } else {
          throw err;
        }
      }

      const t1 = performance.now();

      // axios: { data, status... }
      const payload = res?.data ?? res ?? {};
      const token = pickTokenFromPayload(payload);

      console.log("[LOGIN APODERADO UI]", {
        ms: Math.round(t1 - t0),
        rut,
        hasToken: Boolean(token),
        keys: Object.keys(payload || {}),
      });

      if (!token) {
        setMsgSafe("❌ No se recibió token desde el servidor.");
        return;
      }

      // ✅ Guardado correcto: weli_token + header
      setToken(String(token));

      // Flag UI (backend igual manda y protege)
      const mustChange = payload?.must_change_password === true;

      try {
        localStorage.setItem("apoderado_must_change_password", mustChange ? "1" : "0");
      } catch {}

      // ✅ coherente con tu ProtectedRoute:
      if (mustChange) {
        navigate("/portal-apoderado/cambiar-clave", { replace: true });
        return;
      }

      // ✅ Defensa extra: asegura persistencia
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

      console.log("[LOGIN APODERADO UI] FAIL", {
        name: err?.name,
        status,
        msg: err?.response?.data?.message || err?.message,
        url: err?.config?.url,
        baseURL: err?.config?.baseURL,
      });

      if (err?.name === "AbortError") {
        setMsgSafe("❌ El servidor tardó demasiado (timeout). Intenta nuevamente.");
      } else if (status === 400 || status === 401) {
        const msg = err?.response?.data?.message;
        setMsgSafe(msg ? `❌ ${msg}` : "❌ Credenciales inválidas");
      } else if (status === 429) {
        const ra = Number(err?.response?.headers?.["retry-after"] ?? 0);
        setMsgSafe(ra ? `❌ Demasiados intentos. Espera ${ra}s.` : "❌ Demasiados intentos.");
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
    <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-[#1d0b0b] via-[#1d0b0b] to-[#e82d89] font-realacademy overflow-hidden">
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3">
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
      )}

      <section className="flex-grow flex items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-md">
          <div
            className="relative p-[2px] rounded-[28px]"
            style={{
              background:
                "linear-gradient(135deg, rgba(232,45,137,0.95), rgba(255,255,255,0.15), rgba(232,45,137,0.55))",
              clipPath:
                "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
            }}
          >
            <div
              className="relative rounded-[28px] px-10 py-10 bg-white/90 overflow-hidden"
              style={{
                clipPath:
                  "polygon(0% 12px, 12px 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0% calc(100% - 18px))",
              }}
            >
              <div className="flex flex-col items-center mb-7">
                <img
                  src={logoRAFC}
                  alt="WELI"
                  className="w-28 h-28 object-contain"
                  loading="eager"
                  decoding="async"
                />
                <h2 className="mt-4 text-center font-extrabold uppercase tracking-widest text-[#e82d89] text-xl">
                  Portal de Apoderados
                </h2>
                <p className="mt-2 text-xs text-gray-700 font-semibold">
                  Acceso Apoderados
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
                <div className="space-y-2">
                  <label className="text-xs font-black tracking-widest uppercase text-gray-700">
                    RUT (sin puntos ni DV)
                  </label>
                  <input
                    name="rut"
                    placeholder="16978094"
                    inputMode="numeric"
                    className="w-full rounded-xl px-4 py-3 border border-black/10 bg-white focus:outline-none focus:ring-2"
                    value={form.rut}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                    autoComplete="username"
                  />
                  <p className="text-[11px] font-semibold text-gray-600">
                    Solo números (7 u 8 dígitos). Si intentas colar un punto, lo mando a la banca. 🥷
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black tracking-widest uppercase text-gray-700">
                    Contraseña
                  </label>
                  <input
                    name="password"
                    type="password"
                    className="w-full rounded-xl px-4 py-3 border border-black/10 bg-white focus:outline-none focus:ring-2"
                    value={form.password}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl py-3 font-extrabold uppercase tracking-widest text-white bg-[#e82d89] hover:bg-[#c61f74] transition disabled:opacity-60 disabled:cursor-not-allowed"
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
                <span>Real Academy FC • Apoderados</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
