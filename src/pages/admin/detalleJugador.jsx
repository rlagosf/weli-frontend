// src/pages/admin/detalleJugador.jsx
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";
import { FiEdit, FiX } from "react-icons/fi";
import { FileText } from "lucide-react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/* =======================
   🎨 Conjunto X
======================= */
const PALETTE = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};
const ACCENT = PALETTE.copper;

/* ─────────────────────────────
   Helpers base
───────────────────────────── */
const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  return [];
};

const unwrapOne = (raw) => {
  if (!raw) return null;

  if (raw?.item && typeof raw.item === "object") return raw.item;

  const d = raw?.data ?? raw;
  if (d && typeof d === "object") {
    if (d.item && typeof d.item === "object") return d.item;
    if (Array.isArray(d.items) && d.items.length > 0) return d.items[0];
    if (!Array.isArray(d) && Object.keys(d).length > 0 && !("ok" in d) && !("items" in d)) return d;
  }

  if (Array.isArray(raw?.items) && raw.items.length > 0) return raw.items[0];

  if (
    !Array.isArray(raw) &&
    typeof raw === "object" &&
    Object.keys(raw).length > 0 &&
    !("ok" in raw) &&
    !("items" in raw)
  ) {
    return raw;
  }

  return null;
};

const normalizeCatalog = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      id: Number(
        x?.id ??
          x?.posicion_id ??
          x?.categoria_id ??
          x?.establec_educ_id ??
          x?.prevision_medica_id ??
          x?.estado_id ??
          x?.sucursal_id ??
          x?.comuna_id
      ),
      nombre: String(x?.nombre ?? x?.descripcion ?? "").trim(),
    }))
    .filter((x) => Number.isFinite(x.id) && x.nombre);

const buildFotoDataUrl = (j) => {
  const b64 = j?.foto_base64;
  const mime = j?.foto_mime;
  if (!b64 || !mime) return null;
  return `data:${mime};base64,${b64}`;
};

/* ─────────────────────────────
   Estadísticas multi-deporte
───────────────────────────── */
const safeNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const flattenJoinedStats = (payload) => {
  const base = payload?.base && typeof payload.base === "object" ? payload.base : {};
  const sport = payload?.sport && typeof payload.sport === "object" ? payload.sport : {};
  const merged = { ...base, ...sport };

  if (merged?.stats_id == null && merged?.id != null) merged.stats_id = merged.id;

  const out = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v == null) {
      out[k] = v;
      continue;
    }
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : v;
  }
  return out;
};

const BASE_STATS = {
  "Base / Generales": [
    "minutos_jugados",
    "partidos_jugados",
    "lesiones",
    "dias_baja",
    "sanciones_federativas",
  ],
};

