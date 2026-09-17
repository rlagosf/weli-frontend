// src/pages/admin/config/estadojugadores.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { CheckCircle2, CircleDot, Power, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =========================================================
   WELI - ESTADOS DE JUGADORES

   POLÍTICA:
   - El Admin NO crea estados.
   - El Admin NO edita nombres.
   - El Admin NO elimina estados.
   - El Admin solo activa/desactiva los estados disponibles
     para su academia.

   La creación y mantención estructural del catálogo quedará
   bajo responsabilidad de Superadmin.
========================================================= */

const ESTADO_ACTIVO = 1;
const ESTADO_INACTIVO = 0;

const ENDPOINTS = [
  "/estado",
  "/estados-jugador",
  "/estados-jugadores",
  "/estado-jugador",
  "/estado-jugadores",
  "/estados_jugador",
  "/estados_jugadores",
  "/estado_jugador",
  "/estado_jugadores",
];

const toArray = (response) => {
  const data = response?.data ?? response;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;

  return [];
};

const getEstadoCatalogo = (item) => {
  const raw = item?.estado_id ?? item?.estadoId ?? item?.activo ?? item?.enabled ?? ESTADO_ACTIVO;

  if (typeof raw === "boolean") {
    return raw ? ESTADO_ACTIVO : ESTADO_INACTIVO;
  }

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

const normalizeBase = (url) => (url.endsWith("/") ? url.slice(0, -1) : url);

const variants = (base) => (base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`]);

export default function EstadoJugadores() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [authorized, setAuthorized] = useState(false);

  const [estados, setEstados] = useState([]);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const breadcrumbBootRef = useRef(false);
  const resolvedBaseRef = useRef("");
  const fetchInFlightRef = useRef(false);

  /* =======================================================
     NAVEGACIÓN
  ======================================================= */

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  /* =======================================================
     ERRORES / AUTH
  ======================================================= */

  const getErrStatus = useCallback((err) => err?.status ?? err?.response?.status ?? 0, []);

  const getErrData = useCallback((err) => err?.data ?? err?.response?.data ?? null, []);

  const isNetworkDown = useCallback((err) => {
    const message = String(err?.message || "").toLowerCase();

    return (
      message.includes("err_connection_refused") ||
      message.includes("socket_not_connected") ||
      message.includes("network error") ||
      message.includes("failed to fetch") ||
      message.includes("connection refused") ||
      message.includes("ecconnrefused")
    );
  }, []);

  const prettyError = useCallback(
    (err, fallback) => {
      const status = getErrStatus(err);
      const data = getErrData(err);

      const backendMsg = data?.message ?? data?.detail ?? data?.error ?? err?.message ?? null;

      if (isNetworkDown(err)) {
        return "No hay conexión con el backend.";
      }

      if (status === 401) {
        return "Sesión expirada. Vuelve a iniciar sesión.";
      }

      if (status === 403) {
        return backendMsg || "No tienes permisos para realizar esta acción.";
      }

      if (status === 400) {
        return backendMsg || "No fue posible actualizar el estado.";
      }

      if (status === 404) {
        return backendMsg || "El estado ya no se encuentra disponible.";
      }

      if (status === 409) {
        return backendMsg || "El estado no puede cambiar de disponibilidad por una restricción del sistema.";
      }

      return backendMsg || fallback || "Ocurrió un error inesperado.";
    },
    [getErrStatus, getErrData, isNetworkDown]
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

    navigate("/login", {
      replace: true,
    });
  }, [navigate]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];
    const label = "Estados de Jugadores";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            {
              label: "Configuración",
              to: configPath,
            },
            {
              label,
              to: currentPath,
            },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath]);

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || Number(decoded.exp) <= now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

      const rol = Number(rawRol);

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        return;
      }

      setAuthorized(true);
    } catch {
      handleAuth();
    }
  }, [dashboardBase, handleAuth, navigate]);

  /* =======================================================
     API - RESOLUCIÓN DEL ENDPOINT EXISTENTE
  ======================================================= */

  const fetchEstados = useCallback(
    async ({ signal } = {}) => {
      if (!authorized || fetchInFlightRef.current) return;

      fetchInFlightRef.current = true;
      setError("");

      try {
        if (resolvedBaseRef.current) {
          const base = resolvedBaseRef.current;

          for (const url of variants(base)) {
            try {
              const response = await api.get(url, { signal });

              if (signal?.aborted) return;

              setEstados(toArray(response));
              return;
            } catch (err) {
              const status = getErrStatus(err);

              if (status === 401 || status === 403 || isNetworkDown(err)) {
                throw err;
              }
            }
          }
        }

        let lastError = null;

        for (const base of ENDPOINTS) {
          for (const url of variants(base)) {
            try {
              const response = await api.get(url, { signal });

              if (signal?.aborted) return;

              resolvedBaseRef.current = normalizeBase(url);
              setEstados(toArray(response));
              return;
            } catch (err) {
              lastError = err;

              const status = getErrStatus(err);

              if (status === 401 || status === 403 || isNetworkDown(err)) {
                throw err;
              }
            }
          }
        }

        throw lastError || new Error("NO_ENDPOINT_MATCHED");
      } catch (err) {
        if (signal?.aborted) return;

        const status = getErrStatus(err);

        if (status === 401 || status === 403) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar los estados de jugadores."));
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [authorized, getErrStatus, handleAuth, isNetworkDown, prettyError]
  );

  useEffect(() => {
    if (!authorized) return;

    const abort = new AbortController();

    (async () => {
      setLoading(true);

      try {
        await fetchEstados({
          signal: abort.signal,
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [authorized, fetchEstados]);

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      await fetchEstados();
    } finally {
      setReloadBusy(false);
    }
  }, [fetchEstados]);

  /* =======================================================
     DISPONIBILIDAD
     Requiere que el backend acepte estado_id en PUT/PATCH.
  ======================================================= */

  const cambiarDisponibilidad = async (item) => {
    const estadoId = Number(item?.id);

    if (!Number.isInteger(estadoId) || estadoId <= 0) {
      setError("Estado inválido.");
      return;
    }

    const estadoActual = getEstadoCatalogo(item);

    const nuevoEstado = estadoActual === ESTADO_ACTIVO ? ESTADO_INACTIVO : ESTADO_ACTIVO;

    const baseEndpoint = resolvedBaseRef.current || "/estados";

    setBusyId(estadoId);
    setError("");
    setMensaje("");

    try {
      let updated = false;
      let lastError = null;

      for (const url of variants(`${baseEndpoint}/${estadoId}`)) {
        try {
          await api.put(url, {
            estado_id: nuevoEstado,
          });

          updated = true;
          break;
        } catch (err) {
          lastError = err;

          const status = getErrStatus(err);

          if (status === 401 || status === 403 || isNetworkDown(err)) {
            throw err;
          }
        }
      }

      if (!updated) {
        throw lastError || new Error("UPDATE_FAILED");
      }

      setEstados((prev) =>
        prev.map((estado) =>
          Number(estado?.id) === estadoId
            ? {
                ...estado,
                estado_id: nuevoEstado,
              }
            : estado
        )
      );

      flash(nuevoEstado === ESTADO_ACTIVO ? "Estado habilitado correctamente." : "Estado deshabilitado correctamente.");
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible cambiar la disponibilidad del estado."));
    } finally {
      setBusyId(null);
    }
  };

  /* =======================================================
     NORMALIZACIÓN / FILTROS
  ======================================================= */

  const estadosNormalizados = useMemo(
    () =>
      (Array.isArray(estados) ? estados : [])
        .map((item) => ({
          ...item,

          id: Number(item?.id ?? 0),

          nombre: String(item?.nombre ?? item?.descripcion ?? `Estado #${item?.id ?? ""}`).trim(),

          estado_id: getEstadoCatalogo(item),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", {
            sensitivity: "base",
          })
        ),
    [estados]
  );

  const estadosFiltrados = useMemo(() => {
    const texto = String(filtroTexto ?? "")
      .trim()
      .toLowerCase();

    return estadosNormalizados.filter((item) => {
      const matchTexto = !texto || item.nombre.toLowerCase().includes(texto) || String(item.id).includes(texto);

      const matchEstado = !filtroEstado || String(item.estado_id) === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [estadosNormalizados, filtroTexto, filtroEstado]);

  const resumen = useMemo(() => {
    const activos = estadosNormalizados.filter((item) => item.estado_id === ESTADO_ACTIVO).length;

    return {
      total: estadosNormalizados.length,
      activos,
      inactivos: estadosNormalizados.length - activos,
    };
  }, [estadosNormalizados]);

  /* =======================================================
     UI
  ======================================================= */

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
          <div className={`text-sm font-semibold ${ui.subText}`}>Cargando estados de jugadores…</div>
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
            <CircleDot className="h-6 w-6" />
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
            Estados de Jugadores
          </h1>

          <p className={`mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] leading-relaxed ${ui.subText}`}>
            Habilita o deshabilita los estados de jugador disponibles para la operación de tu academia. La creación,
            modificación y eliminación del catálogo se administra de forma centralizada.
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 pb-20">
        {/* RESUMEN */}

        <section className="mx-auto mt-7 max-w-6xl grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard darkMode={darkMode} label="Estados configurados" value={resumen.total} type="total" />

          <SummaryCard darkMode={darkMode} label="Activos" value={resumen.activos} type="active" />

          <SummaryCard darkMode={darkMode} label="Inactivos" value={resumen.inactivos} type="inactive" />
        </section>

        {/* MENSAJES */}

        <div className="mx-auto mt-4 max-w-6xl space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}

          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        {/* GOBERNANZA */}

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
                Esta pantalla no permite crear, renombrar ni eliminar estados. El administrador de academia únicamente
                controla cuáles estados estarán disponibles para la gestión de sus jugadores.
              </p>
            </div>
          </div>
        </section>

        {/* FILTROS */}

        <section className={`${ui.card} mx-auto mt-4 max-w-6xl p-4 sm:p-5`}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-3 lg:items-end">
            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
                Buscar estado
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
                  placeholder="Nombre o ID del estado"
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
                <option value="">Todos</option>

                <option value="1">Activos</option>

                <option value="0">Inactivos</option>
              </select>
            </div>

            <button type="button" onClick={refresh} disabled={reloadBusy} className={ui.secondaryButton}>
              <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </section>

        {/* LISTADO */}

        <section className={`${ui.card} mx-auto mt-4 max-w-6xl overflow-hidden`}>
          <div
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4 ${
              darkMode ? "border-white/10" : "border-ra-marron/10"
            }`}
          >
            <div>
              <h2 className={`text-lg sm:text-xl font-extrabold ${ui.titleMain}`}>Estados disponibles</h2>

              <p className={`mt-1 text-[13px] sm:text-sm ${ui.subText}`}>
                {estadosFiltrados.length} estado
                {estadosFiltrados.length !== 1 ? "s" : ""} visible
                {estadosFiltrados.length !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>

          {/* DESKTOP */}

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className={darkMode ? "bg-black/20 text-[#ffdda1]" : "bg-[#f7ead4] text-[#6d5829]"}>
                <tr>
                  <th className="px-5 py-3 text-center font-extrabold">Estado de jugador</th>

                  <th className="px-5 py-3 text-center font-extrabold">Disponibilidad</th>

                  <th className="px-5 py-3 text-center font-extrabold">Acción</th>
                </tr>
              </thead>

              <tbody>
                {estadosFiltrados.map((item) => {
                  const activo = item.estado_id === ESTADO_ACTIVO;

                  const procesando = busyId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`border-t ${
                        darkMode ? "border-white/10 hover:bg-white/[0.04]" : "border-ra-marron/10 hover:bg-white/50"
                      }`}
                    >
                      <td className="px-5 py-4 text-center">
                        <div className={`font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                          {item.nombre}
                        </div>

                        <div className={`mt-0.5 text-[12px] ${ui.subText}`}>ID {item.id}</div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <StatusPill darkMode={darkMode} active={activo} />
                      </td>

                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => cambiarDisponibilidad(item)}
                          disabled={procesando}
                          className={`inline-flex min-h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            activo
                              ? darkMode
                                ? "border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : darkMode
                                ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          <Power className="h-4 w-4" />

                          {procesando ? "Procesando…" : activo ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!estadosFiltrados.length && (
                  <tr>
                    <td colSpan={3} className={`px-6 py-12 text-center text-[14px] ${ui.subText}`}>
                      No existen estados para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE */}

          <div className="md:hidden p-3 space-y-3">
            {estadosFiltrados.map((item) => {
              const activo = item.estado_id === ESTADO_ACTIVO;

              const procesando = busyId === item.id;

              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-4 ${
                    darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/45"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={`text-base font-extrabold break-words ${ui.titleMain}`}>{item.nombre}</h3>

                      <p className={`mt-1 text-[12px] ${ui.subText}`}>ID {item.id}</p>
                    </div>

                    <StatusPill darkMode={darkMode} active={activo} />
                  </div>

                  <button
                    type="button"
                    onClick={() => cambiarDisponibilidad(item)}
                    disabled={procesando}
                    className={`mt-4 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                      activo
                        ? darkMode
                          ? "border-red-300/20 bg-red-500/10 text-red-100"
                          : "border-red-200 bg-red-50 text-red-700"
                        : darkMode
                          ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    <Power className="h-4 w-4" />

                    {procesando ? "Procesando…" : activo ? "Desactivar estado" : "Activar estado"}
                  </button>
                </article>
              );
            })}

            {!estadosFiltrados.length && (
              <div className={`py-10 text-center text-[14px] ${ui.subText}`}>
                No existen estados para los filtros seleccionados.
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

      {active ? "Activo" : "Inactivo"}
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
      <CircleDot className="h-5 w-5" />
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
