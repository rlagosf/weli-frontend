// src/pages/admin/powerbiFinanzas.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

import {
  BarElement,
  CategoryScale,
  Chart,
  ArcElement,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

import { Bar, Doughnut, Line } from "react-chartjs-2";

import { useTheme } from "../../context/ThemeContext";

import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";

import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, LineElement, PointElement, Tooltip, Legend);

/* =========================================================
   PALETA FUNCIONAL PARA GRÁFICOS

   Estos colores se mantienen porque sirven para diferenciar
   series/categorías visualmente.

   La apariencia general de la interfaz se controla mediante
   themeTokens.
========================================================= */

const CORPORATE_CHART_COLORS = [
  "#6d5829",
  "#aa5013",
  "#b79f69",
  "#e2773b",
  "#9a7c4c",
  "#77634a",
  "#c18f5a",
  "#8b6e3f",
  "#b86d3e",
  "#5e5138",
];

const ESTADO_PAGADO_ID = 1;

/* =========================================================
   HELPERS
========================================================= */

const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const direct = Number(raw);

    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);

    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const buildHeaders = (rol, academiaId) => {
  const token = getToken();

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  if (rol === 3 && academiaId) {
    headers["x-academia-id"] = String(academiaId);
  }

  return headers;
};

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const toCLP = (value) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(safeNumber(value, 0));

const toNumber = (value) =>
  new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(safeNumber(value, 0));

const normalizeListResponse = (res) => {
  if (!res || res.status === 204) {
    return [];
  }

  const data = res?.data ?? res;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.pagos)) {
    return data.pagos;
  }

  if (data?.ok && Array.isArray(data?.data?.pagos)) {
    return data.data.pagos;
  }

  return [];
};

const buildIdNameMap = (arr, idKey = "id", nameKey = "nombre") => {
  const map = new Map();

  for (const item of Array.isArray(arr) ? arr : []) {
    const id = item?.[idKey];

    if (id == null) {
      continue;
    }

    map.set(String(id), String(item?.[nameKey] ?? item?.descripcion ?? id).trim());
  }

  return map;
};

const monthKey = (value) => {
  if (!value) {
    return "";
  }

  const text = String(value);

  const match = text.match(/^(\d{4})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) {
    return key || "—";
  }

  const [year, month] = key.split("-").map(Number);

  return new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
};

const sortEntriesDesc = (map) => Array.from(map.entries()).sort((a, b) => safeNumber(b[1]) - safeNumber(a[1]));

const aggregateSum = (rows, keyFn, valueFn) => {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(keyFn(row) ?? "Sin información").trim() || "Sin información";

    const value = safeNumber(valueFn(row), 0);

    map.set(key, safeNumber(map.get(key), 0) + value);
  }

  return map;
};

/* =========================================================
   COMPONENTE
========================================================= */

