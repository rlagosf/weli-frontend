import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Check, Palette, RefreshCw, RotateCcw, Save, Sparkles } from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

const TEMA_PATH = "/academia-tema";

const DEFAULT_THEME = {
  color_fondo: "#F5E8D0",
  color_tarjeta: "#FFFFFF",
  color_primario: "#AA5013",
  color_secundario: "#6D5829",
  color_texto: "#3B2A1E",
  color_icono: "#AA5013",
};

const THEME_FIELDS = [
  {
    key: "color_fondo",
    label: "Fondo principal",
    description: "Color general de fondo para las vistas y dashboards.",
  },
  {
    key: "color_tarjeta",
    label: "Fondo de tarjetas",
    description: "Color base para tarjetas, paneles y contenedores principales.",
  },
  {
    key: "color_primario",
    label: "Color primario",
    description: "Color principal para acciones, botones y elementos destacados.",
  },
  {
    key: "color_secundario",
    label: "Color secundario",
    description: "Color complementario para detalles y elementos de apoyo.",
  },
  {
    key: "color_texto",
    label: "Color de texto",
    description: "Color principal para títulos, textos y contenido general.",
  },
  {
    key: "color_icono",
    label: "Color de iconos",
    description: "Color utilizado para iconografía y elementos gráficos.",
  },
];

function isTokenExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) return true;

  return exp <= Math.floor(Date.now() / 1000);
}

