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

function isTokenExpired(decoded) {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
}

function extractRol(decoded) {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Configuracion() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  // ✅ rol actual (para filtrar tarjetas como en dashboard)
  const [rol, setRol] = useState(null);

  // 🔐 Validación de sesión y autorización (permitimos 1 y 3)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);

      if (isTokenExpired(decoded)) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      const r = extractRol(decoded);
      setRol(r);

      if (![1, 3].includes(r)) {
        navigate(dashboardBase, { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, dashboardBase]);

  // 🎨 Estilos según tema (alineados al dashboard)
  const estiloFondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";

  const cardBase = darkMode
    ? "bg-[#1f2937] border border-[#2b3341] hover:border-[#e82d89]"
    : "bg-white border border-[#eee] hover:border-[#e82d89]";

  // 📚 Rutas de configuración con roles por tarjeta
  const entidades = useMemo(() => {
    const base = dashboardBase;
    return [
      { nombre: "Gestionar categorías", ruta: `${base}/configuracion/categorias`, Icon: Layers, roles: [1, 3] },
      { nombre: "Gestionar estados", ruta: `${base}/configuracion/estados`, Icon: CheckSquare, roles: [1, 3] },
      { nombre: "Gestionar posiciones", ruta: `${base}/configuracion/posiciones`, Icon: Goal, roles: [1, 3] },
      { nombre: "Gestionar medios de pago", ruta: `${base}/configuracion/medios-pago`, Icon: CreditCard, roles: [1, 3] },
      { nombre: "Gestionar tipos de pago", ruta: `${base}/configuracion/tipos-pago`, Icon: ListChecks, roles: [1, 3] },

      // 👑 SOLO rol 3
      { nombre: "Gestionar roles", ruta: `${base}/configuracion/roles`, Icon: ShieldCheck, roles: [3] },

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
      { nombre: "Gestionar sucursales", ruta: `${base}/configuracion/sucursales`, Icon: Building2, roles: [1, 3] },
    ];
  }, [dashboardBase]);

  // 🔒 Mientras no tenemos rol, evitamos parpadeos (y links que “duran 0.6s”)
  if (rol === null) {
    return (
      <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-weli`}>
        <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
          <SettingsIcon className="w-6 h-6" /> Panel de Configuración
        </h2>
        <p className="text-center opacity-70">Cargando permisos…</p>
      </div>
    );
  }

  const visibles = entidades
    .filter((e) => !e.roles || e.roles.includes(rol))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" }));

  return (
    <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-weli`}>
      <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
        <SettingsIcon className="w-6 h-6" /> Panel de Configuración
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {visibles.map(({ nombre, ruta, Icon }) => (
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
