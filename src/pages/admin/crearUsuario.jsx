// src/pages/admin/crearUsuario.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =======================
   🎨 Conjunto X (WELI cobre)
======================= */
const PALETTE = {
  fucsia: "#aa5013", // cobre (acento principal)
  marron: "#6d5829", // base oscura cálida
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};
const ACCENT = PALETTE.fucsia;

/* =======================
   Helpers
======================= */
const asArrayRoles = (resp) => {
  const d = resp?.data ?? resp;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.roles)) return d.roles;
  if (Array.isArray(d?.data?.roles)) return d.data.roles;
  return [];
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Soporta "1" o JSON {"id":1} */
const getAcademiaIdFromStorage = () => {
  const key = ACADEMIA_STORAGE_KEY || "weli_selected_academia";
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? 0
    );
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

/**
 * ✅ Guard normado (roles + scope)
 * - Admin (1) y Superadmin (3)
 * - Superadmin requiere academia target seleccionada
 * - Admin también requiere scope (tenant)
 */
const ensureScopeOrRedirect = (navigate) => {
  const token = getToken?.() || "";
  if (!token) {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }

  try {
    const decoded = jwtDecode(token);
    if (isExpired(decoded)) throw new Error("expired");

    const rol = extractRol(decoded);

    // Solo admin/superadmin pueden crear usuarios
    if (![1, 3].includes(rol)) {
      navigate("/admin", { replace: true });
      return { ok: false, rol };
    }

    const academiaId = getAcademiaIdFromStorage();

    if (rol === 3) {
      if (academiaId <= 0) {
        navigate("/super-dashboard", { replace: true });
        return { ok: false, rol };
      }
      return { ok: true, rol };
    }

    // rol 1: scope obligatorio
    if (academiaId <= 0) {
      clearToken?.();
      navigate("/login", { replace: true });
      return { ok: false, rol };
    }

    return { ok: true, rol };
  } catch {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }
};

// GET robusto con/without slash + abort
const tryGetList = async (paths, { signal }) => {
  const variants = [];
  for (const p of paths) {
    if (p.endsWith("/")) variants.push(p, p.slice(0, -1));
    else variants.push(p, `${p}/`);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, meta: { isPublic: false } });
      return asArrayRoles(r);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return [];
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

// POST robusto con / y sin /
const postWithFallback = async (path, body) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.post(url, body, { meta: { isPublic: false } });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("POST failed");
};