function extractRol(decoded) {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function normalizeHex(value, fallback) {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  return /^#[0-9A-F]{6}$/.test(text) ? text : fallback;
}

function normalizeTheme(value = {}) {
  return {
    color_fondo: normalizeHex(value.color_fondo, DEFAULT_THEME.color_fondo),
    color_tarjeta: normalizeHex(value.color_tarjeta, DEFAULT_THEME.color_tarjeta),
    color_primario: normalizeHex(value.color_primario, DEFAULT_THEME.color_primario),
    color_secundario: normalizeHex(value.color_secundario, DEFAULT_THEME.color_secundario),
    color_texto: normalizeHex(value.color_texto, DEFAULT_THEME.color_texto),
    color_icono: normalizeHex(value.color_icono, DEFAULT_THEME.color_icono),
  };
}

function sameTheme(a, b) {
  return THEME_FIELDS.every(
    (field) => String(a?.[field.key] ?? "").toUpperCase() === String(b?.[field.key] ?? "").toUpperCase()
  );
}

function SuccessModal({ open, title, message, onAccept, tokens }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
        style={{
          backgroundColor: tokens.surface,
          borderColor: tokens.borderStrong,
          color: tokens.text,
        }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: "#16A34A20",
            color: "#22C55E",
          }}
        >
          <Check className="h-7 w-7" />
        </div>

        <div className="mt-4 text-center">
          <h3 className="text-xl font-extrabold">{title}</h3>

          <p
            className="mt-2 text-sm leading-relaxed"
            style={{
              color: tokens.textMuted,
            }}
          >
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-extrabold transition hover:opacity-90 active:scale-[0.99]"
          style={{
            backgroundColor: tokens.primary,
            borderColor: tokens.primary,
            color: tokens.primaryContrast,
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}

export default function CambiarTema() {
  const { darkMode, themeTokens, setAcademiaThemeLocal, restoreDefaultThemeLocally } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);

  const [tema, setTema] = useState(DEFAULT_THEME);
  const [temaGuardado, setTemaGuardado] = useState(DEFAULT_THEME);
  const [personalizado, setPersonalizado] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reloadBusy, setReloadBusy] = useState(false);

  const [error, setError] = useState("");

  const [successModal, setSuccessModal] = useState({
    open: false,
    title: "",
    message: "",
  });

  const breadcrumbBootRef = useRef(false);
  const temaGuardadoRef = useRef(DEFAULT_THEME);
  const personalizadoGuardadoRef = useRef(false);

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  const getErrStatus = useCallback((err) => Number(err?.status ?? err?.response?.status ?? 0), []);

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
        return backendMsg || "No tienes permisos para modificar la apariencia.";
      }

      if (status === 400) {
        return backendMsg || "La configuración visual contiene datos inválidos.";
      }

      if (status === 404) {
        return backendMsg || "La academia ya no se encuentra disponible.";
      }

      return backendMsg || fallback || "Ocurrió un error inesperado.";
    },
    [getErrStatus, getErrData]
  );

  const showSuccess = useCallback((title, message) => {
    setSuccessModal({
      open: true,
      title,
      message,
    });
  }, []);

  const handleSuccessAccept = useCallback(() => {
    setSuccessModal({
      open: false,
      title: "",
      message: "",
    });

    window.location.reload();
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
    if (breadcrumbBootRef.current) {
      return;
    }

    const currentPath = location.pathname;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    if (!last || last.label !== "Cambiar apariencia") {
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
              label: "Cambiar apariencia",
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
     AUTH / ROLES
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);

      if (isTokenExpired(decoded)) {
        throw new Error("expired");
      }

      const rol = extractRol(decoded);

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
     CARGAR TEMA
  ======================================================= */

  const fetchTema = useCallback(
    async ({ signal } = {}) => {
      try {
        const response = await api.get(TEMA_PATH, {
          signal,
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        const data = response?.data ?? response;

        const nextTheme = normalizeTheme(data?.tema ?? DEFAULT_THEME);

        const isPersonalizado = Boolean(data?.personalizado);

        setTema(nextTheme);
        setTemaGuardado(nextTheme);
        setPersonalizado(isPersonalizado);

        temaGuardadoRef.current = nextTheme;

        personalizadoGuardadoRef.current = isPersonalizado;

        setAcademiaThemeLocal(nextTheme, isPersonalizado);

        return {
          ok: true,
          tema: nextTheme,
          personalizado: isPersonalizado,
        };
      } catch (err) {
        if (signal?.aborted) {
          return {
            ok: false,
            aborted: true,
          };
        }

        const status = getErrStatus(err);

        if (status === 401) {
          handleAuth();

          return {
            ok: false,
            status,
          };
        }

        setError(prettyError(err, "No fue posible cargar la configuración visual de la academia."));

        return {
          ok: false,
          status,
        };
      }
    },
    [getErrStatus, handleAuth, prettyError, setAcademiaThemeLocal]
  );

  /* =======================================================
     RESTAURAR PREVIEW GUARDADO AL SALIR
  ======================================================= */

  useEffect(() => {
    return () => {
      const savedTheme = temaGuardadoRef.current;

      const wasPersonalized = personalizadoGuardadoRef.current;

      if (wasPersonalized) {
        setAcademiaThemeLocal(savedTheme, true);
      } else {
        restoreDefaultThemeLocally();
      }
    };
  }, [setAcademiaThemeLocal, restoreDefaultThemeLocally]);

  /* =======================================================
     CARGA INICIAL
  ======================================================= */

  useEffect(() => {
    if (!rolActual) {
      return;
    }

    const abort = new AbortController();

    (async () => {
      setLoading(true);

      try {
        await fetchTema({
          signal: abort.signal,
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rolActual, fetchTema]);

  /* =======================================================
     REFRESH MANUAL
  ======================================================= */

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      const result = await fetchTema();

      if (result?.ok) {
        showSuccess(
          "Configuración actualizada",
          "La apariencia fue recargada correctamente desde la configuración guardada de la academia."
        );
      }
    } finally {
      setReloadBusy(false);
    }
  }, [fetchTema, showSuccess]);

  /* =======================================================
     CAMBIO DE COLOR
  ======================================================= */

  const handleColorChange = useCallback(
    (key, value) => {
      const normalized = normalizeHex(value, "");

      if (!normalized) {
        return;
      }

      setTema((current) => {
        const nextTheme = {
          ...current,
          [key]: normalized,
        };

        /*
         * Preview global en vivo.
         *
         * ThemeContext resolverá automáticamente
         * Light / Dark y actualizará los tokens.
         */
        setAcademiaThemeLocal(nextTheme, true);

        return nextTheme;
      });
    },
    [setAcademiaThemeLocal]
  );

  const handleHexInput = useCallback(
    (key, value) => {
      const sanitized = String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^#0-9A-F]/g, "")
        .slice(0, 7);

      setTema((current) => {
        const nextTheme = {
          ...current,
          [key]: sanitized,
        };

        /*
         * Sólo actualizamos el motor visual
         * cuando existe un HEX completo válido.
         */
        if (/^#[0-9A-F]{6}$/.test(sanitized)) {
          setAcademiaThemeLocal(nextTheme, true);
        }

        return nextTheme;
      });
    },
    [setAcademiaThemeLocal]
  );

  const cambiosPendientes = useMemo(() => !sameTheme(tema, temaGuardado), [tema, temaGuardado]);

  const temaValido = useMemo(
    () => THEME_FIELDS.every((field) => /^#[0-9A-F]{6}$/.test(String(tema?.[field.key] ?? "").toUpperCase())),
    [tema]
  );

  /* =======================================================
     GUARDAR TEMA
  ======================================================= */

  const guardarTema = async () => {
    setError("");

    if (!temaValido) {
      setError("Todos los colores deben tener formato hexadecimal #RRGGBB.");

      return;
    }

    setSaving(true);

    try {
      const payload = normalizeTheme(tema);

      const response = await api.put(TEMA_PATH, payload);

      const data = response?.data ?? response;

      const savedTheme = normalizeTheme(data?.tema ?? payload);

      setTema(savedTheme);
      setTemaGuardado(savedTheme);
      setPersonalizado(true);

      temaGuardadoRef.current = savedTheme;

      personalizadoGuardadoRef.current = true;

      setAcademiaThemeLocal(savedTheme, true);

      showSuccess(
        "Apariencia guardada",
        "La nueva apariencia de la academia fue guardada correctamente. Al aceptar, WELI recargará la vista para aplicar la configuración completa."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible guardar la apariencia de la academia."));
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     RESTAURAR TEMA WELI
  ======================================================= */

  const restaurarTema = async () => {
    const confirmed = window.confirm("¿Deseas restaurar la apariencia WELI predeterminada para esta academia?");

    if (!confirmed) {
      return;
    }

    setResetting(true);
    setError("");

    try {
      const response = await api.delete(TEMA_PATH);

      const data = response?.data ?? response;

      const restored = normalizeTheme(data?.tema ?? DEFAULT_THEME);

      setTema(restored);
      setTemaGuardado(restored);
      setPersonalizado(false);

      temaGuardadoRef.current = restored;

      personalizadoGuardadoRef.current = false;

      restoreDefaultThemeLocally();

      showSuccess(
        "Tema WELI restaurado",
        "La apariencia predeterminada de WELI fue restaurada correctamente. Al aceptar, la vista será recargada."
      );
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible restaurar el tema WELI."));
    } finally {
      setResetting(false);
    }
  };

  /* =======================================================
     TOKENS RESUELTOS

     Vienen desde ThemeContext.

     Por lo tanto:
     - Light usa la paleta de la academia.
     - Dark genera automáticamente una versión oscura.
     - cada cambio válido se refleja en tiempo real.
  ======================================================= */

  const tokens = useMemo(() => {
    if (themeTokens) {
      return themeTokens;
    }

    /*
     * Fallback defensivo.
     *
     * ThemeContext actualizado siempre debería
     * proporcionar themeTokens, pero mantenemos
     * compatibilidad ante una carga antigua.
     */
    if (darkMode) {
      return {
        bg: "#111827",
        bgSoft: "#172033",
        card: "#1F2937",
        surface: "#1F2937",
        surfaceSoft: "#172033",
        surface2: "#263244",
        surfaceHover: "#374151",
        primary: "#FFdda1",
        primaryHover: "#FFE5B8",
        primaryContrast: "#3F2D18",
        secondary: "#B79F69",
        secondaryHover: "#C9B789",
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
        overlay: "#000000",
      };
    }

    return {
      bg: DEFAULT_THEME.color_fondo,
      bgSoft: "#F8EFE0",
      card: DEFAULT_THEME.color_tarjeta,
      surface: DEFAULT_THEME.color_tarjeta,
      surfaceSoft: "#FAF6EE",
      surface2: "#F7EAD4",
      surfaceHover: "#FFF9F2",
      primary: DEFAULT_THEME.color_primario,
      primaryHover: "#994812",
      primaryContrast: "#FFFFFF",
      secondary: DEFAULT_THEME.color_secundario,
      secondaryHover: "#604E25",
      secondaryContrast: "#FFFFFF",
      text: DEFAULT_THEME.color_texto,
      textMuted: "#766657",
      icon: DEFAULT_THEME.color_icono,
      border: "#D8C7AE",
      borderStrong: "#BFA684",
      inputBg: "#FFFFFF",
      inputText: DEFAULT_THEME.color_texto,
      inputBorder: "#9B7B50",
      tableHead: "#F7EAD4",
      focus: DEFAULT_THEME.color_primario,
      overlay: "#000000",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     Dashboard sigue siendo dueño del fondo general.

     A diferencia de la versión anterior:
     ya no usamos colores WELI literales dentro
     de tarjetas, controles, botones o textos.

     Todo consume themeTokens.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const innerCard = "rounded-2xl border p-4 transition-colors duration-200";

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2";

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-bold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const primaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const iconBox =
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200";

    const danger =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    return {
      page,
      content,
      card,
      innerCard,
      control,
      secondaryButton,
      primaryButton,
      iconBox,
      danger,

      pageTextStyle: {
        color: tokens.text,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      },

      innerCardStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
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

      primaryButtonStyle: {
        backgroundColor: tokens.primary,
        borderColor: tokens.primary,
        color: tokens.primaryContrast,
      },

      iconBoxStyle: {
        backgroundColor: tokens.surface2,
        borderColor: tokens.border,
        color: tokens.icon,
      },

      pickerBorderStyle: {
        borderColor: tokens.inputBorder,
      },

      neutralStatusStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.textMuted,
      },
    };
  }, [darkMode, tokens]);

  if (loading) {
    return (
      <div className={ui.page} style={ui.pageTextStyle}>
        <div className={`${ui.content} min-h-[70vh] flex items-center justify-center`}>
          <div className="text-sm font-semibold" style={ui.subTextStyle}>
            Cargando apariencia…
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${ui.page} font-sans`} style={ui.pageTextStyle}>
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
                <Palette className="h-6 w-6" />
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
                Apariencia de la Academia
              </h1>

              <p className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] leading-relaxed" style={ui.subTextStyle}>
                Personaliza los colores principales de la plataforma para adaptar la experiencia visual a la identidad
                de tu academia.
              </p>
            </div>
          </header>

          <main>
            <div className="mt-7 space-y-4">
              {/* =============================================
                  ERRORES
              ============================================= */}

              {!!error && <div className={ui.danger}>{error}</div>}

              {/* =============================================
                  ESTADO CONFIGURACIÓN
              ============================================= */}

              <section className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={ui.iconBox} style={ui.iconBoxStyle}>
                      <Sparkles className="h-5 w-5" />
                    </div>

                    <div>
                      <h2 className="text-base sm:text-lg font-extrabold" style={ui.titleStyle}>
                        Configuración visual
                      </h2>

                      <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                        {personalizado
                          ? "Esta academia utiliza una apariencia personalizada."
                          : "Esta academia utiliza actualmente el tema WELI predeterminado."}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={refresh}
                    disabled={reloadBusy || saving || resetting}
                    className={ui.secondaryButton}
                    style={ui.secondaryButtonStyle}
                  >
                    <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
                    Actualizar
                  </button>
                </div>
              </section>

              {/* =============================================
                  EDITOR + PREVIEW
              ============================================= */}

              <section className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
                {/* ===========================================
                    EDITOR
                =========================================== */}

                <div className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                  <div className="mb-5">
                    <h2 className="text-lg sm:text-xl font-extrabold" style={ui.titleStyle}>
                      Colores de la plataforma
                    </h2>

                    <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                      Selecciona un color desde la paleta o escribe directamente su valor hexadecimal.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {THEME_FIELDS.map((field) => {
                      const value = String(tema?.[field.key] ?? "");

                      const validValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#FFFFFF";

                      return (
                        <div key={field.key} className={ui.innerCard} style={ui.innerCardStyle}>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`${field.key}-hex`}
                                className="block text-[14px] font-extrabold"
                                style={ui.titleStyle}
                              >
                                {field.label}
                              </label>

                              <p className="mt-1 text-[12px] sm:text-[13px]" style={ui.subTextStyle}>
                                {field.description}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 sm:w-[230px]">
                              <label
                                className="relative h-12 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border"
                                style={ui.pickerBorderStyle}
                                title={`Seleccionar ${field.label.toLowerCase()}`}
                              >
                                <span
                                  className="absolute inset-0"
                                  style={{
                                    backgroundColor: validValue,
                                  }}
                                />

                                <input
                                  type="color"
                                  value={validValue}
                                  onChange={(event) => handleColorChange(field.key, event.target.value)}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label={`Seleccionar ${field.label}`}
                                />
                              </label>

                              <input
                                id={`${field.key}-hex`}
                                type="text"
                                value={value}
                                onChange={(event) => handleHexInput(field.key, event.target.value)}
                                maxLength={7}
                                placeholder="#FFFFFF"
                                className={ui.control}
                                style={ui.controlStyle}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ===========================================
                    VISTA PREVIA

                    Ahora usa los tokens RESUELTOS del
                    ThemeContext.

                    Por lo tanto muestra realmente:
                    - tema claro personalizado;
                    - tema oscuro personalizado.
                =========================================== */}

                <div className={`${ui.card} p-4 sm:p-5 h-fit xl:sticky xl:top-5`} style={ui.cardStyle}>
                  <div className="mb-5">
                    <h2 className="text-lg sm:text-xl font-extrabold" style={ui.titleStyle}>
                      Vista previa
                    </h2>

                    <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                      Los cambios se muestran aquí antes de guardarlos y respetan el modo visual actualmente
                      seleccionado.
                    </p>
                  </div>

                  <div
                    className="rounded-2xl border p-5 transition-colors duration-200"
                    style={{
                      backgroundColor: tokens.bg,
                      borderColor: tokens.borderStrong,
                      color: tokens.text,
                    }}
                  >
                    <div
                      className="rounded-2xl border p-5 shadow-sm transition-colors duration-200"
                      style={{
                        backgroundColor: tokens.surface,
                        borderColor: tokens.border,
                        color: tokens.text,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="h-11 w-11 shrink-0 rounded-xl border flex items-center justify-center"
                          style={{
                            backgroundColor: tokens.surface2,
                            borderColor: tokens.border,
                            color: tokens.icon,
                          }}
                        >
                          <Palette className="h-6 w-6" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-lg font-extrabold">Academia de ejemplo</h3>

                          <p
                            className="mt-1 text-sm"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            Vista previa de tarjetas, textos, iconos, formularios y acciones.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div
                          className="rounded-xl border p-3 text-center"
                          style={{
                            backgroundColor: tokens.surfaceSoft,
                            borderColor: tokens.border,
                            color: tokens.text,
                          }}
                        >
                          <div
                            className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
                            style={{
                              color: tokens.icon,
                            }}
                          >
                            <Check className="h-5 w-5" />
                          </div>

                          <span className="text-xs font-bold">Tarjeta</span>
                        </div>

                        <div
                          className="rounded-xl border p-3 text-center"
                          style={{
                            backgroundColor: tokens.surfaceSoft,
                            borderColor: tokens.border,
                            color: tokens.text,
                          }}
                        >
                          <div
                            className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
                            style={{
                              color: tokens.icon,
                            }}
                          >
                            <Sparkles className="h-5 w-5" />
                          </div>

                          <span className="text-xs font-bold">Iconos</span>
                        </div>
                      </div>

                      {/* =====================================
                          EJEMPLO INPUT
                      ===================================== */}

                      <div className="mt-3">
                        <label
                          className="block mb-1.5 text-xs font-bold"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          Campo de formulario
                        </label>

                        <input
                          type="text"
                          value="Ejemplo de formulario"
                          readOnly
                          className="w-full h-11 rounded-xl border px-3.5 text-sm outline-none"
                          style={{
                            backgroundColor: tokens.inputBg,
                            borderColor: tokens.inputBorder,
                            color: tokens.inputText,
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="mt-5 w-full rounded-xl border px-4 py-3 text-sm font-extrabold transition hover:opacity-90"
                        style={{
                          backgroundColor: tokens.primary,
                          borderColor: tokens.primary,
                          color: tokens.primaryContrast,
                        }}
                      >
                        Botón principal
                      </button>
                    </div>
                  </div>

                  {/* =========================================
                      ESTADO DE CAMBIOS

                      Ya no utilizamos una alerta verde.
                  ========================================= */}

                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-[12px] ${
                      cambiosPendientes
                        ? darkMode
                          ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                        : ""
                    }`}
                    style={cambiosPendientes ? undefined : ui.neutralStatusStyle}
                  >
                    {cambiosPendientes
                      ? "Existen cambios pendientes de guardar."
                      : "La vista previa coincide con la configuración guardada."}
                  </div>
                </div>
              </section>

              {/* =============================================
                  ACCIONES
              ============================================= */}

              <section className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <button
                    type="button"
                    onClick={restaurarTema}
                    disabled={resetting || saving}
                    className={ui.secondaryButton}
                    style={ui.secondaryButtonStyle}
                  >
                    <RotateCcw className={`h-4 w-4 ${resetting ? "animate-spin" : ""}`} />

                    {resetting ? "Restaurando…" : "Restaurar tema WELI"}
                  </button>

                  <button
                    type="button"
                    onClick={guardarTema}
                    disabled={!cambiosPendientes || !temaValido || saving || resetting}
                    className={ui.primaryButton}
                    style={ui.primaryButtonStyle}
                  >
                    <Save className="h-4 w-4" />

                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      {/* ===================================================
          MODAL DE ÉXITO

          Sustituye las antiguas alertas verdes inline.
          Al pulsar Aceptar se realiza refresh completo.
      =================================================== */}

      <SuccessModal
        open={successModal.open}
        title={successModal.title}
        message={successModal.message}
        onAccept={handleSuccessAccept}
        tokens={tokens}
      />
    </>
  );
}
