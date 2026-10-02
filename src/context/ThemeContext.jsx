// src/context/ThemeContext.jsx

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { jwtDecode } from "jwt-decode";

import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../services/api";

/* =========================================================
   CONTEXT
========================================================= */

const ThemeContext = createContext(null);

/* =========================================================
   ENDPOINT
========================================================= */

const TEMA_PATH = "/academia-tema";

/* =========================================================
   TEMA WELI POR DEFECTO

   Estos 6 colores continúan siendo el contrato persistente
   con backend. No se modifica la estructura almacenada.
========================================================= */

export const DEFAULT_ACADEMIA_THEME = {
  color_fondo: "#F5E8D0",
  color_tarjeta: "#FFFFFF",
  color_primario: "#AA5013",
  color_secundario: "#6D5829",
  color_texto: "#3B2A1E",
  color_icono: "#AA5013",
};

/* =========================================================
   VARIABLES CSS PRINCIPALES

   Se mantienen por compatibilidad:

   var(--weli-bg)
   var(--weli-card)
   var(--weli-primary)
   var(--weli-secondary)
   var(--weli-text)
   var(--weli-icon)

   Además se generan tokens semánticos para superficies,
   inputs, tablas, bordes, textos secundarios y Dark Mode.
========================================================= */

const CSS_VARIABLES = {
  color_fondo: "--weli-bg",
  color_tarjeta: "--weli-card",
  color_primario: "--weli-primary",
  color_secundario: "--weli-secondary",
  color_texto: "--weli-text",
  color_icono: "--weli-icon",
};

/* =========================================================
   HELPERS AUTH
========================================================= */

function extractRol(decoded) {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function isTokenExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  return exp <= Math.floor(Date.now() / 1000);
}

/* =========================================================
   ACADEMIA SELECCIONADA

   Utilizado únicamente para decidir si un Superadmin posee
   actualmente un tenant efectivo.

   La autoridad final continúa siendo services/api.js:

   - Superadmin:
       localStorage -> x-academia-id

   - Admin / Staff:
       academia_id firmada dentro del JWT
========================================================= */

function getSelectedAcademiaId() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return 0;
    }

    /*
     * Compatibilidad con una eventual representación
     * histórica en formato:
     *
     * "3"
     */
    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /*
     * Formato actual:
     *
     * {
     *   id: 3,
     *   nombre: "...",
     *   ...
     * }
     */
    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? 0);

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/* =========================================================
   HELPERS TEMA
========================================================= */

function normalizeHex(value, fallback) {
  const color = String(value ?? "")
    .trim()
    .toUpperCase();

  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function normalizeTheme(value = {}) {
  return {
    color_fondo: normalizeHex(value?.color_fondo, DEFAULT_ACADEMIA_THEME.color_fondo),

    color_tarjeta: normalizeHex(value?.color_tarjeta, DEFAULT_ACADEMIA_THEME.color_tarjeta),

    color_primario: normalizeHex(value?.color_primario, DEFAULT_ACADEMIA_THEME.color_primario),

    color_secundario: normalizeHex(value?.color_secundario, DEFAULT_ACADEMIA_THEME.color_secundario),

    color_texto: normalizeHex(value?.color_texto, DEFAULT_ACADEMIA_THEME.color_texto),

    color_icono: normalizeHex(value?.color_icono, DEFAULT_ACADEMIA_THEME.color_icono),
  };
}

function hexToRgb(hex) {
  const value = String(hex ?? "")
    .replace("#", "")
    .trim();

  if (!/^[0-9A-Fa-f]{6}$/.test(value)) {
    return {
      r: 0,
      g: 0,
      b: 0,
    };
  }

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function hexToRgbChannels(hex) {
  const { r, g, b } = hexToRgb(hex);

  return `${r} ${g} ${b}`;
}

function rgbToHex(r, g, b) {
  const toHex = (value) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Mezcla colorA con colorB.
 *
 * amount:
 * 0 = colorA
 * 1 = colorB
 */
function mixHex(colorA, colorB, amount = 0.5) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);

  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));

  return rgbToHex(a.r + (b.r - a.r) * ratio, a.g + (b.g - a.g) * ratio, a.b + (b.b - a.b) * ratio);
}

