// src/pages/admin/login.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { login as loginService } from "../../services/auth";
import Footer from "../../components/footer";
import IsLoading from "../../components/isLoading";

import logoOficial from "../../statics/logo/logo-oficial.png";
import logoWeli from "../../statics/logo/logo-weli.png";

// ✅ importa api para ping al backend
import api, { getToken, setToken, clearToken } from "../../services/api";

const REQUEST_TIMEOUT_MS = 10_000;
const ACCENT = "#aa5013";

// ✅ Rutas finales (conforme a routes.jsx final)
const SUPER_DASH_PATH = "/super-dashboard";
const ADMIN_DASH_PATH = "/admin";

/* ───────────────────────── Helpers ───────────────────────── */
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
    payload?.rafc_token
  );
}

function pickUserFromPayload(payload) {
  return payload?.user || payload?.usuario || payload?.apoderado || null;
}

function safePath(p, fallback = "") {
  if (typeof p !== "string") return fallback;
  if (!p.startsWith("/")) return fallback;
  return p;
}

function roleFromPayloadOrToken(payload, token) {
  // 1) payload
  const rolPayload = Number(payload?.rol_id ?? payload?.user?.rol_id ?? 0);
  if (Number.isFinite(rolPayload) && rolPayload > 0) return rolPayload;

  // 2) token
  try {
    const decoded = jwtDecode(token);
    const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? 0;
    const rolToken = Number(raw);
    return Number.isFinite(rolToken) ? rolToken : 0;
  } catch {
    return 0;
  }
}

function defaultByRole(rol_id) {
  return rol_id === 3 ? SUPER_DASH_PATH : ADMIN_DASH_PATH;
}

function isAllowedRedirectForRole(path, rol_id) {
  if (!path) return false;
  // ✅ Superadmin: solo permitir caer en /super-dashboard o /admin*
  if (rol_id === 3) return path === SUPER_DASH_PATH || path.startsWith("/admin");
  // ✅ Admin/Staff: solo /admin*
  return path.startsWith("/admin");
}

function hardClearLocal() {
  try {
    clearToken();
  } catch {}
  try {
    localStorage.removeItem("user_info");
    localStorage.removeItem("apoderado_must_change_password");
    localStorage.removeItem("rafc_token");
    localStorage.removeItem("rafc_auth_debug");
    localStorage.removeItem("weli_selected_academia");
  } catch {}
}

export default function Login() {
  const [form, setForm] = useState({ nombre_usuario: "", password: "" });
  const [mensaje, setMensaje] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // si ProtectedRoute manda { state: { from: location.pathname } }
  const rawRedirect = location?.state?.from;
  const redirectRequested = safePath(rawRedirect, "");

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

  // ✅ Boot: si hay token, valida exp + ping backend, y redirige SEGÚN ROL
  useEffect(() => {
    let alive = true;

    const boot = async () => {
      let t = "";
      try {
        t = getToken() || "";
      } catch {}

      if (!t) return;

      // 1) Exp local (corta tokens vencidos)
      try {
        const decoded = jwtDecode(t);
        const now = Math.floor(Date.now() / 1000);
        if (decoded?.exp && now >= decoded.exp - 30) {
          hardClearLocal();
          return;
        }
      } catch {
        hardClearLocal();
        return;
      }

      // 2) Ping rápido al backend (si no responde, NO redirigir)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);

      try {
        await api.get("/health", {
          signal: controller.signal,
          meta: { isPublic: true },
        });

        if (!alive) return;

        // ✅ Rol desde token
        const decoded = jwtDecode(t);
        const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? 0;
        const rol_id = Number(raw);
        const rol = Number.isFinite(rol_id) ? rol_id : 0;

        navigate(defaultByRole(rol), { replace: true });
      } catch {
        hardClearLocal();
      } finally {
        clearTimeout(timer);
      }
    };

    boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // limpiar sesión previa
    hardClearLocal();

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, REQUEST_TIMEOUT_MS);

    try {
      const res = await loginService(nombre_usuario, password, {
        signal: controller.signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      const payload = res?.data ?? res ?? {};
      const token = pickTokenFromPayload(payload);

      if (!token) {
        console.log("[LOGIN ADMIN UI] token missing", {
          nombre_usuario,
          payloadKeys: Object.keys(payload || {}),
          payload,
        });
        setMsgSafe("❌ No se recibió token desde el servidor.");
        return;
      }

      // ✅ ÚNICA forma correcta de persistir: setToken (weli_token + header)
      setToken(String(token));

      const user = pickUserFromPayload(payload);
      if (user) {
        try {
          localStorage.setItem("user_info", safeJsonStringify(user));
        } catch {}
      }

      // ✅ Rol: payload o token (fallback)
      const rol_id = roleFromPayloadOrToken(payload, String(token));
      const fallback = defaultByRole(rol_id);

      // ✅ Redirect solicitado (si es válido para el rol); si no, fallback por rol
      const finalRedirect =
        redirectRequested && isAllowedRedirectForRole(redirectRequested, rol_id)
          ? redirectRequested
          : fallback;

      navigate(finalRedirect, { replace: true });
    } catch (err) {
      const status = err?.response?.status ?? err?.status;

      if (err?.code === "TIMEOUT" || err?.name === "AbortError") {
        setMsgSafe("❌ El servidor tardó demasiado (timeout). Intenta nuevamente.");
      } else if (status === 400 || status === 401) {
        const msg = err?.response?.data?.message;
        setMsgSafe(msg ? `❌ ${msg}` : "❌ Credenciales inválidas");
      } else if (status === 403) {
        const msg = err?.response?.data?.message;
        setMsgSafe(msg ? `❌ ${msg}` : "❌ Acceso denegado");
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-ra-marron via-ra-terracotta to-ra-sand font-sans">
      {/* Halo / difuminado WELI */}
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
          {/* Left image (desktop) */}
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

          {/* Right form */}
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
                  Ingreso Panel
                </h2>
                <p className="text-sm text-white/70 mt-2 text-center">
                  Entrarás automáticamente al panel según tu rol.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {/* Usuario */}
                <div className="flex items-center w-full bg-transparent border border-white/20 h-12 rounded-full overflow-hidden pl-5 gap-3">
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z"
                      fill="rgba(255,255,255,0.65)"
                    />
                  </svg>

                  <input
                    name="nombre_usuario"
                    placeholder="Nombre de usuario"
                    autoComplete="username"
                    className="bg-transparent text-white/90 placeholder-white/50 outline-none text-sm w-full h-full pr-5"
                    value={form.nombre_usuario}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                {/* Password */}
                <div className="flex items-center w-full bg-transparent border border-white/20 h-12 rounded-full overflow-hidden pl-5 gap-3">
                  <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

                {mensaje && (
                  <div className="text-center text-sm font-bold text-red-300">{mensaje}</div>
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
