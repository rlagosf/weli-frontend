// src/pages/admin/configuracion.jsx
import { useEffect, useMemo, useState, useRef } from "react";
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

/* ───────────────── Auth helpers ───────────────── */
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

  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const [rol, setRol] = useState(null);

  // anti-loop extra (por si alguien navega raro)
  const bootRef = useRef(false);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

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

  const entidades = useMemo(() => {
    const base = dashboardBase;
    return [
      { nombre: "Gestionar categorías", ruta: `${base}/configuracion/categorias`, Icon: Layers, roles: [1, 3] },
      { nombre: "Gestionar estados", ruta: `${base}/configuracion/estados`, Icon: CheckSquare, roles: [1, 3] },
      { nombre: "Gestionar posiciones", ruta: `${base}/configuracion/posiciones`, Icon: Goal, roles: [1, 3] },
      {
        nombre: "Gestionar medios de pago",
        ruta: `${base}/configuracion/medios-pago`,
        Icon: CreditCard,
        roles: [1, 3],
      },
      { nombre: "Gestionar tipos de pago", ruta: `${base}/configuracion/tipos-pago`, Icon: ListChecks, roles: [1, 3] },
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

  const visibles = useMemo(() => {
    if (rol == null) return [];
    return entidades
      .filter((e) => !e.roles || e.roles.includes(rol))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" }));
  }, [entidades, rol]);

  /* =======================
     🎨 UI estilo SuperDashboard.jsx
  ======================= */
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

    const iconStyle = { color: darkMode ? PALETTE_X.cream : PALETTE_X.brown };

    // botón/indicador mini
    const chip =
      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border " +
      (darkMode ? "bg-black/20 border-white/15 text-white/80" : "bg-white/70 border-ra-marron/15 text-ra-marron/70");

    // tarjeta clickable (todo el link)
    const cardInner = "p-6 h-40 flex flex-col items-center justify-center gap-3 text-center";

    const cardTitle = darkMode ? "text-white/90 font-extrabold" : "text-ra-marron font-extrabold";
    const cardHint = darkMode ? "text-white/70" : "text-ra-marron/70";

    return {
      shell,
      titleMain,
      subText,
      card,
      iconBadge,
      iconStyle,
      chip,
      cardInner,
      cardTitle,
      cardHint,
    };
  }, [darkMode]);

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* Header centrado tipo SuperDashboard */}
      <header className="px-6 pt-6 text-center">
        <h1
          className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain} flex items-center justify-center gap-3`}
        >
          <SettingsIcon className="w-8 h-8" style={ui.iconStyle} />
          Configuración
        </h1>

        <p className={`text-sm mt-2 ${ui.subText}`}>Administra catálogos y parámetros del sistema.</p>
      </header>

      <main className="px-6 pb-20">
        {rol === null ? (
          <div className="max-w-5xl mx-auto mt-8">
            <div className={`${ui.card} p-6 text-center`}>
              <p className={ui.subText}>Cargando permisos…</p>
            </div>
          </div>
        ) : (
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
