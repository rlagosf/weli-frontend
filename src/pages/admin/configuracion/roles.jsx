// src/pages/admin/config/Roles.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api, { getToken, clearToken } from '../../../services/api';
import { useTheme } from '../../../context/ThemeContext';
import Modal from '../../../components/modal';
import { useMobileAutoScrollTop } from '../../../hooks/useMobileScrollTop';

export default function Roles() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [roles, setRoles] = useState([]);
  const [nuevoRol, setNuevoRol] = useState('');
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  // 🧭 Breadcrumb → lo pinta el layout (/admin)
  useEffect(() => {
    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];
    if (!last || last.label !== 'Roles') {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: 'Configuración', to: '/admin/configuracion' },
            { label: 'Roles', to: currentPath },
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

  // ───────── Utils ─────────
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

  // ✅ error normalizado por api.js
  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const handleAuth = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  const prettyError = (err, fallback) => {
    const st = getErrStatus(err);
    const data = getErrData(err);
    const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

    if (st === 401 || st === 403) return '🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.';
    if (st === 400) return backendMsg || '⚠️ Datos inválidos. Revisa el nombre del rol.';
    if (st === 404) return backendMsg || '⚠️ Rol no encontrado (puede que ya haya sido eliminado).';

    if (st === 409) {
      if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
        return '⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.';
      }
      if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
        return '⚠️ Ya existe un rol con ese nombre.';
      }
      return backendMsg || '⚠️ Conflicto: no se pudo completar la acción.';
    }

    // por si el backend manda 500 pero con errno/code
    if (data?.errno === 1451 || data?.code === 'ER_ROW_IS_REFERENCED_2') {
      return '⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.';
    }
    if (data?.errno === 1062 || data?.code === 'ER_DUP_ENTRY') {
      return '⚠️ Ya existe un rol con ese nombre.';
    }

    return backendMsg || fallback || '❌ Error inesperado.';
  };

  // ✅ variantes con y sin slash final (sin depender de err.response)
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
  const fetchRoles = async () => {
    try {
      const res = await getVar('/roles');
      setRoles(toArray(res));
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ Error al obtener roles'));
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchRoles();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────── Crear ─────────
  const crearRol = async () => {
    const nombre = sanitizar(nuevoRol);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await postVar('/roles', { nombre });
      setNuevoRol('');
      flash('✅ Rol creado');
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo crear el rol.'));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarRol = async () => {
    if (!editarId) return setError('⚠️ Debes seleccionar un rol.');
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError('⚠️ El nombre debe tener al menos 3 caracteres.');

    setBusy(true);
    try {
      await putVar(`/roles/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre('');
      flash('✅ Rol actualizado');
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo actualizar el rol.'));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!rolSeleccionado?.id) {
      setMostrarModal(false);
      return;
    }

    setBusy(true);
    try {
      await delVar(`/roles/${rolSeleccionado.id}`);
      flash('✅ Rol eliminado');
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, '❌ No se pudo eliminar el rol.'));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setRolSeleccionado(null);
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
      <h2 className="text-2xl font-bold mb-6 text-center">Gestión de Roles</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listar */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">📋 Listar Roles</h3>
          {roles.length === 0 ? (
            <p className="opacity-60">Sin roles registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {roles.map((rol) => (
                <li key={rol.id}>{rol.nombre ?? rol.descripcion ?? `#${rol.id}`}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-xl p-6`}>
          <h3 className="text-lg font-bold mb-4">➕ Crear Rol</h3>
          <input
            type="text"
            value={nuevoRol}
            onChange={(e) => {
              setNuevoRol(e.target.value);
              setError('');
              setMensaje('');
            }}
            placeholder="Nombre del rol"
            className={inputClase}
            disabled={busy}
          />
          <button
            onClick={crearRol}
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
          <h3 className="text-lg font-bold mb-4">✏️ Modificar Rol</h3>
          <select
            value={editarId || ''}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              setEditarId(id || null);
              const r = roles.find((x) => Number(x.id) === id);
              setEditarNombre(r?.nombre || r?.descripcion || '');
              setError('');
              setMensaje('');
            }}
            className={`${inputClase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona rol</option>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre ?? rol.descripcion}
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
            onClick={actualizarRol}
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
          <h3 className="text-lg font-bold mb-4">🗑️ Eliminar Rol</h3>
          <select
            value={rolSeleccionado?.id || ''}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              const seleccionado = roles.find((r) => Number(r.id) === id);
              setRolSeleccionado(seleccionado || null);
              setError('');
              setMensaje('');
            }}
            className={inputClase}
            disabled={busy}
          >
            <option value="">Selecciona rol</option>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre ?? rol.descripcion}
              </option>
            ))}
          </select>

          <button
            disabled={!rolSeleccionado || busy}
            onClick={() => {
              if (busy || !rolSeleccionado) return;
              setMostrarModal(true);
            }}
            className={`mt-4 w-full py-2 rounded text-white ${
              !rolSeleccionado || busy
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
