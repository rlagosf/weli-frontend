// src/pages/admin/listarJugadores.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

export default function ListarJugadores() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [jugadores, setJugadores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rol, setRol] = useState(null);

  // 🧭 Breadcrumb base
  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ label: "Listar Jugadores", to: "/admin/listar-jugadores" }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  // 🔐 Validación de sesión/rol (ahora incluye rol 3)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const userRol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ ahora permitimos superadmin (3)
      if (![1, 2, 3].includes(userRol)) return navigate("/admin", { replace: true });

      setRol(userRol);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // ───────────────── Helpers robustos ─────────────────
  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

  const tryGetList = async (paths) => {
    const list = Array.isArray(paths) ? paths : [paths];

    // variantes con / y sin / final
    const variants = [];
    for (const p of list) {
      const base = p.startsWith("/") ? p : `/${p}`;
      variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
    }
    const uniq = [...new Set(variants)];

    for (const url of uniq) {
      try {
        const r = await api.get(url);
        return normalizeListResponse(r);
      } catch (e) {
        // con tu api.js el error "normalizado" NO trae response siempre:
        const st = e?.status ?? e?.response?.status ?? 0;
        if (st === 401 || st === 403) throw e;
        // si es 404, seguimos probando
        continue;
      }
    }
    return [];
  };

  // 📥 Carga de jugadores + catálogos mínimos
  useEffect(() => {
    if (!rol) return;
    let alive = true;

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        /**
         * ✅ RUTAS: evita “inventar” demasiadas.
         * Suposición razonable en WELI:
         * - GET /jugadores soporta include_inactivos=1
         * - staff puede tener ruta especial, pero si no existe, no forzamos
         */
        const jugadoresPaths =
          rol === 2
            ? [
                "/jugadores?include_inactivos=1",
                "/jugadores", // fallback
              ]
            : [
                // Admin (1) y Superadmin (3)
                "/jugadores?include_inactivos=1",
                "/jugadores",
              ];

        const rawJugadores = await tryGetList(jugadoresPaths);

        /**
         * ✅ Catálogos: nombres coherentes con tus routers.
         * - posiciones: /posiciones
         * - categorias: /categorias
         * - estado: tu proyecto a veces lo llama /estado o /estados (fallback)
         */
        const [posList, catList, estList] = await Promise.all([
          tryGetList(["/posiciones"]),
          tryGetList(["/categorias"]),
          tryGetList(["/estado", "/estados"]),
        ]);

        if (!alive) return;

        const posMap = new Map(
          (posList ?? []).map((p) => [
            Number(p.id ?? p.posicion_id),
            p.nombre ?? p.descripcion ?? "",
          ])
        );
        const catMap = new Map(
          (catList ?? []).map((c) => [
            Number(c.id ?? c.categoria_id),
            c.nombre ?? c.descripcion ?? "",
          ])
        );
        const estMap = new Map(
          (estList ?? []).map((e) => [
            Number(e.id ?? e.estado_id),
            e.nombre ?? e.descripcion ?? "",
          ])
        );

        const safeJugadores = Array.isArray(rawJugadores) ? rawJugadores : [];

        const data = safeJugadores.map((j) => {
          const catObj = j.categoria
            ? j.categoria
            : catMap.has(Number(j.categoria_id))
            ? { nombre: catMap.get(Number(j.categoria_id)) }
            : null;

          return {
            ...j,
            posicion:
              j.posicion ??
              (posMap.has(Number(j.posicion_id))
                ? { nombre: posMap.get(Number(j.posicion_id)) }
                : null),
            categoria: catObj,
            estado:
              j.estado ??
              (estMap.has(Number(j.estado_id))
                ? { nombre: estMap.get(Number(j.estado_id)) }
                : null),
          };
        });

        setJugadores(data);
        setIsLoading(false);

        if (!data.length) setError("⚠️ No se encontraron jugadores.");
      } catch (err) {
        const status = err?.status ?? err?.response?.status ?? 0;
        const msg = String(err?.message || "").toLowerCase();

        if (status === 401 || status === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        // Caso típico rol 3 sin academia seleccionada (depende de tu backend)
        if (rol === 3 && (status === 400 || status === 409 || msg.includes("academia"))) {
          setError("⚠️ Superadmin: selecciona una academia para listar jugadores.");
          setIsLoading(false);
          return;
        }

        if (!alive) return;
        setError("❌ No se pudo cargar la lista de jugadores");
        setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rol, navigate]);

  // 🎨 clases
  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tablaCabecera = darkMode ? "bg-[#1f2937] text-white" : "bg-gray-100 text-[#1d0b0b]";
  const filaHover = darkMode ? "hover:bg-[#1f2937]" : "hover:bg-gray-100";

  const tarjetaClase = darkMode
    ? "bg-[#1f2937] shadow-lg rounded-lg p-4 border border-gray-700 hover:border-[#24C6FF] transition-colors"
    : "bg-white shadow-md rounded-lg p-4 border border-gray-200 hover:border-[#24C6FF] transition-colors";

  const handleClick = (rut, stateBreadcrumb) =>
    navigate(`/admin/detalle-jugador/${encodeURIComponent(rut)}`, {
      state: {
        from: "/admin/listar-jugadores",
        breadcrumb: stateBreadcrumb ?? [{ label: "Listar Jugadores", to: "/admin/listar-jugadores" }],
      },
    });

  // 🧩 Agrupar por categoría
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
          <div className={`${tarjetaClase}`}>
            <p className="text-yellow-400 text-center">{error}</p>
          </div>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className={`${tarjetaClase}`}>
          <p className="text-center text-gray-400 py-4">No hay jugadores registrados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([categoriaNombre, lista]) => (
            <div key={categoriaNombre} className={`${tarjetaClase}`}>
              <h3 className="text-xl font-semibold mb-3 text-center">Categoría {categoriaNombre}</h3>

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
                      const rutCrudo = jugador.rut_jugador ?? jugador.id ?? null;
                      const rutFormateado = rutCrudo ? formatRutWithDV(rutCrudo) : "-";

                      return (
                        <tr
                          key={jugador.rut_jugador ?? jugador.id}
                          className={`${filaHover} cursor-pointer`}
                          onClick={() => handleClick(jugador.rut_jugador, location.state?.breadcrumb)}
                        >
                          <td className="p-2 border text-center">{jugador.nombre_jugador}</td>
                          <td className="p-2 border text-center">{rutFormateado || rutCrudo || "-"}</td>
                          <td className="p-2 border text-center">{jugador.edad ?? "-"}</td>
                          <td className="p-2 border text-center">{jugador.telefono ?? "-"}</td>
                          <td className="p-2 border text-center break-all">{jugador.email ?? "-"}</td>
                          <td className="p-2 border text-center">
                            {jugador.posicion?.nombre ?? jugador.posicion_id ?? "-"}
                          </td>
                          <td className="p-2 border text-center">
                            {jugador.estado?.nombre ?? jugador.estado_id ?? "-"}
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
