// src/pages/admin/EstadosCuenta.jsx
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { jwtDecode } from "jwt-decode";
import {
  WalletCards as WalletIcon,
  Users,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { getToken, clearToken } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

export default function EstadosCuenta() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  // 🔐 Validación de sesión y autorización (solo admin = rol 1)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error('no-token');

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || decoded.exp <= now) {
        clearToken();
        navigate('/login', { replace: true });
        return;
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (rol !== 1) {
        navigate('/admin', { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useMobileAutoScrollTop();

  // 🎨 Estilos según tema (alineados al dashboard / configuración)
  const estiloFondo = darkMode ? 'bg-[#111827] text-white' : 'bg-white text-[#1d0b0b]';

  // ✅ Ajuste: acento WELI (antes #e82d89 de RAFC)
  const cardBase = darkMode
    ? 'bg-[#1f2937] border border-[#2b3341] hover:border-[#24C6FF]'
    : 'bg-white border border-[#eee] hover:border-[#24C6FF]';

  // 📚 Rutas del módulo financiero con íconos
  const modulosFinancieros = [
    {
      nombre: 'Jugadores con mensualidad vencida',
      ruta: '/admin/modulo-financiero/jugadores-pendientes',
      Icon: Users,
    },
    {
      nombre: 'Pagos centralizados',
      ruta: '/admin/modulo-financiero/pagos-centralizados',
      Icon: CreditCard,
    },
    {
      nombre: 'Power BI Finanzas (gráficos)',
      ruta: '/admin/modulo-financiero/power-bi',
      Icon: BarChart3,
    },
  ];

  return (
    <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-weli`}>
      {/* 💰 Título principal del módulo financiero */}
      <h2 className="text-2xl font-bold mb-8 text-center flex items-center justify-center gap-2">
         Módulo Financiero — Estado de Cuenta
      </h2>

      {/* 🗂 Tarjetas de acceso a los submódulos (igual look&feel que Configuración) */}
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
