// src/pages/admin/estadisticasGlobales.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pie, Bar } from "react-chartjs-2";
import { Chart, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from "chart.js";
import api, { getToken, clearToken } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

Chart.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

/* =======================
   🎨 Colores gráficos
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
  const h = String(hex || "")
    .replace("#", "")
    .trim();
  if (![3, 6].includes(h.length)) return `rgba(255,255,255,${a})`;
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
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
    ctx.fillStyle = (pluginOptions && pluginOptions.color) || chart.options?.plugins?.legend?.labels?.color || "#fff";

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

      const color = Array.isArray(bg)
        ? bg[i] || EVENT_COLORS[i % EVENT_COLORS.length]
        : bg || EVENT_COLORS[i % EVENT_COLORS.length];

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

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    // soporte: "2" o JSON
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return { id: direct, deporte_id: null, nombre: null };

    const p = JSON.parse(raw);
    const id = Number(p?.id ?? p?.academia_id ?? p?.academiaId ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;

    const deporte_id = Number(p?.deporte_id ?? p?.sport_id ?? 0);
    return {
      id,
      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
      nombre: p?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) => String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

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
      defensivas: ["intercepciones", "despejes", "duelos_ganados", "entradas_exitosas", "bloqueos", "recuperaciones"],
      tecnicas: [
        "pases_completados",
        "pases_errados",
        "posesion_perdida",
        "offsides",
        "faltas_cometidas",
        "faltas_recibidas",
      ],
      fisicas: ["distancia_recorrida_km", "sprints", "duelos_aereos_ganados"],
      disciplina: ["tarjetas_amarillas", "tarjetas_rojas"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
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
      distancia_recorrida_km: "Distancia Recorrida (km)",
      sprints: "Sprints",
      duelos_aereos_ganados: "Duelos Aéreos Ganados",
      tarjetas_amarillas: "Tarjetas Amarillas",
      tarjetas_rojas: "Tarjetas Rojas",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
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
      ataque_intentos: "Ataque - Intentos",
      ataque_puntos: "Ataque - Puntos",
      ataque_errores: "Ataque - Errores",
      saques_total: "Saques Totales",
      saques_aces: "Aces de Saque",
      saques_positivos: "Saques Positivos",
      saques_errores: "Errores de Saque",
      bloqueos_punto: "Bloqueos Punto",
      bloqueos_toques: "Toques de Bloqueo",
      recepciones_total: "Recepciones Totales",
      recepcion_positiva: "Recepción Positiva",
      recepcion_perfecta: "Recepción Perfecta",
      defensas_recuperadas: "Defensas Recuperadas",
      armados_total: "Armados Totales",
      armados_precision: "Precisión de Armado",
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
      servicio: ["primer_servicio_pct", "puntos_primer_servicio", "puntos_segundo_servicio", "aces", "dobles_faltas"],
      break_points: ["break_points_oportunidades", "break_points_convertidos"],
      juego: ["winners", "errores_no_forzados", "peloteos_cortos_ganados"],
      totales: ["puntos_ganados_total", "juegos_ganados_total"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      primer_servicio_pct: "Primer Servicio (%)",
      puntos_primer_servicio: "Puntos con Primer Servicio",
      puntos_segundo_servicio: "Puntos con Segundo Servicio",
      aces: "Aces",
      dobles_faltas: "Dobles Faltas",
      break_points_oportunidades: "Break Points - Oportunidades",
      break_points_convertidos: "Break Points - Convertidos",
      winners: "Winners",
      errores_no_forzados: "Errores No Forzados",
      peloteos_cortos_ganados: "Peloteos Cortos Ganados",
      puntos_ganados_total: "Puntos Ganados",
      juegos_ganados_total: "Juegos Ganados",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  4: {
    nombre: "Pádel",
    grupos: {
      servicio: ["primer_saque_pct", "puntos_primer_saque", "puntos_segundo_saque"],
      puntos_oro: ["puntos_oro_jugados", "puntos_oro_ganados", "puntos_oro_ganados_con_saque"],
      precision: ["errores_no_forzados", "errores_forzados", "winners"],
      posicionamiento: ["tiempo_red_pct", "tiempo_fondo_pct", "puntos_red_ganados"],
      voleas: ["voleas_total", "voleas_ganadoras", "voleas_errores"],
      remates: ["remates_total", "remates_ganadores", "remates_errores"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      primer_saque_pct: "Primer Saque (%)",
      puntos_primer_saque: "Puntos con Primer Saque",
      puntos_segundo_saque: "Puntos con Segundo Saque",
      puntos_oro_jugados: "Puntos de Oro Jugados",
      puntos_oro_ganados: "Puntos de Oro Ganados",
      puntos_oro_ganados_con_saque: "Puntos de Oro Ganados con Saque",
      errores_no_forzados: "Errores No Forzados",
      errores_forzados: "Errores Forzados",
      winners: "Winners",
      tiempo_red_pct: "Tiempo en Red (%)",
      tiempo_fondo_pct: "Tiempo en Fondo (%)",
      puntos_red_ganados: "Puntos Ganados en Red",
      voleas_total: "Voleas Totales",
      voleas_ganadoras: "Voleas Ganadoras",
      voleas_errores: "Errores de Volea",
      remates_total: "Remates Totales",
      remates_ganadores: "Remates Ganadores",
      remates_errores: "Errores de Remate",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  5: {
    nombre: "Tenis de mesa",
    grupos: {
      servicio_recepcion: ["efectividad_servicio_pct", "efectividad_devolucion_pct", "primer_saque_pct"],
      juego: ["errores_no_forzados", "winners"],
      presion: ["puntos_presion_jugados", "puntos_presion_ganados"],
      dobles: ["dobles_puntos_jugados", "dobles_puntos_ganados"],
      fisiologia: ["fc_media", "fc_max", "lactato"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      efectividad_servicio_pct: "Efectividad de Servicio (%)",
      efectividad_devolucion_pct: "Efectividad de Devolución (%)",
      primer_saque_pct: "Primer Saque (%)",
      errores_no_forzados: "Errores No Forzados",
      winners: "Winners",
      puntos_presion_jugados: "Puntos de Presión Jugados",
      puntos_presion_ganados: "Puntos de Presión Ganados",
      dobles_puntos_jugados: "Puntos de Dobles Jugados",
      dobles_puntos_ganados: "Puntos de Dobles Ganados",
      fc_media: "Frecuencia Cardíaca Media",
      fc_max: "Frecuencia Cardíaca Máxima",
      lactato: "Lactato",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },

  6: {
    nombre: "Básquetbol",
    grupos: {
      produccion: ["puntos", "asistencias", "plus_minus", "pir", "per"],
      rebotes: ["rebotes_ofensivos", "rebotes_defensivos"],
      defensa: ["robos", "bloqueos"],
      control: ["perdidas", "faltas"],
      eficiencia: ["ts_pct", "efg_pct", "usg_pct"],
      base: ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
    },
    traducciones: {
      puntos: "Puntos",
      rebotes_ofensivos: "Rebotes Ofensivos",
      rebotes_defensivos: "Rebotes Defensivos",
      asistencias: "Asistencias",
      robos: "Robos",
      bloqueos: "Bloqueos",
      perdidas: "Pérdidas",
      faltas: "Faltas",
      ts_pct: "True Shooting (%)",
      efg_pct: "eFG (%)",
      usg_pct: "Usage (%)",
      plus_minus: "+/-",
      pir: "PIR",
      per: "PER",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      sanciones_federativas: "Sanciones Federativas",
    },
  },
};

/* ✅ Auth helpers */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};
const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
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
      id: Number(
        x?.id ?? x?.categoria_id ?? x?.posicion_id ?? x?.estado_id ?? x?.sucursal_id ?? x?.prevision_medica_id
      ),
      nombre: String(x?.nombre ?? x?.descripcion ?? "").trim(),
    }))
    .filter((x) => Number.isFinite(x.id) && x.nombre);

