// src/pages/admin/config/MediosPago.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

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

const normalizeBase = (u) =>
  String(u || "").endsWith("/") ? String(u).slice(0, -1) : String(u);

const variants = (base) => {
  const b = String(base || "");
  return b.endsWith("/") ? [b, b.slice(0, -1)] : [b, `${b}/`];
};

/* =======================
   🎨 Conjunto X (SuperDashboard vibe)
======================= */
const PALETTE_X = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
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

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards locales anti-loop UI (breadcrumb) — NO red
  const breadcrumbBootRef = useRef(false);

  /* ───────────────────────────────
     Breadcrumb dorado (sin loop + sin hardcode /admin)
  ─────────────────────────────── */
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

  /* ───────────────────────────────
     Auth primero -> recién ahí se permite red
     (si quieres SOLO rol 1, cambia [1,3] -> [1])
  ─────────────────────────────── */
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

  /* ───────────────────────────────
     Utils
  ─────────────────────────────── */
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
   *  - Máximo 2 candidatos reales (NO spam)
   *  - Cada candidato prueba con y sin slash final (máx 2)
   * =========================================================
   */
  const resolveBaseEndpoint = useCallback(async (signal) => {
    if (__resolvedBase) return __resolvedBase;

    const candidates = ["/medio-pago", "/medios-pago"];
    let lastErr = null;

    for (const base of candidates) {
      for (const u of variants(base)) {
        try {
          const res = await api.get(u, { signal });
          if (signal?.aborted) return "";
          __resolvedBase = normalizeBase(u);

          // Primer GET ya trae data
          setMedios(toArray(res));
          return __resolvedBase;
        } catch (e) {
          lastErr = e;
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e;
          if (isNetworkDown(e)) throw e;
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

        const base = await resolveBaseEndpoint(signal);
        if (!base || signal?.aborted) return;

        // Revalidación controlada (1 vez)
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

  // Re-fetch controlado después de mutaciones
  const refreshAfterMutation = useCallback(async () => {
    return once("mediosPago:refresh", async () => {
      const res = await api.get(baseEndpoint);
      setMedios(toArray(res));
    });
  }, [baseEndpoint]);

  /* ───────────────────────────────
     CRUD
  ─────────────────────────────── */
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

  /* =======================
     UI estilo SuperDashboard
  ======================= */
  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "rounded-2xl border shadow-lg transition " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const sectionTitle = darkMode ? "text-white/90" : "text-ra-marron";

    const input =
      "w-full p-2 rounded-xl outline-none border text-sm " +
      "focus:ring-2 focus:ring-[rgba(170,80,19,0.25)] focus:border-[rgba(170,80,19,0.35)] " +
      (darkMode
        ? "bg-black/25 text-white border-white/10 placeholder-white/45"
        : "bg-white/70 text-ra-marron border-ra-marron/15 placeholder-ra-marron/45");

    const select = input + " appearance-none";

    const btn =
      "w-full py-2 rounded-xl font-extrabold transition shadow-sm " +
      "disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]";

    const btnPrimaryStyle = busy
      ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
      : {
          background: `linear-gradient(135deg, ${PALETTE_X.copper}, ${PALETTE_X.terracotta})`,
          color: "#fff",
        };

    const btnWarnStyle =
      busy || !editarId
        ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
        : { backgroundColor: "#f59e0b", color: "#1a1208" };

    const btnDangerStyle =
      !medioSeleccionado || busy
        ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
        : { backgroundColor: "#dc2626", color: "#fff" };

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-red-200/20 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-700");

    const ok =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-emerald-200/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-900");

    const listItem =
      "flex items-center justify-between gap-3 py-2 border-b last:border-b-0 " +
      (darkMode ? "border-white/10" : "border-ra-marron/12");

    const pill =
      "inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border " +
      (darkMode
        ? "bg-black/20 border-white/15 text-white/75"
        : "bg-white/60 border-ra-marron/15 text-ra-marron/70");

    return {
      shell,
      titleMain,
      subText,
      card,
      sectionTitle,
      input,
      select,
      btn,
      btnPrimaryStyle,
      btnWarnStyle,
      btnDangerStyle,
      danger,
      ok,
      listItem,
      pill,
    };
  }, [darkMode, busy, editarId, medioSeleccionado]);

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* Header tipo SuperDashboard */}
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
          Medios de Pago
        </h1>
        <p className={`text-sm mt-2 ${ui.subText}`}>
          Administra el catálogo de medios de pago (crear, editar, eliminar).
        </p>
      </header>

      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado (2 columnas en desktop) */}
          <section className={`${ui.card} p-6 lg:col-span-2`}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className={`text-lg font-extrabold ${ui.sectionTitle}`}>📋 Listado</h2>
              <span className={ui.pill}>
                {medios.length} medio{medios.length !== 1 ? "s" : ""}
              </span>
            </div>

            {medios.length === 0 ? (
              <p className={ui.subText}>Sin medios registrados.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto pr-1">
                {medios.map((m) => {
                  const nombre = m?.nombre ?? m?.descripcion ?? `#${m?.id}`;
                  return (
                    <div key={m.id} className={ui.listItem}>
                      <div className="min-w-0">
                        <p className="font-extrabold truncate">{nombre}</p>
                        <p className={ui.subText}>ID: {m.id}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg text-xs font-extrabold border transition hover:brightness-110"
                          style={{
                            borderColor: darkMode
                              ? "rgba(255,255,255,0.18)"
                              : "rgba(109,88,41,0.18)",
                            background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
                          }}
                          onClick={() => {
                            setError("");
                            setMensaje("");
                            setEditarId(Number(m.id));
                            setEditarNombre(String(m.nombre ?? m.descripcion ?? ""));
                            setMedioSeleccionado(m); // UX: listo para eliminar también
                          }}
                          disabled={busy}
                          title="Seleccionar"
                        >
                          Seleccionar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Acciones */}
          <aside className="lg:col-span-1 space-y-6">
            {/* Crear */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>➕ Crear</h2>
              <input
                value={nuevoMedio}
                onChange={(e) => {
                  setNuevoMedio(e.target.value);
                  setError("");
                  setMensaje("");
                }}
                placeholder="Nombre (mín. 3)"
                className={ui.input}
                disabled={busy}
              />
              <button
                type="button"
                onClick={crearMedio}
                disabled={busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnPrimaryStyle}
                title={busy ? "Procesando..." : "Crear medio"}
              >
                {busy ? "Procesando..." : "Guardar"}
              </button>
            </section>

            {/* Editar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>✏️ Editar</h2>

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
                className={ui.select}
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
                value={editarNombre}
                onChange={(e) => {
                  setEditarNombre(e.target.value);
                  setError("");
                  setMensaje("");
                }}
                placeholder="Nuevo nombre (mín. 3)"
                className={`${ui.input} mt-3`}
                disabled={busy || !editarId}
              />

              <button
                type="button"
                onClick={actualizarMedio}
                disabled={busy || !editarId}
                className={`${ui.btn} mt-3`}
                style={ui.btnWarnStyle}
                title={!editarId ? "Selecciona un medio primero" : busy ? "Procesando..." : "Actualizar"}
              >
                {busy ? "Procesando..." : "Actualizar"}
              </button>
            </section>

            {/* Eliminar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>🗑️ Eliminar</h2>

              <select
                value={medioSeleccionado?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const sel = medios.find((x) => Number(x.id) === id);
                  setMedioSeleccionado(sel || null);
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
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
                type="button"
                onClick={() => {
                  if (busy || !medioSeleccionado) return;
                  setMostrarModal(true);
                }}
                disabled={!medioSeleccionado || busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnDangerStyle}
                title={!medioSeleccionado ? "Selecciona un medio" : busy ? "Procesando..." : "Eliminar"}
              >
                {busy ? "Procesando..." : "Eliminar"}
              </button>
            </section>
          </aside>
        </div>

        {/* Mensajes */}
        <div className="max-w-6xl mx-auto mt-6 space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}
          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        <Modal
          visible={mostrarModal}
          onConfirm={confirmarEliminacion}
          onCancel={() => setMostrarModal(false)}
        />
      </main>
    </div>
  );
}
