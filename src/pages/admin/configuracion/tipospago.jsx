// src/pages/admin/config/TiposPago.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Pencil,
  Power,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  X,
  XCircle,
} from "lucide-react";

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

const getEstadoGlobal = (item) => {
  const raw = item?.estado_global_id ?? item?.estado_id ?? item?.estadoId ?? ESTADO_ACTIVO;

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

const getEstadoAcademia = (item) => {
  const raw = item?.estado_academia_id ?? item?.academia_estado_id ?? item?.estadoAcademiaId ?? ESTADO_INACTIVO;

  return Number(raw) === ESTADO_ACTIVO ? ESTADO_ACTIVO : ESTADO_INACTIVO;
};

const formatCLP = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Sin tarifa";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Sin tarifa";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(number);
};

const parseMonto = (value) => {
  const clean = String(value ?? "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!clean) return null;

  const number = Number(clean);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
};

export default function TiposPago() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);
  const [tipos, setTipos] = useState([]);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);

  const [busyTipoId, setBusyTipoId] = useState(null);
  const [busyTarifaId, setBusyTarifaId] = useState(null);

  const [editandoTipoId, setEditandoTipoId] = useState(null);
  const [montoEdicion, setMontoEdicion] = useState("");

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

      if (status === 401) {
        return "Sesión expirada. Vuelve a iniciar sesión.";
      }

      if (status === 403) {
        return backendMsg || "No tienes permisos para realizar esta acción.";
      }

      if (status === 400) {
        return backendMsg || "Los datos enviados no son válidos.";
      }

      if (status === 404) {
        return backendMsg || "El registro ya no se encuentra disponible.";
      }

      if (status === 409) {
        return backendMsg || "No fue posible completar la acción por una restricción del sistema.";
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
    }, 3000);
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
    const label = "Tipos de Pago";

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
     CARGA DE TIPOS
  ======================================================= */

  const fetchTipos = useCallback(
    async ({ signal } = {}) => {
      try {
        const response = await api.get("/tipo-pago/configuracion", {
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        setTipos(asList(response));
      } catch (err) {
        if (signal?.aborted) {
          return;
        }

        const status = getErrStatus(err);

        if (status === 401) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar la configuración de tipos de pago."));
      }
    },
    [getErrStatus, handleAuth, prettyError]
  );

  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();

    (async () => {
      try {
        setLoading(true);

        await fetchTipos({
          signal: abort.signal,
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rolActual, fetchTipos]);

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      await fetchTipos();
    } finally {
      setReloadBusy(false);
    }
  }, [fetchTipos]);

  /* =======================================================
     DISPONIBILIDAD
  ======================================================= */

  const cambiarDisponibilidad = async (tipo) => {
    const tipoId = Number(tipo?.id);

    if (!Number.isInteger(tipoId) || tipoId <= 0) {
      setError("Tipo de pago inválido.");
      return;
    }

    const estadoGlobal = getEstadoGlobal(tipo);

    if (estadoGlobal !== ESTADO_ACTIVO) {
      setError("El tipo de pago está deshabilitado globalmente y no puede activarse para la academia.");

      return;
    }

    const estadoActual = getEstadoAcademia(tipo);

    const nuevoEstado = estadoActual === ESTADO_ACTIVO ? ESTADO_INACTIVO : ESTADO_ACTIVO;

    setBusyTipoId(tipoId);
    setError("");
    setMensaje("");

    try {
      const response = await api.patch(`/tipo-pago/${tipoId}/disponibilidad`, {
        estado_id: nuevoEstado,
      });

      const actualizado = response?.data?.item ?? response?.item ?? null;

      setTipos((prev) =>
        prev.map((item) =>
          Number(item?.id) === tipoId
            ? actualizado
              ? {
                  ...item,
                  ...actualizado,
                }
              : {
                  ...item,
                  estado_academia_id: nuevoEstado,
                  disponible: nuevoEstado === ESTADO_ACTIVO && getEstadoGlobal(item) === ESTADO_ACTIVO,
                }
            : item
        )
      );

      if (nuevoEstado === ESTADO_INACTIVO && editandoTipoId === tipoId) {
        setEditandoTipoId(null);
        setMontoEdicion("");
      }

      flash(
        nuevoEstado === ESTADO_ACTIVO
          ? "Tipo de pago habilitado correctamente para la academia."
          : "Tipo de pago deshabilitado correctamente para la academia."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible cambiar la disponibilidad del tipo de pago."));
    } finally {
      setBusyTipoId(null);
    }
  };

  /* =======================================================
     EDICIÓN DE TARIFA
  ======================================================= */

  const comenzarEdicionTarifa = (tipo) => {
    const tipoId = Number(tipo?.id);

    if (!Number.isInteger(tipoId) || tipoId <= 0) {
      return;
    }

    if (getEstadoGlobal(tipo) !== ESTADO_ACTIVO) {
      setError("El tipo de pago se encuentra deshabilitado globalmente.");

      return;
    }

    if (getEstadoAcademia(tipo) !== ESTADO_ACTIVO) {
      setError("Primero debes habilitar este tipo de pago para la academia.");

      return;
    }

    setEditandoTipoId(tipoId);

    setMontoEdicion(tipo?.monto === null || tipo?.monto === undefined ? "" : String(Number(tipo.monto)));

    setError("");
    setMensaje("");
  };

  const cancelarEdicionTarifa = () => {
    setEditandoTipoId(null);
    setMontoEdicion("");
  };

  const guardarTarifa = async (tipo) => {
    const tipoId = Number(tipo?.id);

    const tarifaId = tipo?.tarifa_id === null || tipo?.tarifa_id === undefined ? null : Number(tipo.tarifa_id);

    if (!Number.isInteger(tipoId) || tipoId <= 0) {
      setError("Tipo de pago inválido.");
      return;
    }

    if (getEstadoAcademia(tipo) !== ESTADO_ACTIVO) {
      setError("El tipo de pago debe estar habilitado para configurar una tarifa.");

      return;
    }

    const monto = parseMonto(montoEdicion);

    if (monto === null) {
      setError("Ingresa un monto válido, igual o superior a $0.");

      return;
    }

    setBusyTarifaId(tipoId);
    setError("");
    setMensaje("");

    try {
      let response;

      if (tarifaId && Number.isInteger(tarifaId) && tarifaId > 0) {
        response = await api.patch(`/tarifas-academia/${tarifaId}`, {
          monto,
        });
      } else {
        response = await api.post("/tarifas-academia", {
          tipo_pago_id: tipoId,
          monto,
          estado_id: 1,
        });
      }

      const actualizado =
        response?.data?.item ?? response?.item ?? response?.data?.updated ?? response?.updated ?? null;

      if (actualizado) {
        setTipos((prev) =>
          prev.map((item) =>
            Number(item?.id) === tipoId
              ? {
                  ...item,
                  tarifa_id: actualizado?.id ?? actualizado?.tarifa_id ?? item?.tarifa_id ?? null,
                  monto: actualizado?.monto ?? monto,
                  tarifa_estado_id: actualizado?.estado_id ?? 1,
                  tarifa_vigencia_desde: actualizado?.vigencia_desde ?? item?.tarifa_vigencia_desde ?? null,
                  tarifa_vigencia_hasta: actualizado?.vigencia_hasta ?? null,
                  tarifa_es_vigente: actualizado?.es_vigente ?? 1,
                }
              : item
          )
        );
      } else {
        await fetchTipos();
      }

      setEditandoTipoId(null);
      setMontoEdicion("");

      flash(
        tarifaId
          ? "Tarifa actualizada correctamente. El valor anterior queda conservado en el historial."
          : "Tarifa creada correctamente para la academia."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, tarifaId ? "No fue posible actualizar la tarifa." : "No fue posible crear la tarifa."));
    } finally {
      setBusyTarifaId(null);
    }
  };

  /* =======================================================
     NORMALIZACIÓN / FILTROS
  ======================================================= */

  const tiposNormalizados = useMemo(
    () =>
      (Array.isArray(tipos) ? tipos : [])
        .map((item) => {
          const estadoGlobal = getEstadoGlobal(item);
          const estadoAcademia = getEstadoAcademia(item);

          const tarifaId = item?.tarifa_id === null || item?.tarifa_id === undefined ? null : Number(item.tarifa_id);

          const monto = item?.monto === null || item?.monto === undefined ? null : Number(item.monto);

          return {
            ...item,
            id: Number(item?.id ?? 0),
            nombre: String(item?.nombre ?? item?.descripcion ?? `Tipo de pago #${item?.id ?? ""}`).trim(),
            descripcion: item?.descripcion == null ? null : String(item.descripcion),
            estado_global_id: estadoGlobal,
            estado_id: estadoGlobal,
            estado_academia_id: estadoAcademia,
            disponible: estadoGlobal === ESTADO_ACTIVO && estadoAcademia === ESTADO_ACTIVO,
            tarifa_id: Number.isInteger(tarifaId) && tarifaId > 0 ? tarifaId : null,
            monto: Number.isFinite(monto) ? monto : null,
          };
        })
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", {
            sensitivity: "base",
          })
        ),
    [tipos]
  );

  const tiposFiltrados = useMemo(() => {
    const texto = String(filtroTexto || "")
      .trim()
      .toLowerCase();

    return tiposNormalizados.filter((item) => {
      const matchTexto =
        !texto ||
        item.nombre.toLowerCase().includes(texto) ||
        String(item.descripcion ?? "")
          .toLowerCase()
          .includes(texto) ||
        String(item.id).includes(texto);

      const matchEstado = !filtroEstado || String(item.estado_academia_id) === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [tiposNormalizados, filtroTexto, filtroEstado]);

  const resumen = useMemo(() => {
    const habilitados = tiposNormalizados.filter(
      (item) => item.estado_global_id === ESTADO_ACTIVO && item.estado_academia_id === ESTADO_ACTIVO
    );

    const conTarifa = habilitados.filter((item) => item.tarifa_id !== null && item.monto !== null);

    return {
      catalogo: tiposNormalizados.length,
      habilitados: habilitados.length,
      conTarifa: conTarifa.length,
      pendientes: habilitados.length - conTarifa.length,
    };
  }, [tiposNormalizados]);

  /* =======================================================
     TOKENS DE APARIENCIA
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
        primaryHover: "#FFE5B8",
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
      primaryHover: "#994812",
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

     REGLAS:
     - Dashboard pinta el fondo global.
     - La página permanece transparente.
     - Las superficies consumen themeTokens.
     - Colores verde/rojo/ámbar conservan significado
       semántico y no dependen del tema.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const label = "block mb-1.5 text-[13px] sm:text-[14px] font-extrabold";

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-bold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const iconBox =
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200";

    const itemIconBox =
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200";

    const innerCard = "rounded-2xl border p-4 transition-colors duration-200";

    const stateBox = "rounded-xl border px-3 py-3 transition-colors duration-200";

    const tariffBox = "mt-3 rounded-xl border p-3 transition-colors duration-200";

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
      itemIconBox,
      innerCard,
      stateBox,
      tariffBox,
      ok,
      danger,

      pageStyle: {
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
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

      itemIconBoxStyle: {
        backgroundColor: tokens.surface2,
        borderColor: tokens.border,
        color: tokens.icon,
      },

      innerCardStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.text,
      },

      stateBoxStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
      },

      tariffBoxStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
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
            Cargando tipos de pago…
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
              <CircleDollarSign className="h-6 w-6" />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Tipos de Pago
            </h1>

            <p
              className="mx-auto mt-2 max-w-4xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={ui.subTextStyle}
            >
              Define qué conceptos de cobro utiliza tu academia y configura el valor vigente de cada uno sin modificar
              el catálogo global.
            </p>
          </div>
        </header>

        <main>
          {/* =================================================
              RESUMEN
          ================================================= */}

          <section className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard tokens={tokens} label="Catálogo" value={resumen.catalogo} type="catalog" />

            <SummaryCard tokens={tokens} label="Habilitados" value={resumen.habilitados} type="active" />

            <SummaryCard tokens={tokens} label="Con tarifa" value={resumen.conTarifa} type="money" />

            <SummaryCard tokens={tokens} label="Sin tarifa" value={resumen.pendientes} type="pending" />
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
                  Catálogo global, configuración financiera por academia
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm leading-relaxed" style={ui.subTextStyle}>
                  Los nombres y descripciones de los tipos de pago son definidos centralmente. Cada academia decide
                  cuáles utilizar y configura sus propios valores. Cuando una tarifa cambia, el backend conserva la
                  versión anterior para mantener trazabilidad histórica de los pagos.
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              FILTROS
          ================================================= */}

          <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_190px_auto] gap-3 md:items-end">
              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Buscar tipo de pago
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
                    placeholder="Nombre, descripción o ID"
                    className={`${ui.control} !pl-10`}
                    style={ui.controlStyle}
                  />
                </div>
              </div>

              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Uso en academia
                </label>

                <select
                  value={filtroEstado}
                  onChange={(event) => setFiltroEstado(event.target.value)}
                  className={ui.control}
                  style={ui.controlStyle}
                >
                  <option value="">Todos</option>

                  <option value="1">Habilitados</option>

                  <option value="0">No habilitados</option>
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
                  Configuración de cobros
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                  {tiposFiltrados.length} de {tiposNormalizados.length} tipos mostrados.
                </p>
              </div>
            </div>

            {/* ===============================================
                DESKTOP
            =============================================== */}

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead style={ui.tableHeadStyle}>
                  <tr>
                    <th className="px-4 py-3 text-center font-extrabold">Tipo de pago</th>

                    <th className="px-4 py-3 text-center font-extrabold">Estado global</th>

                    <th className="px-4 py-3 text-center font-extrabold">Academia</th>

                    <th className="px-4 py-3 text-center font-extrabold">Tarifa vigente</th>

                    <th className="px-4 py-3 text-center font-extrabold">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {tiposFiltrados.map((item) => {
                    const activoGlobal = item.estado_global_id === ESTADO_ACTIVO;

                    const activoAcademia = item.estado_academia_id === ESTADO_ACTIVO;

                    const procesandoTipo = busyTipoId === item.id;

                    const procesandoTarifa = busyTarifaId === item.id;

                    const editando = editandoTipoId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="border-t align-top transition hover:bg-[var(--weli-surface-hover)]"
                        style={{
                          borderColor: tokens.border,
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="text-center">
                            <div
                              className="font-extrabold"
                              style={{
                                color: tokens.text,
                              }}
                            >
                              {item.nombre}
                            </div>

                            {!!item.descripcion && (
                              <div
                                className="mx-auto mt-1 max-w-[260px] text-[12px] leading-relaxed"
                                style={ui.subTextStyle}
                              >
                                {item.descripcion}
                              </div>
                            )}

                            <div className="mt-1 text-[11px]" style={ui.subTextStyle}>
                              ID {item.id}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <StatusPill
                            tokens={tokens}
                            darkMode={darkMode}
                            active={activoGlobal}
                            activeText="Activo"
                            inactiveText="Inactivo"
                          />
                        </td>

                        <td className="px-4 py-4 text-center">
                          <StatusPill
                            tokens={tokens}
                            darkMode={darkMode}
                            active={activoGlobal && activoAcademia}
                            activeText="Habilitado"
                            inactiveText="No habilitado"
                          />
                        </td>

                        <td className="px-4 py-4 text-center">
                          {editando ? (
                            <div className="mx-auto w-[180px]">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={montoEdicion}
                                onChange={(event) => setMontoEdicion(event.target.value)}
                                className={`${ui.control} text-center`}
                                style={ui.controlStyle}
                                placeholder="Ej: 25000"
                                disabled={procesandoTarifa}
                                autoFocus
                              />

                              <div className="mt-2 flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => guardarTarifa(item)}
                                  disabled={procesandoTarifa}
                                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12px] font-extrabold transition disabled:opacity-50 ${
                                    darkMode
                                      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  }`}
                                >
                                  <Save className="h-3.5 w-3.5" />

                                  {procesandoTarifa ? "Guardando…" : "Guardar"}
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelarEdicionTarifa}
                                  disabled={procesandoTarifa}
                                  className={ui.secondaryButton}
                                  style={ui.secondaryButtonStyle}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div
                                className={`text-[15px] font-extrabold ${
                                  item.monto !== null ? (darkMode ? "text-emerald-100" : "text-emerald-800") : ""
                                }`}
                                style={item.monto !== null ? undefined : ui.subTextStyle}
                              >
                                {formatCLP(item.monto)}
                              </div>

                              {item.tarifa_id && (
                                <div className="mt-1 text-[11px]" style={ui.subTextStyle}>
                                  Tarifa #{item.tarifa_id}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-col items-center gap-2">
                            <button
                              type="button"
                              onClick={() => cambiarDisponibilidad(item)}
                              disabled={procesandoTipo || !activoGlobal}
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

                              {procesandoTipo
                                ? "Procesando…"
                                : !activoGlobal
                                  ? "No disponible"
                                  : activoAcademia
                                    ? "Deshabilitar"
                                    : "Habilitar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => comenzarEdicionTarifa(item)}
                              disabled={!activoGlobal || !activoAcademia || procesandoTarifa || editando}
                              className={`inline-flex min-h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                darkMode
                                  ? "border-amber-300/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              }`}
                            >
                              <Pencil className="h-4 w-4" />

                              {item.tarifa_id ? "Editar tarifa" : "Definir tarifa"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!tiposFiltrados.length && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-[14px]" style={ui.subTextStyle}>
                        No existen tipos de pago para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ===============================================
                MOBILE / TABLET
            =============================================== */}

            <div className="lg:hidden p-3 sm:p-4 space-y-3">
              {tiposFiltrados.map((item) => {
                const activoGlobal = item.estado_global_id === ESTADO_ACTIVO;

                const activoAcademia = item.estado_academia_id === ESTADO_ACTIVO;

                const procesandoTipo = busyTipoId === item.id;

                const procesandoTarifa = busyTarifaId === item.id;

                const editando = editandoTipoId === item.id;

                return (
                  <article key={item.id} className={ui.innerCard} style={ui.innerCardStyle}>
                    <div className="flex items-start gap-3">
                      <div className={ui.itemIconBox} style={ui.itemIconBoxStyle}>
                        <Banknote className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3
                          className="text-base font-extrabold break-words"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {item.nombre}
                        </h3>

                        {!!item.descripcion && (
                          <p className="mt-1 text-[12px] leading-relaxed" style={ui.subTextStyle}>
                            {item.descripcion}
                          </p>
                        )}

                        <p className="mt-1 text-[11px]" style={ui.subTextStyle}>
                          ID {item.id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MobileStateBox
                        tokens={tokens}
                        darkMode={darkMode}
                        label="Estado global"
                        active={activoGlobal}
                        activeText="Activo"
                        inactiveText="Inactivo"
                      />

                      <MobileStateBox
                        tokens={tokens}
                        darkMode={darkMode}
                        label="Academia"
                        active={activoGlobal && activoAcademia}
                        activeText="Habilitado"
                        inactiveText="No habilitado"
                      />
                    </div>

                    <div className={ui.tariffBox} style={ui.tariffBoxStyle}>
                      <div className="text-[11px] uppercase tracking-wide font-extrabold" style={ui.subTextStyle}>
                        Tarifa vigente
                      </div>

                      {!editando ? (
                        <div className="mt-1">
                          <div
                            className={`text-lg font-extrabold ${
                              item.monto !== null ? (darkMode ? "text-emerald-100" : "text-emerald-800") : ""
                            }`}
                            style={item.monto !== null ? undefined : ui.subTextStyle}
                          >
                            {formatCLP(item.monto)}
                          </div>

                          {item.tarifa_id && (
                            <div className="mt-0.5 text-[11px]" style={ui.subTextStyle}>
                              Tarifa #{item.tarifa_id}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={montoEdicion}
                            onChange={(event) => setMontoEdicion(event.target.value)}
                            className={ui.control}
                            style={ui.controlStyle}
                            placeholder="Ej: 25000"
                            disabled={procesandoTarifa}
                            autoFocus
                          />

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => guardarTarifa(item)}
                              disabled={procesandoTarifa}
                              className={`min-h-10 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-extrabold transition disabled:opacity-50 ${
                                darkMode
                                  ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              <Save className="h-4 w-4" />

                              {procesandoTarifa ? "Guardando…" : "Guardar"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelarEdicionTarifa}
                              disabled={procesandoTarifa}
                              className={ui.secondaryButton}
                              style={ui.secondaryButtonStyle}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => cambiarDisponibilidad(item)}
                        disabled={procesandoTipo || !activoGlobal}
                        className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-extrabold transition disabled:opacity-50 ${
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

                        {procesandoTipo ? "Procesando…" : activoAcademia ? "Deshabilitar" : "Habilitar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => comenzarEdicionTarifa(item)}
                        disabled={!activoGlobal || !activoAcademia || procesandoTarifa || editando}
                        className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-extrabold transition disabled:opacity-50 ${
                          darkMode
                            ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        <Pencil className="h-4 w-4" />

                        {item.tarifa_id ? "Editar tarifa" : "Definir tarifa"}
                      </button>
                    </div>
                  </article>
                );
              })}

              {!tiposFiltrados.length && (
                <div className="py-10 text-center text-[14px]" style={ui.subTextStyle}>
                  No existen tipos de pago para los filtros seleccionados.
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

function StatusPill({ tokens, darkMode, active, activeText, inactiveText }) {
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
        {activeText}
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
      {inactiveText}
    </span>
  );
}

/* =========================================================
   MOBILE STATE BOX
========================================================= */

function MobileStateBox({ tokens, darkMode, label, active, activeText, inactiveText }) {
  return (
    <div
      className="rounded-xl border px-3 py-3 transition-colors duration-200"
      style={{
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wide font-extrabold"
        style={{
          color: tokens.textMuted,
        }}
      >
        {label}
      </div>

      <div
        className={`mt-1 text-[13px] font-bold ${active ? (darkMode ? "text-emerald-100" : "text-emerald-800") : ""}`}
        style={
          active
            ? undefined
            : {
                color: tokens.textMuted,
              }
        }
      >
        {active ? activeText : inactiveText}
      </div>
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ tokens, label, value, type }) {
  const icon =
    type === "active" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : type === "money" ? (
      <Banknote className="h-5 w-5" />
    ) : type === "pending" ? (
      <XCircle className="h-5 w-5" />
    ) : (
      <Tags className="h-5 w-5" />
    );

  const iconColor =
    type === "active" || type === "money" ? "#16A34A" : type === "pending" ? tokens.textMuted : tokens.icon;

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
        <span className="text-[11px] sm:text-[12px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

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
