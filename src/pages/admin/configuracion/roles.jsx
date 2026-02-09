// src/pages/admin/config/Roles.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

export default function Roles() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [roles, setRoles] = useState([]);
  const [nuevoRol, setNuevoRol] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards
  const breadcrumbBootRef = useRef(false);

  const abreviar = useCallback((txt) => {
    if (!txt) return "";
    const isMobile = typeof window !== "undefined" ? window.innerWidth <= 640 : false;
    if (!isMobile) return txt;
    if (txt.length <= 14) return txt;
    return txt
      .split(" ")
      .map((p) => (p.length > 6 ? p.slice(0, 6) + "." : p))
      .join(" ");
  }, []);

  // 🧭 Breadcrumb (ANTI-LOOP) — respeta ruta real
  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Roles";
    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: abreviar("Configuración"), to: configPath },
            { label: abreviar(label), to: currentPath },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath, abreviar]);

  // ✅ error normalizado por tu api.js
  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const prettyError = (err, fallback) => {
    const st = getErrStatus(err);
    const data = getErrData(err);
    const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

    if (st === 401 || st === 403) return "🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.";
    if (st === 400) return backendMsg || "⚠️ Datos inválidos. Revisa el nombre del rol.";
    if (st === 404) return backendMsg || "⚠️ Rol no encontrado (puede que ya haya sido eliminado).";

    if (st === 409) {
      if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
        return "⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.";
      }
      if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
        return "⚠️ Ya existe un rol con ese nombre.";
      }
      return backendMsg || "⚠️ Conflicto: no se pudo completar la acción.";
    }

    if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
      return "⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.";
    }
    if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
      return "⚠️ Ya existe un rol con ese nombre.";
    }

    return backendMsg || fallback || "❌ Error inesperado.";
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  // 🔐 Auth: SOLO rol 3 (superadmin)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      // ✅ misma regla fuerte que en componentes “buenos”
      if (!decoded?.exp || decoded.exp <= now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ aquí el corte: solo 3 puede entrar
      if (rol !== 3) {
        navigate(configPath, { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, configPath]);

  // ✅ apiOps estable (NO cambia por render)
  const apiOps = useMemo(() => {
    const withVariants = (fn) => async (base, ...args) => {
      const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];
      let lastErr = null;

      for (const u of urls) {
        try {
          return await fn(u, ...args);
        } catch (e) {
          lastErr = e;
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e; // corta: auth primero
        }
      }
      throw lastErr || new Error("ENDPOINT_VARIANTS_FAILED");
    };

    return {
      getVar: withVariants((u, c) => api.get(u, c)),
      postVar: withVariants((u, p, c) => api.post(u, p, c)),
      putVar: withVariants((u, p, c) => api.put(u, p, c)),
      delVar: withVariants((u, c) => api.delete(u, c)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toArray = (resp) => {
    const d = resp?.data ?? resp;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    if (d?.ok && Array.isArray(d.data)) return d.data;
    return [];
  };

  // ───────── Fetch (sin loop) ─────────
  const fetchRoles = useCallback(
    async (signal) => {
      try {
        const res = await apiOps.getVar("/roles", { signal });
        if (signal?.aborted) return;
        setRoles(toArray(res));
      } catch (err) {
        if (signal?.aborted) return;
        const st = getErrStatus(err);
        if (st === 401 || st === 403) return handleAuth();
        setError(prettyError(err, "❌ Error al obtener roles"));
      }
    },
    [apiOps, handleAuth]
  );

  useEffect(() => {
    const abort = new AbortController();
    fetchRoles(abort.signal);
    return () => abort.abort();
  }, [fetchRoles]);

  const flash = useCallback((okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);
    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2500);
  }, []);

  const sanitizar = (texto) =>
    String(texto || "")
      .replace(/[<>;"']/g, "")
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, "")
      .trim();

  // ───────── Crear ─────────
  const crearRol = async () => {
    const nombre = sanitizar(nuevoRol);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await apiOps.postVar("/roles", { nombre });
      setNuevoRol("");
      flash("✅ Rol creado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo crear el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarRol = async () => {
    if (!editarId) return setError("⚠️ Debes seleccionar un rol.");
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await apiOps.putVar(`/roles/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre("");
      flash("✅ Rol actualizado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo actualizar el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!rolSeleccionado?.id) return setMostrarModal(false);

    setBusy(true);
    try {
      await apiOps.delVar(`/roles/${rolSeleccionado.id}`);
      flash("✅ Rol eliminado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo eliminar el rol."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setRolSeleccionado(null);
    }
  };

  // 🎨 Estilos (NO tocamos colores)
  const fondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjeta = darkMode ? "bg-[#1f2937] border-gray-700" : "bg-white border-gray-200";

  const inputBase =
    (darkMode
      ? "bg-[#111827] text-white border border-white/10 placeholder-white/40"
      : "bg-white text-black border border-black/10 placeholder-black/40") +
    " w-full p-2 rounded-xl";

  const selectBase = inputBase + " appearance-none";

  const btnBase =
    "mt-4 w-full py-2 rounded-xl font-bold transition disabled:opacity-60 disabled:cursor-not-allowed text-white";

  const btnCreateStyle = busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#3b82f6" };
  const btnUpdateStyle = busy || !editarId ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#f59e0b" };
  const btnDeleteStyle = !rolSeleccionado || busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#dc2626" };

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Gestión de Roles</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">📋 Listar Roles</h3>
          {roles.length === 0 ? (
            <p className="opacity-60">Sin roles registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {roles.map((r) => (
                <li key={r.id} className="font-semibold opacity-90">
                  {r.nombre ?? r.descripcion ?? `#${r.id}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">➕ Crear Rol</h3>
          <input
            value={nuevoRol}
            onChange={(e) => {
              setNuevoRol(e.target.value);
              setError("");
              setMensaje("");
            }}
            placeholder="Nombre del rol"
            className={inputBase}
            disabled={busy}
          />
          <button onClick={crearRol} disabled={busy} className={btnBase} style={btnCreateStyle}>
            {busy ? "Procesando..." : "Guardar"}
          </button>
        </div>

        {/* Editar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">✏️ Modificar Rol</h3>
          <select
            value={editarId || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              setEditarId(id || null);
              const r = roles.find((x) => Number(x.id) === id);
              setEditarNombre(r?.nombre || r?.descripcion || "");
              setError("");
              setMensaje("");
            }}
            className={`${selectBase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona rol</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre ?? r.descripcion}
              </option>
            ))}
          </select>

          <input
            value={editarNombre}
            onChange={(e) => {
              setEditarNombre(e.target.value);
              setError("");
              setMensaje("");
            }}
            placeholder="Nuevo nombre"
            className={inputBase}
            disabled={busy || !editarId}
          />

          <button onClick={actualizarRol} disabled={busy || !editarId} className={btnBase} style={btnUpdateStyle}>
            {busy ? "Procesando..." : "Actualizar"}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">🗑️ Eliminar Rol</h3>
          <select
            value={rolSeleccionado?.id || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const sel = roles.find((r) => Number(r.id) === id);
              setRolSeleccionado(sel || null);
              setError("");
              setMensaje("");
            }}
            className={selectBase}
            disabled={busy}
          >
            <option value="">Selecciona rol</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre ?? r.descripcion}
              </option>
            ))}
          </select>

          <button
            disabled={!rolSeleccionado || busy}
            onClick={() => {
              if (busy || !rolSeleccionado) return;
              setMostrarModal(true);
            }}
            className={btnBase}
            style={btnDeleteStyle}
          >
            {busy ? "Procesando..." : "Eliminar"}
          </button>
        </div>
      </div>

      {(mensaje || error) && (
        <p className={`text-center mt-6 font-bold ${mensaje ? "text-green-500" : "text-red-500"}`}>
          {mensaje || error}
        </p>
      )}

      <Modal visible={mostrarModal} onConfirm={confirmarEliminacion} onCancel={() => setMostrarModal(false)} />
    </div>
  );
}
