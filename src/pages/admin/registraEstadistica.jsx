// src/pages/admin/ListarEstadisticas.jsx
import React, { useEffect, useMemo, useState } from "react";
import api, { getToken, clearToken } from "../../services/api";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { Pencil } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut"; // ✅ solo frontend

export default function ListarEstadisticas() {
  const { darkMode } = useTheme();
  const [jugadoresRaw, setJugadoresRaw] = useState([]);
  const [categoriasRaw, setCategoriasRaw] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rol, setRol] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 🧭 Inyecta breadcrumb base si no viene en state
  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: "Registrar Estadísticas", to: "/admin/registrar-estadisticas" },
          ],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  // ───────────────── Auth ─────────────────
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const parsed = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;
      if (![1, 2].includes(parsed)) {
        navigate("/admin", { replace: true });
        return;
      }
      setRol(parsed);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // ───────────────── Helpers de fetch ─────────────────
  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.items)) return d.items;
    return [];
  };

  const tryGetList = async (paths, signal) => {
    const variants = [];
    for (const p of paths) {
      if (p.endsWith("/")) variants.push(p, p.slice(0, -1));
      else variants.push(p, `${p}/`);
    }
    const uniq = [...new Set(variants)];
    for (const url of uniq) {
      try {
        const r = await api.get(url, { signal });
        return normalizeListResponse(r);
      } catch (e) {
        const st = e?.status ?? e?.response?.status; // ✅ compatible con api.js normalizado
        if (st === 401 || st === 403) throw e;
        continue;
      }
    }
    return [];
  };

  // ───────────────── Carga de datos ─────────────────
  useEffect(() => {
    if (!rol) return;
    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");
      try {
        let jugadores = [];
        try {
          const endpoints = rol === 2 ? ["/jugadores/staff"] : ["/jugadores"];
          jugadores = await tryGetList(endpoints, abort.signal);

          if (rol === 2 && (!jugadores || jugadores.length === 0)) {
            const alt = await tryGetList(["/jugadores"], abort.signal);
            if (alt && alt.length) jugadores = alt;
          }
        } catch (e) {
          const st = e?.status ?? e?.response?.status; // ✅
          if (st === 401 || st === 403) throw e;
          jugadores = await tryGetList(["/jugadores"], abort.signal);
        }

        const categorias = await tryGetList(["/categorias"], abort.signal);

        if (abort.signal.aborted) return;
        setJugadoresRaw(Array.isArray(jugadores) ? jugadores : []);
        setCategoriasRaw(Array.isArray(categorias) ? categorias : []);
      } catch (err) {
        if (abort.signal.aborted) return;
        const st = err?.status ?? err?.response?.status; // ✅
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
  }, [rol, navigate]);

  // ───────────────── Map id→nombre de categoría ─────────────────
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
  const toCategoria = (j) => {
    if (j?.categoria?.nombre) return String(j.categoria.nombre);
    if (j?.categoria_nombre) return String(j.categoria_nombre);
    const cid = j?.categoria_id ?? j?.categoria?.id ?? j?.categoriaId;
    const nombre = cid != null ? categoriaMap.get(Number(cid)) : undefined;
    return nombre || "Sin categoría";
  };

  // Normalizador de jugadores (+ RUT con DV solo para mostrar)
  const jugadores = useMemo(() => {
    const toNombre = (j) =>
      j?.nombre_jugador ||
      j?.nombre_completo ||
      j?.nombre ||
      [j?.nombres, j?.apellidos].filter(Boolean).join(" ") ||
      "—";

    const base = Array.isArray(jugadoresRaw) ? jugadoresRaw : [];
    return base.map((j, idx) => {
      const rutBase =
        j?.rut_jugador ??
        j?.rut ??
        j?.rutJugador ??
        j?.id ??
        `tmp-${idx}`;

      const rutStr = String(rutBase);

      return {
        rut: rutStr,                        // 🔹 lo que sigue usando el backend
        rutConDV: formatRutWithDV(rutStr),  // 🔹 solo para mostrar
        nombre: toNombre(j),
        categoriaNombre: toCategoria(j),
      };
    });
  }, [jugadoresRaw, categoriaMap]);

  // ───────────────── Agrupar por categoría ─────────────────
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

  // ───────────────── Estilos ─────────────────
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

  return (
    <div className={`${fondoClase} px-2 sm:px-4 pt-4 pb-16 font-realacademy`}>
      {/* 🧭 El dashboard pinta el breadcrumb: Inicio / Registrar Estadísticas */}
      <h2 className="text-2xl font-bold mb-6 text-center">Registrar Estadísticas de Jugadores</h2>

      {grupos.length === 0 ? (
        <div className={`${tarjetaClase} text-center text-gray-400`}>
          No hay jugadores registrados.
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
                    {items.map((j) => (
                      <tr key={String(j.rut)} className={`${filaHover}`}>
                        {/* ✅ Mostramos RUT con dígito verificador */}
                        <td className="p-2 border text-center break-all">{j.rutConDV}</td>
                        <td className="p-2 border text-center break-words">{j.nombre}</td>
                        <td className="p-2 border text-center">
                          <button
                            onClick={() =>
                              navigate(`/admin/detalle-estadistica/${encodeURIComponent(j.rut)}`, {
                                state: {
                                  from: "/admin/registrar-estadisticas",
                                  breadcrumb: [
                                    { label: "Registrar Estadísticas", to: "/admin/registrar-estadisticas" },
                                    // El detalle añadirá "Detalle Estadística"
                                  ],
                                },
                              })
                            }
                            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            aria-label={`Editar estadísticas de ${j.nombre}`}
                            title={`Editar estadísticas de ${j.nombre}`}
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
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
