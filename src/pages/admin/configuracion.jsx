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
  const { darkMode } = useTheme();

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
     🎨 UI ESTILO SUPERDASHBOARD
  ======================================================= */

  const PALETTE_X = {
    copper: "#aa5013",

    brown: "#6d5829",

    cream: "#e8dac4",

    sand: "#ffdda1",

    terracotta: "#e2773b",
  };

  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";

    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "rounded-2xl border shadow-lg transition transform " +
      (darkMode
        ? "bg-white/10 border-white/15 hover:bg-white/12 hover:border-white/20"
        : "bg-white/60 border-ra-marron/15 hover:bg-white/75 hover:border-ra-marron/20") +
      " hover:-translate-y-1 hover:shadow-xl";

    const iconBadge =
      "w-14 h-14 rounded-2xl flex items-center justify-center border " +
      (darkMode ? "bg-white/12 border-white/18" : "bg-[rgba(109,88,41,0.08)] border-[rgba(109,88,41,0.18)]");

    const iconStyle = {
      color: darkMode ? PALETTE_X.cream : PALETTE_X.brown,
    };

    const cardInner = "p-6 h-40 flex flex-col items-center justify-center gap-3 text-center";

    const cardTitle = darkMode ? "text-white/90 font-extrabold" : "text-ra-marron font-extrabold";

    return {
      shell,
      titleMain,
      subText,
      card,
      iconBadge,
      iconStyle,
      cardInner,
      cardTitle,
    };
  }, [darkMode]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="px-6 pt-6 text-center">
        <h1
          className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain} flex items-center justify-center gap-3`}
        >
          <SettingsIcon className="w-8 h-8" style={ui.iconStyle} />
          Configuración
        </h1>

        <p className={`text-sm mt-2 ${ui.subText}`}>Administra catálogos y parámetros del sistema.</p>
      </header>

      {/* =================================================
          CONTENIDO
      ================================================= */}

      <main className="px-6 pb-20">
        {rol === null ? (
          /* ─────────────────────────────────────────────
             CARGANDO PERMISOS
          ───────────────────────────────────────────── */

          <div className="max-w-5xl mx-auto mt-8">
            <div className={`${ui.card} p-6 text-center`}>
              <p className={ui.subText}>Cargando permisos…</p>
            </div>
          </div>
        ) : (
          /* ─────────────────────────────────────────────
             CONFIGURACIÓN
          ───────────────────────────────────────────── */

          <div className="max-w-5xl mx-auto mt-8">
            {visibles.length === 0 ? (
              <div className={`${ui.card} p-6 text-center`}>
                <p className={ui.subText}>No hay módulos disponibles para tu rol.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {visibles.map(({ nombre, ruta, Icon }) => (
                  <Link key={ruta} to={ruta} className="block" aria-label={nombre}>
                    <div className={ui.card}>
                      <div className={ui.cardInner}>
                        <div className={ui.iconBadge} aria-hidden="true">
                          <Icon className="w-8 h-8" style={ui.iconStyle} />
                        </div>

                        <h3 className={ui.cardTitle}>{nombre}</h3>
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
  );
}
