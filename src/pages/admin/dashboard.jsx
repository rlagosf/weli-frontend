// src/pages/admin/dashboard.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, setToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
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

/* =======================
   🎨 Conjunto X
======================= */
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

/* =======================
   Academia snapshot (normado)
======================= */
const STORAGE_KEY = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    // acepta "12"
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) {
      return { id: direct, nombre: null, deporte_nombre: null, estado_nombre: null, ts: null };
    }

    // acepta JSON
    const p = JSON.parse(raw);
    const id = Number(p?.id ?? p?.academia_id ?? p?.academy_id ?? 0);
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

/**
 * ✅ Guard normado:
 * - Árbol super: SOLO rol 3 + academia seleccionada
 * - Árbol admin: roles 1/2/3, pero exige scope (academia seleccionada)
 */
const ensureScopeOrRedirect = ({ navigate, isSuperTree }) => {
  const token = getToken?.() || "";
  if (!token) {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0, snap: null };
  }

  try {
    let decoded = jwtDecode(token);

    if (isExpired(decoded)) {
      return { ok: true, rol: extractRol(decoded), snap: null, needsRefresh: true };
    }

    const rol = extractRol(decoded);

    if (isSuperTree && rol !== 3) {
      navigate("/admin", { replace: true });
      return { ok: false, rol, snap: null };
    }

    const snap = readSelectedAcademia();

    if (isSuperTree && !snap) {
      navigate("/super-dashboard", { replace: true });
      return { ok: false, rol, snap: null };
    }

    if (!isSuperTree && !snap) {
      clearToken?.();
      navigate("/login", { replace: true });
      return { ok: false, rol, snap: null };
    }

    return { ok: true, rol, snap, needsRefresh: false };
  } catch {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0, snap: null };
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

  /* =======================
     Cards (roles reales)
  ======================= */
  const cards = useMemo(
    () => [
      { to: `${BASE}/crear-jugador`, label: "Crear Jugador", roles: [1, 3], Icon: UserPlus },
      { to: `${BASE}/listar-jugadores`, label: "Listar Jugadores", roles: [1, 2, 3], Icon: Users },

      { to: `${BASE}/registrar-estadisticas`, label: "Registrar Estadísticas", roles: [1, 2, 3], Icon: ClipboardList },
      { to: `${BASE}/estadisticas`, label: "Estadísticas Globales", roles: [1, 2, 3], Icon: BarChart3 },

      { to: `${BASE}/convocatorias`, label: "Crear Convocatorias", roles: [1, 3], Icon: CalendarPlus },
      { to: `${BASE}/ver-convocaciones-historicas`, label: "Historial Convocatorias", roles: [1, 2, 3], Icon: History },
      { to: `${BASE}/agenda`, label: "Agenda de eventos", roles: [1, 2, 3], Icon: CalendarDays },

      { to: `${BASE}/gestionar-pagos`, label: "Gestión de pagos", roles: [1, 3], Icon: Banknote },
      { to: `${BASE}/power-bi`, label: "POWER BI FINANCIERO", roles: [1, 3], Icon: PieChart },

      { to: `${BASE}/noticias`, label: "Registro Noticias", roles: [1, 2, 3], Icon: Newspaper, disabled: true },

      { to: `${BASE}/crear-usuario`, label: "Crear Usuario", roles: [1, 3], Icon: UserCog },
      { to: `${BASE}/configuracion`, label: "Configuración", roles: [1, 3], Icon: Settings },

      {
        to: `${BASE}/seguimiento-medico`,
        label: "Seguimiento médico",
        roles: [1, 2, 3],
        Icon: Stethoscope,
        disabled: true,
      },
    ],
    [BASE]
  );

  /* =======================
     Auth + refresh + guard
  ======================= */
  useEffect(() => {
    (async () => {
      try {
        const g0 = ensureScopeOrRedirect({ navigate, isSuperTree });
        if (!g0.ok && !g0.needsRefresh) return;

        let token = getToken?.() || "";
        let decoded = null;

        if (g0.needsRefresh) {
          try {
            const r = await api.post("/auth/refresh", null, { meta: { isPublic: false } });
            const newToken =
              r?.data?.access_token || r?.data?.token || r?.data?.weli_token || r?.data?.jwt || null;
            if (!newToken) throw new Error("no-refresh-token");
            setToken(String(newToken));
            token = String(newToken);
          } catch {
            clearToken?.();
            navigate("/login", { replace: true });
            return;
          }
        }

        try {
          decoded = jwtDecode(token);
        } catch {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }

        const r = extractRol(decoded);
        if (mountedRef.current) setRol(r);

        if (isSuperTree && r !== 3) {
          navigate("/admin", { replace: true });
          return;
        }

        const snap = readSelectedAcademia();
        if (mountedRef.current) setSelectedAcademia(snap);

        if (isSuperTree && r === 3 && !snap) {
          navigate("/super-dashboard", { replace: true });
          return;
        }

        if (!isSuperTree && !snap) {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }
      } catch {
        clearToken?.();
        navigate("/login", { replace: true });
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();
  }, [navigate, isSuperTree]);

  const handleCerrarSesion = useCallback(async () => {
    try {
      await api.post("/auth/logout", null, { meta: { isPublic: false } });
    } catch {
      // idempotente
    } finally {
      clearToken?.();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch { }
      window.location.replace("/");
    }
  }, []);

  const handleCambiarAcademia = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { }
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

  /* =======================
     ✅ ESTILO = SuperDashboard (tal cual)
  ======================= */
  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";
  const buttonIcon = darkMode ? "hover:bg-white/10" : "hover:bg-white/30";

  const card = darkMode
    ? "bg-white/10 border-white/15 hover:bg-white/15 hover:border-white/25"
    : "bg-white/60 border-ra-marron/15 hover:bg-white/80 hover:border-ra-terracotta";

  const badge = darkMode
    ? "bg-white/10 border-white/10 text-white/80"
    : "bg-white/60 border-ra-marron/10 text-ra-marron/80";

  return (
    <div className={`${shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6">
        {/* fila 1: breadcrumb (izq) + acciones (der) */}
        <div className="flex items-center justify-between gap-3">
          <nav className="text-sm min-w-0" aria-label="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 min-w-0">
              {breadcrumb.map((b, i) => (
                <li key={`${b.to}-${i}`} className="flex items-center gap-2 min-w-0">
                  {i !== 0 && <span className="opacity-50">/</span>}
                  {b.last ? (
                    <span className={`font-semibold truncate ${darkMode ? "text-white/90" : "text-ra-marron/90"}`}>
                      {b.label}
                    </span>
                  ) : (
                    <Link
                      className={`hover:opacity-90 truncate ${darkMode ? "text-white/80" : "text-ra-marron/80"}`}
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
              <div
                className={[
                  "hidden sm:flex items-center gap-2 rounded-2xl px-4 py-2 border",
                  darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15",
                ].join(" ")}
              >
                <Building2 className="w-4 h-4" />
                <span className="text-xs opacity-80">Academia:</span>
                <span className="text-xs font-extrabold">
                  {selectedAcademia.nombre ?? `#${selectedAcademia.id}`}
                </span>

                <button
                  type="button"
                  onClick={handleCambiarAcademia}
                  className={[
                    "ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition hover:opacity-90",
                    darkMode ? "border-white/20" : "border-ra-marron/15",
                  ].join(" ")}
                  title="Cambiar academia"
                >
                  <CornerUpLeft className="w-4 h-4" />
                  <span className="text-xs font-semibold">Cambiar</span>
                </button>
              </div>
            )}

            <button title="Cambiar tema" onClick={toggleTheme} className={`p-2 rounded-xl transition ${buttonIcon}`}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button title="Cerrar sesión" onClick={handleCerrarSesion} className={`p-2 rounded-xl transition ${buttonIcon}`}>
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* fila 2: título centrado bajo breadcrumb */}
        <h1 className="text-3xl font-extrabold text-center tracking-tight mt-6">
          Panel de Administración
        </h1>
      </header>


      <main className="px-6 pb-20">
        {isRoot ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards
              .filter((c) => !c.roles || c.roles.includes(rol))
              .sort((a, b) => (a.label || "").localeCompare(b.label || "", "es", { sensitivity: "base" }))
              .map(({ to, label, Icon, disabled }) => {
                const iconWrap =
                  darkMode
                    ? "bg-ra-terracotta/90 border border-white/10"
                    : "bg-ra-terracotta/90 border border-white/20";

                if (disabled) {
                  return (
                    <div
                      key={to}
                      className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 h-44 text-center opacity-60 cursor-not-allowed`}
                      title="Próximamente"
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${iconWrap}`}>
                        <Icon className="w-8 h-8 text-white" />
                      </div>

                      <div className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}>
                        {label}
                      </div>

                      <div className={`text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border ${badge}`}>
                        <span>Próximamente</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={to}
                    to={to}
                    className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 h-44 hover:-translate-y-1 text-center`}
                    aria-label={label}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${iconWrap}`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <div className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}>
                      {label}
                    </div>

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
