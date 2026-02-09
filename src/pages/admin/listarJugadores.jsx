// src/pages/admin/listarJugadores.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, {
  getToken,
  clearToken,
  ACADEMIA_STORAGE_KEY,
} from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* ─────────────────────────────
   Auth / Headers (WELI) — MISMO PATRÓN
───────────────────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
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

const getWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/")
    ? [path, path.slice(0, -1)]
    : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.get(url, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("GET failed");
};

const tryGetList = async (paths, { signal, headers } = {}) => {
  const list = Array.isArray(paths) ? paths : [paths];

  const variants = [];
  for (const p of list) {
    const base = p.startsWith("/") ? p : `/${p}`;
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
      // 404 u otros -> probamos siguiente
      continue;
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

  /* 🧭 Breadcrumb por defecto (MISMO PATRÓN que listarPagos.jsx)
     - No hardcodea rutas
     - Respeta trazabilidad si vienes con breadcrumb desde SuperDashboard
  */
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

      // ✅ Admin (1), Staff (2), Superadmin (3)
      if (![1, 2, 3].includes(rol)) {
        navigate("/admin", { replace: true });
        return;
      }

      // ✅ Si es superadmin, exige academia seleccionada (patrón WELI)
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
        // ✅ Misma lógica: rutas con fallback, sin inventar 20 endpoints
        const jugadoresPaths = ["/jugadores?include_inactivos=1", "/jugadores"];

        const [rawJugadores, posList, catList, estList] = await Promise.all([
          tryGetList(jugadoresPaths, { signal: abort.signal, headers }),
          tryGetList(["/posiciones"], { signal: abort.signal, headers }),
          tryGetList(["/categorias"], { signal: abort.signal, headers }),
          tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        const posMap = new Map(
          (posList ?? []).map((p) => [
            Number(p?.id ?? p?.posicion_id),
            String(p?.nombre ?? p?.descripcion ?? "").trim(),
          ])
        );

        const catMap = new Map(
          (catList ?? []).map((c) => [
            Number(c?.id ?? c?.categoria_id),
            String(c?.nombre ?? c?.descripcion ?? "").trim(),
          ])
        );

        const estMap = new Map(
          (estList ?? []).map((e) => [
            Number(e?.id ?? e?.estado_id),
            String(e?.nombre ?? e?.descripcion ?? "").trim(),
          ])
        );

        const safeJugadores = Array.isArray(rawJugadores) ? rawJugadores : [];

        const data = safeJugadores.map((j) => {
          const posId = Number(j?.posicion_id ?? j?.posicion?.id ?? NaN);
          const catId = Number(j?.categoria_id ?? j?.categoria?.id ?? NaN);
          const estId = Number(j?.estado_id ?? j?.estado?.id ?? NaN);

          const posicion =
            j?.posicion ??
            (Number.isFinite(posId) && posMap.has(posId)
              ? { nombre: posMap.get(posId) }
              : null);

          const categoria =
            j?.categoria ??
            (Number.isFinite(catId) && catMap.has(catId)
              ? { nombre: catMap.get(catId) }
              : null);

          const estado =
            j?.estado ??
            (Number.isFinite(estId) && estMap.has(estId)
              ? { nombre: estMap.get(estId) }
              : null);

          return { ...j, posicion, categoria, estado };
        });

        setJugadores(data);

        if (!data.length) {
          setError("⚠️ No se encontraron jugadores.");
        }
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

  /* 🎨 clases */
  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tablaCabecera = darkMode ? "bg-[#1f2937] text-white" : "bg-gray-100 text-[#1d0b0b]";
  const filaHover = darkMode ? "hover:bg-[#1f2937]" : "hover:bg-gray-100";

  const tarjetaClase = darkMode
    ? "bg-[#1f2937] shadow-lg rounded-lg p-4 border border-gray-700 hover:border-[#24C6FF] transition-colors"
    : "bg-white shadow-md rounded-lg p-4 border border-gray-200 hover:border-[#24C6FF] transition-colors";

  const handleClick = (rut, stateBreadcrumb) => {
    const base = String(location.pathname || "").replace(/\/$/, "");
    // /super-dashboard/admin/dashboard/listar-jugadores

    const to = `${base}/detalle-jugador/`;

    navigate(to, {
      state: {
        rut: String(rut),            // ✅ el rut viaja por state (RAFC style)
        from: base,                  // ✅ para volver bien
        breadcrumb:
          stateBreadcrumb ??
          [{ label: "Listar Jugadores", to: base }],
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
      <div className={`${fondoClase} min-h-screen flex justify-center items-center`}>
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className={`${fondoClase} px-2 sm:px-4 pt-4 pb-16 font-weli`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Lista de Jugadores</h2>

      {!!error && (
        <div className="max-w-5xl mx-auto mb-4">
          <div className={tarjetaClase}>
            <p className="text-yellow-400 text-center">{error}</p>
          </div>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className={tarjetaClase}>
          <p className="text-center text-gray-400 py-4">No hay jugadores registrados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([categoriaNombre, lista]) => (
            <div key={categoriaNombre} className={tarjetaClase}>
              <h3 className="text-xl font-semibold mb-3 text-center">
                Categoría {categoriaNombre}
              </h3>

              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[820px]">
                  <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                    <tr>
                      <th className="p-2 border text-center w-40">Nombre</th>
                      <th className="p-2 border text-center w-28">RUT</th>
                      <th className="p-2 border text-center w-16">Edad</th>
                      <th className="p-2 border text-center w-28">Teléfono</th>
                      <th className="p-2 border text-center w-40">Email</th>
                      <th className="p-2 border text-center w-28">Posición</th>
                      <th className="p-2 border text-center w-24">Estado</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lista.map((jugador) => {
                      const rutCrudo = jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? null;
                      const rutFmt = rutCrudo ? formatRutWithDV(rutCrudo) : "-";

                      return (
                        <tr
                          key={jugador?.rut_jugador ?? jugador?.id ?? `${categoriaNombre}-${String(rutCrudo ?? Math.random())}`}
                          className={`${filaHover} cursor-pointer`}
                          onClick={() => handleClick(jugador?.rut_jugador ?? jugador?.rut ?? rutCrudo)}
                          title="Ver detalle del jugador"
                        >
                          <td className="p-2 border text-center">{jugador?.nombre_jugador ?? "—"}</td>
                          <td className="p-2 border text-center">{rutFmt || rutCrudo || "-"}</td>
                          <td className="p-2 border text-center">{jugador?.edad ?? "-"}</td>
                          <td className="p-2 border text-center">{jugador?.telefono ?? "-"}</td>
                          <td className="p-2 border text-center break-all">{jugador?.email ?? "-"}</td>
                          <td className="p-2 border text-center">
                            {jugador?.posicion?.nombre ?? jugador?.posicion_id ?? "-"}
                          </td>
                          <td className="p-2 border text-center">
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
    </div>
  );
}
