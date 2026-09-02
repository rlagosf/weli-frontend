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
   🎨 CONJUNTO X
========================================================= */

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

    /* ===============================================
         Formato histórico:
         "12"
      =============================================== */

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /* ===============================================
         Snapshot JSON
      =============================================== */

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

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const parsed = Number(rawRol);

  return Number.isInteger(parsed) && [1, 2, 3].includes(parsed) ? parsed : 0;
};

/* ─────────────────────────────────────────────────────────
   ACADEMIA JWT
   ADMIN / STAFF
───────────────────────────────────────────────────────── */

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

   REGLAS:

   ADMIN / STAFF
   → academia desde JWT.

   SUPERADMIN
   → academia desde selector.

   selectedAcademia NO se exige a roles 1/2.
========================================================= */

const ensureScopeOrRedirect = ({ navigate, isSuperTree }) => {
  const token = getToken?.() || "";

  /* ===============================================
       SIN TOKEN
    =============================================== */

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

    /* ===============================================
         TOKEN EXPIRADO
      =============================================== */

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

    /* ===============================================
         ROL INVÁLIDO
      =============================================== */

    if (![1, 2, 3].includes(rol)) {
      /*
       * Token decodificable pero rol ajeno
       * a este panel.
       */
      navigate("/admin", {
        replace: true,
      });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    /* =================================================
         SUPERADMIN TREE
      ================================================= */

    if (isSuperTree) {
      /*
       * Roles 1 y 2 no pueden utilizar
       * el árbol interno del Superadmin.
       *
       * NO se destruye sesión.
       */
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

      /*
       * Superadmin válido, pero sin
       * academia objetivo seleccionada.
       *
       * NO logout.
       */
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

    /* =================================================
         ADMIN TREE
      ================================================= */

    /*
     * Superadmin debe ingresar por su propio
     * árbol tenantizado.
     *
     * NO destruimos sesión.
     */
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

    /* =================================================
         ADMIN / STAFF
         roles 1 / 2

         ACADEMIA DESDE JWT.
      ================================================= */

    const academiaId = extractTokenAcademiaId(decoded);

    /*
     * Un token Admin/Staff del contrato vigente
     * debe contener academia_id.
     */
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
  /* =======================================================
     FÚTBOL
  ======================================================= */

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

  /* =======================================================
     VÓLEIBOL
  ======================================================= */

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

  /* =======================================================
     TENIS
  ======================================================= */

  3: {
    nombre: "Tenis",

    grupos: {
      Servicio: ["primer_servicio_pct", "puntos_primer_servicio", "puntos_segundo_servicio", "aces", "dobles_faltas"],

      "Break Points": ["break_points_oportunidades", "break_points_convertidos"],

      Juego: ["winners", "errores_no_forzados", "peloteos_cortos_ganados"],

      Totales: ["puntos_ganados_total", "juegos_ganados_total"],
    },
  },

  /* =======================================================
     PÁDEL
  ======================================================= */

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

  /* =======================================================
     TENIS DE MESA
  ======================================================= */

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

  /* =======================================================
     BÁSQUETBOL
  ======================================================= */

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

/* =========================================================
   LABELS
========================================================= */

const FIELD_LABELS = {
  /* =======================
     Base
  ======================= */

  minutos_jugados: "Minutos jugados",

  partidos_jugados: "Partidos jugados",

  lesiones: "Lesiones",

  dias_baja: "Días de baja",

  sanciones_federativas: "Sanciones federativas",

  /* =======================
     Fútbol
  ======================= */

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

  /* =======================
     Vóleibol
  ======================= */

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

  /* =======================
     Tenis
  ======================= */

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

  /* =======================
     Pádel
  ======================= */

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

  /* =======================
     Tenis de mesa
  ======================= */

  efectividad_servicio_pct: "Efectividad de servicio (%)",

  efectividad_devolucion_pct: "Efectividad de devolución (%)",

  puntos_presion_jugados: "Puntos de presión jugados",

  puntos_presion_ganados: "Puntos de presión ganados",

  dobles_puntos_jugados: "Puntos de dobles jugados",

  dobles_puntos_ganados: "Puntos de dobles ganados",

  fc_media: "Frecuencia cardíaca media",

  fc_max: "Frecuencia cardíaca máxima",

  lactato: "Lactato",

  /* =======================
     Básquetbol
  ======================= */

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
]);

/* =========================================================
   CAMPOS CON SIGNO
========================================================= */

const SIGNED_FIELDS = new Set(["plus_minus"]);

/* =========================================================
   CONFIG DEPORTE
========================================================= */

const getSportConfig = (deporteId) =>
  SPORT_CONFIG[Number(deporteId)] || {
    nombre: "Deporte no configurado",

    grupos: {},
  };

/* =========================================================
   GRUPOS
========================================================= */

const getGroupsForSport = (deporteId) => {
  const config = getSportConfig(deporteId);

  return {
    ...BASE_GROUP,
    ...config.grupos,
  };
};

/* =========================================================
   CAMPOS DEL DEPORTE
========================================================= */

const getAllFieldsForSport = (deporteId) => Array.from(new Set(Object.values(getGroupsForSport(deporteId)).flat()));

/* =========================================================
   FORM VACÍO
========================================================= */

const blankFormForSport = (deporteId, sid = null) => {
  const output = {
    stats_id: sid,
  };

  getAllFieldsForSport(deporteId).forEach((campo) => {
    output[campo] = 0;
  });

  return output;
};

/* =========================================================
   JOIN → FLAT
========================================================= */

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

/* =========================================================
   NORMALIZACIÓN NUMÉRICA
========================================================= */

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

/* =========================================================
   PAYLOAD EDITABLE
========================================================= */

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
  const { darkMode } = useTheme();

  const { rut } = useParams();

  const navigate = useNavigate();

  const location = useLocation();

  const mountedRef = useRef(true);

  /* =======================================================
     ÁRBOL
  ======================================================= */

  const superTree = useMemo(() => isSuperTreePath(location.pathname), [location.pathname]);

  const basePath = superTree ? SUPER_ADMIN_ROOT : "/admin";

  /* =======================================================
     VOLVER
  ======================================================= */

  const backTo = useMemo(
    () => location.state?.from || `${basePath}/registrar-estadisticas`,
    [location.state, basePath]
  );

  /* =======================================================
     AUTH / PERMISOS
  ======================================================= */

  const [rol, setRol] = useState(null);

  const [canWrite, setCanWrite] = useState(false);

  /* =======================================================
     JUGADOR
  ======================================================= */

  const [jugador, setJugador] = useState(null);

  const [jugadorId, setJugadorId] = useState(null);

  const [deporteId, setDeporteId] = useState(null);

  /* =======================================================
     STATS
  ======================================================= */

  const [statsId, setStatsId] = useState(null);

  const [formData, setFormData] = useState({});

  const [statsExistentes, setStatsExistentes] = useState(null);

  /* =======================================================
     UI STATE
  ======================================================= */

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
     UI
  ======================================================= */

  const ui = useMemo(() => {
    const shell =
      "min-h-screen font-sans " +
      (darkMode
        ? "bg-[#111827] text-white"
        : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron");

    const titleMain = darkMode ? "text-white" : "text-ra-marron";

    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const panel =
      "max-w-6xl mx-auto mt-6 rounded-2xl border shadow-lg overflow-hidden " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const card =
      "rounded-2xl border p-4 " + (darkMode ? "bg-white/8 border-white/15" : "bg-white/55 border-ra-marron/15");

    const baseCard =
      "rounded-2xl border p-4 " +
      (darkMode ? "bg-amber-500/[0.07] border-amber-300/15" : "bg-amber-50/70 border-amber-700/15");

    const pill =
      "rounded-xl border px-3 py-2 " + (darkMode ? "bg-black/20 border-white/15" : "bg-white/55 border-ra-marron/15");

    const input =
      "w-full p-2 rounded-lg text-sm outline-none border transition " +
      "focus:ring-2 focus:ring-[rgba(170,80,19,0.22)] focus:border-[rgba(170,80,19,0.35)] " +
      (darkMode
        ? "bg-black/25 text-white border-white/15 placeholder-white/60"
        : "bg-white/70 text-ra-marron border-ra-marron/20 placeholder-ra-marron/50");

    const sectionTitleStyle = {
      color: darkMode ? PALETTE.cream : PALETTE.brown,
    };

    const btnGhost =
      "px-6 py-2 rounded-xl font-extrabold border transition-all shadow-sm " +
      (darkMode
        ? "bg-white/10 border-white/15 hover:bg-white/15"
        : "bg-white/70 border-ra-marron/20 hover:bg-white/80");

    const btnPrimary =
      "px-6 py-2 rounded-xl font-extrabold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

    const btnPrimaryStyle = {
      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,

      color: "#1a1208",

      border: darkMode ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(109,88,41,0.18)",
    };

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold text-center " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-800");

    const info =
      "rounded-2xl border px-5 py-4 " +
      (darkMode ? "border-sky-300/15 bg-sky-500/[0.07] text-sky-100" : "border-sky-700/15 bg-sky-50/80 text-sky-900");

    return {
      shell,
      titleMain,
      subText,
      panel,
      card,
      baseCard,
      pill,
      input,
      sectionTitleStyle,
      btnGhost,
      btnPrimary,
      btnPrimaryStyle,
      danger,
      info,
    };
  }, [darkMode]);

  /* =======================================================
     DERIVADOS
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

  /* =======================================================
     RUT
  ======================================================= */

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

      /*
       * Roles:
       *
       * 1 Admin       → escritura
       * 2 Staff       → lectura
       * 3 Superadmin  → escritura
       */
      setCanWrite([1, 3].includes(guard.rol));
    }
  }, [navigate, superTree]);

  /* =======================================================
     CARGAR JUGADOR + STATS
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

        /* =================================================
             1. INTENTAR POR ID
          ================================================= */

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

            /*
             * IMPORTANTE:
             *
             * 401/403 NO son motivo para intentar
             * otro endpoint.
             *
             * Deben llegar al manejador principal.
             */
            if (status === 401 || status === 403) {
              throw jugadorIdError;
            }

            /*
             * 404:
             * permitimos fallback por RUT.
             *
             * Para mantener la compatibilidad del
             * flujo existente, otros errores de
             * resolución del ID también permiten
             * intentar por RUT.
             */
          }
        }

        /* =================================================
             2. FALLBACK POR RUT
          ================================================= */

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

        /* =================================================
             JUGADOR NO ENCONTRADO
          ================================================= */

        if (!jRaw) {
          setError("El jugador no existe.");

          return;
        }

        /* =================================================
             RESOLVER ID
          ================================================= */

        const inferredJugadorId = Number(jRaw?.id ?? jRaw?.jugador_id ?? 0) || null;

        if (!jid && inferredJugadorId) {
          jid = inferredJugadorId;
        }

        if (!jid) {
          setError("No se pudo resolver jugador_id.");

          return;
        }

        /* =================================================
             DEPORTE
          ================================================= */

        const depId = Number(jRaw?.deporte_id ?? location.state?.scope?.deporte_id ?? 0) || null;

        if (!depId) {
          setJugador(jRaw);

          setJugadorId(jid);

          setDeporteId(null);

          setError("No se pudo determinar el deporte del jugador.");

          return;
        }

        /* =================================================
             DEPORTE NO CONFIGURADO
          ================================================= */

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

        /* =================================================
             STATS
          ================================================= */

        const joinedRes = await api.get(`/estadisticas/by-jugador/${encodeURIComponent(String(jid))}`, {
          meta: {
            isPublic: false,
          },
        });

        if (!alive) {
          return;
        }

        const joined = joinedRes?.data?.item ?? joinedRes?.data?.data?.item ?? null;

        /* =================================================
             SIN ESTADÍSTICAS
          ================================================= */

        if (!joined) {
          setStatsExistentes({});

          setStatsId(null);

          setFormData(blankFormForSport(depId, null));

          return;
        }

        /* =================================================
             STATS EXISTENTES
          ================================================= */

        const flat = flattenJoinedForSport(joined, depId);

        const sid = Number(flat?.stats_id ?? flat?.id ?? 0) || null;

        setStatsId(sid);

        setStatsExistentes(flat);

        /*
         * Modo acumulativo:
         *
         * El formulario comienza en cero
         * y cada valor ingresado se suma
         * al acumulado actual.
         */
        setFormData(blankFormForSport(depId, sid));
      } catch (err) {
        const status = getErrStatus(err);

        /* ===============================================
             401
          =============================================== */

        if (status === 401) {
          clearToken?.();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* ===============================================
             403

             NO LOGOUT
          =============================================== */

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

        /* ===============================================
             404
          =============================================== */

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
     CAMBIO DE CAMPO
  ======================================================= */

  const handleChange = (campo, value) => {
    setFormData((previous) => ({
      ...previous,

      [campo]: normalizeNumeric(campo, value),
    }));
  };

  /* =======================================================
     RESET LOCAL
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

    /* =================================================
         PERMISO DE ESCRITURA
      ================================================= */

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
      /* =================================================
           ACUMULADOS ACTUALES
        ================================================= */

      const currentStats = statsExistentes && typeof statsExistentes === "object" ? statsExistentes : {};

      /* =================================================
           INCREMENTOS
        ================================================= */

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

      /* =================================================
           UPDATE
        ================================================= */

      if (statsId) {
        await api.put(`/estadisticas/${encodeURIComponent(String(statsId))}`, payload, {
          meta: {
            isPublic: false,
          },
        });
      } else {

      /* =================================================
           CREATE

           Se conserva exactamente el contrato existente
           del componente.
        ================================================= */
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

      /* ===============================================
           401
        =============================================== */

      if (status === 401) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      /* ===============================================
           403

           NO LOGOUT
        =============================================== */

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
      <div className={`${ui.shell} flex justify-center items-center`}>
        <LoaderCircle
          className="animate-spin w-12 h-12"
          style={{
            color: ACCENT,
          }}
        />
      </div>
    );
  }

  /* =======================================================
     PRESENTACIÓN JUGADOR
  ======================================================= */

  const nombreJugador = jugador?.nombre_jugador ?? jugador?.nombre ?? "Jugador";

  /* =======================================================
     RENDER CAMPO
  ======================================================= */

  const renderField = (campo) => {
    const isDecimal = DECIMAL_FIELDS.has(campo);

    const isSigned = SIGNED_FIELDS.has(campo);

    return (
      <div key={campo} className="space-y-1">
        <label className={`block text-xs sm:text-sm font-semibold ${darkMode ? "text-white/85" : "text-ra-marron/85"}`}>
          {pretty(campo)}
        </label>

        <input
          type="number"
          min={isSigned ? undefined : "0"}
          step={isDecimal ? "0.01" : "1"}
          value={formData?.[campo] ?? 0}
          onChange={(event) => handleChange(campo, event.target.value)}
          className={ui.input}
          disabled={!canWrite}
        />
      </div>
    );
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.shell}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>Registrar Estadísticas</h1>

        <p className={`text-xl sm:text-2xl mt-2 ${ui.subText}`}>
          {nombreJugador}
          {" · "}
          RUT: <span className="font-semibold">{rutConDV}</span>
        </p>

        <div className={`mt-2 text-sm sm:text-base ${ui.subText}`}>
          <span className="font-extrabold">{sportConfig.nombre}</span>

          {jugadorId ? ` · Jugador ID: ${jugadorId}` : ""}

          {statsId ? ` · Stats ID: ${statsId}` : " · Stats: nuevo"}

          {!canWrite ? " · Solo lectura" : ""}
        </div>
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="px-6 pb-20">
        {/* ===============================================
            ERROR
        =============================================== */}

        {error && (
          <div className="max-w-6xl mx-auto mt-6">
            <div className={ui.danger}>{error}</div>
          </div>
        )}

        {/* ===============================================
            INFO
        =============================================== */}

        <div className="max-w-6xl mx-auto mt-6">
          <div className={ui.info}>
            <div className="font-extrabold">Estadísticas de {sportConfig.nombre}</div>

            <div className="text-sm mt-1 opacity-80">
              Las métricas de <b>Base / Generales</b> pertenecen a <code>stats_base</code>. Las demás corresponden al
              bloque específico de {sportConfig.nombre}.
            </div>
          </div>
        </div>

        {/* ===============================================
            PANEL
        =============================================== */}

        <div className={ui.panel}>
          <div className="p-4 md:p-6">
            {/* ===========================================
                VALORES ACTUALES
            =========================================== */}

            {statsExistentes && typeof statsExistentes === "object" && Object.keys(statsExistentes).length > 0 && (
              <div className={`${ui.card} mb-5`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold" style={ui.sectionTitleStyle}>
                      Valores actuales (acumulados)
                    </h2>

                    <p className={`text-xs mt-1 ${ui.subText}`}>
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
                  >
                    Volver
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                  {allFields.map((campo) => (
                    <div key={campo} className={`flex items-center justify-between gap-2 ${ui.pill}`}>
                      <span className={darkMode ? "text-white/80" : "text-ra-marron/80"}>{pretty(campo)}</span>

                      <span className={darkMode ? "text-white font-extrabold" : "text-ra-marron font-extrabold"}>
                        {DECIMAL_FIELDS.has(campo)
                          ? Number(statsExistentes?.[campo] ?? 0).toFixed(2)
                          : Number(statsExistentes?.[campo] ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className={`mt-3 text-[12px] ${ui.subText}`}>
                  Lo que ingreses abajo se <b>suma</b> a estos valores.
                </p>
              </div>
            )}

            {/* ===========================================
                FORMULARIO DINÁMICO
            =========================================== */}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Object.entries(campos).map(([categoria, listaCampos]) => {
                const isBase = categoria === "Base / Generales";

                return (
                  <section key={categoria} className={isBase ? ui.baseCard : ui.card}>
                    <div className="mb-3">
                      <h3 className="text-base font-extrabold" style={ui.sectionTitleStyle}>
                        {categoria}
                      </h3>

                      {isBase && <p className={`text-[11px] mt-1 ${ui.subText}`}>Común a todos los deportes</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{listaCampos.map(renderField)}</div>
                  </section>
                );
              })}
            </div>

            {/* ===========================================
                ACCIONES
            =========================================== */}

            <div className="flex flex-wrap justify-center gap-3 mt-7">
              <button
                type="button"
                onClick={handleResetLocal}
                className={ui.btnGhost}
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
                style={{
                  ...(ui.btnPrimaryStyle || {}),

                  opacity: submitting || !canWrite ? 0.6 : 1,
                }}
                title={!canWrite ? "Solo roles 1 y 3 pueden guardar" : `Guardar estadísticas de ${sportConfig.nombre}`}
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
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
