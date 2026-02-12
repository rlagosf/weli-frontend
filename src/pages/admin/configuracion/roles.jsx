// src/pages/admin/config/Roles.jsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

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

export default function Roles() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [roles, setRoles] = useState([]);
  const [nuevoRol, setNuevoRol] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [busy, setBusy] = useState(false);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  // Guards
  const breadcrumbBootRef = useRef(false);

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

  // 🧭 Breadcrumb (ANTI-LOOP) — respeta ruta real
  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Roles";
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

  // ✅ error normalizado por tu api.js
  const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
  const getErrData = (err) => err?.data ?? err?.response?.data ?? null;

  const prettyError = (err, fallback) => {
    const st = getErrStatus(err);
    const data = getErrData(err);
    const backendMsg = data?.message || data?.detail || data?.error || err?.message || null;

    if (st === 401 || st === 403) return "🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.";
    if (st === 400) return backendMsg || "⚠️ Datos inválidos. Revisa el nombre del rol.";
    if (st === 404) return backendMsg || "⚠️ Rol no encontrado (puede que ya haya sido eliminado).";

    if (st === 409) {
      if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
        return "⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.";
      }
      if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
        return "⚠️ Ya existe un rol con ese nombre.";
      }
      return backendMsg || "⚠️ Conflicto: no se pudo completar la acción.";
    }

    if (data?.errno === 1451 || data?.code === "ER_ROW_IS_REFERENCED_2") {
      return "⚠️ No se puede eliminar: este rol está asignado a uno o más usuarios.";
    }
    if (data?.errno === 1062 || data?.code === "ER_DUP_ENTRY") {
      return "⚠️ Ya existe un rol con ese nombre.";
    }

    return backendMsg || fallback || "❌ Error inesperado.";
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  // 🔐 Auth: SOLO rol 3 (superadmin)
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || decoded.exp <= now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ aquí el corte: solo 3 puede entrar
      if (rol !== 3) {
        navigate(configPath, { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, configPath]);

  // ✅ apiOps estable (NO cambia por render)
  const apiOps = useMemo(() => {
    const withVariants = (fn) => async (base, ...args) => {
      const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];
      let lastErr = null;

      for (const u of urls) {
        try {
          return await fn(u, ...args);
        } catch (e) {
          lastErr = e;
          const st = getErrStatus(e);
          if (st === 401 || st === 403) throw e; // corta: auth primero
        }
      }
      throw lastErr || new Error("ENDPOINT_VARIANTS_FAILED");
    };

    return {
      getVar: withVariants((u, c) => api.get(u, c)),
      postVar: withVariants((u, p, c) => api.post(u, p, c)),
      putVar: withVariants((u, p, c) => api.put(u, p, c)),
      delVar: withVariants((u, c) => api.delete(u, c)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toArray = (resp) => {
    const d = resp?.data ?? resp;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    if (d?.ok && Array.isArray(d.data)) return d.data;
    return [];
  };

  // ───────── Fetch (sin loop) ─────────
  const fetchRoles = useCallback(
    async (signal) => {
      try {
        const res = await apiOps.getVar("/roles", { signal });
        if (signal?.aborted) return;
        setRoles(toArray(res));
      } catch (err) {
        if (signal?.aborted) return;
        const st = getErrStatus(err);
        if (st === 401 || st === 403) return handleAuth();
        setError(prettyError(err, "❌ Error al obtener roles"));
      }
    },
    [apiOps, handleAuth]
  );

  useEffect(() => {
    const abort = new AbortController();
    fetchRoles(abort.signal);
    return () => abort.abort();
  }, [fetchRoles]);

  const flash = useCallback((okMsg, errMsg) => {
    if (okMsg) setMensaje(okMsg);
    if (errMsg) setError(errMsg);
    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2500);
  }, []);

  const sanitizar = (texto) =>
    String(texto || "")
      .replace(/[<>;"']/g, "")
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, "")
      .trim();

  // ───────── Crear ─────────
  const crearRol = async () => {
    const nombre = sanitizar(nuevoRol);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await apiOps.postVar("/roles", { nombre });
      setNuevoRol("");
      flash("✅ Rol creado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo crear el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarRol = async () => {
    if (!editarId) return setError("⚠️ Debes seleccionar un rol.");
    const nombre = sanitizar(editarNombre);
    if (nombre.length < 3) return setError("⚠️ El nombre debe tener al menos 3 caracteres.");

    setBusy(true);
    try {
      await apiOps.putVar(`/roles/${editarId}`, { nombre });
      setEditarId(null);
      setEditarNombre("");
      flash("✅ Rol actualizado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo actualizar el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!rolSeleccionado?.id) return setMostrarModal(false);

    setBusy(true);
    try {
      await apiOps.delVar(`/roles/${rolSeleccionado.id}`);
      flash("✅ Rol eliminado");
      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);
      if (st === 401 || st === 403) return handleAuth();
      setError(prettyError(err, "❌ No se pudo eliminar el rol."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setRolSeleccionado(null);
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
      !rolSeleccionado || busy
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
  }, [darkMode, busy, editarId, rolSeleccionado]);

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      {/* Header tipo SuperDashboard */}
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>Roles</h1>
        <p className={`text-sm mt-2 ${ui.subText}`}>
          Solo SuperAdmin (rol 3). Crea, edita o elimina roles del sistema.
        </p>
      </header>

      <main className="px-6 pb-20">
        <div className="max-w-6xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado (2 columnas en desktop) */}
          <section className={`${ui.card} p-6 lg:col-span-2`}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className={`text-lg font-extrabold ${ui.sectionTitle}`}>📋 Listado</h2>
              <span className={ui.pill}>
                {roles.length} rol{roles.length !== 1 ? "es" : ""}
              </span>
            </div>

            {roles.length === 0 ? (
              <p className={ui.subText}>Sin roles registrados.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto pr-1">
                {roles.map((r) => {
                  const nombre = r?.nombre ?? r?.descripcion ?? `#${r?.id}`;
                  return (
                    <div key={r.id} className={ui.listItem}>
                      <div className="min-w-0">
                        <p className="font-extrabold truncate">{nombre}</p>
                        <p className={ui.subText}>ID: {r.id}</p>
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
                            setEditarId(Number(r.id));
                            setEditarNombre(String(r.nombre ?? r.descripcion ?? ""));
                            setRolSeleccionado(r);
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
                value={nuevoRol}
                onChange={(e) => {
                  setNuevoRol(e.target.value);
                  setError("");
                  setMensaje("");
                }}
                placeholder="Nombre (mín. 3)"
                className={ui.input}
                disabled={busy}
              />
              <button
                type="button"
                onClick={crearRol}
                disabled={busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnPrimaryStyle}
                title={busy ? "Procesando..." : "Crear rol"}
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
                  const sel = roles.find((x) => Number(x.id) === id);
                  setEditarNombre(sel?.nombre ?? sel?.descripcion ?? "");
                  setRolSeleccionado(sel || null);
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
                disabled={busy}
              >
                <option value="">Selecciona</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre ?? r.descripcion ?? `#${r.id}`}
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
                onClick={actualizarRol}
                disabled={busy || !editarId}
                className={`${ui.btn} mt-3`}
                style={ui.btnWarnStyle}
                title={!editarId ? "Selecciona un rol primero" : busy ? "Procesando..." : "Actualizar"}
              >
                {busy ? "Procesando..." : "Actualizar"}
              </button>
            </section>

            {/* Eliminar */}
            <section className={`${ui.card} p-6`}>
              <h2 className={`text-lg font-extrabold mb-3 ${ui.sectionTitle}`}>🗑️ Eliminar</h2>

              <select
                value={rolSeleccionado?.id || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const sel = roles.find((x) => Number(x.id) === id);
                  setRolSeleccionado(sel || null);
                  setError("");
                  setMensaje("");
                }}
                className={ui.select}
                disabled={busy}
              >
                <option value="">Selecciona</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre ?? r.descripcion ?? `#${r.id}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (busy || !rolSeleccionado) return;
                  setMostrarModal(true);
                }}
                disabled={!rolSeleccionado || busy}
                className={`${ui.btn} mt-3`}
                style={ui.btnDangerStyle}
                title={!rolSeleccionado ? "Selecciona un rol" : busy ? "Procesando..." : "Eliminar"}
              >
                {busy ? "Procesando..." : "Eliminar"}
              </button>
            </section>
          </aside>
        </div>

        {/* Alerts */}
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
