// src/pages/admin/configuracion.jsx

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { jwtDecode } from "jwt-decode";

import {
  Settings as SettingsIcon,
  Layers,
  CheckSquare,
  Goal,
  CreditCard,
  ListChecks,
  ShieldCheck,
  GraduationCap,
  Stethoscope,
  Building2,
  Palette,
} from "lucide-react";

import { getToken, clearToken } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =========================================================
   AUTH HELPERS

   IMPORTANTE:
   La decodificación del JWT en frontend se utiliza
   únicamente para navegación/UI.

   La autorización real continúa en backend.
========================================================= */

function isTokenExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  return exp <= now;
}

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

function extractRol(decoded) {
  const rawRol = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const parsed = Number(rawRol);

  return Number.isInteger(parsed) && [1, 2, 3].includes(parsed) ? parsed : 0;
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function Configuracion() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  /* =======================================================
     ÁRBOL ACTUAL
  ======================================================= */

  const isSuperTree = useMemo(() => {
    const path = String(location.pathname ?? "");

    return path.startsWith("/super-dashboard/admin/dashboard");
  }, [location.pathname]);

  /* =======================================================
     BASE DE NAVEGACIÓN

     Admin:
     /admin

     Superadmin:
     /super-dashboard/admin/dashboard
  ======================================================= */

  const dashboardBase = useMemo(() => (isSuperTree ? "/super-dashboard/admin/dashboard" : "/admin"), [isSuperTree]);

  const [rol, setRol] = useState(null);

  /* =======================================================
     VALIDACIÓN DE SESIÓN / ROL

     Rol 1:
     puede utilizar configuración en árbol /admin.

     Rol 2:
     no puede administrar configuración.

     Rol 3:
     puede utilizar configuración únicamente dentro
     del árbol Superadmin tenantizado.

     NO se utiliza localStorage para determinar la
     academia de Admin.
  ======================================================= */

  useEffect(() => {
    const token = getToken?.() || "";

    /* ─────────────────────────────────────────
       SIN TOKEN
    ───────────────────────────────────────── */

    if (!token) {
      try {
        clearToken?.();
      } catch {}

      navigate("/login", {
        replace: true,
      });

      return;
    }

    try {
      const decoded = jwtDecode(token);

      /* ─────────────────────────────────────────
         TOKEN EXPIRADO
      ───────────────────────────────────────── */

      if (isTokenExpired(decoded)) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const currentRol = extractRol(decoded);

      /* ─────────────────────────────────────────
         TOKEN / ROL NO VÁLIDO PARA PANEL
      ───────────────────────────────────────── */

      if (!currentRol) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      /* =================================================
         STAFF
         Rol 2

         Puede tener sesión válida, pero NO tiene
         permisos para administrar configuración.

         IMPORTANTE:
         NO destruimos la sesión.
      ================================================= */

      if (currentRol === 2) {
        setRol(currentRol);

        navigate("/admin", {
          replace: true,
        });

        return;
      }

      /* =================================================
         SUPERADMIN
         Rol 3

         Debe trabajar dentro de:

         /super-dashboard/admin/dashboard

         No permitimos que utilice directamente
         /admin/configuracion.

         Tampoco destruimos la sesión.
      ================================================= */

      if (currentRol === 3 && !isSuperTree) {
        setRol(currentRol);

        navigate("/super-dashboard", {
          replace: true,
        });

        return;
      }

      /* =================================================
         ADMIN
         Rol 1

         No necesita:
         - weli_selected_academia
         - x-academia-id manual
         - academia en localStorage

         La academia viene firmada en su JWT y
         posteriormente será resuelta por backend.
      ================================================= */

      if (currentRol === 1 && isSuperTree) {
        setRol(currentRol);

        navigate("/admin/configuracion", {
          replace: true,
        });

        return;
      }

      /* =================================================
         AUTORIZADO
      ================================================= */

      if (![1, 3].includes(currentRol)) {
        navigate(currentRol === 3 ? "/super-dashboard" : "/admin", {
          replace: true,
        });

        return;
      }

      setRol(currentRol);
    } catch {
      /*
       * Únicamente se destruye sesión porque llegamos
       * aquí ante un JWT que no puede decodificarse
       * correctamente.
       */

      try {
        clearToken?.();
      } catch {}

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, isSuperTree]);

  /* =======================================================
     ENTIDADES DE CONFIGURACIÓN
  ======================================================= */

  const entidades = useMemo(() => {
    const base = dashboardBase;

    return [
      {
        nombre: "Gestionar categorías",

        ruta: `${base}/configuracion/categorias`,

        Icon: Layers,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar estados",

        ruta: `${base}/configuracion/estados`,

        Icon: CheckSquare,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar posiciones",

        ruta: `${base}/configuracion/posiciones`,

        Icon: Goal,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar medios de pago",

        ruta: `${base}/configuracion/medios-pago`,

        Icon: CreditCard,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar tipos de pago",

        ruta: `${base}/configuracion/tipos-pago`,

        Icon: ListChecks,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar roles",

        ruta: `${base}/configuracion/roles`,

        Icon: ShieldCheck,

        /*
         * Únicamente Superadmin.
         */
        roles: [3],
      },

      {
        nombre: "Gestionar colegios",

        ruta: `${base}/configuracion/establecimientos-educacionales`,

        Icon: GraduationCap,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar previsión médica",

        ruta: `${base}/configuracion/prevision-medica`,

        Icon: Stethoscope,

        roles: [1, 3],
      },

      {
        nombre: "Gestionar sucursales",

        ruta: `${base}/configuracion/sucursales`,

        Icon: Building2,

        roles: [1, 3],
      },

      {
        nombre: "Cambiar apariencia",

        ruta: `${base}/configuracion/cambiar-tema`,

        Icon: Palette,

        roles: [1, 3],
      },
    ];
  }, [dashboardBase]);

  /* =======================================================
     ENTIDADES VISIBLES SEGÚN ROL
  ======================================================= */

  const visibles = useMemo(() => {
    if (rol == null) {
      return [];
    }

    return entidades
      .filter((entidad) => !entidad.roles || entidad.roles.includes(rol))
      .sort((a, b) =>
        (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", {
          sensitivity: "base",
        })
      );
  }, [entidades, rol]);

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la fuente visual principal.

     Este fallback se mantiene únicamente como protección
     defensiva mientras el contexto inicializa.
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

     MISMA BASE VISUAL DE listarPagos.jsx

     REGLAS:
     - Dashboard controla TODO el fondo global.
     - Configuracion.jsx NO pinta background de página.
     - El wrapper raíz permanece transparente.
     - Sólo las tarjetas reales tienen superficie.
     - Toda la apariencia consume themeTokens.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card =
      "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-all duration-200 transform hover:-translate-y-1 hover:shadow-xl";

    const iconBadge = "w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors duration-200";

    const cardInner = "p-6 h-40 flex flex-col items-center justify-center gap-3 text-center";

    return {
      page,
      content,
      card,
      iconBadge,
      cardInner,

      pageStyle: {
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      cardStyle: {
        backgroundColor: tokens.surface,

        borderColor: tokens.border,

        color: tokens.text,

        "--weli-config-card-bg": tokens.surface,

        "--weli-config-card-hover": tokens.surfaceHover,

        "--weli-config-card-border": tokens.border,

        "--weli-config-card-border-hover": tokens.borderStrong,
      },

      iconBadgeStyle: {
        backgroundColor: tokens.surface2,

        borderColor: tokens.border,

        color: tokens.icon,
      },

      iconStyle: {
        color: tokens.icon,
      },

      cardTitleStyle: {
        color: tokens.text,
      },

      loadingStyle: {
        backgroundColor: tokens.surface,

        borderColor: tokens.border,

        color: tokens.textMuted,
      },
    };
  }, [tokens]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
      <style>
        {`
          .weli-config-card {
            background-color:
              var(--weli-config-card-bg) !important;

            border-color:
              var(--weli-config-card-border) !important;
          }

          .weli-config-card:hover {
            background-color:
              var(--weli-config-card-hover) !important;

            border-color:
              var(--weli-config-card-border-hover) !important;
          }

          .weli-config-link:focus-visible {
            outline:
              2px solid ${tokens.focus};

            outline-offset:
              4px;

            border-radius:
              1rem;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <div className="mx-auto max-w-4xl">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-200"
              style={{
                backgroundColor: tokens.surface2,

                borderColor: tokens.border,

                color: tokens.icon,
              }}
            >
              <SettingsIcon className="w-6 h-6" style={ui.iconStyle} />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Configuración
            </h1>

            <p
              className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={ui.subTextStyle}
            >
              Administra catálogos y parámetros del sistema.
            </p>
          </div>
        </header>

        {/* =================================================
            CONTENIDO
        ================================================= */}

        <main>
          {rol === null ? (
            /* ─────────────────────────────────────────────
               CARGANDO PERMISOS
            ───────────────────────────────────────────── */

            <div className="w-full max-w-5xl mx-auto mt-5">
              <div className={`${ui.card} p-6 text-center`} style={ui.loadingStyle}>
                <p
                  className="font-semibold"
                  style={{
                    color: tokens.textMuted,
                  }}
                >
                  Cargando permisos…
                </p>
              </div>
            </div>
          ) : (
            /* ─────────────────────────────────────────────
               CONFIGURACIÓN
            ───────────────────────────────────────────── */

            <div className="w-full max-w-5xl mx-auto mt-5">
              {visibles.length === 0 ? (
                <div className={`${ui.card} p-6 text-center`} style={ui.loadingStyle}>
                  <p
                    className="font-semibold"
                    style={{
                      color: tokens.textMuted,
                    }}
                  >
                    No hay módulos disponibles para tu rol.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
                  {visibles.map(({ nombre, ruta, Icon }) => (
                    <Link key={ruta} to={ruta} className="weli-config-link block" aria-label={nombre}>
                      <div className={`${ui.card} weli-config-card`} style={ui.cardStyle}>
                        <div className={ui.cardInner}>
                          <div className={ui.iconBadge} style={ui.iconBadgeStyle} aria-hidden="true">
                            <Icon className="w-8 h-8" style={ui.iconStyle} />
                          </div>

                          <h3 className="font-extrabold" style={ui.cardTitleStyle}>
                            {nombre}
                          </h3>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
