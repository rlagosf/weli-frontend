// src/pages/admin/config/estadojugadores.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

const ACCENT = "#e82d89";

export default function EstadoJugadores() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [authorized, setAuthorized] = useState(false);

  const [estados, setEstados] = useState([]);
  const [nuevo, setNuevo] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards anti-loop
  const breadcrumbBootRef = useRef(false);
  const resolvedBaseRef = useRef(""); // endpoint resuelto (sin slash final)
  const fetchBootRef = useRef(false);
  const fetchInFlightRef = useRef(false);

  // ───────────────────────────────
  // Breadcrumb (sin loop + sin hardcode /admin)
  // ───────────────────────────────
  const abreviar = useCallback((txt) => {
    if (!txt) return "";
    const isMobile = typeof window !== "undefined" ? window.innerWidth <= 640 : false;
    if (!isMobile) return txt;
    if (txt.length <= 14) return txt;
    return txt
      .split(" ")
      .map((p) => (p.length > 6 ? p.slice(0, 6) + "." : p))
      .join(" ");
  }, []);

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];
    const label = "Estados de Jugadores";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            { label: abreviar("Configuración"), to: configPath },
            { label: abreviar(label), to: currentPath },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath, abreviar]);

  // ───────────────────────────────
  // Auth primero -> recién ahí se permite fetch
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

      // ✅ Si quieres SOLO admin: cambia a (rol !== 1)
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
    const d = resp?.data ?? resp;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
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
        return "⚠️ No se puede eliminar: el estado está en uso por otros registros.";
      }
      if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
        return "⚠️ Ya existe un estado con ese nombre.";
      }
      return backendMsg || "⚠️ Conflicto: no se pudo completar la acción.";
    }

    if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
      return "⚠️ No se puede eliminar: el estado está en uso por otros registros.";
    }
    if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
      return "⚠️ Ya existe un estado con ese nombre.";
    }

    return backendMsg || fallback || "❌ Error inesperado.";
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  // ───────────────────────────────
  // Endpoint candidates (✅ incluye /estados)
  // ───────────────────────────────
  const ENDPOINTS = useMemo(
    () => [
      "/estados",
      "/estado",
      "/estados-jugador",
      "/estados-jugadores",
      "/estado-jugador",
      "/estado-jugadores",
      "/estados_jugador",
      "/estados_jugadores",
      "/estado_jugador",
      "/estado_jugadores",
    ],
    []
  );

  const normalizeBase = (u) => (u.endsWith("/") ? u.slice(0, -1) : u);
  const variants = (base) => (base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`]);

  // ───────────────────────────────
  // Fetch: 1 sola vez, solo cuando authorized=true
  // ───────────────────────────────
  const fetchDatos = useCallback(
    async (signal) => {
      if (!authorized) return;
      if (fetchInFlightRef.current) return;

      fetchInFlightRef.current = true;
      setError("");

      try {
        // 1) si ya está resuelto, pega directo ahí (sin probar nada)
        if (resolvedBaseRef.current) {
          const base = resolvedBaseRef.current;
          for (const u of variants(base)) {
            const res = await api.get(u, { signal });
            if (signal?.aborted) return;
            setEstados(toArray(res));
            return;
          }
        }

        // 2) resolver SOLO esta vez: prueba secuencial y se queda con el que funcione
        let lastErr = null;
        for (const base of ENDPOINTS) {
          for (const u of variants(base)) {
            try {
              const res = await api.get(u, { signal });
              if (signal?.aborted) return;

              resolvedBaseRef.current = normalizeBase(u); // ✅ queda fijo
              setEstados(toArray(res));
              return;
            } catch (e) {
              lastErr = e;
              const st = getErrStatus(e);

              // auth/network -> corta de inmediato (no prueba mil cosas)
              if (st === 401 || st === 403) throw e;
              if (isNetworkDown(e)) throw e;

              // 404/500/etc -> sigue probando el siguiente
            }
          }
        }

        throw lastErr || new Error("NO_ENDPOINT_MATCHED");
      } catch (err) {
        if (signal?.aborted) return;

        const st = getErrStatus(err);
        if (st === 401 || st === 403) return handleAuth();

        setError(prettyError(err, "❌ No se pudieron obtener los estados."));
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [authorized, ENDPOINTS, handleAuth]
  );

  useEffect(() => {
    if (!authorized) return;
    if (fetchBootRef.current) return;
    fetchBootRef.current = true;

    const abort = new AbortController();
    fetchDatos(abort.signal);
    return () => abort.abort();
  }, [authorized, fetchDatos]);

  // ───────────────────────────────
  // Mutaciones (usan endpoint resuelto; si aún no, usan /estados)
  // ───────────────────────────────
  const baseEndpoint = useMemo(() => resolvedBaseRef.current || "/estados", [authorized]);

  const postVar = useCallback(async (url, payload) => {
    // tolera slash final una sola vez, no en loop infinito
    const candidates = variants(url);
    let lastErr = null;
    for (const u of candidates) {
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
    const candidates = variants(url);
    let lastErr = null;
    for (const u of candidates) {
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
    const candidates = variants(url);
    let lastErr = null;
    for (const u of candidates) {
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

  const crear = async () => {
    const nombre = sanitizar(nuevo);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await postVar(baseEndpoint, { nombre });
      setNuevo("");
      flash("✅ Estado creado");
      await fetchDatos(); // refresca (no se vuelve loco por guard/inFlight)
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo crear el estado."));
    } finally {
      setBusy(false);
    }
  };

  const actualizar = async () => {
    if (!editarId) return setError("⚠️ Debes seleccionar un estado.");
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await putVar(`${baseEndpoint}/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre("");
      flash("✅ Estado actualizado");
      await fetchDatos();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo actualizar el estado."));
    } finally {
      setBusy(false);
    }
  };

  const eliminar = async () => {
    if (!seleccionado?.id) return setMostrarModal(false);

    setBusy(true);
    try {
      await delVar(`${baseEndpoint}/${seleccionado.id}`);
      flash("✅ Estado eliminado");
      await fetchDatos();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo eliminar el estado."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setSeleccionado(null);
    }
  };

  // ───────────────────────────────
  // UI
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

  const btnCreateStyle = busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: ACCENT };
  const btnUpdateStyle = busy || !editarId ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#f59e0b" };
  const btnDeleteStyle = !seleccionado || busy ? { backgroundColor: "#9ca3af" } : { backgroundColor: "#dc2626" };

  return (
    <div className={`${fondo} min-h-screen px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-6 text-center">Estados de Jugadores</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Listado */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">📋 Listado</h3>
          {estados.length === 0 ? (
            <p className="opacity-60">Sin estados registrados.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {estados.map((e) => (
                <li key={e.id} className="font-semibold opacity-90">
                  {e.nombre ?? e.descripcion ?? `#${e.id}`}
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
              setError("");
              setMensaje("");
            }}
            placeholder="Nombre"
            className={inputBase}
            disabled={busy}
          />
          <button onClick={crear} disabled={busy} className={btnBase} style={btnCreateStyle}>
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
              const found = estados.find((x) => Number(x.id) === id);
              setEditarNombre(found?.nombre ?? found?.descripcion ?? "");
              setError("");
              setMensaje("");
            }}
            className={`${selectBase} mb-2`}
            disabled={busy}
          >
            <option value="">Selecciona</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre ?? e.descripcion ?? `#${e.id}`}
              </option>
            ))}
          </select>

          <input
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

          <button onClick={actualizar} disabled={busy || !editarId} className={btnBase} style={btnUpdateStyle}>
            {busy ? "Procesando..." : "Actualizar"}
          </button>
        </div>

        {/* Eliminar */}
        <div className={`${tarjeta} border shadow-md rounded-2xl p-6`}>
          <h3 className="text-lg font-extrabold mb-4">🗑️ Eliminar</h3>
          <select
            value={seleccionado?.id || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const sel = estados.find((x) => Number(x.id) === id);
              setSeleccionado(sel || null);
              setError("");
              setMensaje("");
            }}
            className={selectBase}
            disabled={busy}
          >
            <option value="">Selecciona</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre ?? e.descripcion ?? `#${e.id}`}
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

      <Modal visible={mostrarModal} onConfirm={eliminar} onCancel={() => setMostrarModal(false)} />
    </div>
  );
}
