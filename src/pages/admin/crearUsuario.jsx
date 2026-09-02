// src/pages/admin/crearUsuario.jsx

import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import { jwtDecode } from "jwt-decode";

import { useTheme } from "../../context/ThemeContext";

import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";

import IsLoading from "../../components/isLoading";

import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PANEL_TYPES = new Set(["admin", "user", "staff", "superadmin"]);

const ALLOWED_CREATOR_ROLES = new Set([1, 3]);

const ACCENT = "#aa5013";

/* =========================================================
   HELPERS JWT
========================================================= */

/**
 * IMPORTANTE:
 *
 * jwtDecode en frontend NO valida criptográficamente
 * la firma del token.
 *
 * La autorización efectiva continúa exclusivamente
 * en backend.
 */

function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   EXPIRACIÓN
───────────────────────────────────────────────────────── */

function isExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  return now >= exp;
}

/* ─────────────────────────────────────────────────────────
   TYPE
───────────────────────────────────────────────────────── */

function extractType(decoded) {
  return String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();
}

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

function extractRol(decoded) {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

/* ─────────────────────────────────────────────────────────
   ACADEMIA DESDE JWT

   EXCLUSIVAMENTE ADMIN / STAFF
───────────────────────────────────────────────────────── */

function extractTokenAcademiaId(decoded) {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* =========================================================
   ACADEMIA SUPERADMIN
========================================================= */

/**
 * EXCLUSIVAMENTE SUPERADMIN.
 *
 * Admin y Staff nunca deben obtener academia
 * desde localStorage.
 */
function getSelectedAcademiaIdForSuperadmin() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return 0;
    }

    /* ─────────────────────────────────────────
       Compatibilidad:
       "12"
    ───────────────────────────────────────── */

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /* ─────────────────────────────────────────
       Compatibilidad:
       {
         id: 12
       }
    ───────────────────────────────────────── */

    const parsed = JSON.parse(raw);

    const academiaId = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? 0);

    return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
  } catch {
    return 0;
  }
}

/* =========================================================
   AUTH GUARD
========================================================= */