const SPORT_STATS = {
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
      Defensivas: [
        "intercepciones",
        "despejes",
        "duelos_ganados",
        "entradas_exitosas",
        "bloqueos",
        "recuperaciones",
      ],
      Técnicas: [
        "pases_completados",
        "pases_errados",
        "posesion_perdida",
        "offsides",
        "faltas_cometidas",
        "faltas_recibidas",
      ],
      Físicas: [
        "distancia_recorrida_km",
        "sprints",
        "duelos_aereos_ganados",
      ],
      Disciplina: [
        "tarjetas_amarillas",
        "tarjetas_rojas",
        "torneos_convocados",
        "titular_partidos",
      ],
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
      Servicio: [
        "primer_servicio_pct",
        "puntos_primer_servicio",
        "puntos_segundo_servicio",
        "aces",
        "dobles_faltas",
      ],
      "Break Points": ["break_points_oportunidades", "break_points_convertidos"],
      Juego: ["winners", "errores_no_forzados", "peloteos_cortos_ganados"],
      Totales: ["puntos_ganados_total", "juegos_ganados_total"],
    },
  },
  4: {
    nombre: "Pádel",
    grupos: {
      Servicio: ["primer_saque_pct", "puntos_primer_saque", "puntos_segundo_saque"],
      "Puntos de Oro": [
        "puntos_oro_jugados",
        "puntos_oro_ganados",
        "puntos_oro_ganados_con_saque",
      ],
      Precisión: ["errores_no_forzados", "errores_forzados", "winners"],
      Posicionamiento: ["tiempo_red_pct", "tiempo_fondo_pct", "puntos_red_ganados"],
      Voleas: ["voleas_total", "voleas_ganadoras", "voleas_errores"],
      Remates: ["remates_total", "remates_ganadores", "remates_errores"],
    },
  },
  5: {
    nombre: "Tenis de mesa",
    grupos: {
      "Servicio / Devolución": [
        "efectividad_servicio_pct",
        "efectividad_devolucion_pct",
        "primer_saque_pct",
      ],
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
};

const FIELD_LABELS = {
  minutos_jugados: "Minutos Jugados",
  partidos_jugados: "Partidos Jugados",
  lesiones: "Lesiones",
  dias_baja: "Días de Baja",
  sanciones_federativas: "Sanciones Federativas",

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
  posesion_perdida: "Posesión Perdida",
  offsides: "Offsides",
  faltas_cometidas: "Faltas Cometidas",
  faltas_recibidas: "Faltas Recibidas",
  distancia_recorrida_km: "Distancia Recorrida (km)",
  sprints: "Sprints",
  duelos_aereos_ganados: "Duelos Aéreos Ganados",
  tarjetas_amarillas: "Tarjetas Amarillas",
  tarjetas_rojas: "Tarjetas Rojas",
  torneos_convocados: "Torneos Convocados",
  titular_partidos: "Partidos como Titular",

  ataque_intentos: "Intentos de Ataque",
  ataque_puntos: "Puntos de Ataque",
  ataque_errores: "Errores de Ataque",
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

  primer_servicio_pct: "Primer Servicio (%)",
  puntos_primer_servicio: "Puntos Primer Servicio",
  puntos_segundo_servicio: "Puntos Segundo Servicio",
  aces: "Aces",
  dobles_faltas: "Dobles Faltas",
  break_points_oportunidades: "Break Points - Oportunidades",
  break_points_convertidos: "Break Points - Convertidos",
  winners: "Winners",
  errores_no_forzados: "Errores No Forzados",
  peloteos_cortos_ganados: "Peloteos Cortos Ganados",
  puntos_ganados_total: "Puntos Ganados",
  juegos_ganados_total: "Juegos Ganados",

  primer_saque_pct: "Primer Saque (%)",
  puntos_primer_saque: "Puntos Primer Saque",
  puntos_segundo_saque: "Puntos Segundo Saque",
  puntos_oro_jugados: "Puntos de Oro Jugados",
  puntos_oro_ganados: "Puntos de Oro Ganados",
  puntos_oro_ganados_con_saque: "Puntos de Oro Ganados con Saque",
  errores_forzados: "Errores Forzados",
  tiempo_red_pct: "Tiempo en Red (%)",
  tiempo_fondo_pct: "Tiempo en Fondo (%)",
  puntos_red_ganados: "Puntos Ganados en Red",
  voleas_total: "Voleas Totales",
  voleas_ganadoras: "Voleas Ganadoras",
  voleas_errores: "Errores de Volea",
  remates_total: "Remates Totales",
  remates_ganadores: "Remates Ganadores",
  remates_errores: "Errores de Remate",

  efectividad_servicio_pct: "Efectividad de Servicio (%)",
  efectividad_devolucion_pct: "Efectividad de Devolución (%)",
  puntos_presion_jugados: "Puntos de Presión Jugados",
  puntos_presion_ganados: "Puntos de Presión Ganados",
  dobles_puntos_jugados: "Puntos de Dobles Jugados",
  dobles_puntos_ganados: "Puntos de Dobles Ganados",
  fc_media: "Frecuencia Cardíaca Media",
  fc_max: "Frecuencia Cardíaca Máxima",
  lactato: "Lactato",

  puntos: "Puntos",
  rebotes_ofensivos: "Rebotes Ofensivos",
  rebotes_defensivos: "Rebotes Defensivos",
  robos: "Robos",
  perdidas: "Pérdidas",
  faltas: "Faltas",
  ts_pct: "True Shooting (%)",
  efg_pct: "eFG (%)",
  usg_pct: "Usage (%)",
  plus_minus: "+/-",
  pir: "PIR",
  per: "PER",
};

const getSportConfig = (deporteId) =>
  SPORT_STATS[Number(deporteId)] || {
    nombre: "Deporte no configurado",
    grupos: {},
  };

const buildStatSections = (estadisticas, deporteId) => {
  if (!estadisticas || typeof estadisticas !== "object") return {};

  const sport = getSportConfig(deporteId);
  const groups = {
    ...BASE_STATS,
    ...sport.grupos,
  };

  const out = {};

  Object.entries(groups).forEach(([groupName, fields]) => {
    out[groupName] = {};

    fields.forEach((field) => {
      out[groupName][FIELD_LABELS[field] || field] = safeNum(estadisticas?.[field], 0);
    });
  });

  return out;
};

/* ─────────────────────────────
   Auth / Scope
───────────────────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAcademiaIdFromStorage = () => {
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

const buildHeadersFallback = (rol) => {
  const token = getToken?.() || "";
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rol === 3) {
    const a = getAcademiaIdFromStorage();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

const tryGetList = async (paths, { signal, headers } = {}) => {
  const variants = [];
  for (const p of paths) {
    variants.push(p.endsWith("/") ? p : `${p}/`);
    variants.push(p.endsWith("/") ? p.slice(0, -1) : p);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, headers });
      return asList(r);
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

const getWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];
  let lastErr = null;

  for (const url of urls) {
    try {
      return await api.get(url, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("GET failed");
};

/* =======================
   CONTRATO: base64 -> PDF
======================= */
const b64ToBlob = (b64, mime = "application/pdf") => {
  const raw = String(b64 || "").trim();
  const clean = raw
    .replace(/^data:application\/pdf;base64,/, "")
    .replace(/^data:.*;base64,/, "")
    .replace(/\s+/g, "");

  if (!clean) throw new Error("Base64 vacío");

  const bytes = atob(clean);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const openBlobUrlLikeHistorico = (blobUrl) => {
  const win = window.open(blobUrl, "_blank", "noopener");
  if (!win) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

export default function DetalleJugador() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { darkMode } = useTheme();

  useMobileAutoScrollTop();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rut = useMemo(() => {
    const fromState = location.state?.rut;
    const fromParams = params?.rut;
    const r = fromState ?? fromParams;
    return r != null ? String(r).trim() : "";
  }, [location.state, params]);

  const parentPath = useMemo(() => {
    if (location.state?.from) return String(location.state.from);
    return String(location.pathname || "")
      .replace(/\/detalle-jugador\/[^/]+\/?$/, "")
      .replace(/\/detalle-jugador\/?$/, "");
  }, [location.pathname, location.state]);

  const superTree = useMemo(
    () => String(location.pathname || "").startsWith("/super-dashboard/admin/dashboard"),
    [location.pathname]
  );
  const basePath = superTree ? "/super-dashboard/admin/dashboard" : "/admin";

  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "rounded-2xl border shadow-lg transition " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const sectionCard =
      "rounded-2xl border shadow-md " +
      (darkMode ? "bg-white/8 border-white/15" : "bg-white/55 border-ra-marron/15");

    const baseStatsCard =
      "rounded-2xl border shadow-md " +
      (darkMode
        ? "bg-amber-500/[0.07] border-amber-300/15"
        : "bg-amber-50/70 border-amber-700/15");

    const row =
      "py-3 flex items-start justify-between gap-4 border-b last:border-b-0 " +
      (darkMode ? "border-white/10" : "border-ra-marron/15");

    const rowLabel = darkMode
      ? "text-white/75 text-sm font-semibold"
      : "text-ra-marron/70 text-sm font-semibold";

    const rowValue = darkMode
      ? "text-white text-sm font-bold text-right"
      : "text-ra-marron text-sm font-bold text-right";

    const input =
      "w-full p-2 rounded-lg text-sm outline-none border transition " +
      "focus:ring-2 focus:ring-[rgba(170,80,19,0.22)] focus:border-[rgba(170,80,19,0.35)] " +
      (darkMode
        ? "bg-black/25 text-white border-white/15 placeholder-white/60"
        : "bg-white/75 text-ra-marron border-ra-marron/20 placeholder-ra-marron/50");

    const btnGhost =
      "px-5 py-2 rounded-xl font-extrabold border transition-all shadow-sm " +
      (darkMode
        ? "bg-white/10 border-white/15 hover:bg-white/15"
        : "bg-white/75 border-ra-marron/20 hover:bg-white/85");

    const btnPrimary =
      "px-5 py-2 rounded-xl font-extrabold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

    const btnPrimaryStyle = {
      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
      color: "#1a1208",
      border: darkMode
        ? "1px solid rgba(255,255,255,0.20)"
        : "1px solid rgba(109,88,41,0.18)",
    };

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold text-center " +
      (darkMode
        ? "border-red-200/20 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-800");

    const info =
      "rounded-2xl border px-5 py-4 " +
      (darkMode
        ? "border-sky-300/15 bg-sky-500/[0.07] text-sky-100"
        : "border-sky-700/15 bg-sky-50/80 text-sky-900");

    const successToast = {
      backgroundColor: "rgba(34,197,94,0.92)",
      color: "white",
    };

    return {
      shell,
      titleMain,
      subText,
      card,
      sectionCard,
      baseStatsCard,
      row,
      rowLabel,
      rowValue,
      input,
      btnGhost,
      btnPrimary,
      btnPrimaryStyle,
      danger,
      info,
      successToast,
    };
  }, [darkMode]);

  const [rolActual, setRolActual] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [jugador, setJugador] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [statsId, setStatsId] = useState(null);
  const [fotoDataUrl, setFotoDataUrl] = useState(null);

  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!rut) {
      const backTo = parentPath || basePath;
      navigate(backTo, { replace: true, state: location.state || {} });
    }
  }, [rut, parentPath, basePath, navigate, location.state]);

  useEffect(() => {
    const currentPath = location.pathname + location.search;

    const base = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: "Listar Jugadores", to: parentPath || `${basePath}/listar-jugadores` }];

    const last = base[base.length - 1];
    if (!last || String(last.label) !== "Detalle Jugador") {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [...base, { label: "Detalle Jugador", to: currentPath }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, parentPath, basePath]);

  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);

      if (![1, 2, 3].includes(rol)) {
        navigate("/admin", { replace: true });
        return;
      }

      const a = getAcademiaIdFromStorage();
      if (!a) {
        if (rol === 3 && superTree) navigate("/super-dashboard", { replace: true });
        else {
          clearToken();
          navigate("/login", { replace: true });
        }
        return;
      }

      setRolActual(rol);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, superTree]);

  useEffect(() => {
    if (!rolActual || !rut) return;

    const abort = new AbortController();
    const headers = buildHeadersFallback(rolActual);

    (async () => {
      setIsLoading(true);
      setErr("");

      try {
        const rj = await getWithFallback(`/jugadores/rut/${encodeURIComponent(rut)}`, {
          signal: abort.signal,
          headers,
        });
        const j = unwrapOne(rj);

        if (abort.signal.aborted) return;

        if (!j) {
          const backTo = parentPath || `${basePath}/listar-jugadores`;
          navigate(backTo, { replace: true, state: location.state || {} });
          return;
        }

        setFotoDataUrl(buildFotoDataUrl(j));

        let est = {};
        let estId = null;

        try {
          const jugadorId = Number(j?.id ?? j?.jugador_id ?? j?.id_jugador ?? 0) || null;
          const deporteId = Number(j?.deporte_id ?? j?.id_deporte ?? 0) || null;

          if (jugadorId) {
            const candidates = [
              `/estadisticas/by-jugador/${encodeURIComponent(String(jugadorId))}`,
              deporteId
                ? `/estadisticas/by-jugador/${encodeURIComponent(
                    String(jugadorId)
                  )}?deporte_id=${encodeURIComponent(String(deporteId))}`
                : null,
              `/estadisticas/jugador/${encodeURIComponent(String(jugadorId))}`,
            ].filter(Boolean);

            let joined = null;

            for (const url of candidates) {
              try {
                const r = await getWithFallback(url, { signal: abort.signal, headers });
                const d = r?.data ?? r;
                const item =
                  d?.item && typeof d.item === "object"
                    ? d.item
                    : d?.data?.item && typeof d.data.item === "object"
                      ? d.data.item
                      : d;

                joined = item;
                break;
              } catch (e) {
                const st = e?.status ?? e?.response?.status ?? 0;
                if (st === 401 || st === 403) throw e;
              }
            }

            if (joined) {
              const flat = flattenJoinedStats(joined);
              estId = flat?.stats_id ?? flat?.id ?? null;

              if ("partidos_jugador" in flat && !("partidos_jugados" in flat)) {
                flat.partidos_jugados = safeNum(flat.partidos_jugador, 0);
              }

              est = flat;
            }
          }
        } catch {
          est = {};
        }

        const [posList, catList, estbList, prevList, estList, sucList, comList] =
          await Promise.all([
            tryGetList(["/posiciones"], { signal: abort.signal, headers }),
            tryGetList(["/categorias"], { signal: abort.signal, headers }),
            tryGetList(["/establecimientos-educ"], { signal: abort.signal, headers }),
            tryGetList(["/prevision-medica"], { signal: abort.signal, headers }),
            tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
            tryGetList(["/sucursales-real"], { signal: abort.signal, headers }),
            tryGetList(["/comunas", "/catalogos/comunas", "/catalogos/comuna"], {
              signal: abort.signal,
              headers,
            }),
          ]);

        if (abort.signal.aborted) return;

        const _posiciones = normalizeCatalog(posList);
        const _categorias = normalizeCatalog(catList);
        const _establecimientos = normalizeCatalog(estbList);
        const _previsiones = normalizeCatalog(prevList);
        const _estados = normalizeCatalog(estList);
        const _sucursales = normalizeCatalog(sucList);
        const _comunas = normalizeCatalog(comList);

        setPosiciones(_posiciones);
        setCategorias(_categorias);
        setEstablecimientos(_establecimientos);
        setPrevisiones(_previsiones);
        setEstados(_estados);
        setSucursales(_sucursales);
        setComunas(_comunas);

        const posMap = new Map(_posiciones.map((p) => [Number(p.id), p.nombre]));
        const catMap = new Map(_categorias.map((c) => [Number(c.id), c.nombre]));
        const estbMap = new Map(_establecimientos.map((e) => [Number(e.id), e.nombre]));
        const prevMap = new Map(_previsiones.map((p) => [Number(p.id), p.nombre]));
        const estMap = new Map(_estados.map((e) => [Number(e.id), e.nombre]));
        const sucMap = new Map(_sucursales.map((s) => [Number(s.id), s.nombre]));
        const comMap = new Map(_comunas.map((c) => [Number(c.id), c.nombre]));

        const jugadorEnriquecido = {
          ...j,
          posicion:
            j.posicion ??
            (posMap.has(Number(j.posicion_id)) ? { nombre: posMap.get(Number(j.posicion_id)) } : null),
          categoria:
            j.categoria ??
            (catMap.has(Number(j.categoria_id)) ? { nombre: catMap.get(Number(j.categoria_id)) } : null),
          establec_educ:
            j.establec_educ ??
            (estbMap.has(Number(j.establec_educ_id))
              ? { nombre: estbMap.get(Number(j.establec_educ_id)) }
              : null),
          prevision_medica:
            j.prevision_medica ??
            (prevMap.has(Number(j.prevision_medica_id))
              ? { nombre: prevMap.get(Number(j.prevision_medica_id)) }
              : null),
          estado:
            j.estado ??
            (estMap.has(Number(j.estado_id)) ? { nombre: estMap.get(Number(j.estado_id)) } : null),
          sucursal:
            j.sucursal ??
            (sucMap.has(Number(j.sucursal_id)) ? { nombre: sucMap.get(Number(j.sucursal_id)) } : null),
          comuna:
            j.comuna ??
            (comMap.has(Number(j.comuna_id)) ? { nombre: comMap.get(Number(j.comuna_id)) } : null),
        };

        setJugador(jugadorEnriquecido);
        setEstadisticas(est);
        setStatsId(estId);

        const iso = j?.fecha_nacimiento;
        let ymd = "";
        if (iso) {
          const d = new Date(iso);
          if (!Number.isNaN(d.getTime())) {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            const da = String(d.getUTCDate()).padStart(2, "0");
            ymd = `${y}-${m}-${da}`;
          } else if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
            ymd = iso.slice(0, 10);
          }
        }

        setFormData({
          ...j,
          fecha_nacimiento: ymd || "",
          estado_id: j?.estado_id ?? null,
          sucursal_id: j?.sucursal_id ?? null,
          estadistica_id: estId ?? j?.estadistica_id ?? null,
          comuna_id: j?.comuna_id ?? null,
          direccion: j?.direccion ?? "",
        });
      } catch (error) {
        if (abort.signal.aborted) return;

        const st = error?.status ?? error?.response?.status;

        if (st === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 403) {
          setErr("No tienes permisos para ver este jugador en la academia seleccionada.");
          setTimeout(() => {
            const backTo = parentPath || `${basePath}/listar-jugadores`;
            navigate(backTo, { replace: true, state: location.state || {} });
          }, 900);
          return;
        }

        const backTo = parentPath || `${basePath}/listar-jugadores`;
        navigate(backTo, { replace: true, state: location.state || {} });
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [rut, rolActual, navigate, parentPath, location.state, basePath]);

  const labelNombre = useCallback(
    (arr, id) => arr.find((i) => Number(i.id) === Number(id))?.nombre || "-",
    []
  );

  const formatearFechaLocal = (fecha) => {
    if (!fecha) return "-";
    if (/^\d{4}-\d{2}-\d{2}/.test(String(fecha))) {
      const [y, m, d] = String(fecha).slice(0, 10).split("-");
      return `${d}-${m}-${y}`;
    }
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${da}-${m}-${y}`;
    }
    return String(fecha);
  };

  const deporteId = useMemo(
    () => Number(jugador?.deporte_id ?? jugador?.id_deporte ?? 0) || null,
    [jugador]
  );

  const sportConfig = useMemo(() => getSportConfig(deporteId), [deporteId]);

  const secciones = useMemo(
    () => buildStatSections(estadisticas, deporteId),
    [estadisticas, deporteId]
  );

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const guardarCambios = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setIsLoading(true);

    try {
      const headers = buildHeadersFallback(rolActual);

      const ALLOWED = new Set([
        "nombre_jugador",
        "edad",
        "email",
        "telefono",
        "peso",
        "estatura",
        "talla_polera",
        "talla_short",
        "nombre_apoderado",
        "telefono_apoderado",
        "fecha_nacimiento",
        "posicion_id",
        "categoria_id",
        "establec_educ_id",
        "prevision_medica_id",
        "estado_id",
        "sucursal_id",
        "comuna_id",
        "direccion",
      ]);

      const raw = { ...formData };
      const numeric = (v) => (v === "" || v == null ? null : Number(v));
      const payload = {};

      for (const [k, v] of Object.entries(raw)) {
        if (!ALLOWED.has(k)) continue;

        if (
          [
            "edad",
            "peso",
            "estatura",
            "posicion_id",
            "categoria_id",
            "establec_educ_id",
            "prevision_medica_id",
            "estado_id",
            "sucursal_id",
            "comuna_id",
          ].includes(k)
        ) {
          payload[k] = numeric(v);
        } else if (k === "fecha_nacimiento") {
          payload[k] = v || null;
        } else {
          payload[k] = v ?? null;
        }
      }

      await api.patch(`/jugadores/rut/${encodeURIComponent(rut)}`, payload, { headers });

      setJugador((prev) => ({
        ...(prev || {}),
        ...payload,
        posicion:
          posiciones.find((p) => Number(p.id) === Number(payload.posicion_id)) ||
          prev?.posicion ||
          null,
        categoria:
          categorias.find((c) => Number(c.id) === Number(payload.categoria_id)) ||
          prev?.categoria ||
          null,
        establec_educ:
          establecimientos.find((e) => Number(e.id) === Number(payload.establec_educ_id)) ||
          prev?.establec_educ ||
          null,
        prevision_medica:
          previsiones.find((p) => Number(p.id) === Number(payload.prevision_medica_id)) ||
          prev?.prevision_medica ||
          null,
        estado:
          estados.find((e) => Number(e.id) === Number(payload.estado_id)) ||
          prev?.estado ||
          null,
        sucursal:
          sucursales.find((s) => Number(s.id) === Number(payload.sucursal_id)) ||
          prev?.sucursal ||
          null,
        comuna:
          comunas.find((c) => Number(c.id) === Number(payload.comuna_id)) ||
          prev?.comuna ||
          null,
      }));

      setEditMode(false);
      setMsg("✅ Datos actualizados");
      setTimeout(() => setMsg(""), 2500);
    } catch (error) {
      const st = error?.status ?? error?.response?.status;
      if (st === 401) {
        clearToken();
        navigate("/login", { replace: true });
      } else if (st === 403) {
        setErr("No tienes permisos para editar este jugador en la academia seleccionada.");
      } else {
        setErr(
          error?.response?.data?.detail ||
            error?.response?.data?.message ||
            error?.message ||
            "❌ Error al actualizar"
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onContratoClick = async () => {
    setErr("");
    try {
      const headers = buildHeadersFallback(rolActual);

      let b64 = jugador?.contrato_prestacion;
      let mime = jugador?.contrato_prestacion_mime || "application/pdf";

      if (!b64 || String(b64).trim().length < 50) {
        const r = await getWithFallback(`/jugadores/rut/${encodeURIComponent(rut)}`, { headers });
        const j = unwrapOne(r);
        b64 = j?.contrato_prestacion;
        mime = j?.contrato_prestacion_mime || "application/pdf";

        if (!b64 || String(b64).trim().length < 50) {
          setErr("Este jugador no tiene contrato almacenado.");
          return;
        }

        setJugador((prev) => ({
          ...(prev || {}),
          contrato_prestacion: b64,
          contrato_prestacion_mime: mime,
        }));
      }

      const mimeLower = String(mime || "").toLowerCase();
      if (!mimeLower.includes("application/pdf")) {
        setErr("El contrato almacenado no está en formato PDF.");
        return;
      }

      const blob = b64ToBlob(b64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openBlobUrlLikeHistorico(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      if (st === 401) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      if (st === 403) {
        setErr("No tienes permisos para ver el contrato en esta academia.");
        return;
      }
      setErr(e?.response?.data?.message || e?.message || "No se pudo abrir el contrato.");
    }
  };

  if (isLoading || !jugador) return <IsLoading />;

  const canEdit = rolActual === 1 || rolActual === 3;

  const rows = [
    ["Email", "email"],
    ["Teléfono", "telefono"],
    ["Peso (kg)", "peso"],
    ["Estatura (cm)", "estatura"],
    ["Fecha Nacimiento", "fecha_nacimiento"],
    ["Talla Polera", "talla_polera"],
    ["Talla Short", "talla_short"],
    ["Nombre Apoderado", "nombre_apoderado"],
    ["Teléfono Apoderado", "telefono_apoderado"],
    ["Posición", "posicion_id"],
    ["Categoría", "categoria_id"],
    ["Establecimiento", "establec_educ_id"],
    ["Previsión Médica", "prevision_medica_id"],
    ["Estado", "estado_id"],
    ["Sucursal", "sucursal_id"],
    ["Comuna", "comuna_id"],
    ["Dirección", "direccion"],
    ["Contrato firmado", "contrato_firmado"],
    ["Estadística ID", "estadistica_id"],
  ];

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6 text-center">
        <div
          className="w-36 h-36 sm:w-40 sm:h-40 mx-auto rounded-full overflow-hidden flex items-center justify-center text-6xl border"
          style={{
            borderColor: darkMode ? "rgba(255,255,255,0.15)" : "rgba(109,88,41,0.18)",
            background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)",
          }}
        >
          {fotoDataUrl ? (
            <img
              src={fotoDataUrl}
              alt={`Foto de ${jugador.nombre_jugador}`}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setFotoDataUrl(null)}
            />
          ) : (
            <span aria-hidden>👤</span>
          )}
        </div>

        <h1 className={`text-4xl font-extrabold tracking-tightish mt-4 ${ui.titleMain}`}>
          {jugador.nombre_jugador}
        </h1>

        <p className={`text-sm mt-2 ${ui.subText}`}>
          {jugador.posicion?.nombre || "-"} · {jugador.edad ?? "-"} años ·{" "}
          {jugador.categoria?.nombre || "-"}
        </p>

        <p className={`text-sm mt-1 ${ui.subText}`}>
          Deporte: <span className="font-extrabold">{sportConfig.nombre}</span>
        </p>
      </header>

      <main className="px-6 pb-20">
        {err && (
          <div className="max-w-6xl mx-auto mt-6">
            <div className={ui.danger}>{err}</div>
          </div>
        )}

        <div className="max-w-6xl mx-auto mt-6">
          <section className={`${ui.card} p-4 md:p-6 relative`}>
            {canEdit && (
              <button
                onClick={() => {
                  setEditMode(true);
                  setErr("");
                }}
                className="absolute top-4 right-4 inline-flex items-center gap-2 text-sm font-extrabold hover:opacity-90"
                title="Editar"
                aria-label="Editar"
                style={{ color: darkMode ? PALETTE.cream : PALETTE.brown }}
              >
                <FiEdit className="text-lg" />
                Editar
              </button>
            )}

            <h2
              className={`text-xl font-extrabold mb-4 ${
                darkMode ? "text-white" : "text-ra-marron"
              }`}
            >
              Datos del jugador
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {rows.map(([label, key]) => {
                const renderValue = () => {
                  if (key === "contrato_firmado") {
                    return (
                      <button
                        type="button"
                        onClick={onContratoClick}
                        className="inline-flex items-center gap-2 hover:opacity-90"
                        title="Ver contrato (PDF)"
                        aria-label="Ver contrato"
                      >
                        <FileText size={18} color={darkMode ? PALETTE.cream : PALETTE.brown} />
                        <span className={darkMode ? "text-white/85" : "text-ra-marron/85"}>
                          Ver contrato
                        </span>
                      </button>
                    );
                  }

                  if (key === "posicion_id")
                    return jugador.posicion?.nombre || labelNombre(posiciones, jugador.posicion_id);
                  if (key === "categoria_id")
                    return jugador.categoria?.nombre || labelNombre(categorias, jugador.categoria_id);
                  if (key === "establec_educ_id")
                    return (
                      jugador.establec_educ?.nombre ||
                      labelNombre(establecimientos, jugador.establec_educ_id)
                    );
                  if (key === "prevision_medica_id")
                    return (
                      jugador.prevision_medica?.nombre ||
                      labelNombre(previsiones, jugador.prevision_medica_id)
                    );
                  if (key === "estado_id")
                    return jugador.estado?.nombre || labelNombre(estados, jugador.estado_id);
                  if (key === "sucursal_id")
                    return jugador.sucursal?.nombre || labelNombre(sucursales, jugador.sucursal_id);
                  if (key === "comuna_id")
                    return jugador.comuna?.nombre || labelNombre(comunas, jugador.comuna_id);
                  if (key === "fecha_nacimiento")
                    return formatearFechaLocal(jugador.fecha_nacimiento);
                  if (key === "estadistica_id")
                    return statsId ?? jugador.estadistica_id ?? "-";

                  return jugador[key] ?? "-";
                };

                return (
                  <div key={key} className={ui.row}>
                    <div className={ui.rowLabel}>{label}</div>
                    <div className={ui.rowValue}>{renderValue()}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="max-w-6xl mx-auto mt-10 space-y-6">
          <div>
            <h2
              className="text-2xl font-extrabold"
              style={{ color: darkMode ? PALETTE.cream : PALETTE.brown }}
            >
              Estadísticas del Jugador — {sportConfig.nombre}
            </h2>

            <div className={`${ui.info} mt-3`}>
              <div className="text-sm">
                Se muestran las métricas comunes de <code>stats_base</code> y únicamente las
                estadísticas específicas correspondientes a <b>{sportConfig.nombre}</b>.
              </div>
            </div>
          </div>

          {Object.keys(secciones).length === 0 ? (
            <div className={`${ui.sectionCard} p-6 text-center`}>
              <p className={ui.subText}>
                No existen estadísticas registradas para este jugador.
              </p>
            </div>
          ) : (
            Object.entries(secciones).map(([titulo, data]) => {
              const isBase = titulo === "Base / Generales";

              return (
                <div
                  key={titulo}
                  className={`${isBase ? ui.baseStatsCard : ui.sectionCard} p-4 md:p-6`}
                >
                  <h3
                    className="text-lg font-extrabold mb-1"
                    style={{ color: darkMode ? PALETTE.cream : PALETTE.brown }}
                  >
                    {titulo}
                  </h3>

                  {isBase && (
                    <p className={`text-xs mb-4 ${ui.subText}`}>
                      Métricas comunes a todos los deportes.
                    </p>
                  )}

                  <div className="relative h-[320px] w-full">
                    <Bar
                      data={{
                        labels: Object.keys(data),
                        datasets: [
                          {
                            label: titulo,
                            data: Object.values(data),
                            backgroundColor: darkMode
                              ? "rgba(170,80,19,0.55)"
                              : "rgba(226,119,59,0.35)",
                            borderColor: darkMode
                              ? "rgba(170,80,19,0.95)"
                              : "rgba(109,88,41,0.55)",
                            borderWidth: 1,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: {
                            ticks: {
                              color: darkMode
                                ? "rgba(255,255,255,0.82)"
                                : "rgba(109,88,41,0.82)",
                            },
                            grid: {
                              color: darkMode
                                ? "rgba(255,255,255,0.10)"
                                : "rgba(109,88,41,0.12)",
                            },
                          },
                          y: {
                            beginAtZero: true,
                            ticks: {
                              color: darkMode
                                ? "rgba(255,255,255,0.82)"
                                : "rgba(109,88,41,0.82)",
                            },
                            grid: {
                              color: darkMode
                                ? "rgba(255,255,255,0.10)"
                                : "rgba(109,88,41,0.12)",
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      {editMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-auto">
          <form
            onSubmit={guardarCambios}
            className={`w-full max-w-2xl ${ui.card} rounded-2xl p-6 space-y-6 overflow-y-auto max-h-[90vh]`}
          >
            <div
              className="flex justify-between items-center mb-2 border-b pb-3 relative"
              style={{
                borderColor: darkMode
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(109,88,41,0.15)",
              }}
            >
              <h3
                className="text-xl font-extrabold text-center w-full"
                style={{ color: darkMode ? PALETTE.cream : PALETTE.brown }}
              >
                Editar Información del Jugador
              </h3>

              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="absolute top-1 right-1 text-xl hover:opacity-90"
                title="Cerrar"
                aria-label="Cerrar"
                style={{
                  color: darkMode
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(109,88,41,0.85)",
                }}
              >
                <FiX />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Nombre", "nombre_jugador", "text"],
                ["Edad", "edad", "number"],
                ["Email", "email", "email"],
                ["Teléfono", "telefono", "text"],
                ["Peso (kg)", "peso", "number"],
                ["Estatura (cm)", "estatura", "number"],
                ["Talla Polera", "talla_polera", "text"],
                ["Talla Short", "talla_short", "text"],
                ["Nombre Apoderado", "nombre_apoderado", "text"],
                ["Teléfono Apoderado", "telefono_apoderado", "text"],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label
                    className={`block text-sm font-semibold mb-1 ${
                      darkMode ? "text-white/85" : "text-ra-marron/85"
                    }`}
                  >
                    {label}
                  </label>
                  <input
                    type={type}
                    name={key}
                    value={formData[key] ?? ""}
                    onChange={handleChange}
                    className={ui.input}
                  />
                </div>
              ))}

              <div>
                <label
                  className={`block text-sm font-semibold mb-1 ${
                    darkMode ? "text-white/85" : "text-ra-marron/85"
                  }`}
                >
                  Fecha Nacimiento
                </label>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  value={formData.fecha_nacimiento || ""}
                  onChange={handleChange}
                  className={ui.input}
                />
              </div>

              {[
                ["Posición", "posicion_id", posiciones],
                ["Categoría", "categoria_id", categorias],
                ["Establecimiento", "establec_educ_id", establecimientos],
                ["Previsión Médica", "prevision_medica_id", previsiones],
                ["Estado", "estado_id", estados],
                ["Sucursal", "sucursal_id", sucursales],
                ["Comuna", "comuna_id", comunas],
              ].map(([label, key, arr]) => (
                <div key={key}>
                  <label
                    className={`block text-sm font-semibold mb-1 ${
                      darkMode ? "text-white/85" : "text-ra-marron/85"
                    }`}
                  >
                    {label}
                  </label>
                  <select
                    name={key}
                    value={formData[key] || ""}
                    onChange={handleChange}
                    className={ui.input}
                  >
                    <option value="">Seleccione</option>
                    {arr.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="sm:col-span-2">
                <label
                  className={`block text-sm font-semibold mb-1 ${
                    darkMode ? "text-white/85" : "text-ra-marron/85"
                  }`}
                >
                  Dirección
                </label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion ?? ""}
                  onChange={handleChange}
                  className={ui.input}
                  placeholder="Ej: Av. Siempre Viva 742"
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-semibold mb-1 ${
                    darkMode ? "text-white/85" : "text-ra-marron/85"
                  }`}
                >
                  Estadística ID
                </label>
                <input
                  type="text"
                  name="estadistica_id"
                  value={formData.estadistica_id ?? ""}
                  disabled
                  className={`${ui.input} opacity-70 cursor-not-allowed`}
                />
                <p
                  className={`text-xs mt-1 ${
                    darkMode ? "text-white/60" : "text-ra-marron/60"
                  }`}
                >
                  Campo informativo (no editable)
                </p>
              </div>

              <div className="sm:col-span-2">
                <label
                  className={`block text-sm font-semibold mb-1 ${
                    darkMode ? "text-white/85" : "text-ra-marron/85"
                  }`}
                >
                  Contrato firmado
                </label>
                <div className="flex items-center gap-2">
                  <FileText size={18} color={darkMode ? PALETTE.cream : PALETTE.brown} />
                  <span className={darkMode ? "text-white/75" : "text-ra-marron/75"}>
                    Disponible en la tarjeta (Ver contrato)
                  </span>
                </div>
                <p
                  className={`text-xs mt-1 ${
                    darkMode ? "text-white/60" : "text-ra-marron/60"
                  }`}
                >
                  Se abre en una nueva pestaña como PDF (estilo histórico).
                </p>
              </div>
            </div>

            {err && <p className="text-red-200 text-sm font-bold">{err}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className={ui.btnGhost}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className={ui.btnPrimary}
                style={{ ...(ui.btnPrimaryStyle || {}), opacity: canEdit ? 1 : 0.6 }}
                disabled={!canEdit}
                title={!canEdit ? "Solo roles 1 y 3" : "Guardar cambios"}
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {msg && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg z-40 font-extrabold"
          style={ui.successToast}
        >
          {msg}
        </div>
      )}
    </div>
  );
}