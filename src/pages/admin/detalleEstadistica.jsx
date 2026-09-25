// src/pages/admin/detalleEstadistica.jsx

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { LoaderCircle } from "lucide-react";

import { useTheme } from "../../context/ThemeContext";

import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";

import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* =========================================================
   RUTAS
========================================================= */

const SUPER_ADMIN_ROOT = "/super-dashboard/admin/dashboard";

const isSuperTreePath = (pathname) => String(pathname ?? "").startsWith(SUPER_ADMIN_ROOT);

/* =========================================================
   ACADEMIA SELECCIONADA
   EXCLUSIVAMENTE SUPERADMIN
========================================================= */

const STORAGE_KEY = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

const readSelectedAcademiaId = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return 0;
    }

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? parsed?.academyId ?? 0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

/* =========================================================
   JWT
========================================================= */

const isExpired = (decoded) => {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  return exp <= now;
};

/* =========================================================
   ROL
========================================================= */

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const parsed = Number(rawRol);

  return Number.isInteger(parsed) && [1, 2, 3].includes(parsed) ? parsed : 0;
};

/* =========================================================
   ACADEMIA JWT
   ADMIN / STAFF
========================================================= */

const extractTokenAcademiaId = (decoded) => {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
};

/* =========================================================
   ERROR STATUS
========================================================= */

const getErrStatus = (error) => error?.status ?? error?.response?.status ?? 0;

/* =========================================================
   GUARD
========================================================= */

