// src/pages/admin/detalleEstadistica.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { LoaderCircle } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut"; // ✅ solo para mostrar

export default function DetalleEstadistica() {
  const { darkMode } = useTheme();
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [rol, setRol] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [jugador, setJugador] = useState(null);
  const [jugadorId, setJugadorId] = useState(null);

  const [statsId, setStatsId] = useState(null); // ✅ stats_base.id
  const [formData, setFormData] = useState({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ✅ stats actuales unidos (base + sport)
  // null: no sabemos aún | {}: no hay/creamos cero | { ... } : datos existentes
  const [statsExistentes, setStatsExistentes] = useState(null);

  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjetaClase = darkMode ? "bg-[#1f2937] border border-gray-700" : "bg-white border border-gray-200";
  const cardClase = `${tarjetaClase} shadow-md rounded-xl p-4`;
  const contenedorClase = `${tarjetaClase} shadow-lg rounded-2xl p-4 md:p-6`;
  const inputClase = darkMode
    ? "bg-[#1f2937] text-white border border-gray-600 placeholder-gray-400"
    : "bg-white text-black border border-gray-300 placeholder-gray-500";

  // ✅ campos fútbol (si luego haces multi-deporte, esto se vuelve SPORT_META como en globales)
  const campos = useMemo(
    () => ({
      Ofensivas: [
        "goles",
        "asistencias",
        "tiros_libres",
        "penales",
        "tiros_arco",
        "tiros_fuera",
        "tiros_bloqueados",
        "regates_exitosos",
        "centros_acertados",
        "pases_clave",
      ],
      Defensivas: ["intercepciones", "despejes", "duelos_ganados", "entradas_exitosas", "bloqueos", "recuperaciones"],
      Técnicas: ["pases_completados", "pases_errados", "posesion_perdida", "offsides", "faltas_cometidas", "faltas_recibidas"],
      Físicas: ["distancia_recorrida_km", "sprints", "duelos_aereos_ganados", "minutos_jugados", "partidos_jugados"],
      Médicas: ["lesiones", "dias_baja"],
      Disciplina: ["tarjetas_amarillas", "tarjetas_rojas", "sanciones_federativas"],
    }),
    []
  );

  const opciones = Array.from({ length: 11 }, (_, i) => i);

  const allFields = useMemo(() => Object.values(campos).flat(), [campos]);

  const blankForm = useCallback(
    (sid) => {
      const base = { stats_id: sid ?? null };
      allFields.forEach((campo) => {
        base[campo] = campo === "distancia_recorrida_km" ? 0.0 : 0;
      });
      return base;
    },
    [allFields]
  );

  /* ============== Breadcrumb ============== */
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    const base = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: "Registrar Estadísticas", to: "/admin/registrar-estadisticas" }];

    const last = base[base.length - 1];
    const needsAppend = !last || last.label !== "Detalle Estadística";

    if (needsAppend) {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [...base, { label: "Detalle Estadística", to: currentPath }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  /* ===================== Helpers ===================== */
  const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

  const unwrapJugador = (resData) => {
    const root = resData?.data ?? resData;
    if (Array.isArray(root?.items) && root.items.length > 0) return root.items[0];
    if (root?.item) return root.item;
    if (root?.jugador) return root.jugador;
    return root;
  };

  const pretty = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  // ✅ RUT con DV solo para mostrar
  const rutConDV = useMemo(() => {
    if (!jugador) return formatRutWithDV(rut);
    return formatRutWithDV(jugador.rut_jugador ?? rut);
  }, [jugador, rut]);

  // ✅ unir base + sport en un solo objeto plano (lo que le gusta a tu UI)
  const flattenJoined = useCallback(
    (joined) => {
      const base = joined?.base || {};
      const sport = joined?.sport || {};
      const out = { ...base, ...sport };

      // normaliza llaves esperadas por el frontend
      // base trae id como stats_id si lo seleccionas así; acá lo ponemos consistente:
      if (out.id != null && out.stats_id == null) out.stats_id = out.id;

      // si por alguna razón viniera null
      allFields.forEach((k) => {
        if (out[k] == null) out[k] = k === "distancia_recorrida_km" ? 0.0 : 0;
      });

      return out;
    },
    [allFields]
  );

  const pickEditablePayload = useCallback(
    (obj) => {
      // ✅ solo campos editables (los del form). Evitamos mandar basura al backend.
      const out = {};
      allFields.forEach((k) => {
        const v = obj?.[k];
        if (v === undefined) return;
        out[k] =
          k === "distancia_recorrida_km"
            ? (Number.isFinite(Number.parseFloat(String(v))) ? Number.parseFloat(String(v)) : 0)
            : (Number.isFinite(Number.parseInt(String(v), 10)) ? Number.parseInt(String(v), 10) : 0);
      });
      return out;
    },
    [allFields]
  );

  /* ============================ Auth (WELI) ============================ */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const r = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ READ: 1/2/3
      if (![1, 2, 3].includes(r)) {
        navigate("/admin", { replace: true });
        return;
      }

      setRol(r);
      // ✅ WRITE: 1 y 3 (según tu router)
      setCanWrite([1, 3].includes(r));
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* ====================== Cargar jugador + stats (nuevo modelo) ====================== */
  useEffect(() => {
    if (rol == null) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setError("");

      try {
        // 1) Prioridad: jugador_id viene desde ListarEstadisticas (state)
        const stateJugadorId = Number(location.state?.jugador_id ?? 0) || null;
        let jid = stateJugadorId;

        // 2) Si no viene, resolvemos por rut (legacy)
        let jRaw = null;

        if (jid) {
          // si tenemos jugador_id, igual conviene traer jugador para nombre/rut real
          try {
            const resJ = await api.get(`/jugadores/${encodeURIComponent(String(jid))}`);
            jRaw = unwrapJugador(resJ.data);
          } catch {
            // fallback a rut
          }
        }

        if (!jRaw) {
          const jugadorRes = await api.get(`/jugadores/rut/${encodeURIComponent(rut)}`);
          jRaw = unwrapJugador(jugadorRes.data);
        }

        if (!alive) return;

        if (!jRaw) {
          setError("El jugador no existe.");
          setLoading(false);
          return;
        }

        const inferredJugadorId = Number(jRaw?.id ?? jRaw?.jugador_id ?? 0) || null;
        if (!jid && inferredJugadorId) jid = inferredJugadorId;

        if (!jid) {
          setError("No se pudo resolver jugador_id (falta id en respuesta del backend).");
          setLoading(false);
          return;
        }

        setJugador(jRaw);
        setJugadorId(jid);

        // 3) Traer stats unidas (base + sport) por jugador_id
        //    Esta ruta asegura stats_base y la fila sport existen.
        const joinedRes = await api.get(`/estadisticas/by-jugador/${encodeURIComponent(String(jid))}`);
        if (!alive) return;

        const joined = joinedRes?.data?.item ?? joinedRes?.data?.data?.item ?? null;
        if (!joined) {
          // raro, pero dejamos en blanco
          setStatsExistentes({});
          setStatsId(null);
          setFormData(blankForm(null));
          setLoading(false);
          return;
        }

        const flat = flattenJoined(joined);

        const sid = Number(flat?.stats_id ?? flat?.id ?? 0) || null;
        setStatsId(sid);

        // stats actuales (para acumular)
        setStatsExistentes(flat);

        // ✅ Mostrar valores actuales como base
        // y que el usuario edite "incrementos" o "valores".
        // Tu UX actual es "Acumular y Guardar": usaremos form como incrementos (0).
        // Si quieres modo "editar absoluto", cambiamos esto a flat.
        setFormData(blankForm(sid));
      } catch (err) {
        const st = getErrStatus(err);

        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 404) setError("El jugador o sus stats no existen.");
        else setError("Error al cargar los datos.");

        setTimeout(() => navigate("/admin/registrar-estadisticas", { replace: true }), 1200);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rol, rut, navigate, location.state, blankForm, flattenJoined, getErrStatus]);

  /* ============================ Handlers ============================ */
  const handleChange = (campo, value) => {
    setFormData((prev) => ({
      ...prev,
      [campo]:
        campo === "distancia_recorrida_km"
          ? (Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0)
          : (Number.isFinite(parseInt(value, 10)) ? parseInt(value, 10) : 0),
    }));
  };

  const handleResetLocal = () => {
    setFormData(blankForm(statsId));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!canWrite) {
      setError("No tienes permisos para guardar (solo roles 1 y 3).");
      return;
    }
    if (!jugadorId) {
      setError("Falta jugador_id.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // ✅ calculamos suma: existentes + incrementos (formData)
      const base = statsExistentes && typeof statsExistentes === "object" ? statsExistentes : {};
      const inc = formData && typeof formData === "object" ? formData : {};

      const sumado = {};
      allFields.forEach((campo) => {
        const antiguo = Number(base?.[campo] ?? 0);
        const nuevo = Number(inc?.[campo] ?? 0);

        sumado[campo] =
          campo === "distancia_recorrida_km"
            ? Number((antiguo + nuevo).toFixed(2))
            : (Number.isFinite(antiguo) ? antiguo : 0) + (Number.isFinite(nuevo) ? nuevo : 0);
      });

      const payload = pickEditablePayload(sumado);

      // Si ya tenemos statsId -> PUT /estadisticas/:id
      if (statsId) {
        await api.put(`/estadisticas/${encodeURIComponent(String(statsId))}`, payload);
      } else {
        // Si no hay statsId (caso raro), POST crea todo.
        // Requiere academia_id y deporte_id (los sacamos del jugador)
        const academia_id = Number(jugador?.academia_id ?? 0) || Number(location.state?.scope?.academia_id ?? 0) || null;
        const deporte_id = Number(jugador?.deporte_id ?? 0) || Number(location.state?.scope?.deporte_id ?? 0) || null;

        if (!academia_id || !deporte_id) {
          throw new Error("Falta academia_id/deporte_id para crear stats.");
        }

        await api.post("/estadisticas", {
          academia_id,
          deporte_id,
          jugador_id: jugadorId,
          ...payload,
        });
      }

      alert("✅ Estadísticas acumuladas y guardadas correctamente");

      navigate("/admin/registrar-estadisticas", { replace: true });
    } catch (err) {
      const st = getErrStatus(err);

      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
      } else {
        const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message;
        setError(detail || "❌ Error al guardar estadísticas");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ============================ Render ============================ */
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoaderCircle className="animate-spin w-12 h-12" />
      </div>
    );
  }

  return (
    <div className={`${fondoClase} px-4 pt-4 pb-16 font-weli`}>
      {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

      <h2 className="text-2xl font-bold mb-2 text-center">
        Modificar Estadísticas de {jugador?.nombre_jugador ?? jugador?.nombre ?? "Jugador"} (RUT: {rutConDV})
      </h2>

      {/* ✅ mostrar contexto actual */}
      <p className="text-center text-sm opacity-80 mb-6">
        {jugadorId ? `Jugador ID: ${jugadorId}` : ""}
        {statsId ? ` · Stats ID: ${statsId}` : " · Stats: (sin id aún)"}
        {!canWrite ? " · (Solo lectura)" : ""}
      </p>

      <div className={`${contenedorClase} max-w-6xl mx-auto`}>
        {/* ✅ Vista rápida de valores actuales */}
        {statsExistentes && typeof statsExistentes === "object" && Object.keys(statsExistentes).length > 0 && (
          <div className={`${cardClase} mb-4`}>
            <h4 className="font-bold mb-2 text-base">Valores actuales (acumulados)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
              {allFields.map((k) => (
                <div key={k} className="flex items-center justify-between gap-2 border border-gray-500/20 rounded px-2 py-1">
                  <span className="opacity-80">{pretty(k)}</span>
                  <span className="font-semibold">
                    {k === "distancia_recorrida_km"
                      ? Number(statsExistentes?.[k] ?? 0).toFixed(2)
                      : Number(statsExistentes?.[k] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] opacity-70">
              Lo que ingreses abajo se suma a estos valores (modo acumulativo).
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(campos).map(([categoria, listaCampos]) => (
            <section key={categoria} className={cardClase}>
              <h4 className="font-bold mb-3 text-base">{categoria}</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {listaCampos.map((campo) => (
                  <div key={campo} className="space-y-1">
                    <label className="block text-xs sm:text-sm font-medium">{pretty(campo)}</label>

                    {campo === "distancia_recorrida_km" ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData[campo] ?? 0}
                        onChange={(e) => handleChange(campo, e.target.value)}
                        className={`w-full p-2 rounded text-sm ${inputClase}`}
                        disabled={!canWrite}
                      />
                    ) : (
                      <select
                        value={formData[campo] ?? 0}
                        onChange={(e) => handleChange(campo, e.target.value)}
                        className={`w-full p-2 rounded text-sm ${inputClase}`}
                        disabled={!canWrite}
                      >
                        {opciones.map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleResetLocal}
            className="text-white font-bold py-2 px-6 rounded bg-gray-500 hover:bg-gray-600"
            disabled={!canWrite}
            title={!canWrite ? "Solo lectura" : "Limpiar"}
          >
            Limpiar a 0
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting || !canWrite}
            className={`text-white font-bold py-2 px-6 rounded ${
              submitting || !canWrite ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
            }`}
            title={!canWrite ? "Solo lectura (roles 1 y 3 pueden guardar)" : "Guardar"}
          >
            {submitting ? "Guardando..." : "Acumular y Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
