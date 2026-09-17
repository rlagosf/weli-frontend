// src/pages/admin/config/EstablecimientosEducacionales.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =========================================================
   WELI - ESTABLECIMIENTOS EDUCACIONALES

   POLÍTICA:
   - El Admin NO crea establecimientos.
   - El Admin NO edita nombres.
   - El Admin NO elimina establecimientos.
   - El Admin solo activa/desactiva establecimientos disponibles
     para su academia.

   La creación y mantención estructural del catálogo debe quedar
   bajo responsabilidad de Superadmin.
========================================================= */

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

const getEstadoGlobal = (item) => {
  const raw = item?.estado_global_id ?? item?.estado_id ?? item?.estadoId ?? item?.estado ?? ESTADO_ACTIVO;

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

const getEstadoAcademia = (item) => {
  const raw = item?.estado_academia_id ?? item?.estadoAcademiaId ?? ESTADO_INACTIVO;

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

const getComunaNombre = (item) => String(item?.comuna_nombre ?? item?.comuna?.nombre ?? item?.comuna ?? "").trim();

const getRegionNombre = (item) => String(item?.region_nombre ?? item?.region?.nombre ?? item?.region ?? "").trim();

export default function EstablecimientosEducacionales() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);

  const [establecimientos, setEstablecimientos] = useState([]);
  const [catalogoFiltros, setCatalogoFiltros] = useState([]);

  // Paginación backend
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
  });

  const [filtroTextoDebounced, setFiltroTextoDebounced] = useState("");
  const [pageBusy, setPageBusy] = useState(false);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroComuna, setFiltroComuna] = useState("");
  const [filtroRegion, setFiltroRegion] = useState("");

  // Región + comuna son obligatorias antes de consultar/mostrar establecimientos.
  const filtrosTerritorialesListos = Boolean(filtroRegion && filtroComuna);

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const breadcrumbBootRef = useRef(false);

  /* =======================================================
     NAVEGACIÓN
  ======================================================= */

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  /* =======================================================
     ERRORES
  ======================================================= */

  const getErrStatus = useCallback((err) => err?.status ?? err?.response?.status ?? 0, []);

  const getErrData = useCallback((err) => err?.data ?? err?.response?.data ?? null, []);

  const prettyError = useCallback(
    (err, fallback) => {
      const status = getErrStatus(err);
      const data = getErrData(err);

      const backendMsg = data?.message ?? data?.detail ?? data?.error ?? err?.message ?? null;

      if (status === 401) {
        return "Sesión expirada. Vuelve a iniciar sesión.";
      }

      if (status === 403) {
        return backendMsg || "No tienes permisos para realizar esta acción.";
      }

      if (status === 400) {
        return backendMsg || "No fue posible actualizar el establecimiento.";
      }

      if (status === 404) {
        return backendMsg || "El establecimiento ya no se encuentra disponible.";
      }

      if (status === 409) {
        return backendMsg || "El establecimiento no puede cambiar de estado por una restricción del sistema.";
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

    navigate("/login", {
      replace: true,
    });
  }, [navigate]);

  // Búsqueda backend con debounce para no consultar por cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFiltroTextoDebounced(String(filtroTexto || "").trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [filtroTexto]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    const label = "Establecimientos Educacionales";

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

      setRolActual(rol);
    } catch {
      handleAuth();
    }
  }, [dashboardBase, handleAuth, navigate]);

  /* =======================================================
     API
  ======================================================= */

  const fetchEstablecimientos = useCallback(
    async ({ signal } = {}) => {
      /*
       * La navegación del catálogo es territorial:
       * 1. Región
       * 2. Comuna
       *
       * Mientras ambas no estén seleccionadas, no se consulta el directorio
       * ni se muestran establecimientos.
       */
      if (!filtroRegion || !filtroComuna) {
        setEstablecimientos([]);
        setPagination({
          page: 1,
          limit,
          total: 0,
          total_pages: 1,
          has_previous: false,
          has_next: false,
        });
        return;
      }

      try {
        const params = new URLSearchParams();

        params.set("page", String(page));
        params.set("limit", String(limit));

        // Región y comuna son filtros obligatorios.
        params.set("region_id", String(filtroRegion));
        params.set("comuna_id", String(filtroComuna));

        if (filtroTextoDebounced) {
          params.set("search", filtroTextoDebounced);
        }

        if (filtroEstado !== "") {
          params.set("estado_id", filtroEstado);
        }

        const response = await api.get(`/establecimientos-educ?${params.toString()}`, {
          signal,
        });

        const data = response?.data ?? response ?? {};
        const items = asList(response);

        setEstablecimientos(items);

        const rawPagination = data?.pagination ?? {};
        const total = Number(rawPagination?.total ?? items.length ?? 0);
        const totalPages = Number(
          rawPagination?.total_pages ?? rawPagination?.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, limit)))
        );

        setPagination({
          page: Number(rawPagination?.page ?? page),
          limit: Number(rawPagination?.limit ?? limit),
          total,
          total_pages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
          has_previous: typeof rawPagination?.has_previous === "boolean" ? rawPagination.has_previous : page > 1,
          has_next: typeof rawPagination?.has_next === "boolean" ? rawPagination.has_next : page < totalPages,
        });
      } catch (err) {
        if (signal?.aborted) return;

        const status = getErrStatus(err);

        if (status === 401) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar los establecimientos educacionales."));
      }
    },
    [page, limit, filtroTextoDebounced, filtroEstado, filtroComuna, filtroRegion, getErrStatus, handleAuth, prettyError]
  );

  /*
   * Catálogo auxiliar para los selects de región/comuna.
   * Se obtiene sin los filtros visuales para que las opciones no dependan
   * solamente de la página actualmente visible.
   */
  const fetchCatalogoFiltros = useCallback(
    async ({ signal } = {}) => {
      try {
        const acumulado = [];
        let currentPage = 1;
        let totalPages = 1;

        do {
          const params = new URLSearchParams({
            page: String(currentPage),
            limit: "100",
          });

          const response = await api.get(`/establecimientos-educ?${params.toString()}`, { signal });
          const data = response?.data ?? response ?? {};

          acumulado.push(...asList(response));

          totalPages = Math.max(1, Number(data?.pagination?.total_pages ?? 1));
          currentPage += 1;
        } while (currentPage <= totalPages && !signal?.aborted);

        if (!signal?.aborted) {
          setCatalogoFiltros(acumulado);
        }
      } catch (err) {
        if (signal?.aborted) return;

        const status = getErrStatus(err);

        if (status === 401) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar las opciones de filtros territoriales."));
      }
    },
    [getErrStatus, handleAuth, prettyError]
  );

  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();

    (async () => {
      if (loading) {
        setLoading(true);
      } else {
        setPageBusy(true);
      }

      try {
        await fetchEstablecimientos({
          signal: abort.signal,
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          setPageBusy(false);
        }
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolActual, fetchEstablecimientos]);

  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();

    fetchCatalogoFiltros({ signal: abort.signal });

    return () => abort.abort();
  }, [rolActual, fetchCatalogoFiltros]);

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      await Promise.all([fetchEstablecimientos(), fetchCatalogoFiltros()]);
    } finally {
      setReloadBusy(false);
    }
  }, [fetchEstablecimientos, fetchCatalogoFiltros]);

  const cambiarEstado = async (establecimiento) => {
    const establecimientoId = Number(establecimiento?.id);

    if (!Number.isInteger(establecimientoId) || establecimientoId <= 0) {
      setError("Establecimiento inválido.");
      return;
    }

    const estadoGlobal = getEstadoGlobal(establecimiento);

    if (estadoGlobal !== ESTADO_ACTIVO) {
      setError("El establecimiento está deshabilitado globalmente y no puede activarse para la academia.");
      return;
    }

    const estadoActual = getEstadoAcademia(establecimiento);
    const nuevoEstado = estadoActual === ESTADO_ACTIVO ? ESTADO_INACTIVO : ESTADO_ACTIVO;

    setBusyId(establecimientoId);
    setError("");
    setMensaje("");

    try {
      const response = await api.patch(`/establecimientos-educ/${establecimientoId}/disponibilidad`, {
        estado_id: nuevoEstado,
      });

      const actualizado = response?.data?.item ?? response?.item ?? null;

      setEstablecimientos((prev) =>
        prev.map((item) =>
          Number(item?.id) === establecimientoId
            ? actualizado
              ? { ...item, ...actualizado }
              : {
                  ...item,
                  estado_academia_id: nuevoEstado,
                  disponible: nuevoEstado === ESTADO_ACTIVO && getEstadoGlobal(item) === ESTADO_ACTIVO,
                }
            : item
        )
      );

      flash(
        nuevoEstado === ESTADO_ACTIVO
          ? "Establecimiento activado correctamente para la academia."
          : "Establecimiento desactivado correctamente para la academia."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible cambiar la disponibilidad del establecimiento."));
    } finally {
      setBusyId(null);
    }
  };

  /* =======================================================
     NORMALIZACIÓN
  ======================================================= */

  const establecimientosNormalizados = useMemo(
    () =>
      (Array.isArray(establecimientos) ? establecimientos : [])
        .map((item) => ({
          ...item,

          id: Number(item?.id ?? 0),

          nombre: String(item?.nombre ?? item?.descripcion ?? `Establecimiento #${item?.id ?? ""}`).trim(),

          comuna_id: Number(item?.comuna_id ?? 0),
          comuna_nombre: getComunaNombre(item),

          region_id: Number(item?.region_id ?? 0),
          region_nombre: getRegionNombre(item),

          estado_id: getEstadoGlobal(item),
          estado_global_id: getEstadoGlobal(item),
          estado_academia_id: getEstadoAcademia(item),
          disponible: Boolean(item?.disponible),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", {
            sensitivity: "base",
          })
        ),
    [establecimientos]
  );

  const catalogoFiltrosNormalizado = useMemo(
    () =>
      (Array.isArray(catalogoFiltros) ? catalogoFiltros : [])
        .map((item) => ({
          comuna_id: Number(item?.comuna_id ?? 0),
          comuna_nombre: getComunaNombre(item),
          region_id: Number(item?.region_id ?? 0),
          region_nombre: getRegionNombre(item),
        }))
        .filter((item) => item.comuna_id > 0 && item.region_id > 0),
    [catalogoFiltros]
  );

  const regionesDisponibles = useMemo(() => {
    const mapa = new Map();

    catalogoFiltrosNormalizado.forEach((item) => {
      if (item.region_id > 0 && item.region_nombre) {
        mapa.set(item.region_id, item.region_nombre);
      }
    });

    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [catalogoFiltrosNormalizado]);

  const comunasDisponibles = useMemo(() => {
    const mapa = new Map();

    catalogoFiltrosNormalizado.forEach((item) => {
      if (filtroRegion && String(item.region_id) !== String(filtroRegion)) return;

      if (item.comuna_id > 0 && item.comuna_nombre) {
        mapa.set(item.comuna_id, {
          id: item.comuna_id,
          nombre: item.comuna_nombre,
          region_id: item.region_id,
        });
      }
    });

    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [catalogoFiltrosNormalizado, filtroRegion]);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroComuna, filtroRegion]);

  useEffect(() => {
    if (!filtroComuna) return;

    const comunaSigueDisponible = comunasDisponibles.some((comuna) => String(comuna.id) === String(filtroComuna));

    if (!comunaSigueDisponible) {
      setFiltroComuna("");
    }
  }, [filtroRegion, filtroComuna, comunasDisponibles]);

  // Los filtros se ejecutan en backend. Sin región + comuna, no se muestra el catálogo.
  const establecimientosFiltrados = filtrosTerritorialesListos ? establecimientosNormalizados : [];

  const resumen = useMemo(() => {
    const activos = establecimientosNormalizados.filter((item) => item.estado_global_id === ESTADO_ACTIVO).length;

    const comunas = new Set(establecimientosNormalizados.map((item) => item.comuna_nombre).filter(Boolean)).size;

    const regiones = new Set(establecimientosNormalizados.map((item) => item.region_nombre).filter(Boolean)).size;

    return {
      total: establecimientosNormalizados.length,
      activos,
      inactivos: establecimientosNormalizados.length - activos,
      comunas,
      regiones,
    };
  }, [establecimientosNormalizados]);

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
          <div className={`text-sm font-semibold ${ui.subText}`}>Cargando establecimientos…</div>
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
            <Building2 className="h-6 w-6" />
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
            Establecimientos Educacionales
          </h1>

          <p className={`mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] leading-relaxed ${ui.subText}`}>
            Selecciona qué establecimientos educacionales estarán disponibles para la operación de tu academia. El
            catálogo general se administra de forma centralizada.
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 pb-20">
        {/* RESUMEN */}

        <section className="mx-auto mt-7 max-w-7xl grid grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard darkMode={darkMode} label="Establecimientos" value={pagination.total} type="total" />

          <SummaryCard darkMode={darkMode} label="Activos" value={resumen.activos} type="active" />

          <SummaryCard darkMode={darkMode} label="Inactivos" value={resumen.inactivos} type="inactive" />

          <SummaryCard darkMode={darkMode} label="Comunas" value={resumen.comunas} type="location" />

          <SummaryCard darkMode={darkMode} label="Regiones" value={resumen.regiones} type="location" />
        </section>

        <div className="mx-auto mt-4 max-w-7xl space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}

          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        {/* GOBERNANZA */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl p-4 sm:p-5`}>
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
                Catálogo institucional centralizado
              </h2>

              <p className={`mt-1 text-[13px] sm:text-sm leading-relaxed ${ui.subText}`}>
                El administrador de academia puede habilitar o deshabilitar establecimientos, pero no crear, renombrar
                ni eliminar registros del catálogo general. Esto mantiene una nomenclatura consistente y permite ampliar
                WELI posteriormente a nuevas comunas y regiones.
              </p>
            </div>
          </div>
        </section>

        {/* FILTROS */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl p-4 sm:p-5`}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[190px_190px_1fr_150px_110px_auto] gap-3 xl:items-end">
            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>Región</label>

              <select
                value={filtroRegion}
                onChange={(event) => {
                  setFiltroRegion(event.target.value);
                  setFiltroComuna("");
                  setPage(1);
                }}
                className={ui.control}
                disabled={!regionesDisponibles.length}
              >
                <option value="">Selecciona región</option>

                {regionesDisponibles.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>Comuna</label>

              <select
                value={filtroComuna}
                onChange={(event) => {
                  setFiltroComuna(event.target.value);
                  setPage(1);
                }}
                className={ui.control}
                disabled={!filtroRegion || !comunasDisponibles.length}
              >
                <option value="">{filtroRegion ? "Selecciona comuna" : "Selecciona primero una región"}</option>

                {comunasDisponibles.map((comuna) => (
                  <option key={comuna.id} value={comuna.id}>
                    {comuna.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
                Buscar establecimiento
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
                  placeholder="Nombre o ID"
                  className={`${ui.control} !pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>Estado</label>

              <select
                value={filtroEstado}
                onChange={(event) => {
                  setFiltroEstado(event.target.value);
                  setPage(1);
                }}
                className={ui.control}
              >
                <option value="">Todos</option>

                <option value="1">Activos</option>

                <option value="0">Inactivos</option>
              </select>
            </div>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>Mostrar</label>

              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className={ui.control}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <button type="button" onClick={refresh} disabled={reloadBusy || pageBusy} className={ui.secondaryButton}>
              <RefreshCw className={`h-4 w-4 ${reloadBusy || pageBusy ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </section>

        {/* TABLA */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl overflow-hidden`}>
          <div
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4 ${
              darkMode ? "border-white/10" : "border-ra-marron/10"
            }`}
          >
            <div>
              <h2 className={`text-lg sm:text-xl font-extrabold ${ui.titleMain}`}>Directorio de establecimientos</h2>

              <p className={`mt-1 text-[13px] sm:text-sm ${ui.subText}`}>
                {!filtrosTerritorialesListos
                  ? "Selecciona una región y una comuna para visualizar los establecimientos."
                  : pagination.total > 0
                    ? `Mostrando ${(pagination.page - 1) * pagination.limit + 1}–${Math.min(
                        (pagination.page - 1) * pagination.limit + establecimientos.length,
                        pagination.total
                      )} de ${pagination.total} establecimientos.`
                    : "No existen establecimientos para la región y comuna seleccionadas."}
              </p>
            </div>
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className={darkMode ? "bg-black/20 text-[#ffdda1]" : "bg-[#f7ead4] text-[#6d5829]"}>
                <tr>
                  <th className="px-5 py-3 text-center font-extrabold">Establecimiento</th>

                  <th className="px-5 py-3 text-center font-extrabold">Comuna</th>

                  <th className="px-5 py-3 text-center font-extrabold">Región</th>

                  <th className="px-5 py-3 text-center font-extrabold">Estado</th>

                  <th className="px-5 py-3 text-center font-extrabold">Disponibilidad</th>
                </tr>
              </thead>

              <tbody>
                {establecimientosFiltrados.map((item) => {
                  const activoGlobal = item.estado_global_id === ESTADO_ACTIVO;
                  const activoAcademia = item.estado_academia_id === ESTADO_ACTIVO;

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
                        <LocationValue darkMode={darkMode} value={item.comuna_nombre} />
                      </td>

                      <td className="px-5 py-4 text-center">
                        <LocationValue darkMode={darkMode} value={item.region_nombre} />
                      </td>

                      <td className="px-5 py-4 text-center">
                        <StatusPill darkMode={darkMode} active={activoGlobal} />
                      </td>

                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => cambiarEstado(item)}
                          disabled={procesando || !activoGlobal}
                          className={`inline-flex min-h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            activoAcademia
                              ? darkMode
                                ? "border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : darkMode
                                ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          <Power className="h-4 w-4" />

                          {procesando
                            ? "Procesando…"
                            : !activoGlobal
                              ? "No disponible"
                              : activoAcademia
                                ? "Desactivar"
                                : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!establecimientosFiltrados.length && (
                  <tr>
                    <td colSpan={5} className={`px-6 py-12 text-center text-[14px] ${ui.subText}`}>
                      {filtrosTerritorialesListos
                        ? "No existen establecimientos para los filtros seleccionados."
                        : "Selecciona primero una región y luego una comuna para cargar los establecimientos."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET */}

          <div className="lg:hidden p-3 sm:p-4 space-y-3">
            {establecimientosFiltrados.map((item) => {
              const activoGlobal = item.estado_global_id === ESTADO_ACTIVO;
              const activoAcademia = item.estado_academia_id === ESTADO_ACTIVO;

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

                    <StatusPill darkMode={darkMode} active={activoGlobal} />
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MobileLocationBox darkMode={darkMode} label="Comuna" value={item.comuna_nombre} />

                    <MobileLocationBox darkMode={darkMode} label="Región" value={item.region_nombre} />
                  </div>

                  <button
                    type="button"
                    onClick={() => cambiarEstado(item)}
                    disabled={procesando || !activoGlobal}
                    className={`mt-4 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                      activoAcademia
                        ? darkMode
                          ? "border-red-300/20 bg-red-500/10 text-red-100"
                          : "border-red-200 bg-red-50 text-red-700"
                        : darkMode
                          ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    <Power className="h-4 w-4" />

                    {procesando
                      ? "Procesando…"
                      : !activoGlobal
                        ? "No disponible globalmente"
                        : activoAcademia
                          ? "Desactivar establecimiento"
                          : "Activar establecimiento"}
                  </button>
                </article>
              );
            })}

            {!establecimientosFiltrados.length && (
              <div className={`py-10 text-center text-[14px] ${ui.subText}`}>
                {filtrosTerritorialesListos
                  ? "No existen establecimientos para los filtros seleccionados."
                  : "Selecciona primero una región y luego una comuna para cargar los establecimientos."}
              </div>
            )}
          </div>

          {/* PAGINACIÓN */}
          <div
            className={`border-t px-4 sm:px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 ${
              darkMode ? "border-white/10" : "border-ra-marron/10"
            }`}
          >
            <div className={`text-[13px] sm:text-sm ${ui.subText}`}>
              Página {pagination.page} de {pagination.total_pages}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination.has_previous || pageBusy}
                className={ui.secondaryButton}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.total_pages, current + 1))}
                disabled={!pagination.has_next || pageBusy}
                className={ui.secondaryButton}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
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

function LocationValue({ darkMode, value }) {
  return (
    <div
      className={`inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold ${
        value ? (darkMode ? "text-white/75" : "text-ra-marron/75") : darkMode ? "text-white/35" : "text-ra-marron/40"
      }`}
    >
      <MapPin className="h-3.5 w-3.5" />

      {value || "Sin ubicación definida"}
    </div>
  );
}

function MobileLocationBox({ darkMode, label, value }) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/40"
      }`}
    >
      <div
        className={`text-[11px] uppercase tracking-wide font-extrabold ${
          darkMode ? "text-white/45" : "text-ra-marron/45"
        }`}
      >
        {label}
      </div>

      <div
        className={`mt-1 text-[13px] font-bold ${
          value ? (darkMode ? "text-white/80" : "text-ra-marron/80") : darkMode ? "text-white/35" : "text-ra-marron/40"
        }`}
      >
        {value || "Sin ubicación definida"}
      </div>
    </div>
  );
}

function SummaryCard({ darkMode, label, value, type }) {
  const icon =
    type === "active" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : type === "inactive" ? (
      <XCircle className="h-5 w-5" />
    ) : type === "location" ? (
      <MapPin className="h-5 w-5" />
    ) : (
      <Building2 className="h-5 w-5" />
    );

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.08)] ${
        darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/65 border-ra-marron/15"
      }`}
    >
      <div className={`flex items-center justify-between gap-3 ${darkMode ? "text-white/60" : "text-ra-marron/60"}`}>
        <span className="text-[11px] sm:text-[12px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

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
