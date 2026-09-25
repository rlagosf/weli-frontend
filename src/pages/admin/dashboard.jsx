// src/pages/admin/dashboard.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";

import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";

import IsLoading from "../../components/isLoading";

import {
  LogOut,
  Sun,
  Moon,
  UserPlus,
  Users,
  ClipboardList,
  BarChart3,
  CalendarPlus,
  History,
  Banknote,
  PieChart,
  UserCog,
  Settings,
  CalendarDays,
  Stethoscope,
  Newspaper,
  Building2,
  CornerUpLeft,
} from "lucide-react";

import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =========================================================
   RUTAS
========================================================= */

const ADMIN_HOME = "/admin";
const SUPER_HOME = "/super-dashboard";
const SUPER_ADMIN_ROOT = "/super-dashboard/admin/dashboard";

/* =========================================================
   STORAGE / PANEL
========================================================= */

const USER_INFO_KEY = "weli_user_info";

const PANEL_ROLES = new Set([1, 2, 3]);

const PANEL_TYPES = new Set(["admin", "user", "staff", "superadmin"]);

/* =========================================================
   BREADCRUMB
========================================================= */

const segToLabel = (segment) => {
  const map = {
    "": "Inicio",
    admin: "Inicio",
    dashboard: "Inicio",
    "crear-jugador": "Crear Jugador",
    "listar-jugadores": "Listar Jugadores",
    "registrar-estadisticas": "Registrar Estadísticas",
    "detalle-estadistica": "Detalle Estadística",
    estadisticas: "Estadísticas",
    convocatorias: "Convocatorias",
    "ver-convocaciones-historicas": "Histórico Convocatorias",
    "gestionar-pagos": "Pagos centralizados",
    "power-bi": "POWER BI FINANCIERO",
    "crear-usuario": "Crear Usuario",
    configuracion: "Configuración",
    agenda: "Agenda",
    noticias: "Registro Noticias",
  };

  if (Object.prototype.hasOwnProperty.call(map, segment)) {
    return map[segment];
  }

  const value = String(segment ?? "");

  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("-", " ");
};

/* =========================================================
   JWT HELPERS
========================================================= */

function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  return Date.now() >= exp * 1000;
}

function extractType(decoded) {
  return String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();
}

function extractRol(decoded) {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && PANEL_ROLES.has(rol) ? rol : 0;
}

function extractTokenAcademiaId(decoded) {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* =========================================================
   ACADEMIA SUPERADMIN
========================================================= */

function readSelectedAcademia() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return {
        id: direct,
        nombre: null,
        deporte_id: null,
        deporte_nombre: null,
        estado_id: null,
        estado_nombre: null,
        rut_academia: null,
        ts: null,
      };
    }

    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? parsed?.academyId ?? 0
    );

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    return {
      id,

      nombre: parsed?.nombre ?? null,

      deporte_id: parsed?.deporte_id ?? null,

      deporte_nombre: parsed?.deporte_nombre ?? null,

      estado_id: parsed?.estado_id ?? null,

      estado_nombre: parsed?.estado_nombre ?? null,

      rut_academia: parsed?.rut_academia ?? null,

      ts: parsed?.ts ?? null,
    };
  } catch {
    return null;
  }
}

/* =========================================================
   LIMPIEZA SESIÓN LOCAL
========================================================= */

