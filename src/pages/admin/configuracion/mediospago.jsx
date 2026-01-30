// src/pages/admin/config/MediosPago.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api, { getToken, clearToken } from '../../../services/api';
import { useTheme } from '../../../context/ThemeContext';
import Modal from '../../../components/modal';
import { useMobileAutoScrollTop } from '../../../hooks/useMobileScrollTop';

export default function MediosPago() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [medios, setMedios] = useState([]);
  const [nuevoMedio, setNuevoMedio] = useState('');
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [medioSeleccionado, setMedioSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  // 🧭 Breadcrumb → lo pinta el layout (/admin)
  useEffect(() => {
    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];
    if (!last || last.label !== 'Medios de Pago') {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: 'Configuración', to: '/admin/configuracion' },
            { label: 'Medios de Pago', to: currentPath },
          ],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useMobileAutoScrollTop();

  // 🔐 Auth (solo admin = 1)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error('no-token');
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error('expired');

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (rol !== 1) navigate('/admin', { replace: true });
    } catch {
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // ───────── Helpers ─────────
  const sanitizar = (texto) =>
    String(texto || '')
      .replace(/[<>;"']/g, '')
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, '')
      .trim();

  const flash = (okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);
    setTimeout(() => {
      setMensaje('');
      setError('');
    }, 2500);
  };

  const toArray = (resp) => {
    const d = resp?.data ?? resp ?? [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    if (d?.ok && Array.isArray(d.data)) return d.data;
    return [];
  };

  // ✅ con tu api.js: error normalizado
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
      if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
        return '⚠️ No se puede eliminar: este medio de pago está en uso.';
      }
      if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
        return '⚠️ Ya existe un medio de pago con ese nombre.';
      }
      return backendMsg || '⚠️ Conflicto: no se pudo completar la acción.';
    }

    // si backend devuelve 500 pero expone errno/code
    if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
      return '⚠️ No se puede eliminar: este medio de pago está en uso.';
    }
    if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
      return '⚠️ Ya existe un medio de pago con ese nombre.';
    }

    return backendMsg || fallback || '❌ Error inesperado.';
  };

  const handleAuth = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  // Acepta variantes con y sin slash final (NO cambia endpoint lógico)
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

  const getVar = withVariants((u, cfg) => api.get(u, cfg));
  const postVar = withVariants((u, payload, cfg) => api.post(u, payload, cfg));
  const putVar = withVariants((u, payload, cfg) => api.put(u, payload, cfg));
  const delVar = withVariants((u, cfg) => api.delete(u, cfg));

  // ───────── Fetch ─────────
  const fetchMedios = async () => {
    try {
      const res = await getVar('/medio-pago');
      setMedios(toArray(res));
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ Error al obtener medios de pago'));
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchMedios();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────── Crear ─────────
  const crearMedio = async () => {
    const nombre = sanitizar(nuevoMedio);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await postVar('/medio-pago', { nombre });
      setNuevoMedio('');
      flash('✅ Medio de pago creado');
      await fetchMedios();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo crear el medio de pago.'));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarMedio = async () => {
    if (!editarId) return setError('⚠️ Debes seleccionar un medio.');
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await putVar(`/medio-pago/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre('');
      flash('✅ Medio de pago actualizado');
      await fetchMedios();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo actualizar el medio de pago.'));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!medioSeleccionado?.id) {
      setMostrarModal(false);
      return;
    }

    setBusy(true);
    try {
      await delVar(`/medio-pago/${medioSeleccionado.id}`);
      flash('✅ Medio de pago eliminado');
      await fetchMedios();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo eliminar el medio de pago.'));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setMedioSeleccionado(null);
    }
  };

  // 🎨 Estilos (NO tocamos colores)
  const fondo = darkMode ? 'bg-[#111827] text-white' : 'bg-white text-[#1d0b0b]';
  const tarjeta = darkMode ? 'bg-[#1f2937] border-gray-700' : 'bg-white border-gray-200';
  const inputClase =
    (darkMode
      ? 'bg-[#1f2937] text-white border border-gray-600 placeholder-gray-400'
      : 'bg-white text-black border border-gray-300 placeholder-gray-500') + ' w-full p-2 rounded';

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Gestión de Medios de Pago</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listar */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">📋 Listar Medios</h3>
          {medios.length === 0 ? (
            <p className="opacity-60">Sin medios registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {medios.map((item) => (
                <li key={item.id}>{item.nombre ?? item.descripcion ?? `#${item.id}`}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">➕ Crear Medio</h3>
          <input
            type="text"
            value={nuevoMedio}
            onChange={(e) => {
              setNuevoMedio(e.target.value);
              setError('');
              setMensaje('');
            }}
            placeholder="Nombre medio"
            className={inputClase}
            disabled={busy}
          />
          <button
            onClick={crearMedio}
            disabled={busy}
            className={`mt-4 w-full py-2 rounded text-white ${
              busy ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {busy ? 'Procesando...' : 'Guardar'}
          </button>
        </div>

        {/* Editar */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">✏️ Modificar Medio</h3>
          <select
            value={editarId || ''}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              setEditarId(id || null);
              const seleccionado = medios.find((m) => Number(m.id) === id);
              setEditarNombre(seleccionado?.nombre || seleccionado?.descripcion || '');
              setError('');
              setMensaje('');
            }}
            className={`${inputClase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona medio</option>
            {medios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre ?? item.descripcion}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={editarNombre}
            onChange={(e) => {
              setEditarNombre(e.target.value);
              setError('');
              setMensaje('');
            }}
            placeholder="Nuevo nombre"
            className={inputClase}
            disabled={busy || !editarId}
          />

          <button
            onClick={actualizarMedio}
            disabled={busy || !editarId}
            className={`mt-4 w-full py-2 rounded text-white ${
              busy || !editarId
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-700'
            }`}
          >
            {busy ? 'Procesando...' : 'Actualizar'}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">🗑️ Eliminar Medio</h3>
          <select
            value={medioSeleccionado?.id || ''}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              const seleccionado = medios.find((m) => Number(m.id) === id);
              setMedioSeleccionado(seleccionado || null);
              setError('');
              setMensaje('');
            }}
            className={inputClase}
            disabled={busy}
          >
            <option value="">Selecciona medio</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre ?? m.descripcion}
              </option>
            ))}
          </select>

          <button
            disabled={!medioSeleccionado || busy}
            onClick={() => {
              if (busy || !medioSeleccionado) return;
              setMostrarModal(true);
            }}
            className={`mt-4 w-full py-2 rounded text-white ${
              !medioSeleccionado || busy
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? 'Procesando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {(mensaje || error) && (
        <p className={`text-center mt-6 ${mensaje ? 'text-green-500' : 'text-red-500'}`}>
          {mensaje || error}
        </p>
      )}

      <Modal
        visible={mostrarModal}
        onConfirm={confirmarEliminacion}
        onCancel={() => setMostrarModal(false)}
      />
    </div>
  );
}
