// src/pages/admin/dashboard.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, setToken } from "../../services/api";
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

/* ───────────────── RA Theme ───────────────── */
const RA = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

const segToLabel = (seg) => {
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

  return map[seg] || (seg?.charAt(0).toUpperCase() + seg.slice(1).replaceAll("-", " "));
};

const isExpired = (decoded) => !decoded?.exp || decoded.exp * 1000 < Date.now();

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ───────────────── Academia snapshot ───────────────── */
const STORAGE_KEY = "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const id = Number(p?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;

    return {
      id,
      nombre: p?.nombre ?? null,
      deporte_nombre: p?.deporte_nombre ?? null,
      estado_nombre: p?.estado_nombre ?? null,
      ts: p?.ts ?? null,
    };
  } catch {
    return null;
  }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleTheme } = useTheme();

  const mountedRef = useRef(true);

  const [rol, setRol] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAcademia, setSelectedAcademia] = useState(null);

  useMobileAutoScrollTop();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isSuperTree = useMemo(
    () => location.pathname.startsWith("/super-dashboard/admin/dashboard"),
    [location.pathname]
  );

  const ROOT = isSuperTree ? "/super-dashboard/admin/dashboard" : "/admin";
  const BASE = ROOT;

  /* ───────────────── Cards (roles reales, sin “3->1”) ───────────────── */
  const cards = useMemo(
    () => [
      // jugadores
      { to: `${BASE}/crear-jugador`, label: "Crear Jugador", roles: [1, 3], Icon: UserPlus },
      { to: `${BASE}/listar-jugadores`, label: "Listar Jugadores", roles: [1, 2, 3], Icon: Users },

      // estadísticas
      { to: `${BASE}/registrar-estadisticas`, label: "Registrar Estadísticas", roles: [1, 2, 3], Icon: ClipboardList },
      { to: `${BASE}/estadisticas`, label: "Estadísticas Globales", roles: [1, 2, 3], Icon: BarChart3 },

      // convocatorias / agenda
      { to: `${BASE}/convocatorias`, label: "Crear Convocatorias", roles: [1, 3], Icon: CalendarPlus },
      { to: `${BASE}/ver-convocaciones-historicas`, label: "Historial Convocatorias", roles: [1, 2, 3], Icon: History },
      { to: `${BASE}/agenda`, label: "Agenda de eventos", roles: [1, 2, 3], Icon: CalendarDays },

      // pagos
      { to: `${BASE}/gestionar-pagos`, label: "Gestión de pagos", roles: [1, 3], Icon: Banknote },
      { to: `${BASE}/power-bi`, label: "POWER BI FINANANCIERO", roles: [1, 3], Icon: PieChart },

      // noticias
      { to: `${BASE}/noticias`, label: "Registro Noticias", roles: [1, 2, 3], Icon: Newspaper },

      // usuarios / configuración
      { to: `${BASE}/crear-usuario`, label: "Crear Usuario", roles: [1, 3], Icon: UserCog },

      // ⚠️ Si “Configuración” es SOLO por academia, superadmin también debería verla (tenantizado)
      { to: `${BASE}/configuracion`, label: "Configuración", roles: [1, 3], Icon: Settings },

      {
        to: `${BASE}/seguimiento-medico`,
        label: "Seguimiento médico (próximamente)",
        roles: [1, 2, 3],
        Icon: Stethoscope,
        disabled: true,
      },
    ],
    [BASE]
  );

  /* ───────────────── Auth + guard superadmin ───────────────── */
  useEffect(() => {
    (async () => {
      try {
        let token = getToken();
        if (!token) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        let decoded;
        try {
          decoded = jwtDecode(token);
        } catch {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        // Refresh si expira (si tu backend lo soporta)
        if (isExpired(decoded)) {
          try {
            const r = await api.post("/auth/refresh");
            const newToken = r?.data?.access_token;
            if (!newToken) throw new Error("no-refresh-token");
            setToken(newToken);
            token = newToken;
            decoded = jwtDecode(token);
          } catch {
            clearToken();
            navigate("/login", { replace: true });
            return;
          }
        }

        const r = extractRol(decoded);
        if (mountedRef.current) setRol(r);

        // si está en árbol super-dashboard, SOLO rol 3
        if (isSuperTree && r !== 3) {
          navigate("/admin", { replace: true });
          return;
        }

        // rol 3 dentro del árbol super: exige academia seleccionada
        if (r === 3 && isSuperTree) {
          const snap = readSelectedAcademia();
          if (mountedRef.current) setSelectedAcademia(snap);
          if (!snap) {
            navigate("/super-dashboard", { replace: true });
            return;
          }
        }
      } catch {
        clearToken();
        navigate("/login", { replace: true });
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();
  }, [navigate, isSuperTree]);

  const handleCerrarSesion = useCallback(async () => {
    const token = getToken();
    try {
      await api.post("/auth/logout", null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // idempotente
    } finally {
      clearToken();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.location.replace("/");
    }
  }, []);

  const handleCambiarAcademia = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    navigate("/super-dashboard", { replace: true });
  }, [navigate]);

  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    const base = [{ to: ROOT, label: "Inicio", last: false }];
    if (path === ROOT) return [{ ...base[0], last: true }];

    const rest = path.startsWith(ROOT) ? path.slice(ROOT.length) : path;
    const parts = rest.split("/").filter(Boolean);

    let acc = ROOT;
    const tail = parts.map((seg, idx) => {
      acc += `/${seg}`;
      return { to: acc, label: segToLabel(seg), last: idx === parts.length - 1 };
    });

    const all = [...base, ...tail];
    return all.map((x, i) => ({ ...x, last: i === all.length - 1 }));
  }, [location.pathname, ROOT]);

  if (isLoading || rol === null) return <IsLoading />;

  const isRoot = location.pathname === ROOT;

  /* ───────────────── UI Skin ───────────────── */
  const pageBg = darkMode
    ? "bg-gradient-to-br from-[#160a05] via-[#111827] to-[#0b1220] text-white"
    : "bg-gradient-to-br from-[#fff7ef] via-[#fff] to-[#fffbf5] text-[#1d0b0b]";

  const cardBase = darkMode
    ? "bg-white/5 border border-white/10 hover:border-[#aa5013] hover:bg-white/7"
    : "bg-white border border-black/5 hover:border-[#aa5013] hover:shadow-md";

  const actionBtn = darkMode ? "hover:bg-white/10" : "hover:bg-black/5";

  const academiaPill = darkMode
    ? "bg-white/5 border-white/15 text-white"
    : "bg-white border-black/10 text-[#1d0b0b]";

  return (
    <div className={`${pageBg} min-h-screen font-weli`}>
      <header className="px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <nav className="text-sm min-w-0" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 min-w-0">
              {breadcrumb.map((b, i) => (
                <li key={`${b.to}-${i}`} className="flex items-center gap-2 min-w-0">
                  {i !== 0 && <span className="opacity-50">/</span>}
                  {b.last ? (
                    <span className="font-semibold truncate" style={{ color: RA.copper }}>
                      {b.label}
                    </span>
                  ) : (
                    <Link
                      className="hover:opacity-90 truncate"
                      style={{ color: darkMode ? "#fff" : RA.brown }}
                      to={b.to}
                    >
                      {b.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            {rol === 3 && isSuperTree && selectedAcademia && (
              <div className={`hidden sm:flex items-center gap-2 ${academiaPill} px-3 py-1.5 rounded-xl border`}>
                <Building2 className="w-4 h-4" />
                <span className="text-xs opacity-80">Academia:</span>
                <span className="text-xs font-extrabold" style={{ color: RA.copper }}>
                  {selectedAcademia.nombre ?? `#${selectedAcademia.id}`}
                </span>

                <button
                  type="button"
                  onClick={handleCambiarAcademia}
                  className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition"
                  style={{ borderColor: `${RA.copper}55` }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = RA.copper)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${RA.copper}55`)}
                  title="Cambiar academia"
                >
                  <CornerUpLeft className="w-4 h-4" />
                  <span className="text-xs font-semibold">Cambiar</span>
                </button>
              </div>
            )}

            <button
              title="Cambiar tema"
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition ${actionBtn}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button
              title="Cerrar sesión"
              onClick={handleCerrarSesion}
              className={`p-2 rounded-xl transition ${actionBtn}`}
              aria-label="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-center tracking-tight mt-6">
          Panel de Administración
        </h1>
        <p className="text-center text-sm opacity-70 mt-1">
          Gestión multi-academia con control por roles.
        </p>
      </header>

      <main className="px-6 pb-20 mt-7">
        {isRoot ? (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards
              .filter((c) => !c.roles || c.roles.includes(rol))
              .sort((a, b) => (a.label || "").localeCompare(b.label || "", "es", { sensitivity: "base" }))
              .map(({ to, label, Icon, disabled }) => {
                const common =
                  `${cardBase} rounded-2xl p-6 shadow-sm transition transform ` +
                  "flex flex-col items-center justify-center gap-3 h-40";

                const iconBg = darkMode
                  ? `linear-gradient(135deg, rgba(170,80,19,.22), rgba(221,162,114,.10))`
                  : `linear-gradient(135deg, rgba(170,80,19,.12), rgba(221,162,114,.08))`;

                if (disabled) {
                  return (
                    <div key={to} className={`${common} opacity-60 cursor-not-allowed`} title="Próximamente">
                      <div className="rounded-2xl p-3" style={{ background: iconBg, border: `1px solid ${RA.copper}22` }}>
                        <Icon className="w-10 h-10" style={{ color: RA.copper }} />
                      </div>
                      <div className="text-center font-bold leading-tight">{label}</div>
                    </div>
                  );
                }

                return (
                  <Link key={to} to={to} className={`${common} hover:-translate-y-1 hover:shadow-lg`}>
                    <div className="rounded-2xl p-3" style={{ background: iconBg, border: `1px solid ${RA.copper}22` }}>
                      <Icon className="w-10 h-10" style={{ color: RA.copper }} />
                    </div>
                    <div className="text-center font-bold leading-tight">{label}</div>
                  </Link>
                );
              })}
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