const ensureScopeOrRedirect = ({ navigate, isSuperTree }) => {
  const token = getToken?.() || "";

  if (!token) {
    clearToken?.();

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }

  try {
    const decoded = jwtDecode(token);

    if (isExpired(decoded)) {
      clearToken?.();

      navigate("/login", {
        replace: true,
      });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    const rol = extractRol(decoded);

    if (![1, 2, 3].includes(rol)) {
      navigate("/admin", {
        replace: true,
      });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    /* =====================================================
       SUPERADMIN TREE
    ===================================================== */

    if (isSuperTree) {
      if (rol !== 3) {
        navigate("/admin", {
          replace: true,
        });

        return {
          ok: false,
          rol,
          academiaId: 0,
        };
      }

      const academiaId = readSelectedAcademiaId();

      if (academiaId <= 0) {
        navigate("/super-dashboard", {
          replace: true,
        });

        return {
          ok: false,
          rol,
          academiaId: 0,
        };
      }

      return {
        ok: true,
        rol,
        academiaId,
      };
    }

    /* =====================================================
       SUPERADMIN FUERA DE SU ÁRBOL
    ===================================================== */

    if (rol === 3) {
      navigate("/super-dashboard", {
        replace: true,
      });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    /* =====================================================
       ADMIN / STAFF
    ===================================================== */

    const academiaId = extractTokenAcademiaId(decoded);

    if (academiaId <= 0) {
      clearToken?.();

      navigate("/login", {
        replace: true,
      });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    return {
      ok: true,
      rol,
      academiaId,
    };
  } catch {
    clearToken?.();

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }
};

/* =========================================================
   ESTADÍSTICAS POR DEPORTE
========================================================= */

const BASE_GROUP = {
  "Base / Generales": ["minutos_jugados", "partidos_jugados", "lesiones", "dias_baja", "sanciones_federativas"],
};

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

  tiempo_posesion_segundos: "Tiempo de posesión (segundos)",

  tercer_down_intentos: "Tercer down - intentos",

  tercer_down_conversiones: "Tercer down - conversiones",

  tercer_down_efectividad_pct: "Tercer down - efectividad (%)",
};

/* =========================================================
   CAMPOS DECIMALES
========================================================= */

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
   CONFIGURACIÓN AUXILIAR
========================================================= */

const getSportConfig = (deporteId) =>
  SPORT_CONFIG[Number(deporteId)] || {
    nombre: "Deporte no configurado",

    grupos: {},
  };

const getGroupsForSport = (deporteId) => {
  const config = getSportConfig(deporteId);

  return {
    ...BASE_GROUP,
    ...config.grupos,
  };
};

const getAllFieldsForSport = (deporteId) => Array.from(new Set(Object.values(getGroupsForSport(deporteId)).flat()));

const blankFormForSport = (deporteId, sid = null) => {
  const output = {
    stats_id: sid,
  };

  getAllFieldsForSport(deporteId).forEach((campo) => {
    output[campo] = 0;
  });

  return output;
};

const flattenJoinedForSport = (joined, deporteId) => {
  const baseStats = joined?.base || {};

  const sportStats = joined?.sport || {};

  const output = {
    ...baseStats,
    ...sportStats,
  };

  if (output.id != null && output.stats_id == null) {
    output.stats_id = output.id;
  }

  getAllFieldsForSport(deporteId).forEach((campo) => {
    if (output[campo] == null) {
      output[campo] = 0;
    }
  });

  return output;
};

const normalizeNumeric = (campo, value) => {
  const raw = String(value ?? "").trim();

  if (raw === "" || raw === "-") {
    return 0;
  }

  if (DECIMAL_FIELDS.has(campo)) {
    const number = Number.parseFloat(raw);

    return Number.isFinite(number) ? number : 0;
  }

  const number = Number.parseInt(raw, 10);

  return Number.isFinite(number) ? number : 0;
};

const pickEditablePayloadForSport = (object, deporteId) => {
  const output = {};

  getAllFieldsForSport(deporteId).forEach((campo) => {
    if (object?.[campo] === undefined) {
      return;
    }

    output[campo] = normalizeNumeric(campo, object[campo]);
  });

  return output;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function DetalleEstadistica() {
  const { darkMode, themeTokens } = useTheme();

  const { rut } = useParams();

  const navigate = useNavigate();

  const location = useLocation();

  const mountedRef = useRef(true);

  const superTree = useMemo(() => isSuperTreePath(location.pathname), [location.pathname]);

  const basePath = superTree ? SUPER_ADMIN_ROOT : "/admin";

  const backTo = useMemo(
    () => location.state?.from || `${basePath}/registrar-estadisticas`,
    [location.state, basePath]
  );

  const [rol, setRol] = useState(null);

  const [canWrite, setCanWrite] = useState(false);

  const [jugador, setJugador] = useState(null);

  const [jugadorId, setJugadorId] = useState(null);

  const [deporteId, setDeporteId] = useState(null);

  const [statsId, setStatsId] = useState(null);

  const [formData, setFormData] = useState({});

  const [statsExistentes, setStatsExistentes] = useState(null);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  useMobileAutoScrollTop();

  /* =======================================================
     MOUNT
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    const currentPath = location.pathname + location.search;

    const defaultFrom = `${basePath}/registrar-estadisticas`;

    const crumbBase = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [
          {
            label: "Registrar Estadísticas",

            to: location.state?.from || defaultFrom,
          },
        ];

    const last = crumbBase[crumbBase.length - 1];

    const needsAppend = !last || last.label !== "Detalle Estadística";

    if (needsAppend) {
      navigate(currentPath, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            ...crumbBase,

            {
              label: "Detalle Estadística",

              to: currentPath,
            },
          ],
        },
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

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

     Dashboard es dueño del fondo global.
     Esta página permanece transparente.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16 font-sans";

    const content = "w-full max-w-[1700px] mx-auto";

    const panel =
      "mt-4 rounded-2xl border overflow-hidden shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const card = "rounded-2xl border p-4 transition-colors duration-200";

    const baseCard = "rounded-2xl border p-4 transition-colors duration-200";

    const pill = "rounded-xl border px-3 py-2 transition-colors duration-200";

    const input =
      "weli-stat-input w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed";

    const btnGhost =
      "weli-stat-ghost inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    const btnPrimary =
      "weli-stat-primary inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";

    const danger =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold text-center " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-800");

    const info =
      "rounded-2xl border px-4 sm:px-5 py-4 " +
      (darkMode ? "border-sky-300/15 bg-sky-500/[0.07] text-sky-100" : "border-sky-700/15 bg-sky-50/80 text-sky-900");

    return {
      page,
      content,
      panel,
      card,
      baseCard,
      pill,
      input,
      btnGhost,
      btnPrimary,
      danger,
      info,

      pageStyle: {
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      panelStyle: {
        backgroundColor: tokens.surface,

        borderColor: tokens.border,

        color: tokens.text,
      },

      cardStyle: {
        backgroundColor: tokens.surfaceSoft,

        borderColor: tokens.border,

        color: tokens.text,
      },

      baseCardStyle: {
        backgroundColor: tokens.surface2,

        borderColor: tokens.borderStrong,

        color: tokens.text,
      },

      pillStyle: {
        backgroundColor: tokens.surface,

        borderColor: tokens.border,

        color: tokens.text,
      },

      inputStyle: {
        backgroundColor: tokens.inputBg,

        borderColor: tokens.inputBorder,

        color: tokens.inputText,

        "--tw-ring-color": `${tokens.focus}33`,
      },

      sectionTitleStyle: {
        color: tokens.text,
      },

      fieldLabelStyle: {
        color: tokens.text,
      },

      ghostStyle: {
        backgroundColor: tokens.surfaceSoft,

        borderColor: tokens.borderStrong,

        color: tokens.text,

        "--weli-stat-ghost-hover": tokens.surfaceHover,

        "--weli-stat-focus": tokens.focus,
      },

      primaryStyle: {
        backgroundColor: tokens.primary,

        borderColor: tokens.primary,

        color: tokens.primaryContrast,

        "--weli-stat-focus": tokens.focus,
      },

      mutedStyle: {
        color: tokens.textMuted,
      },

      valueStyle: {
        color: tokens.text,
      },
    };
  }, [tokens, darkMode]);

  /* =======================================================
     SPORT CONFIG
  ======================================================= */

  const sportConfig = useMemo(() => getSportConfig(deporteId), [deporteId]);

  const campos = useMemo(() => getGroupsForSport(deporteId), [deporteId]);

  const allFields = useMemo(() => getAllFieldsForSport(deporteId), [deporteId]);

  const pretty = useCallback(
    (campo) =>
      FIELD_LABELS[campo] ||
      String(campo || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase()),
    []
  );

  const rutConDV = useMemo(() => {
    if (!jugador) {
      return formatRutWithDV(rut);
    }

    return formatRutWithDV(jugador.rut_jugador ?? rut);
  }, [jugador, rut]);

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    const guard = ensureScopeOrRedirect({
      navigate,
      isSuperTree: superTree,
    });

    if (!guard.ok) {
      return;
    }

    if (mountedRef.current) {
      setRol(guard.rol);

      setCanWrite([1, 3].includes(guard.rol));
    }
  }, [navigate, superTree]);

  /* =======================================================
     CARGAR JUGADOR + ESTADÍSTICAS
  ======================================================= */

  useEffect(() => {
    if (rol == null) {
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);
      setError("");

      try {
        const stateJugadorId = Number(location.state?.jugador_id ?? 0) || null;

        let jid = stateJugadorId;

        let jRaw = null;

        /* ===============================================
           BUSCAR POR ID
        =============================================== */

        if (jid) {
          try {
            const resJ = await api.get(`/jugadores/${encodeURIComponent(String(jid))}`, {
              meta: {
                isPublic: false,
              },
            });

            const root = resJ?.data?.data ?? resJ?.data;

            jRaw =
              Array.isArray(root?.items) && root.items.length > 0
                ? root.items[0]
                : (root?.item ?? root?.jugador ?? root);
          } catch (jugadorIdError) {
            const status = getErrStatus(jugadorIdError);

            if (status === 401 || status === 403) {
              throw jugadorIdError;
            }
          }
        }

        /* ===============================================
           FALLBACK POR RUT
        =============================================== */

        if (!jRaw) {
          const jugadorRes = await api.get(`/jugadores/rut/${encodeURIComponent(String(rut))}`, {
            meta: {
              isPublic: false,
            },
          });

          const root = jugadorRes?.data?.data ?? jugadorRes?.data;

          jRaw =
            Array.isArray(root?.items) && root.items.length > 0 ? root.items[0] : (root?.item ?? root?.jugador ?? root);
        }

        if (!alive) {
          return;
        }

        if (!jRaw) {
          setError("El jugador no existe.");

          return;
        }

        const inferredJugadorId = Number(jRaw?.id ?? jRaw?.jugador_id ?? 0) || null;

        if (!jid && inferredJugadorId) {
          jid = inferredJugadorId;
        }

        if (!jid) {
          setError("No se pudo resolver jugador_id.");

          return;
        }

        const depId = Number(jRaw?.deporte_id ?? location.state?.scope?.deporte_id ?? 0) || null;

        if (!depId) {
          setJugador(jRaw);
          setJugadorId(jid);
          setDeporteId(null);

          setError("No se pudo determinar el deporte del jugador.");

          return;
        }

        if (!SPORT_CONFIG[depId]) {
          setJugador(jRaw);
          setJugadorId(jid);
          setDeporteId(depId);

          setError(`El deporte_id ${depId} todavía no tiene formulario de estadísticas configurado.`);

          return;
        }

        setJugador(jRaw);
        setJugadorId(jid);
        setDeporteId(depId);

        /* ===============================================
           ESTADÍSTICAS
        =============================================== */

        const joinedRes = await api.get(`/estadisticas/by-jugador/${encodeURIComponent(String(jid))}`, {
          meta: {
            isPublic: false,
          },
        });

        if (!alive) {
          return;
        }

        const joined = joinedRes?.data?.item ?? joinedRes?.data?.data?.item ?? null;

        if (!joined) {
          setStatsExistentes({});

          setStatsId(null);

          setFormData(blankFormForSport(depId, null));

          return;
        }

        const flat = flattenJoinedForSport(joined, depId);

        const sid = Number(flat?.stats_id ?? flat?.id ?? 0) || null;

        setStatsId(sid);

        setStatsExistentes(flat);

        setFormData(blankFormForSport(depId, sid));
      } catch (err) {
        const status = getErrStatus(err);

        if (status === 401) {
          clearToken?.();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (status === 403) {
          setError("No tienes permisos para ver/editar estadísticas en esta academia.");

          setTimeout(
            () =>
              navigate(backTo, {
                replace: true,
              }),
            900
          );

          return;
        }

        if (status === 404) {
          setError("El jugador o sus estadísticas no existen.");
        } else {
          setError(err?.response?.data?.message ?? err?.message ?? "Error al cargar los datos.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [rol, rut, navigate, location.state, backTo]);

  /* =======================================================
     INPUT
  ======================================================= */

  const handleChange = (campo, value) => {
    setFormData((previous) => ({
      ...previous,

      [campo]: normalizeNumeric(campo, value),
    }));
  };

  /* =======================================================
     LIMPIAR FORMULARIO LOCAL
  ======================================================= */

  const handleResetLocal = () => {
    setFormData(blankFormForSport(deporteId, statsId));
  };

  /* =======================================================
     GUARDAR
  ======================================================= */

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    const guard = ensureScopeOrRedirect({
      navigate,

      isSuperTree: superTree,
    });

    if (!guard.ok) {
      return;
    }

    if (!canWrite) {
      setError("No tienes permisos para guardar (solo roles 1 y 3).");

      return;
    }

    if (!jugadorId) {
      setError("Falta jugador_id.");

      return;
    }

    if (!deporteId || !SPORT_CONFIG[deporteId]) {
      setError("No existe una configuración estadística válida para el deporte del jugador.");

      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const currentStats = statsExistentes && typeof statsExistentes === "object" ? statsExistentes : {};

      const incStats = formData && typeof formData === "object" ? formData : {};

      const sumado = {};

      allFields.forEach((campo) => {
        const antiguo = Number(currentStats?.[campo] ?? 0);

        const nuevo = Number(incStats?.[campo] ?? 0);

        const a = Number.isFinite(antiguo) ? antiguo : 0;

        const b = Number.isFinite(nuevo) ? nuevo : 0;

        sumado[campo] = DECIMAL_FIELDS.has(campo) ? Number((a + b).toFixed(3)) : a + b;
      });

      const payload = pickEditablePayloadForSport(sumado, deporteId);

      /* ===============================================
           UPDATE
        =============================================== */

      if (statsId) {
        await api.put(`/estadisticas/${encodeURIComponent(String(statsId))}`, payload, {
          meta: {
            isPublic: false,
          },
        });
      } else {
        /* =============================================
             CREATE
          ============================================= */

        const academia_id =
          Number(jugador?.academia_id ?? 0) || Number(location.state?.scope?.academia_id ?? 0) || null;

        const deporte_id = Number(jugador?.deporte_id ?? 0) || Number(location.state?.scope?.deporte_id ?? 0) || null;

        if (!academia_id || !deporte_id) {
          throw new Error("Falta academia_id/deporte_id para crear stats.");
        }

        await api.post(
          "/estadisticas",
          {
            academia_id,
            deporte_id,

            jugador_id: jugadorId,

            ...payload,
          },
          {
            meta: {
              isPublic: false,
            },
          }
        );
      }

      alert(`✅ Estadísticas de ${sportConfig.nombre} acumuladas y guardadas correctamente`);

      navigate(backTo, {
        replace: true,
      });
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (status === 403) {
        setError("No tienes permisos para guardar estadísticas en esta academia.");

        return;
      }

      const detail = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message;

      setError(detail || "❌ Error al guardar estadísticas");
    } finally {
      setSubmitting(false);
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className={ui.page} style={ui.pageStyle}>
        <div className={`${ui.content} min-h-[70vh] flex justify-center items-center`}>
          <LoaderCircle
            className="animate-spin w-12 h-12"
            style={{
              color: tokens.primary,
            }}
          />
        </div>
      </div>
    );
  }

  /* =======================================================
     DATOS PRESENTACIÓN
  ======================================================= */

  const nombreJugador = jugador?.nombre_jugador ?? jugador?.nombre ?? "Jugador";

  /* =======================================================
     CAMPO
  ======================================================= */

  const renderField = (campo) => {
    const isDecimal = DECIMAL_FIELDS.has(campo);

    const isSigned = SIGNED_FIELDS.has(campo);

    return (
      <div key={campo} className="space-y-1.5">
        <label className="block text-[13px] sm:text-sm font-extrabold" style={ui.fieldLabelStyle}>
          {pretty(campo)}
        </label>

        <input
          type="number"
          min={isSigned ? undefined : "0"}
          step={isDecimal ? "0.01" : "1"}
          value={formData?.[campo] ?? 0}
          onChange={(event) => handleChange(campo, event.target.value)}
          className={ui.input}
          style={ui.inputStyle}
          disabled={!canWrite}
        />
      </div>
    );
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page} style={ui.pageStyle}>
      <style>
        {`
          .weli-stat-input::placeholder {
            color: ${tokens.textMuted};
            opacity: .72;
          }

          .weli-stat-input:focus {
            border-color: ${tokens.focus} !important;
          }

          .weli-stat-input:disabled {
            background-color: ${tokens.surfaceSoft} !important;
            color: ${tokens.textMuted} !important;
          }

          .weli-stat-ghost:hover:not(:disabled) {
            background-color: var(--weli-stat-ghost-hover) !important;
          }

          .weli-stat-ghost:focus-visible,
          .weli-stat-primary:focus-visible {
            outline: 2px solid var(--weli-stat-focus);
            outline-offset: 3px;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
            Registrar Estadísticas
          </h1>

          <p className="text-lg sm:text-xl mt-2" style={ui.subTextStyle}>
            {nombreJugador}
            {" · "}
            RUT: <span className="font-semibold">{rutConDV}</span>
          </p>

          <div className="mt-2 text-sm sm:text-base" style={ui.subTextStyle}>
            <span className="font-extrabold">{sportConfig.nombre}</span>

            {jugadorId ? ` · Jugador ID: ${jugadorId}` : ""}

            {statsId ? ` · Stats ID: ${statsId}` : " · Stats: nuevo"}

            {!canWrite ? " · Solo lectura" : ""}
          </div>
        </header>

        <main>
          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="mt-5">
              <div className={ui.danger}>{error}</div>
            </div>
          )}

          {/* =================================================
              INFO
          ================================================= */}

          <div className="mt-4">
            <div className={ui.info}>
              <div className="font-extrabold">Estadísticas de {sportConfig.nombre}</div>

              <div className="text-sm mt-1 opacity-80">
                Las métricas de <b>Base / Generales</b> pertenecen a <code>stats_base</code>. Las demás corresponden al
                bloque específico de {sportConfig.nombre}.
              </div>
            </div>
          </div>

          {/* =================================================
              PANEL PRINCIPAL
          ================================================= */}

          <div className={ui.panel} style={ui.panelStyle}>
            <div className="p-4 md:p-6">
              {/* =============================================
                  VALORES ACTUALES
              ============================================= */}

              {statsExistentes && typeof statsExistentes === "object" && Object.keys(statsExistentes).length > 0 && (
                <div className={`${ui.card} mb-5`} style={ui.cardStyle}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold" style={ui.sectionTitleStyle}>
                        Valores actuales (acumulados)
                      </h2>

                      <p className="text-xs mt-1" style={ui.subTextStyle}>
                        Solo se muestran métricas pertinentes a {sportConfig.nombre}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(backTo, {
                          replace: true,
                        })
                      }
                      className={ui.btnGhost}
                      style={ui.ghostStyle}
                    >
                      Volver
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                    {allFields.map((campo) => (
                      <div
                        key={campo}
                        className={`flex items-center justify-between gap-2 ${ui.pill}`}
                        style={ui.pillStyle}
                      >
                        <span style={ui.mutedStyle}>{pretty(campo)}</span>

                        <span className="font-extrabold" style={ui.valueStyle}>
                          {DECIMAL_FIELDS.has(campo)
                            ? Number(statsExistentes?.[campo] ?? 0).toFixed(2)
                            : Number(statsExistentes?.[campo] ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 text-[12px]" style={ui.subTextStyle}>
                    Lo que ingreses abajo se <b>suma</b> a estos valores.
                  </p>
                </div>
              )}

              {/* =============================================
                  CAMPOS POR DEPORTE
              ============================================= */}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Object.entries(campos).map(([categoria, listaCampos]) => {
                  const isBase = categoria === "Base / Generales";

                  return (
                    <section
                      key={categoria}
                      className={isBase ? ui.baseCard : ui.card}
                      style={isBase ? ui.baseCardStyle : ui.cardStyle}
                    >
                      <div className="mb-3">
                        <h3 className="text-base font-extrabold" style={ui.sectionTitleStyle}>
                          {categoria}
                        </h3>

                        {isBase && (
                          <p className="text-[11px] mt-1" style={ui.subTextStyle}>
                            Común a todos los deportes
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{listaCampos.map(renderField)}</div>
                    </section>
                  );
                })}
              </div>

              {/* =============================================
                  BOTONES
              ============================================= */}

              <div className="flex flex-wrap justify-center gap-3 mt-7">
                <button
                  type="button"
                  onClick={handleResetLocal}
                  className={ui.btnGhost}
                  style={ui.ghostStyle}
                  disabled={!canWrite}
                  title={!canWrite ? "Solo lectura" : "Limpiar"}
                >
                  Limpiar a 0
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !canWrite || !deporteId || !SPORT_CONFIG[deporteId]}
                  className={ui.btnPrimary}
                  style={ui.primaryStyle}
                  title={
                    !canWrite ? "Solo roles 1 y 3 pueden guardar" : `Guardar estadísticas de ${sportConfig.nombre}`
                  }
                >
                  {submitting ? "Guardando..." : "Acumular y Guardar"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(backTo, {
                      replace: true,
                    })
                  }
                  className={ui.btnGhost}
                  style={ui.ghostStyle}
                >
                  Volver
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