function ensureCreateUserAccess(navigate) {
  const token = getToken() || "";

  /* ───────────────────────────────────────────────────────
     SIN TOKEN
  ─────────────────────────────────────────────────────── */

  if (!token) {
    clearToken();

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }

  try {
    const decoded = decodeToken(token);

    /* ─────────────────────────────────────────────────────
       TOKEN INVÁLIDO / EXPIRADO
    ───────────────────────────────────────────────────── */

    if (!decoded || isExpired(decoded)) {
      clearToken();

      navigate("/login", {
        replace: true,
      });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    const type = extractType(decoded);

    const rol = extractRol(decoded);

    /* ─────────────────────────────────────────────────────
       TOKEN NO VÁLIDO PARA PANEL
    ───────────────────────────────────────────────────── */

    if (!PANEL_TYPES.has(type) || !rol) {
      clearToken();

      navigate("/login", {
        replace: true,
      });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    /* =====================================================
       ROLES CON ACCESO

       1 Admin
       3 Superadmin
    ===================================================== */

    if (!ALLOWED_CREATOR_ROLES.has(rol)) {
      /*
       * La sesión sigue siendo válida.
       *
       * NO se elimina token.
       */
      navigate("/admin", {
        replace: true,
      });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    /* =====================================================
       ADMIN — ROL 1

       Academia exclusivamente desde JWT firmado.
       NO se consulta localStorage.
    ===================================================== */

    if (rol === 1) {
      const academiaId = extractTokenAcademiaId(decoded);

      if (!academiaId) {
        /*
         * Un token Admin vigente sin academia_id
         * no cumple el contrato actual de sesión.
         */
        clearToken();

        navigate("/login", {
          replace: true,
        });

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

    /* =====================================================
       SUPERADMIN — ROL 3

       Academia objetivo desde selector WELI.
    ===================================================== */

    const academiaId = getSelectedAcademiaIdForSuperadmin();

    if (!academiaId) {
      /*
       * Superadmin válido pero sin academia seleccionada.
       *
       * NO se destruye sesión.
       */
      navigate("/super-dashboard", {
        replace: true,
      });

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

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }
}

/* =========================================================
   BACKEND HELPERS
========================================================= */

function asArrayRoles(response) {
  const data = response?.data ?? response;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.roles)) {
    return data.roles;
  }

  if (Array.isArray(data?.data?.roles)) {
    return data.data.roles;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}

/* =========================================================
   GET CON FALLBACK CONTROLADO
========================================================= */

/**
 * Puede probar rutas alternativas, por ejemplo:
 *
 * /roles
 * /roles/
 * /rol
 * /rol/
 *
 * PERO únicamente cambia de ruta cuando el backend
 * informa 404 o 405.
 *
 * Nunca ocultamos un 400, 409, 422, 500, etc.
 */
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

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await api.get(url, {
        signal,

        meta: {
          isPublic: false,
        },
      });

      return asArrayRoles(response);
    } catch (error) {
      lastError = error;

      /* ─────────────────────────────────────────
         CANCELACIÓN NORMAL
      ───────────────────────────────────────── */

      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        return [];
      }

      const status = error?.status ?? error?.response?.status ?? 0;

      /* ─────────────────────────────────────────
         AUTH / AUTHZ
      ───────────────────────────────────────── */

      if (status === 401 || status === 403) {
        throw error;
      }

      /* ─────────────────────────────────────────
         RUTA NO DISPONIBLE

         Único caso donde probamos la siguiente.
      ───────────────────────────────────────── */

      if (status === 404 || status === 405) {
        continue;
      }

      /* ─────────────────────────────────────────
         ERROR REAL

         400
         409
         422
         500
         etc.
      ───────────────────────────────────────── */

      throw error;
    }
  }

  throw lastError ?? new Error("No fue posible cargar los roles");
}

/* =========================================================
   POST CON FALLBACK CONTROLADO
========================================================= */

/**
 * IMPORTANTE:
 *
 * No se debe repetir una escritura por un 400,
 * 409, 422, 500, timeout, etc.
 *
 * Solo probamos variante de URL cuando la primera
 * devuelve 404 o 405.
 */
async function postWithFallback(path, body) {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        meta: {
          isPublic: false,
        },
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status ?? 0;

      /* ─────────────────────────────────────────
         AUTH / AUTHZ
      ───────────────────────────────────────── */

      if (status === 401 || status === 403) {
        throw error;
      }

      /* ─────────────────────────────────────────
         RUTA NO DISPONIBLE
      ───────────────────────────────────────── */

      if (status === 404 || status === 405) {
        continue;
      }

      /* ─────────────────────────────────────────
         ERROR REAL.

         No repetimos el POST.
      ───────────────────────────────────────── */

      throw error;
    }
  }

  throw lastError ?? new Error(`No fue posible ejecutar POST ${path}`);
}

/* =========================================================
   MENSAJE BACKEND
========================================================= */

function pickBackendMessage(error) {
  const data = error?.response?.data ?? error?.data ?? null;

  const detail = data?.detail ?? data?.message ?? data?.error ?? data?.msg ?? (typeof data === "string" ? data : null);

  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  /* ───────────────────────────────────────────────────────
     ERRORES ESTRUCTURADOS
  ─────────────────────────────────────────────────────── */

  if (Array.isArray(data?.errors)) {
    const joined = data.errors
      .map((item) => item?.message ?? item?.msg ?? item?.detail ?? item?.path?.join?.(".") ?? "")
      .filter(Boolean)
      .join(" | ");

    if (joined) {
      return joined;
    }
  }

  /*
   * Zod/Fastify puede retornar directamente
   * un array de problemas.
   */
  if (Array.isArray(data)) {
    const joined = data
      .map((item) => item?.message ?? item?.msg ?? item?.detail ?? "")
      .filter(Boolean)
      .join(" | ");

    if (joined) {
      return joined;
    }
  }

  if (typeof data?.validation === "string" && data.validation.trim()) {
    return data.validation.trim();
  }

  return "";
}

/* =========================================================
   VALIDATION
========================================================= */

function isValidRut(value) {
  return /^[0-9]{7,8}$/.test(String(value ?? ""));
}

/* ─────────────────────────────────────────────────────────
   USERNAME
───────────────────────────────────────────────────────── */

function isValidUsername(value) {
  const username = String(value ?? "").trim();

  return username.length >= 3 && username.length <= 80;
}

/* ─────────────────────────────────────────────────────────
   EMAIL
───────────────────────────────────────────────────────── */

