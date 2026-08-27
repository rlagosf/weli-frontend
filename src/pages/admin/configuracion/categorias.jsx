// src/pages/admin/config/Categorias.jsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =======================
   🎨 Conjunto X
======================= */
const PALETTE_X = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

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
    return p.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
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
    (fn) =>
      async (base, ...args) => {
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
    fetchCategorias(abort.signal);
    return () => abort.abort();
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

  /* =======================
     UI estilo SuperDashboard.jsx
  ======================= */
  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "rounded-2xl border shadow-lg transition " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const sectionTitle = darkMode ? "text-white/90" : "text-ra-marron";

    const input =
      "w-full p-2 rounded-xl outline-none border text-sm " +
      "focus:ring-2 focus:ring-[rgba(170,80,19,0.25)] focus:border-[rgba(170,80,19,0.35)] " +
      (darkMode
        ? "bg-black/25 text-white border-white/10 placeholder-white/45"
        : "bg-white/70 text-ra-marron border-ra-marron/15 placeholder-ra-marron/45");

    const select = input + " appearance-none";

    const btn =
      "w-full py-2 rounded-xl font-extrabold transition shadow-sm " +
      "disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]";

    const btnPrimaryStyle = busy
      ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
      : {
          background: `linear-gradient(135deg, ${PALETTE_X.copper}, ${PALETTE_X.terracotta})`,
          color: "#fff",
        };

    const btnWarnStyle =
      busy || !editarId
        ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
        : { backgroundColor: "#f59e0b", color: "#1a1208" };

    const btnDangerStyle =
      !categoriaSeleccionada || busy
        ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
        : { backgroundColor: "#dc2626", color: "#fff" };

    const warn =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : "border-amber-300/60 bg-amber-50 text-amber-900");

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const ok =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-emerald-200/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-900");

    const listItem =
      "flex items-center justify-between gap-3 py-2 border-b last:border-b-0 " +
      (darkMode ? "border-white/10" : "border-ra-marron/12");

    const pill =
      "inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border " +
      (darkMode ? "bg-black/20 border-white/15 text-white/75" : "bg-white/60 border-ra-marron/15 text-ra-marron/70");

    return {
      shell,
      titleMain,
      subText,
      card,
      sectionTitle,
      input,
      select,
      btn,
      btnPrimaryStyle,
      btnWarnStyle,
      btnDangerStyle,
      warn,
      danger,
      ok,
      listItem,
      pill,
    };
  }, [darkMode, busy, editarId, categoriaSeleccionada]);

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* Header centrado tipo SuperDashboard */}
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>Categorías</h1>
        <p className={`text-sm mt-2 ${ui.subText}`}>Administra el catálogo de categorías (crear, editar, eliminar).</p>
      </header>

      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado (2 columnas en desktop) */}
          <section className={`${ui.card} p-6 lg:col-span-2`}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className={`text-lg font-extrabold ${ui.sectionTitle}`}>📋 Listado</h2>
              <span className={ui.pill}>
                {categorias.length} categoría{categorias.length !== 1 ? "s" : ""}
              </span>
            </div>

            {categorias.length === 0 ? (
              <p className={ui.subText}>Sin categorías registradas.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto pr-1">
                {categorias.map((cat) => {
                  const nombre = cat.nombre ?? cat.descripcion ?? `#${cat.id}`;
                  return (
                    <div key={cat.id} className={ui.listItem}>
                      <div className="min-w-0">
                        <p className="font-extrabold truncate">{nombre}</p>
                        <p className={ui.subText}>ID: {cat.id}</p>
                      </div>

                      {/* selector rápido para editar/eliminar */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg text-xs font-extrabold border transition hover:brightness-110"
                          style={{
                            borderColor: darkMode ? "rgba(255,255,255,0.18)" : "rgba(109,88,41,0.18)",
                            background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
                          }}
                          onClick={() => {
                            setError("");
                            setMensaje("");
                            setEditarId(Number(cat.id));
                            setEditarNombre(String(cat.nombre ?? cat.descripcion ?? ""));
                            // también selecciona para eliminar, por UX
                            setCategoriaSeleccionada(cat);
                          }}
                          disabled={busy}
                          title="Seleccionar"
                        >
                          Seleccionar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Acciones */}
          <aside className="lg:col-span-1 space-y-6">
            {/* Crear */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>➕ Crear</h2>
              <input
                type="text"
                value={nuevaCategoria}
                onChange={(e) => {
                  setError("");
                  setMensaje("");
                  setNuevaCategoria(e.target.value);
                }}
                placeholder="Nombre categoría (mín. 3)"
                className={ui.input}
                disabled={busy}
              />
              <button
                type="button"
                onClick={crearCategoria}
                disabled={busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnPrimaryStyle}
                title={busy ? "Procesando..." : "Crear categoría"}
              >
                {busy ? "Procesando..." : "Guardar"}
              </button>
            </section>

            {/* Editar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>✏️ Editar</h2>

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
                className={ui.select}
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
                placeholder="Nuevo nombre (mín. 3)"
                className={`${ui.input} mt-3`}
                disabled={busy || !editarId}
              />

              <button
                type="button"
                onClick={actualizarCategoria}
                disabled={busy || !editarId}
                className={`${ui.btn} mt-3`}
                style={ui.btnWarnStyle}
                title={!editarId ? "Selecciona una categoría primero" : busy ? "Procesando..." : "Actualizar"}
              >
                {busy ? "Procesando..." : "Actualizar"}
              </button>
            </section>

            {/* Eliminar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>🗑️ Eliminar</h2>

              <select
                value={categoriaSeleccionada?.id || ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  const seleccionada = categorias.find((cat) => Number(cat.id) === id);
                  setCategoriaSeleccionada(seleccionada || null);
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
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
                type="button"
                disabled={!categoriaSeleccionada || busy}
                onClick={() => {
                  if (busy || !categoriaSeleccionada) return;
                  setMostrarModal(true);
                }}
                className={`${ui.btn} mt-3`}
                style={ui.btnDangerStyle}
                title={!categoriaSeleccionada ? "Selecciona una categoría" : busy ? "Procesando..." : "Eliminar"}
              >
                {busy ? "Procesando..." : "Eliminar"}
              </button>
            </section>
          </aside>
        </div>

        {/* Mensajes */}
        <div className="max-w-6xl mx-auto mt-6 space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}
          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        <Modal visible={mostrarModal} onConfirm={confirmarEliminacion} onCancel={() => setMostrarModal(false)} />
      </main>
    </div>
  );
}
