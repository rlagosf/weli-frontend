// src/pages/admin/config/Sucursales.jsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Building2, MapPin, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";

import api, { clearToken, getToken } from "../../../services/api";
import { useTheme } from "../../../context/ThemeContext";
import Modal from "../../../components/modal";
import { useMobileAutoScrollTop } from "../../../hooks/useMobileScrollTop";

/* =========================================================
   WELI - SUCURSALES

   IMPORTANTE:

   Las sucursales NO son un catálogo global como Categorías,
   Posiciones o Previsión Médica.

   Son estructura propia de cada academia, por lo que el Admin
   mantiene la capacidad de crear, editar y eliminar sucursales
   de SU academia.

   Este componente moderniza la presentación visual sin cambiar
   esa responsabilidad funcional.
========================================================= */

const asList = (response) => {
  const data = response?.data ?? response;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;

  return [];
};

export default function Sucursales() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);
  const [sucursales, setSucursales] = useState([]);

  const [nuevo, setNuevo] = useState("");
  const [editarId, setEditarId] = useState(null);
  const [editarNombre, setEditarNombre] = useState("");

  const [filtroTexto, setFiltroTexto] = useState("");

  const [seleccionado, setSeleccionado] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const breadcrumbBootRef = useRef(false);

  /* =======================================================
     NAVEGACIÓN
  ======================================================= */

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const configPath = useMemo(() => `${dashboardBase}/configuracion`, [dashboardBase]);

  /* =======================================================
     ERRORES
  ======================================================= */

  const getErrStatus = useCallback((err) => err?.status ?? err?.response?.status ?? 0, []);

  const getErrData = useCallback((err) => err?.data ?? err?.response?.data ?? null, []);

  const prettyError = useCallback(
    (err, fallback) => {
      const status = getErrStatus(err);
      const data = getErrData(err);

      const backendMsg = data?.message ?? data?.detail ?? data?.error ?? err?.message ?? null;

      if (status === 401) {
        return "Sesión expirada. Vuelve a iniciar sesión.";
      }

      if (status === 403) {
        return backendMsg || "No tienes permisos para realizar esta acción.";
      }

      if (status === 400) {
        return backendMsg || "Los datos enviados no son válidos.";
      }

      if (status === 404) {
        return backendMsg || "La sucursal ya no se encuentra disponible.";
      }

      if (status === 409) {
        return backendMsg || "No fue posible completar la acción debido a una restricción del sistema.";
      }

      return backendMsg || fallback || "Ocurrió un error inesperado.";
    },
    [getErrStatus, getErrData]
  );

  const flash = useCallback((okMessage = "", errorMessage = "") => {
    setMensaje(okMessage);
    setError(errorMessage);

    window.setTimeout(() => {
      setMensaje("");
      setError("");
    }, 2800);
  }, []);

  const handleAuth = useCallback(() => {
    clearToken();

    navigate("/login", {
      replace: true,
    });
  }, [navigate]);

  const sanitizar = useCallback((texto) => {
    return String(texto || "")
      .replace(/[<>;"']/g, "")
      .replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ-]/g, "")
      .trim();
  }, []);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];
    const label = "Sucursales";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [
            {
              label: "Configuración",
              to: configPath,
            },
            {
              label,
              to: currentPath,
            },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, configPath]);

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (!decoded?.exp || Number(decoded.exp) <= now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

      const rol = Number(rawRol);

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        return;
      }

      setRolActual(rol);
    } catch {
      handleAuth();
    }
  }, [dashboardBase, handleAuth, navigate]);

  /* =======================================================
     API
  ======================================================= */

  const fetchSucursales = useCallback(
    async ({ signal } = {}) => {
      try {
        const response = await api.get("/sucursales-real", {
          signal,
        });

        if (signal?.aborted) return;

        setSucursales(asList(response));
      } catch (err) {
        if (signal?.aborted) return;

        const status = getErrStatus(err);

        if (status === 401) {
          handleAuth();
          return;
        }

        setError(prettyError(err, "No fue posible cargar las sucursales."));
      }
    },
    [getErrStatus, handleAuth, prettyError]
  );

  useEffect(() => {
    if (!rolActual) return;

    const abort = new AbortController();

    (async () => {
      try {
        setLoading(true);

        await fetchSucursales({
          signal: abort.signal,
        });
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rolActual, fetchSucursales]);

  const refresh = useCallback(async () => {
    setReloadBusy(true);
    setError("");

    try {
      await fetchSucursales();
    } finally {
      setReloadBusy(false);
    }
  }, [fetchSucursales]);

  /* =======================================================
     CRUD
  ======================================================= */

  const crear = async () => {
    const nombre = sanitizar(nuevo);

    if (nombre.length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return;
    }

    setBusyAction("create");
    setError("");
    setMensaje("");

    try {
      await api.post("/sucursales-real", {
        nombre,
      });

      setNuevo("");

      flash("Sucursal creada correctamente.");

      await fetchSucursales();
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible crear la sucursal."));
    } finally {
      setBusyAction("");
    }
  };

  const iniciarEdicion = (sucursal) => {
    setEditarId(Number(sucursal?.id));
    setEditarNombre(String(sucursal?.nombre ?? ""));

    setError("");
    setMensaje("");
  };

  const cancelarEdicion = () => {
    setEditarId(null);
    setEditarNombre("");
  };

  const actualizar = async () => {
    const id = Number(editarId);
    const nombre = sanitizar(editarNombre);

    if (!Number.isInteger(id) || id <= 0) {
      setError("Debes seleccionar una sucursal válida.");
      return;
    }

    if (nombre.length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return;
    }

    setBusyAction("edit");
    setBusyId(id);
    setError("");
    setMensaje("");

    try {
      await api.put(`/sucursales-real/${id}`, {
        nombre,
      });

      setEditarId(null);
      setEditarNombre("");

      flash("Sucursal actualizada correctamente.");

      await fetchSucursales();
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible actualizar la sucursal."));
    } finally {
      setBusyAction("");
      setBusyId(null);
    }
  };

  const solicitarEliminar = (sucursal) => {
    setSeleccionado(sucursal);
    setMostrarModal(true);

    setError("");
    setMensaje("");
  };

  const eliminar = async () => {
    const id = Number(seleccionado?.id);

    if (!Number.isInteger(id) || id <= 0) {
      setMostrarModal(false);
      setSeleccionado(null);
      return;
    }

    setBusyAction("delete");
    setBusyId(id);
    setError("");
    setMensaje("");

    try {
      await api.delete(`/sucursales-real/${id}`);

      if (Number(editarId) === id) {
        cancelarEdicion();
      }

      flash("Sucursal eliminada correctamente.");

      await fetchSucursales();
    } catch (err) {
      const status = getErrStatus(err);

      if (status === 401) {
        handleAuth();
        return;
      }

      setError(prettyError(err, "No fue posible eliminar la sucursal."));
    } finally {
      setBusyAction("");
      setBusyId(null);
      setMostrarModal(false);
      setSeleccionado(null);
    }
  };

  /* =======================================================
     NORMALIZACIÓN / FILTROS
  ======================================================= */

  const sucursalesNormalizadas = useMemo(
    () =>
      (Array.isArray(sucursales) ? sucursales : [])
        .map((item) => ({
          ...item,
          id: Number(item?.id ?? 0),
          nombre: String(item?.nombre ?? item?.descripcion ?? `Sucursal #${item?.id ?? ""}`).trim(),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0)
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", {
            sensitivity: "base",
          })
        ),
    [sucursales]
  );

  const sucursalesFiltradas = useMemo(() => {
    const texto = String(filtroTexto || "")
      .trim()
      .toLowerCase();

    return sucursalesNormalizadas.filter((item) => {
      if (!texto) return true;

      return item.nombre.toLowerCase().includes(texto) || String(item.id).includes(texto);
    });
  }, [sucursalesNormalizadas, filtroTexto]);

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
        text: "#F9FAFB",
        textMuted: "#D1D5DB",
        icon: "#FFDDA1",
        border: "#374151",
        borderStrong: "#4B5563",
        inputBg: "#111827",
        inputText: "#F9FAFB",
        inputBorder: "#4B5563",
        tableHead: "#172033",
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
      text: "#3B2A1E",
      textMuted: "#766657",
      icon: "#AA5013",
      border: "#D8C7AE",
      borderStrong: "#BFA684",
      inputBg: "#FFFFFF",
      inputText: "#3B2A1E",
      inputBorder: "#9B7B50",
      tableHead: "#F7EAD4",
      focus: "#AA5013",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     HOMOLOGACIÓN CON listarPagos.jsx

     REGLAS:
     - Dashboard controla el fondo general.
     - Este componente permanece transparente.
     - Tarjetas, controles y tabla consumen themeTokens.
     - No se modifica CRUD, seguridad ni endpoints.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const label = "block mb-1.5 text-[13px] sm:text-[14px] font-extrabold";

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl border text-[14px] sm:text-[15px] font-medium outline-none transition focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-bold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const primaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

    const iconBox =
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200";

    const itemCard = "rounded-2xl border p-4 transition-colors duration-200";

    const ok =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800");

    const danger =
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    return {
      page,
      content,
      card,
      label,
      control,
      secondaryButton,
      primaryButton,
      iconBox,
      itemCard,
      ok,
      danger,

      pageStyle: {
        color: tokens.text,
      },

      cardStyle: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subTextStyle: {
        color: tokens.textMuted,
      },

      labelStyle: {
        color: tokens.text,
      },

      controlStyle: {
        backgroundColor: tokens.inputBg,
        borderColor: tokens.inputBorder,
        color: tokens.inputText,
        "--tw-ring-color": `${tokens.focus}33`,
      },

      secondaryButtonStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.borderStrong,
        color: tokens.text,
      },

      primaryButtonStyle: {
        backgroundColor: tokens.primary,
        borderColor: tokens.primary,
        color: tokens.primaryContrast,
      },

      iconBoxStyle: {
        backgroundColor: tokens.surface2,
        borderColor: tokens.border,
        color: tokens.icon,
      },

      itemCardStyle: {
        backgroundColor: tokens.surfaceSoft,
        borderColor: tokens.border,
        color: tokens.text,
      },

      tableHeadStyle: {
        backgroundColor: tokens.tableHead,
        color: tokens.text,
      },

      dividerStyle: {
        borderColor: tokens.border,
      },
    };
  }, [darkMode, tokens]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
        <div className={`${ui.content} min-h-[70vh] flex items-center justify-center`}>
          <div className="text-sm font-semibold" style={ui.subTextStyle}>
            Cargando sucursales…
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.page} font-sans`} style={ui.pageStyle}>
      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <div className="mx-auto max-w-4xl">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-200"
              style={ui.iconBoxStyle}
            >
              <Building2 className="h-6 w-6" />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Sucursales
            </h1>

            <p
              className="mx-auto mt-2 max-w-4xl text-[14px] sm:text-[15px] lg:text-base leading-relaxed"
              style={ui.subTextStyle}
            >
              Administra las sedes operativas de tu academia y mantén su estructura organizada para jugadores, staff y
              procesos internos.
            </p>
          </div>
        </header>

        <main>
          {/* =================================================
              RESUMEN
          ================================================= */}

          <section className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SummaryCard
              tokens={tokens}
              label="Sucursales registradas"
              value={sucursalesNormalizadas.length}
              type="total"
            />

            <SummaryCard
              tokens={tokens}
              label="Resultados visibles"
              value={sucursalesFiltradas.length}
              type="visible"
            />
          </section>

          {/* =================================================
              MENSAJES
          ================================================= */}

          <div className="mt-4 space-y-3">
            {!!mensaje && <div className={ui.ok}>{mensaje}</div>}

            {!!error && <div className={ui.danger}>{error}</div>}
          </div>

          {/* =================================================
              GOBERNANZA
          ================================================= */}

          <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
            <div className="flex items-start gap-3">
              <div className={`${ui.iconBox} mt-0.5`} style={ui.iconBoxStyle}>
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-[15px] sm:text-base font-extrabold" style={ui.titleStyle}>
                  Estructura propia de la academia
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm leading-relaxed" style={ui.subTextStyle}>
                  Las sucursales pertenecen a la estructura operativa de cada academia. A diferencia de los catálogos
                  globales, el administrador puede crear, editar y eliminar las sucursales correspondientes a su propia
                  organización.
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              CREACIÓN + FILTRO
          ================================================= */}

          <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto] gap-3 lg:items-end">
              {/* NUEVA SUCURSAL */}

              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Nueva sucursal
                </label>

                <input
                  type="text"
                  value={nuevo}
                  onChange={(event) => {
                    setNuevo(event.target.value);
                    setError("");
                    setMensaje("");
                  }}
                  placeholder="Nombre de la sucursal"
                  className={ui.control}
                  style={ui.controlStyle}
                  disabled={busyAction === "create"}
                />
              </div>

              <button
                type="button"
                onClick={crear}
                disabled={busyAction === "create"}
                className={ui.primaryButton}
                style={ui.primaryButtonStyle}
              >
                <Plus className="h-4 w-4" />

                {busyAction === "create" ? "Guardando…" : "Crear sucursal"}
              </button>

              {/* BUSCAR */}

              <div>
                <label className={ui.label} style={ui.labelStyle}>
                  Buscar sucursal
                </label>

                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 pointer-events-none"
                    style={{
                      color: tokens.textMuted,
                    }}
                  />

                  <input
                    type="text"
                    value={filtroTexto}
                    onChange={(event) => setFiltroTexto(event.target.value)}
                    placeholder="Nombre o ID"
                    className={`${ui.control} !pl-10`}
                    style={ui.controlStyle}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={refresh}
                disabled={reloadBusy}
                className={ui.secondaryButton}
                style={ui.secondaryButtonStyle}
              >
                <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </section>

          {/* =================================================
              EDICIÓN ACTIVA
          ================================================= */}

          {editarId && (
            <section className={`${ui.card} mt-4 p-4 sm:p-5`} style={ui.cardStyle}>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 lg:items-end">
                <div>
                  <label className={ui.label} style={ui.labelStyle}>
                    Editando sucursal ID {editarId}
                  </label>

                  <input
                    type="text"
                    value={editarNombre}
                    onChange={(event) => {
                      setEditarNombre(event.target.value);
                      setError("");
                      setMensaje("");
                    }}
                    className={ui.control}
                    style={ui.controlStyle}
                    disabled={busyAction === "edit"}
                  />
                </div>

                <button
                  type="button"
                  onClick={actualizar}
                  disabled={busyAction === "edit"}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                    darkMode
                      ? "border-amber-300/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  <Pencil className="h-4 w-4" />

                  {busyAction === "edit" ? "Guardando…" : "Guardar cambios"}
                </button>

                <button
                  type="button"
                  onClick={cancelarEdicion}
                  disabled={busyAction === "edit"}
                  className={ui.secondaryButton}
                  style={ui.secondaryButtonStyle}
                >
                  Cancelar
                </button>
              </div>
            </section>
          )}

          {/* =================================================
              DIRECTORIO
          ================================================= */}

          <section className={`${ui.card} mt-4 overflow-hidden`} style={ui.cardStyle}>
            <div
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4"
              style={ui.dividerStyle}
            >
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold" style={ui.titleStyle}>
                  Directorio de sucursales
                </h2>

                <p className="mt-1 text-[13px] sm:text-sm" style={ui.subTextStyle}>
                  {sucursalesFiltradas.length} de {sucursalesNormalizadas.length} sucursales mostradas.
                </p>
              </div>
            </div>

            {/* ===============================================
                DESKTOP
            =============================================== */}

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead style={ui.tableHeadStyle}>
                  <tr>
                    <th className="px-5 py-3 text-center font-extrabold">Sucursal</th>

                    <th className="px-5 py-3 text-center font-extrabold">Identificador</th>

                    <th className="px-5 py-3 text-center font-extrabold">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {sucursalesFiltradas.map((item) => {
                    const procesando = busyId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className="border-t transition hover:bg-[var(--weli-surface-hover)]"
                        style={{
                          borderColor: tokens.border,
                        }}
                      >
                        <td className="px-5 py-4 text-center">
                          <div
                            className="inline-flex items-center justify-center gap-2 font-extrabold"
                            style={{
                              color: tokens.text,
                            }}
                          >
                            <MapPin
                              className="h-4 w-4 opacity-60"
                              style={{
                                color: tokens.icon,
                              }}
                            />

                            {item.nombre}
                          </div>
                        </td>

                        <td
                          className="px-5 py-4 text-center font-semibold"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          ID {item.id}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(item)}
                              disabled={procesando}
                              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 ${
                                darkMode
                                  ? "border-amber-300/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              }`}
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => solicitarEliminar(item)}
                              disabled={procesando}
                              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-extrabold transition disabled:opacity-50 ${
                                darkMode
                                  ? "border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />

                              {procesando && busyAction === "delete" ? "Eliminando…" : "Eliminar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!sucursalesFiltradas.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-12 text-center text-[14px]"
                        style={{
                          color: tokens.textMuted,
                        }}
                      >
                        No existen sucursales para la búsqueda seleccionada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ===============================================
                MOBILE / TABLET
            =============================================== */}

            <div className="lg:hidden p-3 sm:p-4 space-y-3">
              {sucursalesFiltradas.map((item) => {
                const procesando = busyId === item.id;

                return (
                  <article key={item.id} className={ui.itemCard} style={ui.itemCardStyle}>
                    <div className="flex items-start gap-3">
                      <div className={ui.iconBox} style={ui.iconBoxStyle}>
                        <MapPin className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <h3
                          className="text-base font-extrabold break-words"
                          style={{
                            color: tokens.text,
                          }}
                        >
                          {item.nombre}
                        </h3>

                        <p
                          className="mt-1 text-[12px]"
                          style={{
                            color: tokens.textMuted,
                          }}
                        >
                          ID {item.id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(item)}
                        disabled={procesando}
                        className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                          darkMode
                            ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => solicitarEliminar(item)}
                        disabled={procesando}
                        className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                          darkMode
                            ? "border-red-300/20 bg-red-500/10 text-red-100"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />

                        {procesando && busyAction === "delete" ? "Eliminando…" : "Eliminar"}
                      </button>
                    </div>
                  </article>
                );
              })}

              {!sucursalesFiltradas.length && (
                <div
                  className="py-10 text-center text-[14px]"
                  style={{
                    color: tokens.textMuted,
                  }}
                >
                  No existen sucursales para la búsqueda seleccionada.
                </div>
              )}
            </div>
          </section>

          <Modal
            visible={mostrarModal}
            onConfirm={eliminar}
            onCancel={() => {
              if (busyAction === "delete") return;

              setMostrarModal(false);
              setSeleccionado(null);
            }}
          />
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ tokens, label, value, type }) {
  const icon = type === "visible" ? <Search className="h-5 w-5" /> : <Building2 className="h-5 w-5" />;

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.08)] transition-colors duration-200"
      style={{
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        color: tokens.text,
      }}
    >
      <div
        className="flex items-center justify-between gap-3"
        style={{
          color: tokens.textMuted,
        }}
      >
        <span className="text-[11px] sm:text-[12px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

        <span
          style={{
            color: tokens.icon,
          }}
        >
          {icon}
        </span>
      </div>

      <strong
        className="mt-2 block text-2xl sm:text-3xl font-extrabold"
        style={{
          color: tokens.text,
        }}
      >
        {value}
      </strong>
    </div>
  );
}
