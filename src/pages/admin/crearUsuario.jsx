// src/pages/admin/crearUsuario.jsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* ───────────────────────── Configuración ───────────────────────── */

const PANEL_TYPES = new Set(["admin", "user", "staff", "superadmin"]);
const ALLOWED_CREATOR_ROLES = new Set([1, 3]);

const ACCENT = "#aa5013";

/* ───────────────────────── Helpers JWT ───────────────────────── */

function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(exp) || exp <= 0) return true;

  return now >= exp;
}

function extractType(decoded) {
  return String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();
}

function extractRol(decoded) {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function extractTokenAcademiaId(decoded) {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* ───────────────────────── Academia Superadmin ───────────────────────── */

/**
 * Esta función es EXCLUSIVAMENTE para Superadmin.
 *
 * Admin y Staff nunca deben obtener su academia desde localStorage.
 */
function getSelectedAcademiaIdForSuperadmin() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return 0;

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);
    const academiaId = Number(parsed?.id ?? parsed?.academia_id ?? 0);

    return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
  } catch {
    return 0;
  }
}

/* ───────────────────────── Auth Guard ───────────────────────── */

function ensureCreateUserAccess(navigate) {
  const token = getToken() || "";

  if (!token) {
    clearToken();
    navigate("/login", { replace: true });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }

  try {
    const decoded = decodeToken(token);

    if (!decoded || isExpired(decoded)) {
      clearToken();
      navigate("/login", { replace: true });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    const type = extractType(decoded);
    const rol = extractRol(decoded);

    if (!PANEL_TYPES.has(type) || !rol) {
      clearToken();
      navigate("/login", { replace: true });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    /*
     * Solo Admin y Superadmin pueden acceder
     * al módulo de creación de usuarios.
     */
    if (!ALLOWED_CREATOR_ROLES.has(rol)) {
      navigate("/admin", { replace: true });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    /*
     * ADMIN rol 1:
     *
     * La academia proviene del JWT firmado.
     * NO se consulta weli_selected_academia.
     */
    if (rol === 1) {
      const academiaId = extractTokenAcademiaId(decoded);

      if (!academiaId) {
        clearToken();
        navigate("/login", { replace: true });

        return {
          ok: false,
          rol,
          academiaId: 0,
        };
      }

      return {
        ok: true,
        rol,
        academiaId,
      };
    }

    /*
     * SUPERADMIN rol 3:
     *
     * Debe existir una academia objetivo seleccionada.
     */
    const academiaId = getSelectedAcademiaIdForSuperadmin();

    if (!academiaId) {
      navigate("/super-dashboard", { replace: true });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    return {
      ok: true,
      rol,
      academiaId,
    };
  } catch {
    clearToken();
    navigate("/login", { replace: true });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }
}

/* ───────────────────────── Backend helpers ───────────────────────── */

function asArrayRoles(response) {
  const data = response?.data ?? response;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.roles)) return data.roles;
  if (Array.isArray(data?.data?.roles)) return data.data.roles;

  return [];
}

async function tryGetList(paths, { signal }) {
  const variants = [];

  for (const path of paths) {
    if (path.endsWith("/")) {
      variants.push(path, path.slice(0, -1));
    } else {
      variants.push(path, `${path}/`);
    }
  }

  const urls = [...new Set(variants)];

  for (const url of urls) {
    try {
      const response = await api.get(url, {
        signal,
        meta: { isPublic: false },
      });

      return asArrayRoles(response);
    } catch (error) {
      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        return [];
      }

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  return [];
}

async function postWithFallback(path, body) {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        meta: { isPublic: false },
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("POST failed");
}

function pickBackendMessage(error) {
  const data = error?.response?.data ?? error?.data ?? null;

  const detail = data?.detail ?? data?.message ?? data?.error ?? data?.msg ?? (typeof data === "string" ? data : null);

  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(data?.errors)) {
    const joined = data.errors
      .map((item) => item?.message ?? item?.msg ?? item?.detail ?? item?.path?.join?.(".") ?? "")
      .filter(Boolean)
      .join(" | ");

    if (joined) return joined;
  }

  if (typeof data?.validation === "string" && data.validation.trim()) {
    return data.validation.trim();
  }

  return "";
}

/* ───────────────────────── Validation ───────────────────────── */

function isValidRut(value) {
  return /^[0-9]{7,8}$/.test(String(value || ""));
}

function isValidUsername(value) {
  const username = String(value || "").trim();

  return username.length >= 3 && username.length <= 80;
}

function isStrongPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 200;
}

/* ───────────────────────── Component ───────────────────────── */

export default function CrearUsuario() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const [rolActual, setRolActual] = useState(0);

  const [formData, setFormData] = useState({
    nombre_usuario: "",
    rut_usuario: "",
    email: "",
    password: "",
    rol_id: "",
    estado_id: 1,
  });

  const [roles, setRoles] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useMobileAutoScrollTop();

  /* ───────────────────────── Auth inicial ───────────────────────── */

  useEffect(() => {
    const guard = ensureCreateUserAccess(navigate);

    if (!guard.ok) {
      setIsLoading(false);
      return;
    }

    setRolActual(guard.rol);
  }, [navigate]);

  /* ───────────────────────── Roles ───────────────────────── */

  useEffect(() => {
    if (!rolActual) return;

    const guard = ensureCreateUserAccess(navigate);

    if (!guard.ok) {
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadRoles = async () => {
      setIsLoading(true);
      setError("");

      try {
        const rawRoles = await tryGetList(["/roles", "/rol"], {
          signal: abortController.signal,
        });

        const normalizedRoles = (Array.isArray(rawRoles) ? rawRoles : [])
          .map((item) => {
            const id = Number(item?.id ?? item?.rol_id ?? 0);

            const nombre = String(item?.nombre ?? item?.descripcion ?? "").trim();

            return {
              id,
              nombre,
            };
          })
          .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.nombre.length > 0);

        /*
         * Admin rol 1:
         * no puede crear Superadmin rol 3.
         *
         * Superadmin rol 3:
         * puede visualizar los roles permitidos por backend.
         */
        const allowedRoles = guard.rol === 3 ? normalizedRoles : normalizedRoles.filter((item) => item.id !== 3);

        setRoles(allowedRoles);

        setFormData((previous) => {
          const selectedRole = Number(previous.rol_id);

          const stillAllowed = allowedRoles.some((item) => item.id === selectedRole);

          if (previous.rol_id && !stillAllowed) {
            return {
              ...previous,
              rol_id: "",
            };
          }

          if (!previous.rol_id && allowedRoles.length === 1) {
            return {
              ...previous,
              rol_id: String(allowedRoles[0].id),
            };
          }

          return previous;
        });
      } catch (requestError) {
        if (abortController.signal.aborted) {
          return;
        }

        const status = requestError?.status ?? requestError?.response?.status;

        if (status === 401) {
          clearToken();
          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (status === 403) {
          setError("No tienes permisos para listar roles.");

          return;
        }

        setError("❌ No se pudieron cargar los roles.");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadRoles();

    return () => abortController.abort();
  }, [navigate, rolActual]);

  /* ───────────────────────── Inputs ───────────────────────── */

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;

    if (name === "rut_usuario") {
      const digits = String(value || "")
        .replace(/\D/g, "")
        .slice(0, 8);

      setFormData((previous) => ({
        ...previous,
        rut_usuario: digits,
      }));

      return;
    }

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }, []);

  /* ───────────────────────── Submit ───────────────────────── */

  const enviarUsuario = useCallback(
    async (event) => {
      event.preventDefault();

      if (submitting) return;

      const guard = ensureCreateUserAccess(navigate);

      if (!guard.ok) return;

      setMensaje("");
      setError("");

      const nombreUsuario = String(formData.nombre_usuario || "").trim();

      const rut = String(formData.rut_usuario || "");

      const rolId = Number(formData.rol_id);

      if (!isValidUsername(nombreUsuario)) {
        setError("El nombre de usuario debe contener entre 3 y 80 caracteres.");

        return;
      }

      if (!isValidRut(rut)) {
        setError("El RUT debe ser de 7 u 8 dígitos, sin puntos ni dígito verificador.");

        return;
      }

      if (!Number.isInteger(rolId) || rolId <= 0) {
        setError("Selecciona un rol válido.");

        return;
      }

      /*
       * Defensa frontend adicional.
       *
       * La autorización real debe seguir
       * ejecutándose también en backend.
       */
      if (rolId === 3 && guard.rol !== 3) {
        setError("No tienes permisos para crear usuarios superadmin.");

        return;
      }

      if (!roles.some((item) => item.id === rolId)) {
        setError("Rol seleccionado inválido.");

        return;
      }

      if (!isStrongPassword(formData.password)) {
        setError("La contraseña debe tener entre 6 y 200 caracteres.");

        return;
      }

      /*
       * ADMIN rol 1:
       *
       * NO enviamos academia_id.
       * Backend debe derivarla del JWT/contexto autenticado.
       *
       * SUPERADMIN rol 3:
       *
       * enviamos explícitamente la academia target
       * seleccionada.
       */
      let targetAcademiaId = 0;

      if (guard.rol === 3) {
        targetAcademiaId = getSelectedAcademiaIdForSuperadmin();

        if (!targetAcademiaId) {
          setError("Debes seleccionar una academia antes de crear el usuario.");

          return;
        }
      }

      const payload = {
        nombre_usuario: nombreUsuario,
        rut_usuario: Number(rut),
        email: String(formData.email || "").trim(),
        password: formData.password,
        rol_id: rolId,
        estado_id: Number(formData.estado_id) || 1,
        ...(guard.rol === 3
          ? {
              academia_id: targetAcademiaId,
            }
          : {}),
      };

      setSubmitting(true);

      try {
        await postWithFallback("/usuarios", payload);

        setMensaje("✅ Usuario registrado correctamente");

        setFormData({
          nombre_usuario: "",
          rut_usuario: "",
          email: "",
          password: "",
          rol_id: "",
          estado_id: 1,
        });
      } catch (requestError) {
        const status = requestError?.status ?? requestError?.response?.status;

        if (status === 401) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (status === 403) {
          setError("No tienes permisos para registrar usuarios.");

          return;
        }

        const backendMessage = pickBackendMessage(requestError);

        setError(backendMessage || "❌ Error al registrar usuario");
      } finally {
        setSubmitting(false);
      }
    },
    [formData, navigate, roles, submitting]
  );

  /* ───────────────────────── UI ───────────────────────── */

  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "relative w-full max-w-xl mx-auto rounded-2xl shadow-2xl border p-6 " +
      (darkMode ? "bg-white/10 border-white/15 text-white" : "bg-white/60 border-ra-marron/15 text-ra-marron");

    const input = [
      "w-full rounded-2xl px-5 py-3 border outline-none transition",
      darkMode
        ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
        : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta",
    ].join(" ");

    const select = input;

    const msgOk = darkMode ? "text-emerald-200" : "text-emerald-700";

    const msgErr =
      "mt-6 rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const btn =
      "w-full rounded-xl px-6 py-3 font-extrabold text-white hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed";

    return {
      shell,
      headerSub,
      card,
      input,
      select,
      msgOk,
      msgErr,
      btn,
    };
  }, [darkMode]);

  if (isLoading) {
    return <IsLoading />;
  }

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-center">Registrar Usuario</h1>

        <p className={`text-sm mt-2 text-center ${ui.headerSub}`}>
          {rolActual === 3 ? "Crea usuarios para la academia seleccionada." : "Crea usuarios asociados a tu academia."}
        </p>
      </header>

      <main className="px-6 pb-20">
        <div className="mt-8">
          <div className={ui.card}>
            <form onSubmit={enviarUsuario} className="space-y-4" autoComplete="off">
              <input
                name="nombre_usuario"
                type="text"
                value={formData.nombre_usuario}
                onChange={handleChange}
                placeholder="Nombre de usuario"
                className={ui.input}
                minLength={3}
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
                required
              />

              <input
                name="rut_usuario"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{7,8}"
                title="Ingresa 7 u 8 dígitos, sin puntos ni dígito verificador"
                maxLength={8}
                value={formData.rut_usuario}
                onChange={handleChange}
                placeholder="RUT sin dígito verificador (Ej: 12345678)"
                className={ui.input}
                required
              />

              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Correo"
                className={ui.input}
                maxLength={254}
                autoComplete="off"
                required
              />

              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Contraseña (mínimo 6 caracteres)"
                className={ui.input}
                minLength={6}
                maxLength={200}
                autoComplete="new-password"
                required
              />

              <select name="rol_id" value={formData.rol_id} onChange={handleChange} className={ui.select} required>
                <option value="">Selecciona un Rol</option>

                {roles.map((role) => (
                  <option key={role.id} value={String(role.id)}>
                    {role.nombre}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={submitting}
                className={ui.btn}
                style={{
                  backgroundColor: ACCENT,
                }}
              >
                {submitting ? "Guardando…" : "Guardar"}
              </button>
            </form>

            {mensaje && (
              <div className={`mt-6 text-center font-bold ${ui.msgOk}`} role="status">
                {mensaje}
              </div>
            )}

            {error && (
              <div className={ui.msgErr} role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