export default function PowerbiFinanzas() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();

  const location = useLocation();

  useMobileAutoScrollTop();

  const [rol, setRol] = useState(null);

  const [academiaId, setAcademiaId] = useState(() => getAcademiaIdFromStorage());

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState("");

  const [pagos, setPagos] = useState([]);

  /* =======================================================
     BASE DASHBOARD
  ======================================================= */

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  const breadcrumbBootRef = useRef(false);

  useEffect(() => {
    if (breadcrumbBootRef.current) {
      return;
    }

    const currentPath = location.pathname + location.search;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    const label = "Power BI financiero";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            {
              to: currentPath,

              label,
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
     SYNC ACADEMIA
  ======================================================= */

  useEffect(() => {
    let alive = true;

    const sync = () => {
      if (!alive) {
        return;
      }

      const id = getAcademiaIdFromStorage();

      setAcademiaId((previous) => (previous !== id ? id : previous));
    };

    sync();

    const interval = setInterval(sync, 1200);

    const onStorage = () => sync();

    const onAcademiaChanged = () => sync();

    window.addEventListener("storage", onStorage);

    window.addEventListener("weli:selectedAcademiaChanged", onAcademiaChanged);

    return () => {
      alive = false;

      clearInterval(interval);

      window.removeEventListener("storage", onStorage);

      window.removeEventListener("weli:selectedAcademiaChanged", onAcademiaChanged);
    };
  }, []);

  useEffect(() => {
    if (rol === 3) {
      setPagos([]);
    }
  }, [academiaId, rol]);

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

      if (!decoded?.exp || decoded.exp <= now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

      const currentRol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (![1, 3].includes(currentRol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        setIsLoading(false);

        return;
      }

      if (currentRol === 3) {
        const targetAcademia = getAcademiaIdFromStorage();

        if (!targetAcademia) {
          throw new Error("missing-academia-target");
        }
      }

      setRol(currentRol);

      setIsLoading(false);
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });

      setIsLoading(false);
    }
  }, [navigate, dashboardBase]);

  const canLoad = useMemo(() => {
    if (![1, 3].includes(rol)) {
      return false;
    }

    if (rol === 3) {
      return Boolean(academiaId);
    }

    return true;
  }, [rol, academiaId]);

  const handleAuth = useCallback(() => {
    clearToken();

    navigate("/login", {
      replace: true,
    });
  }, [navigate]);

  /* =======================================================
     API OPS
  ======================================================= */

  const getErrStatus = (errorValue) => errorValue?.status ?? errorValue?.response?.status ?? 0;

  const apiOps = useMemo(() => {
    const withVariants =
      (fn) =>
      async (base, ...args) => {
        const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];

        let lastError = null;

        for (const url of urls) {
          try {
            return await fn(url, ...args);
          } catch (err) {
            lastError = err;

            const status = getErrStatus(err);

            if (status === 401 || status === 403) {
              throw err;
            }
          }
        }

        throw lastError || new Error("ENDPOINT_VARIANTS_FAILED");
      };

    return {
      getVar: withVariants((url, config) => api.get(url, config)),
    };
  }, []);

  /* =======================================================
     CARGA
  ======================================================= */

  useEffect(() => {
    if (!canLoad) {
      return;
    }

    const abort = new AbortController();

    const headers = buildHeaders(rol, academiaId);

    (async () => {
      setIsLoading(true);

      setError("");

      try {
        const config = {
          signal: abort.signal,

          headers,
        };

        const [tiposRes, mediosRes, situacionesRes, jugadoresRes, categoriasRes, pagosRes] = await Promise.all([
          apiOps.getVar("/tipo-pago", config).catch(() => null),

          apiOps.getVar("/medio-pago", config).catch(() => null),

          apiOps.getVar("/situacion-pago", config).catch(() => apiOps.getVar("/estado-pago", config).catch(() => null)),

          apiOps.getVar("/jugadores", config).catch(() => null),

          apiOps.getVar("/categorias", config).catch(() => null),

          apiOps.getVar("/pagos-jugador/estado-cuenta", config),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        const tipos = normalizeListResponse(tiposRes);

        const medios = normalizeListResponse(mediosRes);

        const situaciones = normalizeListResponse(situacionesRes);

        const jugadoresList = normalizeListResponse(jugadoresRes);

        const categorias = normalizeListResponse(categoriasRes);

        const rawPagos = normalizeListResponse(pagosRes);

        const tipoPagoMap = buildIdNameMap(tipos, "id", "nombre");

        const medioPagoMap = buildIdNameMap(medios, "id", "nombre");

        const situacionPagoMap = buildIdNameMap(situaciones, "id", "nombre");

        const categoriaMap = buildIdNameMap(categorias, "id", "nombre");

        const jugadoresMap = new Map();

        for (const jugador of jugadoresList) {
          const id = Number(jugador?.id ?? jugador?.jugador_id ?? 0);

          if (!Number.isInteger(id) || id <= 0) {
            continue;
          }

          const categoriaId = Number(jugador?.categoria_id ?? jugador?.categoria?.id ?? 0);

          const categoriaNombre =
            jugador?.categoria?.nombre ??
            jugador?.categoria_nombre ??
            (categoriaId > 0 ? categoriaMap.get(String(categoriaId)) : null) ??
            "Sin categoría";

          jugadoresMap.set(id, {
            id,

            rut: jugador?.rut_jugador ?? jugador?.rut ?? null,

            nombre: jugador?.nombre_jugador ?? jugador?.nombre ?? jugador?.nombre_completo ?? "—",

            categoria_id: categoriaId > 0 ? categoriaId : null,

            categoria_nombre: categoriaNombre,
          });
        }

        let scopedPagos = rawPagos;

        if (rol === 3 && academiaId != null) {
          const hasAcademiaField = rawPagos.some(
            (item) => item?.academia_id != null || item?.academiaId != null || item?.academia != null
          );

          if (hasAcademiaField) {
            scopedPagos = rawPagos.filter((item) => {
              const value = Number(item?.academia_id ?? item?.academiaId ?? item?.academia ?? 0);

              return value === Number(academiaId);
            });
          }
        }

        const normalizedPagos = scopedPagos.map((pago) => {
          const jugadorId = Number(pago?.jugador_id ?? 0);

          const jugador = jugadoresMap.get(jugadorId);

          const situacionId = Number(pago?.situacion_pago_id ?? pago?.estado_pago_id ?? pago?.estado_id ?? 0);

          const medioId = Number(pago?.medio_pago_id ?? pago?.medio_id ?? 0);

          const situacionNombre =
            pago?.situacion_pago_nombre ??
            pago?.situacion_pago?.nombre ??
            pago?.estado_pago_nombre ??
            pago?.estado_nombre ??
            situacionPagoMap.get(String(situacionId)) ??
            "—";

          const medioNombre =
            pago?.medio_pago_nombre ?? pago?.medio_pago?.nombre ?? medioPagoMap.get(String(medioId)) ?? "—";

          const detallesRaw = Array.isArray(pago?.detalles) ? pago.detalles : [];

          const detalles = detallesRaw.map((detalle) => {
            const tipoPagoId = Number(detalle?.tipo_pago_id ?? detalle?.tipo_id ?? 0);

            return {
              ...detalle,

              tipo_pago_id: tipoPagoId,

              tipo_pago_nombre:
                detalle?.tipo_pago_nombre ??
                detalle?.tipo_pago?.nombre ??
                tipoPagoMap.get(String(tipoPagoId)) ??
                `Tipo ${tipoPagoId}`,

              monto_base: safeNumber(detalle?.monto_base, 0),

              monto_descuento: safeNumber(detalle?.monto_descuento, 0),

              monto_total: safeNumber(detalle?.monto_total, 0),
            };
          });

          return {
            ...pago,

            id: Number(pago?.id ?? 0),

            jugador_id: jugadorId,

            jugador_rut: pago?.jugador_rut ?? jugador?.rut ?? null,

            jugador_nombre: pago?.jugador_nombre ?? jugador?.nombre ?? "—",

            categoria_nombre: pago?.categoria_nombre ?? jugador?.categoria_nombre ?? "Sin categoría",

            situacion_pago_id: situacionId,

            situacion_pago_nombre: String(situacionNombre),

            medio_pago_id: medioId,

            medio_pago_nombre: String(medioNombre),

            plan_catalogo_id: pago?.plan_catalogo_id != null ? Number(pago.plan_catalogo_id) : null,

            plan_nombre: pago?.plan_nombre ?? null,

            monto_base: safeNumber(pago?.monto_base, 0),

            monto_descuento: safeNumber(pago?.monto_descuento, 0),

            monto_total: safeNumber(pago?.monto_total, 0),

            fecha_pago: pago?.fecha_pago ?? pago?.fecha ?? null,

            detalles,
          };
        });

        setPagos(normalizedPagos);
      } catch (err) {
        if (abort.signal.aborted) {
          return;
        }

        const status = getErrStatus(err);

        if (status === 401 || status === 403) {
          handleAuth();

          return;
        }

        setError("❌ No se pudieron cargar los datos financieros para los gráficos.");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rol, academiaId, canLoad, apiOps, handleAuth]);

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la fuente visual principal.

     Dashboard continúa siendo dueño del fondo global.
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

      primary: "#AA5013",

      primaryHover: "#994812",

      primaryContrast: "#FFFFFF",

      secondary: "#6D5829",

      secondaryHover: "#5E4B23",

      secondaryContrast: "#FFFFFF",

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

      overlay: "rgba(0,0,0,.55)",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     - Dashboard controla el fondo global.
     - Esta vista permanece transparente.
     - Las tarjetas utilizan surface.
     - Los bloques interiores utilizan surfaceSoft.
     - Los textos y gráficos consumen themeTokens.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const headerSub = "weli-powerbi-subtext";

    const msgBox = darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700";

    const card = "weli-powerbi-card";

    const titleMain = "weli-powerbi-title";

    const sectionTitleStyle = {
      color: tokens.text,
    };

    const chartText = tokens.textMuted;

    const chartGrid = tokens.border;

    const rootStyle = {
      color: tokens.text,

      "--weli-pbi-surface": tokens.surface,

      "--weli-pbi-surface-soft": tokens.surfaceSoft,

      "--weli-pbi-surface-2": tokens.surface2,

      "--weli-pbi-surface-hover": tokens.surfaceHover,

      "--weli-pbi-text": tokens.text,

      "--weli-pbi-muted": tokens.textMuted,

      "--weli-pbi-border": tokens.border,

      "--weli-pbi-border-strong": tokens.borderStrong,

      "--weli-pbi-primary": tokens.primary,

      "--weli-pbi-primary-contrast": tokens.primaryContrast,

      "--weli-pbi-focus": tokens.focus,
    };

    return {
      page,
      content,
      headerSub,
      msgBox,
      card,
      titleMain,
      sectionTitleStyle,
      chartText,
      chartGrid,
      rootStyle,
    };
  }, [darkMode, tokens]);

  /* =======================================================
     DATOS FINANCIEROS
  ======================================================= */

  const pagosPagados = useMemo(
    () =>
      pagos.filter((pago) => {
        const byId = Number(pago?.situacion_pago_id) === ESTADO_PAGADO_ID;

        const byName =
          String(pago?.situacion_pago_nombre ?? "")
            .trim()
            .toUpperCase() === "PAGADO";

        return byId || byName;
      }),
    [pagos]
  );

  const detallesPagados = useMemo(() => {
    const rows = [];

    for (const pago of pagosPagados) {
      if (Array.isArray(pago?.detalles) && pago.detalles.length > 0) {
        for (const detalle of pago.detalles) {
          rows.push({
            ...detalle,

            pago_id: pago.id,

            fecha_pago: pago.fecha_pago,

            jugador_id: pago.jugador_id,

            jugador_nombre: pago.jugador_nombre,

            categoria_nombre: pago.categoria_nombre,

            medio_pago_id: pago.medio_pago_id,

            medio_pago_nombre: pago.medio_pago_nombre,

            plan_catalogo_id: pago.plan_catalogo_id,

            plan_nombre: pago.plan_nombre,
          });
        }

        continue;
      }

      /*
       * Fallback de compatibilidad.
       *
       * El modelo nuevo debiera traer detalles,
       * pero evitamos perder una transacción histórica.
       */

      rows.push({
        pago_id: pago.id,

        fecha_pago: pago.fecha_pago,

        jugador_id: pago.jugador_id,

        jugador_nombre: pago.jugador_nombre,

        categoria_nombre: pago.categoria_nombre,

        medio_pago_id: pago.medio_pago_id,

        medio_pago_nombre: pago.medio_pago_nombre,

        plan_catalogo_id: pago.plan_catalogo_id,

        plan_nombre: pago.plan_nombre,

        tipo_pago_id: null,

        tipo_pago_nombre: "Sin detalle",

        monto_base: pago.monto_base,

        monto_descuento: pago.monto_descuento,

        monto_total: pago.monto_total,
      });
    }

    return rows;
  }, [pagosPagados]);

  const metricas = useMemo(() => {
    const ingresos = pagosPagados.reduce((acc, pago) => acc + safeNumber(pago?.monto_total, 0), 0);

    const baseTransacciones = pagosPagados.reduce((acc, pago) => acc + safeNumber(pago?.monto_base, 0), 0);

    const descuentosExtra = pagosPagados.reduce((acc, pago) => acc + safeNumber(pago?.monto_descuento, 0), 0);

    const cantidadPagos = pagosPagados.length;

    const montoPromedio = cantidadPagos > 0 ? ingresos / cantidadPagos : 0;

    const pagosConDescuento = pagosPagados.filter((pago) => safeNumber(pago?.monto_descuento, 0) > 0).length;

    const tasaDescuento = baseTransacciones > 0 ? (descuentosExtra / baseTransacciones) * 100 : 0;

    /*
     * Por ahora WELI no posee una fuente persistente de gastos.
     * No se inventan egresos: se mantiene en cero hasta incorporar
     * un módulo o fuente confiable de gastos.
     */

    const gastosRegistrados = 0;

    return {
      ingresos,
      baseTransacciones,
      descuentosExtra,
      cantidadPagos,
      montoPromedio,
      pagosConDescuento,
      tasaDescuento,
      gastosRegistrados,

      resultadoTemporal: ingresos - gastosRegistrados,
    };
  }, [pagosPagados]);

  /* =======================================================
     AGREGACIONES
  ======================================================= */

  const ingresosPorConcepto = useMemo(() => {
    const map = aggregateSum(
      detallesPagados,

      (item) => item?.tipo_pago_nombre ?? "Sin detalle",

      (item) => item?.monto_total
    );

    return sortEntriesDesc(map);
  }, [detallesPagados]);

  const ingresosPorMedio = useMemo(() => {
    const map = aggregateSum(
      pagosPagados,

      (item) => item?.medio_pago_nombre ?? "Sin información",

      (item) => item?.monto_total
    );

    return sortEntriesDesc(map);
  }, [pagosPagados]);

  const ingresosPorCategoria = useMemo(() => {
    const map = aggregateSum(
      pagosPagados,

      (item) => item?.categoria_nombre ?? "Sin categoría",

      (item) => item?.monto_total
    );

    return sortEntriesDesc(map);
  }, [pagosPagados]);

  const descuentosPorConcepto = useMemo(() => {
    const map = aggregateSum(
      detallesPagados,

      (item) => item?.tipo_pago_nombre ?? "Sin detalle",

      (item) => item?.monto_descuento
    );

    return sortEntriesDesc(map).filter(([, value]) => safeNumber(value, 0) > 0);
  }, [detallesPagados]);

  const transaccionesPorConcepto = useMemo(() => {
    const map = new Map();

    for (const item of detallesPagados) {
      const key = String(item?.tipo_pago_nombre ?? "Sin detalle").trim() || "Sin detalle";

      map.set(key, safeNumber(map.get(key), 0) + 1);
    }

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [detallesPagados]);

  const promedioPorConcepto = useMemo(() => {
    const totalMap = new Map();

    const countMap = new Map();

    for (const item of detallesPagados) {
      const key = String(item?.tipo_pago_nombre ?? "Sin detalle").trim() || "Sin detalle";

      totalMap.set(key, safeNumber(totalMap.get(key), 0) + safeNumber(item?.monto_total, 0));

      countMap.set(key, safeNumber(countMap.get(key), 0) + 1);
    }

    return Array.from(totalMap.entries())
      .map(([nombre, total]) => {
        const cantidad = safeNumber(countMap.get(nombre), 0);

        return {
          nombre,
          cantidad,

          promedio: cantidad > 0 ? total / cantidad : 0,
        };
      })
      .sort((a, b) => b.promedio - a.promedio);
  }, [detallesPagados]);

  const descuentosExtraPorBeneficio = useMemo(() => {
    const map = new Map();

    for (const pago of pagosPagados) {
      const descuento = safeNumber(pago?.monto_descuento, 0);

      if (descuento <= 0) {
        continue;
      }

      const key = String(pago?.plan_nombre ?? "Beneficio adicional").trim() || "Beneficio adicional";

      const current = map.get(key) ?? {
        cantidad: 0,
        monto: 0,
      };

      current.cantidad += 1;

      current.monto += descuento;

      map.set(key, current);
    }

    return Array.from(map.entries())
      .map(([nombre, value]) => ({
        nombre,

        cantidad: value.cantidad,

        monto: value.monto,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [pagosPagados]);

  const ingresosPorMes = useMemo(() => {
    const map = new Map();

    for (const pago of pagosPagados) {
      const key = monthKey(pago?.fecha_pago);

      if (!key) {
        continue;
      }

      map.set(key, safeNumber(map.get(key), 0) + safeNumber(pago?.monto_total, 0));
    }

    const keys = Array.from(map.keys()).sort().slice(-6);

    return {
      labels: keys.map(monthLabel),

      data: keys.map((key) => safeNumber(map.get(key), 0)),
    };
  }, [pagosPagados]);

  /* =======================================================
     CHART DATA
  ======================================================= */

  const conceptChart = useMemo(
    () => ({
      labels: ingresosPorConcepto.map(([label]) => label),

      datasets: [
        {
          label: "Ingresos recibidos",

          data: ingresosPorConcepto.map(([, value]) => value),

          backgroundColor: ingresosPorConcepto.map(
            (_, index) => CORPORATE_CHART_COLORS[index % CORPORATE_CHART_COLORS.length]
          ),

          borderRadius: 8,

          borderSkipped: false,
        },
      ],
    }),
    [ingresosPorConcepto]
  );

  const paymentMethodChart = useMemo(
    () => ({
      labels: ingresosPorMedio.map(([label]) => label),

      datasets: [
        {
          label: "Ingresos",

          data: ingresosPorMedio.map(([, value]) => value),

          backgroundColor: ingresosPorMedio.map(
            (_, index) => CORPORATE_CHART_COLORS[index % CORPORATE_CHART_COLORS.length]
          ),

          borderColor: tokens.surface,

          borderWidth: 3,

          hoverOffset: 6,
        },
      ],
    }),
    [ingresosPorMedio, tokens.surface]
  );

  const categoryChart = useMemo(
    () => ({
      labels: ingresosPorCategoria.map(([label]) => label),

      datasets: [
        {
          label: "Ingresos recibidos",

          data: ingresosPorCategoria.map(([, value]) => value),

          backgroundColor: ingresosPorCategoria.map(
            (_, index) => CORPORATE_CHART_COLORS[index % CORPORATE_CHART_COLORS.length]
          ),

          borderRadius: 8,

          borderSkipped: false,
        },
      ],
    }),
    [ingresosPorCategoria]
  );

  const trendChart = useMemo(
    () => ({
      labels: ingresosPorMes.labels,

      datasets: [
        {
          label: "Ingresos mensuales",

          data: ingresosPorMes.data,

          borderColor: tokens.primary,

          backgroundColor: tokens.primary,

          pointBackgroundColor: tokens.secondary,

          pointBorderColor: tokens.text,

          pointBorderWidth: 2,

          pointRadius: 4,

          pointHoverRadius: 6,

          tension: 0.28,

          borderWidth: 3,
        },
      ],
    }),
    [ingresosPorMes, tokens.primary, tokens.secondary, tokens.text]
  );

  const discountByConceptChart = useMemo(
    () => ({
      labels: descuentosPorConcepto.map(([label]) => label),

      datasets: [
        {
          label: "Descuento aplicado",

          data: descuentosPorConcepto.map(([, value]) => value),

          backgroundColor: descuentosPorConcepto.map(
            (_, index) => CORPORATE_CHART_COLORS[index % CORPORATE_CHART_COLORS.length]
          ),

          borderRadius: 8,

          borderSkipped: false,
        },
      ],
    }),
    [descuentosPorConcepto]
  );

  const transactionCountChart = useMemo(
    () => ({
      labels: transaccionesPorConcepto.map(([label]) => label),

      datasets: [
        {
          label: "Cantidad de transacciones",

          data: transaccionesPorConcepto.map(([, value]) => value),

          backgroundColor: transaccionesPorConcepto.map(
            (_, index) => CORPORATE_CHART_COLORS[index % CORPORATE_CHART_COLORS.length]
          ),

          borderRadius: 8,

          borderSkipped: false,
        },
      ],
    }),
    [transaccionesPorConcepto]
  );

  /* =======================================================
     CHART OPTIONS
  ======================================================= */

  const moneyTooltipLabel = (context) => `${context.dataset.label ?? "Total"}: ${toCLP(context.raw)}`;

  const basePlugins = useMemo(
    () => ({
      legend: {
        position: "bottom",

        labels: {
          color: ui.chartText,

          usePointStyle: true,

          pointStyle: "circle",

          padding: 18,

          boxWidth: 8,

          font: {
            size: 12,

            weight: "600",
          },
        },
      },

      tooltip: {
        backgroundColor: tokens.surface,

        titleColor: ui.chartText,

        bodyColor: ui.chartText,

        borderColor: tokens.borderStrong,

        borderWidth: 1,

        padding: 12,

        callbacks: {
          label: moneyTooltipLabel,
        },
      },
    }),
    [ui.chartText, tokens.surface, tokens.borderStrong]
  );

  const verticalBarOptions = useMemo(
    () => ({
      responsive: true,

      maintainAspectRatio: false,

      plugins: basePlugins,

      scales: {
        x: {
          ticks: {
            color: ui.chartText,

            font: {
              size: 11,

              weight: "600",
            },
          },

          grid: {
            display: false,
          },

          border: {
            display: false,
          },
        },

        y: {
          beginAtZero: true,

          ticks: {
            color: ui.chartText,

            callback: (value) => toCLP(value),

            font: {
              size: 11,
            },
          },

          grid: {
            color: ui.chartGrid,
          },

          border: {
            display: false,
          },
        },
      },
    }),
    [basePlugins, ui.chartText, ui.chartGrid]
  );

  const horizontalBarOptions = useMemo(
    () => ({
      indexAxis: "y",

      responsive: true,

      maintainAspectRatio: false,

      plugins: basePlugins,

      scales: {
        x: {
          beginAtZero: true,

          ticks: {
            color: ui.chartText,

            callback: (value) => toCLP(value),

            font: {
              size: 11,
            },
          },

          grid: {
            color: ui.chartGrid,
          },

          border: {
            display: false,
          },
        },

        y: {
          ticks: {
            color: ui.chartText,

            font: {
              size: 11,

              weight: "600",
            },
          },

          grid: {
            display: false,
          },

          border: {
            display: false,
          },
        },
      },
    }),
    [basePlugins, ui.chartText, ui.chartGrid]
  );

  const countBarOptions = useMemo(
    () => ({
      indexAxis: "y",

      responsive: true,

      maintainAspectRatio: false,

      plugins: {
        ...basePlugins,

        tooltip: {
          ...basePlugins.tooltip,

          callbacks: {
            label: (context) => `${context.dataset.label ?? "Cantidad"}: ${toNumber(context.raw)}`,
          },
        },
      },

      scales: {
        x: {
          beginAtZero: true,

          ticks: {
            color: ui.chartText,

            precision: 0,

            font: {
              size: 11,
            },
          },

          grid: {
            color: ui.chartGrid,
          },

          border: {
            display: false,
          },
        },

        y: {
          ticks: {
            color: ui.chartText,

            font: {
              size: 11,

              weight: "600",
            },
          },

          grid: {
            display: false,
          },

          border: {
            display: false,
          },
        },
      },
    }),
    [basePlugins, ui.chartText, ui.chartGrid]
  );

  const lineOptions = useMemo(
    () => ({
      responsive: true,

      maintainAspectRatio: false,

      plugins: basePlugins,

      scales: {
        x: {
          ticks: {
            color: ui.chartText,

            font: {
              size: 11,

              weight: "600",
            },
          },

          grid: {
            display: false,
          },

          border: {
            display: false,
          },
        },

        y: {
          beginAtZero: true,

          ticks: {
            color: ui.chartText,

            callback: (value) => toCLP(value),

            font: {
              size: 11,
            },
          },

          grid: {
            color: ui.chartGrid,
          },

          border: {
            display: false,
          },
        },
      },
    }),
    [basePlugins, ui.chartText, ui.chartGrid]
  );

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,

      maintainAspectRatio: false,

      cutout: "66%",

      plugins: {
        ...basePlugins,

        tooltip: {
          ...basePlugins.tooltip,

          callbacks: {
            label: (context) => {
              const value = safeNumber(context.raw, 0);

              const total = ingresosPorMedio.reduce((acc, [, amount]) => acc + safeNumber(amount, 0), 0);

              const porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";

              return `${context.label}: ${toCLP(value)} (${porcentaje}%)`;
            },
          },
        },
      },
    }),
    [basePlugins, ingresosPorMedio]
  );

  /* =======================================================
     RENDER
  ======================================================= */

  if (!canLoad || isLoading) {
    return <IsLoading />;
  }

  if (error) {
    return (
      <div className={`${ui.page} font-sans`} style={ui.rootStyle}>
        <div className={ui.content}>
          <div className={`mt-4 rounded-2xl border px-5 py-4 font-semibold ${ui.msgBox}`}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.page} font-sans`} style={ui.rootStyle}>
      <style>
        {`
          .weli-powerbi-card {
            background-color: var(--weli-pbi-surface) !important;
            border-color: var(--weli-pbi-border) !important;
            color: var(--weli-pbi-text) !important;
          }

          .weli-powerbi-subtext {
            color: var(--weli-pbi-muted) !important;
          }

          .weli-powerbi-title {
            color: var(--weli-pbi-text) !important;
          }

          .weli-powerbi-inner {
            background-color: var(--weli-pbi-surface-soft) !important;
            border-color: var(--weli-pbi-border) !important;
            color: var(--weli-pbi-text) !important;
          }

          .weli-powerbi-muted {
            color: var(--weli-pbi-muted) !important;
          }

          .weli-powerbi-value {
            color: var(--weli-pbi-text) !important;
          }

          .weli-powerbi-accent {
            color: var(--weli-pbi-primary) !important;
          }

          .weli-powerbi-empty {
            border-color: var(--weli-pbi-border) !important;
            color: var(--weli-pbi-muted) !important;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <div className="text-center">
            <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${ui.titleMain}`}>
              Power BI Financiero — Panel Ejecutivo
            </h1>

            <p className={`text-sm sm:text-base mt-2 ${ui.headerSub}`}>
              Análisis consolidado de ingresos, medios de pago, categorías, descuentos y comportamiento transaccional
            </p>
          </div>
        </header>

        <main>
          {/* =================================================
              KPIs EJECUTIVOS
          ================================================= */}

          <section className="mt-8 grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              ui={ui}
              label="Ingresos recibidos"
              value={toCLP(metricas.ingresos)}
              helper={`${toNumber(metricas.cantidadPagos)} pagos confirmados`}
            />

            <MetricCard
              ui={ui}
              label="Monto promedio por pago"
              value={toCLP(metricas.montoPromedio)}
              helper="Promedio de las transacciones confirmadas"
            />

            <MetricCard
              ui={ui}
              label="Pagos con descuento"
              value={toNumber(metricas.pagosConDescuento)}
              helper={`${metricas.tasaDescuento.toFixed(1)}% de descuento efectivo`}
            />

            <MetricCard
              ui={ui}
              label="Descuentos aplicados"
              value={toCLP(metricas.descuentosExtra)}
              helper="Reducción monetaria sobre pagos confirmados"
            />
          </section>

          {/* =================================================
              RESUMEN FINANCIERO
          ================================================= */}

          <section className={`${ui.card} mt-5 rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] p-5 sm:p-6`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold" style={ui.sectionTitleStyle}>
                  Resumen financiero consolidado
                </h2>

                <p className={`mt-1 text-sm ${ui.headerSub}`}>
                  Vista temporal de ingresos y resultado. WELI aún no registra egresos financieros.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0 lg:min-w-[620px]">
                <ExecutiveValue label="Base cobrada" value={toCLP(metricas.baseTransacciones)} />

                <ExecutiveValue label="Descuento extra" value={toCLP(metricas.descuentosExtra)} />

                <ExecutiveValue label="Gastos registrados" value={toCLP(metricas.gastosRegistrados)} />

                <ExecutiveValue label="Resultado temporal" value={toCLP(metricas.resultadoTemporal)} emphasize />
              </div>
            </div>
          </section>

          {pagosPagados.length === 0 && (
            <div className={`${ui.card} mt-5 rounded-2xl border px-5 py-4 font-semibold`}>
              No existen pagos confirmados para consolidar ingresos en los gráficos.
            </div>
          )}

          {/* =================================================
              BLOQUE 1
          ================================================= */}

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-5 gap-5">
            <section
              className={`${ui.card} xl:col-span-3 rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}
            >
              <PanelHeader
                title="Ingresos por concepto"
                subtitle="Distribución de ingresos recibidos por matrícula, mensualidad, torneo y otros conceptos"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[360px]">
                <Bar data={conceptChart} options={verticalBarOptions} />
              </div>
            </section>

            <section
              className={`${ui.card} xl:col-span-2 rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}
            >
              <PanelHeader
                title="Composición por medio de pago"
                subtitle="Participación monetaria de cada canal de recaudación"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[360px]">
                <Doughnut data={paymentMethodChart} options={doughnutOptions} />
              </div>
            </section>
          </div>

          {/* =================================================
              BLOQUE 2
          ================================================= */}

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className={`${ui.card} rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
              <PanelHeader
                title="Ingresos por categoría"
                subtitle="Monto recibido según la categoría deportiva del jugador"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[350px]">
                <Bar data={categoryChart} options={horizontalBarOptions} />
              </div>
            </section>

            <section className={`${ui.card} rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
              <PanelHeader
                title="Tendencia de ingresos"
                subtitle="Evolución de los últimos seis meses con pagos confirmados"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[350px]">
                <Line data={trendChart} options={lineOptions} />
              </div>
            </section>
          </div>

          {/* =================================================
              DESCUENTOS Y VOLUMEN OPERATIVO
          ================================================= */}

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-5 gap-5">
            <section
              className={`${ui.card} xl:col-span-3 rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}
            >
              <PanelHeader
                title="Descuentos aplicados por concepto"
                subtitle="Monto efectivamente descontado en transacciones confirmadas, agrupado por tipo de pago"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[360px]">
                {descuentosPorConcepto.length > 0 ? (
                  <Bar data={discountByConceptChart} options={horizontalBarOptions} />
                ) : (
                  <Bar data={transactionCountChart} options={countBarOptions} />
                )}
              </div>
            </section>

            <section
              className={`${ui.card} xl:col-span-2 rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}
            >
              <PanelHeader
                title="Impacto de descuentos"
                subtitle="Indicadores calculados exclusivamente sobre pagos efectivamente registrados"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 grid grid-cols-2 gap-3">
                <ExecutiveValue label="Base antes de ajuste" value={toCLP(metricas.baseTransacciones)} />

                <ExecutiveValue label="Descuento aplicado" value={toCLP(metricas.descuentosExtra)} />

                <ExecutiveValue label="Tasa efectiva" value={`${metricas.tasaDescuento.toFixed(1)}%`} />

                <ExecutiveValue label="Neto recaudado" value={toCLP(metricas.ingresos)} emphasize />
              </div>

              <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide" style={ui.sectionTitleStyle}>
                Descuentos adicionales por beneficio
              </h3>

              <div className="mt-3 space-y-3">
                {descuentosExtraPorBeneficio.slice(0, 5).map((item) => (
                  <RankingRow
                    key={`extra-${item.nombre}`}
                    label={item.nombre}
                    primary={toCLP(item.monto)}
                    secondary={`${toNumber(item.cantidad)} transacciones`}
                  />
                ))}

                {descuentosExtraPorBeneficio.length === 0 && (
                  <RankingRow
                    label="Sin descuento adicional"
                    primary={toCLP(0)}
                    secondary={`${toNumber(metricas.cantidadPagos)} transacciones registradas`}
                  />
                )}
              </div>
            </section>
          </div>

          <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className={`${ui.card} rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
              <PanelHeader
                title="Volumen de transacciones por concepto"
                subtitle="Cantidad de pagos confirmados asociados a cada concepto de cobro"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 h-[340px]">
                <Bar data={transactionCountChart} options={countBarOptions} />
              </div>
            </section>

            <section className={`${ui.card} rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
              <PanelHeader
                title="Monto promedio por concepto"
                subtitle="Valor medio de las transacciones confirmadas para cada tipo de pago"
                style={ui.sectionTitleStyle}
                subClass={ui.headerSub}
              />

              <div className="mt-5 space-y-3">
                {promedioPorConcepto.slice(0, 7).map((item) => (
                  <RankingRow
                    key={`promedio-${item.nombre}`}
                    label={item.nombre}
                    primary={toCLP(item.promedio)}
                    secondary={`${toNumber(item.cantidad)} transacciones`}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* =================================================
              RANKINGS OPERATIVOS
          ================================================= */}

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <RankingPanel ui={ui} title="Conceptos con mayor recaudación" rows={ingresosPorConcepto.slice(0, 5)} />

            <RankingPanel ui={ui} title="Medios con mayor recaudación" rows={ingresosPorMedio.slice(0, 5)} />

            <RankingPanel ui={ui} title="Categorías con mayor recaudación" rows={ingresosPorCategoria.slice(0, 5)} />
          </div>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   COMPONENTES AUXILIARES
========================================================= */

function MetricCard({ ui, label, value, helper }) {
  return (
    <div className={`${ui.card} rounded-2xl border p-4 sm:p-5 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
      <div className="weli-powerbi-muted text-[12px] sm:text-[13px] uppercase tracking-[0.08em] font-extrabold">
        {label}
      </div>

      <div className="weli-powerbi-value mt-2 text-xl sm:text-2xl lg:text-[28px] font-extrabold break-words">
        {value}
      </div>

      <div className="weli-powerbi-muted mt-2 text-[12px] sm:text-[13px] font-semibold">{helper}</div>
    </div>
  );
}

function ExecutiveValue({ label, value, emphasize = false }) {
  return (
    <div className="weli-powerbi-inner rounded-xl border px-3 py-3">
      <div className="weli-powerbi-muted text-[11px] uppercase tracking-wide font-bold">{label}</div>

      <div
        className={`mt-1 text-sm sm:text-base font-extrabold break-words ${
          emphasize ? "weli-powerbi-accent" : "weli-powerbi-value"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle, style, subClass }) {
  return (
    <div>
      <h2 className="text-lg sm:text-xl font-extrabold" style={style}>
        {title}
      </h2>

      <p className={`mt-1 text-[13px] sm:text-sm ${subClass}`}>{subtitle}</p>
    </div>
  );
}

function RankingRow({ label, primary, secondary }) {
  return (
    <div className="weli-powerbi-inner rounded-xl border px-3.5 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="weli-powerbi-value font-extrabold text-sm truncate" title={label}>
          {label}
        </div>

        <div className="weli-powerbi-muted mt-0.5 text-[12px]">{secondary}</div>
      </div>

      <div className="weli-powerbi-accent shrink-0 font-extrabold text-sm">{primary}</div>
    </div>
  );
}

function RankingPanel({ ui, title, rows }) {
  return (
    <section className={`${ui.card} rounded-2xl border p-5 shadow-[0_14px_42px_rgba(0,0,0,0.12)]`}>
      <h2 className="text-base sm:text-lg font-extrabold" style={ui.sectionTitleStyle}>
        {title}
      </h2>

      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <RankingRow key={label} label={label} primary={toCLP(value)} secondary="Ingreso recibido" />
        ))}

        {rows.length === 0 && <EmptyList text="Sin información disponible." />}
      </div>
    </section>
  );
}

function EmptyList({ text }) {
  return <div className="weli-powerbi-empty rounded-xl border px-4 py-5 text-sm text-center">{text}</div>;
}
