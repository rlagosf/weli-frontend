// src/pages/admin/detalleEstadistica.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { LoaderCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import api, { getToken, clearToken } from '../../services/api';
import { useMobileAutoScrollTop } from '../../hooks/useMobileScrollTop';
import { formatRutWithDV } from '../../services/rut'; // ✅ RUT con DV solo para mostrar

export default function DetalleEstadistica() {
  const { darkMode } = useTheme();
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [jugador, setJugador] = useState(null);
  const [estadisticaId, setEstadisticaId] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statsExistentes, setStatsExistentes] = useState(null); // null: desconocido, {}: no hay stats, {...}: hay stats

  const fondoClase = darkMode ? 'bg-[#111827] text-white' : 'bg-white text-[#1d0b0b]';
  const tarjetaClase = darkMode
    ? 'bg-[#1f2937] border border-gray-700'
    : 'bg-white border border-gray-200';
  const cardClase = `${tarjetaClase} shadow-md rounded-xl p-4`;
  const contenedorClase = `${tarjetaClase} shadow-lg rounded-2xl p-4 md:p-6`;
  const inputClase = darkMode
    ? 'bg-[#1f2937] text-white border border-gray-600 placeholder-gray-400'
    : 'bg-white text-black border border-gray-300 placeholder-gray-500';

  const campos = useMemo(
    () => ({
      Ofensivas: [
        'goles',
        'asistencias',
        'tiros_libres',
        'penales',
        'tiros_arco',
        'tiros_fuera',
        'tiros_bloqueados',
        'regates_exitosos',
        'centros_acertados',
        'pases_clave',
      ],
      Defensivas: [
        'intercepciones',
        'despejes',
        'duelos_ganados',
        'entradas_exitosas',
        'bloqueos',
        'recuperaciones',
      ],
      Técnicas: [
        'pases_completados',
        'pases_errados',
        'posesion_perdida',
        'offsides',
        'faltas_cometidas',
        'faltas_recibidas',
      ],
      Físicas: [
        'distancia_recorrida_km',
        'sprints',
        'duelos_aereos_ganados',
        'minutos_jugados',
        'partidos_jugados',
      ],
      Médicas: ['lesiones', 'dias_baja'],
      Disciplina: ['tarjetas_amarillas', 'tarjetas_rojas', 'sanciones_federativas'],
    }),
    []
  );

  const opciones = Array.from({ length: 11 }, (_, i) => i);

  /* 🔧 Helper: construir formulario en 0 siempre */
  const blankForm = (eid) => {
    const base = { estadistica_id: eid };
    Object.values(campos)
      .flat()
      .forEach((campo) => {
        base[campo] = campo === 'distancia_recorrida_km' ? 0.0 : 0;
      });
    return base;
  };

  /* ============== Breadcrumb ============== */
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    const base = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: 'Registrar Estadísticas', to: '/admin/registrar-estadisticas' }];

    const last = base[base.length - 1];
    const needsAppend = !last || last.label !== 'Detalle Estadística';

    if (needsAppend) {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [...base, { label: 'Detalle Estadística', to: currentPath }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  /* ===================== Helpers ===================== */
  const unwrapJugador = (resData) => {
    const root = resData?.data ?? resData;
    if (Array.isArray(root?.items) && root.items.length > 0) return root.items[0];
    if (root?.item) return root.item;
    if (root?.jugador) return root.jugador;
    return root;
  };

  async function getStatsByEstadisticaId(eid) {
    const urls = [
      `/estadisticas/estadistica/${encodeURIComponent(String(eid))}`,
      `/estadisticas/estadistica/${encodeURIComponent(String(eid))}/`,
    ];
    for (const u of urls) {
      try {
        const res = await api.get(u);
        return res;
      } catch (e) {
        const st = e?.response?.status;
        if (st === 401 || st === 403) throw e;
      }
    }
    return { data: { ok: true, items: [] } };
  }

  const mapPayloadForAPI = (obj, includeEstadisticaIdForPost = false) => {
    const out = { ...obj };
    if ('partidos_jugados' in out) {
      out.partidos_jugador = out.partidos_jugados;
      delete out.partidos_jugados;
    }
    delete out.id;
    delete out.created_at;
    delete out.updated_at;
    if (!includeEstadisticaIdForPost) delete out.estadistica_id;
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  };

  const pretty = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

  /* ✅ RUT con dígito verificador solo para mostrar */
  const rutConDV = useMemo(() => {
    if (!jugador) return formatRutWithDV(rut);
    return formatRutWithDV(jugador.rut_jugador ?? rut);
  }, [jugador, rut]);

  /* ============================ Auth (WELI) ============================ */
  useEffect(() => {
    try {
      const token = getToken(); // ✅ WELI token helper
      if (!token) throw new Error('no-token');

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (decoded?.exp && decoded.exp < now) throw new Error('expired');

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (![1, 2].includes(rol)) {
        navigate('/admin', { replace: true });
      }
    } catch {
      clearToken(); // ✅ WELI clear
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  /* ====================== Cargar jugador + stats ====================== */
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError('');

      try {
        const jugadorRes = await api.get(`/jugadores/rut/${encodeURIComponent(rut)}`);
        if (!alive) return;

        const jRaw = unwrapJugador(jugadorRes.data);
        setJugador(jRaw);

        let eid = jRaw?.estadistica_id;
        if (eid != null && typeof eid === 'string' && /^\d+$/.test(eid)) eid = Number(eid);

        if (eid == null) {
          setError('El jugador no incluye el campo "estadistica_id" en la respuesta del backend.');
          setLoading(false);
          return;
        }
        setEstadisticaId(eid);

        const { data } = await getStatsByEstadisticaId(eid);
        if (!alive) return;

        const item = Array.isArray(data?.items) && data.items.length > 0 ? data.items[0] : null;

        if (item) {
          setStatsExistentes(() => {
            const est = { ...item };
            if (est.partidos_jugador != null && est.partidos_jugados == null) {
              est.partidos_jugados = est.partidos_jugador;
            }
            return est;
          });
          setFormData(blankForm(eid));
        } else {
          setStatsExistentes({});
          setFormData(blankForm(eid));
        }
      } catch (err) {
        const st = err?.response?.status;

        if (st === 401 || st === 403) {
          clearToken();
          navigate('/login', { replace: true });
          return;
        }

        if (st === 404) setError('El jugador no existe.');
        else setError('Error al cargar los datos.');

        setTimeout(() => navigate('/admin/registrar-estadisticas', { replace: true }), 1200);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rut, navigate, campos]);

  /* ============================ Handlers ============================ */
  const handleChange = (campo, value) => {
    setFormData((prev) => ({
      ...prev,
      [campo]:
        campo === 'distancia_recorrida_km'
          ? (Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0)
          : (Number.isFinite(parseInt(value)) ? parseInt(value) : 0),
    }));
  };

  const handleResetLocal = () => {
    if (estadisticaId != null) setFormData(blankForm(estadisticaId));
  };

  const handleSubmit = async () => {
    if (submitting || estadisticaId == null) return;
    setSubmitting(true);
    setError('');

    try {
      if (statsExistentes && Object.keys(statsExistentes).length > 0) {
        const sumaDatos = { ...statsExistentes };

        Object.keys(formData).forEach((campo) => {
          if (campo === 'estadistica_id') return;

          const antiguo = Number(statsExistentes?.[campo] ?? 0);
          const nuevo = Number(formData?.[campo] ?? 0);

          sumaDatos[campo] =
            campo === 'distancia_recorrida_km'
              ? Number((antiguo + nuevo).toFixed(2))
              : antiguo + nuevo;
        });

        const payload = mapPayloadForAPI(sumaDatos, false);
        await api.put(`/estadisticas/estadistica/${encodeURIComponent(estadisticaId)}`, payload);

        alert('✅ Estadísticas actualizadas (acumuladas) correctamente');
      } else {
        const payload = mapPayloadForAPI({ ...formData, estadistica_id: estadisticaId }, true);
        await api.post('/estadisticas/', payload);

        alert('✅ Estadísticas registradas correctamente');
      }

      navigate('/admin/registrar-estadisticas', { replace: true });
    } catch (err) {
      const st = err?.response?.status;

      if (st === 401 || st === 403) {
        clearToken();
        navigate('/login', { replace: true });
      } else {
        const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message;
        setError(detail || '❌ Error al guardar estadísticas');
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

      <h2 className="text-2xl font-bold mb-6 text-center">
        Modificar Estadísticas de {jugador?.nombre_jugador} (RUT: {rutConDV})
      </h2>

      <div className={`${contenedorClase} max-w-6xl mx-auto`}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(campos).map(([categoria, listaCampos]) => (
            <section key={categoria} className={cardClase}>
              <h4 className="font-bold mb-3 text-base">{categoria}</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {listaCampos.map((campo) => (
                  <div key={campo} className="space-y-1">
                    <label className="block text-xs sm:text-sm font-medium">{pretty(campo)}</label>

                    {campo === 'distancia_recorrida_km' ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData[campo] ?? 0}
                        onChange={(e) => handleChange(campo, e.target.value)}
                        className={`w-full p-2 rounded text-sm ${inputClase}`}
                      />
                    ) : (
                      <select
                        value={formData[campo] ?? 0}
                        onChange={(e) => handleChange(campo, e.target.value)}
                        className={`w-full p-2 rounded text-sm ${inputClase}`}
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
          >
            Limpiar a 0
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`text-white font-bold py-2 px-6 rounded ${
              submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {submitting
              ? 'Guardando...'
              : statsExistentes && Object.keys(statsExistentes).length > 0
                ? 'Acumular y Guardar'
                : 'Guardar Estadísticas'}
          </button>
        </div>
      </div>
    </div>
  );
}
