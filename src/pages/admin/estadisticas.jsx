// src/pages/admin/estadisticasGlobales.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import api, { getToken, clearToken } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

Chart.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

/* =======================
   🎨 Colores gráficos (pedido)
======================= */
const EVENT_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#A855F7",
  "#F97316",
  "#EF4444",
  "#F59E0B",
  "#06B6D4",
  "#64748B",
];

/* =======================
   Helpers visual (hex -> rgba)
======================= */
const hexToRgba = (hex, a = 0.75) => {
  const h = String(hex || "").replace("#", "").trim();
  if (![3, 6].includes(h.length)) return `rgba(255,255,255,${a})`;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
};

/* ───────── Valor centrado en la porción ───────── */
const PieValueInsidePlugin = {
  id: "pieValueInside",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const { ctx } = chart;
    const ds = chart.data.datasets?.[0];
    if (!ds) return;

    const meta = chart.getDatasetMeta(0);
    const values = ds.data || [];

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = (pluginOptions && pluginOptions.font) || "12px sans-serif";
    ctx.fillStyle =
      (pluginOptions && pluginOptions.color) ||
      (chart.options?.plugins?.legend?.labels?.color || "#fff");

    meta.data.forEach((arc, i) => {
      const val = Number(values[i] || 0);
      if (!arc || !Number.isFinite(val)) return;
      if ((arc.circumference || 0) < 0.1) return;
      const p = arc.tooltipPosition();
      ctx.fillText(String(val), p.x, p.y);
    });

    ctx.restore();
  },
};

/* ───────── Leyenda HTML: compacta + 2 por línea ───────── */
const HtmlLegendPlugin = {
  id: "htmlLegend",
  afterUpdate(chart, _args, options) {
    const containerID = options?.containerID;
    if (!containerID) return;

    const root = document.getElementById(containerID);
    if (!root) return;

    const textColor = options?.textColor || "rgba(255,255,255,0.86)";
    const borderColor = options?.borderColor || "rgba(255,255,255,0.12)";
    const itemBg = options?.itemBg || "rgba(0,0,0,0.12)";
    const itemBgHover = options?.itemBgHover || "rgba(255,255,255,0.10)";

    root.innerHTML = "";
    root.setAttribute("data-weli-legend", "1");

    root.style.setProperty("display", "block", "important");
    root.style.setProperty("width", "100%", "important");
    root.style.setProperty("max-width", "240px", "important");
    root.style.setProperty("overflow-x", "hidden", "important");
    root.style.setProperty("overflow-y", "auto", "important");
    root.style.setProperty("white-space", "normal", "important");
    root.style.setProperty("float", "none", "important");

    const labels = Array.isArray(chart.data?.labels) ? chart.data.labels : [];
    const ds0 = chart.data?.datasets?.[0];
    if (!ds0 || !labels.length) return;

    const values = Array.isArray(ds0.data) ? ds0.data : [];
    const bg = ds0.backgroundColor;

    const col = document.createElement("div");
    col.setAttribute("data-weli-legend-col", "1");

    col.style.setProperty("display", "grid", "important");
    col.style.setProperty("grid-template-columns", "repeat(2, minmax(0, 1fr))", "important");
    col.style.setProperty("gap", "6px", "important");
    col.style.setProperty("width", "100%", "important");
    col.style.setProperty("align-items", "stretch", "important");

    labels.forEach((label, i) => {
      const item = document.createElement("div");
      item.setAttribute("data-weli-legend-item", "1");

      item.style.setProperty("display", "block", "important");
      item.style.setProperty("width", "100%", "important");
      item.style.setProperty("clear", "both", "important");
      item.style.setProperty("padding", "4px 6px", "important");
      item.style.setProperty("border-radius", "10px", "important");
      item.style.setProperty("border", `1px solid ${borderColor}`, "important");
      item.style.setProperty("cursor", "pointer", "important");
      item.style.setProperty("user-select", "none", "important");
      item.style.setProperty("background", itemBg, "important");

      item.onmouseenter = () => item.style.setProperty("background", itemBgHover, "important");
      item.onmouseleave = () => item.style.setProperty("background", itemBg, "important");

      const row = document.createElement("div");
      row.style.setProperty("display", "flex", "important");
      row.style.setProperty("align-items", "center", "important");
      row.style.setProperty("gap", "6px", "important");
      row.style.setProperty("width", "100%", "important");
      row.style.setProperty("min-width", "0", "important");

      const box = document.createElement("span");
      box.style.setProperty("display", "inline-block", "important");
      box.style.setProperty("width", "10px", "important");
      box.style.setProperty("height", "10px", "important");
      box.style.setProperty("border-radius", "4px", "important");
      box.style.setProperty("flex-shrink", "0", "important");

      const color = Array.isArray(bg) ? bg[i] || EVENT_COLORS[i % EVENT_COLORS.length] : bg || EVENT_COLORS[i % EVENT_COLORS.length];
      box.style.setProperty("background", color, "important");

      const visible = chart.getDataVisibility(i);
      box.style.setProperty("opacity", visible ? "1" : "0.3", "important");

      const val = Number(values?.[i] ?? 0);

      const text = document.createElement("span");
      text.style.setProperty("display", "block", "important");
      text.style.setProperty("width", "100%", "important");
      text.style.setProperty("min-width", "0", "important");
      text.style.setProperty("white-space", "nowrap", "important");
      text.style.setProperty("overflow", "hidden", "important");
      text.style.setProperty("text-overflow", "ellipsis", "important");
      text.style.setProperty("font-size", "11px", "important");
      text.style.setProperty("line-height", "1.1", "important");
      text.style.setProperty("color", textColor, "important");
      text.style.setProperty("opacity", visible ? "1" : "0.55", "important");

      text.textContent = `${String(label)} (${val})`;
      text.title = `${String(label)} (${val})`;

      item.onclick = () => {
        chart.toggleDataVisibility(i);
        chart.update();
      };

      row.appendChild(box);
      row.appendChild(text);
      item.appendChild(row);
      col.appendChild(item);
    });

    root.appendChild(col);
  },
};