function isValidEmail(value) {
  const email = String(value ?? "").trim();

  /*
   * Validación básica frontend.
   * Backend sigue siendo autoridad.
   */
  return email.length > 0 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─────────────────────────────────────────────────────────
   PASSWORD
───────────────────────────────────────────────────────── */

function isStrongPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 200;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function CrearUsuario() {
  const { darkMode } = useTheme();

  const navigate = useNavigate();

  /* =======================================================
     STATE
  ======================================================= */

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

  /* =======================================================
     AUTH INICIAL
  ======================================================= */

  useEffect(() => {
    const guard = ensureCreateUserAccess(navigate);

    if (!guard.ok) {
      setIsLoading(false);

      return;
    }

    setRolActual(guard.rol);
  }, [navigate]);

  /* =======================================================
     CARGAR ROLES
  ======================================================= */

  useEffect(() => {
    if (!rolActual) {
      return;
    }

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

        if (abortController.signal.aborted) {
          return;
        }

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

        /* =================================================
             REGLA DE ROLES

             Admin:
             no puede crear Superadmin.

             Superadmin:
             visualiza roles permitidos por backend.
          ================================================= */

        const allowedRoles = guard.rol === 3 ? normalizedRoles : normalizedRoles.filter((item) => item.id !== 3);

        setRoles(allowedRoles);

        /* =================================================
             CONSERVAR / NORMALIZAR SELECCIÓN
          ================================================= */

        setFormData((previous) => {
          const selectedRole = Number(previous.rol_id);

          const stillAllowed = allowedRoles.some((item) => item.id === selectedRole);

          /*
           * Rol previamente seleccionado
           * ya no disponible.
           */
          if (previous.rol_id && !stillAllowed) {
            return {
              ...previous,
              rol_id: "",
            };
          }

          /*
           * Solo existe un rol posible:
           * lo seleccionamos automáticamente.
           */
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

        /* ─────────────────────────────────────
             401
          ───────────────────────────────────── */

        if (status === 401) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* ─────────────────────────────────────
             403

             NO LOGOUT.
          ───────────────────────────────────── */

        if (status === 403) {
          setError("No tienes permisos para listar roles.");

          return;
        }

        const detail = pickBackendMessage(requestError);

        setError(detail ? `❌ No se pudieron cargar los roles: ${detail}` : "❌ No se pudieron cargar los roles.");

        if (import.meta.env.DEV) {
          console.error("[WELI ROLES]", requestError);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadRoles();

    return () => abortController.abort();
  }, [navigate, rolActual]);

  /* =======================================================
     INPUTS
  ======================================================= */

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;

    /* ─────────────────────────────────────────
           RUT
        ───────────────────────────────────────── */

    if (name === "rut_usuario") {
      const digits = String(value ?? "")
        .replace(/\D/g, "")
        .slice(0, 8);

      setFormData((previous) => ({
        ...previous,

        rut_usuario: digits,
      }));

      return;
    }

    /* ─────────────────────────────────────────
           RESTO
        ───────────────────────────────────────── */

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }, []);

  /* =======================================================
     SUBMIT
  ======================================================= */

  const enviarUsuario = useCallback(
    async (event) => {
      event.preventDefault();

      if (submitting) {
        return;
      }

      const guard = ensureCreateUserAccess(navigate);

      if (!guard.ok) {
        return;
      }

      setMensaje("");
      setError("");

      /* =================================================
           NORMALIZACIÓN
        ================================================= */

      const nombreUsuario = String(formData.nombre_usuario ?? "").trim();

      const rut = String(formData.rut_usuario ?? "")
        .replace(/\D/g, "")
        .slice(0, 8);

      const email = String(formData.email ?? "")
        .trim()
        .toLowerCase();

      const rolId = Number(formData.rol_id);

      const estadoId = Number(formData.estado_id);

      /* =================================================
           VALIDAR USERNAME
        ================================================= */

      if (!isValidUsername(nombreUsuario)) {
        setError("El nombre de usuario debe contener entre 3 y 80 caracteres.");

        return;
      }

      /* =================================================
           VALIDAR RUT
        ================================================= */

      if (!isValidRut(rut)) {
        setError("El RUT debe ser de 7 u 8 dígitos, sin puntos ni dígito verificador.");

        return;
      }

      /* =================================================
           VALIDAR EMAIL
        ================================================= */

      if (!isValidEmail(email)) {
        setError("Ingresa un correo electrónico válido.");

        return;
      }

      /* =================================================
           VALIDAR ROL
        ================================================= */

      if (!Number.isInteger(rolId) || rolId <= 0) {
        setError("Selecciona un rol válido.");

        return;
      }

      /*
       * Defensa frontend adicional.
       *
       * Backend sigue siendo autoridad.
       */
      if (rolId === 3 && guard.rol !== 3) {
        setError("No tienes permisos para crear usuarios superadmin.");

        return;
      }

      if (!roles.some((item) => item.id === rolId)) {
        setError("Rol seleccionado inválido.");

        return;
      }

      /* =================================================
           PASSWORD
        ================================================= */

      if (!isStrongPassword(formData.password)) {
        setError("La contraseña debe tener entre 6 y 200 caracteres.");

        return;
      }

      /* =================================================
           ESTADO
        ================================================= */

      if (!Number.isInteger(estadoId) || estadoId <= 0) {
        setError("Estado de usuario inválido.");

        return;
      }

      /* =================================================
           TENANT

           ADMIN:
           NO academia_id en body.

           SUPERADMIN:
           academia target seleccionada.
        ================================================= */

      let targetAcademiaId = 0;

      if (guard.rol === 3) {
        targetAcademiaId = getSelectedAcademiaIdForSuperadmin();

        if (!targetAcademiaId) {
          setError("Debes seleccionar una academia antes de crear el usuario.");

          return;
        }
      }

      /* =================================================
           PAYLOAD
        ================================================= */

      const payload = {
        nombre_usuario: nombreUsuario,

        rut_usuario: Number(rut),

        email,

        password: formData.password,

        rol_id: rolId,

        estado_id: estadoId,

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

        /*
         * Si hay solamente un rol disponible,
         * mantenemos esa selección después
         * de limpiar el formulario.
         */
        const defaultRole = roles.length === 1 ? String(roles[0].id) : "";

        setFormData({
          nombre_usuario: "",
          rut_usuario: "",
          email: "",
          password: "",
          rol_id: defaultRole,
          estado_id: 1,
        });
      } catch (requestError) {
        const status = requestError?.status ?? requestError?.response?.status;

        /* ─────────────────────────────────────
             401
          ───────────────────────────────────── */

        if (status === 401) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* ─────────────────────────────────────
             403

             NO LOGOUT.
          ───────────────────────────────────── */

        if (status === 403) {
          setError("No tienes permisos para registrar usuarios.");

          return;
        }

        const backendMessage = pickBackendMessage(requestError);

        if (import.meta.env.DEV) {
          console.error("[WELI USUARIO]", requestError);
        }

        setError(backendMessage || "❌ Error al registrar usuario");
      } finally {
        setSubmitting(false);
      }
    },
    [formData, navigate, roles, submitting]
  );

  /* =======================================================
     UI
  ======================================================= */

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

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="px-6 pt-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-center">Registrar Usuario</h1>

        <p className={`text-sm mt-2 text-center ${ui.headerSub}`}>
          {rolActual === 3 ? "Crea usuarios para la academia seleccionada." : "Crea usuarios asociados a tu academia."}
        </p>
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="px-6 pb-20">
        <div className="mt-8">
          <div className={ui.card}>
            <form onSubmit={enviarUsuario} className="space-y-4" autoComplete="off">
              {/* =========================================
                  NOMBRE USUARIO
              ========================================= */}

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

              {/* =========================================
                  RUT
              ========================================= */}

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

              {/* =========================================
                  EMAIL
              ========================================= */}

              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Correo"
                className={ui.input}
                maxLength={254}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
              />

              {/* =========================================
                  PASSWORD
              ========================================= */}

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

              {/* =========================================
                  ROL
              ========================================= */}

              <select name="rol_id" value={formData.rol_id} onChange={handleChange} className={ui.select} required>
                <option value="">Selecciona un Rol</option>

                {roles.map((role) => (
                  <option key={role.id} value={String(role.id)}>
                    {role.nombre}
                  </option>
                ))}
              </select>

              {/* =========================================
                  SUBMIT
              ========================================= */}

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

            {/* =============================================
                OK
            ============================================= */}

            {mensaje && (
              <div className={`mt-6 text-center font-bold ${ui.msgOk}`} role="status">
                {mensaje}
              </div>
            )}

            {/* =============================================
                ERROR
            ============================================= */}

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
