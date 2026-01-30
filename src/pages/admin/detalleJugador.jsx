// src/pages/admin/detalleJugador.jsx
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { FiEdit, FiX } from 'react-icons/fi';
import { FileText } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import IsLoading from '../../components/isLoading';
import { jwtDecode } from 'jwt-decode';
import api, { getToken, clearToken } from '../../services/api';
import { useMobileAutoScrollTop } from '../../hooks/useMobileScrollTop';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/* ───────── Helpers ───────── */
const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  return [];
};

const unwrapOne = (raw) => {
  if (!raw) return null;
  if (raw.item && typeof raw.item === 'object') return raw.item;
  if (raw.data && typeof raw.data === 'object') {
    if (raw.data.item && typeof raw.data.item === 'object') return raw.data.item;
    if (Array.isArray(raw.data.items) && raw.data.items.length > 0) return raw.data.items[0];
    if (
      !Array.isArray(raw.data) &&
      Object.keys(raw.data).length > 0 &&
      !('ok' in raw.data) &&
      !('items' in raw.data)
    )
      return raw.data;
  }
  if (Array.isArray(raw.items) && raw.items.length > 0) return raw.items[0];
  if (
    !Array.isArray(raw) &&
    typeof raw === 'object' &&
    Object.keys(raw).length > 0 &&
    !('ok' in raw) &&
    !('items' in raw)
  )
    return raw;
  return null;
};

const tryGetList = async (paths, signal) => {
  const variants = [];
  for (const p of paths) {
    variants.push(p.endsWith('/') ? p : `${p}/`);
    variants.push(p.endsWith('/') ? p.slice(0, -1) : p);
  }
  const uniq = [...new Set(variants)];
  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal });
      return asList(r);
    } catch (e) {
      const st = e?.response?.status;
      if (st === 401 || st === 403) throw e;
      continue;
    }
  }
  return [];
};

const normalizeCatalog = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      id: Number(
        x?.id ??
          x?.posicion_id ??
          x?.categoria_id ??
          x?.establec_educ_id ??
          x?.prevision_medica_id ??
          x?.estado_id ??
          x?.sucursal_id ??
          x?.comuna_id
      ),
      nombre: String(x?.nombre ?? x?.descripcion ?? '').trim(),
    }))
    .filter((x) => Number.isFinite(x.id) && x.nombre);

const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const getEstadisticaIdFromJugador = (j) => {
  if (!j || typeof j !== 'object') return null;
  let eid = j.estadistica_id ?? j.estadisticas_id ?? j.id_estadistica ?? null;
  if (typeof eid === 'string' && /^\d+$/.test(eid)) eid = Number(eid);
  return eid;
};

// arma dataURL para IMG
const buildFotoDataUrl = (j) => {
  const b64 = j?.foto_base64;
  const mime = j?.foto_mime;
  if (!b64 || !mime) return null;
  return `data:${mime};base64,${b64}`;
};

/* =======================
   CONTRATO: base64 -> PDF
======================= */

// base64 (con o sin "data:...;base64,") -> Blob
const b64ToBlob = (b64, mime = 'application/pdf') => {
  const raw = String(b64 || '').trim();

  const clean = raw
    .replace(/^data:application\/pdf;base64,/, '')
    .replace(/^data:.*;base64,/, '')
    .replace(/\s+/g, '');

  if (!clean) throw new Error('Base64 vacío');

  const bytes = atob(clean);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);

  return new Blob([arr], { type: mime });
};