Chart.register(PieValueInsidePlugin, HtmlLegendPlugin);

/* ───────────────── Scope helpers ───────────────── */
const STORAGE_KEY = "weli_selected_academia";
const ACADEMIA_STORAGE_KEY = "weli_selected_academia"; // compat

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);

    const id = Number(p?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;

    const deporte_id = Number(p?.deporte_id ?? 0);
    return {
      id,
      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
      nombre: p?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) =>
  String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

/* ───────────────── Deportes: config por deporte ───────────────── */
function SPORT_META_FALLBACK_BASE(nombre) {
  return {
    nombre,
    grupos: {
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  };
}

const SPORT_META = {
  1: {
    nombre: "Fútbol",
    grupos: {
      ofensivas: [
        "goles",
        "asistencias",
        "tiros_libres",
        "penales",
        "tiros_arco",
        "tiros_fuera",
        "tiros_bloqueados",
        "regates_exitosos",
        "centros_acertados",
        "pases_clave",
      ],
      defensivas: [
        "intercepciones",
        "despejes",
        "duelos_ganados",
        "entradas_exitosas",
        "bloqueos",
        "recuperaciones",
      ],
      tecnicas: [
        "pases_completados",
        "pases_errados",
        "posesion_perdida",
        "offsides",
        "faltas_cometidas",
        "faltas_recibidas",
      ],
      fisicas: [
        "distancia_recorrida_km",
        "sprints",
        "duelos_aereos_ganados",
        "minutos_jugados",
        "partidos_jugados",
      ],
      medicas: ["lesiones", "dias_baja"],
      disciplina: ["tarjetas_amarillas", "tarjetas_rojas", "sanciones_federativas"],
    },
    traducciones: {
      goles: "Goles",
      asistencias: "Asistencias",
      tiros_libres: "Tiros Libres",
      penales: "Penales",
      tiros_arco: "Tiros al Arco",
      tiros_fuera: "Tiros Fuera",
      tiros_bloqueados: "Tiros Bloqueados",
      regates_exitosos: "Regates Exitosos",
      centros_acertados: "Centros Acertados",
      pases_clave: "Pases Clave",
      intercepciones: "Intercepciones",
      despejes: "Despejes",
      duelos_ganados: "Duelos Ganados",
      entradas_exitosas: "Entradas Exitosas",
      bloqueos: "Bloqueos",
      recuperaciones: "Recuperaciones",
      pases_completados: "Pases Completados",
      pases_errados: "Pases Errados",
      posesion_perdida: "Pérdidas de Posesión",
      offsides: "Offsides",
      faltas_cometidas: "Faltas Cometidas",
      faltas_recibidas: "Faltas Recibidas",
      distancia_recorrida_km: "Distancia Recorrida (Km)",
      sprints: "Sprints",
      duelos_aereos_ganados: "Duelos Aéreos Ganados",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      tarjetas_amarillas: "Tarjetas Amarillas",
      tarjetas_rojas: "Tarjetas Rojas",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  2: {
    nombre: "Vóleibol",
    grupos: {
      ataque: ["ataque_intentos", "ataque_puntos", "ataque_errores"],
      saque: ["saques_total", "saques_aces", "saques_positivos", "saques_errores"],
      bloqueo: ["bloqueos_punto", "bloqueos_toques"],
      recepcion: ["recepciones_total", "recepcion_positiva", "recepcion_perfecta"],
      defensa: ["defensas_recuperadas"],
      armado: ["armados_total", "armados_precision"],
      eficiencia: ["sideout_pct", "breakpoints_pct", "errores_totales"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      ataque_intentos: "Ataque (Intentos)",
      ataque_puntos: "Ataque (Puntos)",
      ataque_errores: "Ataque (Errores)",
      saques_total: "Saques (Total)",
      saques_aces: "Saques (Aces)",
      saques_positivos: "Saques (Positivos)",
      saques_errores: "Saques (Errores)",
      bloqueos_punto: "Bloqueos (Punto)",
      bloqueos_toques: "Bloqueos (Toques)",
      recepciones_total: "Recepciones (Total)",
      recepcion_positiva: "Recepción (Positiva)",
      recepcion_perfecta: "Recepción (Perfecta)",
      defensas_recuperadas: "Defensas Recuperadas",
      armados_total: "Armados (Total)",
      armados_precision: "Armados (Precisión)",
      sideout_pct: "Sideout (%)",
      breakpoints_pct: "Breakpoints (%)",
      errores_totales: "Errores Totales",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  3: {
    nombre: "Tenis",
    grupos: {
      servicio: [
        "primer_servicio_pct",
        "puntos_primer_servicio",
        "puntos_segundo_servicio",
        "aces",
        "dobles_faltas",
      ],
      quiebre: ["break_points_oportunidades", "break_points_convertidos"],
      juego: ["winners", "errores_no_forzados", "peloteos_cortos_ganados"],
      totales: ["puntos_ganados_total", "juegos_ganados_total"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      primer_servicio_pct: "1er Servicio (%)",
      puntos_primer_servicio: "Puntos 1er Servicio",
      puntos_segundo_servicio: "Puntos 2do Servicio",
      aces: "Aces",
      dobles_faltas: "Dobles Faltas",
      break_points_oportunidades: "BP Oportunidades",
      break_points_convertidos: "BP Convertidos",
      winners: "Winners",
      errores_no_forzados: "Errores No Forzados",
      peloteos_cortos_ganados: "Peloteos Cortos Ganados",
      puntos_ganados_total: "Puntos Ganados (Total)",
      juegos_ganados_total: "Juegos Ganados (Total)",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  4: SPORT_META_FALLBACK_BASE("Pádel"),
  5: SPORT_META_FALLBACK_BASE("Tenis de mesa"),
  6: SPORT_META_FALLBACK_BASE("Básquetbol"),
};

/* ✅ Auth helpers + headers */
const isExpired2 = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};
const extractRol2 = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};
const getAcademiaIdFromStorage2 = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};
const buildHeaders = (rol) => {
  const token = getToken();
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rol === 3) {
    const a = getAcademiaIdFromStorage2();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

const normalizeListResponse = (resOrArr) => {
  if (Array.isArray(resOrArr)) return resOrArr;
  if (!resOrArr || resOrArr.status === 204) return [];
  const d = resOrArr?.data ?? resOrArr;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  if (d?.ok && Array.isArray(d.items)) return d.items;
  if (d?.ok && Array.isArray(d.data)) return d.data;
  return [];
};

const normalizeCatalog = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      id: Number(x?.id ?? x?.categoria_id ?? x?.posicion_id ?? x?.estado_id ?? x?.sucursal_id ?? x?.prevision_medica_id),
      nombre: String(x?.nombre ?? x?.descripcion ?? "").trim(),
    }))
    .filter((x) => Number.isFinite(x.id) && x.nombre);

const tryGetList = async (paths, { signal, headers } = {}) => {
  const list = Array.isArray(paths) ? paths : [paths];
  const variants = [];
  for (const p0 of list) {
    const p = String(p0 || "");
    const base = p.startsWith("/") ? p : `/${p}`;
    variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, headers });
      return normalizeListResponse(r);
    } catch (e) {
      const st = getErrStatus(e);
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

/* =======================
   ✅ Resolver deporte_id
======================= */
const resolveSportId = ({ decoded, snap, locStateScope }) => {
  const fromSnap = Number(snap?.deporte_id ?? 0);
  if (Number.isFinite(fromSnap) && fromSnap > 0) return fromSnap;

  const fromState = Number(locStateScope?.deporte_id ?? locStateScope?.sport_id ?? 0);
  if (Number.isFinite(fromState) && fromState > 0) return fromState;

  const fromToken = Number(decoded?.deporte_id ?? decoded?.sport_id ?? decoded?.id_deporte ?? 0);
  if (Number.isFinite(fromToken) && fromToken > 0) return fromToken;

  return null;
};

export default function EstadisticasGlobales() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [jugadoresActivos, setJugadoresActivos] = useState([]);
  const [jugadoresTodos, setJugadoresTodos] = useState([]);

  const [categorias, setCategorias] = useState([]);
  const [posiciones, setPosiciones] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);

  const [totals, setTotals] = useState(null);
  const [aggMeta, setAggMeta] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rol, setRol] = useState(null);

  const [scope, setScope] = useState({
    academia_id: null,
    deporte_id: null,
    academia_nombre: null,
  });

  useMobileAutoScrollTop();

  const deporteId = scope.deporte_id ? Number(scope.deporte_id) : null;
  const sportMeta = deporteId && SPORT_META[deporteId] ? SPORT_META[deporteId] : SPORT_META[1];

  /* =======================
     UI (clon SuperDashboard)
  ======================= */
  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

    const msgBox =
      "mt-6 rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    const card =
      "rounded-2xl shadow-2xl border p-6 " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const badge =
      "text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border " +
      (darkMode ? "bg-white/10 border-white/10 text-white/80" : "bg-white/60 border-ra-marron/10 text-ra-marron/80");

    const divider = darkMode ? "border-white/10" : "border-ra-marron/10";

    // colores charts legibles por tema
    const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(109,88,41,0.92)";
    const grid = darkMode ? "rgba(255,255,255,0.10)" : "rgba(109,88,41,0.10)";
    const legendText = darkMode ? "rgba(255,255,255,0.85)" : "rgba(109,88,41,0.85)";

    const pieLabel = darkMode ? "rgba(255,255,255,0.88)" : "rgba(109,88,41,0.92)";

    // HtmlLegend theme
    const legendTheme = {
      textColor: darkMode ? "rgba(255,255,255,0.86)" : "rgba(109,88,41,0.90)",
      borderColor: darkMode ? "rgba(255,255,255,0.12)" : "rgba(109,88,41,0.15)",
      itemBg: darkMode ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.65)",
      itemBgHover: darkMode ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.90)",
    };

    return { shell, headerSub, msgBox, warnBox, card, badge, divider, axisText, grid, legendText, pieLabel, legendTheme };
  }, [darkMode]);

  /* ───────── Título ───────── */
  useEffect(() => {
    const prevTitle = document.title;
    const title = `Estadísticas Globales — ${sportMeta.nombre}`;
    document.dispatchEvent(new CustomEvent("updateBreadcrumb", { detail: { title } }));
    document.dispatchEvent(new CustomEvent("weli:setTitle", { detail: { title } }));
    return () => {
      document.title = prevTitle;
    };
  }, [sportMeta.nombre]);

  /* ───────── Auth + Scope ───────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired2(decoded)) throw new Error("expired");

      const parsedRol = extractRol2(decoded);
      if (![1, 2, 3].includes(parsedRol)) {
        navigate("/admin", { replace: true });
        return;
      }
      setRol(parsedRol);

      const isSuperTree = isSuperTreePath(location.pathname);

      if (isSuperTree) {
        const snap = readSelectedAcademia();
        if (!snap?.id) {
          navigate("/super-dashboard", { replace: true });
          return;
        }

        const dep = resolveSportId({ decoded, snap, locStateScope: location.state?.scope });
        setScope({
          academia_id: snap.id,
          deporte_id: dep,
          academia_nombre: snap.nombre ?? null,
        });
      } else {
        const acad = Number(decoded?.academia_id ?? decoded?.academy_id ?? 0) || null;
        const snap = readSelectedAcademia();
        const dep = resolveSportId({ decoded, snap, locStateScope: location.state?.scope });
        setScope({ academia_id: acad, deporte_id: dep, academia_nombre: null });
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname, location.state]);

  /* ───────── Data load ───────── */
  useEffect(() => {
    if (rol == null) return;

    const isSuperTree = isSuperTreePath(location.pathname);
    if (isSuperTree && !scope.academia_id) return;

    const abort = new AbortController();
    const headers = buildHeaders(rol);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const acadId = scope.academia_id;
        const depId = scope.deporte_id;

        const jugadoresTodosPaths =
          rol === 2
            ? [
                "/jugadores/staff?include_inactivos=1",
                "/jugadores/staff/todos",
                "/jugadores/staff/all",
                "/jugadores?include_inactivos=1",
                "/jugadores/todos",
                "/jugadores/all",
                "/jugadores/staff",
                "/jugadores",
              ]
            : ["/jugadores?include_inactivos=1", "/jugadores/todos", "/jugadores/all", "/jugadores"];

        const jugadoresActivosPaths =
          rol === 2
            ? [
                "/jugadores/staff?estado_id=1",
                "/jugadores/staff?estado=1",
                "/jugadores/staff",
                "/jugadores?estado_id=1",
                "/jugadores?estado=1",
                "/jugadores",
              ]
            : ["/jugadores?estado_id=1", "/jugadores?estado=1", "/jugadores"];

        const aggPath =
          depId && acadId
            ? `/estadisticas/aggregate?deporte_id=${Number(depId)}&academia_id=${Number(acadId)}`
            : depId
              ? `/estadisticas/aggregate?deporte_id=${Number(depId)}`
              : null;

        const [rawTodos, rawActivos, cats, poss, ests, sucs, prevs, aggRes] =
          await Promise.all([
            tryGetList(jugadoresTodosPaths, { signal: abort.signal, headers }),
            tryGetList(jugadoresActivosPaths, { signal: abort.signal, headers }),
            tryGetList(["/categorias"], { signal: abort.signal, headers }),
            tryGetList(["/posiciones"], { signal: abort.signal, headers }),
            tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
            tryGetList(["/sucursales-real", "/sucursales"], { signal: abort.signal, headers }),
            tryGetList(["/prevision-medica"], { signal: abort.signal, headers }),
            (async () => {
              if (!aggPath) return null;
              const r = await api.get(aggPath, { signal: abort.signal, headers });
              return r?.data ?? null;
            })(),
          ]);

        if (abort.signal.aborted) return;

        const catsN = normalizeCatalog(cats);
        const possN = normalizeCatalog(poss);
        const estsN = normalizeCatalog(ests);
        const sucsN = normalizeCatalog(sucs);
        const prevsN = normalizeCatalog(prevs);

        setCategorias(catsN);
        setPosiciones(possN);
        setEstados(estsN);
        setSucursales(sucsN);
        setPrevisiones(prevsN);

        const posMapLocal = new Map((possN ?? []).map((p) => [Number(p.id), p.nombre]));
        const catMapLocal = new Map((catsN ?? []).map((c) => [Number(c.id), c.nombre]));
        const estMapLocal = new Map((estsN ?? []).map((e) => [Number(e.id), e.nombre]));
        const sucMapLocal = new Map((sucsN ?? []).map((s) => [Number(s.id), s.nombre]));
        const prevMapLocal = new Map((prevsN ?? []).map((p) => [Number(p.id), p.nombre]));

        const normalizeJugadores = (arr) => {
          const safe = Array.isArray(arr) ? arr : [];
          return safe.map((j) => ({
            ...j,
            posicion:
              j?.posicion ??
              (posMapLocal.has(Number(j?.posicion_id))
                ? { nombre: posMapLocal.get(Number(j.posicion_id)) }
                : null),
            categoria:
              j?.categoria ??
              (catMapLocal.has(Number(j?.categoria_id))
                ? { nombre: catMapLocal.get(Number(j.categoria_id)) }
                : null),
            estado:
              j?.estado ??
              (estMapLocal.has(Number(j?.estado_id))
                ? { nombre: estMapLocal.get(Number(j.estado_id)) }
                : null),
            sucursal:
              j?.sucursal ??
              (sucMapLocal.has(Number(j?.sucursal_id))
                ? { nombre: sucMapLocal.get(Number(j.sucursal_id)) }
                : null),
            prevision_medica:
              j?.prevision_medica ??
              (prevMapLocal.has(Number(j?.prevision_medica_id))
                ? { nombre: prevMapLocal.get(Number(j.prevision_medica_id)) }
                : null),
          }));
        };

        const applyScopeFilter = (arr) => {
          const safe = Array.isArray(arr) ? arr : [];
          const a = scope.academia_id;
          const d = scope.deporte_id;
          if (!a && !d) return safe;

          return safe.filter((j) => {
            const aj = Number(j?.academia_id ?? 0);
            const dj = Number(j?.deporte_id ?? 0);
            if (a && aj !== a) return false;
            if (d && dj !== d) return false;
            return true;
          });
        };

        setJugadoresTodos(normalizeJugadores(applyScopeFilter(rawTodos)));
        setJugadoresActivos(normalizeJugadores(applyScopeFilter(rawActivos)));

        if (aggRes?.ok && aggRes?.totals && typeof aggRes.totals === "object") {
          setTotals(aggRes.totals);
          setAggMeta(aggRes?.meta ?? null);

          const miss = Number(aggRes?.meta?.rows_detail_missing ?? 0);
          if (miss > 0) {
            
          } else {
            setError("");
          }
        } else {
          setTotals(null);
          setAggMeta(null);
          setError("");
        }

        if (!depId) {
          setTotals(null);
          setAggMeta(null);
        }
      } catch (e) {
        if (abort.signal.aborted) return;

        const st = getErrStatus(e);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError(e?.response?.data?.message || e?.message || "Error al cargar datos");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, scope.academia_id, scope.deporte_id, location.pathname, navigate]);

  const grupos = sportMeta.grupos || {};
  const traducciones = sportMeta.traducciones || {};

  const catMap = useMemo(() => new Map((categorias || []).map((c) => [Number(c.id), c.nombre])), [categorias]);
  const posMap = useMemo(() => new Map((posiciones || []).map((p) => [Number(p.id), p.nombre])), [posiciones]);
  const estMap = useMemo(() => new Map((estados || []).map((e) => [Number(e.id), e.nombre])), [estados]);
  const sucMap = useMemo(() => new Map((sucursales || []).map((s) => [Number(s.id), s.nombre])), [sucursales]);
  const prevMap = useMemo(() => new Map((previsiones || []).map((p) => [Number(p.id), p.nombre])), [previsiones]);

  const conteos = useMemo(() => {
    const activos = Array.isArray(jugadoresActivos) ? jugadoresActivos : [];
    const todos = Array.isArray(jugadoresTodos) ? jugadoresTodos : [];

    const sumBy = (arr, extractor) => {
      const m = new Map();
      arr.forEach((j) => {
        const key = extractor(j) || "—";
        m.set(key, (m.get(key) || 0) + 1);
      });
      return Object.fromEntries(m);
    };

    const getCategoriaNombre = (j) =>
      j?.categoria?.nombre ?? (j?.categoria_id != null ? catMap.get(Number(j.categoria_id)) : undefined);
    const getPosicionNombre = (j) =>
      j?.posicion?.nombre ?? (j?.posicion_id != null ? posMap.get(Number(j.posicion_id)) : undefined);
    const getEstadoNombre = (j) =>
      j?.estado?.nombre ?? (j?.estado_id != null ? estMap.get(Number(j.estado_id)) : undefined);
    const getSucursalNombre = (j) =>
      j?.sucursal?.nombre ?? (j?.sucursal_id != null ? sucMap.get(Number(j.sucursal_id)) : undefined);
    const getPrevisionNombre = (j) =>
      j?.prevision_medica?.nombre ??
      (j?.prevision_medica_id != null ? prevMap.get(Number(j.prevision_medica_id)) : undefined);

    const edades = {};
    activos.forEach((j) => {
      const e = Number(j?.edad);
      const key = Number.isFinite(e) && e >= 0 ? String(e) : "—";
      edades[key] = (edades[key] || 0) + 1;
    });

    return {
      edades,
      categorias: sumBy(activos, getCategoriaNombre),
      posiciones: sumBy(activos, getPosicionNombre),
      sucursales: sumBy(activos, getSucursalNombre),
      previsiones: sumBy(activos, getPrevisionNombre),
      estados: sumBy(todos, getEstadoNombre),
    };
  }, [jugadoresActivos, jugadoresTodos, catMap, posMap, estMap, sucMap, prevMap]);

  const sumasPorGrupo = useMemo(() => {
    if (!totals || typeof totals !== "object") return {};

    const sumGroup = (campos) => {
      const r = {};
      for (const campo of campos) {
        const n = Number(totals?.[campo] ?? 0);
        r[campo] = Number.isFinite(n) ? n : 0;
      }
      return r;
    };

    const entries = Object.entries(grupos || {});
    if (!entries.length) return {};
    return Object.fromEntries(entries.map(([nombre, campos]) => [nombre, sumGroup(campos)]));
  }, [totals, grupos]);

  /* =======================
     Charts: colores EVENT_COLORS
  ======================= */
  const pieColors = useMemo(
    () => EVENT_COLORS.map((c) => hexToRgba(c, 0.75)),
    []
  );

  const generatePieData = (conteo) => {
    const labels = Object.keys(conteo || {});
    const data = Object.values(conteo || {});
    const colors = labels.map((_, i) => pieColors[i % pieColors.length]);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: ui?.divider ? (ui.divider.includes("white") ? "rgba(255,255,255,0.12)" : "rgba(109,88,41,0.14)") : "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      ],
    };
  };

  const crearDatosBar = (datos) => {
    const keys = Object.keys(datos || {});
    const values = Object.values(datos || {});

    return {
      labels: keys.map((k) => traducciones[k] ?? k),
      datasets: [
        {
          label: "Total",
          data: values,
          backgroundColor: values.map((_, i) => hexToRgba(EVENT_COLORS[i % EVENT_COLORS.length], 0.55)),
          borderColor: values.map((_, i) => hexToRgba(EVENT_COLORS[i % EVENT_COLORS.length], 0.9)),
          borderWidth: 1,
        },
      ],
    };
  };

  if (isLoading) return <IsLoading />;

  if (error && !jugadoresActivos.length && !jugadoresTodos.length) {
    return (
      <div className={`${ui.shell} min-h-screen font-sans flex items-center justify-center px-6`}>
        <div className={ui.msgBox}>{error}</div>
      </div>
    );
  }

  const tarjetasPie = [
    { key: "edades", label: "Edades (Activos)", data: conteos.edades },
    { key: "categorias", label: "Categorías (Activos)", data: conteos.categorias },
    { key: "posiciones", label: "Posiciones (Activos)", data: conteos.posiciones },
    { key: "estados", label: "Estado (Histórico completo)", data: conteos.estados },
    { key: "sucursales", label: "Sucursales (Activos)", data: conteos.sucursales },
    { key: "previsiones", label: "Previsión Médica (Activos)", data: conteos.previsiones },
  ];

  const scopeLabelParts = [];
  if (scope.academia_id) scopeLabelParts.push(`Academia #${scope.academia_id}`);
  if (scope.academia_nombre) scopeLabelParts.push(String(scope.academia_nombre));
  if (scope.deporte_id) scopeLabelParts.push(`Deporte: ${sportMeta.nombre}`);
  const scopeLabel = scopeLabelParts.join(" · ");

  const hasAgg = !!scope.deporte_id && totals && Object.keys(sumasPorGrupo || {}).length > 0;

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tightish">
            {`Estadísticas Globales — ${sportMeta.nombre}`}
          </h1>
          <p className={`text-sm mt-2 ${ui.headerSub}`}>
            {scopeLabel || "Visualización filtrada por tu contexto (academia y deporte)."}
          </p>

          {!!aggMeta?.rows_base && (
            <div className="mt-3 flex justify-center">
            </div>
          )}
        </div>
      </header>

      <main className="px-6 pb-20">
        {!!error && (
          <div className="mt-8 max-w-6xl mx-auto">
            <div className={ui.warnBox}>{error}</div>
          </div>
        )}

        {!scope.deporte_id && (
          <div className="mt-6 max-w-6xl mx-auto">
            <div className={ui.warnBox}>
              Falta <b>deporte_id</b> en el scope de la academia seleccionada. <br />
              Selecciona una academia con deporte asignado (o agrega <code>deporte_id</code> al token/selector).
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {tarjetasPie.map(({ key, label, data }, idx) => {
            const total = Object.values(data || {}).reduce((a, b) => a + (Number(b) || 0), 0);
            const legendId = `legend-${key}`;

            return (
              <div key={idx} className={ui.card}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-extrabold text-base sm:text-lg">{label}</h2>
                  <span className={ui.headerSub}>Total: {total}</span>
                </div>

                <div className={`border-t ${ui.divider} pt-4`} />

                <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                  <div
                    id={legendId}
                    className="w-full sm:w-[240px] shrink-0 max-h-[240px] overflow-y-auto overflow-x-hidden pr-1"
                  />

                  <div className="relative w-full min-w-0 h-[240px] sm:h-[280px]">
                    <Pie
                      data={generatePieData(data)}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: 6 },
                        plugins: {
                          legend: { display: false },
                          htmlLegend: { containerID: legendId, ...ui.legendTheme },
                          pieValueInside: {
                            font: "12px sans-serif",
                            color: ui.pieLabel,
                          },
                          tooltip: { enabled: true },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasAgg ? (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(sumasPorGrupo).map(([grupoNombre, datos], idx) => (
              <div key={idx} className={ui.card}>
                <h2 className="font-extrabold mb-4 text-lg text-center">
                  {String(grupoNombre).toUpperCase()}
                </h2>

                <div className="relative h-[360px] sm:h-[400px]">
                  <Bar
                    data={crearDatosBar(datos)}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { labels: { color: ui.legendText } },
                        tooltip: { enabled: true },
                      },
                      scales: {
                        x: {
                          ticks: { color: ui.axisText },
                          grid: { color: ui.grid },
                        },
                        y: {
                          beginAtZero: true,
                          ticks: { color: ui.axisText },
                          grid: { color: ui.grid },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 max-w-6xl mx-auto">
            <div className={ui.card}>
              <p className={`text-center ${ui.headerSub}`}>
                Aún no hay métricas agregadas para <b>{sportMeta.nombre}</b>.<br />
                Si sabes que existen, revisa que <code>/estadisticas/aggregate</code> esté disponible
                y que el <code>scope.deporte_id</code> esté seteado.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
