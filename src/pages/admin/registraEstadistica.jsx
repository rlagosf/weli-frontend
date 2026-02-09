// src/pages/admin/ListarEstadisticas.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { getToken, clearToken } from "../../services/api";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { Pencil } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut"; // ✅ solo frontend

/* ───────────────── Scope helpers ───────────────── */
const STORAGE_KEY = "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const id = Number(p?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const deporte_id = Number(p?.deporte_id ?? 0);
    return {
      id,
      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
      nombre: p?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) =>
  String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

export default function ListarEstadisticas() {
  const { darkMode } = useTheme();
  const [jugadoresRaw, setJugadoresRaw] = useState([]);
  const [categoriasRaw, setCategoriasRaw] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rol, setRol] = useState(null);

  // ✅ scope real (academia/deporte)
  const [scope, setScope] = useState({
    academia_id: null,
    deporte_id: null,
    academia_nombre: null,
  });

  const navigate = useNavigate();
  const location = useLocation();

  // 🧭 Inyecta breadcrumb base si no viene en state
  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ label: "Registrar Estadísticas", to: "/admin/registrar-estadisticas" }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  /* ───────────────── Auth + Scope ───────────────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const parsedRol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ permitir 1/2/3
      if (![1, 2, 3].includes(parsedRol)) {
        navigate("/admin", { replace: true });
        return;
      }
      setRol(parsedRol);

      const superTree = isSuperTreePath(location.pathname);
      if (superTree) {
        const snap = readSelectedAcademia();
        if (!snap?.id) {
          navigate("/super-dashboard", { replace: true });
          return;
        }
        setScope({ academia_id: snap.id, deporte_id: snap.deporte_id, academia_nombre: snap.nombre ?? null });
      } else {
        const acad = Number(decoded?.academia_id ?? decoded?.academy_id ?? 0) || null;
        const dep = Number(decoded?.deporte_id ?? decoded?.sport_id ?? 0) || null;
        setScope({ academia_id: acad, deporte_id: dep, academia_nombre: null });
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname]);

  /* ───────────────── Live update (super-dashboard selector) ───────────────── */
  useEffect(() => {
    const onChanged = () => {
      // solo aplica a super-tree
      if (!isSuperTreePath(location.pathname)) return;
      const snap = readSelectedAcademia();
      if (snap?.id) {
        setScope({ academia_id: snap.id, deporte_id: snap.deporte_id, academia_nombre: snap.nombre ?? null });
      }
    };
    window.addEventListener("weli:selectedAcademiaChanged", onChanged);
    window.addEventListener("storage", onChanged); // backup: cambios cross-tab
    return () => {
      window.removeEventListener("weli:selectedAcademiaChanged", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [location.pathname]);

  /* ───────────────── Helpers fetch ───────────────── */
  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    return [];
  };

  const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

  const tryGetList = async (paths, signal) => {
    const list = Array.isArray(paths) ? paths : [paths];

    const variants = [];
    for (const p0 of list) {
      const p = String(p0 || "");
      const base = p.startsWith("/") ? p : `/${p}`;
      variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
    }
    const uniq = [...new Set(variants)];

    for (const url of uniq) {
      try {
        const r = await api.get(url, { signal });
        return normalizeListResponse(r);
      } catch (e) {
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
        continue;
      }
    }
    return [];
  };

  /* ───────────────── Carga de datos (scope-aware) ───────────────── */
  useEffect(() => {
    if (rol == null) return;

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const acadId = scope.academia_id;
        const depId = scope.deporte_id;

        // ✅ Jugadores (preferimos backend filtrado por scope, si existe)
        const jugadoresPaths = [];

        // intentos "nuevos" con query params
        if (acadId && depId) {
          if (rol === 2) {
            jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}&deporte_id=${depId}`);
            jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}`);
          } else {
            jugadoresPaths.push(`/jugadores?academia_id=${acadId}&deporte_id=${depId}`);
            jugadoresPaths.push(`/jugadores?academia_id=${acadId}`);
          }
        } else if (acadId) {
          if (rol === 2) jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}`);
          else jugadoresPaths.push(`/jugadores?academia_id=${acadId}`);
        }

        // fallbacks legacy
        if (rol === 2) jugadoresPaths.push("/jugadores/staff");
        jugadoresPaths.push("/jugadores");

        const [jugadores, categorias] = await Promise.all([
          tryGetList(jugadoresPaths, abort.signal),
          tryGetList(["/categorias"], abort.signal),
        ]);

        if (abort.signal.aborted) return;

        const jugadoresArr = Array.isArray(jugadores) ? jugadores : [];
        setJugadoresRaw(jugadoresArr);
        setCategoriasRaw(Array.isArray(categorias) ? categorias : []);

        // ✅ si no venía deporte/academia en token (admin/staff), inferimos desde jugadores
        if ((!scope.academia_id || !scope.deporte_id) && jugadoresArr.length) {
          const j0 = jugadoresArr.find((x) => x && (x.academia_id || x.deporte_id));
          const a0 = Number(j0?.academia_id ?? 0) || null;
          const d0 = Number(j0?.deporte_id ?? 0) || null;

          if (a0 || d0) {
            setScope((prev) => ({
              ...prev,
              academia_id: prev.academia_id ?? a0,
              deporte_id: prev.deporte_id ?? d0,
            }));
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        const st = getErrStatus(err);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError("❌ Error al cargar los jugadores/categorías");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, scope.academia_id, scope.deporte_id, navigate, location.pathname]);

  /* ───────────────── Map id→nombre de categoría ───────────────── */
  const categoriaMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((c) => {
      const id = c?.id ?? c?.categoria_id;
      const nombre = c?.nombre ?? c?.descripcion;
      if (id != null && nombre) map.set(Number(id), String(nombre));
    });
    return map;
  }, [categoriasRaw]);

  // Orden de categorías según el backend
  const categoriaOrder = useMemo(() => {
    const order = new Map();
    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((c, i) => {
      const nombre = (c?.nombre ?? c?.descripcion ?? "").toString();
      if (nombre) order.set(nombre, i);
    });
    return order;
  }, [categoriasRaw]);

  // Resolución de categoría
  const toCategoria = useCallback(
    (j) => {
      if (j?.categoria?.nombre) return String(j.categoria.nombre);
      if (j?.categoria_nombre) return String(j.categoria_nombre);
      const cid = j?.categoria_id ?? j?.categoria?.id ?? j?.categoriaId;
      const nombre = cid != null ? categoriaMap.get(Number(cid)) : undefined;
      return nombre || "Sin categoría";
    },
    [categoriaMap]
  );

  /* ───────────────── Normalizador de jugadores (scope filter safe) ───────────────── */
  const jugadores = useMemo(() => {
    const toNombre = (j) =>
      j?.nombre_jugador ||
      j?.nombre_completo ||
      j?.nombre ||
      [j?.nombres, j?.apellidos].filter(Boolean).join(" ") ||
      "—";

    const base = Array.isArray(jugadoresRaw) ? jugadoresRaw : [];

    // ✅ Filtro frontend por scope (por si backend no lo hace)
    const a = scope.academia_id;
    const d = scope.deporte_id;

    const scoped = (!a && !d)
      ? base
      : base.filter((j) => {
        const aj = Number(j?.academia_id ?? 0);
        const dj = Number(j?.deporte_id ?? 0);
        if (a && aj !== a) return false;
        if (d && dj !== d) return false;
        return true;
      });

    return scoped.map((j, idx) => {
      const jugador_id = Number(j?.id ?? j?.jugador_id ?? 0) || null;

      const rutBase =
        j?.rut_jugador ??
        j?.rut ??
        j?.rutJugador ??
        j?.rut_base ??
        (jugador_id ? String(jugador_id) : `tmp-${idx}`);

      const rutStr = String(rutBase);

      return {
        jugador_id,                    // ✅ clave real para stats acumuladas
        rut: rutStr,                   // compatibilidad
        rutConDV: formatRutWithDV(rutStr),
        nombre: toNombre(j),
        categoriaNombre: toCategoria(j),
      };
    });
  }, [jugadoresRaw, scope.academia_id, scope.deporte_id, toCategoria]);

  /* ───────────────── Agrupar por categoría ───────────────── */
  const grupos = useMemo(() => {
    const map = new Map();
    for (const j of jugadores) {
      const cat = j.categoriaNombre || "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(j);
    }

    const entries = [...map.entries()];
    entries.sort((a, b) => {
      const [na] = a;
      const [nb] = b;
      if (na === "Sin categoría" && nb !== "Sin categoría") return 1;
      if (nb === "Sin categoría" && na !== "Sin categoría") return -1;
      const ia = categoriaOrder.has(na) ? categoriaOrder.get(na) : Number.MAX_SAFE_INTEGER;
      const ib = categoriaOrder.has(nb) ? categoriaOrder.get(nb) : Number.MAX_SAFE_INTEGER;
      return ia - ib || na.localeCompare(nb, "es");
    });

    return entries.map(([cat, list]) => ({
      categoria: cat,
      items: [...list].sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
    }));
  }, [jugadores, categoriaOrder]);

  /* ───────────────── Estilos ───────────────── */
  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjetaClase = darkMode
    ? "bg-[#1f2937] shadow-lg rounded-lg p-4 border border-gray-700"
    : "bg-white shadow-md rounded-lg p-4 border border-gray-200";
  const tablaCabecera = darkMode ? "bg-[#111827] text-white" : "bg-gray-100 text-[#1d0b0b]";
  const filaHover = darkMode ? "hover:bg-[#111827]" : "hover:bg-gray-50";

  if (isLoading) return <IsLoading />;

  if (error) {
    return (
      <div className={`${fondoClase} min-h-screen flex justify-center items-center`}>
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    );
  }

  const scopeLabelParts = [];
  if (scope.academia_id) scopeLabelParts.push(`Academia #${scope.academia_id}`);
  if (scope.deporte_id) scopeLabelParts.push(`Deporte #${scope.deporte_id}`);
  const scopeLabel = scopeLabelParts.join(" · ");

  return (
    <div className={`${fondoClase} px-2 sm:px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-2 text-center">Registrar Estadísticas de Jugadores</h2>
      {!!scopeLabel && <p className="text-center mb-6 text-sm opacity-80">{scopeLabel}</p>}

      {grupos.length === 0 ? (
        <div className={`${tarjetaClase} text-center text-gray-400`}>
          No hay jugadores registrados para este contexto.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map(({ categoria, items }) => (
            <section key={categoria} className={`${tarjetaClase}`}>
              <header className="mb-4 flex items-baseline justify-between">
                <h3 className="text-lg font-bold">{categoria}</h3>
                <span className="text-xs opacity-70">
                  {items.length} jugador{items.length !== 1 ? "es" : ""}
                </span>
              </header>

              <div className="w-full overflow-x-auto">
                <table className="w-full text-xs sm:text-sm table-fixed sm:table-auto">
                  <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                    <tr>
                      <th className="p-2 border text-center w-28">RUT</th>
                      <th className="p-2 border text-center">Nombre</th>
                      <th className="p-2 border text-center w-20">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((j) => {
                      const rutSafe = encodeURIComponent(String(j.rut ?? ""));
                      const isSuperTree = String(location.pathname || "").startsWith("/super-dashboard/admin/dashboard");
                      const base = isSuperTree ? "/super-dashboard/admin/dashboard" : "/admin";

                      // ✅ RUTA NUEVA (larga) — consistente en ambos árboles
                      const to = `${base}/registrar-estadisticas/detalle-estadistica/${rutSafe}`;

                      // ✅ “from” correcto según árbol
                      const from = `${base}/registrar-estadisticas`;

                      return (
                        <tr key={String(j.jugador_id ?? j.rut)} className={`${filaHover}`}>
                          <td className="p-2 border text-center break-all">{j.rutConDV}</td>
                          <td className="p-2 border text-center break-words">{j.nombre}</td>

                          <td className="p-2 border text-center">
                            <button
                              onClick={() =>
                                navigate(to, {
                                  state: {
                                    from,
                                    jugador_id: j.jugador_id ?? null,
                                    // si no tienes scope acá, no pasa nada:
                                    scope: typeof scope !== "undefined" ? { ...scope } : undefined,
                                    breadcrumb: [
                                      { label: "Registrar Estadísticas", to: from },
                                      // el detalle añadirá "Detalle Estadística"
                                    ],
                                  },
                                })
                              }
                              className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                              aria-label={`Editar estadísticas de ${j.nombre}`}
                              title={`Editar estadísticas de ${j.nombre}`}
                              disabled={!j.jugador_id && !j.rut} // blindaje real: si no hay id ni rut, no navegues
                            >
                              <Pencil size={16} />
                            </button>

                            {(!j.jugador_id && !j.rut) && (
                              <div className="text-[10px] mt-1 opacity-70">sin jugador_id ni rut</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>


                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