// ✅ MISMA LÓGICA QUE verConvocacionHistorica.jsx: abrir blob URL directo
const openBlobUrlLikeHistorico = (blobUrl) => {
  const win = window.open(blobUrl, '_blank', 'noopener'); // sin noreferrer (evita blanco en algunos browsers)
  if (!win) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

/* ───────── Componente ───────── */
export default function DetalleJugador() {
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode } = useTheme();

  useEffect(() => {
    const currentPath = location.pathname + location.search;
    const base = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: 'Listar Jugadores', to: '/admin/listar-jugadores' }];

    const last = base[base.length - 1];
    if (!last || last.label !== 'Detalle Jugador') {
      navigate(currentPath, {
        replace: true,
        state: { ...(location.state || {}), breadcrumb: [...base, { label: 'Detalle Jugador', to: currentPath }] },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useMobileAutoScrollTop();

  const css = {
    fondo: darkMode ? 'bg-[#111827] text-white' : 'bg-white text-[#1d0b0b]',
    tarjeta: darkMode
      ? 'bg-[#1f2937] border border-gray-700 text-white'
      : 'bg-white border border-gray-200 text-[#1d0b0b]',
    input: darkMode
      ? 'w-full p-1 rounded bg-[#374151] text-white border border-gray-600'
      : 'w-full p-1 rounded bg-gray-50 border border-gray-300',
  };

  const [isLoading, setIsLoading] = useState(true);
  const [jugador, setJugador] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [statsId, setStatsId] = useState(null);

  const [fotoDataUrl, setFotoDataUrl] = useState(null);

  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [rol, setRol] = useState(null);

  /* ───────── Auth ───────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error('no-token');
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error('expired');

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const parsedRol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;
      if (![1, 2].includes(parsedRol)) {
        navigate('/admin', { replace: true });
        return;
      }
      setRol(parsedRol);
    } catch {
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  /* ───────── Carga datos ───────── */
  useEffect(() => {
    if (rol == null) return;
    let alive = true;
    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setErr('');
      try {
        const rj = await api.get(`/jugadores/rut/${encodeURIComponent(rut)}`, { signal: abort.signal });
        const j = unwrapOne(rj?.data);

        if (!alive) return;
        if (!j) {
          navigate('/admin/listar-jugadores', { replace: true });
          return;
        }

        // debug contrato
        console.log('contrato_prestacion existe?', Boolean(j?.contrato_prestacion));
        console.log('mime contrato:', j?.contrato_prestacion_mime);
        console.log('len contrato:', (j?.contrato_prestacion || '').length);

        setFotoDataUrl(buildFotoDataUrl(j));

        // stats
        let est = {};
        let estId = null;

        try {
          const re = await api.get(`/estadisticas/by-rut/${encodeURIComponent(rut)}`, { signal: abort.signal });
          const items = asList(re);
          if (items.length > 0) {
            const e0 = items[0] || {};
            estId = e0?.id ?? null;
            const norm = Object.fromEntries(Object.entries(e0).map(([k, v]) => [k, num(v, 0)]));
            if ('partidos_jugador' in norm && !('partidos_jugados' in norm)) norm.partidos_jugados = norm.partidos_jugador;
            est = norm;
          } else {
            const eid = getEstadisticaIdFromJugador(j);
            if (eid != null) {
              const re2 = await api.get(`/estadisticas/estadistica/${encodeURIComponent(eid)}`, { signal: abort.signal });
              const items2 = asList(re2);
              if (items2.length > 0) {
                const e1 = items2[0] || {};
                estId = e1?.id ?? null;
                const norm2 = Object.fromEntries(Object.entries(e1).map(([k, v]) => [k, num(v, 0)]));
                if ('partidos_jugador' in norm2 && !('partidos_jugados' in norm2)) norm2.partidos_jugados = norm2.partidos_jugador;
                est = norm2;
              } else est = {};
            } else est = {};
          }
        } catch {
          est = {};
        }

        const [posList, catList, estbList, prevList, estList, sucList, comList] = await Promise.all([
          tryGetList(['/posiciones'], abort.signal),
          tryGetList(['/categorias'], abort.signal),
          tryGetList(['/establecimientos-educ'], abort.signal),
          tryGetList(['/prevision-medica'], abort.signal),
          tryGetList(['/estado'], abort.signal),
          tryGetList(['/sucursales-real'], abort.signal),
          tryGetList(['/comunas', '/catalogos/comunas', '/catalogos/comuna'], abort.signal),
        ]);
        if (!alive) return;

        const _posiciones = normalizeCatalog(posList);
        const _categorias = normalizeCatalog(catList);
        const _establecimientos = normalizeCatalog(estbList);
        const _previsiones = normalizeCatalog(prevList);
        const _estados = normalizeCatalog(estList);
        const _sucursales = normalizeCatalog(sucList);
        const _comunas = normalizeCatalog(comList);

        setPosiciones(_posiciones);
        setCategorias(_categorias);
        setEstablecimientos(_establecimientos);
        setPrevisiones(_previsiones);
        setEstados(_estados);
        setSucursales(_sucursales);
        setComunas(_comunas);

        const posMap = new Map(_posiciones.map((p) => [Number(p.id), p.nombre]));
        const catMap = new Map(_categorias.map((c) => [Number(c.id), c.nombre]));
        const estbMap = new Map(_establecimientos.map((e) => [Number(e.id), e.nombre]));
        const prevMap = new Map(_previsiones.map((p) => [Number(p.id), p.nombre]));
        const estMap = new Map(_estados.map((e) => [Number(e.id), e.nombre]));
        const sucMap = new Map(_sucursales.map((s) => [Number(s.id), s.nombre]));
        const comMap = new Map(_comunas.map((c) => [Number(c.id), c.nombre]));

        const jugadorEnriquecido = {
          ...j,
          posicion: j.posicion ?? (posMap.has(Number(j.posicion_id)) ? { nombre: posMap.get(Number(j.posicion_id)) } : null),
          categoria: j.categoria ?? (catMap.has(Number(j.categoria_id)) ? { nombre: catMap.get(Number(j.categoria_id)) } : null),
          establec_educ: j.establec_educ ?? (estbMap.has(Number(j.establec_educ_id)) ? { nombre: estbMap.get(Number(j.establec_educ_id)) } : null),
          prevision_medica: j.prevision_medica ?? (prevMap.has(Number(j.prevision_medica_id)) ? { nombre: prevMap.get(Number(j.prevision_medica_id)) } : null),
          estado: j.estado ?? (estMap.has(Number(j.estado_id)) ? { nombre: estMap.get(Number(j.estado_id)) } : null),
          sucursal: j.sucursal ?? (sucMap.has(Number(j.sucursal_id)) ? { nombre: sucMap.get(Number(j.sucursal_id)) } : null),
          comuna: j.comuna ?? (comMap.has(Number(j.comuna_id)) ? { nombre: comMap.get(Number(j.comuna_id)) } : null),
        };

        setJugador(jugadorEnriquecido);
        setEstadisticas(est);
        setStatsId(estId);

        // fecha -> yyyy-mm-dd
        const iso = j?.fecha_nacimiento;
        let ymd = '';
        if (iso) {
          const d = new Date(iso);
          if (!isNaN(d)) {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const da = String(d.getUTCDate()).padStart(2, '0');
            ymd = `${y}-${m}-${da}`;
          } else if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
            ymd = iso.slice(0, 10);
          }
        }

        setFormData({
          ...j,
          fecha_nacimiento: ymd || '',
          estado_id: j?.estado_id ?? null,
          sucursal_id: j?.sucursal_id ?? null,
          estadistica_id: estId ?? getEstadisticaIdFromJugador(j) ?? null,
          comuna_id: j?.comuna_id ?? null,
          direccion: j?.direccion ?? '',
        });
      } catch (error) {
        if (abort.signal.aborted) return;
        const st = error?.response?.status || error?.status;
        if (st === 401 || st === 403) {
          clearToken();
          navigate('/login', { replace: true });
          return;
        }
        navigate('/admin/listar-jugadores', { replace: true });
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
      abort.abort();
    };
  }, [rut, rol, navigate]);

  /* ───────── Helpers UI ───────── */
  const labelNombre = useCallback(
    (arr, id) => arr.find((i) => Number(i.id) === Number(id))?.nombre || '-',
    []
  );

  const formatearFechaLocal = (fecha) => {
    if (!fecha) return '-';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(fecha))) {
      const [y, m, d] = String(fecha).slice(0, 10).split('-');
      return `${d}-${m}-${y}`;
    }
    const d = new Date(fecha);
    if (!isNaN(d)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${da}-${m}-${y}`;
    }
    return String(fecha);
  };

  const secciones = useMemo(() => {
    if (!estadisticas) return {};
    return {
      Ofensivas: {
        Goles: estadisticas.goles ?? 0,
        Asistencias: estadisticas.asistencias ?? 0,
        'Tiros Libres': estadisticas.tiros_libres ?? 0,
        Penales: estadisticas.penales ?? 0,
        'Tiros al Arco': estadisticas.tiros_arco ?? 0,
        'Tiros Fuera': estadisticas.tiros_fuera ?? 0,
        'Tiros Bloqueados': estadisticas.tiros_bloqueados ?? 0,
        'Regates Exitosos': estadisticas.regates_exitosos ?? 0,
        'Centros Acertados': estadisticas.centros_acertados ?? 0,
        'Pases Clave': estadisticas.pases_clave ?? 0,
      },
      Defensivas: {
        Intercepciones: estadisticas.intercepciones ?? 0,
        Despejes: estadisticas.despejes ?? 0,
        'Duelos Ganados': estadisticas.duelos_ganados ?? 0,
        'Entradas Exitosas': estadisticas.entradas_exitosas ?? 0,
        Bloqueos: estadisticas.bloqueos ?? 0,
        Recuperaciones: estadisticas.recuperaciones ?? 0,
      },
      Técnicas: {
        'Pases Completados': estadisticas.pases_completados ?? 0,
        'Pases Errados': estadisticas.pases_errados ?? 0,
        'Posesión Perdida': estadisticas.posesion_perdida ?? 0,
        Offsides: estadisticas.offsides ?? 0,
        'Faltas Cometidas': estadisticas.faltas_cometidas ?? 0,
        'Faltas Recibidas': estadisticas.faltas_recibidas ?? 0,
      },
      Físicas: {
        'Distancia Recorrida (km)': estadisticas.distancia_recorrida_km ?? 0,
        Sprints: estadisticas.sprints ?? 0,
        'Duelos Aéreos Ganados': estadisticas.duelos_aereos_ganados ?? 0,
        'Minutos Jugados': estadisticas.minutos_jugados ?? 0,
        'Partidos Jugados': estadisticas.partidos_jugados ?? 0,
      },
      Médicas: {
        Lesiones: estadisticas.lesiones ?? 0,
        'Días de Baja': estadisticas.dias_baja ?? 0,
      },
      Disciplina: {
        'Tarjetas Amarillas': estadisticas.tarjetas_amarillas ?? 0,
        'Tarjetas Rojas': estadisticas.tarjetas_rojas ?? 0,
        'Sanciones Federativas': estadisticas.sanciones_federativas ?? 0,
        'Torneos Convocados': estadisticas.torneos_convocados ?? 0,
        'Titular en Partidos': estadisticas.titular_partidos ?? 0,
      },
    };
  }, [estadisticas]);

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const guardarCambios = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setIsLoading(true);

    try {
      const ALLOWED = new Set([
        'nombre_jugador',
        'edad',
        'email',
        'telefono',
        'peso',
        'estatura',
        'talla_polera',
        'talla_short',
        'nombre_apoderado',
        'telefono_apoderado',
        'fecha_nacimiento',
        'posicion_id',
        'categoria_id',
        'establec_educ_id',
        'prevision_medica_id',
        'estado_id',
        'sucursal_id',
        'comuna_id',
        'direccion',
      ]);

      const raw = { ...formData };
      const numeric = (v) => (v === '' || v == null ? null : Number(v));
      const payload = {};

      for (const [k, v] of Object.entries(raw)) {
        if (!ALLOWED.has(k)) continue;

        if (
          [
            'edad',
            'peso',
            'estatura',
            'posicion_id',
            'categoria_id',
            'establec_educ_id',
            'prevision_medica_id',
            'estado_id',
            'sucursal_id',
            'comuna_id',
          ].includes(k)
        ) {
          payload[k] = numeric(v);
        } else if (k === 'fecha_nacimiento') {
          payload[k] = v || null;
        } else {
          payload[k] = v ?? null;
        }
      }

      await api.patch(`/jugadores/rut/${encodeURIComponent(rut)}`, payload);

      setJugador((prev) => ({
        ...prev,
        ...payload,
        posicion: posiciones.find((p) => Number(p.id) === Number(payload.posicion_id)) || prev.posicion || null,
        categoria: categorias.find((c) => Number(c.id) === Number(payload.categoria_id)) || prev.categoria || null,
        establec_educ: establecimientos.find((e) => Number(e.id) === Number(payload.establec_educ_id)) || prev.establec_educ || null,
        prevision_medica: previsiones.find((p) => Number(p.id) === Number(payload.prevision_medica_id)) || prev.prevision_medica || null,
        estado: estados.find((e) => Number(e.id) === Number(payload.estado_id)) || prev.estado || null,
        sucursal: sucursales.find((s) => Number(s.id) === Number(payload.sucursal_id)) || prev.sucursal || null,
        comuna: comunas.find((c) => Number(c.id) === Number(payload.comuna_id)) || prev.comuna || null,
      }));

      setEditMode(false);
      setMsg('✅ Datos actualizados');
      setTimeout(() => setMsg(''), 3000);
    } catch (error) {
      const st = error?.response?.status || error?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate('/login', { replace: true });
      } else {
        setErr(error?.response?.data?.detail || error?.message || '❌ Error al actualizar');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /* ───────── Contrato: click -> abre PDF en otra pestaña (MISMA LÓGICA HISTÓRICO) ───────── */
  const onContratoClick = async () => {
    setErr('');
    try {
      let b64 = jugador?.contrato_prestacion;
      let mime = jugador?.contrato_prestacion_mime || 'application/pdf';

      // fallback si no vino
      if (!b64 || String(b64).trim().length < 50) {
        const r = await api.get(`/jugadores/rut/${encodeURIComponent(rut)}`);
        const j = unwrapOne(r?.data);
        b64 = j?.contrato_prestacion;
        mime = j?.contrato_prestacion_mime || 'application/pdf';

        if (!b64 || String(b64).trim().length < 50) {
          setErr('Este jugador no tiene contrato almacenado.');
          return;
        }

        // cache local
        setJugador((prev) => ({
          ...(prev || {}),
          contrato_prestacion: b64,
          contrato_prestacion_mime: mime,
        }));
      }

      // Aceptamos "application/pdf" aunque venga con parámetros, ej: "application/pdf; charset=binary"
      const mimeLower = String(mime || '').toLowerCase();
      if (!mimeLower.includes('application/pdf')) {
        setErr('El contrato almacenado no está en formato PDF.');
        return;
      }

      const blob = b64ToBlob(b64, 'application/pdf');
      const url = URL.createObjectURL(blob);

      // ✅ igual que histórico: abre directo y te queda nombre raro de pestaña (blob:...)
      openBlobUrlLikeHistorico(url);

      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e?.response?.status || e?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate('/login', { replace: true });
        return;
      }
      setErr(e?.response?.data?.message || e?.message || 'No se pudo abrir el contrato.');
    }
  };

  if (isLoading || !jugador) return <IsLoading />;

  return (
    <div className={`${css.fondo} min-h-[calc(100vh-100px)] relative`}>
      <div className="px-2 sm:px-4 pt-4 pb-16 font-weli">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="w-40 h-40 mx-auto rounded-full overflow-hidden bg-gray-300 flex items-center justify-center text-6xl dark:bg-gray-700 border border-black/10 dark:border-white/10">
            {fotoDataUrl ? (
              <img
                src={fotoDataUrl}
                alt={`Foto de ${jugador.nombre_jugador}`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setFotoDataUrl(null)}
              />
            ) : (
              <span aria-hidden>👤</span>
            )}
          </div>

          <h1 className="text-3xl font-extrabold mt-4">{jugador.nombre_jugador}</h1>
          <p className="text-sm text-gray-500">
            {jugador.posicion?.nombre || '-'} | {jugador.edad ?? '-'} años
          </p>
          <p className="text-sm text-gray-500">{jugador.categoria?.nombre || '-'}</p>
        </div>

        {/* Tarjeta Datos */}
        <div className={`relative p-4 rounded-lg shadow ${css.tarjeta} w-full`}>
          <button
            onClick={() => {
              setEditMode(true);
              setErr('');
            }}
            className="absolute top-2 right-3 text-xl hover:text-[#e82d89]"
            title="Editar"
            aria-label="Editar"
          >
            <FiEdit />
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              ['Email', 'email'],
              ['Teléfono', 'telefono'],
              ['Peso (kg)', 'peso'],
              ['Estatura (cm)', 'estatura'],
              ['Fecha Nacimiento', 'fecha_nacimiento'],
              ['Talla Polera', 'talla_polera'],
              ['Talla Short', 'talla_short'],
              ['Nombre Apoderado', 'nombre_apoderado'],
              ['Teléfono Apoderado', 'telefono_apoderado'],
              ['Posición', 'posicion_id'],
              ['Categoría', 'categoria_id'],
              ['Establecimiento', 'establec_educ_id'],
              ['Previsión Médica', 'prevision_medica_id'],
              ['Estado', 'estado_id'],
              ['Sucursal', 'sucursal_id'],
              ['Comuna', 'comuna_id'],
              ['Dirección', 'direccion'],
              ['Contrato firmado', 'contrato_firmado'],
              ['Estadística ID', 'estadistica_id'],
            ].map(([label, key]) => (
              <div key={key}>
                <span className="font-semibold text-sm">{label}:</span>

                {key === 'contrato_firmado' ? (
                  <span className="block text-sm mt-1">
                    <button
                      type="button"
                      onClick={onContratoClick}
                      className="inline-flex items-center gap-2 hover:opacity-80"
                      title="Ver contrato (PDF)"
                      aria-label="Ver contrato"
                    >
                      <FileText size={18} color={darkMode ? '#ffffff' : '#D32F2F'} />
                      <span className="opacity-80">Ver contrato</span>
                    </button>
                  </span>
                ) : (
                  <span className="block text-sm">
                    {key === 'posicion_id'
                      ? jugador.posicion?.nombre || labelNombre(posiciones, jugador.posicion_id)
                      : key === 'categoria_id'
                      ? jugador.categoria?.nombre || labelNombre(categorias, jugador.categoria_id)
                      : key === 'establec_educ_id'
                      ? jugador.establec_educ?.nombre || labelNombre(establecimientos, jugador.establec_educ_id)
                      : key === 'prevision_medica_id'
                      ? jugador.prevision_medica?.nombre || labelNombre(previsiones, jugador.prevision_medica_id)
                      : key === 'estado_id'
                      ? jugador.estado?.nombre || labelNombre(estados, jugador.estado_id)
                      : key === 'sucursal_id'
                      ? jugador.sucursal?.nombre || labelNombre(sucursales, jugador.sucursal_id)
                      : key === 'comuna_id'
                      ? jugador.comuna?.nombre || labelNombre(comunas, jugador.comuna_id)
                      : key === 'fecha_nacimiento'
                      ? formatearFechaLocal(jugador.fecha_nacimiento)
                      : key === 'estadistica_id'
                      ? statsId ?? jugador.estadistica_id ?? '-'
                      : jugador[key] ?? '-'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {err && <p className="text-red-500 text-sm mt-3">{err}</p>}
        </div>

        {/* Gráficas */}
        <section className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold mb-4">Estadísticas del Jugador</h2>
          {Object.entries(secciones).map(([titulo, data]) => (
            <div key={titulo} className={`p-4 rounded shadow ${css.tarjeta}`}>
              <h3 className="text-lg font-semibold mb-4">{titulo}</h3>
              <div className="relative h-[300px] w-full">
                <Bar
                  data={{
                    labels: Object.keys(data),
                    datasets: [
                      {
                        label: titulo,
                        data: Object.values(data),
                        backgroundColor: darkMode ? '#3b82f6' : '#e82d89',
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Overlay Edición */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 p-4 overflow-auto">
          <form
            onSubmit={guardarCambios}
            className={`w-full max-w-2xl ${css.tarjeta} border-2 border-[#e82d89] shadow-2xl animate-fade-in rounded-xl p-6 space-y-6 overflow-y-auto max-h-[90vh]`}
          >
            <div className="flex justify-between items-center mb-6 border-b border-gray-300 pb-2">
              <h3 className="text-xl font-bold text-[#e82d89] text-center w-full">Editar Información del Jugador</h3>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="absolute top-6 right-6 text-xl hover:text-red-500"
                title="Cerrar"
                aria-label="Cerrar"
              >
                <FiX />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ['Nombre', 'nombre_jugador', 'text'],
                ['Edad', 'edad', 'number'],
                ['Email', 'email', 'email'],
                ['Teléfono', 'telefono', 'text'],
                ['Peso (kg)', 'peso', 'number'],
                ['Estatura (cm)', 'estatura', 'number'],
                ['Talla Polera', 'talla_polera', 'text'],
                ['Talla Short', 'talla_short', 'text'],
                ['Nombre Apoderado', 'nombre_apoderado', 'text'],
                ['Teléfono Apoderado', 'telefono_apoderado', 'text'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold mb-1">{label}</label>
                  <input type={type} name={key} value={formData[key] ?? ''} onChange={handleChange} className={css.input} />
                </div>
              ))}

              <div>
                <label className="block text-sm font-semibold mb-1">Fecha Nacimiento</label>
                <input type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento || ''} onChange={handleChange} className={css.input} />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Posición</label>
                <select name="posicion_id" value={formData.posicion_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {posiciones.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Categoría</label>
                <select name="categoria_id" value={formData.categoria_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Establecimiento</label>
                <select name="establec_educ_id" value={formData.establec_educ_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {establecimientos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Previsión Médica</label>
                <select name="prevision_medica_id" value={formData.prevision_medica_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {previsiones.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Estado</label>
                <select name="estado_id" value={formData.estado_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {estados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Sucursal</label>
                <select name="sucursal_id" value={formData.sucursal_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Comuna</label>
                <select name="comuna_id" value={formData.comuna_id || ''} onChange={handleChange} className={css.input}>
                  <option value="">Seleccione</option>
                  {comunas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Dirección</label>
                <input type="text" name="direccion" value={formData.direccion ?? ''} onChange={handleChange} className={css.input} placeholder="Ej: Av. Siempre Viva 742" />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Estadística ID</label>
                <input type="text" name="estadistica_id" value={formData.estadistica_id ?? ''} disabled className={`${css.input} opacity-70 cursor-not-allowed`} />
                <p className="text-xs text-gray-500 mt-1">Campo informativo (no editable)</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-1">Contrato firmado</label>
                <div className={`${darkMode ? 'bg-[#111827]' : 'bg-gray-50'} border border-gray-300/30 rounded p-2 flex items-center gap-2`}>
                  <FileText size={18} color={darkMode ? '#ffffff' : '#D32F2F'} />
                  <span className="text-sm opacity-80">Disponible en la tarjeta (Ver contrato)</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Se abre en una nueva pestaña como PDF (estilo histórico).</p>
              </div>
            </div>

            {err && <p className="text-red-500 text-sm">{err}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="py-1 px-4 border border-gray-500 rounded hover:bg-gray-200 dark:hover:bg-[#111827]"
              >
                Cancelar
              </button>
              <button type="submit" className="py-1 px-4 bg-blue-600 text-white rounded hover:bg-blue-700">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {msg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-40">
          {msg}
        </div>
      )}
    </div>
  );
}
