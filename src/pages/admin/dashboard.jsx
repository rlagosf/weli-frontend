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

/**
 * jwtDecode en frontend se utiliza exclusivamente
 * para comportamiento visual y navegación.
 *
 * La validación/autorización real continúa
 * perteneciendo al backend.
 */
function decodeToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   EXPIRACIÓN
───────────────────────────────────────────────────────── */

function isExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  return Date.now() >= exp * 1000;
}

/* ─────────────────────────────────────────────────────────
   TYPE
───────────────────────────────────────────────────────── */

function extractType(decoded) {
  return String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();
}

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

function extractRol(decoded) {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && PANEL_ROLES.has(rol) ? rol : 0;
}

/* ─────────────────────────────────────────────────────────
   ACADEMIA JWT

   EXCLUSIVAMENTE ADMIN / STAFF
───────────────────────────────────────────────────────── */

function extractTokenAcademiaId(decoded) {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* =========================================================
   ACADEMIA SUPERADMIN
========================================================= */

/**
 * Esta función se utiliza exclusivamente
 * para el contexto seleccionado por Superadmin.
 *
 * Admin y Staff NO deben depender de esta función.
 */
function readSelectedAcademia() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    /* ─────────────────────────────────────────
       Compatibilidad formato directo:

       "12"
    ───────────────────────────────────────── */

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

    /* ─────────────────────────────────────────
       Snapshot JSON
    ───────────────────────────────────────── */

    const parsed = JSON.parse(raw);

    /*
     * Compatibilidad defensiva con distintas
     * denominaciones históricas del ID.
     */
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

      /*
       * Las academias históricas pueden
       * legítimamente tener RUT NULL.
       */
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

  const { darkMode, toggleTheme } = useTheme();

  /*
   * Evita actualizar estado después
   * del desmontaje.
   */
  const mountedRef = useRef(true);

  const [rol, setRol] = useState(null);

  const [isLoading, setIsLoading] = useState(true);

  const [selectedAcademia, setSelectedAcademia] = useState(null);

  useMobileAutoScrollTop();

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

  /*
   * Admin:
   * /admin
   *
   * Superadmin:
   * /super-dashboard/admin/dashboard
   */
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

     IMPORTANTE:
     NO SE MODIFICAN LAS REGLAS DE SEGURIDAD.

     Admin/Staff:
     academia desde JWT.

     Superadmin:
     academia desde selector local.
  ======================================================= */

  useEffect(() => {
    const validateDashboardAccess = () => {
      try {
        const token = getToken() || "";

        /* ===============================================
             SIN TOKEN
          =============================================== */

        if (!token) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const decoded = decodeToken(token);

        /* ===============================================
             TOKEN INVÁLIDO / EXPIRADO
          =============================================== */

        if (!decoded || isExpired(decoded)) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const type = extractType(decoded);

        const currentRol = extractRol(decoded);

        /* ===============================================
             TOKEN NO VÁLIDO PARA PANEL
          =============================================== */

        if (!PANEL_TYPES.has(type) || !currentRol) {
          clearLocalSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* =================================================
             ADMIN / STAFF
             roles 1 / 2

             Academia EXCLUSIVAMENTE desde JWT.

             NUNCA se exige:
             weli_selected_academia
          ================================================= */

        if (currentRol === 1 || currentRol === 2) {
          const tokenAcademiaId = extractTokenAcademiaId(decoded);

          /*
           * Un Admin/Staff válido del modelo actual
           * debe llevar academia_id firmada.
           */
          if (!tokenAcademiaId) {
            clearLocalSession();

            navigate("/login", {
              replace: true,
            });

            return;
          }

          /*
           * Admin / Staff no pueden operar desde
           * el árbol interno de Superadmin.
           *
           * NO se elimina sesión.
           */
          if (isSuperTree) {
            navigate(ADMIN_HOME, {
              replace: true,
            });

            return;
          }

          if (mountedRef.current) {
            setRol(currentRol);

            /*
             * Admin y Staff NO poseen
             * selectedAcademia local.
             */
            setSelectedAcademia(null);
          }

          return;
        }

        /* =================================================
             SUPERADMIN
             rol 3

             Puede utilizar este Dashboard solamente
             dentro del árbol de Superadmin.
          ================================================= */

        if (currentRol === 3) {
          /*
           * Superadmin no debe utilizar
           * /admin directamente.
           *
           * NO se destruye sesión.
           */
          if (!isSuperTree) {
            navigate(SUPER_HOME, {
              replace: true,
            });

            return;
          }

          /*
           * Para entrar al árbol tenantizado
           * necesita academia objetivo.
           */
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
      /*
       * Logout local idempotente.
       *
       * Si backend no responde, igualmente
       * se elimina la sesión local.
       */
    } finally {
      clearLocalSession();

      /*
       * La academia seleccionada pertenece
       * exclusivamente al contexto Superadmin.
       */
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
    /*
     * Solo eliminamos la academia seleccionada.
     *
     * NO:
     * - token
     * - sesión
     * - rol
     */
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
     UI

     Las clases ra-* pertenecen al tema existente.
     No se modifican porque hacerlo aisladamente
     podría romper Tailwind/CSS.
  ======================================================= */

  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

  const buttonIcon = darkMode ? "hover:bg-white/10" : "hover:bg-white/30";

  const card = darkMode
    ? "bg-white/10 border-white/15 hover:bg-white/15 hover:border-white/25"
    : "bg-white/60 border-ra-marron/15 hover:bg-white/80 hover:border-ra-terracotta";

  const badge = darkMode
    ? "bg-white/10 border-white/10 text-white/80"
    : "bg-white/60 border-ra-marron/10 text-ra-marron/80";

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${shell} min-h-screen font-sans`}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          {/* =============================================
              BREADCRUMB
          ============================================= */}

          <nav className="text-sm min-w-0" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 min-w-0">
              {breadcrumb.map((item, index) => (
                <li key={`${item.to}-${index}`} className="flex items-center gap-2 min-w-0">
                  {index !== 0 && <span className="opacity-50">/</span>}

                  {item.last ? (
                    <span className={`font-semibold truncate ${darkMode ? "text-white/90" : "text-ra-marron/90"}`}>
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      className={`hover:opacity-90 truncate ${darkMode ? "text-white/80" : "text-ra-marron/80"}`}
                      to={item.to}
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
            {/* ===========================================
                SUPERADMIN:
                ACADEMIA ACTUAL
            =========================================== */}

            {rol === 3 && isSuperTree && selectedAcademia && (
              <div
                className={[
                  "hidden sm:flex items-center gap-2 rounded-2xl px-4 py-2 border",

                  darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15",
                ].join(" ")}
              >
                <Building2 className="w-4 h-4" />

                <span className="text-xs opacity-80">Academia:</span>

                <span className="text-xs font-extrabold">{selectedAcademia.nombre ?? `#${selectedAcademia.id}`}</span>

                <button
                  type="button"
                  onClick={handleCambiarAcademia}
                  className={[
                    "ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition hover:opacity-90",

                    darkMode ? "border-white/20" : "border-ra-marron/15",
                  ].join(" ")}
                  title="Cambiar academia"
                >
                  <CornerUpLeft className="w-4 h-4" />

                  <span className="text-xs font-semibold">Cambiar</span>
                </button>
              </div>
            )}

            {/* ===========================================
                TEMA
            =========================================== */}

            <button
              type="button"
              title="Cambiar tema"
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition ${buttonIcon}`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* ===========================================
                LOGOUT
            =========================================== */}

            <button
              type="button"
              title="Cerrar sesión"
              onClick={handleCerrarSesion}
              className={`p-2 rounded-xl transition ${buttonIcon}`}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* =============================================
            TÍTULO
        ============================================= */}

        <h1 className="text-3xl font-extrabold text-center tracking-tight mt-6">Panel de Administración</h1>

        <p className={`text-center mt-2 text-sm ${headerSub}`}>
          {rol === 3 && selectedAcademia
            ? selectedAcademia.nombre
              ? `Administrando ${selectedAcademia.nombre}`
              : `Academia #${selectedAcademia.id}`
            : "Gestión administrativa WELI"}
        </p>
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="px-6 pb-20">
        {isRoot ? (
          /* ===============================================
             DASHBOARD PRINCIPAL
          =============================================== */

          <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards
              .filter((item) => !item.roles || item.roles.includes(rol))

              .sort((a, b) =>
                (a.label ?? "").localeCompare(b.label ?? "", "es", {
                  sensitivity: "base",
                })
              )

              .map(({ to, label, Icon, disabled }) => {
                const iconWrap = darkMode
                  ? "bg-ra-terracotta/90 border border-white/10"
                  : "bg-ra-terracotta/90 border border-white/20";

                /* =======================================
                     MÓDULO DESHABILITADO
                  ======================================= */

                if (disabled) {
                  return (
                    <div
                      key={to}
                      className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 h-44 text-center opacity-60 cursor-not-allowed`}
                      title="Próximamente"
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${iconWrap}`}>
                        <Icon className="w-8 h-8 text-white" />
                      </div>

                      <div
                        className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}
                      >
                        {label}
                      </div>

                      <div className={`text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border ${badge}`}>
                        <span>Próximamente</span>
                      </div>
                    </div>
                  );
                }

                /* =======================================
                     MÓDULO ACTIVO
                  ======================================= */

                return (
                  <Link
                    key={to}
                    to={to}
                    className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 h-44 hover:-translate-y-1 text-center`}
                    aria-label={label}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${iconWrap}`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <div
                      className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}
                    >
                      {label}
                    </div>
                  </Link>
                );
              })}
          </div>
        ) : (
          /* ===============================================
             CHILD ROUTE
          =============================================== */

          <Outlet />
        )}
      </main>
    </div>
  );
}
