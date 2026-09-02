// src/pages/admin/EstadosCuenta.jsx

import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { jwtDecode } from "jwt-decode";
import { Users, CreditCard, BarChart3 } from "lucide-react";
import { getToken, clearToken } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =========================================================
   RUTAS
========================================================= */

const ADMIN_HOME = "/admin";

const FINANCIAL_ROOT = `${ADMIN_HOME}/modulo-financiero`;

/* =========================================================
   AUTH HELPERS

   IMPORTANTE:
   jwtDecode en frontend se utiliza solamente para
   navegación y comportamiento visual.

   La autorización efectiva sigue perteneciendo
   al backend.
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

  const rol = Number(rawRol);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function EstadosCuenta() {
  const { darkMode } = useTheme();

  const navigate = useNavigate();

  useMobileAutoScrollTop();

  /* =======================================================
     VALIDACIÓN DE SESIÓN Y AUTORIZACIÓN

     REGLA EXISTENTE:
     SOLO ADMIN — ROL 1

     Esta política NO se modifica.
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken?.() || "";

      /* ===============================================
         SIN TOKEN
      =============================================== */

      if (!token) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const decoded = jwtDecode(token);

      /* ===============================================
         TOKEN EXPIRADO
      =============================================== */

      if (isTokenExpired(decoded)) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const rol = extractRol(decoded);

      /* ===============================================
         TOKEN CON ROL NO VÁLIDO PARA EL PANEL

         Se considera una estructura de sesión inválida.
      =============================================== */

      if (!rol) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      /* ===============================================
         AUTORIZACIÓN DEL MÓDULO

         SOLO ROL 1.

         El usuario mantiene una sesión válida,
         por lo que NO eliminamos su token.
      =============================================== */

      if (rol !== 1) {
        navigate(ADMIN_HOME, {
          replace: true,
        });

        return;
      }

      /*
       * Rol 1 autorizado.
       *
       * Este componente no necesita:
       *
       * - academia_id;
       * - weli_selected_academia;
       * - x-academia-id;
       * - headers manuales.
       *
       * Los módulos hijos resolverán su propio
       * contexto cuando realicen operaciones API.
       */
    } catch {
      /*
       * JWT ilegible o estructuralmente inválido.
       */

      try {
        clearToken?.();
      } catch {}

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate]);

  /* =======================================================
     MÓDULOS FINANCIEROS

     Se mantienen las rutas y permisos originales.
  ======================================================= */

  const modulosFinancieros = useMemo(
    () => [
      {
        nombre: "Jugadores con mensualidad vencida",

        ruta: `${FINANCIAL_ROOT}/jugadores-pendientes`,

        Icon: Users,
      },

      {
        nombre: "Pagos centralizados",

        ruta: `${FINANCIAL_ROOT}/pagos-centralizados`,

        Icon: CreditCard,
      },

      {
        nombre: "Power BI Finanzas (gráficos)",

        ruta: `${FINANCIAL_ROOT}/power-bi`,

        Icon: BarChart3,
      },
    ],
    []
  );

  /* =======================================================
     UI
  ======================================================= */

  const estiloFondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";

  const cardBase = darkMode
    ? "bg-[#1f2937] border border-[#2b3341] hover:border-[#24C6FF]"
    : "bg-white border border-[#eee] hover:border-[#24C6FF]";

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-weli`}>
      {/* =================================================
          TÍTULO
      ================================================= */}

      <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
        Módulo Financiero — Estado de Cuenta
      </h2>

      {/* =================================================
          SUBMÓDULOS
      ================================================= */}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {modulosFinancieros.map(({ nombre, ruta, Icon }) => (
          <Link key={ruta} to={ruta} className="block" aria-label={nombre}>
            <div
              className={`${cardBase} rounded-2xl p-6 shadow transition transform hover:-translate-y-1 hover:shadow-lg flex flex-col items-center justify-center gap-3 h-40`}
            >
              <Icon className="w-12 h-12 opacity-90" />

              <h3 className="text-center font-semibold">{nombre}</h3>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
