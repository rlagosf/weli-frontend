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
  const { darkMode, themeTokens } = useTheme();

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

    return p.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
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
            {
              label: abreviar("Configuración"),
              to: configPath,
            },
            {
              label: abreviar(label),
              to: currentPath,
            },
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

    if (st === 401 || st === 403) {
      return "🔒 Sesión expirada o sin permisos. Vuelve a iniciar sesión.";
    }

    if (st === 400) {
      return backendMsg || "⚠️ Datos inválidos. Revisa el nombre del rol.";
    }

    if (st === 404) {
      return backendMsg || "⚠️ Rol no encontrado (puede que ya haya sido eliminado).";
    }

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

    navigate("/login", {
      replace: true,
    });
  }, [navigate]);

  // 🔐 Auth: SOLO rol 3 (superadmin)
  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || decoded.exp <= now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

      const rol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ aquí el corte: solo 3 puede entrar
      if (rol !== 3) {
        navigate(configPath, {
          replace: true,
        });

        return;
      }
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, configPath]);

  // ✅ apiOps estable (NO cambia por render)
  const apiOps = useMemo(() => {
    const withVariants =
      (fn) =>
      async (base, ...args) => {
        const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];

        let lastErr = null;

        for (const u of urls) {
          try {
            return await fn(u, ...args);
          } catch (e) {
            lastErr = e;

            const st = getErrStatus(e);

            if (st === 401 || st === 403) {
              throw e;
            }
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
        const res = await apiOps.getVar("/roles", {
          signal,
        });

        if (signal?.aborted) return;

        setRoles(toArray(res));
      } catch (err) {
        if (signal?.aborted) return;

        const st = getErrStatus(err);

        if (st === 401 || st === 403) {
          return handleAuth();
        }

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
    if (okMsg) {
      setMensaje(okMsg);
    }

    if (errMsg) {
      setError(errMsg);
    }

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

    if (nombre.length < 3) {
      return setError("⚠️ El nombre debe tener al menos 3 caracteres.");
    }

    setBusy(true);

    try {
      await apiOps.postVar("/roles", {
        nombre,
      });

      setNuevoRol("");

      flash("✅ Rol creado");

      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);

      if (st === 401 || st === 403) {
        return handleAuth();
      }

      setError(prettyError(err, "❌ No se pudo crear el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Actualizar ─────────
  const actualizarRol = async () => {
    if (!editarId) {
      return setError("⚠️ Debes seleccionar un rol.");
    }

    const nombre = sanitizar(editarNombre);

    if (nombre.length < 3) {
      return setError("⚠️ El nombre debe tener al menos 3 caracteres.");
    }

    setBusy(true);

    try {
      await apiOps.putVar(`/roles/${editarId}`, {
        nombre,
      });

      setEditarId(null);
      setEditarNombre("");

      flash("✅ Rol actualizado");

      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);

      if (st === 401 || st === 403) {
        return handleAuth();
      }

      setError(prettyError(err, "❌ No se pudo actualizar el rol."));
    } finally {
      setBusy(false);
    }
  };

  // ───────── Eliminar ─────────
  const confirmarEliminacion = async () => {
    if (!rolSeleccionado?.id) {
      return setMostrarModal(false);
    }

    setBusy(true);

    try {
      await apiOps.delVar(`/roles/${rolSeleccionado.id}`);

      flash("✅ Rol eliminado");

      await fetchRoles();
    } catch (err) {
      const st = getErrStatus(err);

      if (st === 401 || st === 403) {
        return handleAuth();
      }

      setError(prettyError(err, "❌ No se pudo eliminar el rol."));
    } finally {
      setBusy(false);
      setMostrarModal(false);
      setRolSeleccionado(null);
    }
  };

  /* =======================================================
     TOKENS DE APARIENCIA
  ======================================================= */

  const tokens = useMemo(() => {
    if (themeTokens) {
      return themeTokens;
    }

    if (darkMode) {
      return {
        surface: "#1F2937",
        surfaceSoft: "#172033",
        surface2: "#263244",
        surfaceHover: "#374151",
        primary: "#FFDDA1",
        primaryHover: "#FFE5B8",
        primaryContrast: "#3F2D18",
        secondary: "#B79F69",
        text: "#F9FAFB",
        textMuted: "#D1D5DB",
        icon: "#FFDDA1",
        border: "#374151",
        borderStrong: "#4B5563",
        inputBg: "#111827",
        inputText: "#F9FAFB",
        inputBorder: "#4B5563",
        focus: "#FFDDA1",
      };
    }

    return {
      surface: "#FFFFFF",
      surfaceSoft: "#FAF6EE",
      surface2: "#F7EAD4",
      surfaceHover: "#FFF9F2",
      primary: "#AA5013",
      primaryHover: "#994812",
      primaryContrast: "#FFFFFF",
      secondary: "#6D5829",
      text: "#3B2A1E",
      textMuted: "#766657",
      icon: "#AA5013",
      border: "#D8C7AE",
      borderStrong: "#BFA684",
      inputBg: "#FFFFFF",
      inputText: "#3B2A1E",
      inputBorder: "#9B7B50",
      focus: "#AA5013",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     HOMOLOGACIÓN CON listarPagos.jsx

     REGLAS:
     - Dashboard entrega el fondo completo.
     - Esta vista mantiene wrapper transparente.
     - Las superficies consumen themeTokens.
     - No se modifica lógica, seguridad ni operaciones.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const input =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed";

    const select = input + " appearance-none";

    const btn =
      "w-full min-h-11 inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]";

    const danger =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const ok =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800");

    const listItem =
      "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 rounded-xl border transition-colors duration-200";

    const pill =
      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border transition-colors duration-200";

    const selectButton =
      "inline-flex min-h-9 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-extrabold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    return {
      page,
      content,
      card,
      input,
      select,
      btn,
      danger,
      ok,
      listItem,
      pill,
      selectButton,

      pageStyle: {
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      },

      sectionTitleStyle: {
        color: tokens.text,
      },

      inputStyle: {
        backgroundColor: tokens.inputBg,
        borderColor: tokens.inputBorder,
        color: tokens.inputText,
        "--tw-ring-color": `${tokens.focus}33`,
      },

      listItemStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.text,
      },

      pillStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.textMuted,
      },

      selectButtonStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.borderStrong,
        color: tokens.text,
      },

      primaryEnabledStyle: {
        backgroundColor: tokens.primary,
        borderColor: tokens.primary,
        color: tokens.primaryContrast,
      },

      disabledButtonStyle: {
        backgroundColor: tokens.surface2,
        borderColor: tokens.border,
        color: tokens.textMuted,
      },
    };
  }, [darkMode, tokens]);

  return (
    <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Roles
            </h1>

            <p
              className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={ui.subTextStyle}
            >
              Solo SuperAdmin (rol 3). Crea, edita o elimina roles del sistema.
            </p>
          </div>
        </header>

        <main>
          {/* =================================================
              CONTENIDO
          ================================================= */}

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ===============================================
                LISTADO
            =============================================== */}

            <section className={`${ui.card} p-4 sm:p-5 lg:col-span-2`} style={ui.cardStyle}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-extrabold" style={ui.sectionTitleStyle}>
                  Listado de roles
                </h2>

                <span className={ui.pill} style={ui.pillStyle}>
                  {roles.length} rol
                  {roles.length !== 1 ? "es" : ""}
                </span>
              </div>

              {roles.length === 0 ? (
                <div className="py-10 text-center text-[14px]" style={ui.subTextStyle}>
                  Sin roles registrados.
                </div>
              ) : (
                <div className="max-h-[520px] overflow-auto pr-1 space-y-2">
                  {roles.map((r) => {
                    const nombre = r?.nombre ?? r?.descripcion ?? `#${r?.id}`;

                    return (
                      <div
                        key={r.id}
                        className={ui.listItem}
                        style={ui.listItemStyle}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.backgroundColor = tokens.surfaceHover;
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.backgroundColor = tokens.surfaceSoft;
                        }}
                      >
                        <div className="min-w-0">
                          <p
                            className="font-extrabold truncate"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            {nombre}
                          </p>

                          <p
                            className="mt-0.5 text-[12px]"
                            style={{
                              color: tokens.textMuted,
                            }}
                          >
                            ID: {r.id}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            className={ui.selectButton}
                            style={ui.selectButtonStyle}
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

            {/* ===============================================
                ACCIONES
            =============================================== */}

            <aside className="lg:col-span-1 space-y-4">
              {/* CREAR */}

              <section className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                <h2 className="text-lg font-extrabold mb-3" style={ui.sectionTitleStyle}>
                  Crear rol
                </h2>

                <input
                  value={nuevoRol}
                  onChange={(e) => {
                    setNuevoRol(e.target.value);
                    setError("");
                    setMensaje("");
                  }}
                  placeholder="Nombre (mín. 3)"
                  className={ui.input}
                  style={ui.inputStyle}
                  disabled={busy}
                />

                <button
                  type="button"
                  onClick={crearRol}
                  disabled={busy}
                  className={`${ui.btn} mt-3`}
                  style={busy ? ui.disabledButtonStyle : ui.primaryEnabledStyle}
                  title={busy ? "Procesando..." : "Crear rol"}
                >
                  {busy ? "Procesando..." : "Guardar"}
                </button>
              </section>

              {/* EDITAR */}

              <section className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                <h2 className="text-lg font-extrabold mb-3" style={ui.sectionTitleStyle}>
                  Editar rol
                </h2>

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
                  style={ui.inputStyle}
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
                  style={ui.inputStyle}
                  disabled={busy || !editarId}
                />

                <button
                  type="button"
                  onClick={actualizarRol}
                  disabled={busy || !editarId}
                  className={`${ui.btn} mt-3 ${
                    !busy && editarId ? "bg-amber-500 text-[#1a1208] hover:bg-amber-400 border-amber-500" : ""
                  }`}
                  style={busy || !editarId ? ui.disabledButtonStyle : undefined}
                  title={!editarId ? "Selecciona un rol primero" : busy ? "Procesando..." : "Actualizar"}
                >
                  {busy ? "Procesando..." : "Actualizar"}
                </button>
              </section>

              {/* ELIMINAR */}

              <section className={`${ui.card} p-4 sm:p-5`} style={ui.cardStyle}>
                <h2 className="text-lg font-extrabold mb-3" style={ui.sectionTitleStyle}>
                  Eliminar rol
                </h2>

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
                  style={ui.inputStyle}
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
                    if (busy || !rolSeleccionado) {
                      return;
                    }

                    setMostrarModal(true);
                  }}
                  disabled={!rolSeleccionado || busy}
                  className={`${ui.btn} mt-3 ${
                    rolSeleccionado && !busy ? "bg-red-600 text-white hover:bg-red-500 border-red-600" : ""
                  }`}
                  style={!rolSeleccionado || busy ? ui.disabledButtonStyle : undefined}
                  title={!rolSeleccionado ? "Selecciona un rol" : busy ? "Procesando..." : "Eliminar"}
                >
                  {busy ? "Procesando..." : "Eliminar"}
                </button>
              </section>
            </aside>
          </div>

          {/* =================================================
              ALERTAS
          ================================================= */}

          <div className="mt-4 space-y-3">
            {!!mensaje && <div className={ui.ok}>{mensaje}</div>}

            {!!error && <div className={ui.danger}>{error}</div>}
          </div>

          <Modal visible={mostrarModal} onConfirm={confirmarEliminacion} onCancel={() => setMostrarModal(false)} />
        </main>
      </div>
    </div>
  );
}
