// src/pages/admin/configuracion.jsx
import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { jwtDecode } from "jwt-decode";
import {
  Settings as SettingsIcon,
  Layers, // Categorías
  CheckSquare, // Estados
  Goal, // Posiciones de fútbol
  CreditCard, // Medios de pago
  ListChecks, // Tipos de pago
  ShieldCheck, // Roles
  GraduationCap, // Establecimientos educacionales
  Stethoscope, // Previsión médica
  Building2, // Sucursales
} from "lucide-react";
import { getToken, clearToken } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/**
 * ✅ Admin only = rol 1
 * - Valida token existente
 * - Valida exp
 * - Valida rol
 * Si falla: clearToken + redirect login
 */
function isTokenExpired(decoded) {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
}

function extractRol(decoded) {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Configuracion() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  useMobileAutoScrollTop();

  // 🔐 Validación de sesión y autorización (solo admin = rol 1)
  useEffect(() => {
    try {
      const token = getToken(); // ✅ fuente de verdad (WELI)
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);

      if (isTokenExpired(decoded)) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      const rol = extractRol(decoded);

      if (rol !== 1) {
        // ✅ no es admin -> fuera del panel de config
        navigate("/admin", { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // 🎨 Estilos según tema (alineados al dashboard)
  const estiloFondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";

  const cardBase = darkMode
    ? "bg-[#1f2937] border border-[#2b3341] hover:border-[#e82d89]"
    : "bg-white border border-[#eee] hover:border-[#e82d89]";

  // 📚 Rutas de configuración con íconos
  const entidades = useMemo(
    () => [
      { nombre: "Gestionar categorías", ruta: "/admin/configuracion/categorias", Icon: Layers },
      { nombre: "Gestionar estados", ruta: "/admin/configuracion/estados", Icon: CheckSquare },
      { nombre: "Gestionar posiciones de fútbol", ruta: "/admin/configuracion/posiciones", Icon: Goal },
      { nombre: "Gestionar medios de pago", ruta: "/admin/configuracion/medios-pago", Icon: CreditCard },
      { nombre: "Gestionar tipos de pago", ruta: "/admin/configuracion/tipos-pago", Icon: ListChecks },
      { nombre: "Gestionar roles", ruta: "/admin/configuracion/roles", Icon: ShieldCheck },
      {
        nombre: "Gestionar colegios",
        ruta: "/admin/configuracion/establecimientos-educacionales",
        Icon: GraduationCap,
      },
      { nombre: "Gestionar previsión médica", ruta: "/admin/configuracion/prevision-medica", Icon: Stethoscope },
      { nombre: "Gestionar sucursales", ruta: "/admin/configuracion/sucursales", Icon: Building2 },
    ],
    []
  );

  return (
    <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-weli`}>
      {/* 🛠 Título principal */}
      <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
        <SettingsIcon className="w-6 h-6" /> Panel de Configuración
      </h2>

      {/* 🗂 Opciones de gestión */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {entidades.map(({ nombre, ruta, Icon }) => (
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
