// src/pages/admin/crearConvocatoria.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =======================
   🎨 Conjunto X (WELI cobre)
======================= */
const PALETTE = {
  fucsia: "#aa5013", // cobre (acento principal)
  marron: "#6d5829", // base oscura cálida
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};
const ACCENT = PALETTE.fucsia;

/* =======================================================
   Helpers
======================================================= */
const toArray = (resp) => {
  const d = resp?.data ?? resp ?? [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (d?.ok && Array.isArray(d.items)) return d.items;
  if (d?.ok && Array.isArray(d.data)) return d.data;
  return [];
};

const jugadorKey = (j, idx) =>
  String(j?.rut_jugador ?? j?.rut ?? j?.rutJugador ?? j?.id ?? `tmp-${idx}`);

const dateOnly = (d) => {
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * ✅ Lee academia seleccionada robusta:
 * - "12"
 * - JSON {"id":12} / {"academia_id":12}
 */
const getAcademiaIdFromStorage = () => {
  const key = ACADEMIA_STORAGE_KEY || "weli_selected_academia";
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

/**
 * ✅ Guard de seguridad (roles + scope)
 * - Admin/Staff (1/2): requiere academia scope
 * - Superadmin (3): requiere target seleccionado
 */
const ensureScopeOrRedirect = (navigate) => {
  const token = getToken?.() || "";
  if (!token) {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }

  try {
    const decoded = jwtDecode(token);
    if (isExpired(decoded)) throw new Error("expired");

    const rol = extractRol(decoded);
    if (![1, 2, 3].includes(rol)) throw new Error("no-role");

    const academiaId = getAcademiaIdFromStorage();

    if (rol === 3) {
      if (academiaId <= 0) {
        navigate("/super-dashboard", { replace: true });
        return { ok: false, rol };
      }
      return { ok: true, rol };
    }

    // rol 1/2: scope obligatorio
    if (academiaId <= 0) {
      clearToken?.();
      navigate("/login", { replace: true });
      return { ok: false, rol };
    }

    return { ok: true, rol };
  } catch {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }
};

const getList = async (basePath, signal) => {
  const urls = basePath.endsWith("/") ? [basePath, basePath.slice(0, -1)] : [basePath, `${basePath}/`];

  for (const url of urls) {
    try {
      const r = await api.get(url, { signal, meta: { isPublic: false } });
      return toArray(r);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return [];
      const st = e?.response?.status ?? e?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

const postWithFallback = async (path, body) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.post(url, body, { meta: { isPublic: false } });
    } catch (e) {
      lastErr = e;
      const st = e?.response?.status ?? e?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("POST failed");
};

/* =======================================================
   Componente principal
======================================================= */
export default function CrearConvocatorias() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const [jugadoresRaw, setJugadoresRaw] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [convocatorias, setConvocatorias] = useState({});
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [convocatoriaInfo, setConvocatoriaInfo] = useState(null);
  const [rolActual, setRolActual] = useState(0);

  useMobileAutoScrollTop();

  /* ==================== Auth (normado) ==================== */
  useEffect(() => {
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) return;
    setRolActual(g.rol);
  }, [navigate]);

  /* ==================== Load (tenantizado) ==================== */
  useEffect(() => {
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) {
      setIsLoading(false);
      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const [js, es, cs] = await Promise.all([
          getList("/jugadores", abort.signal),
          getList("/eventos", abort.signal),
          getList("/categorias", abort.signal),
        ]);

        const init = {};
        js.forEach((j, idx) => {
          init[jugadorKey(j, idx)] = {
            fecha_partido: "",
            evento_id: "",
            asistio: false,
            titular: false,
            observaciones: "",
          };
        });

        setJugadoresRaw(js);
        setEventos(es);
        setCategorias(cs);
        setConvocatorias(init);
      } catch (e) {
        const st = e?.response?.status ?? e?.status;
        if (st === 401) {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }
        if (st === 403) {
          // ✅ 403 NO siempre es logout; pero aquí es módulo admin => mostramos y quedamos
          setError("No tienes permisos para acceder a Convocatorias.");
          return;
        }
        if (!abort.signal.aborted) setError("❌ Error al cargar datos");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual]);

  /* ==================== Mappers ==================== */
  const catMap = useMemo(() => new Map(categorias.map((c) => [Number(c.id), c.nombre])), [categorias]);

  const jugadores = useMemo(() => {
    return jugadoresRaw.map((j, idx) => {
      const key = jugadorKey(j, idx);
      const categoriaNombre =
        j?.categoria?.nombre || catMap.get(Number(j?.categoria_id)) || "Sin categoría";

      const nombre =
        j?.nombre_jugador ??
        j?.nombre_completo ??
        (j?.nombres && j?.apellidos ? `${j.nombres} ${j.apellidos}` : j?.nombre) ??
        "—";

      return {
        _key: key,
        rut_jugador: Number(j?.rut_jugador ?? j?.rut ?? j?.id ?? 0),
        nombre_jugador: nombre,
        categoriaNombre,
      };
    });
  }, [jugadoresRaw, catMap]);

  /* ==================== Eventos futuros ==================== */
  const today = useMemo(() => dateOnly(new Date()), []);

  const eventosFuturos = useMemo(() => {
    return eventos.filter((e) => {
      const d = dateOnly(e?.fecha_inicio ?? e?.fecha);
      return d && today && d >= today;
    });
  }, [eventos, today]);

  const fechasDisponibles = useMemo(
    () =>
      Array.from(new Set(eventosFuturos.map((e) => String(e?.fecha_inicio ?? e?.fecha).slice(0, 10)))).sort(),
    [eventosFuturos]
  );

  /* ==================== Handlers ==================== */
  const handleFechaChange = useCallback(
    (key, fecha) => {
      const ev = eventosFuturos.find((e) => String(e?.fecha_inicio ?? e?.fecha).slice(0, 10) === fecha);

      setConvocatorias((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          fecha_partido: fecha,
          evento_id: ev ? String(ev.id) : prev[key]?.evento_id,
        },
      }));
    },
    [eventosFuturos]
  );

  const handleEventoChange = useCallback(
    (key, eventoId) => {
      const ev = eventosFuturos.find((e) => Number(e.id) === Number(eventoId));

      setConvocatorias((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          evento_id: eventoId,
          fecha_partido: ev ? String(ev.fecha_inicio ?? ev.fecha).slice(0, 10) : prev[key]?.fecha_partido,
        },
      }));
    },
    [eventosFuturos]
  );

  const handleAsistencia = useCallback((key, checked) => {
    setConvocatorias((prev) => ({
      ...prev,
      [key]: { ...prev[key], asistio: checked, titular: checked },
    }));
  }, []);

  const handleObservaciones = useCallback((key, text) => {
    setConvocatorias((prev) => ({
      ...prev,
      [key]: { ...prev[key], observaciones: text },
    }));
  }, []);

  /* ==================== Guardar convocatorias ==================== */
  const guardarConvocatorias = useCallback(async () => {
    setError("");
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) return;

    try {
      const datosEnviar = jugadores
        .map((j) => {
          const d = convocatorias[j._key];
          if (!d?.fecha_partido || !d?.evento_id) return null;

          return {
            jugador_rut: j.rut_jugador,
            fecha_partido: d.fecha_partido,
            evento_id: Number(d.evento_id),
            asistio: !!d.asistio,
            titular: !!d.titular,
            observaciones: d.observaciones || null,
          };
        })
        .filter(Boolean);

      if (!datosEnviar.length) {
        setError("⚠️ Debe seleccionar al menos un evento.");
        return;
      }
      if (!datosEnviar.some((d) => d.asistio)) {
        setError("⚠️ Marque asistencia de al menos 1 jugador.");
        return;
      }

      const resp = await postWithFallback("/convocatorias", datosEnviar);

      const eventoIdBackend = resp?.data?.evento_id ?? datosEnviar[0].evento_id;
      const convIdBackend = resp?.data?.convocatoria_id;

      if (!convIdBackend) throw new Error("Backend no retornó convocatoria_id");

      setConvocatoriaInfo({
        evento_id: Number(eventoIdBackend),
        convocatoria_id: Number(convIdBackend),
      });

      setMostrarModal(true);
    } catch (e) {
      const st = e?.response?.status ?? e?.status;
      if (st === 401) {
        clearToken?.();
        navigate("/login", { replace: true });
        return;
      }
      if (st === 403) {
        setError("No tienes permisos para guardar convocatorias.");
        return;
      }
      console.error(e);
      setError("❌ Error al guardar convocatorias");
    }
  }, [jugadores, convocatorias, navigate]);

  /* ==================== Generar PDF + Histórico ==================== */
  const generarListado = useCallback(async () => {
    const g = ensureScopeOrRedirect(navigate);
    if (!g.ok) return;

    try {
      if (!convocatoriaInfo) {
        alert("❌ No hay información de convocatoria base. Guarde primero.");
        return;
      }

      const convocados = jugadores
        .map((j) => {
          const d = convocatorias[j._key];
          if (!(d?.asistio && d?.evento_id)) return null;

          return {
            ...d,
            nombre: j.nombre_jugador,
            categoria: j.categoriaNombre,
            jugador_rut: j.rut_jugador,
          };
        })
        .filter(Boolean);

      if (!convocados.length) {
        alert("⚠️ No hay jugadores asistentes.");
        return;
      }

      const doc = new jsPDF({
        unit: "mm",
        format: [330, 216],
        orientation: "landscape",
        compress: true,
      });

      autoTable(doc, {
        head: [["Jugador", "Categoría", "Rol", "Observaciones"]],
        body: convocados.map((c) => [c.nombre, c.categoria, "Titular", c.observaciones || ""]),
      });

      const base64 = doc.output("datauristring").split(",")[1];

      await postWithFallback("/convocatorias-historico", {
        evento_id: convocatoriaInfo.evento_id,
        convocatoria_id: convocatoriaInfo.convocatoria_id,
        fecha_generacion: new Date().toISOString(),
        listado_base64: base64,
      });

      // Reset total
      const init = {};
      jugadores.forEach((j, idx) => {
        init[jugadorKey(j, idx)] = {
          fecha_partido: "",
          evento_id: "",
          asistio: false,
          titular: false,
          observaciones: "",
        };
      });

      setConvocatorias(init);
      setConvocatoriaInfo(null);
      setMostrarModal(false);

      alert("Listado generado y guardado en el histórico.");
    } catch (e) {
      const st = e?.response?.status ?? e?.status;
      if (st === 401) {
        clearToken?.();
        navigate("/login", { replace: true });
        return;
      }
      if (st === 403) {
        alert("No tienes permisos para generar/guardar el histórico.");
        return;
      }
      console.error(e);
      alert("❌ Error al generar el PDF");
    }
  }, [convocatoriaInfo, jugadores, convocatorias, navigate]);

  /* ==================== UI (ESTILO SuperDashboard) ==================== */
  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const fondoClase = `${shell} min-h-screen px-2 sm:px-4 pt-4 pb-16 font-sans overflow-x-hidden`;

  const tarjetaClase =
    "rounded-2xl p-4 border shadow-lg " +
    (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

  const tablaCabecera =
    "text-white " + (darkMode ? "bg-white/10" : "bg-ra-marron/80");

  const filaHover = darkMode ? "hover:bg-white/5" : "hover:bg-white/40";

  const inputClase =
    "w-full rounded-xl px-3 py-2 border outline-none transition " +
    (darkMode
      ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
      : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta");

  const btnPrimary =
    "text-white px-8 py-2 rounded-xl shadow font-extrabold hover:opacity-90 active:scale-[0.99] transition";

  const modalCard =
    "p-6 rounded-2xl shadow-2xl text-center border w-full max-w-md " +
    (darkMode ? "bg-white/10 border-white/15 text-white" : "bg-white/60 border-ra-marron/15 text-ra-marron");

  const msgError = darkMode ? "text-red-200" : "text-red-700";

  /* ==================== Agrupar por categorías ==================== */
  const grupos = useMemo(() => {
    const m = new Map();
    jugadores.forEach((j) => {
      if (!m.has(j.categoriaNombre)) m.set(j.categoriaNombre, []);
      m.get(j.categoriaNombre).push(j);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [jugadores]);

  /* ==================== Render ==================== */
  if (isLoading) return <IsLoading />;

  return (
    <div className={fondoClase}>
      <h2 className="text-2xl font-extrabold mb-6 text-center tracking-wide">
        Registro de Convocatorias
      </h2>

      {error && <p className={`${msgError} mb-4 font-bold text-center`}>{error}</p>}

      <div className="space-y-6">
        {grupos.map(([categoria, lista]) => (
          <div key={categoria} className={tarjetaClase}>
            <h3 className="text-xl font-extrabold mb-3 text-center">
              Categoría {categoria}
            </h3>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs sm:text-sm table-fixed">
                <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                  <tr>
                    <th className="p-2 border border-white/10 text-center w-40">Nombre Jugador</th>
                    <th className="p-2 border border-white/10 text-center w-36">Categoría</th>
                    <th className="p-2 border border-white/10 text-center w-36">Fecha Partido</th>
                    <th className="p-2 border border-white/10 text-center w-44">Torneo</th>
                    <th className="p-2 border border-white/10 text-center w-20">Asistencia</th>
                    <th className="p-2 border border-white/10 text-center w-64">Observaciones</th>
                  </tr>
                </thead>

                <tbody>
                  {lista.map((j) => {
                    const row = convocatorias[j._key] || {
                      fecha_partido: "",
                      evento_id: "",
                      asistio: false,
                      titular: false,
                      observaciones: "",
                    };

                    return (
                      <tr key={j._key} className={filaHover}>
                        <td className="p-2 border border-white/10 text-center">{j.nombre_jugador}</td>
                        <td className="p-2 border border-white/10 text-center">{j.categoriaNombre}</td>

                        <td className="p-2 border border-white/10 text-center">
                          <select
                            className={inputClase}
                            value={row.fecha_partido}
                            onChange={(e) => handleFechaChange(j._key, e.target.value)}
                          >
                            <option value="">Seleccionar fecha</option>
                            {fechasDisponibles.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <select
                            className={inputClase}
                            value={row.evento_id}
                            onChange={(e) => handleEventoChange(j._key, e.target.value)}
                          >
                            <option value="">Seleccionar torneo</option>
                            {eventosFuturos.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {ev.titulo ?? ev.nombre ?? `Evento #${ev.id}`}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.asistio}
                            onChange={(e) => handleAsistencia(j._key, e.target.checked)}
                          />
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="text"
                            className={inputClase}
                            value={row.observaciones}
                            placeholder="Observaciones"
                            onChange={(e) => handleObservaciones(j._key, e.target.value)}
                          />
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

      <div className="text-center mt-6">
        <button onClick={guardarConvocatorias} className={btnPrimary} style={{ backgroundColor: ACCENT }}>
          Guardar
        </button>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 flex justify-center items-center bg-black/60 z-50 px-3">
          <div className={modalCard}>
            <h2 className="text-xl font-extrabold mb-4">✅ Convocatoria creada</h2>

            <button
              className="text-white px-6 py-2 rounded-xl font-extrabold hover:opacity-90 active:scale-[0.99] transition"
              style={{ backgroundColor: ACCENT }}
              onClick={generarListado}
            >
              Aceptar
            </button>

            <button
              className="mt-3 block mx-auto hover:opacity-90 underline"
              onClick={() => setMostrarModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