const pickBackendMessage = (err) => {
  const data = err?.response?.data ?? err?.data ?? null;

  const detail =
    data?.detail ??
    data?.message ??
    data?.error ??
    data?.msg ??
    (typeof data === "string" ? data : null);

  if (typeof detail === "string" && detail.trim()) return detail.trim();

  // Zod-like / validation arrays
  if (Array.isArray(data?.errors)) {
    const joined = data.errors
      .map((e) => e?.message ?? e?.msg ?? e?.detail ?? e?.path?.join?.(".") ?? "")
      .filter(Boolean)
      .join(" | ");
    if (joined) return joined;
  }

  // Fastify-ish
  if (typeof data?.validation === "string" && data.validation.trim()) return data.validation.trim();

  return "";
};

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

  /* =======================
     Auth (normado)
  ======================= */
  useEffect(() => {
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) return;
    setRolActual(g.rol);
  }, [navigate]);

  /* =======================
     Carga roles (tenantizado)
  ======================= */
  useEffect(() => {
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) {
      setIsLoading(false);
      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const listaRaw = await tryGetList(["/roles", "/rol"], { signal: abort.signal });

        const lista = (Array.isArray(listaRaw) ? listaRaw : [])
          .map((r) => {
            const id = r?.id ?? r?.rol_id ?? r?.role_id ?? r?.ID ?? null;
            const nombre =
              r?.nombre ??
              r?.descripcion ??
              r?.name ??
              r?.desc ??
              (id != null ? String(id) : "");
            return { id: Number(id), nombre: String(nombre).trim() };
          })
          .filter((r) => Number.isFinite(r.id) && r.id > 0 && r.nombre.length > 0);

        setRoles(lista);

        setFormData((prev) =>
          !prev.rol_id && lista.length === 1 ? { ...prev, rol_id: String(lista[0].id) } : prev
        );
      } catch (err) {
        if (abort.signal.aborted) return;

        const st = err?.status ?? err?.response?.status;

        if (st === 401) {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 403) {
          setError("No tienes permisos para listar roles.");
          return;
        }

        setError("❌ No se pudieron cargar los roles.");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "rut_usuario") {
      const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
      setFormData((prev) => ({ ...prev, rut_usuario: digits }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const isValidRut = (v) => /^[0-9]{7,8}$/.test(String(v || ""));
  const isStrongPassword = (v) => typeof v === "string" && v.length >= 6;

  const enviarUsuario = useCallback(
    async (e) => {
      e.preventDefault();
      if (submitting) return;

      const g = ensureScopeOrRedirect(navigate);
      if (!g.ok) return;

      setMensaje("");
      setError("");

      const rut = String(formData.rut_usuario || "");
      const rolId = Number(formData.rol_id);

      if (!isValidRut(rut)) return setError("El RUT debe ser de 7 u 8 dígitos (sin DV).");
      if (!roles.find((r) => r.id === rolId)) return setError("Rol seleccionado inválido.");
      if (!isStrongPassword(formData.password))
        return setError("La contraseña debe tener al menos 6 caracteres.");

      // ✅ academia target SIEMPRE se evalúa en el submit (no congelado)
      const academiaId = getAcademiaIdFromStorage();

      // ✅ el backend lo exige para superadmin: lo mandamos sí o sí
      if (g.rol === 3 && academiaId <= 0) {
        return setError("academia_id es obligatorio para superadmin (selecciona una academia).");
      }

      const payload = {
        ...formData,
        rut_usuario: Number(rut),
        rol_id: rolId,
        estado_id: Number(formData.estado_id) || 1,
        ...(g.rol === 3 ? { academia_id: academiaId } : {}),
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
      } catch (err) {
        const st = err?.status ?? err?.response?.status;

        if (st === 401) {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 403) return setError("No tienes permisos para registrar usuarios.");

        const backendMsg = pickBackendMessage(err);
        setError(backendMsg || "❌ Error al registrar usuario");
      } finally {
        setSubmitting(false);
      }
    },
    [formData, roles, submitting, navigate]
  );

  /* =======================
     UI (replica estilo SuperDashboard)
  ======================= */
  const ui = useMemo(() => {
    // ✅ mismo shell que superDashboard.jsx
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

    // ✅ card como las tarjetas del super dashboard
    const card =
      "relative w-full max-w-xl mx-auto rounded-2xl shadow-2xl border p-6 " +
      (darkMode ? "bg-white/10 border-white/15 text-white" : "bg-white/60 border-ra-marron/15 text-ra-marron");

    // ✅ input estilo “searchInput / modalInput”
    const input = [
      "w-full rounded-2xl px-5 py-3 border outline-none transition",
      darkMode
        ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
        : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta",
    ].join(" ");

    const select = input;

    // ✅ mensajes como msgBox del super
    const msgOk = darkMode ? "text-emerald-200" : "text-emerald-700";
    const msgErr =
      "mt-6 rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const btn =
      "w-full rounded-xl px-6 py-3 font-extrabold text-white hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed";

    return { shell, headerSub, card, input, select, msgOk, msgErr, btn };
  }, [darkMode]);

  if (isLoading) return <IsLoading />;

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6">
        <h1 className="text-4xl font-extrabold tracking-tightish text-center">Registrar Usuario</h1>
        <p className={`text-sm mt-2 text-center ${ui.headerSub}`}>
          Crea un usuario staff/admin para la academia seleccionada.
        </p>
      </header>

      <main className="px-6 pb-20">
        <div className="mt-8">
          <div className={ui.card}>
            <form onSubmit={enviarUsuario} className="space-y-4" autoComplete="off">
              <input
                name="nombre_usuario"
                value={formData.nombre_usuario}
                onChange={handleChange}
                placeholder="Nombre"
                pattern="^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]{3,}$"
                title="Solo letras y mínimo 3 caracteres"
                className={ui.input}
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
                required
                autoComplete="new-email"
              />

              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Contraseña (mínimo 6 caracteres)"
                className={ui.input}
                required
                autoComplete="new-password"
                minLength={6}
              />

              <select
                name="rol_id"
                value={formData.rol_id}
                onChange={handleChange}
                className={ui.select}
                required
              >
                <option value="">Selecciona un Rol</option>
                {roles.map((rol) => (
                  <option key={rol.id} value={String(rol.id)}>
                    {rol.nombre}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={submitting}
                className={ui.btn}
                style={{ backgroundColor: ACCENT }}
              >
                {submitting ? "Guardando…" : "Guardar"}
              </button>
            </form>

            {mensaje ? <div className={`mt-6 text-center font-bold ${ui.msgOk}`}>{mensaje}</div> : null}
            {error ? <div className={ui.msgErr}>{error}</div> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
