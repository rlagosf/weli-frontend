// src/pages/admin/config/MediosPago.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

const ACCENT = "#e82d89";

/**
 * =========================================================
 *  ✅ Gate GLOBAL (anti “backend loco” incluso con StrictMode)
 *  - Evita que el mismo fetch/resolución se dispare 2+ veces
 *  - Caché del endpoint resuelto (se prueba 1 vez y queda fijo)
 * =========================================================
 */
const __inFlight = new Map(); // key -> Promise
let __resolvedBase = ""; // "/medio-pago" o el que funcione (sin slash final)

function once(key, fn) {
  if (__inFlight.has(key)) return __inFlight.get(key);
  const p = (async () => {
    try {
      return await fn();
    } finally {
      __inFlight.delete(key);
    }
  })();
  __inFlight.set(key, p);
  return p;
}

const normalizeBase = (u) => (String(u || "").endsWith("/") ? String(u).slice(0, -1) : String(u));
const variants = (base) => {
  const b = String(base || "");
  return b.endsWith("/") ? [b, b.slice(0, -1)] : [b, `${b}/`];
};

export default function MediosPago() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [authorized, setAuthorized] = useState(false);

  const [medios, setMedios] = useState([]);
  const [nuevoMedio, setNuevoMedio] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [medioSeleccionado, setMedioSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  // ✅ Debe quedar así: /super-dashboard/admin/dashboard/configuracion
  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards locales anti-loop UI (breadcrumb) — NO red
  const breadcrumbBootRef = useRef(false);

  // ───────────────────────────────
  // Breadcrumb dorado (sin loop + sin hardcode /admin)
  // ───────────────────────────────
  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Medios de Pago";
    const needs = !last || last.label !== label;

    breadcrumbBootRef.current = true;

    if (needs) {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: "Configuración", to: configPath },
            { label, to: currentPath },
          ],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath]);

  // ───────────────────────────────
  // Auth primero -> recién ahí se permite red
  // (si quieres SOLO rol 1, cambia [1,3] -> [1])
  // ───────────────────────────────
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (!decoded?.exp || decoded.exp <= now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, { replace: true });
        return;
      }

      setAuthorized(true);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, dashboardBase]);

  // ───────────────────────────────
  // Utils
  // ───────────────────────────────
  const sanitizar = (texto) =>
    String(texto || "")
      .replace(/[<>;"']/g, "")
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, "")
      .trim();

  const flash = useCallback((okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);
    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2500);
  }, []);

  const toArray = (resp) => {
    const d = resp?.data ?? resp ?? [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    if (d?.ok && Array.isArray(d.data)) return d.data;
    return [];
  };

  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const isNetworkDown = (err) => {
    const msg = String(err?.message || "").toLowerCase();
    return (
      msg.includes("err_connection_refused") ||
      msg.includes("socket_not_connected") ||
      msg.includes("network error") ||
      msg.includes("failed to fetch") ||
      msg.includes("connection refused") ||
      msg.includes("ecconnrefused")
    );
  };

  const prettyError = (err, fallback) => {
    const st = getErrStatus(err);
    const data = getErrData(err);
    const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

    if (isNetworkDown(err)) {
      return "🛑 No hay conexión con el backend. Revisa si está levantado (127.0.0.1:8000).";
    }
    if (st === 401 || st === 403) return "🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.";
    if (st === 400) return backendMsg || "⚠️ Datos inválidos. Revisa el nombre.";
    if (st === 404) return backendMsg || "⚠️ No encontrado (puede que ya haya sido eliminado).";

    if (st === 409) {
      if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
        return "⚠️ No se puede eliminar: este medio de pago está en uso.";
      }
      if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
        return "⚠️ Ya existe un medio de pago con ese nombre.";
      }
      return backendMsg || "⚠️ Conflicto: no se pudo completar la acción.";
    }

    if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
      return "⚠️ No se puede eliminar: este medio de pago está en uso.";
    }
    if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
      return "⚠️ Ya existe un medio de pago con ese nombre.";
    }

    return backendMsg || fallback || "❌ Error inesperado.";
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  /**
   * =========================================================
   *  ✅ Resolver endpoint SOLO UNA VEZ (y cachearlo)
   *  - Máximo 2 candidatos reales (NO 8, NO spam)
   *  - Cada candidato prueba con y sin slash final (máx 2)
   * =========================================================
   */
  const resolveBaseEndpoint = useCallback(async (signal) => {
    if (__resolvedBase) return __resolvedBase;

    const candidates = ["/medio-pago", "/medios-pago"]; // ← lo normal en tu backend
    let lastErr = null;

    for (const base of candidates) {
      for (const u of variants(base)) {
        try {
          const res = await api.get(u, { signal });
          if (signal?.aborted) return "";
          __resolvedBase = normalizeBase(u);
          // Seteamos lista inmediatamente (primer fetch ya trae data)
          setMedios(toArray(res));
          return __resolvedBase;
        } catch (e) {
          lastErr = e;
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e;     // auth: no seguir probando
          if (isNetworkDown(e)) throw e;             // red: no seguir probando
          // 404/500: probar siguiente variante/candidato
        }
      }
    }

    throw lastErr || new Error("NO_ENDPOINT_MATCHED");
  }, []);

  /**
   * =========================================================
   *  ✅ Fetch listado (anti “backend loco”)
   *  - Dispara 1 vez (aunque StrictMode remonte)
   *  - Reutiliza endpoint resuelto
   * =========================================================
   */
  const fetchMedios = useCallback(
    async (signal) => {
      if (!authorized) return;

      return once("mediosPago:bootstrap", async () => {
        setError("");

        // Resuelve endpoint + ya deja medios cargados si el primer GET funcionó
        const base = await resolveBaseEndpoint(signal);
        if (!base || signal?.aborted) return;

        // Si resolveBaseEndpoint ya seteo medios con el GET exitoso,
        // igual revalidamos solo 1 vez (y no spam) por consistencia:
        const res = await api.get(base, { signal });
        if (signal?.aborted) return;
        setMedios(toArray(res));
      });
    },
    [authorized, resolveBaseEndpoint]
  );

  useEffect(() => {
    if (!authorized) return;

    const abort = new AbortController();
    fetchMedios(abort.signal).catch((err) => {
      if (abort.signal.aborted) return;

      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ Error al obtener medios de pago"));
    });

    return () => abort.abort();
  }, [authorized, fetchMedios, handleAuth]);

  // Base final para mutaciones
  const baseEndpoint = __resolvedBase || "/medio-pago";

  // Mutaciones con tolerancia de slash final (máx 2 intentos)
  const postVar = useCallback(async (url, payload) => {
    let lastErr = null;
    for (const u of variants(url)) {
      try {
        return await api.post(u, payload);
      } catch (e) {
        lastErr = e;
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
        if (isNetworkDown(e)) throw e;
      }
    }
    throw lastErr;
  }, []);

  const putVar = useCallback(async (url, payload) => {
    let lastErr = null;
    for (const u of variants(url)) {
      try {
        return await api.put(u, payload);
      } catch (e) {
        lastErr = e;
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
        if (isNetworkDown(e)) throw e;
      }
    }
    throw lastErr;
  }, []);

  const delVar = useCallback(async (url) => {
    let lastErr = null;
    for (const u of variants(url)) {
      try {
        return await api.delete(u);
      } catch (e) {
        lastErr = e;
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
        if (isNetworkDown(e)) throw e;
      }
    }
    throw lastErr;
  }, []);

  // ───────────────────────────────
  // CRUD
  // ───────────────────────────────
  const refreshAfterMutation = useCallback(async () => {
    // Re-fetch “controlado”: no crea tormenta
    // Forzamos una llave distinta para permitir un refresh real
    return once("mediosPago:refresh", async () => {
      const res = await api.get(baseEndpoint);
      setMedios(toArray(res));
    });
  }, [baseEndpoint]);

  const crearMedio = async () => {
    const nombre = sanitizar(nuevoMedio);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await postVar(baseEndpoint, { nombre });
      setNuevoMedio("");
      flash("✅ Medio de pago creado");
      await refreshAfterMutation();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo crear el medio de pago."));
    } finally {
      setBusy(false);
    }
  };

  const actualizarMedio = async () => {
    if (!editarId) return setError("⚠️ Debes seleccionar un medio.");
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await putVar(`${baseEndpoint}/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre("");
      flash("✅ Medio de pago actualizado");
      await refreshAfterMutation();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo actualizar el medio de pago."));
    } finally {
      setBusy(false);
    }
  };

  const confirmarEliminacion = async () => {
    if (!medioSeleccionado?.id) {
      setMostrarModal(false);
      return;
    }

    setBusy(true);
    try {
      await delVar(`${baseEndpoint}/${medioSeleccionado.id}`);
      flash("✅ Medio de pago eliminado");
      await refreshAfterMutation();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo eliminar el medio de pago."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setMedioSeleccionado(null);
    }
  };

  // ───────────────────────────────
  // UI (no tocamos paleta)
  // ───────────────────────────────
  const fondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjeta = darkMode ? "bg-[#1f2937] border-gray-700" : "bg-white border-gray-200";

  const inputBase =
    (darkMode
      ? "bg-[#111827] text-white border border-white/10 placeholder-white/40"
      : "bg-white text-black border border-black/10 placeholder-black/40") +
    " w-full p-2 rounded-xl";

  const selectBase = inputBase + " appearance-none";

  const btnBase =
    "mt-4 w-full py-2 rounded-xl font-bold transition disabled:opacity-60 disabled:cursor-not-allowed text-white";

  const btnPrimaryStyle = busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: ACCENT };
  const btnWarnStyle = busy || !editarId ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#f59e0b" };
  const btnDangerStyle =
    !medioSeleccionado || busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#dc2626" };

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Gestión de Medios de Pago</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listado */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">📋 Listado</h3>
          {medios.length === 0 ? (
            <p className="opacity-60">Sin medios registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {medios.map((m) => (
                <li key={m.id} className="font-semibold opacity-90">
                  {m.nombre ?? m.descripcion ?? `#${m.id}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Crear */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">➕ Crear</h3>
          <input
            type="text"
            value={nuevoMedio}
            onChange={(e) => {
              setNuevoMedio(e.target.value);
              setError("");
              setMensaje("");
            }}
            placeholder="Nombre medio"
            className={inputBase}
            disabled={busy}
          />
          <button
            onClick={crearMedio}
            disabled={busy}
            className={btnBase}
            style={btnPrimaryStyle}
            title={busy ? "Procesando..." : "Crear medio"}
          >
            {busy ? "Procesando..." : "Guardar"}
          </button>
        </div>

        {/* Editar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">✏️ Editar</h3>

          <select
            value={editarId || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              setEditarId(id || null);
              const sel = medios.find((x) => Number(x.id) === id);
              setEditarNombre(sel?.nombre ?? sel?.descripcion ?? "");
              setError("");
              setMensaje("");
            }}
            className={`${selectBase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona medio</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre ?? m.descripcion ?? `#${m.id}`}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={editarNombre}
            onChange={(e) => {
              setEditarNombre(e.target.value);
              setError("");
              setMensaje("");
            }}
            placeholder="Nuevo nombre"
            className={inputBase}
            disabled={busy || !editarId}
          />

          <button
            onClick={actualizarMedio}
            disabled={busy || !editarId}
            className={btnBase}
            style={btnWarnStyle}
            title={!editarId ? "Selecciona un medio" : busy ? "Procesando..." : "Actualizar"}
          >
            {busy ? "Procesando..." : "Actualizar"}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">🗑️ Eliminar</h3>

          <select
            value={medioSeleccionado?.id || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const sel = medios.find((x) => Number(x.id) === id);
              setMedioSeleccionado(sel || null);
              setError("");
              setMensaje("");
            }}
            className={selectBase}
            disabled={busy}
          >
            <option value="">Selecciona medio</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre ?? m.descripcion ?? `#${m.id}`}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              if (busy || !medioSeleccionado) return;
              setMostrarModal(true);
            }}
            disabled={!medioSeleccionado || busy}
            className={btnBase}
            style={btnDangerStyle}
            title={!medioSeleccionado ? "Selecciona un medio" : busy ? "Procesando..." : "Eliminar"}
          >
            {busy ? "Procesando..." : "Eliminar"}
          </button>
        </div>
      </div>

      {(mensaje || error) && (
        <p className={`text-center mt-6 font-bold ${mensaje ? "text-green-500" : "text-red-500"}`}>
          {mensaje || error}
        </p>
      )}

      <Modal visible={mostrarModal} onConfirm={confirmarEliminacion} onCancel={() => setMostrarModal(false)} />
    </div>
  );
}
