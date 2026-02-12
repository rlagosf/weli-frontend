// src/pages/admin/listarJugadores.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* =======================
   🎨 Conjunto X
======================= */
const PALETTE = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

/* ─────────────────────────────
   Auth / Headers (WELI) — MISMO PATRÓN
───────────────────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Soporta "1" o JSON {"id":1} */
const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const buildHeaders = (rol) => {
  const token = getToken();
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rol === 3) {
    const a = getAcademiaIdFromStorage();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

/* ─────────────────────────────
   Helpers robustos (con headers/signal)
───────────────────────────── */
const normalizeListResponse = (res) => {
  if (!res || res.status === 204) return [];
  const data = res.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (data?.ok && Array.isArray(data?.data)) return data.data;
  if (data?.ok && Array.isArray(data?.items)) return data.items;
  return [];
};

const tryGetList = async (paths, { signal, headers } = {}) => {
  const list = Array.isArray(paths) ? paths : [paths];

  const variants = [];
  for (const p of list) {
    const base = String(p || "").startsWith("/") ? String(p || "") : `/${String(p || "")}`;
    variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, headers });
      return normalizeListResponse(r);
    } catch (e) {
      const st = e?.status ?? e?.response?.status ?? 0;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

export default function ListarJugadores() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [rolActual, setRolActual] = useState(0);

  const [jugadores, setJugadores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useMobileAutoScrollTop();

  /* 🧭 Breadcrumb por defecto (MISMO PATRÓN) */
  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ to: location.pathname, label: "Listar Jugadores" }],
        },
      });
    }
  }, [location, navigate]);

  /* 🔐 Validación de sesión/rol (incluye rol 3) */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);

      if (![1, 2, 3].includes(rol)) {
        navigate("/admin", { replace: true });
        return;
      }

      if (rol === 3) {
        const a = getAcademiaIdFromStorage();
        if (!a) throw new Error("missing-academia-target");
      }

      setRolActual(rol);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* 📥 Carga de jugadores + catálogos mínimos */
  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();
    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const jugadoresPaths = ["/jugadores?include_inactivos=1", "/jugadores"];

        const [rawJugadores, posList, catList, estList] = await Promise.all([
          tryGetList(jugadoresPaths, { signal: abort.signal, headers }),
          tryGetList(["/posiciones", "/posicion"], { signal: abort.signal, headers }),
          tryGetList(["/categorias", "/categoria"], { signal: abort.signal, headers }),
          tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        const posMap = new Map(
          (posList ?? [])
            .map((p) => [
              Number(p?.id ?? p?.posicion_id),
              String(p?.nombre ?? p?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && !!nombre)
        );

        const catMap = new Map(
          (catList ?? [])
            .map((c) => [
              Number(c?.id ?? c?.categoria_id),
              String(c?.nombre ?? c?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && !!nombre)
        );

        const estMap = new Map(
          (estList ?? [])
            .map((e) => [
              Number(e?.id ?? e?.estado_id),
              String(e?.nombre ?? e?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && !!nombre)
        );

        const safeJugadores = Array.isArray(rawJugadores) ? rawJugadores : [];

        const data = safeJugadores.map((j) => {
          const posId = Number(j?.posicion_id ?? j?.posicion?.id ?? NaN);
          const catId = Number(j?.categoria_id ?? j?.categoria?.id ?? NaN);
          const estId = Number(j?.estado_id ?? j?.estado?.id ?? NaN);

          const posicion =
            j?.posicion ??
            (Number.isFinite(posId) && posMap.has(posId) ? { nombre: posMap.get(posId) } : null);

          const categoria =
            j?.categoria ??
            (Number.isFinite(catId) && catMap.has(catId) ? { nombre: catMap.get(catId) } : null);

          const estado =
            j?.estado ??
            (Number.isFinite(estId) && estMap.has(estId) ? { nombre: estMap.get(estId) } : null);

          return { ...j, posicion, categoria, estado };
        });

        setJugadores(data);

        if (!data.length) setError("⚠️ No se encontraron jugadores.");
      } catch (err) {
        if (abort.signal.aborted) return;

        const status = err?.status ?? err?.response?.status ?? 0;
        const msg = String(err?.message || "").toLowerCase();

        if (status === 401 || status === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (rolActual === 3 && (msg.includes("academia") || msg.includes("x-academia"))) {
          setError("⚠️ Superadmin: selecciona una academia para listar jugadores.");
          return;
        }

        setError("❌ No se pudo cargar la lista de jugadores");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [rolActual, navigate]);

  /* =======================
     UI (clon SuperDashboard)
     + encabezados marrón
     + divisores más notables
======================= */
  const ui = useMemo(() => {
    // mismo “shell” que superDashboard (pero sin romper tu layout: dejamos el fondo al layout)
    const page = "min-h-screen font-sans bg-transparent px-6 pt-6 pb-20";

    const title = darkMode ? "text-white" : "text-ra-marron";
    const subtitle = darkMode ? "text-white/70" : "text-ra-marron/70";

    const msgBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    // card idéntica a las cards del panel
    const card =
      "max-w-6xl mx-auto rounded-2xl shadow-2xl border p-6 " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    // divisores más notables (pedido)
    const line = darkMode ? "rgba(255,255,255,0.18)" : "rgba(109,88,41,0.22)";
    const border = `1px solid ${line}`;

    const tableWrap = "w-full overflow-x-auto";

    // tabla con bordes más marcados
    const table = "w-full text-xs sm:text-sm min-w-[900px] border-separate border-spacing-0";

    // encabezado marrón
    const thead =
      "text-[10px] sm:text-xs " +
      (darkMode ? "bg-black/20" : "bg-ra-cream/90");

    const thBase =
      "p-2 text-center whitespace-nowrap font-extrabold " +
      (darkMode ? "text-[#ffdda1]" : "text-[#6d5829]"); // sand en dark, brown en light

    // bordes en th/td más notorios
    const cellBorderStyle = { borderRight: border, borderBottom: border };
    const headBorderStyle = { borderRight: border, borderBottom: border, borderTop: border };

    const tr =
      "cursor-pointer transition " +
      (darkMode ? "hover:bg-white/10" : "hover:bg-white/70");

    const tdBase =
      "p-2 text-center " +
      (darkMode ? "text-white/90" : "text-ra-marron");

    const badge =
      "text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border " +
      (darkMode ? "bg-white/10 border-white/10 text-white/80" : "bg-white/60 border-ra-marron/10 text-ra-marron/80");

    return {
      page,
      title,
      subtitle,
      msgBox,
      warnBox,
      card,
      tableWrap,
      table,
      thead,
      thBase,
      tr,
      tdBase,
      badge,
      cellBorderStyle,
      headBorderStyle,
      border,
      line,
    };
  }, [darkMode]);

  const handleClick = (rut, stateBreadcrumb) => {
    const base = String(location.pathname || "").replace(/\/$/, "");
    const rutClean = String(rut ?? "").trim();
    if (!rutClean) return;

    const to = `${base}/detalle-jugador`;

    navigate(to, {
      state: {
        rut: rutClean,
        from: base,
        breadcrumb: [
          ...(stateBreadcrumb ?? [{ label: "Listar Jugadores", to: base }]),
          { label: "Detalle Jugador", to },
        ],
      },
    });
  };

  /* 🧩 Agrupar por categoría */
  const grupos = useMemo(() => {
    const m = new Map();
    for (const j of jugadores) {
      const cat = j?.categoria?.nombre || "Sin categoría";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(j);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [jugadores]);

  if (isLoading) return <IsLoading />;

  if (error && !jugadores.length) {
    return (
      <div className={`${ui.page} flex justify-center items-center`}>
        <div className={ui.msgBox}>{error}</div>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      {/* Header estilo SuperDashboard */}
      <header className="max-w-6xl mx-auto">
        <div className="text-center">
          <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.title}`}>
            Lista de Jugadores
          </h1>
          <p className={`text-sm mt-2 ${ui.subtitle}`}>
            Selecciona un jugador para ver su detalle.
          </p>
        </div>
      </header>

      <main className="mt-8">
        {!!error && (
          <div className="max-w-6xl mx-auto mb-6">
            <div className={ui.warnBox}>{error}</div>
          </div>
        )}

        {grupos.length === 0 ? (
          <div className={ui.card}>
            <p className={`text-center py-6 ${ui.subtitle}`}>No hay jugadores registrados.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grupos.map(([categoriaNombre, lista]) => (
              <div key={categoriaNombre} className={ui.card}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-xl font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                    Categoría {categoriaNombre}
                  </h3>
                  <span className={ui.badge}>Jugadores: {lista.length}</span>
                </div>

                <div className="mt-4" style={{ height: 1, background: ui.line }} />

                <div className={`mt-4 ${ui.tableWrap}`}>
                  <table className={ui.table}>
                    <thead className={ui.thead}>
                      <tr>
                        <th className={`${ui.thBase} w-44`} style={{ ...ui.headBorderStyle, borderLeft: ui.border }}>
                          Nombre
                        </th>
                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          RUT
                        </th>
                        <th className={`${ui.thBase} w-16`} style={ui.headBorderStyle}>
                          Edad
                        </th>
                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          Teléfono
                        </th>
                        <th className={`${ui.thBase} w-44`} style={ui.headBorderStyle}>
                          Email
                        </th>
                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          Posición
                        </th>
                        <th className={`${ui.thBase} w-24`} style={ui.headBorderStyle}>
                          Estado
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {lista.map((jugador) => {
                        const rutCrudo = jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? null;
                        const rutFmt = rutCrudo ? formatRutWithDV(rutCrudo) : "-";
                        const rutKey = String(jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? "");

                        return (
                          <tr
                            key={`${categoriaNombre}-${rutKey || "no-rut"}`}
                            className={ui.tr}
                            onClick={() => handleClick(jugador?.rut_jugador ?? jugador?.rut ?? rutCrudo)}
                            title="Ver detalle del jugador"
                          >
                            <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderLeft: ui.border }}>
                              {jugador?.nombre_jugador ?? "—"}
                            </td>
                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {rutFmt || rutCrudo || "-"}
                            </td>
                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.edad ?? "-"}
                            </td>
                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.telefono ?? "-"}
                            </td>
                            <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                              {jugador?.email ?? "-"}
                            </td>
                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.posicion?.nombre ?? jugador?.posicion_id ?? "-"}
                            </td>
                            <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderRight: ui.border }}>
                              {jugador?.estado?.nombre ?? jugador?.estado_id ?? "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