function clearLocalSession() {
  try {
    clearToken();
  } catch {}

  try {
    localStorage.removeItem(USER_INFO_KEY);
  } catch {}
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const { darkMode, toggleTheme, themeTokens } = useTheme();

  const mountedRef = useRef(true);

  const [rol, setRol] = useState(null);

  const [isLoading, setIsLoading] = useState(true);

  const [selectedAcademia, setSelectedAcademia] = useState(null);

  useMobileAutoScrollTop();

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la única fuente visual efectiva.

     El fallback existe únicamente como protección defensiva
     mientras el contexto termina de inicializar.
  ======================================================= */

  const tokens = useMemo(() => {
    if (themeTokens) {
      return themeTokens;
    }

    if (darkMode) {
      return {
        bg: "#111827",
        bgSoft: "#172033",

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
      bg: "#E8DAC4",
      bgSoft: "#FFDDA1",

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
     MOUNT STATUS
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =======================================================
     ÁRBOL ACTUAL
  ======================================================= */

  const isSuperTree = useMemo(() => {
    const path = String(location.pathname ?? "");

    return path === SUPER_ADMIN_ROOT || path.startsWith(`${SUPER_ADMIN_ROOT}/`);
  }, [location.pathname]);

  const ROOT = isSuperTree ? SUPER_ADMIN_ROOT : ADMIN_HOME;

  const BASE = ROOT;

  /* =======================================================
     CARDS
  ======================================================= */

  const cards = useMemo(
    () => [
      {
        to: `${BASE}/crear-jugador`,
        label: "Crear Jugador",
        roles: [1, 3],
        Icon: UserPlus,
      },

      {
        to: `${BASE}/listar-jugadores`,
        label: "Listar Jugadores",
        roles: [1, 2, 3],
        Icon: Users,
      },

      {
        to: `${BASE}/registrar-estadisticas`,
        label: "Registrar Estadísticas",
        roles: [1, 2, 3],
        Icon: ClipboardList,
      },

      {
        to: `${BASE}/estadisticas`,
        label: "Estadísticas Globales",
        roles: [1, 2, 3],
        Icon: BarChart3,
      },

      {
        to: `${BASE}/convocatorias`,
        label: "Crear Convocatorias",
        roles: [1, 3],
        Icon: CalendarPlus,
      },

      {
        to: `${BASE}/ver-convocaciones-historicas`,
        label: "Historial Convocatorias",
        roles: [1, 2, 3],
        Icon: History,
      },

      {
        to: `${BASE}/agenda`,
        label: "Agenda de eventos",
        roles: [1, 2, 3],
        Icon: CalendarDays,
      },

      {
        to: `${BASE}/gestionar-pagos`,
        label: "Gestión de pagos",
        roles: [1, 3],
        Icon: Banknote,
      },

      {
        to: `${BASE}/power-bi`,
        label: "POWER BI FINANCIERO",
        roles: [1, 3],
        Icon: PieChart,
      },

      {
        to: `${BASE}/noticias`,
        label: "Registro Noticias",
        roles: [1, 2, 3],
        Icon: Newspaper,
        disabled: true,
      },

      {
        to: `${BASE}/crear-usuario`,
        label: "Crear Usuario",
        roles: [1, 3],
        Icon: UserCog,
      },

      {
        to: `${BASE}/configuracion`,
        label: "Configuración",
        roles: [1, 3],
        Icon: Settings,
      },

      {
        to: `${BASE}/seguimiento-medico`,
        label: "Seguimiento médico",
        roles: [1, 2, 3],
        Icon: Stethoscope,
        disabled: true,
      },
    ],
    [BASE]
  );

  /* =======================================================
     AUTH CONTEXT
  ======================================================= */

  useEffect(() => {
    const validateDashboardAccess = () => {
      try {
        const token = getToken() || "";

        /* SIN TOKEN */

        if (!token) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const decoded = decodeToken(token);

        /* TOKEN INVÁLIDO / EXPIRADO */

        if (!decoded || isExpired(decoded)) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const type = extractType(decoded);

        const currentRol = extractRol(decoded);

        /* TOKEN NO VÁLIDO PARA PANEL */

        if (!PANEL_TYPES.has(type) || !currentRol) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* =============================================
             ADMIN / STAFF
             roles 1 / 2
          ============================================= */

        if (currentRol === 1 || currentRol === 2) {
          const tokenAcademiaId = extractTokenAcademiaId(decoded);

          if (!tokenAcademiaId) {
            clearLocalSession();

            navigate("/login", {
              replace: true,
            });

            return;
          }

          if (isSuperTree) {
            navigate(ADMIN_HOME, {
              replace: true,
            });

            return;
          }

          if (mountedRef.current) {
            setRol(currentRol);

            setSelectedAcademia(null);
          }

          return;
        }

        /* =============================================
             SUPERADMIN
             rol 3
          ============================================= */

        if (currentRol === 3) {
          if (!isSuperTree) {
            navigate(SUPER_HOME, {
              replace: true,
            });

            return;
          }

          const snapshot = readSelectedAcademia();

          if (!snapshot) {
            navigate(SUPER_HOME, {
              replace: true,
            });

            return;
          }

          if (mountedRef.current) {
            setRol(currentRol);

            setSelectedAcademia(snapshot);
          }

          return;
        }
      } catch {
        clearLocalSession();

        navigate("/login", {
          replace: true,
        });
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    validateDashboardAccess();
  }, [navigate, isSuperTree]);

  /* =======================================================
     LOGOUT
  ======================================================= */

  const handleCerrarSesion = useCallback(async () => {
    try {
      await api.post("/auth/logout", null, {
        meta: {
          isPublic: false,
        },
      });
    } catch {
    } finally {
      clearLocalSession();

      try {
        localStorage.removeItem(ACADEMIA_STORAGE_KEY);
      } catch {}

      window.location.replace("/");
    }
  }, []);

  /* =======================================================
     SUPERADMIN
     CAMBIAR ACADEMIA
  ======================================================= */

  const handleCambiarAcademia = useCallback(() => {
    try {
      localStorage.removeItem(ACADEMIA_STORAGE_KEY);
    } catch {}

    navigate(SUPER_HOME, {
      replace: true,
    });
  }, [navigate]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  const breadcrumb = useMemo(() => {
    const path = String(location.pathname ?? "");

    const base = [
      {
        to: ROOT,
        label: "Inicio",
        last: false,
      },
    ];

    if (path === ROOT) {
      return [
        {
          ...base[0],
          last: true,
        },
      ];
    }

    const rest = path.startsWith(ROOT) ? path.slice(ROOT.length) : path;

    const parts = rest.split("/").filter(Boolean);

    let accumulator = ROOT;

    const tail = parts.map((segment, index) => {
      accumulator += `/${segment}`;

      return {
        to: accumulator,

        label: segToLabel(segment),

        last: index === parts.length - 1,
      };
    });

    const all = [...base, ...tail];

    return all.map((item, index) => ({
      ...item,

      last: index === all.length - 1,
    }));
  }, [location.pathname, ROOT]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading || rol === null) {
    return <IsLoading />;
  }

  /* =======================================================
     ROOT
  ======================================================= */

  const isRoot = location.pathname === ROOT;

  /* =======================================================
     UI BASADA EXCLUSIVAMENTE EN themeTokens

     IMPORTANTE:
     Dashboard continúa siendo el dueño del fondo global.

     Los componentes hijos renderizados por <Outlet />
     permanecen transparentes.
  ======================================================= */

  const shellStyle = {
    backgroundColor: tokens.bg,

    color: tokens.text,
  };

  const breadcrumbCurrentStyle = {
    color: tokens.text,
  };

  const breadcrumbLinkStyle = {
    color: tokens.textMuted,
  };

  const breadcrumbSeparatorStyle = {
    color: tokens.textMuted,
  };

  const titleStyle = {
    color: tokens.text,
  };

  const subtitleStyle = {
    color: tokens.textMuted,
  };

  const buttonIconStyle = {
    backgroundColor: tokens.surfaceSoft,

    borderColor: tokens.border,

    color: tokens.icon,

    "--weli-dashboard-button-hover": tokens.surfaceHover,

    "--weli-dashboard-button-border-hover": tokens.borderStrong,

    "--weli-dashboard-focus": tokens.focus,
  };

  const academiaBadgeStyle = {
    backgroundColor: tokens.surface,

    borderColor: tokens.border,

    color: tokens.text,
  };

  const academiaLabelStyle = {
    color: tokens.textMuted,
  };

  const academiaIconStyle = {
    color: tokens.icon,
  };

  const academiaChangeStyle = {
    backgroundColor: tokens.surfaceSoft,

    borderColor: tokens.borderStrong,

    color: tokens.text,

    "--weli-dashboard-change-hover": tokens.surfaceHover,

    "--weli-dashboard-focus": tokens.focus,
  };

  const cardStyle = {
    backgroundColor: tokens.surface,

    borderColor: tokens.border,

    color: tokens.text,

    "--weli-dashboard-card-bg": tokens.surface,

    "--weli-dashboard-card-hover": tokens.surfaceHover,

    "--weli-dashboard-card-border": tokens.border,

    "--weli-dashboard-card-border-hover": tokens.borderStrong,

    "--weli-dashboard-focus": tokens.focus,
  };

  /*
   * El icono está situado sobre primary.
   *
   * Por contraste utilizamos primaryContrast.
   * tokens.icon continúa utilizándose para iconos
   * sobre superficies normales.
   */
  const iconWrapStyle = {
    backgroundColor: tokens.primary,

    borderColor: tokens.borderStrong,

    color: tokens.primaryContrast,
  };

  const cardIconStyle = {
    color: tokens.primaryContrast,
  };

  const cardTitleStyle = {
    color: tokens.text,
  };

  const badgeStyle = {
    backgroundColor: tokens.surfaceSoft,

    borderColor: tokens.border,

    color: tokens.textMuted,
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen w-full font-sans transition-colors duration-300" style={shellStyle}>
      <style>
        {`
          /* ================================================
             CONTROLES SUPERIORES
          ================================================ */

          .weli-dashboard-icon-button {
            background-color:
              var(--weli-dashboard-button-bg);

            border-color:
              var(--weli-dashboard-button-border);

            color:
              var(--weli-dashboard-button-color);
          }

          .weli-dashboard-icon-button:hover {
            background-color:
              var(--weli-dashboard-button-hover) !important;

            border-color:
              var(--weli-dashboard-button-border-hover) !important;
          }

          .weli-dashboard-icon-button:focus-visible {
            outline:
              2px solid var(--weli-dashboard-focus);

            outline-offset:
              3px;
          }

          /* ================================================
             CAMBIAR ACADEMIA
          ================================================ */

          .weli-dashboard-change-academia:hover {
            background-color:
              var(--weli-dashboard-change-hover) !important;
          }

          .weli-dashboard-change-academia:focus-visible {
            outline:
              2px solid var(--weli-dashboard-focus);

            outline-offset:
              3px;
          }

          /* ================================================
             TARJETAS
          ================================================ */

          .weli-dashboard-card {
            background-color:
              var(--weli-dashboard-card-bg) !important;

            border-color:
              var(--weli-dashboard-card-border) !important;
          }

          .weli-dashboard-card:not(.weli-dashboard-card-disabled):hover {
            background-color:
              var(--weli-dashboard-card-hover) !important;

            border-color:
              var(--weli-dashboard-card-border-hover) !important;
          }

          .weli-dashboard-card:focus-visible {
            outline:
              2px solid var(--weli-dashboard-focus);

            outline-offset:
              4px;
          }
        `}
      </style>

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="w-full px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 sm:pt-5">
        <div className="w-full max-w-[1700px] mx-auto">
          <div className="flex items-center justify-between gap-3">
            {/* =============================================
                BREADCRUMB
            ============================================= */}

            <nav className="text-[12px] sm:text-sm min-w-0" aria-label="breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                {breadcrumb.map((item, index) => (
                  <li key={`${item.to}-${index}`} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    {index !== 0 && (
                      <span className="opacity-40" style={breadcrumbSeparatorStyle}>
                        /
                      </span>
                    )}

                    {item.last ? (
                      <span className="font-extrabold truncate" style={breadcrumbCurrentStyle}>
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        to={item.to}
                        className="font-semibold hover:opacity-80 truncate transition"
                        style={breadcrumbLinkStyle}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            {/* =============================================
                CONTROLES SUPERIORES
            ============================================= */}

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* SUPERADMIN ACADEMIA */}

              {rol === 3 && isSuperTree && selectedAcademia && (
                <div
                  className="hidden sm:flex items-center gap-2 rounded-2xl px-3.5 py-2 border shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-colors duration-200"
                  style={academiaBadgeStyle}
                >
                  <Building2 className="w-4 h-4" style={academiaIconStyle} />

                  <span className="text-xs" style={academiaLabelStyle}>
                    Academia:
                  </span>

                  <span
                    className="text-xs font-extrabold max-w-[180px] truncate"
                    style={{
                      color: tokens.text,
                    }}
                  >
                    {selectedAcademia.nombre ?? `#${selectedAcademia.id}`}
                  </span>

                  <button
                    type="button"
                    onClick={handleCambiarAcademia}
                    className="weli-dashboard-change-academia ml-1 inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg border transition hover:opacity-90"
                    style={academiaChangeStyle}
                    title="Cambiar academia"
                  >
                    <CornerUpLeft className="w-4 h-4" />

                    <span className="text-xs font-semibold">Cambiar</span>
                  </button>
                </div>
              )}

              {/* TEMA */}

              <button
                type="button"
                title="Cambiar tema"
                onClick={toggleTheme}
                className="weli-dashboard-icon-button h-10 w-10 inline-flex items-center justify-center rounded-xl border transition"
                style={{
                  ...buttonIconStyle,

                  "--weli-dashboard-button-bg": tokens.surfaceSoft,

                  "--weli-dashboard-button-border": tokens.border,

                  "--weli-dashboard-button-color": tokens.icon,
                }}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              {/* LOGOUT */}

              <button
                type="button"
                title="Cerrar sesión"
                onClick={handleCerrarSesion}
                className="weli-dashboard-icon-button h-10 w-10 inline-flex items-center justify-center rounded-xl border transition"
                style={{
                  ...buttonIconStyle,

                  "--weli-dashboard-button-bg": tokens.surfaceSoft,

                  "--weli-dashboard-button-border": tokens.border,

                  "--weli-dashboard-button-color": tokens.icon,
                }}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

          {/* =============================================
              TÍTULO
          ============================================= */}

          <div className="text-center mt-5 sm:mt-6">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={titleStyle}>
              Panel de Administración
            </h1>

            <p
              className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={subtitleStyle}
            >
              {rol === 3 && selectedAcademia
                ? selectedAcademia.nombre
                  ? `Administrando ${selectedAcademia.nombre}`
                  : `Academia #${selectedAcademia.id}`
                : "Gestión administrativa WELI"}
            </p>
          </div>
        </div>
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="w-full pb-16">
        {isRoot ? (
          <div className="w-full max-w-[1700px] mx-auto px-3 sm:px-5 lg:px-7 2xl:px-10">
            <div className="mt-6 sm:mt-7 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {cards
                .filter((item) => !item.roles || item.roles.includes(rol))
                .sort((a, b) =>
                  (a.label ?? "").localeCompare(b.label ?? "", "es", {
                    sensitivity: "base",
                  })
                )
                .map(({ to, label, Icon, disabled }) => {
                  /* =====================================
                         DESHABILITADO
                    ===================================== */

                  if (disabled) {
                    return (
                      <div
                        key={to}
                        className="weli-dashboard-card weli-dashboard-card-disabled rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition transform flex flex-col items-center justify-center gap-3 min-h-[176px] text-center opacity-60 cursor-not-allowed"
                        style={cardStyle}
                        title="Próximamente"
                      >
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors duration-200"
                          style={iconWrapStyle}
                        >
                          <Icon className="w-7 h-7 sm:w-8 sm:h-8" style={cardIconStyle} />
                        </div>

                        <div className="font-extrabold text-base sm:text-lg leading-tight" style={cardTitleStyle}>
                          {label}
                        </div>

                        <div
                          className="text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border"
                          style={badgeStyle}
                        >
                          <span>Próximamente</span>
                        </div>
                      </div>
                    );
                  }

                  /* =====================================
                         ACTIVO
                    ===================================== */

                  return (
                    <Link
                      key={to}
                      to={to}
                      aria-label={label}
                      className="weli-dashboard-card rounded-2xl border p-5 sm:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition transform flex flex-col items-center justify-center gap-3 min-h-[176px] hover:-translate-y-1 text-center"
                      style={cardStyle}
                    >
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors duration-200"
                        style={iconWrapStyle}
                      >
                        <Icon className="w-7 h-7 sm:w-8 sm:h-8" style={cardIconStyle} />
                      </div>

                      <div className="font-extrabold text-base sm:text-lg leading-tight" style={cardTitleStyle}>
                        {label}
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
