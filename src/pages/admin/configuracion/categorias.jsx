// src/pages/admin/config/Categorias.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { CheckCircle2, Layers3, Power, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

const ESTADO_ACTIVO = 1;
const ESTADO_INACTIVO = 0;

const asList = (response) => {
  const data = response?.data ?? response;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getCategoriaEstado = (categoria) => {
  const raw = categoria?.estado_id ?? categoria?.estadoId ?? categoria?.estado ?? ESTADO_ACTIVO;

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

export default function Categorias() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);
  const [categorias, setCategorias] = useState([]);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const breadcrumbBootRef = useRef(false);

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";
    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  const getErrStatus = useCallback((err) => err?.status ?? err?.response?.status ?? 0, []);

  const getErrData = useCallback((err) => err?.data ?? err?.response?.data ?? null, []);

  const prettyError = useCallback(
    (err, fallback) => {
      const status = getErrStatus(err);
      const data = getErrData(err);

      const backendMsg = data?.message ?? data?.detail ?? data?.error ?? err?.message ?? null;

      if (status === 401) return "Sesión expirada. Vuelve a iniciar sesión.";
      if (status === 403) return backendMsg || "No tienes permisos para realizar esta acción.";
      if (status === 400) return backendMsg || "No fue posible actualizar la categoría.";
      if (status === 404) return backendMsg || "La categoría ya no se encuentra disponible.";
      if (status === 409) {
        return backendMsg || "La categoría no puede cambiar de estado por una restricción del sistema.";
      }

      return backendMsg || fallback || "Ocurrió un error inesperado.";
    },
    [getErrStatus, getErrData]
  );

  const flash = useCallback((okMessage = "", errorMessage = "") => {
    setMensaje(okMessage);
    setError(errorMessage);

    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2800);
  }, []);

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;
    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    if (!last || last.label !== "Categorías") {
      breadcrumbBootRef.current = true;

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
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath]);

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || Number(decoded.exp) <= now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

      const rol = Number(rawRol);

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, { replace: true });
        return;
      }

      setRolActual(rol);
    } catch {
      handleAuth();
    }
  }, [dashboardBase, handleAuth, navigate]);

  const fetchCategorias = useCallback(
    async ({ signal } = {}) => {
      try {
        const response = await api.get("/categorias", { signal });
        setCategorias(asList(response));
      } catch (err) {
        if (signal?.aborted) return;

        const status = getErrStatus(err);

        if (status === 401 || status === 403) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar las categorías de la academia."));
      }
    },
    [getErrStatus, handleAuth, prettyError]
  );

  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();

    (async () => {
      setLoading(true);

      try {
        await fetchCategorias({ signal: abort.signal });
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [rolActual, fetchCategorias]);

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      await fetchCategorias();
    } finally {
      setReloadBusy(false);
    }
  }, [fetchCategorias]);

  const cambiarEstadoCategoria = async (categoria) => {
    const categoriaId = Number(categoria?.id);

    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      setError("Categoría inválida.");
      return;
    }

    const estadoActual = getCategoriaEstado(categoria);
    const nuevoEstado = estadoActual === ESTADO_ACTIVO ? ESTADO_INACTIVO : ESTADO_ACTIVO;

    setBusyId(categoriaId);
    setError("");
    setMensaje("");

    try {
      await api.put(`/categorias/${categoriaId}`, {
        estado_id: nuevoEstado,
      });

      setCategorias((prev) =>
        prev.map((item) => (Number(item?.id) === categoriaId ? { ...item, estado_id: nuevoEstado } : item))
      );

      flash(
        nuevoEstado === ESTADO_ACTIVO ? "Categoría activada correctamente." : "Categoría desactivada correctamente."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible cambiar el estado de la categoría."));
    } finally {
      setBusyId(null);
    }
  };

  const categoriasNormalizadas = useMemo(
    () =>
      (Array.isArray(categorias) ? categorias : [])
        .map((categoria) => ({
          ...categoria,
          id: Number(categoria?.id ?? 0),
          nombre: String(categoria?.nombre ?? categoria?.descripcion ?? `Categoría #${categoria?.id ?? ""}`).trim(),
          estado_id: getCategoriaEstado(categoria),
        }))
        .filter((categoria) => Number.isInteger(categoria.id) && categoria.id > 0)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })),
    [categorias]
  );

  const categoriasFiltradas = useMemo(() => {
    const texto = String(filtroTexto ?? "")
      .trim()
      .toLowerCase();

    return categoriasNormalizadas.filter((categoria) => {
      const matchTexto =
        !texto || categoria.nombre.toLowerCase().includes(texto) || String(categoria.id).includes(texto);

      const matchEstado = !filtroEstado || String(categoria.estado_id) === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [categoriasNormalizadas, filtroTexto, filtroEstado]);

  const resumen = useMemo(() => {
    const activas = categoriasNormalizadas.filter((categoria) => categoria.estado_id === ESTADO_ACTIVO).length;

    return {
      total: categoriasNormalizadas.length,
      activas,
      inactivas: categoriasNormalizadas.length - activas,
    };
  }, [categoriasNormalizadas]);

  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/65" : "text-ra-marron/65";

    const card =
      "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.10)] " +
      (darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/65 border-ra-marron/15");

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl text-[14px] sm:text-[15px] font-medium outline-none transition " +
      (darkMode
        ? "border border-white/15 bg-[#111827] text-white placeholder:text-white/40 focus:border-[#ffdda1] focus:ring-2 focus:ring-[#ffdda1]/15"
        : "border border-ra-marron/20 bg-white/80 text-ra-marron placeholder:text-ra-marron/45 focus:border-[#aa5013] focus:ring-2 focus:ring-[#aa5013]/10");

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-bold transition disabled:opacity-50 disabled:cursor-not-allowed " +
      (darkMode ? "border-white/15 text-white hover:bg-white/10" : "border-ra-marron/20 text-ra-marron hover:bg-white");

    const ok =
      "rounded-2xl border px-4 py-3 text-[14px] font-semibold " +
      (darkMode
        ? "border-emerald-200/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-900");

    const danger =
      "rounded-2xl border px-4 py-3 text-[14px] font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    return {
      shell,
      titleMain,
      subText,
      card,
      control,
      secondaryButton,
      ok,
      danger,
    };
  }, [darkMode]);

  if (loading) {
    return (
      <div className={`${ui.shell} min-h-screen font-sans`}>
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className={`text-sm font-semibold ${ui.subText}`}>Cargando categorías…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-4 sm:px-6 lg:px-8 pt-6 text-center">
        <div className="mx-auto max-w-4xl">
          <div
            className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border ${
              darkMode
                ? "border-white/10 bg-white/[0.06] text-[#ffdda1]"
                : "border-ra-marron/15 bg-white/60 text-[#aa5013]"
            }`}
          >
            <Layers3 className="h-6 w-6" />
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
            Categorías de la Academia
          </h1>

          <p className={`mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] leading-relaxed ${ui.subText}`}>
            Habilita o deshabilita las categorías previamente configuradas para tu academia. La creación, modificación y
            eliminación del catálogo se administra de forma centralizada.
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 pb-20">
        <section className="mx-auto mt-7 max-w-6xl grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard darkMode={darkMode} label="Categorías configuradas" value={resumen.total} type="total" />

          <SummaryCard darkMode={darkMode} label="Activas" value={resumen.activas} type="active" />

          <SummaryCard darkMode={darkMode} label="Inactivas" value={resumen.inactivas} type="inactive" />
        </section>

        <div className="mx-auto mt-4 max-w-6xl space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}
          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        <section className={`${ui.card} mx-auto mt-4 max-w-6xl p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                darkMode ? "bg-[#ffdda1]/10 text-[#ffdda1]" : "bg-[#aa5013]/10 text-[#aa5013]"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className={`text-[15px] sm:text-base font-extrabold ${ui.titleMain}`}>
                Catálogo administrado centralmente
              </h2>

              <p className={`mt-1 text-[13px] sm:text-sm leading-relaxed ${ui.subText}`}>
                Esta pantalla no permite crear, renombrar ni eliminar categorías. El administrador de academia
                únicamente define cuáles de las categorías configuradas estarán disponibles para su operación.
              </p>
            </div>
          </div>
        </section>

        <section className={`${ui.card} mx-auto mt-4 max-w-6xl p-4 sm:p-5`}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-3 lg:items-end">
            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
                Buscar categoría
              </label>

              <div className="relative">
                <Search
                  className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${
                    darkMode ? "text-white/40" : "text-ra-marron/45"
                  }`}
                />

                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(event) => setFiltroTexto(event.target.value)}
                  placeholder="Nombre o ID de categoría"
                  className={`${ui.control} !pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>Estado</label>

              <select
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                className={ui.control}
              >
                <option value="">Todas</option>
                <option value="1">Activas</option>
                <option value="0">Inactivas</option>
              </select>
            </div>

            <button type="button" onClick={refresh} disabled={reloadBusy} className={ui.secondaryButton}>
              <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </section>

        <section className={`${ui.card} mx-auto mt-4 max-w-6xl overflow-hidden`}>
          <div
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4 ${
              darkMode ? "border-white/10" : "border-ra-marron/10"
            }`}
          >
            <div>
              <h2 className={`text-lg sm:text-xl font-extrabold ${ui.titleMain}`}>Categorías disponibles</h2>

              <p className={`mt-1 text-[13px] sm:text-sm ${ui.subText}`}>
                {categoriasFiltradas.length} categoría
                {categoriasFiltradas.length !== 1 ? "s" : ""} visible
                {categoriasFiltradas.length !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className={darkMode ? "bg-black/20 text-[#ffdda1]" : "bg-[#f7ead4] text-[#6d5829]"}>
                <tr>
                  <th className="px-5 py-3 text-center font-extrabold">Categoría</th>
                  <th className="px-5 py-3 text-center font-extrabold">Estado</th>
                  <th className="px-5 py-3 text-center font-extrabold">Disponibilidad</th>
                </tr>
              </thead>

              <tbody>
                {categoriasFiltradas.map((categoria) => {
                  const activa = categoria.estado_id === ESTADO_ACTIVO;
                  const procesando = busyId === categoria.id;

                  return (
                    <tr
                      key={categoria.id}
                      className={`border-t ${
                        darkMode ? "border-white/10 hover:bg-white/[0.04]" : "border-ra-marron/10 hover:bg-white/50"
                      }`}
                    >
                      <td className="px-5 py-4 text-center">
                        <div className={`font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                          {categoria.nombre}
                        </div>

                        <div className={`mt-0.5 text-[12px] ${ui.subText}`}>ID {categoria.id}</div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <StatusPill darkMode={darkMode} active={activa} />
                      </td>

                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => cambiarEstadoCategoria(categoria)}
                          disabled={procesando}
                          className={`inline-flex min-h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            activa
                              ? darkMode
                                ? "border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : darkMode
                                ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          <Power className="h-4 w-4" />

                          {procesando ? "Procesando…" : activa ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!categoriasFiltradas.length && (
                  <tr>
                    <td colSpan={3} className={`px-6 py-12 text-center text-[14px] ${ui.subText}`}>
                      No existen categorías para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden p-3 space-y-3">
            {categoriasFiltradas.map((categoria) => {
              const activa = categoria.estado_id === ESTADO_ACTIVO;
              const procesando = busyId === categoria.id;

              return (
                <article
                  key={categoria.id}
                  className={`rounded-2xl border p-4 ${
                    darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/45"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={`text-base font-extrabold break-words ${ui.titleMain}`}>{categoria.nombre}</h3>

                      <p className={`mt-1 text-[12px] ${ui.subText}`}>ID {categoria.id}</p>
                    </div>

                    <StatusPill darkMode={darkMode} active={activa} />
                  </div>

                  <button
                    type="button"
                    onClick={() => cambiarEstadoCategoria(categoria)}
                    disabled={procesando}
                    className={`mt-4 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                      activa
                        ? darkMode
                          ? "border-red-300/20 bg-red-500/10 text-red-100"
                          : "border-red-200 bg-red-50 text-red-700"
                        : darkMode
                          ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    <Power className="h-4 w-4" />

                    {procesando ? "Procesando…" : activa ? "Desactivar categoría" : "Activar categoría"}
                  </button>
                </article>
              );
            })}

            {!categoriasFiltradas.length && (
              <div className={`py-10 text-center text-[14px] ${ui.subText}`}>
                No existen categorías para los filtros seleccionados.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ darkMode, active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold ${
        active
          ? darkMode
            ? "border-emerald-300/20 bg-emerald-500/15 text-emerald-100"
            : "border-emerald-200 bg-emerald-100 text-emerald-800"
          : darkMode
            ? "border-white/15 bg-white/[0.06] text-white/60"
            : "border-ra-marron/15 bg-white/60 text-ra-marron/60"
      }`}
    >
      {active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}

      {active ? "Activa" : "Inactiva"}
    </span>
  );
}

function SummaryCard({ darkMode, label, value, type }) {
  const icon =
    type === "active" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : type === "inactive" ? (
      <XCircle className="h-5 w-5" />
    ) : (
      <Layers3 className="h-5 w-5" />
    );

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.08)] ${
        darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/65 border-ra-marron/15"
      }`}
    >
      <div className={`flex items-center justify-between gap-3 ${darkMode ? "text-white/60" : "text-ra-marron/60"}`}>
        <span className="text-[12px] sm:text-[13px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

        {icon}
      </div>

      <strong
        className={`mt-2 block text-2xl sm:text-3xl font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}
      >
        {value}
      </strong>
    </div>
  );
}
