// src/pages/admin/config/Categorias.jsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

const ACCENT = "#e82d89";

export default function Categorias() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [categorias, setCategorias] = useState([]);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [busy, setBusy] = useState(false);

  const bootRef = useRef(false);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual (admin vs super-admin canal)
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // ───────── Utils ─────────
  const limpiarTexto = useCallback(
    (texto) =>
      String(texto || "")
        .replace(/[<>;"']/g, "")
        .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, "")
        .trim(),
    []
  );

  const flash = useCallback((okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);

    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2500);
  }, []);

  // ✅ Con tu api.js: el error ya viene normalizado (status/data/message)
  const getErrStatus = useCallback((err) => err?.status ?? err?.response?.status ?? 0, []);
  const getErrData = useCallback((err) => err?.data ?? err?.response?.data ?? null, []);

  const prettyError = useCallback(
    (err, fallback) => {
      const st = getErrStatus(err);
      const data = getErrData(err);

      const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

      if (st === 401 || st === 403) {
        return "🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.";
      }

      if (st === 400) {
        return backendMsg || "⚠️ Datos inválidos. Revisa el nombre.";
      }

      if (st === 409) {
        if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
          return "⚠️ No se puede eliminar: la categoría está en uso por otros registros.";
        }
        if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
          return "⚠️ Ya existe una categoría con ese nombre.";
        }
        return backendMsg || "⚠️ No se pudo completar la acción por una restricción del sistema.";
      }

      if (st === 404) {
        return backendMsg || "⚠️ Registro no encontrado (puede que ya haya sido eliminado).";
      }

      return backendMsg || fallback || "❌ Error inesperado.";
    },
    [getErrStatus, getErrData]
  );

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  // ───────── Breadcrumb (dorado: sin hardcode /admin) ─────────
  useEffect(() => {
    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    if (!last || last.label !== "Categorías") {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: "Configuración", to: configPath },
            { label: "Categorías", to: currentPath },
          ],
        },
      });
    }
    // intencional: no dependemos de location.state para evitar loops de navegación
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath, navigate]);

  // ───────── Auth (ajusta aquí si quieres SOLO rol 1) ─────────
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || decoded.exp <= now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ por defecto: rol 1 (admin) y rol 3 (superadmin)
      // si quieres SOLO admin: reemplaza por `if (rol !== 1) { ... }`
      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, dashboardBase]);

  // ───────── Helpers endpoints tolerantes (slash final) ─────────
  const withVariants = useCallback(
    (fn) => async (base, ...args) => {
      const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];
      let lastErr = null;

      for (const u of urls) {
        try {
          return await fn(u, ...args);
        } catch (e) {
          lastErr = e;
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e;
        }
      }
      throw lastErr || new Error("ENDPOINT_VARIANTS_FAILED");
    },
    [getErrStatus]
  );

  const getVar = useMemo(() => withVariants((u, c) => api.get(u, c)), [withVariants]);
  const postVar = useMemo(() => withVariants((u, p, c) => api.post(u, p, c)), [withVariants]);
  const putVar = useMemo(() => withVariants((u, p, c) => api.put(u, p, c)), [withVariants]);
  const delVar = useMemo(() => withVariants((u, c) => api.delete(u, c)), [withVariants]);

  // ───────── Fetch ─────────
  const fetchCategorias = useCallback(
    async (signal) => {
      try {
        const res = await getVar("/categorias", { signal });
        const d = res?.data;

        const lista = Array.isArray(d)
          ? d
          : Array.isArray(d?.items)
            ? d.items
            : Array.isArray(d?.results)
              ? d.results
              : [];

        setCategorias(lista);
      } catch (err) {
        // axios abort puede venir como DOMException / CanceledError
        if (signal?.aborted) return;

        const st = getErrStatus(err);
        if (st === 401 || st === 403) return handleAuth();
        setError(prettyError(err, "❌ Error al obtener categorías"));
      }
    },
    [getVar, getErrStatus, handleAuth, prettyError]
  );

  useEffect(() => {
    const abort = new AbortController();

    // ✅ En StrictMode dev se monta 2 veces: NO bloqueamos.
    // AbortController evita setState si realmente sales de la página.
    fetchCategorias(abort.signal);

    return () => {
      abort.abort();
    };
  }, [fetchCategorias]);


  // ───────── Crear ─────────
  const crearCategoria = async () => {
    const nombre = limpiarTexto(nuevaCategoria);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await postVar("/categorias", { nombre });
      setNuevaCategoria("");
      flash("✅ Categoría creada");
      await fetchCategorias();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo crear la categoría."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarCategoria = async () => {
    if (!editarId) return setError("⚠️ Debes seleccionar una categoría.");
    const nombre = limpiarTexto(editarNombre);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await putVar(`/categorias/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre("");
      flash("✅ Categoría actualizada");
      await fetchCategorias();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo actualizar la categoría."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!categoriaSeleccionada?.id) {
      setMostrarModal(false);
      return;
    }

    setBusy(true);
    try {
      await delVar(`/categorias/${categoriaSeleccionada.id}`);
      flash("✅ Categoría eliminada");
      await fetchCategorias();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo eliminar la categoría."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setCategoriaSeleccionada(null);
    }
  };

  // ───────── Estilos ─────────
  const fondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjeta = darkMode ? "bg-[#1f2937] border-gray-700" : "bg-white border-gray-200";

  const inputBase =
    (darkMode
      ? "bg-[#111827] text-white border border-white/10 placeholder-white/40"
      : "bg-white text-black border border-black/10 placeholder-black/40") +
    " w-full p-2 rounded-xl";

  const selectBase = inputBase + " appearance-none";

  const btnBase =
    "mt-4 w-full py-2 rounded-xl font-bold transition disabled:opacity-60 disabled:cursor-not-allowed";

  const btnPrimary = `${btnBase} text-white`;
  const btnPrimaryStyle = busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: ACCENT };

  const btnWarn = `${btnBase} text-white`;
  const btnWarnStyle =
    busy || !editarId ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#f59e0b" };

  const btnDanger = `${btnBase} text-white`;
  const btnDangerStyle =
    !categoriaSeleccionada || busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#dc2626" };

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Gestión de Categorías</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listado */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">📋 Listar Categorías</h3>
          {categorias.length === 0 ? (
            <p className="opacity-60">Sin categorías registradas.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {categorias.map((cat) => (
                <li key={cat.id} className="font-semibold opacity-90">
                  {cat.nombre ?? cat.descripcion ?? `#${cat.id}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">➕ Crear Categoría</h3>
          <input
            type="text"
            value={nuevaCategoria}
            onChange={(e) => {
              setError("");
              setMensaje("");
              setNuevaCategoria(e.target.value);
            }}
            placeholder="Nombre categoría"
            className={inputBase}
            disabled={busy}
          />
          <button
            onClick={crearCategoria}
            disabled={busy}
            className={btnPrimary}
            style={btnPrimaryStyle}
            title={busy ? "Procesando..." : "Crear categoría"}
          >
            {busy ? "Procesando..." : "Guardar"}
          </button>
        </div>

        {/* Editar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">✏️ Modificar Categoría</h3>

          <select
            value={editarId || ""}
            onChange={(e) => {
              setError("");
              setMensaje("");
              const id = parseInt(e.target.value, 10);
              setEditarId(id || null);
              const cat = categorias.find((c) => Number(c.id) === id);
              setEditarNombre(cat?.nombre ?? cat?.descripcion ?? "");
            }}
            className={`${selectBase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona categoría</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre ?? cat.descripcion}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={editarNombre}
            onChange={(e) => {
              setError("");
              setMensaje("");
              setEditarNombre(e.target.value);
            }}
            placeholder="Nuevo nombre"
            className={inputBase}
            disabled={busy || !editarId}
          />

          <button
            onClick={actualizarCategoria}
            disabled={busy || !editarId}
            className={btnWarn}
            style={btnWarnStyle}
            title={!editarId ? "Selecciona una categoría primero" : busy ? "Procesando..." : "Actualizar"}
          >
            {busy ? "Procesando..." : "Actualizar"}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">🗑️ Eliminar Categoría</h3>

          <select
            value={categoriaSeleccionada?.id || ""}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              const seleccionada = categorias.find((cat) => Number(cat.id) === id);
              setCategoriaSeleccionada(seleccionada || null);
              setError("");
              setMensaje("");
            }}
            className={selectBase}
            disabled={busy}
          >
            <option value="">Selecciona categoría</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre ?? cat.descripcion}
              </option>
            ))}
          </select>

          <button
            disabled={!categoriaSeleccionada || busy}
            onClick={() => {
              if (busy || !categoriaSeleccionada) return;
              setMostrarModal(true);
            }}
            className={btnDanger}
            style={btnDangerStyle}
            title={!categoriaSeleccionada ? "Selecciona una categoría" : busy ? "Procesando..." : "Eliminar"}
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

      <Modal
        visible={mostrarModal}
        onConfirm={confirmarEliminacion}
        onCancel={() => setMostrarModal(false)}
      />
    </div>
  );
}
