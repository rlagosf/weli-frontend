// src/pages/admin/config/EstablecimientosEducacionales.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api, { getToken, clearToken } from '../../../services/api';
import { useTheme } from '../../../context/ThemeContext';
import Modal from '../../../components/modal';
import { useMobileAutoScrollTop } from '../../../hooks/useMobileScrollTop';

const ACCENT = '#e82d89';

export default function EstablecimientosEducacionales() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [establecimientos, setEstablecimientos] = useState([]);
  const [nuevo, setNuevo] = useState('');
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  /* ───────────────────────────────
     📌 Breadcrumb abreviado (solo móvil)
  ─────────────────────────────── */
  const abreviar = (txt) => {
    if (!txt) return '';
    if (window.innerWidth > 640) return txt;
    if (txt.length <= 14) return txt;

    return txt
      .split(' ')
      .map((p) => (p.length > 6 ? p.slice(0, 6) + '.' : p))
      .join(' ');
  };

  useMobileAutoScrollTop();

  useEffect(() => {
    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    if (!last || last.label !== 'Establecimientos Educacionales') {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: abreviar('Configuración'), to: '/admin/configuracion' },
            { label: abreviar('Establecimientos Educacionales'), to: currentPath },
          ],
        },
      });
    }
  }, [location.pathname, location.state, navigate]);

  /* ───────────────────────────────
     🔐 Auth solo admins
  ─────────────────────────────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error('no-token');

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error('expired');

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (rol !== 1) {
        navigate('/admin', { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  /* ───────────────────────────────
     Utils
  ─────────────────────────────── */
  const sanitizar = (texto) =>
    String(texto || '')
      .replace(/[<>;"']/g, '')
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, '')
      .trim();

  const flash = useCallback((okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);
    window.setTimeout(() => {
      setMensaje('');
      setError('');
    }, 2500);
  }, []);

  const toArray = (resp) => {
    const d = resp?.data ?? resp;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    return [];
  };

  // ✅ con tu api.js interceptor: error normalizado
  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const prettyError = (err, fallback) => {
    const st = getErrStatus(err);
    const data = getErrData(err);

    const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

    if (st === 401 || st === 403) {
      return '🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.';
    }

    if (st === 400) {
      return backendMsg || '⚠️ Datos inválidos. Revisa el nombre.';
    }

    if (st === 404) {
      return backendMsg || '⚠️ No encontrado (puede que ya haya sido eliminado).';
    }

    if (st === 409) {
      // FK MySQL
      if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
        return '⚠️ No se puede eliminar: hay jugador(es) asociados a este establecimiento.';
      }
      // duplicado MySQL
      if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
        return '⚠️ Ya existe un establecimiento con ese nombre.';
      }
      return backendMsg || '⚠️ Conflicto: no se pudo completar la acción.';
    }

    // algunos backends devuelven 500 con errno
    if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
      return '⚠️ No se puede eliminar: hay jugador(es) asociados a este establecimiento.';
    }
    if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
      return '⚠️ Ya existe un establecimiento con ese nombre.';
    }

    return backendMsg || fallback || '❌ Error inesperado.';
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate('/login', { replace: true });
  }, [navigate]);

  const withVariants = (fn) => async (base, ...args) => {
    const urls = base.endsWith('/') ? [base, base.slice(0, -1)] : [base, `${base}/`];
    let lastErr = null;

    for (const u of urls) {
      try {
        return await fn(u, ...args);
      } catch (e) {
        lastErr = e;
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
      }
    }
    throw lastErr || new Error('ENDPOINT_VARIANTS_FAILED');
  };

  const getVar = withVariants((u, c) => api.get(u, c));
  const postVar = withVariants((u, p, c) => api.post(u, p, c));
  const putVar = withVariants((u, p, c) => api.put(u, p, c));
  const delVar = withVariants((u, c) => api.delete(u, c));

  /* ───────────────────────────────
     Fetch
  ─────────────────────────────── */
  const fetchDatos = useCallback(async () => {
    try {
      const res = await getVar('/establecimientos-educ');
      setEstablecimientos(toArray(res));
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ Error al obtener establecimientos'));
    }
  }, [getVar, handleAuth]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchDatos();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [fetchDatos]);

  /* ───────────────────────────────
     Crear
  ─────────────────────────────── */
  const crear = async () => {
    const nombre = sanitizar(nuevo);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await postVar('/establecimientos-educ', { nombre });
      setNuevo('');
      flash('✅ Establecimiento creado');
      await fetchDatos();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo crear el establecimiento.'));
    } finally {
      setBusy(false);
    }
  };

  /* ───────────────────────────────
     Actualizar
  ─────────────────────────────── */
  const actualizar = async () => {
    if (!editarId) return setError('⚠️ Debes seleccionar un establecimiento.');
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await putVar(`/establecimientos-educ/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre('');
      flash('✅ Establecimiento actualizado');
      await fetchDatos();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo actualizar el establecimiento.'));
    } finally {
      setBusy(false);
    }
  };

  /* ───────────────────────────────
     Eliminar
  ─────────────────────────────── */
  const eliminar = async () => {
    if (!seleccionado?.id) return setMostrarModal(false);

    setBusy(true);
    try {
      await delVar(`/establecimientos-educ/${seleccionado.id}`);
      flash('✅ Establecimiento eliminado');
      await fetchDatos();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo eliminar el establecimiento.'));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setSeleccionado(null);
    }
  };

  /* ───────────────────────────────
     UI (consistencia catálogo)
  ─────────────────────────────── */
  const fondo = darkMode ? 'bg-[#111827] text-white' : 'bg-white text-[#1d0b0b]';
  const tarjeta = darkMode ? 'bg-[#1f2937] border-gray-700' : 'bg-white border-gray-200';

  const inputBase =
    (darkMode
      ? 'bg-[#111827] text-white border border-white/10 placeholder-white/40'
      : 'bg-white text-black border border-black/10 placeholder-black/40') +
    ' w-full p-2 rounded-xl';

  const selectBase = inputBase + ' appearance-none';

  const btnBase =
    'mt-4 w-full py-2 rounded-xl font-bold transition disabled:opacity-60 disabled:cursor-not-allowed text-white';

  const btnCreateStyle = busy ? { backgroundColor: '#9ca3af' } : { backgroundColor: ACCENT };
  const btnUpdateStyle = busy || !editarId ? { backgroundColor: '#9ca3af' } : { backgroundColor: '#f59e0b' };
  const btnDeleteStyle = !seleccionado || busy ? { backgroundColor: '#9ca3af' } : { backgroundColor: '#dc2626' };

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Establecimientos Educacionales</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listado */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">📋 Listado</h3>
          {establecimientos.length === 0 ? (
            <p className="opacity-60">Sin establecimientos registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {establecimientos.map((e) => (
                <li key={e.id} className="font-semibold opacity-90">
                  {e.nombre ?? `#${e.id}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">➕ Crear</h3>
          <input
            value={nuevo}
            onChange={(e) => {
              setNuevo(e.target.value);
              setError('');
              setMensaje('');
            }}
            placeholder="Nombre"
            className={inputBase}
            disabled={busy}
          />
          <button
            onClick={crear}
            disabled={busy}
            className={btnBase}
            style={btnCreateStyle}
            title={busy ? 'Procesando...' : 'Crear establecimiento'}
          >
            {busy ? 'Procesando...' : 'Guardar'}
          </button>
        </div>

        {/* Editar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">✏️ Editar</h3>
          <select
            value={editarId || ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              setEditarId(id || null);
              setEditarNombre(establecimientos.find((x) => Number(x.id) === id)?.nombre || '');
              setError('');
              setMensaje('');
            }}
            className={`${selectBase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona</option>
            {establecimientos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <input
            value={editarNombre}
            onChange={(e) => {
              setEditarNombre(e.target.value);
              setError('');
              setMensaje('');
            }}
            placeholder="Nuevo nombre"
            className={inputBase}
            disabled={busy || !editarId}
          />

          <button
            onClick={actualizar}
            disabled={busy || !editarId}
            className={btnBase}
            style={btnUpdateStyle}
            title={!editarId ? 'Selecciona un establecimiento' : busy ? 'Procesando...' : 'Actualizar'}
          >
            {busy ? 'Procesando...' : 'Actualizar'}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">🗑️ Eliminar</h3>
          <select
            value={seleccionado?.id || ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              const sel = establecimientos.find((x) => Number(x.id) === id);
              setSeleccionado(sel || null);
              setError('');
              setMensaje('');
            }}
            className={selectBase}
            disabled={busy}
          >
            <option value="">Selecciona</option>
            {establecimientos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              if (busy || !seleccionado) return;
              setMostrarModal(true);
            }}
            disabled={!seleccionado || busy}
            className={btnBase}
            style={btnDeleteStyle}
            title={!seleccionado ? 'Selecciona un establecimiento' : busy ? 'Procesando...' : 'Eliminar'}
          >
            {busy ? 'Procesando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {(mensaje || error) && (
        <p className={`text-center mt-6 font-bold ${mensaje ? 'text-green-500' : 'text-red-500'}`}>
          {mensaje || error}
        </p>
      )}

      <Modal
        visible={mostrarModal}
        onConfirm={eliminar}
        onCancel={() => setMostrarModal(false)}
      />
    </div>
  );
}
