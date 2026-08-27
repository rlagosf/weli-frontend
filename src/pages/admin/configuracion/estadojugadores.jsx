// src/pages/admin/config/estadojugadores.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =======================
   🎨 Conjunto X
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
    return p.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards anti-loop
  const breadcrumbBootRef = useRef(false);
  const resolvedBaseRef = useRef(""); // endpoint resuelto (sin slash final)
  const fetchBootRef = useRef(false);
  const fetchInFlightRef = useRef(false);

  /* ───────────────────────────────
     Breadcrumb (sin loop + sin hardcode /admin)
  ─────────────────────────────── */
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

  /* ───────────────────────────────
     Auth primero -> recién ahí se permite fetch
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

  /* ───────────────────────────────
     Endpoint candidates (✅ incluye /estados)
  ─────────────────────────────── */
  const ENDPOINTS = useMemo(
    () => [
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

  /* ───────────────────────────────
     Fetch: 1 sola vez, solo cuando authorized=true
  ─────────────────────────────── */
  const fetchDatos = useCallback(
    async (signal) => {
      if (!authorized) return;
      if (fetchInFlightRef.current) return;

      fetchInFlightRef.current = true;
      setError("");

      try {
        // 1) si ya está resuelto, pega directo ahí
        if (resolvedBaseRef.current) {
          const base = resolvedBaseRef.current;
          for (const u of variants(base)) {
            const res = await api.get(u, { signal });
            if (signal?.aborted) return;
            setEstados(toArray(res));
            return;
          }
        }

        // 2) resolver SOLO esta vez
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

              // auth/network -> corta de inmediato
              if (st === 401 || st === 403) throw e;
              if (isNetworkDown(e)) throw e;
              // 404/500/etc -> sigue probando
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

  /* ───────────────────────────────
     Mutaciones (usan endpoint resuelto; si aún no, usan /estados)
  ─────────────────────────────── */
  const baseEndpoint = useMemo(() => resolvedBaseRef.current || "/estados", [authorized]);

  const postVar = useCallback(async (url, payload) => {
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
      await fetchDatos(); // refresca
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
      !seleccionado || busy
        ? { backgroundColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)" }
        : { backgroundColor: "#dc2626", color: "#fff" };

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

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
      (darkMode ? "bg-black/20 border-white/15 text-white/75" : "bg-white/60 border-ra-marron/15 text-ra-marron/70");

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
  }, [darkMode, busy, editarId, seleccionado]);

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* Header centrado tipo SuperDashboard */}
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>Estados de Jugadores</h1>
        <p className={`text-sm mt-2 ${ui.subText}`}>Administra el catálogo de estados (crear, editar, eliminar).</p>
      </header>

      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado (2 columnas en desktop) */}
          <section className={`${ui.card} p-6 lg:col-span-2`}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className={`text-lg font-extrabold ${ui.sectionTitle}`}>📋 Listado</h2>
              <span className={ui.pill}>
                {estados.length} estado{estados.length !== 1 ? "s" : ""}
              </span>
            </div>

            {estados.length === 0 ? (
              <p className={ui.subText}>Sin estados registrados.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto pr-1">
                {estados.map((e) => {
                  const nombre = e?.nombre ?? e?.descripcion ?? `#${e?.id}`;
                  return (
                    <div key={e.id} className={ui.listItem}>
                      <div className="min-w-0">
                        <p className="font-extrabold truncate">{nombre}</p>
                        <p className={ui.subText}>ID: {e.id}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg text-xs font-extrabold border transition hover:brightness-110"
                          style={{
                            borderColor: darkMode ? "rgba(255,255,255,0.18)" : "rgba(109,88,41,0.18)",
                            background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
                          }}
                          onClick={() => {
                            setError("");
                            setMensaje("");
                            setEditarId(Number(e.id));
                            setEditarNombre(String(e.nombre ?? e.descripcion ?? ""));
                            setSeleccionado(e); // UX: también deja listo para eliminar
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
                value={nuevo}
                onChange={(e) => {
                  setNuevo(e.target.value);
                  setError("");
                  setMensaje("");
                }}
                placeholder="Nombre (mín. 3)"
                className={ui.input}
                disabled={busy}
              />
              <button
                type="button"
                onClick={crear}
                disabled={busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnPrimaryStyle}
                title={busy ? "Procesando..." : "Crear estado"}
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
                  const found = estados.find((x) => Number(x.id) === id);
                  setEditarNombre(found?.nombre ?? found?.descripcion ?? "");
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
                disabled={busy}
              >
                <option value="">Selecciona estado</option>
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
                placeholder="Nuevo nombre (mín. 3)"
                className={`${ui.input} mt-3`}
                disabled={busy || !editarId}
              />

              <button
                type="button"
                onClick={actualizar}
                disabled={busy || !editarId}
                className={`${ui.btn} mt-3`}
                style={ui.btnWarnStyle}
                title={!editarId ? "Selecciona un estado primero" : busy ? "Procesando..." : "Actualizar"}
              >
                {busy ? "Procesando..." : "Actualizar"}
              </button>
            </section>

            {/* Eliminar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>🗑️ Eliminar</h2>

              <select
                value={seleccionado?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const sel = estados.find((x) => Number(x.id) === id);
                  setSeleccionado(sel || null);
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
                disabled={busy}
              >
                <option value="">Selecciona estado</option>
                {estados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre ?? e.descripcion ?? `#${e.id}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (busy || !seleccionado) return;
                  setMostrarModal(true);
                }}
                disabled={!seleccionado || busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnDangerStyle}
                title={!seleccionado ? "Selecciona un estado" : busy ? "Procesando..." : "Eliminar"}
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

        <Modal visible={mostrarModal} onConfirm={eliminar} onCancel={() => setMostrarModal(false)} />
      </main>
    </div>
  );
}
