// src/pages/admin/config/MediosPago.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { CheckCircle2, CreditCard, Power, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =========================================================
   WELI - MEDIOS DE PAGO

   POLÍTICA:
   - El Admin NO crea medios de pago.
   - El Admin NO edita nombres.
   - El Admin NO elimina medios de pago.
   - El Admin solo activa/desactiva los medios disponibles
     para su academia.

   La creación y mantención estructural del catálogo quedará
   bajo responsabilidad de Superadmin.
========================================================= */

const ESTADO_ACTIVO = 1;
const ESTADO_INACTIVO = 0;

const __inFlight = new Map();
let __resolvedBase = "";

function once(key, fn) {
  if (__inFlight.has(key)) return __inFlight.get(key);

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      __inFlight.delete(key);
    }
  })();

  __inFlight.set(key, promise);

  return promise;
}

const normalizeBase = (url) => (String(url || "").endsWith("/") ? String(url).slice(0, -1) : String(url || ""));

const variants = (base) => {
  const value = String(base || "");

  return value.endsWith("/") ? [value, value.slice(0, -1)] : [value, `${value}/`];
};

const toArray = (response) => {
  const data = response?.data ?? response ?? [];

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;

  return [];
};

const getEstadoMedio = (item) => {
  const raw = item?.estado_id ?? item?.estadoId ?? item?.estado ?? item?.activo ?? ESTADO_ACTIVO;

  if (typeof raw === "boolean") {
    return raw ? ESTADO_ACTIVO : ESTADO_INACTIVO;
  }

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

export default function MediosPago() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [authorized, setAuthorized] = useState(false);

  const [medios, setMedios] = useState([]);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

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
        return backendMsg || "No fue posible actualizar el medio de pago.";
      }

      if (status === 404) {
        return backendMsg || "El medio de pago ya no se encuentra disponible.";
      }

      if (status === 409) {
        return backendMsg || "El medio de pago no puede cambiar de disponibilidad por una restricción del sistema.";
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
    const label = "Medios de Pago";

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
     ENDPOINT

     Conserva la resolución tolerante existente.
  ======================================================= */

  const resolveBaseEndpoint = useCallback(
    async (signal) => {
      if (__resolvedBase) {
        return __resolvedBase;
      }

      const candidates = ["/medio-pago", "/medios-pago"];

      let lastError = null;

      for (const base of candidates) {
        for (const url of variants(base)) {
          try {
            const response = await api.get(url, {
              signal,
            });

            if (signal?.aborted) {
              return "";
            }

            __resolvedBase = normalizeBase(url);

            setMedios(toArray(response));

            return __resolvedBase;
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
    },
    [getErrStatus, isNetworkDown]
  );

  const fetchMedios = useCallback(
    async (signal) => {
      if (!authorized) return;

      return once("mediosPago:bootstrap", async () => {
        setError("");

        const base = await resolveBaseEndpoint(signal);

        if (!base || signal?.aborted) {
          return;
        }

        const response = await api.get(base, {
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        setMedios(toArray(response));
      });
    },
    [authorized, resolveBaseEndpoint]
  );

  useEffect(() => {
    if (!authorized) return;

    const abort = new AbortController();

    (async () => {
      setLoading(true);

      try {
        await fetchMedios(abort.signal);
      } catch (err) {
        if (abort.signal.aborted) return;

        const status = getErrStatus(err);

        if (status === 401 || status === 403) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar los medios de pago."));
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [authorized, fetchMedios, getErrStatus, handleAuth, prettyError]);

  const refresh = useCallback(async () => {
    if (!authorized) return;

    setReloadBusy(true);
    setError("");

    try {
      const base = __resolvedBase || (await resolveBaseEndpoint());

      const response = await api.get(base);

      setMedios(toArray(response));
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401 || status === 403) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible actualizar los medios de pago."));
    } finally {
      setReloadBusy(false);
    }
  }, [authorized, getErrStatus, handleAuth, prettyError, resolveBaseEndpoint]);

  /* =======================================================
     DISPONIBILIDAD

     Requiere que el backend acepte estado_id.
  ======================================================= */

  const cambiarDisponibilidad = async (medio) => {
    const medioId = Number(medio?.id);

    if (!Number.isInteger(medioId) || medioId <= 0) {
      setError("Medio de pago inválido.");
      return;
    }

    const estadoActual = getEstadoMedio(medio);

    const nuevoEstado = estadoActual === ESTADO_ACTIVO ? ESTADO_INACTIVO : ESTADO_ACTIVO;

    const baseEndpoint = __resolvedBase || "/medio-pago";

    setBusyId(medioId);
    setError("");
    setMensaje("");

    try {
      let updated = false;
      let lastError = null;

      for (const url of variants(`${baseEndpoint}/${medioId}`)) {
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

      setMedios((prev) =>
        prev.map((item) =>
          Number(item?.id) === medioId
            ? {
                ...item,
                estado_id: nuevoEstado,
              }
            : item
        )
      );

      flash(
        nuevoEstado === ESTADO_ACTIVO
          ? "Medio de pago habilitado correctamente."
          : "Medio de pago deshabilitado correctamente."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible cambiar la disponibilidad del medio de pago."));
    } finally {
      setBusyId(null);
    }
  };

  /* =======================================================
     NORMALIZACIÓN / FILTROS
  ======================================================= */

  const mediosNormalizados = useMemo(
    () =>
      (Array.isArray(medios) ? medios : [])
        .map((item) => ({
          ...item,
          id: Number(item?.id ?? 0),
          nombre: String(item?.nombre ?? item?.descripcion ?? `Medio #${item?.id ?? ""}`).trim(),
          estado_id: getEstadoMedio(item),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", {
            sensitivity: "base",
          })
        ),
    [medios]
  );

  const mediosFiltrados = useMemo(() => {
    const texto = String(filtroTexto ?? "")
      .trim()
      .toLowerCase();

    return mediosNormalizados.filter((item) => {
      const matchTexto = !texto || item.nombre.toLowerCase().includes(texto) || String(item.id).includes(texto);

      const matchEstado = !filtroEstado || String(item.estado_id) === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [mediosNormalizados, filtroTexto, filtroEstado]);

  const resumen = useMemo(() => {
    const activos = mediosNormalizados.filter((item) => item.estado_id === ESTADO_ACTIVO).length;

    return {
      total: mediosNormalizados.length,
      activos,
      inactivos: mediosNormalizados.length - activos,
    };
  }, [mediosNormalizados]);

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext resuelve automáticamente:
     - paleta personalizada;
     - Light Mode;
     - Dark Mode.
  ======================================================= */

  const tokens = useMemo(() => {
    if (themeTokens) {
      return themeTokens;
    }

    if (darkMode) {
      return {
        surface: "#1F2937",
        surfaceSoft: "#172033",
        surface2: "#263244",
        surfaceHover: "#374151",
        primary: "#FFDDA1",
        primaryContrast: "#3F2D18",
        text: "#F9FAFB",
        textMuted: "#D1D5DB",
        icon: "#FFDDA1",
        border: "#374151",
        borderStrong: "#4B5563",
        inputBg: "#111827",
        inputText: "#F9FAFB",
        inputBorder: "#4B5563",
        tableHead: "#172033",
        focus: "#FFDDA1",
      };
    }

    return {
      surface: "#FFFFFF",
      surfaceSoft: "#FAF6EE",
      surface2: "#F7EAD4",
      surfaceHover: "#FFF9F2",
      primary: "#AA5013",
      primaryContrast: "#FFFFFF",
      text: "#3B2A1E",
      textMuted: "#766657",
      icon: "#AA5013",
      border: "#D8C7AE",
      borderStrong: "#BFA684",
      inputBg: "#FFFFFF",
      inputText: "#3B2A1E",
      inputBorder: "#9B7B50",
      tableHead: "#F7EAD4",
      focus: "#AA5013",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     Misma base visual de listarPagos.jsx.

     REGLAS:
     - Dashboard controla el fondo general.
     - Esta vista permanece transparente.
     - Sólo tarjetas, controles y tabla poseen superficie.
     - Las superficies consumen themeTokens.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const label = "block mb-1.5 text-[13px] sm:text-[14px] font-extrabold";

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2";

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-bold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const iconBox =
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200";

    const innerCard = "rounded-2xl border p-4 transition-colors duration-200";

    const ok =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800");

    const danger =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    return {
      page,
      content,
      card,
      label,
      control,
      secondaryButton,
      iconBox,
      innerCard,
      ok,
      danger,

      pageStyle: {
        color: tokens.text,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      },

      innerCardStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      labelStyle: {
        color: tokens.text,
      },

      controlStyle: {
        backgroundColor: tokens.inputBg,
        borderColor: tokens.inputBorder,
        color: tokens.inputText,
        "--tw-ring-color": `${tokens.focus}33`,
      },

      secondaryButtonStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.borderStrong,
        color: tokens.text,
      },

      iconBoxStyle: {
        backgroundColor: tokens.surface2,
        borderColor: tokens.border,
        color: tokens.icon,
      },

      tableHeadStyle: {
        backgroundColor: tokens.tableHead,
        color: tokens.text,
      },

      dividerStyle: {
        borderColor: tokens.border,
      },
    };
  }, [darkMode, tokens]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
        <div className={`${ui.content} min-h-[70vh] flex items-center justify-center`}>
          <div className="text-sm font-semibold" style={ui.subTextStyle}>
            Cargando medios de pago…
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <div className="mx-auto max-w-4xl">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-200"
              style={ui.iconBoxStyle}
            >
              <CreditCard className="h-6 w-6" />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Medios de Pago
            </h1>

            <p
              className="mx-auto mt-2 max-w-4xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={ui.subTextStyle}
            >
              Habilita o deshabilita los medios de pago disponibles para la operación de tu academia. La creación,
              modificación y eliminación del catálogo se administra de forma centralizada.
            </p>
          </div>
        </header>

        <main>
          {/* =================================================
              RESUMEN
          ================================================= */}

          <section className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard tokens={tokens} label="Medios configurados" value={resumen.total} type="total" />

            <SummaryCard tokens={tokens} label="Activos" value={resumen.activos} type="active" />

            <SummaryCard tokens={tokens} label="Inactivos" value={resumen.inactivos} type="inactive" />
          </section>

          {/* =================================================
              MENSAJES
          ================================================= */}

          <div className="mt-4 space-y-3">
            {!!mensaje && <div className={ui.ok}>{mensaje}</div>}

            {!!error && <div className={ui.danger}>{error}</div>}
          </div>

          {/* =================================================
              GOBERNANZA
          ================================================= */}

          <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
            <div className="flex items-start gap-3">
              <div className={`${ui.iconBox} mt-0.5`} style={ui.iconBoxStyle}>
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-[15px] sm:text-base font-extrabold" style={ui.titleStyle}>
                  Catálogo administrado centralmente
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm leading-relaxed" style={ui.subTextStyle}>
                  Esta pantalla no permite crear, renombrar ni eliminar medios de pago. El administrador de academia
                  únicamente define cuáles estarán disponibles para registrar sus operaciones financieras.
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              FILTROS
          ================================================= */}

          <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-3 lg:items-end">
              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Buscar medio de pago
                </label>

                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 pointer-events-none"
                    style={{
                      color: tokens.textMuted,
                    }}
                  />

                  <input
                    type="text"
                    value={filtroTexto}
                    onChange={(event) => setFiltroTexto(event.target.value)}
                    placeholder="Nombre o ID del medio"
                    className={`${ui.control} !pl-10`}
                    style={ui.controlStyle}
                  />
                </div>
              </div>

              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Estado
                </label>

                <select
                  value={filtroEstado}
                  onChange={(event) => setFiltroEstado(event.target.value)}
                  className={ui.control}
                  style={ui.controlStyle}
                >
                  <option value="">Todos</option>

                  <option value="1">Activos</option>

                  <option value="0">Inactivos</option>
                </select>
              </div>

              <button
                type="button"
                onClick={refresh}
                disabled={reloadBusy}
                className={ui.secondaryButton}
                style={ui.secondaryButtonStyle}
              >
                <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </section>

          {/* =================================================
              LISTADO
          ================================================= */}

          <section className={`${ui.card} mt-4 overflow-hidden`} style={ui.cardStyle}>
            <div
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4"
              style={ui.dividerStyle}
            >
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold" style={ui.titleStyle}>
                  Medios disponibles
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                  {mediosFiltrados.length} medio
                  {mediosFiltrados.length !== 1 ? "s" : ""} visible
                  {mediosFiltrados.length !== 1 ? "s" : ""}.
                </p>
              </div>
            </div>

            {/* ===============================================
                DESKTOP
            =============================================== */}

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead style={ui.tableHeadStyle}>
                  <tr>
                    <th className="px-5 py-3 text-center font-extrabold">Medio de pago</th>

                    <th className="px-5 py-3 text-center font-extrabold">Disponibilidad</th>

                    <th className="px-5 py-3 text-center font-extrabold">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {mediosFiltrados.map((item) => {
                    const activo = item.estado_id === ESTADO_ACTIVO;

                    const procesando = busyId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="border-t transition hover:bg-[var(--weli-surface-hover)]"
                        style={{
                          borderColor: tokens.border,
                        }}
                      >
                        <td className="px-5 py-4 text-center">
                          <div
                            className="font-extrabold"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {item.nombre}
                          </div>

                          <div
                            className="mt-0.5 text-[12px]"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            ID {item.id}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <StatusPill tokens={tokens} darkMode={darkMode} active={activo} />
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

                  {!mediosFiltrados.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-12 text-center text-[14px]"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        No existen medios de pago para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ===============================================
                MOBILE
            =============================================== */}

            <div className="md:hidden p-3 space-y-3">
              {mediosFiltrados.map((item) => {
                const activo = item.estado_id === ESTADO_ACTIVO;

                const procesando = busyId === item.id;

                return (
                  <article key={item.id} className={ui.innerCard} style={ui.innerCardStyle}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className="text-base font-extrabold break-words"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {item.nombre}
                        </h3>

                        <p
                          className="mt-1 text-[12px]"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          ID {item.id}
                        </p>
                      </div>

                      <StatusPill tokens={tokens} darkMode={darkMode} active={activo} />
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

                      {procesando ? "Procesando…" : activo ? "Desactivar medio" : "Activar medio"}
                    </button>
                  </article>
                );
              })}

              {!mediosFiltrados.length && (
                <div
                  className="py-10 text-center text-[14px]"
                  style={{
                    color: tokens.textMuted,
                  }}
                >
                  No existen medios de pago para los filtros seleccionados.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   STATUS PILL
========================================================= */

function StatusPill({ tokens, darkMode, active }) {
  if (active) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold ${
          darkMode
            ? "border-emerald-300/20 bg-emerald-500/15 text-emerald-100"
            : "border-emerald-200 bg-emerald-100 text-emerald-800"
        }`}
      >
        <CheckCircle2 className="h-4 w-4" />
        Activo
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold"
      style={{
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.textMuted,
      }}
    >
      <XCircle className="h-4 w-4" />
      Inactivo
    </span>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ tokens, label, value, type }) {
  const icon =
    type === "active" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : type === "inactive" ? (
      <XCircle className="h-5 w-5" />
    ) : (
      <CreditCard className="h-5 w-5" />
    );

  const iconColor = type === "active" ? "#16A34A" : type === "inactive" ? tokens.textMuted : tokens.icon;

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.08)] transition-colors duration-200"
      style={{
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      }}
    >
      <div
        className="flex items-center justify-between gap-3"
        style={{
          color: tokens.textMuted,
        }}
      >
        <span className="text-[12px] sm:text-[13px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

        <span
          style={{
            color: iconColor,
          }}
        >
          {icon}
        </span>
      </div>

      <strong
        className="mt-2 block text-2xl sm:text-3xl font-extrabold"
        style={{
          color: tokens.text,
        }}
      >
        {value}
      </strong>
    </div>
  );
}