function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);

  const normalizeChannel = (channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  const red = normalizeChannel(r);
  const green = normalizeChannel(g);
  const blue = normalizeChannel(b);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastText(background) {
  const luminance = getRelativeLuminance(background);

  return luminance > 0.46 ? "#1F2937" : "#FFFFFF";
}

/**
 * Algunos colores personalizados pueden ser demasiado oscuros
 * para utilizarse como acento dentro del Dark Mode.
 *
 * No modificamos el color persistido en backend.
 * Solamente obtenemos una representación visual apropiada.
 */
function normalizeDarkAccent(color) {
  const luminance = getRelativeLuminance(color);

  if (luminance < 0.045) {
    return mixHex(color, "#FFFFFF", 0.34);
  }

  if (luminance < 0.09) {
    return mixHex(color, "#FFFFFF", 0.22);
  }

  return color;
}

/* =========================================================
   GENERADOR DE TOKENS SEMÁNTICOS
========================================================= */

function buildThemeTokens(theme, darkMode = false) {
  const normalized = normalizeTheme(theme);

  /* =======================================================
     LIGHT MODE
  ======================================================= */

  if (!darkMode) {
    const primary = normalized.color_primario;

    const secondary = normalized.color_secundario;

    const background = normalized.color_fondo;

    const card = normalized.color_tarjeta;

    const text = normalized.color_texto;

    const icon = normalized.color_icono;

    const surface = mixHex(card, background, 0.06);

    const surfaceSoft = mixHex(card, background, 0.16);

    const surfaceHover = mixHex(card, primary, 0.07);

    const textMuted = mixHex(text, background, 0.32);

    const border = mixHex(card, secondary, 0.22);

    const borderStrong = mixHex(card, secondary, 0.4);

    const inputBorder = mixHex(card, secondary, 0.42);

    const tableHead = mixHex(card, primary, 0.1);

    const primaryHover = mixHex(primary, "#000000", 0.1);

    const secondaryHover = mixHex(secondary, "#000000", 0.1);

    return {
      mode: "light",

      bg: background,
      bgSoft: mixHex(background, card, 0.22),

      card: surface,

      surface,
      surfaceSoft,
      surface2: surfaceSoft,
      surfaceHover,

      primary,
      primaryHover,
      primaryContrast: getContrastText(primary),

      secondary,
      secondaryHover,
      secondaryContrast: getContrastText(secondary),

      text,
      textMuted,

      icon,

      border,
      borderStrong,

      inputBg: card,
      inputText: text,
      inputBorder,

      tableHead,

      focus: primary,

      overlay: "#000000",
    };
  }

  /* =======================================================
     DARK MODE
  ======================================================= */

  const primary = normalizeDarkAccent(normalized.color_primario);

  const secondary = normalizeDarkAccent(normalized.color_secundario);

  const icon = normalizeDarkAccent(normalized.color_icono);

  /*
   * Base oscura WELI:
   *
   * #111827 / #1F2937.
   *
   * La paleta de academia tiñe estas superficies sin
   * convertir Dark Mode en una inversión clara.
   */
  const background = mixHex("#111827", normalized.color_fondo, 0.1);

  const backgroundSoft = mixHex("#172033", normalized.color_fondo, 0.08);

  const surface = mixHex("#1F2937", normalized.color_tarjeta, 0.08);

  const surfaceSoft = mixHex("#172033", normalized.color_tarjeta, 0.06);

  const surface2 = mixHex("#263244", normalized.color_tarjeta, 0.08);

  const surfaceHover = mixHex("#374151", primary, 0.1);

  /*
   * En Dark Mode el texto necesita mantenerse claro.
   * Se conserva una pequeña influencia del color_texto
   * configurado por la academia.
   */
  const text = mixHex("#F9FAFB", normalized.color_texto, 0.1);

  const textMuted = mixHex("#D1D5DB", normalized.color_texto, 0.12);

  const border = mixHex("#374151", secondary, 0.2);

  const borderStrong = mixHex("#4B5563", secondary, 0.28);

  const inputBg = mixHex("#111827", normalized.color_tarjeta, 0.05);

  const inputBorder = mixHex("#4B5563", secondary, 0.2);

  const tableHead = mixHex("#111827", primary, 0.14);

  const primaryHover = mixHex(primary, "#FFFFFF", 0.12);

  const secondaryHover = mixHex(secondary, "#FFFFFF", 0.12);

  return {
    mode: "dark",

    bg: background,
    bgSoft: backgroundSoft,

    card: surface,

    surface,
    surfaceSoft,
    surface2,
    surfaceHover,

    primary,
    primaryHover,
    primaryContrast: getContrastText(primary),

    secondary,
    secondaryHover,
    secondaryContrast: getContrastText(secondary),

    text,
    textMuted,

    icon,

    border,
    borderStrong,

    inputBg,
    inputText: text,
    inputBorder,

    tableHead,

    focus: primary,

    overlay: "#000000",
  };
}

/* =========================================================
   ESCRITURA DE VARIABLES CSS

   Cada variable HEX recibe también una versión RGB:

   --weli-surface
   --weli-surface-rgb

   Permite utilizar:
   rgb(var(--weli-surface-rgb) / 0.70)
========================================================= */

function setCssColorVariable(root, name, value) {
  if (!root || !name || !value) {
    return;
  }

  root.style.setProperty(name, value);

  if (/^#[0-9A-Fa-f]{6}$/.test(String(value))) {
    root.style.setProperty(`${name}-rgb`, hexToRgbChannels(value));
  }
}

/* =========================================================
   HELPERS ERROR
========================================================= */

function getErrorStatus(error) {
  return Number(error?.status ?? error?.response?.status ?? 0);
}

function getErrorMessage(error, fallback = "Ocurrió un error inesperado.") {
  return error?.data?.message ?? error?.response?.data?.message ?? error?.message ?? fallback;
}

/* =========================================================
   PROVIDER
========================================================= */

export const ThemeProvider = ({ children }) => {
  /* =======================================================
     MODO OSCURO
  ======================================================= */

  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem("modoOscuro");

      return stored === "true";
    } catch {
      return false;
    }
  });

  /*
   * Ref utilizado para que las funciones de tema puedan
   * conocer el modo actual sin volver inestables callbacks.
   */
  const darkModeRef = useRef(darkMode);

  /* =======================================================
     TEMA DE ACADEMIA
  ======================================================= */

  const [academiaTheme, setAcademiaTheme] = useState(DEFAULT_ACADEMIA_THEME);

  const [temaPersonalizado, setTemaPersonalizado] = useState(false);

  const [temaLoading, setTemaLoading] = useState(false);

  const [temaError, setTemaError] = useState("");

  /* =======================================================
     PERSISTENCIA DARK MODE
  ======================================================= */

  useEffect(() => {
    darkModeRef.current = darkMode;

    try {
      localStorage.setItem("modoOscuro", String(darkMode));
    } catch {}
  }, [darkMode]);

  /* =======================================================
     TOGGLE DARK MODE
  ======================================================= */

  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  /* =======================================================
     APLICAR VARIABLES CSS GLOBALES
  ======================================================= */

  const applyAcademiaTheme = useCallback((theme, forceDarkMode) => {
    const normalized = normalizeTheme(theme);

    const effectiveDarkMode = typeof forceDarkMode === "boolean" ? forceDarkMode : darkModeRef.current;

    const tokens = buildThemeTokens(normalized, effectiveDarkMode);

    if (typeof document !== "undefined") {
      const root = document.documentElement;

      /* -----------------------------------------------
             PALETA ORIGINAL / RAW
          ----------------------------------------------- */

      setCssColorVariable(root, "--weli-theme-bg", normalized.color_fondo);

      setCssColorVariable(root, "--weli-theme-card", normalized.color_tarjeta);

      setCssColorVariable(root, "--weli-theme-primary", normalized.color_primario);

      setCssColorVariable(root, "--weli-theme-secondary", normalized.color_secundario);

      setCssColorVariable(root, "--weli-theme-text", normalized.color_texto);

      setCssColorVariable(root, "--weli-theme-icon", normalized.color_icono);

      /* -----------------------------------------------
             VARIABLES HISTÓRICAS WELI
          ----------------------------------------------- */

      const compatibilityValues = {
        color_fondo: tokens.bg,

        color_tarjeta: tokens.card,

        color_primario: tokens.primary,

        color_secundario: tokens.secondary,

        color_texto: tokens.text,

        color_icono: tokens.icon,
      };

      for (const [themeKey, cssVariable] of Object.entries(CSS_VARIABLES)) {
        setCssColorVariable(root, cssVariable, compatibilityValues[themeKey]);
      }

      /* -----------------------------------------------
             TOKENS SEMÁNTICOS
          ----------------------------------------------- */

      setCssColorVariable(root, "--weli-bg-soft", tokens.bgSoft);

      setCssColorVariable(root, "--weli-surface", tokens.surface);

      setCssColorVariable(root, "--weli-surface-soft", tokens.surfaceSoft);

      setCssColorVariable(root, "--weli-surface-2", tokens.surface2);

      setCssColorVariable(root, "--weli-surface-hover", tokens.surfaceHover);

      setCssColorVariable(root, "--weli-primary-hover", tokens.primaryHover);

      setCssColorVariable(root, "--weli-primary-contrast", tokens.primaryContrast);

      setCssColorVariable(root, "--weli-secondary-hover", tokens.secondaryHover);

      setCssColorVariable(root, "--weli-secondary-contrast", tokens.secondaryContrast);

      setCssColorVariable(root, "--weli-text-muted", tokens.textMuted);

      setCssColorVariable(root, "--weli-border", tokens.border);

      setCssColorVariable(root, "--weli-border-strong", tokens.borderStrong);

      setCssColorVariable(root, "--weli-input-bg", tokens.inputBg);

      setCssColorVariable(root, "--weli-input-text", tokens.inputText);

      setCssColorVariable(root, "--weli-input-border", tokens.inputBorder);

      setCssColorVariable(root, "--weli-table-head", tokens.tableHead);

      setCssColorVariable(root, "--weli-focus", tokens.focus);

      setCssColorVariable(root, "--weli-overlay", tokens.overlay);

      /* -----------------------------------------------
             ESTADO GLOBAL DEL DOCUMENTO
          ----------------------------------------------- */

      root.dataset.weliTheme = "academy";

      root.dataset.weliMode = tokens.mode;

      root.style.colorScheme = effectiveDarkMode ? "dark" : "light";

      root.classList.toggle("dark", effectiveDarkMode);
    }

    return normalized;
  }, []);

  /* =======================================================
     APLICAR TEMA LOCAL
  ======================================================= */

  const setAcademiaThemeLocal = useCallback(
    (theme, personalizado = true) => {
      const normalized = applyAcademiaTheme(theme);

      setAcademiaTheme(normalized);

      setTemaPersonalizado(Boolean(personalizado));

      setTemaError("");

      return normalized;
    },
    [applyAcademiaTheme]
  );

  /* =======================================================
     RESTAURAR TEMA WELI LOCALMENTE
  ======================================================= */

  const restoreDefaultThemeLocally = useCallback(() => {
    const normalized = applyAcademiaTheme(DEFAULT_ACADEMIA_THEME);

    setAcademiaTheme(normalized);

    setTemaPersonalizado(false);

    setTemaError("");

    return normalized;
  }, [applyAcademiaTheme]);

  /* =======================================================
     IDENTIFICAR SESIÓN ADMINISTRATIVA
  ======================================================= */

  const getAdministrativeSession = useCallback(() => {
    const token = getToken?.() || "";

    /*
     * Sin token:
     * probablemente estamos en área pública.
     */
    if (!token) {
      return {
        valid: false,
        rol: 0,
        token: "",
        reason: "NO_TOKEN",
      };
    }

    try {
      const decoded = jwtDecode(token);

      /*
       * TOKEN EXPIRADO
       */
      if (isTokenExpired(decoded)) {
        clearToken?.();

        return {
          valid: false,
          rol: 0,
          token: "",
          reason: "EXPIRED",
        };
      }

      const rol = extractRol(decoded);

      /*
       * Roles administrativos:
       *
       * 1 Admin
       * 2 Staff
       * 3 Superadmin
       */
      if (![1, 2, 3].includes(rol)) {
        return {
          valid: false,
          rol,
          token,
          reason: "NON_ADMIN_ROLE",
        };
      }

      return {
        valid: true,
        rol,
        token,
        decoded,
        reason: null,
      };
    } catch {
      /*
       * JWT ilegible / corrupto.
       */
      clearToken?.();

      return {
        valid: false,
        rol: 0,
        token: "",
        reason: "INVALID_TOKEN",
      };
    }
  }, []);

  /* =======================================================
     CARGAR TEMA DESDE BACKEND

     Admin / Staff:
     academia efectiva desde JWT.

     Superadmin:
     academia efectiva mediante x-academia-id,
     gestionada por services/api.

     IMPORTANTE:
     Superadmin sin academia seleccionada se encuentra en
     contexto global. En ese estado NO debe consultar
     /academia-tema.
  ======================================================= */

  const refreshAcademiaTheme = useCallback(
    async ({ signal } = {}) => {
      const session = getAdministrativeSession();

      /*
       * Sin sesión administrativa:
       * utilizamos WELI por defecto.
       */
      if (!session.valid) {
        setTemaError("");

        const normalized = restoreDefaultThemeLocally();

        return {
          ok: false,
          skipped: true,
          reason: session.reason,
          personalizado: false,
          tema: normalized,
        };
      }

      /* ===============================================
           SUPERADMIN SIN ACADEMIA SELECCIONADA

           Este es el estado correcto del SuperDashboard
           global.

           Todavía no existe un tenant efectivo.

           services/api.js no puede generar
           x-academia-id porque no existe selección y el
           backend correctamente rechazaría la petición.

           Por tanto NO realizamos el GET.
        =============================================== */

      if (session.rol === 3 && getSelectedAcademiaId() <= 0) {
        setTemaError("");

        const normalized = restoreDefaultThemeLocally();

        return {
          ok: true,
          skipped: true,

          reason: "SUPERADMIN_WITHOUT_SELECTED_ACADEMIA",

          academia_id: null,

          personalizado: false,

          tema: normalized,
        };
      }

      setTemaLoading(true);
      setTemaError("");

      try {
        const response = await api.get(TEMA_PATH, {
          signal,

          headers: {
            "Cache-Control": "no-cache",
          },
        });

        const data = response?.data ?? response;

        const normalized = applyAcademiaTheme(data?.tema ?? DEFAULT_ACADEMIA_THEME);

        setAcademiaTheme(normalized);

        setTemaPersonalizado(Boolean(data?.personalizado));

        setTemaError("");

        return {
          ok: true,
          skipped: false,

          academia_id: data?.academia_id ?? null,

          personalizado: Boolean(data?.personalizado),

          tema: normalized,
        };
      } catch (error) {
        /*
         * Cancelación normal.
         */
        if (signal?.aborted) {
          return {
            ok: false,
            aborted: true,
          };
        }

        const status = getErrorStatus(error);

        /* =============================================
             401

             Token inválido / expirado.
          ============================================= */

        if (status === 401) {
          clearToken?.();

          const normalized = restoreDefaultThemeLocally();

          setTemaError("Sesión expirada.");

          return {
            ok: false,
            status,

            personalizado: false,

            tema: normalized,
          };
        }

        /* =============================================
             403

             NO destruimos sesión.

             Puede seguir ocurriendo si existe un
             desajuste de tenant real.
          ============================================= */

        if (status === 403) {
          const normalized = restoreDefaultThemeLocally();

          setTemaError(getErrorMessage(error, "No existe una academia efectiva disponible para cargar el tema."));

          return {
            ok: false,
            status,

            personalizado: false,

            tema: normalized,
          };
        }

        /* =============================================
             OTROS ERRORES
          ============================================= */

        const normalized = restoreDefaultThemeLocally();

        setTemaError(getErrorMessage(error, "No fue posible cargar el tema de la academia."));

        return {
          ok: false,
          status,

          personalizado: false,

          tema: normalized,
        };
      } finally {
        if (!signal?.aborted) {
          setTemaLoading(false);
        }
      }
    },
    [applyAcademiaTheme, getAdministrativeSession, restoreDefaultThemeLocally]
  );

  /* =======================================================
     APLICAR ESTADO DEL CONTEXTO A CSS

     Depende de:
     - academiaTheme
     - darkMode

     No requiere volver a consultar backend.
  ======================================================= */

  useEffect(() => {
    darkModeRef.current = darkMode;

    applyAcademiaTheme(academiaTheme, darkMode);
  }, [academiaTheme, darkMode, applyAcademiaTheme]);

  /* =======================================================
     CARGA INICIAL

     Admin / Staff:
     cargará tema normalmente.

     Superadmin:
     sólo consultará backend si ya existe una academia
     seleccionada.

     Superadmin global:
     mantendrá tema WELI.
  ======================================================= */

  useEffect(() => {
    const controller = new AbortController();

    refreshAcademiaTheme({
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [refreshAcademiaTheme]);

  /* =======================================================
     CAMBIO DE SESIÓN
  ======================================================= */

  useEffect(() => {
    const handleSessionChanged = () => {
      const session = getAdministrativeSession();

      if (!session.valid) {
        restoreDefaultThemeLocally();
        return;
      }

      /*
       * refreshAcademiaTheme ya sabe distinguir:
       *
       * Superadmin con academia
       * Superadmin sin academia.
       */
      refreshAcademiaTheme();
    };

    window.addEventListener("weli:sessionChanged", handleSessionChanged);

    return () => {
      window.removeEventListener("weli:sessionChanged", handleSessionChanged);
    };
  }, [getAdministrativeSession, refreshAcademiaTheme, restoreDefaultThemeLocally]);

  /* =======================================================
     CAMBIO DE ACADEMIA EN SUPERADMIN

     SuperDashboard emite:

     weli:selectedAcademiaChanged

     Tanto seleccionar como eliminar la selección pasa por
     refreshAcademiaTheme.

     - si existe academia -> obtiene su tema;
     - si no existe       -> restaura WELI localmente.
  ======================================================= */

  useEffect(() => {
    const handleSelectedAcademiaChanged = () => {
      const session = getAdministrativeSession();

      if (!session.valid) {
        restoreDefaultThemeLocally();
        return;
      }

      refreshAcademiaTheme();
    };

    window.addEventListener("weli:selectedAcademiaChanged", handleSelectedAcademiaChanged);

    return () => {
      window.removeEventListener("weli:selectedAcademiaChanged", handleSelectedAcademiaChanged);
    };
  }, [getAdministrativeSession, refreshAcademiaTheme, restoreDefaultThemeLocally]);

  /* =======================================================
     ACTUALIZACIÓN AL RECUPERAR FOCO

     Útil cuando:
     - se inicia sesión;
     - cambia información desde otra pestaña;
     - se vuelve a WELI después de una pausa.

     Superadmin sin selección no consulta backend.
  ======================================================= */

  useEffect(() => {
    const handleFocus = () => {
      const session = getAdministrativeSession();

      if (!session.valid) {
        return;
      }

      refreshAcademiaTheme();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [getAdministrativeSession, refreshAcademiaTheme]);

  /* =======================================================
     TOKENS RESUELTOS
  ======================================================= */

  const themeTokens = useMemo(() => buildThemeTokens(academiaTheme, darkMode), [academiaTheme, darkMode]);

  /* =======================================================
     VALUE
  ======================================================= */

  const value = useMemo(
    () => ({
      /* -----------------------------------------------
         MODO OSCURO
      ----------------------------------------------- */

      darkMode,
      toggleTheme,

      /* -----------------------------------------------
         TEMA ACADEMIA
      ----------------------------------------------- */

      academiaTheme,

      temaPersonalizado,

      temaLoading,

      temaError,

      /*
       * Tema ya resuelto para modo actual.
       */
      themeTokens,

      /* -----------------------------------------------
         ACCIONES
      ----------------------------------------------- */

      refreshAcademiaTheme,

      setAcademiaThemeLocal,

      restoreDefaultThemeLocally,

      /* -----------------------------------------------
         DEFAULT
      ----------------------------------------------- */

      defaultAcademiaTheme: DEFAULT_ACADEMIA_THEME,
    }),
    [
      darkMode,
      toggleTheme,

      academiaTheme,
      temaPersonalizado,
      temaLoading,
      temaError,

      themeTokens,

      refreshAcademiaTheme,
      setAcademiaThemeLocal,
      restoreDefaultThemeLocally,
    ]
  );

  /* =======================================================
     PROVIDER
  ======================================================= */

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/* =========================================================
   HOOK
========================================================= */

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme debe utilizarse dentro de ThemeProvider");
  }

  return context;
};
