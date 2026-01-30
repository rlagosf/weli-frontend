// src/routes/routes.jsx
import { lazy, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ProtectedRoute from "../components/protectedRoute";
import useInactividadLogout from "../hooks/useInactividadLogout";
import Navbar from "../components/navbar";
import Footer from "../components/footer";
import { getToken, clearToken } from "../services/api";

/* -------------------- Públicos -------------------- */
const Landing = lazy(() => import("../pages/landing"));
const Contacto = lazy(() => import("../pages/contacto"));
const Servicios = lazy(() => import("../pages/servicios"));
const Ubicacion = lazy(() => import("../pages/ubicacion"));
const Nosotros = lazy(() => import("../pages/nosotros"));
const Galeria = lazy(() => import("../pages/galeria"));
const Noticias = lazy(() => import("../pages/noticias"));

/* -------------------- Login -------------------- */
const Login = lazy(() => import("../pages/admin/login"));
const LoginApoderado = lazy(() => import("../pages/admin/loginApoderado"));

/* -------------------- Admin -------------------- */
const DashboardLayout = lazy(() => import("../pages/admin/dashboard"));
const CrearJugador = lazy(() => import("../pages/admin/formjugador"));
const ListarJugadores = lazy(() => import("../pages/admin/listarJugadores"));
const Estadisticas = lazy(() => import("../pages/admin/estadisticas"));
const CrearUsuario = lazy(() => import("../pages/admin/crearUsuario"));
const Agenda = lazy(() => import("../pages/admin/agenda"));

const ListarPagos = lazy(() => import("../pages/admin/listarPagos"));
const PowerbiFinanzas = lazy(() => import("../pages/admin/powerbiFinanzas"));

const Configuracion = lazy(() => import("../pages/admin/configuracion"));
const Categorias = lazy(() => import("../pages/admin/configuracion/categorias"));
const MediosPago = lazy(() => import("../pages/admin/configuracion/mediospago"));
const TiposPago = lazy(() => import("../pages/admin/configuracion/tipospago"));
const Roles = lazy(() => import("../pages/admin/configuracion/roles"));
const EstadoJugadores = lazy(() => import("../pages/admin/configuracion/estadojugadores"));
const Posiciones = lazy(() => import("../pages/admin/configuracion/posiciones"));
const EstablecimientosEducacionales = lazy(() =>
  import("../pages/admin/configuracion/estableceduc")
);
const PrevisionMedica = lazy(() =>
  import("../pages/admin/configuracion/previsionmedica")
);
const Sucursales = lazy(() => import("../pages/admin/configuracion/sucursales"));

const CrearConvocatoria = lazy(() => import("../pages/admin/crearConvocatoria"));
const DetalleJugador = lazy(() => import("../pages/admin/detalleJugador"));
const VerConvocacionHistorica = lazy(() =>
  import("../pages/admin/verConvocatoriaHistorica")
);
const RegistrarEstadisticas = lazy(() =>
  import("../pages/admin/registraEstadistica")
);
const DetalleEstadistica = lazy(() => import("../pages/admin/detalleEstadistica"));

/* -------------------- Apoderado -------------------- */
const PortalHome = lazy(() => import("../pages/apoderado/portalHome")); // cambio clave
const PortalDashboard = lazy(() => import("../pages/apoderado/portalDashboard"));
const ConfiguracionApoderado = lazy(() =>
  import("../pages/apoderado/configuracionApoderado")
);

/* -------------------- Noticias (Admin) -------------------- */
const RegistroNoticias = lazy(() => import("../pages/admin/registroNoticias"));

/* -------------------- Shells -------------------- */
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
      <section id="ubicacion" className="scroll-mt-16">
        <Ubicacion />
      </section>
      <section id="contacto" className="scroll-mt-16">
        <Contacto />
      </section>
    </>
  );
}

function PublicShell() {
  return (
    <div className="scroll-smooth w-full min-h-screen bg-gradient-to-br from-[#1d0b0b] via-[#1d0b0b] to-[#e82d89] text-white font-sans">
      <Navbar />
      <main>
        <Home />
      </main>
      <Footer />
    </div>
  );
}

/**
 * Wrapper para auto-logout por inactividad.
 * - Ejecuta hook
 * - Opcional: valida token antes de renderizar (para evitar flashes)
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
    if (!requireToken) return;
    const t = getToken?.() || "";
    if (!t) {
      try { clearToken?.(); } catch {}
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, requireToken]);

  return children;
}

/* -------------------- Route Guards (wrappers) -------------------- */
/**
 * ✅ Admin gate:
 * - ProtectedRoute valida modo=admin y rol
 * - PrivateApp aplica inactividad y exige token
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
 * ✅ Apoderado gate (portal normal):
 * - ProtectedRoute valida modo=apoderado (sesión válida + permisos)
 * - PrivateApp aplica inactividad y exige token
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
 * ✅ Gate especial para cambio de clave:
 * - No usa ProtectedRoute (porque si backend responde PASSWORD_CHANGE_REQUIRED, el gate normal puede bloquear)
 * - Solo exige que exista token para permitir cambiar contraseña.
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

export const routes = [
  /* -------------------- Públicos -------------------- */
  { path: "/", element: <PublicShell /> },
  { path: "/galeria", element: <Galeria /> },
  { path: "/login", element: <Login /> },
  { path: "/login-apoderado", element: <LoginApoderado /> },

  /* -------------------- Admin (árbol) -------------------- */
  {
    path: "/admin",
    element: (
      <AdminGate>
        <DashboardLayout />
      </AdminGate>
    ),
    children: [
      { path: "crear-jugador", element: <CrearJugador /> },
      { path: "listar-jugadores", element: <ListarJugadores /> },
      { path: "estadisticas", element: <Estadisticas /> },
      { path: "crear-usuario", element: <CrearUsuario /> },
      { path: "agenda", element: <Agenda /> },

      { path: "gestionar-pagos", element: <ListarPagos /> },
      { path: "power-bi", element: <PowerbiFinanzas /> },

      { path: "configuracion", element: <Configuracion /> },
      { path: "configuracion/categorias", element: <Categorias /> },
      { path: "configuracion/medios-pago", element: <MediosPago /> },
      { path: "configuracion/tipos-pago", element: <TiposPago /> },
      { path: "configuracion/roles", element: <Roles /> },
      { path: "configuracion/estados", element: <EstadoJugadores /> },
      { path: "configuracion/posiciones", element: <Posiciones /> },
      {
        path: "configuracion/establecimientos-educacionales",
        element: <EstablecimientosEducacionales />,
      },
      { path: "configuracion/prevision-medica", element: <PrevisionMedica /> },
      { path: "configuracion/sucursales", element: <Sucursales /> },

      { path: "convocatorias", element: <CrearConvocatoria /> },
      { path: "detalle-jugador/:rut", element: <DetalleJugador /> },
      { path: "ver-convocaciones-historicas", element: <VerConvocacionHistorica /> },
      { path: "registrar-estadisticas", element: <RegistrarEstadisticas /> },
      { path: "detalle-estadistica/:rut", element: <DetalleEstadistica /> },

      { path: "noticias", element: <RegistroNoticias /> },
    ],
  },

  /* -------------------- Portal Apoderado -------------------- */
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

  /**
   * ✅ Cambio de clave:
   * lo dejamos “independiente” del gate normal para evitar lock infinito
   */
  {
    path: "/portal-apoderado/cambiar-clave",
    element: (
      <ApoderadoPwdGate>
        <PortalHome />
      </ApoderadoPwdGate>
    ),
  },
];
