// src/pages/apoderado/portalDashboard.jsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api, { clearToken, getToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";

import { FiLogOut, FiMoon, FiSettings, FiSun } from "react-icons/fi";

import {
  Activity,
  Award,
  Building2,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Dumbbell,
  FileText,
  GraduationCap,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Ruler,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trophy,
  UserRound,
  Weight,
} from "lucide-react";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* =========================================================
   COLORES DEPORTIVOS
========================================================= */

const ACCENT = "#F97316";
const ACCENT_HOVER = "#EA580C";

const VIVID_COLORS = ["#F97316", "#8B5CF6", "#14B8A6", "#10B981", "#EF4444", "#F59E0B", "#EC4899"];

/* =========================================================
   ESTADÍSTICAS BASE
========================================================= */

const BASE_GROUP = {
  "Base / Generales": ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
};

/* =========================================================
   ESTADÍSTICAS POR DEPORTE
========================================================= */

const SPORT_CONFIG = {
  1: {
    nombre: "Fútbol",
    grupos: {
      Ofensivas: [
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
      Defensivas: ["intercepciones", "despejes", "duelos_ganados", "entradas_exitosas", "bloqueos", "recuperaciones"],
      Técnicas: [
        "pases_completados",
        "pases_errados",
        "posesion_perdida",
        "offsides",
        "faltas_cometidas",
        "faltas_recibidas",
      ],
      Físicas: ["distancia_recorrida_km", "sprints", "duelos_aereos_ganados"],
      Disciplina: ["tarjetas_amarillas", "tarjetas_rojas"],
    },
  },

  2: {
    nombre: "Vóleibol",
    grupos: {
      Ataque: ["ataque_intentos", "ataque_puntos", "ataque_errores"],
      Saque: ["saques_total", "saques_aces", "saques_positivos", "saques_errores"],
      Bloqueo: ["bloqueos_punto", "bloqueos_toques"],
      Recepción: ["recepciones_total", "recepcion_positiva", "recepcion_perfecta"],
      Defensa: ["defensas_recuperadas"],
      Armado: ["armados_total", "armados_precision"],
      Eficiencia: ["sideout_pct", "breakpoints_pct", "errores_totales"],
    },
  },

  3: {
    nombre: "Tenis",
    grupos: {
      Servicio: ["primer_servicio_pct", "puntos_primer_servicio", "puntos_segundo_servicio", "aces", "dobles_faltas"],
      "Break Points": ["break_points_oportunidades", "break_points_convertidos"],
      Juego: ["winners", "errores_no_forzados", "peloteos_cortos_ganados"],
      Totales: ["puntos_ganados_total", "juegos_ganados_total"],
    },
  },

  4: {
    nombre: "Pádel",
    grupos: {
      Servicio: ["primer_saque_pct", "puntos_primer_saque", "puntos_segundo_saque"],
      "Puntos de Oro": ["puntos_oro_jugados", "puntos_oro_ganados", "puntos_oro_ganados_con_saque"],
      Precisión: ["errores_no_forzados", "errores_forzados", "winners"],
      Posicionamiento: ["tiempo_red_pct", "tiempo_fondo_pct", "puntos_red_ganados"],
      Voleas: ["voleas_total", "voleas_ganadoras", "voleas_errores"],
      Remates: ["remates_total", "remates_ganadores", "remates_errores"],
    },
  },

  5: {
    nombre: "Tenis de mesa",
    grupos: {
      "Servicio / Devolución": ["efectividad_servicio_pct", "efectividad_devolucion_pct", "primer_saque_pct"],
      Juego: ["errores_no_forzados", "winners"],
      Presión: ["puntos_presion_jugados", "puntos_presion_ganados"],
      Dobles: ["dobles_puntos_jugados", "dobles_puntos_ganados"],
      Fisiología: ["fc_media", "fc_max", "lactato"],
    },
  },

  6: {
    nombre: "Básquetbol",
    grupos: {
      Producción: ["puntos", "asistencias", "plus_minus", "pir", "per"],
      Rebotes: ["rebotes_ofensivos", "rebotes_defensivos"],
      Defensa: ["robos", "bloqueos"],
      Control: ["perdidas", "faltas"],
      Eficiencia: ["ts_pct", "efg_pct", "usg_pct"],
    },
  },

  7: {
    nombre: "Fútbol Americano",
    grupos: {
      Pases: ["pases_completos", "pases_intentados", "pases_yardas", "pases_touchdowns", "pases_intercepciones"],
      Acarreos: ["acarreos_intentos", "acarreos_yardas", "acarreos_touchdowns"],
      Recepciones: ["recepciones_total", "recepciones_yardas", "recepciones_touchdowns"],
      Defensa: ["tackles_totales", "sacks", "intercepciones_defensivas", "fumbles_recuperados"],
      Generales: ["yardas_totales", "perdidas_balon", "tiempo_posesion_segundos"],
      "Tercer Down": ["tercer_down_intentos", "tercer_down_conversiones", "tercer_down_efectividad_pct"],
    },
  },
};

/* =========================================================
   LABELS
========================================================= */

const FIELD_LABELS = {
  minutos_jugados: "Minutos jugados",
  partidos_jugados: "Partidos jugados",
  lesiones: "Lesiones",
  dias_baja: "Días de baja",
  sanciones_federativas: "Sanciones federativas",

  goles: "Goles",
  asistencias: "Asistencias",
  tiros_libres: "Tiros libres",
  penales: "Penales",
  tarjetas_amarillas: "Tarjetas amarillas",
  tarjetas_rojas: "Tarjetas rojas",
  tiros_arco: "Tiros al arco",
  tiros_fuera: "Tiros fuera",
  tiros_bloqueados: "Tiros bloqueados",
  regates_exitosos: "Regates exitosos",
  centros_acertados: "Centros acertados",
  pases_clave: "Pases clave",
  intercepciones: "Intercepciones",
  despejes: "Despejes",
  duelos_ganados: "Duelos ganados",
  entradas_exitosas: "Entradas exitosas",
  bloqueos: "Bloqueos",
  recuperaciones: "Recuperaciones",
  pases_completados: "Pases completados",
  pases_errados: "Pases errados",
  posesion_perdida: "Posesión perdida",
  offsides: "Offsides",
  faltas_cometidas: "Faltas cometidas",
  faltas_recibidas: "Faltas recibidas",
  distancia_recorrida_km: "Distancia recorrida (km)",
  sprints: "Sprints",
  duelos_aereos_ganados: "Duelos aéreos ganados",
  torneos_convocados: "Torneos convocados",
  titular_partidos: "Partidos como titular",

  ataque_intentos: "Intentos de ataque",
  ataque_puntos: "Puntos de ataque",
  ataque_errores: "Errores de ataque",
  saques_total: "Saques totales",
  saques_aces: "Aces de saque",
  saques_positivos: "Saques positivos",
  saques_errores: "Errores de saque",
  bloqueos_punto: "Bloqueos punto",
  bloqueos_toques: "Toques de bloqueo",
  recepciones_total: "Recepciones totales",
  recepcion_positiva: "Recepción positiva",
  recepcion_perfecta: "Recepción perfecta",
  defensas_recuperadas: "Defensas recuperadas",
  armados_total: "Armados totales",
  armados_precision: "Precisión de armado",
  sideout_pct: "Sideout (%)",
  breakpoints_pct: "Breakpoints (%)",
  errores_totales: "Errores totales",

  primer_servicio_pct: "Primer servicio (%)",
  puntos_primer_servicio: "Puntos con primer servicio",
  puntos_segundo_servicio: "Puntos con segundo servicio",
  aces: "Aces",
  dobles_faltas: "Dobles faltas",
  break_points_oportunidades: "Break points - oportunidades",
  break_points_convertidos: "Break points - convertidos",
  winners: "Winners",
  errores_no_forzados: "Errores no forzados",
  peloteos_cortos_ganados: "Peloteos cortos ganados",
  puntos_ganados_total: "Puntos ganados",
  juegos_ganados_total: "Juegos ganados",

  primer_saque_pct: "Primer saque (%)",
  puntos_primer_saque: "Puntos con primer saque",
  puntos_segundo_saque: "Puntos con segundo saque",
  puntos_oro_jugados: "Puntos de oro jugados",
  puntos_oro_ganados: "Puntos de oro ganados",
  puntos_oro_ganados_con_saque: "Puntos de oro ganados con saque",
  errores_forzados: "Errores forzados",
  tiempo_red_pct: "Tiempo en red (%)",
  tiempo_fondo_pct: "Tiempo en fondo (%)",
  puntos_red_ganados: "Puntos ganados en red",
  voleas_total: "Voleas totales",
  voleas_ganadoras: "Voleas ganadoras",
  voleas_errores: "Errores de volea",
  remates_total: "Remates totales",
  remates_ganadores: "Remates ganadores",
  remates_errores: "Errores de remate",

  efectividad_servicio_pct: "Efectividad de servicio (%)",
  efectividad_devolucion_pct: "Efectividad de devolución (%)",
  puntos_presion_jugados: "Puntos de presión jugados",
  puntos_presion_ganados: "Puntos de presión ganados",
  dobles_puntos_jugados: "Puntos de dobles jugados",
  dobles_puntos_ganados: "Puntos de dobles ganados",
  fc_media: "Frecuencia cardíaca media",
  fc_max: "Frecuencia cardíaca máxima",
  lactato: "Lactato",

  puntos: "Puntos",
  rebotes_ofensivos: "Rebotes ofensivos",
  rebotes_defensivos: "Rebotes defensivos",
  robos: "Robos",
  perdidas: "Pérdidas",
  faltas: "Faltas",
  ts_pct: "True Shooting (%)",
  efg_pct: "eFG (%)",
  usg_pct: "Usage (%)",
  plus_minus: "+/-",
  pir: "PIR",
  per: "PER",

  pases_completos: "Pases completos",
  pases_intentados: "Pases intentados",
  pases_yardas: "Yardas por pase",
  pases_touchdowns: "Touchdowns por pase",
  pases_intercepciones: "Intercepciones sufridas",
  acarreos_intentos: "Intentos de acarreo",
  acarreos_yardas: "Yardas por acarreo",
  acarreos_touchdowns: "Touchdowns por acarreo",
  recepciones_yardas: "Yardas por recepción",
  recepciones_touchdowns: "Touchdowns por recepción",
  tackles_totales: "Tackles totales",
  sacks: "Sacks",
  intercepciones_defensivas: "Intercepciones defensivas",
  fumbles_recuperados: "Fumbles recuperados",
  yardas_totales: "Yardas totales",
  perdidas_balon: "Pérdidas de balón",
  tiempo_posesion_segundos: "Tiempo de posesión",
  tercer_down_intentos: "Tercer down - intentos",
  tercer_down_conversiones: "Tercer down - conversiones",
  tercer_down_efectividad_pct: "Tercer down - efectividad (%)",
};

const DECIMAL_FIELDS = new Set([
  "distancia_recorrida_km",
  "sideout_pct",
  "breakpoints_pct",
  "primer_servicio_pct",
  "primer_saque_pct",
  "tiempo_red_pct",
  "tiempo_fondo_pct",
  "efectividad_servicio_pct",
  "efectividad_devolucion_pct",
  "lactato",
  "ts_pct",
  "efg_pct",
  "usg_pct",
  "pir",
  "per",
  "tercer_down_efectividad_pct",
]);

const SIGNED_FIELDS = new Set(["plus_minus"]);

/* =========================================================
   KPI PRINCIPALES POR DEPORTE
========================================================= */

const SPORT_KPIS = {
  1: [
    { label: "Goles", key: "goles" },
    { label: "Asistencias", key: "asistencias" },
    { label: "Partidos", key: "partidos_jugados" },
    { label: "Minutos", key: "minutos_jugados" },
  ],

  2: [
    { label: "Ataque", key: "ataque_puntos" },
    { label: "Aces", key: "saques_aces" },
    { label: "Bloqueos", key: "bloqueos_punto" },
    { label: "Partidos", key: "partidos_jugados" },
  ],

  3: [
    { label: "Aces", key: "aces" },
    { label: "Winners", key: "winners" },
    { label: "Puntos ganados", key: "puntos_ganados_total" },
    { label: "Partidos", key: "partidos_jugados" },
  ],

  4: [
    { label: "Winners", key: "winners" },
    { label: "Puntos de oro", key: "puntos_oro_ganados" },
    { label: "Puntos en red", key: "puntos_red_ganados" },
    { label: "Partidos", key: "partidos_jugados" },
  ],

  5: [
    { label: "Winners", key: "winners" },
    { label: "Presión", key: "puntos_presion_ganados" },
    { label: "Servicio", key: "efectividad_servicio_pct" },
    { label: "Partidos", key: "partidos_jugados" },
  ],

  6: [
    { label: "Puntos", key: "puntos" },
    { label: "Asistencias", key: "asistencias" },
    {
      label: "Rebotes",
      sum: ["rebotes_ofensivos", "rebotes_defensivos"],
    },
    { label: "Robos", key: "robos" },
  ],

  7: [
    {
      label: "Touchdowns",
      sum: ["pases_touchdowns", "acarreos_touchdowns", "recepciones_touchdowns"],
    },
    { label: "Yardas", key: "yardas_totales" },
    { label: "Tackles", key: "tackles_totales" },
    { label: "Partidos", key: "partidos_jugados" },
  ],
};

/* =========================================================
   HELPERS GENERALES
========================================================= */

const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;

const getErrMsg = (err) => err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error";

const clearSession = () => {
  try {
    localStorage.removeItem("user_info");
    localStorage.removeItem("apoderado_must_change_password");
  } catch {}

  try {
    clearToken();
  } catch {}
};

const pickNombreFromAny = (data) => {
  const source = data?.apoderado ?? data?.user ?? data?.usuario ?? data ?? {};

  return String(source?.nombre_apoderado ?? source?.nombre ?? source?.name ?? "").trim();
};

const readUserInfoLocal = () => {
  try {
    const raw = localStorage.getItem("user_info");

    if (!raw) {
      return "";
    }

    return pickNombreFromAny(JSON.parse(raw));
  } catch {
    return "";
  }
};

const fmtCLP = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(number);
};

