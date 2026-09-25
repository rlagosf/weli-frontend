// src/pages/admin/listarPagos.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";

import { useTheme } from "../../context/ThemeContext";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";
import { formatRutWithDV } from "../../services/rut";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import IsLoading from "../../components/isLoading";

/* =========================================================
   CONSTANTES
========================================================= */

const ESTADO_JUGADOR_ACTIVO = 1;
const SITUACION_PAGO_PAGADO_ID = 1;
const PAGE_SIZE = 12;

const PALETTE = {
  brown: "#6d5829",
  sand: "#ffdda1",
};

/* =========================================================
   HELPERS
========================================================= */

const asList = (raw) => {
  const data = raw?.data ?? raw;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.pagos)) return data.pagos;

  return [];
};

const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) return null;

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);

    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const buildHeaders = (rol) => {
  const token = getToken();

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  if (rol === 3) {
    const academiaId = getAcademiaIdFromStorage();

    if (academiaId) {
      headers["x-academia-id"] = String(academiaId);
    }
  }

  return headers;
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || Number(decoded.exp) <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

  const value = Number(raw);

  return Number.isInteger(value) ? value : 0;
};

const toCLP = (value) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);

const monthKeyFromDate = (value) => {
  if (!value) return "";

  const text = String(value);

  const match = text.match(/^(\d{4})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const currentMonthKey = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const compareMonthKeys = (a, b) => {
  if (!a || !b) return 0;
  return a.localeCompare(b);
};

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const responseData = (response) => response?.data ?? response ?? {};

const normalizePlanRule = (plan) => {
  const rules = Array.isArray(plan?.reglas) ? plan.reglas : plan?.regla ? [plan.regla] : [];

  const rule = rules.find((item) => Number(item?.estado_id ?? 1) === 1);

  if (!rule) return null;

  return {
    id: Number(rule.id ?? 0) || null,
    tipo_beneficio: String(rule.tipo_beneficio ?? "")
      .trim()
      .toUpperCase(),
    valor: safeNumber(rule.valor, 0),
  };
};

const calculateExtraBenefit = (baseRaw, plan) => {
  const base = Math.max(0, safeNumber(baseRaw, 0));
  const rule = normalizePlanRule(plan);

  if (!rule) {
    return {
      descuento: 0,
      total: base,
    };
  }

  const valor = Math.max(0, safeNumber(rule.valor, 0));

  if (rule.tipo_beneficio === "PORCENTAJE") {
    const descuento = Math.min(base, base * (Math.min(valor, 100) / 100));

    return {
      descuento,
      total: Math.max(0, base - descuento),
    };
  }

  if (rule.tipo_beneficio === "DESCUENTO_FIJO") {
    const descuento = Math.min(base, valor);

    return {
      descuento,
      total: Math.max(0, base - descuento),
    };
  }

  if (rule.tipo_beneficio === "PRECIO_FIJO") {
    const total = Math.min(base, valor);

    return {
      descuento: Math.max(0, base - total),
      total,
    };
  }

  return {
    descuento: 0,
    total: base,
  };
};

/* =========================================================
   API
========================================================= */

const getApi = async (path, headers, signal) =>
  api.get(path, {
    headers,
    signal,
  });

const postApi = async (path, body, headers) =>
  api.post(path, body, {
    headers,
  });

const putApi = async (path, body, headers) =>
  api.put(path, body, {
    headers,
  });

const deleteApi = async (path, headers) =>
  api.delete(path, {
    headers,
  });

/* =========================================================
   COMPONENTE
========================================================= */

export default function ListarPagos() {
  const { darkMode, themeTokens } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const breadcrumbBootRef = useRef(false);

  const [rolActual, setRolActual] = useState(0);
  const [academiaTarget, setAcademiaTarget] = useState(() => getAcademiaIdFromStorage());

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [error, setError] = useState("");

  const [jugadores, setJugadores] = useState([]);
  const [jugadorPlanes, setJugadorPlanes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [medios, setMedios] = useState([]);
  const [situaciones, setSituaciones] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tiposPagoAcademia, setTiposPagoAcademia] = useState([]);

  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroBeneficio, setFiltroBeneficio] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroConcepto, setFiltroConcepto] = useState("");
  const [mesSeleccionado, setMesSeleccionado] = useState(currentMonthKey());
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [configJugador, setConfigJugador] = useState([]);

  const [editForm, setEditForm] = useState({
    id: null,
    create: true,

    jugador_id: "",
    jugador_rut: "",

    tipo_pago_id: "",
    plan_catalogo_id: "",

    sucursal_id: "",

    fecha_pago: todayISO(),
    medio_pago_id: "",
    situacion_pago_id: String(SITUACION_PAGO_PAGADO_ID),

    observaciones: "",
  });

  const [successOpen, setSuccessOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

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

      if (isExpired(decoded)) {
        throw new Error("expired");
      }

      const rol = extractRol(decoded);

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        return;
      }

      if (rol === 3) {
        const academiaId = getAcademiaIdFromStorage();

        if (!academiaId) {
          throw new Error("missing-academia-target");
        }

        setAcademiaTarget(academiaId);
      }

      setRolActual(rol);
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, dashboardBase]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname + location.search;
    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];
    const label = "Recaudación";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            {
              label,
              to: location.pathname,
            },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* =======================================================
     CAMBIO ACADEMIA SUPERADMIN
  ======================================================= */

  useEffect(() => {
    const sync = () => setAcademiaTarget(getAcademiaIdFromStorage());

    const onStorage = (event) => {
      if (event?.key === ACADEMIA_STORAGE_KEY) {
        sync();
      }
    };

    const onAcademiaChanged = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener("weli:selectedAcademiaChanged", onAcademiaChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("weli:selectedAcademiaChanged", onAcademiaChanged);
    };
  }, []);

  /* =======================================================
     NORMALIZACIONES
  ======================================================= */

  const categoriasMap = useMemo(
    () =>
      new Map(
        (Array.isArray(categorias) ? categorias : []).map((item) => [
          Number(item?.id ?? item?.categoria_id ?? 0),
          String(item?.nombre ?? item?.descripcion ?? "").trim(),
        ])
      ),
    [categorias]
  );

  const jugadoresActivos = useMemo(() => {
    return jugadores
      .filter((item) => Number(item?.estado_id ?? item?.estadoId ?? item?.estado ?? 0) === ESTADO_JUGADOR_ACTIVO)
      .map((item) => {
        const categoriaId = Number(item?.categoria_id ?? item?.categoria?.id ?? 0);

        const categoriaNombre =
          item?.categoria_nombre ??
          item?.categoria?.nombre ??
          (categoriaId > 0 ? categoriasMap.get(categoriaId) : null) ??
          "Sin categoría";

        return {
          ...item,

          id: Number(item?.id ?? item?.jugador_id ?? 0),

          rut_jugador: item?.rut_jugador ?? item?.rut ?? "",

          nombre_jugador: item?.nombre_jugador ?? item?.nombre ?? item?.nombre_completo ?? "—",

          categoria_id: categoriaId > 0 ? categoriaId : null,

          categoria_nombre: categoriaNombre,

          sucursal_id: item?.sucursal_id ?? item?.sucursal?.id ?? null,

          sucursal_nombre: item?.sucursal_nombre ?? item?.sucursal?.nombre ?? "Sin sucursal",
        };
      })
      .filter((item) => Number.isInteger(item.id) && item.id > 0);
  }, [jugadores, categoriasMap]);

  const jugadoresMapById = useMemo(
    () => new Map(jugadoresActivos.map((item) => [Number(item.id), item])),
    [jugadoresActivos]
  );

  const planesMap = useMemo(() => new Map(planes.map((item) => [Number(item.id), item])), [planes]);

  const mediosMap = useMemo(() => new Map(medios.map((item) => [Number(item.id), item])), [medios]);

  const situacionesMap = useMemo(() => new Map(situaciones.map((item) => [Number(item.id), item])), [situaciones]);

  const tiposPagoNormalizados = useMemo(
    () =>
      (Array.isArray(tiposPagoAcademia) ? tiposPagoAcademia : [])
        .map((item) => {
          const id = Number(item?.id ?? item?.tipo_pago_id ?? 0);
          const monto = safeNumber(item?.monto ?? item?.tarifa_monto ?? item?.monto_tarifa, 0);
          const tarifaId = Number(item?.tarifa_id ?? 0);

          return {
            ...item,
            id,
            tipo_pago_id: id,
            nombre: String(item?.nombre ?? item?.tipo_pago_nombre ?? `Tipo ${id}`).trim(),
            tarifa_id: Number.isInteger(tarifaId) && tarifaId > 0 ? tarifaId : null,
            monto,
          };
        })
        .filter((item) => Number.isInteger(item.id) && item.id > 0),
    [tiposPagoAcademia]
  );

  const tiposPagoMap = useMemo(
    () => new Map(tiposPagoNormalizados.map((item) => [Number(item.id), item])),
    [tiposPagoNormalizados]
  );

  /* =======================================================
     CARGA
  ======================================================= */

  const loadAll = useCallback(
    async ({ signal } = {}) => {
      if (!rolActual) return;
      if (rolActual === 3 && !academiaTarget) return;

      const headers = buildHeaders(rolActual);

      setError("");

      const [
        jugadoresResp,
        jugadorPlanesResp,
        pagosResp,
        mediosResp,
        situacionesResp,
        planesResp,
        categoriasResp,
        tiposPagoResp,
      ] = await Promise.all([
        getApi("/jugadores", headers, signal),
        getApi("/jugador-planes?activos=1&limit=500", headers, signal),
        getApi("/pagos-jugador/estado-cuenta", headers, signal),
        getApi("/medio-pago", headers, signal),
        getApi("/situacion-pago", headers, signal),
        getApi("/planes/catalogo", headers, signal),
        getApi("/categorias", headers, signal),
        getApi("/tipo-pago", headers, signal),
      ]);

      const pagosData = responseData(pagosResp);

      setJugadores(asList(jugadoresResp));
      setJugadorPlanes(asList(jugadorPlanesResp));
      setPagos(Array.isArray(pagosData?.items) ? pagosData.items : asList(pagosResp));
      setMedios(asList(mediosResp));
      setSituaciones(asList(situacionesResp));
      setPlanes(asList(planesResp));
      setCategorias(asList(categoriasResp));
      setTiposPagoAcademia(asList(tiposPagoResp));
    },
    [rolActual, academiaTarget]
  );

  useEffect(() => {
    if (!rolActual) return;
    if (rolActual === 3 && !academiaTarget) return;

    const abort = new AbortController();

    (async () => {
      setLoading(true);

      try {
        await loadAll({
          signal: abort.signal,
        });
      } catch (err) {
        if (abort.signal.aborted) return;

        const status = err?.status ?? err?.response?.status;

        if (status === 401 || status === 403) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        setError(err?.response?.data?.message ?? err?.message ?? "No se pudo cargar la recaudación.");
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rolActual, academiaTarget, loadAll, navigate]);

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

        secondary: "#B79F69",
        secondaryHover: "#C8B27F",
        secondaryContrast: "#111827",

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
        overlay: "rgba(0,0,0,.65)",
      };
    }

    return {
      surface: "#FFFFFF",
      surfaceSoft: "#FAF6EE",
      surface2: "#F7EAD4",
      surfaceHover: "#FFF9F2",

      primary: PALETTE.sand,
      primaryHover: "#FFE5B8",
      primaryContrast: PALETTE.brown,

      secondary: PALETTE.brown,
      secondaryHover: "#5E4B23",
      secondaryContrast: "#FFFFFF",

      text: "#3F2D18",
      textMuted: "#766657",

      icon: PALETTE.brown,

      border: "#D8C7AE",
      borderStrong: "#BFA684",

      inputBg: "#FFFFFF",
      inputText: "#3F2D18",
      inputBorder: "#9B7B50",

      tableHead: "#F7EAD4",
      focus: "#AA5013",
      overlay: "rgba(0,0,0,.55)",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     - Dashboard controla el fondo global.
     - Este componente permanece transparente.
     - Sólo tarjetas, tabla, modal y controles tienen superficie.
     - Toda la identidad visual consume themeTokens.
     - Estados de pago mantienen colores semánticos.
  ======================================================= */

  const ui = useMemo(() => {
    const page =
      "weli-pagos-root min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card =
      "weli-pagos-card rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const title = "weli-pagos-title";
    const subtitle = "weli-pagos-muted";

    const control =
      "weli-pagos-control w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2";

    const label = "weli-pagos-label block mb-1.5 text-[13px] sm:text-[14px] font-extrabold";

    const buttonPrimary =
      "weli-pagos-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    const buttonSecondary =
      "weli-pagos-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    return {
      page,
      content,
      card,
      title,
      subtitle,
      control,
      label,
      buttonPrimary,
      buttonSecondary,

      pageStyle: {
        color: tokens.text,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      },

      controlStyle: {
        backgroundColor: tokens.inputBg,
        borderColor: tokens.inputBorder,
        color: tokens.inputText,
        "--tw-ring-color": `${tokens.focus}33`,
      },

      primaryStyle: {
        backgroundColor: tokens.primary,
        borderColor: tokens.primary,
        color: tokens.primaryContrast,
      },

      secondaryStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.borderStrong,
        color: tokens.text,
      },

      modalStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.borderStrong,
        color: tokens.text,
      },

      overlayStyle: {
        backgroundColor: tokens.overlay,
      },
    };
  }, [tokens]);

  /* =======================================================
     PAGOS NORMALIZADOS
  ======================================================= */

  const pagosNormalizados = useMemo(() => {
    return (Array.isArray(pagos) ? pagos : []).map((pago) => {
      const jugadorId = Number(pago?.jugador_id ?? 0);

      const jugador = jugadoresMapById.get(jugadorId) ?? null;

      const situacionId = Number(pago?.situacion_pago_id ?? 0);

      const situacionNombre = pago?.situacion_pago_nombre ?? situacionesMap.get(situacionId)?.nombre ?? "—";

      return {
        ...pago,

        id: Number(pago?.id ?? 0),

        jugador_id: jugadorId,

        jugador_rut: pago?.jugador_rut ?? jugador?.rut_jugador ?? "",

        jugador_nombre: pago?.jugador_nombre ?? jugador?.nombre_jugador ?? "—",

        categoria_nombre: pago?.categoria_nombre ?? jugador?.categoria_nombre ?? "Sin categoría",

        situacion_pago_id: situacionId,

        situacion_pago_nombre: String(situacionNombre),

        monto_base: safeNumber(pago?.monto_base, 0),

        monto_descuento: safeNumber(pago?.monto_descuento, 0),

        monto_total: safeNumber(pago?.monto_total, 0),

        fecha_pago: pago?.fecha_pago ?? null,

        detalles: Array.isArray(pago?.detalles) ? pago.detalles : [],
      };
    });
  }, [pagos, jugadoresMapById, situacionesMap]);

  /* =======================================================
     ESTADO MENSUAL
  ======================================================= */

  const obligacionesMes = useMemo(() => {
    const selectedMonth = mesSeleccionado;
    const nowMonth = currentMonthKey();

    const assignments = (Array.isArray(jugadorPlanes) ? jugadorPlanes : [])
      .map((item) => ({
        ...item,
        id: Number(item?.id ?? 0),
        jugador_id: Number(item?.jugador_id ?? 0),
        tipo_pago_id: Number(item?.tipo_pago_id ?? 0),
        plan_id: Number(item?.plan_id ?? 0),
        tarifa_id: Number(item?.tarifa_id ?? 0) || null,
        monto_tarifa: safeNumber(item?.monto_tarifa, 0),
        monto_asignado: safeNumber(item?.monto_asignado, 0),
        tipo_pago_nombre:
          item?.tipo_pago_nombre ??
          tiposPagoMap.get(Number(item?.tipo_pago_id))?.nombre ??
          `Tipo ${item?.tipo_pago_id ?? ""}`,
        plan_nombre: item?.plan_nombre ?? "Sin beneficio",
      }))
      .filter((item) => item.jugador_id > 0 && item.tipo_pago_id > 0);

    const assignmentMap = new Map(assignments.map((item) => [`${item.jugador_id}-${item.tipo_pago_id}`, item]));

    const rows = [];

    for (const jugador of jugadoresActivos) {
      for (const tipoPago of tiposPagoNormalizados) {
        const keyAssignment = `${jugador.id}-${tipoPago.id}`;
        const assignment = assignmentMap.get(keyAssignment) ?? null;

        /*
         * Si el jugador posee snapshot propio, manda ese histórico.
         * Si es un jugador antiguo sin asignación financiera individual,
         * mostramos igualmente el compromiso usando la tarifa vigente
         * configurada por la academia.
         */
        const montoTarifa = assignment ? safeNumber(assignment.monto_tarifa, 0) : safeNumber(tipoPago.monto, 0);

        const montoAsignado = assignment ? safeNumber(assignment.monto_asignado, 0) : safeNumber(tipoPago.monto, 0);

        const pagosDelConcepto = pagosNormalizados.filter((pago) => {
          if (pago.jugador_id !== jugador.id) {
            return false;
          }

          if (monthKeyFromDate(pago.fecha_pago) !== selectedMonth) {
            return false;
          }

          return pago.detalles.some((detalle) => Number(detalle?.tipo_pago_id) === Number(tipoPago.id));
        });

        const pagoPagado =
          pagosDelConcepto.find(
            (pago) =>
              Number(pago.situacion_pago_id) === SITUACION_PAGO_PAGADO_ID ||
              String(pago.situacion_pago_nombre).trim().toUpperCase() === "PAGADO"
          ) ?? null;

        const pagoVencido =
          pagosDelConcepto.find((pago) => String(pago.situacion_pago_nombre).trim().toUpperCase() === "VENCIDO") ??
          null;

        let estado = "PENDIENTE";

        if (pagoPagado) {
          estado = "PAGADO";
        } else if (pagoVencido || compareMonthKeys(selectedMonth, nowMonth) < 0) {
          estado = "VENCIDO";
        }

        const pagoReferencia = pagoPagado ?? pagoVencido ?? pagosDelConcepto[0] ?? null;

        rows.push({
          key: `${selectedMonth}-${jugador.id}-${tipoPago.id}`,

          assignment_id: assignment?.id ?? null,
          tiene_asignacion: Boolean(assignment),

          jugador_id: jugador.id,
          jugador_rut: String(jugador.rut_jugador ?? ""),
          jugador_nombre: jugador.nombre_jugador,
          categoria_nombre: jugador.categoria_nombre,
          sucursal_id: jugador.sucursal_id ?? null,

          tipo_pago_id: Number(tipoPago.id),
          tipo_pago_nombre: tipoPago.nombre,

          plan_id: assignment?.plan_id ?? null,
          plan_nombre: assignment?.plan_nombre ?? "Sin beneficio",

          tarifa_id: assignment?.tarifa_id ?? tipoPago.tarifa_id ?? null,
          monto_tarifa: montoTarifa,
          monto_asignado: montoAsignado,
          descuento_inicial: Math.max(0, montoTarifa - montoAsignado),

          estado,
          pago: pagoReferencia,
          pagos_mes: pagosDelConcepto,
        });
      }
    }

    return rows;
  }, [jugadorPlanes, jugadoresActivos, tiposPagoNormalizados, tiposPagoMap, pagosNormalizados, mesSeleccionado]);

  const opcionesBeneficio = useMemo(() => {
    const values = new Map();

    for (const row of obligacionesMes) {
      const nombre = String(row?.plan_nombre ?? "Sin beneficio").trim() || "Sin beneficio";
      const key = nombre.toUpperCase();

      if (!values.has(key)) {
        values.set(key, nombre);
      }
    }

    return Array.from(values.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [obligacionesMes]);

  const opcionesCategoria = useMemo(() => {
    const values = new Map();

    for (const jugador of jugadoresActivos) {
      const nombre = String(jugador?.categoria_nombre ?? "Sin categoría").trim() || "Sin categoría";
      const key = nombre.toUpperCase();

      if (!values.has(key)) {
        values.set(key, nombre);
      }
    }

    return Array.from(values.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [jugadoresActivos]);

  const opcionesConcepto = useMemo(
    () =>
      tiposPagoNormalizados
        .map((item) => ({
          value: String(item.id),
          label: item.nombre,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tiposPagoNormalizados]
  );

  const obligacionesFiltradas = useMemo(() => {
    const filtro = String(filtroTexto ?? "")
      .trim()
      .toLowerCase();

    return obligacionesMes.filter((row) => {
      const matchText =
        !filtro ||
        String(row.jugador_rut).includes(filtro) ||
        formatRutWithDV(row.jugador_rut).toLowerCase().includes(filtro) ||
        String(row.jugador_nombre).toLowerCase().includes(filtro) ||
        String(row.categoria_nombre).toLowerCase().includes(filtro) ||
        String(row.tipo_pago_nombre).toLowerCase().includes(filtro) ||
        String(row.plan_nombre).toLowerCase().includes(filtro);

      const matchEstado = !filtroEstado || row.estado === filtroEstado;

      const matchBeneficio =
        !filtroBeneficio ||
        String(row.plan_nombre ?? "Sin beneficio")
          .trim()
          .toUpperCase() === filtroBeneficio;

      const matchCategoria =
        !filtroCategoria ||
        String(row.categoria_nombre ?? "Sin categoría")
          .trim()
          .toUpperCase() === filtroCategoria;

      const matchConcepto = !filtroConcepto || String(row.tipo_pago_id) === filtroConcepto;

      return matchText && matchEstado && matchBeneficio && matchCategoria && matchConcepto;
    });
  }, [obligacionesMes, filtroTexto, filtroEstado, filtroBeneficio, filtroCategoria, filtroConcepto]);

  const totals = useMemo(() => {
    const pagados = obligacionesMes.filter((item) => item.estado === "PAGADO");

    const vencidos = obligacionesMes.filter((item) => item.estado === "VENCIDO");

    const pendientes = obligacionesMes.filter((item) => item.estado === "PENDIENTE");

    return {
      total: obligacionesMes.length,

      pagados: pagados.length,

      vencidos: vencidos.length,

      pendientes: pendientes.length,

      montoPagado: pagados.reduce((acc, item) => acc + safeNumber(item?.pago?.monto_total, item.monto_asignado), 0),

      montoVencido: vencidos.reduce((acc, item) => acc + item.monto_asignado, 0),

      montoPendiente: pendientes.reduce((acc, item) => acc + item.monto_asignado, 0),
    };
  }, [obligacionesMes]);

  const totalPages = Math.max(1, Math.ceil(obligacionesFiltradas.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filtroTexto, filtroEstado, filtroBeneficio, filtroCategoria, filtroConcepto, mesSeleccionado]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return obligacionesFiltradas.slice(start, start + PAGE_SIZE);
  }, [obligacionesFiltradas, page]);

  const openManualForRow = async (row) => {
    setModalError("");

    setEditForm({
      id: null,
      create: true,

      jugador_id: String(row.jugador_id),

      jugador_rut: String(row.jugador_rut),

      tipo_pago_id: String(row.tipo_pago_id),

      plan_catalogo_id: "",

      sucursal_id: row.sucursal_id ? String(row.sucursal_id) : "",

      fecha_pago: todayISO(),

      medio_pago_id: "",

      situacion_pago_id: String(SITUACION_PAGO_PAGADO_ID),

      observaciones: "",
    });

    setConfigJugador([
      {
        jugador_id: row.jugador_id,

        tipo_pago_id: row.tipo_pago_id,

        tipo_pago_nombre: row.tipo_pago_nombre,

        plan_id: row.plan_id,

        plan_nombre: row.plan_nombre,

        tarifa_id: row.tarifa_id,

        monto_tarifa: row.monto_tarifa,

        monto_asignado: row.monto_asignado,

        descuento_inicial: row.descuento_inicial,
        tiene_asignacion: Boolean(row.tiene_asignacion),
      },
    ]);

    setModalOpen(true);
  };

  const openEditPago = (pago) => {
    if (!pago?.id) return;

    const detail = Array.isArray(pago.detalles) ? pago.detalles[0] : null;

    setModalError("");

    setConfigJugador(
      detail
        ? [
            {
              tipo_pago_id: Number(detail.tipo_pago_id),

              tipo_pago_nombre: detail.tipo_pago_nombre,

              monto_asignado: safeNumber(detail.monto_base, 0),

              monto_tarifa: safeNumber(detail.monto_base, 0),

              descuento_inicial: 0,
            },
          ]
        : []
    );

    setEditForm({
      id: Number(pago.id),

      create: false,

      jugador_id: String(pago.jugador_id),

      jugador_rut: String(pago.jugador_rut ?? ""),

      tipo_pago_id: detail?.tipo_pago_id ? String(detail.tipo_pago_id) : "",

      plan_catalogo_id: pago.plan_catalogo_id ? String(pago.plan_catalogo_id) : "",

      sucursal_id: pago.sucursal_id ? String(pago.sucursal_id) : "",

      fecha_pago: pago.fecha_pago ? String(pago.fecha_pago).slice(0, 10) : todayISO(),

      medio_pago_id: pago.medio_pago_id ? String(pago.medio_pago_id) : "",

      situacion_pago_id: pago.situacion_pago_id ? String(pago.situacion_pago_id) : String(SITUACION_PAGO_PAGADO_ID),

      observaciones: pago.observaciones ?? "",
    });

    setModalOpen(true);
  };

  /* =======================================================
     CONFIGURACIÓN SELECCIONADA
  ======================================================= */

  const selectedConfig = useMemo(() => {
    const tipoPagoId = Number(editForm.tipo_pago_id);

    if (!Number.isInteger(tipoPagoId) || tipoPagoId <= 0) {
      return null;
    }

    return configJugador.find((item) => Number(item?.tipo_pago_id) === tipoPagoId) ?? null;
  }, [editForm.tipo_pago_id, configJugador]);

  const selectedExtraPlan = useMemo(() => {
    const id = Number(editForm.plan_catalogo_id);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    return planesMap.get(id) ?? null;
  }, [editForm.plan_catalogo_id, planesMap]);

  const preview = useMemo(() => {
    const base = selectedConfig ? safeNumber(selectedConfig.monto_asignado, 0) : 0;

    return calculateExtraBenefit(base, selectedExtraPlan);
  }, [selectedConfig, selectedExtraPlan]);

  /* =======================================================
     GUARDAR
  ======================================================= */

  const showSuccess = async (message) => {
    setSuccessMsg(message);
    setSuccessOpen(true);

    await new Promise((resolve) => setTimeout(resolve, 900));

    setSuccessOpen(false);
  };

  const refresh = useCallback(async () => {
    setReloadBusy(true);

    try {
      await loadAll();
    } finally {
      setReloadBusy(false);
    }
  }, [loadAll]);

  const submitEdit = async (event) => {
    event.preventDefault();

    setModalError("");

    const jugadorId = Number(editForm.jugador_id);

    const tipoPagoId = Number(editForm.tipo_pago_id);

    const medioPagoId = Number(editForm.medio_pago_id);

    const situacionPagoId = Number(editForm.situacion_pago_id);

    if (!Number.isInteger(jugadorId) || jugadorId <= 0) {
      setModalError("Jugador inválido.");

      return;
    }

    if (!Number.isInteger(tipoPagoId) || tipoPagoId <= 0) {
      setModalError("Selecciona un concepto de pago.");

      return;
    }

    if (!editForm.fecha_pago) {
      setModalError("La fecha de pago es obligatoria.");

      return;
    }

    if (!Number.isInteger(medioPagoId) || medioPagoId <= 0) {
      setModalError("Selecciona un medio de pago.");

      return;
    }

    if (!Number.isInteger(situacionPagoId) || situacionPagoId <= 0) {
      setModalError("Selecciona una situación de pago.");

      return;
    }

    if (editForm.create && !selectedConfig) {
      setModalError("El jugador no posee una configuración financiera vigente para este concepto.");

      return;
    }

    const headers = buildHeaders(rolActual);

    setModalBusy(true);

    try {
      const planCatalogoId = editForm.plan_catalogo_id ? Number(editForm.plan_catalogo_id) : null;

      const common = {
        plan_catalogo_id: Number.isInteger(planCatalogoId) && planCatalogoId > 0 ? planCatalogoId : null,

        situacion_pago_id: situacionPagoId,

        fecha_pago: editForm.fecha_pago,

        medio_pago_id: medioPagoId,

        observaciones: editForm.observaciones ?? "",
      };

      if (editForm.create) {
        const payload = {
          jugador_id: jugadorId,

          sucursal_id: editForm.sucursal_id ? Number(editForm.sucursal_id) : null,

          ...common,

          detalles: [
            {
              tipo_pago_id: tipoPagoId,

              origen: selectedConfig?.tiene_asignacion ? "REGULAR" : "ADICIONAL",

              observaciones: null,
            },
          ],
        };

        await postApi("/pagos-jugador", payload, headers);

        setModalOpen(false);

        await showSuccess("Pago registrado correctamente");

        await refresh();

        return;
      }

      const pagoId = Number(editForm.id);

      if (!Number.isInteger(pagoId) || pagoId <= 0) {
        setModalError("ID de pago inválido.");

        return;
      }

      await putApi(`/pagos-jugador/${pagoId}`, common, headers);

      setModalOpen(false);

      await showSuccess("Pago actualizado correctamente");

      await refresh();
    } catch (err) {
      const status = err?.status ?? err?.response?.status;

      if (status === 401 || status === 403) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      setModalError(
        err?.response?.data?.message ?? err?.response?.data?.detail ?? err?.message ?? "No se pudo guardar el pago."
      );
    } finally {
      setModalBusy(false);
    }
  };

  const removePago = async (pago) => {
    if (!pago?.id) return;

    const confirmed = window.confirm(`¿Eliminar el pago #${pago.id}? Esta acción es irreversible.`);

    if (!confirmed) return;

    try {
      await deleteApi(`/pagos-jugador/${pago.id}`, buildHeaders(rolActual));

      await refresh();
    } catch (err) {
      alert(err?.response?.data?.message ?? err?.message ?? "No se pudo eliminar el pago.");
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return <IsLoading />;
  }

  /* =======================================================
     HELPERS VISUALES
  ======================================================= */

  const estadoClass = (estado) => {
    if (estado === "PAGADO") {
      return darkMode
        ? "border-emerald-300/20 bg-emerald-500/15 text-emerald-100"
        : "border-emerald-300 bg-emerald-100 text-emerald-800";
    }

    if (estado === "VENCIDO") {
      return darkMode ? "border-red-300/20 bg-red-500/15 text-red-100" : "border-red-300 bg-red-100 text-red-800";
    }

    return darkMode
      ? "border-amber-300/20 bg-amber-500/15 text-amber-100"
      : "border-amber-300 bg-amber-100 text-amber-800";
  };

  const estadoIcon = (estado) => {
    if (estado === "PAGADO") {
      return <CheckCircle2 className="h-4 w-4" />;
    }

    if (estado === "VENCIDO") {
      return <AlertTriangle className="h-4 w-4" />;
    }

    return <Clock3 className="h-4 w-4" />;
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page} style={ui.pageStyle}>
      <style>
        {`
          .weli-pagos-title {
            color: ${tokens.text} !important;
          }

          .weli-pagos-muted {
            color: ${tokens.textMuted} !important;
          }

          .weli-pagos-card {
            background-color: ${tokens.surface} !important;
            border-color: ${tokens.border} !important;
            color: ${tokens.text} !important;
          }

          .weli-pagos-control {
            background-color: ${tokens.inputBg} !important;
            border-color: ${tokens.inputBorder} !important;
            color: ${tokens.inputText} !important;
          }

          .weli-pagos-control::placeholder {
            color: ${tokens.textMuted} !important;
            opacity: .72;
          }

          .weli-pagos-control:focus {
            border-color: ${tokens.focus} !important;
          }

          .weli-pagos-control option {
            background-color: ${tokens.inputBg};
            color: ${tokens.inputText};
          }

          .weli-pagos-label {
            color: ${tokens.text} !important;
          }

          .weli-pagos-primary {
            background-color: ${tokens.primary} !important;
            border-color: ${tokens.primary} !important;
            color: ${tokens.primaryContrast} !important;
          }

          .weli-pagos-secondary {
            background-color: ${tokens.surfaceSoft} !important;
            border-color: ${tokens.borderStrong} !important;
            color: ${tokens.text} !important;
          }

          .weli-pagos-secondary:hover:not(:disabled) {
            background-color: ${tokens.surfaceHover} !important;
          }

          .weli-pagos-primary:focus-visible,
          .weli-pagos-secondary:focus-visible,
          .weli-pagos-control:focus-visible {
            outline: 2px solid ${tokens.focus};
            outline-offset: 2px;
          }

          .weli-pagos-table-row:hover {
            background-color: ${tokens.surfaceHover} !important;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* HEADER */}

        <header className="text-center">
          <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight ${ui.title}`}>
            Recaudación de Pagos
          </h1>

          <p
            className={`mx-auto mt-2 max-w-4xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed ${ui.subtitle}`}
          >
            Control mensual de obligaciones, pagos realizados y montos vencidos. Los valores regulares provienen de la
            tarifa y beneficio fijados al momento de la inscripción del jugador.
          </p>
        </header>

        {!!error && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold ${
              darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {error}
          </div>
        )}

        {/* RESUMEN */}

        <section className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            darkMode={darkMode}
            tokens={tokens}
            label="Pagados"
            value={totals.pagados}
            amount={totals.montoPagado}
            type="paid"
          />

          <SummaryCard
            darkMode={darkMode}
            tokens={tokens}
            label="Vencidos"
            value={totals.vencidos}
            amount={totals.montoVencido}
            type="expired"
          />

          <SummaryCard
            darkMode={darkMode}
            tokens={tokens}
            label="Pendientes"
            value={totals.pendientes}
            amount={totals.montoPendiente}
            type="pending"
          />

          <div className={`${ui.card} p-4 sm:p-5 flex flex-col justify-center`}>
            <span className="text-[13px] sm:text-sm font-bold" style={{ color: tokens.textMuted }}>
              Compromisos del mes
            </span>

            <strong className="mt-1 text-2xl sm:text-3xl" style={{ color: tokens.text }}>
              {totals.total}
            </strong>
          </div>
        </section>

        {/* FILTROS */}

        <section className={`${ui.card} mt-4 p-4 sm:p-5`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2">
              <label className={ui.label}>Buscar jugador</label>

              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                  style={{ color: tokens.textMuted }}
                />

                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(event) => setFiltroTexto(event.target.value)}
                  placeholder="Nombre, RUT, categoría, concepto o beneficio"
                  className={`${ui.control} !pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={ui.label}>Mes</label>

              <input
                type="month"
                value={mesSeleccionado}
                onChange={(event) => setMesSeleccionado(event.target.value)}
                className={ui.control}
              />
            </div>

            <div>
              <label className={ui.label}>Estado</label>

              <select
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                className={ui.control}
              >
                <option value="">Todos</option>
                <option value="PAGADO">Pagado</option>
                <option value="VENCIDO">Vencido</option>
                <option value="PENDIENTE">Pendiente</option>
              </select>
            </div>

            <div>
              <label className={ui.label}>Beneficio</label>

              <select
                value={filtroBeneficio}
                onChange={(event) => setFiltroBeneficio(event.target.value)}
                className={ui.control}
              >
                <option value="">Todos</option>
                {opcionesBeneficio.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ui.label}>Categoría</label>

              <select
                value={filtroCategoria}
                onChange={(event) => setFiltroCategoria(event.target.value)}
                className={ui.control}
              >
                <option value="">Todas</option>
                {opcionesCategoria.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ui.label}>Concepto</label>

              <select
                value={filtroConcepto}
                onChange={(event) => setFiltroConcepto(event.target.value)}
                className={ui.control}
              >
                <option value="">Todos</option>
                {opcionesConcepto.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-7 flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
              {(filtroTexto || filtroEstado || filtroBeneficio || filtroCategoria || filtroConcepto) && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTexto("");
                    setFiltroEstado("");
                    setFiltroBeneficio("");
                    setFiltroCategoria("");
                    setFiltroConcepto("");
                  }}
                  className={`${ui.buttonSecondary} w-full sm:w-auto`}
                >
                  Limpiar filtros
                </button>
              )}

              <button
                type="button"
                onClick={refresh}
                disabled={reloadBusy}
                className={`${ui.buttonSecondary} w-full sm:w-auto`}
              >
                <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </div>
        </section>

        {/* TABLA DESKTOP */}

        <section className={`${ui.card} mt-4 overflow-hidden`}>
          <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold" style={{ color: tokens.text }}>
                Estado de cuenta mensual
              </h2>

              <p className="mt-1 text-[13px] sm:text-sm" style={{ color: tokens.textMuted }}>
                {obligacionesFiltradas.length} registros encontrados.
              </p>
            </div>
          </div>

          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-[14px] 2xl:text-[15px]">
              <thead style={{ backgroundColor: tokens.tableHead, color: tokens.text }}>
                <tr>
                  <th className="px-4 py-2.5 text-center font-extrabold">Jugador</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Concepto</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Tarifa</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Beneficio</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Monto asignado</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Estado</th>

                  <th className="px-4 py-2.5 text-center font-extrabold">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.key}
                    className="weli-pagos-table-row border-t transition-colors"
                    style={{ borderColor: tokens.border }}
                  >
                    <td className="px-4 py-2.5 text-center">
                      <div className="font-extrabold" style={{ color: tokens.text }}>
                        {row.jugador_nombre}
                      </div>

                      <div className="mt-0.5 text-[12px]" style={{ color: tokens.textMuted }}>
                        {formatRutWithDV(row.jugador_rut)}
                        {" · "}
                        {row.categoria_nombre}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <div className="font-bold" style={{ color: tokens.text }}>
                        {row.tipo_pago_nombre}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-center" style={{ color: tokens.textMuted }}>
                      {toCLP(row.monto_tarifa)}
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <div style={{ color: tokens.textMuted }}>{row.plan_nombre}</div>

                      {row.descuento_inicial > 0 && (
                        <div className={`mt-0.5 text-[12px] ${darkMode ? "text-emerald-200" : "text-emerald-700"}`}>
                          Ahorro inicial {toCLP(row.descuento_inicial)}
                        </div>
                      )}
                    </td>

                    <td
                      className="px-4 py-2.5 text-center text-base font-extrabold"
                      style={{ color: tokens.primary }}
                    >
                      {toCLP(row.monto_asignado)}
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold ${estadoClass(
                          row.estado
                        )}`}
                      >
                        {estadoIcon(row.estado)}

                        {row.estado}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        {row.estado !== "PAGADO" ? (
                          <button
                            type="button"
                            onClick={() => openManualForRow(row)}
                            className={ui.buttonPrimary}
                            style={ui.primaryStyle}
                          >
                            <CreditCard className="h-4 w-4" />
                            Pagar
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditPago(row.pago)}
                              className={ui.buttonSecondary}
                              title="Editar pago"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => removePago(row.pago)}
                              className={`${ui.buttonSecondary} ${darkMode ? "!text-red-200" : "!text-red-700"}`}
                              title="Eliminar pago"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {!pageRows.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-[14px]" style={{ color: tokens.textMuted }}
                    >
                      No hay registros para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CARDS MOBILE/TABLET */}

          <div className="xl:hidden p-3 sm:p-4 space-y-3">
            {pageRows.map((row) => (
              <article
                key={row.key}
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: tokens.surfaceSoft,
                  borderColor: tokens.border,
                  color: tokens.text,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
className="text-base sm:text-lg font-extrabold break-words" style={{ color: tokens.text }}
                    >
                      {row.jugador_nombre}
                    </h3>

                    <p className="mt-0.5 text-[13px] sm:text-sm" style={{ color: tokens.textMuted }}>
                      {formatRutWithDV(row.jugador_rut)}
                      {" · "}
                      {row.categoria_nombre}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] sm:text-[12px] font-extrabold ${estadoClass(
                      row.estado
                    )}`}
                  >
                    {estadoIcon(row.estado)}

                    {row.estado}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoBox darkMode={darkMode} tokens={tokens} label="Concepto" value={row.tipo_pago_nombre} />

                  <InfoBox darkMode={darkMode} tokens={tokens} label="Tarifa" value={toCLP(row.monto_tarifa)} />

                  <InfoBox darkMode={darkMode} tokens={tokens} label="Beneficio" value={row.plan_nombre} />

                  <InfoBox darkMode={darkMode} tokens={tokens} label="Monto asignado" value={toCLP(row.monto_asignado)} emphasize />
                </div>

                {row.descuento_inicial > 0 && (
                  <div
                    className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold ${
                      darkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    Descuento inicial acumulado: {toCLP(row.descuento_inicial)}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {row.estado !== "PAGADO" ? (
                    <button
                      type="button"
                      onClick={() => openManualForRow(row)}
                      className={`${ui.buttonPrimary} w-full`}
                      style={ui.primaryStyle}
                    >
                      <CreditCard className="h-4 w-4" />
                      Registrar pago
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditPago(row.pago)}
                        className={`${ui.buttonSecondary} flex-1`}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => removePago(row.pago)}
                        className={`${ui.buttonSecondary} !text-red-600`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}

            {!pageRows.length && (
              <div className="py-10 text-center text-[14px]" style={{ color: tokens.textMuted }}>
                No hay registros para los filtros seleccionados.
              </div>
            )}
          </div>

          {/* PAGINACIÓN */}

          <div
            className="border-t px-4 sm:px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{ borderColor: tokens.border }}
          >
            <span className="text-[13px] sm:text-sm" style={{ color: tokens.textMuted }}>
              Página {page} de {totalPages}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className={ui.buttonSecondary}
              >
                Anterior
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className={ui.buttonSecondary}
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL */}

      {modalOpen && (
        <div className="fixed inset-0 z-50 p-2 sm:p-5 flex items-end sm:items-center justify-center" style={ui.overlayStyle}>
          <div
            className="w-full max-w-3xl max-h-[94vh] overflow-hidden rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col"
            style={ui.modalStyle}
          >
            <div
              className="shrink-0 px-4 sm:px-6 py-4 border-b flex items-start justify-between gap-3"
              style={{ borderColor: tokens.border }}
            >
              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold">
                  {editForm.create ? "Registrar pago" : "Editar pago"}
                </h3>

                <p className="mt-1 text-[13px] sm:text-sm" style={{ color: tokens.textMuted }}>
                  {editForm.jugador_rut ? formatRutWithDV(editForm.jugador_rut) : ""}
                </p>
              </div>

              <button type="button" onClick={() => !modalBusy && setModalOpen(false)} className={ui.buttonSecondary}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
              {!!modalError && (
                <div
                  className={`mb-4 rounded-xl border px-4 py-3 text-[13px] sm:text-sm font-semibold ${
                    darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {modalError}
                </div>
              )}

              <form id="pago-manual-form" onSubmit={submitEdit} className="space-y-5">
                {/* CONCEPTO */}

                <div>
                  <label className={ui.label}>Concepto de pago</label>

                  <select
                    value={editForm.tipo_pago_id}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,
                        tipo_pago_id: event.target.value,
                        plan_catalogo_id: "",
                      }))
                    }
                    className={ui.control}
                    disabled={modalBusy || !editForm.create}
                  >
                    <option value="">Seleccionar concepto…</option>

                    {configJugador.map((item) => (
                      <option key={item.tipo_pago_id} value={item.tipo_pago_id}>
                        {item.tipo_pago_nombre} · {toCLP(item.monto_asignado)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* RESUMEN FINANCIERO */}

                {selectedConfig && (
                  <div
                    className="rounded-2xl border p-4 sm:p-5"
                    style={{
                      backgroundColor: tokens.surfaceSoft,
                      borderColor: tokens.border,
                      color: tokens.text,
                    }}
                  >
                    <h4 className="text-base sm:text-lg font-extrabold" style={{ color: tokens.text }}>
                      Condición financiera del jugador
                    </h4>

                    {!selectedConfig.tiene_asignacion && (
                      <p
                        className={`mt-1 text-[12px] sm:text-[13px] ${darkMode ? "text-amber-200/80" : "text-amber-800"}`}
                      >
                        Jugador anterior a la asignación financiera individual: se utilizará la tarifa vigente
                        configurada por la academia.
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <InfoBox darkMode={darkMode} tokens={tokens} label="Tarifa original" value={toCLP(selectedConfig.monto_tarifa)} />

                      <InfoBox
                        darkMode={darkMode}
                        tokens={tokens}
                        label="Beneficio inicial"
                        value={selectedConfig.plan_nombre ?? "Sin beneficio"}
                      />

                      <InfoBox
                        darkMode={darkMode}
                        tokens={tokens}
                        label="Descuento inicial"
                        value={toCLP(
                          selectedConfig.descuento_inicial ??
                            Math.max(
                              0,
                              safeNumber(selectedConfig.monto_tarifa, 0) - safeNumber(selectedConfig.monto_asignado, 0)
                            )
                        )}
                      />

                      <InfoBox
                        darkMode={darkMode}
                        tokens={tokens}
                        label="Monto habitual"
                        value={toCLP(selectedConfig.monto_asignado)}
                        emphasize
                      />
                    </div>
                  </div>
                )}

                {/* BENEFICIO EXTRA */}

                <div>
                  <label className={ui.label}>Beneficio adicional de esta transacción</label>

                  <select
                    value={editForm.plan_catalogo_id}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,
                        plan_catalogo_id: event.target.value,
                      }))
                    }
                    className={ui.control}
                    disabled={modalBusy || !editForm.tipo_pago_id}
                  >
                    <option value="">Sin beneficio adicional</option>

                    {planes
                      .filter((plan) => Number(plan?.estado_id ?? 1) === 1)
                      .map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.nombre}
                        </option>
                      ))}
                  </select>

                  <p
                    className="mt-1.5 text-[12px] sm:text-[13px]" style={{ color: tokens.textMuted }}
                  >
                    Este beneficio se aplica sobre el monto habitual del jugador y no modifica su configuración
                    original.
                  </p>
                </div>

                {/* PREVIEW */}

                {selectedConfig && (
                  <div className="rounded-2xl border px-4 sm:px-5 py-4" style={{ backgroundColor: tokens.surface2, borderColor: tokens.border }}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <InfoBox darkMode={darkMode} tokens={tokens} label="Base del pago" value={toCLP(selectedConfig.monto_asignado)} />

                      <InfoBox darkMode={darkMode} tokens={tokens} label="Descuento extra" value={toCLP(preview.descuento)} />

                      <InfoBox darkMode={darkMode} tokens={tokens} label="Total estimado" value={toCLP(preview.total)} emphasize />
                    </div>
                  </div>
                )}

                {/* DATOS TRANSACCIÓN */}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={ui.label}>Fecha de pago</label>

                    <input
                      type="date"
                      value={editForm.fecha_pago}
                      onChange={(event) =>
                        setEditForm((form) => ({
                          ...form,
                          fecha_pago: event.target.value,
                        }))
                      }
                      className={ui.control}
                      disabled={modalBusy}
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Medio de pago</label>

                    <select
                      value={editForm.medio_pago_id}
                      onChange={(event) =>
                        setEditForm((form) => ({
                          ...form,
                          medio_pago_id: event.target.value,
                        }))
                      }
                      className={ui.control}
                      disabled={modalBusy}
                      required
                    >
                      <option value="">Seleccionar…</option>

                      {medios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Situación</label>

                    <select
                      value={editForm.situacion_pago_id}
                      onChange={(event) =>
                        setEditForm((form) => ({
                          ...form,
                          situacion_pago_id: event.target.value,
                        }))
                      }
                      className={ui.control}
                      disabled={modalBusy}
                      required
                    >
                      <option value="">Seleccionar…</option>

                      {situaciones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={ui.label}>Observaciones</label>

                    <textarea
                      value={editForm.observaciones}
                      onChange={(event) =>
                        setEditForm((form) => ({
                          ...form,
                          observaciones: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="Opcional"
                      className={`${ui.control} !h-auto min-h-[92px] py-3 resize-y`}
                      disabled={modalBusy}
                    />
                  </div>
                </div>
              </form>
            </div>

            <div
              className="shrink-0 border-t px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"
              style={{ borderColor: tokens.border }}
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={modalBusy}
                className={`${ui.buttonSecondary} w-full sm:w-auto`}
              >
                Cancelar
              </button>

              <button
                type="submit"
                form="pago-manual-form"
                disabled={modalBusy || !editForm.tipo_pago_id || !editForm.medio_pago_id}
                className={`${ui.buttonPrimary} w-full sm:w-auto`}
                style={ui.primaryStyle}
              >
                <CreditCard className="h-4 w-4" />

                {modalBusy ? "Guardando…" : editForm.create ? `Registrar ${toCLP(preview.total)}` : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÉXITO */}

      {successOpen && (
        <div className="fixed inset-0 z-[60] px-4 flex items-center justify-center" style={ui.overlayStyle}>
          <div
            className="w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl"
            style={ui.modalStyle}
          >
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />

            <h4 className="mt-3 text-lg font-extrabold">{successMsg}</h4>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   COMPONENTES VISUALES PEQUEÑOS
========================================================= */

function SummaryCard({ darkMode, tokens, label, value, amount, type }) {
  const style =
    type === "paid"
      ? darkMode
        ? "border-emerald-300/15 bg-emerald-500/10"
        : "border-emerald-200 bg-emerald-50"
      : type === "expired"
        ? darkMode
          ? "border-red-300/15 bg-red-500/10"
          : "border-red-200 bg-red-50"
        : darkMode
          ? "border-amber-300/15 bg-amber-500/10"
          : "border-amber-200 bg-amber-50";

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${style}`}>
      <span className="text-[13px] sm:text-sm font-bold" style={{ color: tokens.textMuted }}>
        {label}
      </span>

      <div className="mt-1 flex items-end justify-between gap-2">
        <strong className="text-2xl sm:text-3xl" style={{ color: tokens.text }}>
          {value}
        </strong>

        <span
          className="text-[12px] sm:text-[13px] font-extrabold text-right"
          style={{ color: tokens.textMuted }}
        >
          {toCLP(amount)}
        </span>
      </div>
    </div>
  );
}

function InfoBox({ tokens, label, value, emphasize = false }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
      }}
    >
      <div
        className="text-[11px] sm:text-[12px] uppercase tracking-wide font-bold"
        style={{ color: tokens.textMuted }}
      >
        {label}
      </div>

      <div
        className={`mt-1 break-words ${
          emphasize ? "text-base sm:text-lg font-extrabold" : "text-[13px] sm:text-[14px] font-semibold"
        }`}
        style={{
          color: emphasize ? tokens.primary : tokens.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}
