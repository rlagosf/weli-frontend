// src/routes/routes.jsx

import { lazy, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";

import ProtectedRoute from "../components/ProtectedRoute";
import useInactividadLogout from "../hooks/useInactividadLogout";

import Navbar from "../components/navbar";
import Footer from "../components/footer";

import { getToken, clearToken } from "../services/api";

/* =========================================================
   PÚBLICOS
========================================================= */

const Landing = lazy(() => import("../pages/landing"));

const Contacto = lazy(() => import("../pages/contacto"));

const Servicios = lazy(() => import("../pages/servicios"));

const Nosotros = lazy(() => import("../pages/nosotros"));

const Noticias = lazy(() => import("../pages/noticias"));

/* =========================================================
   LOGIN
========================================================= */

const Login = lazy(() => import("../pages/admin/login"));

const LoginApoderado = lazy(() => import("../pages/admin/loginApoderado"));

/* =========================================================
   SUPERADMIN
========================================================= */

const SuperDashboard = lazy(() => import("../pages/admin/superDashboard"));

/* =========================================================
   ADMIN / STAFF / SUPERADMIN
========================================================= */

const DashboardLayout = lazy(() => import("../pages/admin/dashboard"));

const CrearJugador = lazy(() => import("../pages/admin/formjugador"));

const ListarJugadores = lazy(() => import("../pages/admin/listarJugadores"));

const Estadisticas = lazy(() => import("../pages/admin/estadisticas"));

const CrearUsuario = lazy(() => import("../pages/admin/crearUsuario"));

const Agenda = lazy(() => import("../pages/admin/agenda"));

const ListarPagos = lazy(() => import("../pages/admin/listarPagos"));

const PowerbiFinanzas = lazy(() => import("../pages/admin/powerbiFinanzas"));

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const Configuracion = lazy(() => import("../pages/admin/configuracion"));

const Categorias = lazy(() => import("../pages/admin/configuracion/categorias"));

const MediosPago = lazy(() => import("../pages/admin/configuracion/mediospago"));

const TiposPago = lazy(() => import("../pages/admin/configuracion/tipospago"));

const Roles = lazy(() => import("../pages/admin/configuracion/roles"));

const EstadoJugadores = lazy(() => import("../pages/admin/configuracion/estadojugadores"));

const Posiciones = lazy(() => import("../pages/admin/configuracion/posiciones"));

const EstablecimientosEducacionales = lazy(() => import("../pages/admin/configuracion/estableceduc"));

const PrevisionMedica = lazy(() => import("../pages/admin/configuracion/previsionmedica"));

const Sucursales = lazy(() => import("../pages/admin/configuracion/sucursales"));

/* =========================================================
   CONVOCATORIAS / JUGADORES / ESTADÍSTICAS
========================================================= */

const CrearConvocatoria = lazy(() => import("../pages/admin/crearConvocatoria"));

const DetalleJugador = lazy(() => import("../pages/admin/detalleJugador"));

const VerConvocacionHistorica = lazy(() => import("../pages/admin/verConvocatoriaHistorica"));

const RegistrarEstadisticas = lazy(() => import("../pages/admin/registraEstadistica"));

const DetalleEstadistica = lazy(() => import("../pages/admin/detalleEstadistica"));

/* =========================================================
   NOTICIAS ADMIN
========================================================= */

const RegistroNoticias = lazy(() => import("../pages/admin/registroNoticias"));

/* =========================================================
   APODERADO
========================================================= */

const PortalHome = lazy(() => import("../pages/apoderado/portalHome"));

const PortalDashboard = lazy(() => import("../pages/apoderado/portalDashboard"));

const ConfiguracionApoderado = lazy(() => import("../pages/apoderado/configuracionApoderado"));

/* =========================================================
   HOME
========================================================= */

function Home() {
  return (
    <>
      <section id="inicio" className="scroll-mt-16">
        <Landing />
      </section>

      <section id="nosotros" className="scroll-mt-16">
        <Nosotros />
      </section>

      <section id="noticias" className="scroll-mt-16">
        <Noticias />
      </section>

      <section id="servicios" className="scroll-mt-16">
        <Servicios />
      </section>

      <section id="contacto" className="scroll-mt-16">
        <Contacto />
      </section>
    </>
  );
}

/* =========================================================
   PUBLIC SHELL
========================================================= */

function PublicShell() {
  return (
    <div className="scroll-smooth w-full min-h-screen text-white font-sans bg-gradient-to-br from-ra-marron from-[0%] via-ra-terracotta via-[33%] via-ra-fucsia via-[66%] to-ra-sand to-[100%]">
      <Navbar />

      <main>
        <Home />
      </main>

      <Footer />
    </div>
  );
}

/* =========================================================
   PRIVATE APP
========================================================= */

/**
 * Control transversal:
 *
 * - existencia de token;
 * - inactividad;
 * - logout automático.
 *
 * IMPORTANTE:
 *
 * Esto NO decide roles.
 * ProtectedRoute sigue siendo responsable
 * de esa autorización.
 */
function PrivateApp({
  children,

  redirectTo,

  timeoutMs = 5 * 60 * 1000,

  pingMs = 15 * 1000,

  storageKey,

  forceKey,

  requireToken = true,
}) {
  const navigate = useNavigate();

  useInactividadLogout({
    timeoutMs,
    pingMs,
    redirectTo,
    storageKey,
    forceKey,
  });

  useEffect(() => {
    if (!requireToken) {
      return;
    }

    const token = getToken?.() || "";

    if (!token) {
      try {
        clearToken?.();
      } catch {}

      navigate(redirectTo, {
        replace: true,
      });
    }
  }, [navigate, redirectTo, requireToken]);

  return children;
}

/* =========================================================
   SECURITY GATES
========================================================= */

/**
 * ADMIN / STAFF
 *
 * Árbol normal:
 *
 * /admin
 *
 * Superadmin posee su propio árbol y no necesita
 * entrar directamente por /admin.
 */
const AdminGate = ({ children }) => (
  <ProtectedRoute mode="admin" roleIn={[1, 2]}>
    <PrivateApp
      redirectTo="/login"
      storageKey="weli_lastActivity_admin"
      forceKey="weli_forceLogout_admin"
      timeoutMs={5 * 60 * 1000}
      requireToken
    >
      {children}
    </PrivateApp>
  </ProtectedRoute>
);

/**
 * SUPERADMIN
 */
const SuperAdminGate = ({ children }) => (
  <ProtectedRoute mode="admin" roleIn={[3]}>
    <PrivateApp
      redirectTo="/login"
      storageKey="weli_lastActivity_superadmin"
      forceKey="weli_forceLogout_superadmin"
      timeoutMs={5 * 60 * 1000}
      requireToken
    >
      {children}
    </PrivateApp>
  </ProtectedRoute>
);

/**
 * Operaciones administrativas de escritura.
 *
 * Roles:
 *
 * 1 Admin
 * 3 Superadmin
 *
 * Staff 2 queda fuera.
 *
 * Esto refleja los nuevos routers backend:
 *
 * READ  [1,2,3]
 * WRITE [1,3]
 */
const WriteGate = ({ children }) => (
  <ProtectedRoute mode="admin" roleIn={[1, 3]}>
    {children}
  </ProtectedRoute>
);

/**
 * APODERADO
 */
const ApoderadoGate = ({ children }) => (
  <ProtectedRoute mode="apoderado">
    <PrivateApp
      redirectTo="/login-apoderado"
      storageKey="weli_lastActivity_apoderado"
      forceKey="weli_forceLogout_apoderado"
      timeoutMs={5 * 60 * 1000}
      requireToken
    >
      {children}
    </PrivateApp>
  </ProtectedRoute>
);

/**
 * Cambio obligatorio de contraseña.
 */
const ApoderadoPwdGate = ({ children }) => (
  <PrivateApp
    redirectTo="/login-apoderado"
    storageKey="weli_lastActivity_apoderado_pwd"
    forceKey="weli_forceLogout_apoderado_pwd"
    timeoutMs={5 * 60 * 1000}
    requireToken
  >
    {children}
  </PrivateApp>
);

/* =========================================================
   CHILDREN ADMIN
========================================================= */

/**
 * Este mismo árbol se reutiliza en:
 *
 * /admin
 *
 * y
 *
 * /super-dashboard/admin/dashboard
 *
 * El gate padre determina qué tipo de sesión
 * puede entrar al árbol.
 */
const adminChildren = [
  /* ─────────────────────────────────────────────
     JUGADORES
  ───────────────────────────────────────────── */

  {
    path: "crear-jugador",
    element: (
      <WriteGate>
        <CrearJugador />
      </WriteGate>
    ),
  },

  {
    path: "listar-jugadores",
    element: <ListarJugadores />,
  },

  /*
   * Ruta limpia utilizada por navegación
   * interna/breadcrumb.
   */
  {
    path: "listar-jugadores/detalle-jugador",

    element: <DetalleJugador />,
  },

  /*
   * Compatibilidad temporal legacy.
   */
  {
    path: "listar-jugadores/detalle-jugador/:rut",

    element: <DetalleJugador />,
  },

  {
    path: "detalle-jugador/:rut",

    element: <DetalleJugador />,
  },

  /* ─────────────────────────────────────────────
     ESTADÍSTICAS
  ───────────────────────────────────────────── */

  {
    path: "estadisticas",
    element: <Estadisticas />,
  },

  {
    path: "registrar-estadisticas",

    element: <RegistrarEstadisticas />,
  },

  {
    path: "registrar-estadisticas/detalle-estadistica",

    element: <DetalleEstadistica />,
  },

  /* ─────────────────────────────────────────────
     USUARIOS
  ───────────────────────────────────────────── */

  {
    path: "crear-usuario",

    element: (
      <WriteGate>
        <CrearUsuario />
      </WriteGate>
    ),
  },

  /* ─────────────────────────────────────────────
     AGENDA
  ───────────────────────────────────────────── */

  {
    path: "agenda",
    element: <Agenda />,
  },

  /* ─────────────────────────────────────────────
     PAGOS
  ───────────────────────────────────────────── */

  {
    path: "gestionar-pagos",

    element: <ListarPagos />,
  },

  {
    path: "power-bi",
    element: <PowerbiFinanzas />,
  },

  /* ─────────────────────────────────────────────
     CONFIGURACIÓN
     Solo Admin / Superadmin
  ───────────────────────────────────────────── */

  {
    path: "configuracion",

    element: (
      <WriteGate>
        <Configuracion />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/categorias",

    element: (
      <WriteGate>
        <Categorias />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/medios-pago",

    element: (
      <WriteGate>
        <MediosPago />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/tipos-pago",

    element: (
      <WriteGate>
        <TiposPago />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/roles",

    element: (
      <WriteGate>
        <Roles />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/estados",

    element: (
      <WriteGate>
        <EstadoJugadores />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/posiciones",

    element: (
      <WriteGate>
        <Posiciones />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/establecimientos-educacionales",

    element: (
      <WriteGate>
        <EstablecimientosEducacionales />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/prevision-medica",

    element: (
      <WriteGate>
        <PrevisionMedica />
      </WriteGate>
    ),
  },

  {
    path: "configuracion/sucursales",

    element: (
      <WriteGate>
        <Sucursales />
      </WriteGate>
    ),
  },

  /*
   * =====================================================
   * NUEVA CAPA COMERCIAL WELI
   * =====================================================
   *
   * NO registrar todavía rutas React para:
   *
   * configuracion/planes
   * configuracion/tarifas
   * configuracion/promociones
   * gestionar-cargos
   *
   * hasta crear sus respectivos componentes JSX.
   *
   * Sus ENDPOINTS HTTP YA EXISTEN:
   *
   * /api/planes
   * /api/plan-sucursales
   * /api/plan-tarifas
   * /api/tarifa-sucursales
   *
   * /api/promociones
   * /api/promocion-planes
   * /api/promocion-sucursales
   * /api/promocion-tipos-pago
   *
   * /api/jugador-planes
   * /api/cargos-jugador
   *
   * y se consumen mediante src/services/api.js.
   */

  /* ─────────────────────────────────────────────
     CONVOCATORIAS
  ───────────────────────────────────────────── */

  {
    path: "convocatorias",
    element: <CrearConvocatoria />,
  },

  {
    path: "ver-convocaciones-historicas",

    element: <VerConvocacionHistorica />,
  },

  /* ─────────────────────────────────────────────
     NOTICIAS ADMIN
  ───────────────────────────────────────────── */

  {
    path: "noticias",

    element: (
      <WriteGate>
        <RegistroNoticias />
      </WriteGate>
    ),
  },
];

/* =========================================================
   ROUTES
========================================================= */

export const routes = [
  /* ─────────────────────────────────────────────
     PÚBLICAS
  ───────────────────────────────────────────── */

  {
    path: "/",
    element: <PublicShell />,
  },

  {
    path: "/login",
    element: <Login />,
  },

  {
    path: "/login-apoderado",

    element: <LoginApoderado />,
  },

  /* ─────────────────────────────────────────────
     SUPERADMIN SELECTOR
  ───────────────────────────────────────────── */

  {
    path: "/super-dashboard",

    element: (
      <SuperAdminGate>
        <SuperDashboard />
      </SuperAdminGate>
    ),
  },

  /* ─────────────────────────────────────────────
     SUPERADMIN → ÁRBOL ADMIN TENANTIZADO
  ───────────────────────────────────────────── */

  {
    path: "/super-dashboard/admin/dashboard",

    element: (
      <SuperAdminGate>
        <DashboardLayout />
      </SuperAdminGate>
    ),

    children: adminChildren,
  },

  {
    path: "/super-dashboard/admin",

    element: <Navigate to="/super-dashboard/admin/dashboard" replace />,
  },

  /* ─────────────────────────────────────────────
     ADMIN / STAFF
  ───────────────────────────────────────────── */

  {
    path: "/admin",

    element: (
      <AdminGate>
        <DashboardLayout />
      </AdminGate>
    ),

    children: adminChildren,
  },

  /* ─────────────────────────────────────────────
     APODERADO
  ───────────────────────────────────────────── */

  {
    path: "/portal-apoderado",

    element: (
      <ApoderadoGate>
        <PortalDashboard />
      </ApoderadoGate>
    ),
  },

  {
    path: "/portal-apoderado/configuracion",

    element: (
      <ApoderadoGate>
        <ConfiguracionApoderado />
      </ApoderadoGate>
    ),
  },

  {
    path: "/portal-apoderado/cambiar-clave",

    element: (
      <ApoderadoPwdGate>
        <PortalHome />
      </ApoderadoPwdGate>
    ),
  },

  /* ─────────────────────────────────────────────
     FALLBACK
  ───────────────────────────────────────────── */

  {
    path: "*",

    element: <Navigate to="/" replace />,
  },
];