const fmtDate = (value) => {
  if (!value) {
    return "—";
  }

  const string = String(value);

  if (/^\d{4}-\d{2}-\d{2}/.test(string)) {
    const [year, month, day] = string.slice(0, 10).split("-");

    return `${day}-${month}-${year}`;
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, "0");

    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${day}-${month}-${date.getFullYear()}`;
  }

  return string;
};

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const prettyField = (field) =>
  FIELD_LABELS[field] ||
  String(field || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const getSportConfig = (deporteId) =>
  SPORT_CONFIG[Number(deporteId)] || {
    nombre: "Deporte no configurado",
    grupos: {},
  };

const getGroupsForSport = (deporteId) => ({
  ...BASE_GROUP,
  ...getSportConfig(deporteId).grupos,
});

const flattenJoinedForSport = (joined, deporteId) => {
  const base = joined?.base || {};

  const sport = joined?.sport || {};

  const output = {
    ...base,
    ...sport,
  };

  const fields = Object.values(getGroupsForSport(deporteId)).flat();

  fields.forEach((field) => {
    if (output[field] == null) {
      output[field] = 0;
    }
  });

  return output;
};

const formatStatValue = (field, value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  if (field === "tiempo_posesion_segundos") {
    const minutes = Math.floor(number / 60);

    const seconds = Math.floor(number % 60);

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  if (DECIMAL_FIELDS.has(field)) {
    const formatted = new Intl.NumberFormat("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);

    if (field.endsWith("_pct")) {
      return `${formatted}%`;
    }

    if (field === "distancia_recorrida_km") {
      return `${formatted} km`;
    }

    return formatted;
  }

  if (SIGNED_FIELDS.has(field) && number > 0) {
    return `+${number}`;
  }

  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(number);
};

const normalizeSituacion = (pago) => {
  const raw =
    pago?.situacion_pago?.nombre ??
    pago?.situacion ??
    pago?.estado ??
    pago?.estado_pago ??
    pago?.estado_nombre ??
    pago?.situacion_pago_id ??
    "";

  const value = String(raw).trim().toUpperCase();

  if (value === "PAGADO") {
    return "PAGADO";
  }

  if (value === "VENCIDO") {
    return "VENCIDO";
  }

  if (value === "PENDIENTE") {
    return "PENDIENTE";
  }

  return value || "—";
};

const getPagoStatusStyle = (situacion, darkMode) => {
  const value = String(situacion || "").toUpperCase();

  if (value === "PAGADO") {
    return darkMode
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "VENCIDO") {
    return darkMode ? "border-red-400/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700";
  }

  if (value === "PENDIENTE") {
    return darkMode
      ? "border-amber-400/20 bg-amber-500/10 text-amber-300"
      : "border-amber-200 bg-amber-50 text-amber-700";
  }

  return darkMode ? "border-white/10 bg-white/5 text-white/70" : "border-black/10 bg-black/[0.03] text-slate-600";
};

const getPaymentConcepts = (pago) => {
  const detalles = Array.isArray(pago?.detalles) ? pago.detalles : [];

  if (detalles.length === 0) {
    return [];
  }

  return detalles.map((detail) => ({
    id: detail?.id ?? `${detail?.tipo_pago_id}-${detail?.monto_total}`,

    nombre: detail?.tipo_pago?.nombre ?? detail?.tipo_pago_nombre ?? "Concepto de pago",

    monto: Number(detail?.monto_total ?? 0),
  }));
};

const resolveKpiValue = (stats, descriptor) => {
  if (Array.isArray(descriptor?.sum)) {
    return descriptor.sum.reduce((accumulator, field) => accumulator + safeNumber(stats?.[field], 0), 0);
  }

  return safeNumber(stats?.[descriptor?.key], 0);
};

/* =========================================================
   COMPONENTES UI
========================================================= */

const SectionTitle = ({ icon: Icon, eyebrow, title, tokens, accent = ACCENT }) => (
  <div className="flex items-start gap-3">
    <div
      className="h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center"
      style={{
        backgroundColor: `${accent}18`,
        color: accent,
      }}
    >
      <Icon size={20} />
    </div>

    <div className="min-w-0">
      {eyebrow ? (
        <p
          className="text-[10px] sm:text-xs font-black tracking-[0.28em] uppercase"
          style={{
            color: tokens.textMuted,
          }}
        >
          {eyebrow}
        </p>
      ) : null}

      <h3
        className="mt-0.5 text-base sm:text-lg font-extrabold"
        style={{
          color: tokens.text,
        }}
      >
        {title}
      </h3>
    </div>
  </div>
);

const Pill = ({ children, tokens, accent }) => (
  <span
    className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-extrabold"
    style={{
      backgroundColor: accent ? `${accent}16` : tokens.surfaceSoft,

      borderColor: accent ? `${accent}35` : tokens.border,

      color: accent || tokens.text,
    }}
  >
    {children}
  </span>
);

const KpiCard = ({ title, value, subtitle, color }) => (
  <div
    className="relative overflow-hidden rounded-3xl p-5 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,0.18)]"
    style={{
      background: `linear-gradient(135deg, ${color}, ${color}CC)`,
    }}
  >
    <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />

    <p className="relative text-[11px] sm:text-xs uppercase tracking-[0.22em] font-black text-white/80">{title}</p>

    <div className="relative mt-2 text-3xl sm:text-4xl font-black text-white">{value}</div>

    {subtitle ? <p className="relative mt-2 text-xs font-bold text-white/75">{subtitle}</p> : null}
  </div>
);

const DataRow = ({ label, value, tokens }) => (
  <div
    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-2.5 border-b last:border-b-0"
    style={{
      borderColor: tokens.border,
    }}
  >
    <span
      className="text-xs sm:text-sm font-semibold"
      style={{
        color: tokens.textMuted,
      }}
    >
      {label}
    </span>

    <span
      className="text-xs sm:text-sm font-extrabold text-right break-words"
      style={{
        color: tokens.text,
      }}
    >
      {value || "—"}
    </span>
  </div>
);

/* =========================================================
   COMPONENT
========================================================= */

export default function PortalDashboard() {
  const navigate = useNavigate();

  const { darkMode, toggleTheme, themeTokens } = useTheme();

  /* =======================================================
     TOKENS
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
        text: "#F9FAFB",
        textMuted: "#D1D5DB",
        border: "#374151",
        borderStrong: "#4B5563",
        inputBg: "#111827",
        inputText: "#F9FAFB",
        primary: "#FFDDA1",
        primaryContrast: "#3F2D18",
      };
    }

    return {
      surface: "#FFFFFF",
      surfaceSoft: "#FAF6EE",
      surface2: "#F7EAD4",
      surfaceHover: "#FFF9F2",
      text: "#3B2A1E",
      textMuted: "#766657",
      border: "#D8C7AE",
      borderStrong: "#BFA684",
      inputBg: "#FFFFFF",
      inputText: "#3B2A1E",
      primary: "#AA5013",
      primaryContrast: "#FFFFFF",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     STATE
  ======================================================= */

  const [bootLoading, setBootLoading] = useState(true);

  const [error, setError] = useState("");

  const [apoderadoNombre, setApoderadoNombre] = useState("");

  const [jugadores, setJugadores] = useState([]);

  const [selectedJugadorId, setSelectedJugadorId] = useState(null);

  const [detalleLoading, setDetalleLoading] = useState(false);

  const [detalle, setDetalle] = useState(null);

  const [contratoLoading, setContratoLoading] = useState(false);

  const [contratoError, setContratoError] = useState("");

  const [contratoUrl, setContratoUrl] = useState("");

  const [agendaItems, setAgendaItems] = useState([]);

  const [agendaLoading, setAgendaLoading] = useState(false);

  const [agendaError, setAgendaError] = useState("");

  /* =======================================================
     AUTH
  ======================================================= */

  const authHeaders = useCallback(() => {
    const token = getToken();

    return token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};
  }, []);

  const goLogin = useCallback(() => {
    clearSession();

    navigate("/login-apoderado", {
      replace: true,
    });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await api.post(
        "/auth-apoderado/logout",
        {
          reason: "user_click",
        },
        {
          headers: authHeaders(),
        }
      );
    } catch {
      // La sesión igual se elimina localmente.
    } finally {
      clearSession();

      navigate("/", {
        replace: true,
      });
    }
  }, [authHeaders, navigate]);

  /* =======================================================
     BOOT / ME
  ======================================================= */

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setBootLoading(true);

      setError("");

      const token = getToken();

      if (!token) {
        goLogin();
        return;
      }

      const localName = readUserInfoLocal();

      if (localName) {
        setApoderadoNombre(localName);
      }

      try {
        const { data } = await api.get("/portal-apoderado/me", {
          signal: abort.signal,

          headers: authHeaders(),
        });

        const nombre = pickNombreFromAny(data?.apoderado ?? data);

        if (nombre) {
          setApoderadoNombre(nombre);

          try {
            const previous = localStorage.getItem("user_info");

            const parsed = previous ? JSON.parse(previous) : {};

            localStorage.setItem(
              "user_info",
              JSON.stringify({
                ...parsed,
                nombre_apoderado: nombre,
              })
            );
          } catch {}
        }
      } catch (err) {
        const status = getErrStatus(err);

        if (status === 401 || status === 403) {
          goLogin();
          return;
        }
      } finally {
        if (!abort.signal.aborted) {
          setBootLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [authHeaders, goLogin]);

  /* =======================================================
     MIS JUGADORES
  ======================================================= */

  useEffect(() => {
    if (bootLoading) {
      return;
    }

    const abort = new AbortController();

    (async () => {
      setError("");

      try {
        const { data } = await api.get("/portal-apoderado/mis-jugadores", {
          signal: abort.signal,

          headers: authHeaders(),
        });

        const rows = Array.isArray(data?.jugadores) ? data.jugadores : [];

        setJugadores(rows);

        setSelectedJugadorId((current) => {
          if (current && rows.some((player) => Number(player?.id) === Number(current))) {
            return current;
          }

          const firstId = Number(rows?.[0]?.id);

          return Number.isInteger(firstId) && firstId > 0 ? firstId : null;
        });
      } catch (err) {
        const status = getErrStatus(err);

        const message = getErrMsg(err);

        if (status === 401) {
          goLogin();
          return;
        }

        if (status === 403) {
          setError("Debes cambiar tu contraseña para continuar.");

          return;
        }

        setError(message);
      }
    })();

    return () => abort.abort();
  }, [bootLoading, authHeaders, goLogin]);

  /* =======================================================
     RESUMEN CANÓNICO POR JUGADOR ID
  ======================================================= */

  useEffect(() => {
    if (!selectedJugadorId) {
      setDetalle(null);

      return;
    }

    const abort = new AbortController();

    (async () => {
      setDetalleLoading(true);

      setDetalle(null);

      setError("");

      try {
        const { data } = await api.get(
          `/portal-apoderado/jugadores/id/${encodeURIComponent(String(selectedJugadorId))}/resumen`,
          {
            signal: abort.signal,

            headers: authHeaders(),
          }
        );

        if (!abort.signal.aborted) {
          setDetalle(data?.ok ? data : null);
        }
      } catch (err) {
        const status = getErrStatus(err);

        const message = getErrMsg(err);

        if (status === 401) {
          goLogin();
          return;
        }

        if (status === 403) {
          if (message === "FORBIDDEN") {
            setError("No tienes acceso a este jugador.");
          } else {
            setError("Debes cambiar tu contraseña para continuar.");
          }

          return;
        }

        setError(message);
      } finally {
        if (!abort.signal.aborted) {
          setDetalleLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [selectedJugadorId, authHeaders, goLogin]);

  /* =======================================================
     AGENDA
  ======================================================= */

  useEffect(() => {
    if (bootLoading) {
      return;
    }

    const abort = new AbortController();

    (async () => {
      setAgendaLoading(true);

      setAgendaError("");

      try {
        const { data } = await api.get("/eventos/public?limit=50&offset=0", {
          signal: abort.signal,
        });

        const rows = Array.isArray(data?.items) ? data.items : [];

        const now = Date.now();

        const mapped = rows
          .map((event) => {
            const start = new Date(event?.fecha_inicio);

            const end = new Date(event?.fecha_fin);

            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
              return null;
            }

            return {
              id: event?.id,

              titulo: event?.titulo ?? "Evento",

              descripcion: event?.descripcion ?? "",

              start,
              end,

              when: fmtDate(event?.fecha_inicio),
            };
          })
          .filter(Boolean)
          .filter((event) => (event.end?.getTime?.() ?? 0) >= now)
          .sort((a, b) => (a.start?.getTime?.() ?? 0) - (b.start?.getTime?.() ?? 0));

        setAgendaItems(mapped);
      } catch {
        setAgendaItems([]);

        setAgendaError("No se pudo cargar la agenda.");
      } finally {
        if (!abort.signal.aborted) {
          setAgendaLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [bootLoading]);

  /* =======================================================
     CONTRATO
  ======================================================= */

  useEffect(() => {
    if (contratoUrl) {
      try {
        URL.revokeObjectURL(contratoUrl);
      } catch {}
    }

    setContratoUrl("");

    setContratoError("");

    setContratoLoading(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJugadorId]);

  useEffect(() => {
    return () => {
      if (contratoUrl) {
        try {
          URL.revokeObjectURL(contratoUrl);
        } catch {}
      }
    };
  }, [contratoUrl]);

  const handleVerContrato = async () => {
    if (!selectedJugadorId) {
      return;
    }

    setContratoError("");

    if (contratoUrl) {
      try {
        window.open(contratoUrl, "_blank", "noopener,noreferrer");
      } catch {}

      return;
    }

    setContratoLoading(true);

    try {
      const response = await api.get(
        `/portal-apoderado/jugadores/id/${encodeURIComponent(String(selectedJugadorId))}/contrato`,
        {
          responseType: "blob",

          headers: authHeaders(),
        }
      );

      const contentType = response?.headers?.["content-type"] ?? response?.headers?.["Content-Type"] ?? "";

      if (contentType && !String(contentType).toLowerCase().includes("application/pdf")) {
        throw new Error("El archivo recibido no es un PDF.");
      }

      const url = URL.createObjectURL(response.data);

      setContratoUrl(url);

      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {}
    } catch (err) {
      const status = getErrStatus(err);

      const message = getErrMsg(err);

      if (status === 401) {
        goLogin();
        return;
      }

      if (status === 403) {
        setContratoError("Debes cambiar tu contraseña para continuar.");

        return;
      }

      if (status === 404) {
        setContratoError("Este jugador aún no tiene contrato registrado.");

        return;
      }

      setContratoError(message);
    } finally {
      setContratoLoading(false);
    }
  };

  /* =======================================================
     DATOS DERIVADOS
  ======================================================= */

  const jugadorSel = useMemo(
    () => jugadores.find((player) => Number(player?.id) === Number(selectedJugadorId)) ?? jugadores[0] ?? null,
    [jugadores, selectedJugadorId]
  );

  const jugador = detalle?.jugador ?? jugadorSel ?? null;

  const deporteId = Number(jugador?.deporte_id ?? jugadorSel?.deporte_id ?? 0) || 0;

  const sportConfig = useMemo(() => getSportConfig(deporteId), [deporteId]);

  const statGroups = useMemo(() => getGroupsForSport(deporteId), [deporteId]);

  const estadisticas = useMemo(() => {
    if (detalle?.estadisticas_joined) {
      return flattenJoinedForSport(detalle.estadisticas_joined, deporteId);
    }

    if (detalle?.estadisticas && typeof detalle.estadisticas === "object") {
      return detalle.estadisticas;
    }

    return {};
  }, [detalle, deporteId]);

  const tieneEstadisticas = Boolean(detalle?.tiene_estadisticas);

  const pagos = useMemo(() => (Array.isArray(detalle?.pagos) ? detalle.pagos : []), [detalle]);

  const pagosPagados = useMemo(() => pagos.filter((pago) => normalizeSituacion(pago) === "PAGADO"), [pagos]);

  const totalPagado = useMemo(
    () => pagosPagados.reduce((accumulator, pago) => accumulator + safeNumber(pago?.monto_total ?? pago?.monto, 0), 0),
    [pagosPagados]
  );

  const lastPago = useMemo(() => {
    const withDate = pagos
      .filter((pago) => pago?.fecha_pago)
      .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime());

    return withDate[0] ?? null;
  }, [pagos]);

  const topPagos = useMemo(
    () =>
      [...pagos]
        .sort(
          (a, b) =>
            new Date(b?.fecha_pago ?? b?.created_at ?? 0).getTime() -
            new Date(a?.fecha_pago ?? a?.created_at ?? 0).getTime()
        )
        .slice(0, 5)
        .map((pago) => ({
          ...pago,

          conceptos: getPaymentConcepts(pago),

          situacion: normalizeSituacion(pago),
        })),
    [pagos]
  );

  const kpis = useMemo(() => {
    const descriptors = SPORT_KPIS[deporteId] || [
      {
        label: "Partidos",
        key: "partidos_jugados",
      },
      {
        label: "Minutos",
        key: "minutos_jugados",
      },
      {
        label: "Lesiones",
        key: "lesiones",
      },
      {
        label: "Sanciones",
        key: "sanciones_federativas",
      },
    ];

    return descriptors.map((descriptor, index) => ({
      ...descriptor,

      value: resolveKpiValue(estadisticas, descriptor),

      color: VIVID_COLORS[index % VIVID_COLORS.length],
    }));
  }, [deporteId, estadisticas]);

  const chartData = useMemo(
    () =>
      kpis.map((kpi) => ({
        name: kpi.label,

        value: Number(kpi.value ?? 0),
      })),
    [kpis]
  );

  const sucursales = useMemo(() => {
    const source = Array.isArray(jugador?.sucursales)
      ? jugador.sucursales
      : Array.isArray(jugadorSel?.sucursales)
        ? jugadorSel.sucursales
        : [];

    if (source.length > 0) {
      return source;
    }

    const legacy = jugador?.sucursal ?? jugadorSel?.sucursal ?? null;

    return legacy ? [legacy] : [];
  }, [jugador, jugadorSel]);

  const tieneContratoFlag = Boolean(jugador?.tiene_contrato) || Boolean(jugadorSel?.tiene_contrato);

  const academiaNombre = jugador?.academia?.nombre ?? jugadorSel?.academia?.nombre ?? "Academia sin nombre";

  const deporteNombre = jugador?.deporte?.nombre ?? jugadorSel?.deporte?.nombre ?? sportConfig.nombre;

  /* =======================================================
     UI
  ======================================================= */

  const pageStyle = {
    color: tokens.text,
    backgroundColor: darkMode ? "#111111" : "#F5F1EA",
  };

  const surfaceStyle = {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    color: tokens.text,
  };

  const softSurfaceStyle = {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    color: tokens.text,
  };

  const surface2Style = {
    backgroundColor: tokens.surface2,
    borderColor: tokens.borderStrong ?? tokens.border,
    color: tokens.text,
  };

  const titleWelcome = apoderadoNombre ? `Bienvenido ${apoderadoNombre}` : "Bienvenido Apoderado";

  if (bootLoading) {
    return <IsLoading />;
  }

  return (
    <div className="min-h-screen w-full font-sans antialiased" style={pageStyle}>
      <div className="w-full px-3 sm:px-5 lg:px-7 2xl:px-10 py-5 sm:py-7">
        {/* =================================================
            TOPBAR
        ================================================= */}

        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg"
                style={{
                  background: "linear-gradient(135deg,#F97316,#EF4444)",
                }}
              >
                <Trophy size={24} className="text-white" />
              </div>

              <div>
                <p
                  className="text-[10px] sm:text-xs font-black tracking-[0.3em] uppercase"
                  style={{
                    color: tokens.textMuted,
                  }}
                >
                  Portal de Apoderados
                </p>

                <h1
                  className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight"
                  style={{
                    color: tokens.text,
                  }}
                >
                  {titleWelcome}
                </h1>
              </div>
            </div>

            <p
              className="mt-3 text-sm font-semibold"
              style={{
                color: tokens.textMuted,
              }}
            >
              Toda la información deportiva, financiera y administrativa de tus jugadores en un solo lugar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="h-11 w-11 rounded-xl border flex items-center justify-center transition hover:-translate-y-0.5"
              style={surfaceStyle}
              title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {darkMode ? (
                <FiSun
                  size={19}
                  style={{
                    color: "#F59E0B",
                  }}
                />
              ) : (
                <FiMoon
                  size={19}
                  style={{
                    color: "#8B5CF6",
                  }}
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("/portal-apoderado/configuracion")}
              className="h-11 rounded-xl border px-4 font-extrabold transition inline-flex items-center gap-2 hover:-translate-y-0.5"
              style={surfaceStyle}
            >
              <FiSettings
                size={18}
                style={{
                  color: "#8B5CF6",
                }}
              />

              <span className="hidden sm:inline">Configuración</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="h-11 rounded-xl px-4 font-extrabold text-white transition inline-flex items-center gap-2 hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(135deg,${ACCENT},#EF4444)`,
              }}
              title="Cerrar sesión"
            >
              <FiLogOut size={18} />

              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* =================================================
            ERROR GLOBAL
        ================================================= */}

        {error ? (
          <div
            className="mt-5 rounded-2xl border p-4 font-extrabold"
            style={{
              borderColor: darkMode ? "rgba(248,113,113,.28)" : "#FECACA",

              backgroundColor: darkMode ? "rgba(239,68,68,.10)" : "#FEF2F2",

              color: darkMode ? "#FCA5A5" : "#B91C1C",
            }}
          >
            {error}
          </div>
        ) : null}

        {/* =================================================
            LAYOUT
        ================================================= */}

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
          {/* =================================================
              SIDEBAR JUGADORES
          ================================================= */}

          <aside
            className="rounded-[28px] border p-4 sm:p-5 shadow-[0_20px_70px_rgba(0,0,0,0.09)] xl:sticky xl:top-5 xl:self-start"
            style={surfaceStyle}
          >
            <div className="flex items-start justify-between gap-3">
              <SectionTitle
                icon={UserRound}
                eyebrow="Mis jugadores"
                title="Selecciona una inscripción"
                tokens={tokens}
                accent="#F97316"
              />

              <Pill tokens={tokens} accent="#8B5CF6">
                {jugadores.length}
              </Pill>
            </div>

            {jugadores.length === 0 ? (
              <div className="mt-5 rounded-2xl border p-4 text-sm font-semibold" style={softSurfaceStyle}>
                No hay jugadores asociados a este apoderado.
              </div>
            ) : (
              <div className="mt-5 space-y-3 xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto xl:pr-1">
                {jugadores.map((item, index) => {
                  const id = Number(item?.id);

                  const active = id === Number(selectedJugadorId);

                  const itemSport = getSportConfig(item?.deporte_id);

                  const itemSucursales = Array.isArray(item?.sucursales) ? item.sucursales : [];

                  const cardAccent = VIVID_COLORS[index % VIVID_COLORS.length];

                  return (
                    <button
                      key={id || `${item?.rut_jugador}-${index}`}
                      type="button"
                      onClick={() => setSelectedJugadorId(id)}
                      className="w-full text-left rounded-3xl border p-4 transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        backgroundColor: active ? `${cardAccent}12` : tokens.surfaceSoft,

                        borderColor: active ? `${cardAccent}70` : tokens.border,

                        boxShadow: active ? `0 14px 35px ${cardAccent}14` : "none",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center font-black text-white"
                          style={{
                            background: `linear-gradient(135deg,${cardAccent},${cardAccent}CC)`,
                          }}
                        >
                          {String(item?.nombre_jugador ?? "J")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className="font-black text-sm sm:text-base truncate"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {item?.nombre_jugador || "Sin nombre"}
                          </p>

                          <p
                            className="mt-0.5 text-xs font-bold"
                            style={{
                              color: cardAccent,
                            }}
                          >
                            {item?.deporte?.nombre || itemSport.nombre}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <Building2
                            size={14}
                            className="mt-0.5 shrink-0"
                            style={{
                              color: tokens.textMuted,
                            }}
                          />

                          <span
                            className="text-xs font-semibold"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            {item?.academia?.nombre || "Academia no informada"}
                          </span>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin
                            size={14}
                            className="mt-0.5 shrink-0"
                            style={{
                              color: tokens.textMuted,
                            }}
                          />

                          <span
                            className="text-xs font-semibold"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            {itemSucursales.length > 0
                              ? itemSucursales
                                  .map((sucursal) => sucursal?.nombre)
                                  .filter(Boolean)
                                  .join(" · ")
                              : item?.sucursal?.nombre || "Sin sucursal"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item?.categoria?.nombre ? <Pill tokens={tokens}>{item.categoria.nombre}</Pill> : null}

                        {item?.estado?.nombre ? (
                          <Pill tokens={tokens} accent="#10B981">
                            {item.estado.nombre}
                          </Pill>
                        ) : null}

                        {item?.tiene_contrato ? (
                          <Pill tokens={tokens} accent="#8B5CF6">
                            Contrato
                          </Pill>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* =================================================
              CONTENIDO PRINCIPAL
          ================================================= */}

          <main
            className="rounded-[28px] border p-4 sm:p-6 lg:p-7 shadow-[0_20px_70px_rgba(0,0,0,0.09)] min-w-0"
            style={surfaceStyle}
          >
            {!jugador ? (
              <div className="min-h-[420px] flex items-center justify-center">
                {detalleLoading ? (
                  <IsLoading />
                ) : (
                  <p
                    className="font-semibold"
                    style={{
                      color: tokens.textMuted,
                    }}
                  >
                    Selecciona un jugador para ver su información.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* =============================================
                    CABECERA JUGADOR
                ============================================= */}

                <section
                  className="relative overflow-hidden rounded-[26px] border p-5 sm:p-6"
                  style={{
                    ...surface2Style,
                    background: darkMode
                      ? "linear-gradient(135deg,rgba(249,115,22,.14),rgba(139,92,246,.08))"
                      : "linear-gradient(135deg,#FFF7ED,#F5F3FF)",
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 h-48 w-48 rounded-full"
                    style={{
                      backgroundColor: "rgba(249,115,22,.10)",
                    }}
                  />

                  <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Pill tokens={tokens} accent="#F97316">
                          <Trophy size={13} className="mr-1.5" />

                          {deporteNombre}
                        </Pill>

                        <Pill tokens={tokens} accent="#8B5CF6">
                          <Building2 size={13} className="mr-1.5" />

                          {academiaNombre}
                        </Pill>

                        {jugador?.estado?.nombre ? (
                          <Pill tokens={tokens} accent="#10B981">
                            {jugador.estado.nombre}
                          </Pill>
                        ) : null}
                      </div>

                      <h2
                        className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight"
                        style={{
                          color: tokens.text,
                        }}
                      >
                        {jugador?.nombre_jugador || "Jugador"}
                      </h2>

                      <p
                        className="mt-1 text-sm font-semibold"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        RUT:{" "}
                        <span
                          className="font-extrabold"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {jugador?.rut_jugador || "—"}
                        </span>
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {sucursales.length > 0 ? (
                          sucursales.map((sucursal) => (
                            <Pill key={sucursal?.id ?? sucursal?.nombre} tokens={tokens} accent="#14B8A6">
                              <MapPin size={13} className="mr-1.5" />

                              {sucursal?.nombre || "Sucursal"}
                            </Pill>
                          ))
                        ) : (
                          <Pill tokens={tokens}>Sin sucursal informada</Pill>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:min-w-[360px]">
                      <div className="rounded-2xl border p-4" style={surfaceStyle}>
                        <p
                          className="text-[10px] uppercase tracking-[0.22em] font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Último pago
                        </p>

                        <p
                          className="mt-1 text-lg font-black"
                          style={{
                            color: "#F97316",
                          }}
                        >
                          {lastPago ? fmtDate(lastPago.fecha_pago) : "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl border p-4" style={surfaceStyle}>
                        <p
                          className="text-[10px] uppercase tracking-[0.22em] font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Total pagado
                        </p>

                        <p
                          className="mt-1 text-lg font-black"
                          style={{
                            color: "#10B981",
                          }}
                        >
                          {fmtCLP(totalPagado)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* =============================================
                    KPIS
                ============================================= */}

                <section className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <SectionTitle
                      icon={Activity}
                      eyebrow="Rendimiento"
                      title={`Resumen de ${sportConfig.nombre}`}
                      tokens={tokens}
                      accent="#EF4444"
                    />

                    {detalleLoading ? (
                      <Pill tokens={tokens} accent="#F59E0B">
                        Cargando…
                      </Pill>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {kpis.map((kpi) => (
                      <KpiCard
                        key={kpi.label}
                        title={kpi.label}
                        value={formatStatValue(kpi.key || "", kpi.value)}
                        subtitle={tieneEstadisticas ? sportConfig.nombre : "Sin registros aún"}
                        color={kpi.color}
                      />
                    ))}
                  </div>
                </section>

                {/* =============================================
                    GRÁFICO + PAGOS
                ============================================= */}

                <div className="mt-5 grid grid-cols-1 2xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,.75fr)] gap-5">
                  {/* GRÁFICO */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={Sparkles}
                      eyebrow="Vista rápida"
                      title="Indicadores principales"
                      tokens={tokens}
                      accent="#8B5CF6"
                    />

                    {!tieneEstadisticas ? (
                      <div className="mt-5 rounded-2xl border p-5 text-sm font-semibold" style={surfaceStyle}>
                        <p
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Aún no existen estadísticas registradas para este jugador.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} opacity={0.65} />

                            <XAxis
                              dataKey="name"
                              tick={{
                                fill: tokens.textMuted,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                              axisLine={{
                                stroke: tokens.border,
                              }}
                              tickLine={false}
                            />

                            <YAxis
                              tick={{
                                fill: tokens.textMuted,
                                fontSize: 11,
                              }}
                              axisLine={{
                                stroke: tokens.border,
                              }}
                              tickLine={false}
                            />

                            <Tooltip
                              cursor={{
                                fill: `${ACCENT}0D`,
                              }}
                              contentStyle={{
                                backgroundColor: tokens.surface,
                                border: `1px solid ${tokens.border}`,
                                borderRadius: "14px",
                                color: tokens.text,
                              }}
                            />

                            <Bar dataKey="value" fill={ACCENT} radius={[12, 12, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </section>

                  {/* PAGOS */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={CircleDollarSign}
                      eyebrow="Finanzas"
                      title="Últimos pagos"
                      tokens={tokens}
                      accent="#10B981"
                    />

                    {topPagos.length === 0 ? (
                      <p
                        className="mt-5 text-sm font-semibold"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        No hay pagos registrados para esta inscripción.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {topPagos.map((pago) => (
                          <div key={pago?.id} className="rounded-2xl border p-4" style={surfaceStyle}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p
                                  className="text-sm font-black"
                                  style={{
                                    color: tokens.text,
                                  }}
                                >
                                  {fmtDate(pago?.fecha_pago)}
                                </p>

                                <p
                                  className="mt-0.5 text-xs font-semibold"
                                  style={{
                                    color: tokens.textMuted,
                                  }}
                                >
                                  {pago?.medio_pago?.nombre || "Medio de pago no informado"}
                                </p>
                              </div>

                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getPagoStatusStyle(
                                  pago.situacion,
                                  darkMode
                                )}`}
                              >
                                {pago.situacion}
                              </span>
                            </div>

                            {pago.conceptos.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {pago.conceptos.map((concepto) => (
                                  <div key={concepto.id} className="flex items-center justify-between gap-3 text-xs">
                                    <span
                                      className="font-semibold"
                                      style={{
                                        color: tokens.textMuted,
                                      }}
                                    >
                                      {concepto.nombre}
                                    </span>

                                    <span
                                      className="font-extrabold"
                                      style={{
                                        color: tokens.text,
                                      }}
                                    >
                                      {fmtCLP(concepto.monto)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p
                                className="mt-3 text-xs font-semibold"
                                style={{
                                  color: tokens.textMuted,
                                }}
                              >
                                Sin desglose de conceptos.
                              </p>
                            )}

                            <div
                              className="mt-3 pt-3 border-t flex items-center justify-between gap-3"
                              style={{
                                borderColor: tokens.border,
                              }}
                            >
                              <span
                                className="text-xs font-bold"
                                style={{
                                  color: tokens.textMuted,
                                }}
                              >
                                Total
                              </span>

                              <span
                                className="font-black"
                                style={{
                                  color: "#10B981",
                                }}
                              >
                                {fmtCLP(pago?.monto_total ?? pago?.monto)}
                              </span>
                            </div>

                            {pago?.plan?.nombre ? (
                              <div className="mt-2">
                                <Pill tokens={tokens} accent="#8B5CF6">
                                  {pago.plan.nombre}
                                </Pill>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* =============================================
                    INFORMACIÓN GENERAL
                ============================================= */}

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
                  {/* DATOS DEPORTIVOS */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={Trophy}
                      eyebrow="Inscripción"
                      title="Información deportiva"
                      tokens={tokens}
                      accent="#F97316"
                    />

                    <div className="mt-4">
                      <DataRow label="Academia" value={academiaNombre} tokens={tokens} />

                      <DataRow label="Deporte" value={deporteNombre} tokens={tokens} />

                      <DataRow label="Categoría" value={jugador?.categoria?.nombre} tokens={tokens} />

                      <DataRow label="Posición" value={jugador?.posicion?.nombre} tokens={tokens} />

                      <DataRow label="Estado" value={jugador?.estado?.nombre} tokens={tokens} />
                    </div>

                    <div className="mt-4">
                      <p
                        className="text-[10px] uppercase tracking-[0.22em] font-black"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Sucursales
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {sucursales.length > 0 ? (
                          sucursales.map((sucursal) => (
                            <Pill key={sucursal?.id ?? sucursal?.nombre} tokens={tokens} accent="#14B8A6">
                              {sucursal?.nombre}
                            </Pill>
                          ))
                        ) : (
                          <span
                            className="text-sm font-semibold"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Sin sucursales registradas.
                          </span>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* DATOS PERSONALES */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={UserRound}
                      eyebrow="Ficha"
                      title="Datos personales"
                      tokens={tokens}
                      accent="#8B5CF6"
                    />

                    <div className="mt-4">
                      <DataRow label="Fecha de nacimiento" value={fmtDate(jugador?.fecha_nacimiento)} tokens={tokens} />

                      <DataRow
                        label="Edad"
                        value={jugador?.edad != null ? `${jugador.edad} años` : "—"}
                        tokens={tokens}
                      />

                      <DataRow label="Comuna" value={jugador?.comuna?.nombre} tokens={tokens} />

                      <DataRow label="Dirección" value={jugador?.direccion} tokens={tokens} />

                      <DataRow
                        label="Establecimiento educacional"
                        value={jugador?.establec_educ?.nombre}
                        tokens={tokens}
                      />

                      <DataRow label="Previsión médica" value={jugador?.prevision_medica?.nombre} tokens={tokens} />
                    </div>
                  </section>

                  {/* DATOS FÍSICOS */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={Dumbbell}
                      eyebrow="Ficha física"
                      title="Antecedentes del jugador"
                      tokens={tokens}
                      accent="#EF4444"
                    />

                    <div className="mt-4">
                      <DataRow
                        label="Peso"
                        value={jugador?.peso != null ? `${jugador.peso} kg` : "—"}
                        tokens={tokens}
                      />

                      <DataRow
                        label="Estatura"
                        value={jugador?.estatura != null ? `${jugador.estatura} cm` : "—"}
                        tokens={tokens}
                      />

                      <DataRow label="Talla polera" value={jugador?.talla_polera} tokens={tokens} />

                      <DataRow label="Talla short" value={jugador?.talla_short} tokens={tokens} />

                      <DataRow label="Observaciones" value={jugador?.observaciones} tokens={tokens} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {jugador?.peso ? (
                        <Pill tokens={tokens} accent="#F97316">
                          <Weight size={13} className="mr-1.5" />
                          {jugador.peso} kg
                        </Pill>
                      ) : null}

                      {jugador?.estatura ? (
                        <Pill tokens={tokens} accent="#14B8A6">
                          <Ruler size={13} className="mr-1.5" />
                          {jugador.estatura} cm
                        </Pill>
                      ) : null}

                      {jugador?.talla_polera ? (
                        <Pill tokens={tokens} accent="#8B5CF6">
                          <Shirt size={13} className="mr-1.5" />
                          Polera {jugador.talla_polera}
                        </Pill>
                      ) : null}
                    </div>
                  </section>

                  {/* CONTACTO */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={Phone}
                      eyebrow="Contacto"
                      title="Datos de contacto"
                      tokens={tokens}
                      accent="#14B8A6"
                    />

                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border p-3 flex gap-3" style={surfaceStyle}>
                        <Phone
                          size={18}
                          style={{
                            color: "#14B8A6",
                          }}
                        />

                        <div>
                          <p
                            className="text-[10px] uppercase tracking-wider font-black"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Teléfono jugador
                          </p>

                          <p
                            className="mt-1 text-sm font-extrabold"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {jugador?.telefono || "No informado"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border p-3 flex gap-3" style={surfaceStyle}>
                        <Mail
                          size={18}
                          style={{
                            color: "#8B5CF6",
                          }}
                        />

                        <div className="min-w-0">
                          <p
                            className="text-[10px] uppercase tracking-wider font-black"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Email jugador
                          </p>

                          <p
                            className="mt-1 text-sm font-extrabold break-all"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {jugador?.email || "No informado"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border p-3 flex gap-3" style={surfaceStyle}>
                        <ShieldCheck
                          size={18}
                          style={{
                            color: "#F97316",
                          }}
                        />

                        <div>
                          <p
                            className="text-[10px] uppercase tracking-wider font-black"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Apoderado registrado
                          </p>

                          <p
                            className="mt-1 text-sm font-extrabold"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {jugador?.nombre_apoderado || apoderadoNombre || "—"}
                          </p>

                          <p
                            className="mt-0.5 text-xs font-semibold"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            {jugador?.telefono_apoderado || "Teléfono no informado"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* CONTRATO */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={FileText}
                      eyebrow="Documentación"
                      title="Contrato de prestación"
                      tokens={tokens}
                      accent="#F59E0B"
                    />

                    <div className="mt-4 rounded-2xl border p-4" style={surfaceStyle}>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p
                            className="font-extrabold"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {tieneContratoFlag ? "Contrato disponible" : "Sin contrato registrado"}
                          </p>

                          <p
                            className="mt-1 text-xs font-semibold"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Documento asociado a esta inscripción.
                          </p>
                        </div>

                        <div
                          className="h-11 w-11 rounded-2xl flex items-center justify-center"
                          style={{
                            backgroundColor: tieneContratoFlag ? "rgba(245,158,11,.14)" : tokens.surfaceSoft,
                            color: tieneContratoFlag ? "#F59E0B" : tokens.textMuted,
                          }}
                        >
                          <FileText size={21} />
                        </div>
                      </div>

                      {contratoError ? (
                        <div
                          className="mt-3 rounded-xl border p-3 text-xs font-bold"
                          style={{
                            borderColor: "#EF444450",
                            backgroundColor: "#EF444412",
                            color: "#EF4444",
                          }}
                        >
                          {contratoError}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleVerContrato}
                        disabled={contratoLoading || !tieneContratoFlag}
                        className="mt-4 w-full h-11 rounded-xl font-extrabold transition text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: tieneContratoFlag ? "linear-gradient(135deg,#F59E0B,#F97316)" : tokens.border,
                        }}
                      >
                        {contratoLoading ? "Cargando..." : tieneContratoFlag ? "Ver contrato" : "No disponible"}
                      </button>
                    </div>
                  </section>

                  {/* AGENDA */}

                  <section className="rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                    <SectionTitle
                      icon={CalendarDays}
                      eyebrow="Próximamente"
                      title="Agenda"
                      tokens={tokens}
                      accent="#EC4899"
                    />

                    {agendaLoading ? (
                      <p
                        className="mt-4 text-sm font-semibold"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Cargando agenda…
                      </p>
                    ) : agendaError ? (
                      <p className="mt-4 text-sm font-bold text-red-500">{agendaError}</p>
                    ) : agendaItems.length === 0 ? (
                      <p
                        className="mt-4 text-sm font-semibold"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        No existen eventos próximos.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {agendaItems.slice(0, 6).map((event) => (
                          <div key={event.id} className="rounded-2xl border p-3" style={surfaceStyle}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className="text-sm font-extrabold truncate"
                                  style={{
                                    color: tokens.text,
                                  }}
                                  title={event.titulo}
                                >
                                  {event.titulo}
                                </p>

                                {event.descripcion ? (
                                  <p
                                    className="mt-1 text-xs font-semibold line-clamp-2"
                                    style={{
                                      color: tokens.textMuted,
                                    }}
                                  >
                                    {event.descripcion}
                                  </p>
                                ) : null}
                              </div>

                              <Pill tokens={tokens} accent="#EC4899">
                                {event.when}
                              </Pill>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* =============================================
                    ESTADÍSTICAS COMPLETAS POR DEPORTE
                ============================================= */}

                <section className="mt-5 rounded-[26px] border p-4 sm:p-5 lg:p-6" style={softSurfaceStyle}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <SectionTitle
                      icon={Award}
                      eyebrow="Detalle completo"
                      title={`Estadísticas de ${sportConfig.nombre}`}
                      tokens={tokens}
                      accent="#F97316"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Pill tokens={tokens} accent="#8B5CF6">
                        {sportConfig.nombre}
                      </Pill>

                      {tieneEstadisticas ? (
                        <Pill tokens={tokens} accent="#10B981">
                          Con estadísticas
                        </Pill>
                      ) : (
                        <Pill tokens={tokens} accent="#F59E0B">
                          Sin estadísticas
                        </Pill>
                      )}
                    </div>
                  </div>

                  {!tieneEstadisticas ? (
                    <div className="mt-5 rounded-2xl border p-5" style={surfaceStyle}>
                      <p
                        className="text-sm font-semibold"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Todavía no existen estadísticas acumuladas para este jugador en {sportConfig.nombre}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                      {Object.entries(statGroups).map(([groupName, fields], groupIndex) => {
                        const color = VIVID_COLORS[groupIndex % VIVID_COLORS.length];

                        return (
                          <div
                            key={groupName}
                            className="rounded-3xl border p-4"
                            style={{
                              ...surfaceStyle,
                              borderColor: `${color}38`,
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="h-9 w-9 rounded-xl flex items-center justify-center"
                                style={{
                                  backgroundColor: `${color}16`,
                                  color,
                                }}
                              >
                                {groupName === "Base / Generales" ? <Activity size={18} /> : <Trophy size={18} />}
                              </div>

                              <div>
                                <h4
                                  className="font-black"
                                  style={{
                                    color: tokens.text,
                                  }}
                                >
                                  {groupName}
                                </h4>

                                {groupName === "Base / Generales" ? (
                                  <p
                                    className="text-[10px] font-semibold"
                                    style={{
                                      color: tokens.textMuted,
                                    }}
                                  >
                                    Común a todos los deportes
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4">
                              {fields.map((field) => (
                                <div
                                  key={field}
                                  className="flex items-center justify-between gap-4 py-2.5 border-t first:border-t-0"
                                  style={{
                                    borderColor: tokens.border,
                                  }}
                                >
                                  <span
                                    className="text-xs sm:text-sm font-semibold"
                                    style={{
                                      color: tokens.textMuted,
                                    }}
                                  >
                                    {prettyField(field)}
                                  </span>

                                  <span
                                    className="text-sm font-black whitespace-nowrap"
                                    style={{
                                      color,
                                    }}
                                  >
                                    {formatStatValue(field, estadisticas?.[field] ?? 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* =============================================
                    RESUMEN VISUAL INFERIOR
                ============================================= */}

                <section className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-3xl border p-4" style={surfaceStyle}>
                    <div className="flex items-center gap-3">
                      <Building2
                        size={20}
                        style={{
                          color: "#8B5CF6",
                        }}
                      />

                      <div>
                        <p
                          className="text-[10px] uppercase tracking-wider font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Academia
                        </p>

                        <p
                          className="mt-1 font-extrabold"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {academiaNombre}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border p-4" style={surfaceStyle}>
                    <div className="flex items-center gap-3">
                      <MapPin
                        size={20}
                        style={{
                          color: "#14B8A6",
                        }}
                      />

                      <div>
                        <p
                          className="text-[10px] uppercase tracking-wider font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Sucursales
                        </p>

                        <p
                          className="mt-1 font-extrabold"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {sucursales.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border p-4" style={surfaceStyle}>
                    <div className="flex items-center gap-3">
                      <CreditCard
                        size={20}
                        style={{
                          color: "#10B981",
                        }}
                      />

                      <div>
                        <p
                          className="text-[10px] uppercase tracking-wider font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Pagos registrados
                        </p>

                        <p
                          className="mt-1 font-extrabold"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {pagos.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border p-4" style={surfaceStyle}>
                    <div className="flex items-center gap-3">
                      <HeartPulse
                        size={20}
                        style={{
                          color: "#EF4444",
                        }}
                      />

                      <div>
                        <p
                          className="text-[10px] uppercase tracking-wider font-black"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Previsión
                        </p>

                        <p
                          className="mt-1 font-extrabold"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {jugador?.prevision_medica?.nombre || "No informada"}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* =============================================
                    DATOS EXTRA
                ============================================= */}

                <section className="mt-5 rounded-[26px] border p-4 sm:p-5" style={softSurfaceStyle}>
                  <SectionTitle
                    icon={GraduationCap}
                    eyebrow="Información complementaria"
                    title="Antecedentes registrados"
                    tokens={tokens}
                    accent="#8B5CF6"
                  />

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-2xl border p-4" style={surfaceStyle}>
                      <MapPin
                        size={19}
                        style={{
                          color: "#14B8A6",
                        }}
                      />

                      <p
                        className="mt-3 text-[10px] uppercase tracking-wider font-black"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Comuna
                      </p>

                      <p
                        className="mt-1 font-extrabold"
                        style={{
                          color: tokens.text,
                        }}
                      >
                        {jugador?.comuna?.nombre || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border p-4" style={surfaceStyle}>
                      <GraduationCap
                        size={19}
                        style={{
                          color: "#8B5CF6",
                        }}
                      />

                      <p
                        className="mt-3 text-[10px] uppercase tracking-wider font-black"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Colegio
                      </p>

                      <p
                        className="mt-1 font-extrabold"
                        style={{
                          color: tokens.text,
                        }}
                      >
                        {jugador?.establec_educ?.nombre || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border p-4" style={surfaceStyle}>
                      <HeartPulse
                        size={19}
                        style={{
                          color: "#EF4444",
                        }}
                      />

                      <p
                        className="mt-3 text-[10px] uppercase tracking-wider font-black"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Salud
                      </p>

                      <p
                        className="mt-1 font-extrabold"
                        style={{
                          color: tokens.text,
                        }}
                      >
                        {jugador?.prevision_medica?.nombre || "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl border p-4" style={surfaceStyle}>
                      <ShieldCheck
                        size={19}
                        style={{
                          color: "#10B981",
                        }}
                      />

                      <p
                        className="mt-3 text-[10px] uppercase tracking-wider font-black"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        Contrato
                      </p>

                      <p
                        className="mt-1 font-extrabold"
                        style={{
                          color: tokens.text,
                        }}
                      >
                        {tieneContratoFlag ? "Registrado" : "No registrado"}
                      </p>
                    </div>
                  </div>
                </section>

                {contratoUrl ? (
                  <p
                    className="mt-4 text-xs font-semibold"
                    style={{
                      color: tokens.textMuted,
                    }}
                  >
                    El contrato permanecerá disponible durante esta sesión para evitar descargarlo nuevamente.
                  </p>
                ) : null}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