const tryGetList = async (paths, { signal } = {}) => {
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
      const r = await api.get(url, { signal });
      return normalizeListResponse(r);
    } catch (e) {
      const st = getErrStatus(e);
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

/* =======================
   ✅ Resolver academia_id / deporte_id (NO inventa)
======================= */
const resolveScope = ({ decoded, snap, locStateScope }) => {
  const s = locStateScope || {};
  const scope = decoded?.scope || decoded?.tenant || decoded?.context || {};

  const academia_id =
    Number(snap?.id ?? 0) ||
    Number(s?.academia_id ?? s?.academy_id ?? 0) ||
    Number(scope?.academia_id ?? scope?.academy_id ?? decoded?.academia_id ?? decoded?.academy_id ?? 0) ||
    null;

  const deporte_id =
    Number(snap?.deporte_id ?? 0) ||
    Number(s?.deporte_id ?? s?.sport_id ?? 0) ||
    Number(
      scope?.deporte_id ?? scope?.sport_id ?? decoded?.deporte_id ?? decoded?.sport_id ?? decoded?.id_deporte ?? 0
    ) ||
    null;

  return {
    academia_id: Number.isFinite(academia_id) && academia_id > 0 ? academia_id : null,
    deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
  };
};

const buildAggPath = ({ academia_id, deporte_id }) => {
  const qs = new URLSearchParams();
  if (academia_id) qs.set("academia_id", String(Number(academia_id)));
  if (deporte_id) qs.set("deporte_id", String(Number(deporte_id)));
  const q = qs.toString();
  return q ? `/estadisticas/aggregate?${q}` : "/estadisticas/aggregate";
};

/* ✅ Derivar deporte desde jugadores (ya pasan auth + x-academia-id) */
const deriveDeporteFromPlayers = (arr) => {
  const safe = Array.isArray(arr) ? arr : [];
  const freq = new Map();
  for (const j of safe) {
    const d = Number(j?.deporte_id ?? j?.sport_id ?? j?.deporte?.id ?? 0);
    if (Number.isFinite(d) && d > 0) freq.set(d, (freq.get(d) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [k, v] of freq.entries()) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
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

  const derivedOnceRef = useRef(false);

  useMobileAutoScrollTop();

  const deporteId = scope.deporte_id ? Number(scope.deporte_id) : null;
  const sportMeta =
    deporteId && SPORT_META[deporteId] ? SPORT_META[deporteId] : SPORT_META_FALLBACK_BASE("Deporte no configurado");

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

    const divider = darkMode ? "border-white/10" : "border-ra-marron/10";

    const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(109,88,41,0.92)";
    const grid = darkMode ? "rgba(255,255,255,0.10)" : "rgba(109,88,41,0.10)";
    const legendText = darkMode ? "rgba(255,255,255,0.85)" : "rgba(109,88,41,0.85)";
    const pieLabel = darkMode ? "rgba(255,255,255,0.88)" : "rgba(109,88,41,0.92)";

    const legendTheme = {
      textColor: darkMode ? "rgba(255,255,255,0.86)" : "rgba(109,88,41,0.90)",
      borderColor: darkMode ? "rgba(255,255,255,0.12)" : "rgba(109,88,41,0.15)",
      itemBg: darkMode ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.65)",
      itemBgHover: darkMode ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.90)",
    };

    return { shell, headerSub, msgBox, warnBox, card, divider, axisText, grid, legendText, pieLabel, legendTheme };
  }, [darkMode]);

  useEffect(() => {
    const prevTitle = document.title;
    const title = `Estadísticas Globales — ${sportMeta.nombre}`;
    document.dispatchEvent(new CustomEvent("updateBreadcrumb", { detail: { title } }));
    document.dispatchEvent(new CustomEvent("weli:setTitle", { detail: { title } }));
    return () => {
      document.title = prevTitle;
    };
  }, [sportMeta.nombre]);

  useEffect(() => {
    derivedOnceRef.current = false;
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const parsedRol = extractRol(decoded);
      if (![1, 2, 3].includes(parsedRol)) {
        navigate("/admin", { replace: true });
        return;
      }
      setRol(parsedRol);

      const isSuperTree = isSuperTreePath(location.pathname);
      const snap = readSelectedAcademia();

      if (isSuperTree) {
        if (!snap?.id) {
          navigate("/super-dashboard", { replace: true });
          return;
        }
        const resolved = resolveScope({ decoded, snap, locStateScope: location.state?.scope });
        setScope({
          academia_id: resolved.academia_id ?? snap.id,
          deporte_id: resolved.deporte_id,
          academia_nombre: snap?.nombre ?? null,
        });
      } else {
        const resolved = resolveScope({ decoded, snap, locStateScope: location.state?.scope });
        setScope({
          academia_id: resolved.academia_id,
          deporte_id: resolved.deporte_id,
          academia_nombre: null,
        });
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, location.pathname, location.state]);

  useEffect(() => {
    if (rol == null) return;

    const isSuperTree = isSuperTreePath(location.pathname);
    if (isSuperTree && !scope.academia_id) return;

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const acadId = scope.academia_id;
        let depId = scope.deporte_id;

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

        // 1) Traemos jugadores primero (porque ya sabemos que esos endpoints pasan auth + x-academia-id)
        const [rawTodos, rawActivos] = await Promise.all([
          tryGetList(jugadoresTodosPaths, { signal: abort.signal }),
          tryGetList(jugadoresActivosPaths, { signal: abort.signal }),
        ]);

        if (abort.signal.aborted) return;

        // 2) Si falta deporte_id, lo derivamos desde jugadores (moda)
        if (!depId) {
          const d1 = deriveDeporteFromPlayers(rawActivos);
          const d2 = d1 || deriveDeporteFromPlayers(rawTodos);
          if (d2 && !derivedOnceRef.current) {
            derivedOnceRef.current = true;
            depId = d2;
            setScope((prev) => ({ ...prev, deporte_id: d2 }));
          }
        }

        // 3) Cargamos catálogos en paralelo (no dependen de deporte)
        const [cats, poss, ests, sucs, prevs] = await Promise.all([
          tryGetList(["/categorias"], { signal: abort.signal }),
          tryGetList(["/posiciones"], { signal: abort.signal }),
          tryGetList(["/estado", "/estados"], { signal: abort.signal }),
          tryGetList(["/sucursales-real", "/sucursales"], { signal: abort.signal }),
          tryGetList(["/prevision-medica"], { signal: abort.signal }),
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
              (posMapLocal.has(Number(j?.posicion_id)) ? { nombre: posMapLocal.get(Number(j.posicion_id)) } : null),
            categoria:
              j?.categoria ??
              (catMapLocal.has(Number(j?.categoria_id)) ? { nombre: catMapLocal.get(Number(j.categoria_id)) } : null),
            estado:
              j?.estado ??
              (estMapLocal.has(Number(j?.estado_id)) ? { nombre: estMapLocal.get(Number(j.estado_id)) } : null),
            sucursal:
              j?.sucursal ??
              (sucMapLocal.has(Number(j?.sucursal_id)) ? { nombre: sucMapLocal.get(Number(j.sucursal_id)) } : null),
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
          const d = depId || scope.deporte_id;
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

        // 4) Aggregate (solo si tenemos deporte_id O si tu backend acepta solo academia_id)
        // Como tu backend te daba 400 si faltaba deporte_id, acá somos conservadores:
        if (!depId) {
          setTotals(null);
          setAggMeta(null);
          setError((prev) => prev || "Falta deporte_id en el scope (no viene en token/selector ni en jugadores).");
          return;
        }

        const aggPath = buildAggPath({ academia_id: acadId, deporte_id: depId });

        try {
          const r = await api.get(aggPath, { signal: abort.signal });
          const aggRes = r?.data ?? null;

          if (aggRes?.ok && aggRes?.totals && typeof aggRes.totals === "object") {
            setTotals(aggRes.totals);
            setAggMeta(aggRes?.meta ?? null);
          } else {
            setTotals(null);
            setAggMeta(aggRes?.meta ?? null);
          }
        } catch (e) {
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e;
          setTotals(null);
          setAggMeta(null);
          const msg =
            e?.response?.data?.message ||
            e?.response?.data?.detail ||
            e?.message ||
            (st ? `Aggregate falló (${st})` : "Aggregate falló");
          setError((prev) => prev || msg);
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

  const pieColors = useMemo(() => EVENT_COLORS.map((c) => hexToRgba(c, 0.75)), []);

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
          borderColor: ui?.divider
            ? ui.divider.includes("white")
              ? "rgba(255,255,255,0.12)"
              : "rgba(109,88,41,0.14)"
            : "rgba(255,255,255,0.12)",
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

  const hasAgg = totals && Object.keys(sumasPorGrupo || {}).length > 0;

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tightish">{`Estadísticas Globales — ${sportMeta.nombre}`}</h1>
          <p className={`text-sm mt-2 ${ui.headerSub}`}>
            {scopeLabel || "Visualización filtrada por tu contexto (academia y deporte)."}
          </p>
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
              Falta <b>deporte_id</b> en el scope. <br />
              Nota: intentamos derivarlo desde jugadores (que sí pasan tu auth). Si tampoco viene ahí, entonces sí o sí
              lo tienes que incluir en <code>token.scope</code> o en el selector.
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
                          pieValueInside: { font: "12px sans-serif", color: ui.pieLabel },
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
                <h2 className="font-extrabold mb-4 text-lg text-center">{String(grupoNombre).toUpperCase()}</h2>

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
                        x: { ticks: { color: ui.axisText }, grid: { color: ui.grid } },
                        y: { beginAtZero: true, ticks: { color: ui.axisText }, grid: { color: ui.grid } },
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
                Si sabes que existen, revisa que <code>/estadisticas/aggregate</code> acepte <code>deporte_id</code> y
                que este componente pueda derivarlo (token/selector/jugadores).
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
