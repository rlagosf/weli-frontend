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
  const { darkMode } = useTheme();
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
    navigate("/login", { replace: true });
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
     UI
  ======================================================= */

  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";

    const subText = darkMode ? "text-white/65" : "text-ra-marron/65";

    const card =
      "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.10)] " +
      (darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/65 border-ra-marron/15");

    const control =
      "w-full h-11 sm:h-12 px-3.5 rounded-xl text-[14px] sm:text-[15px] font-medium outline-none transition " +
      (darkMode
        ? "border border-white/15 bg-[#111827] text-white placeholder:text-white/40 focus:border-[#ffdda1] focus:ring-2 focus:ring-[#ffdda1]/15"
        : "border border-ra-marron/20 bg-white/80 text-ra-marron placeholder:text-ra-marron/45 focus:border-[#aa5013] focus:ring-2 focus:ring-[#aa5013]/10");

    const secondaryButton =
      "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-bold transition disabled:opacity-50 disabled:cursor-not-allowed " +
      (darkMode ? "border-white/15 text-white hover:bg-white/10" : "border-ra-marron/20 text-ra-marron hover:bg-white");

    const ok =
      "rounded-2xl border px-4 py-3 text-[14px] font-semibold " +
      (darkMode
        ? "border-emerald-200/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-900");

    const danger =
      "rounded-2xl border px-4 py-3 text-[14px] font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    return {
      shell,
      titleMain,
      subText,
      card,
      control,
      secondaryButton,
      ok,
      danger,
    };
  }, [darkMode]);

  if (loading) {
    return (
      <div className={`${ui.shell} min-h-screen font-sans`}>
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className={`text-sm font-semibold ${ui.subText}`}>Cargando sucursales…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-4 sm:px-6 lg:px-8 pt-6 text-center">
        <div className="mx-auto max-w-4xl">
          <div
            className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border ${
              darkMode
                ? "border-white/10 bg-white/[0.06] text-[#ffdda1]"
                : "border-ra-marron/15 bg-white/60 text-[#aa5013]"
            }`}
          >
            <Building2 className="h-6 w-6" />
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>Sucursales</h1>

          <p className={`mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] leading-relaxed ${ui.subText}`}>
            Administra las sedes operativas de tu academia y mantén su estructura organizada para jugadores, staff y
            procesos internos.
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 pb-20">
        {/* RESUMEN */}

        <section className="mx-auto mt-7 max-w-7xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            darkMode={darkMode}
            label="Sucursales registradas"
            value={sucursalesNormalizadas.length}
            type="total"
          />

          <SummaryCard
            darkMode={darkMode}
            label="Resultados visibles"
            value={sucursalesFiltradas.length}
            type="visible"
          />
        </section>

        <div className="mx-auto mt-4 max-w-7xl space-y-3">
          {!!mensaje && <div className={ui.ok}>{mensaje}</div>}
          {!!error && <div className={ui.danger}>{error}</div>}
        </div>

        {/* GOBERNANZA */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                darkMode ? "bg-[#ffdda1]/10 text-[#ffdda1]" : "bg-[#aa5013]/10 text-[#aa5013]"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className={`text-[15px] sm:text-base font-extrabold ${ui.titleMain}`}>
                Estructura propia de la academia
              </h2>

              <p className={`mt-1 text-[13px] sm:text-sm leading-relaxed ${ui.subText}`}>
                Las sucursales pertenecen a la estructura operativa de cada academia. A diferencia de los catálogos
                globales, el administrador puede crear, editar y eliminar las sucursales correspondientes a su propia
                organización.
              </p>
            </div>
          </div>
        </section>

        {/* CREACIÓN + FILTRO */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl p-4 sm:p-5`}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto] gap-3 lg:items-end">
            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
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
                disabled={busyAction === "create"}
              />
            </div>

            <button
              type="button"
              onClick={crear}
              disabled={busyAction === "create"}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                darkMode
                  ? "border-[#ffdda1]/25 bg-[#ffdda1]/10 text-[#ffdda1] hover:bg-[#ffdda1]/15"
                  : "border-[#aa5013]/20 bg-[#aa5013] text-white hover:brightness-105"
              }`}
            >
              <Plus className="h-4 w-4" />
              {busyAction === "create" ? "Guardando…" : "Crear sucursal"}
            </button>

            <div>
              <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
                Buscar sucursal
              </label>

              <div className="relative">
                <Search
                  className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${
                    darkMode ? "text-white/40" : "text-ra-marron/45"
                  }`}
                />

                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(event) => setFiltroTexto(event.target.value)}
                  placeholder="Nombre o ID"
                  className={`${ui.control} !pl-10`}
                />
              </div>
            </div>

            <button type="button" onClick={refresh} disabled={reloadBusy} className={ui.secondaryButton}>
              <RefreshCw className={`h-4 w-4 ${reloadBusy ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </section>

        {/* EDICIÓN ACTIVA */}

        {editarId && (
          <section className={`${ui.card} mx-auto mt-4 max-w-7xl p-4 sm:p-5`}>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 lg:items-end">
              <div>
                <label className={`block mb-1.5 text-[13px] sm:text-sm font-extrabold ${ui.titleMain}`}>
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
                  disabled={busyAction === "edit"}
                />
              </div>

              <button
                type="button"
                onClick={actualizar}
                disabled={busyAction === "edit"}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50 ${
                  darkMode
                    ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
                    : "border-amber-200 bg-amber-50 text-amber-800"
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
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        {/* TABLA */}

        <section className={`${ui.card} mx-auto mt-4 max-w-7xl overflow-hidden`}>
          <div
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b px-4 sm:px-5 py-4 ${
              darkMode ? "border-white/10" : "border-ra-marron/10"
            }`}
          >
            <div>
              <h2 className={`text-lg sm:text-xl font-extrabold ${ui.titleMain}`}>Directorio de sucursales</h2>

              <p className={`mt-1 text-[13px] sm:text-sm ${ui.subText}`}>
                {sucursalesFiltradas.length} de {sucursalesNormalizadas.length} sucursales mostradas.
              </p>
            </div>
          </div>

          {/* DESKTOP */}

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className={darkMode ? "bg-black/20 text-[#ffdda1]" : "bg-[#f7ead4] text-[#6d5829]"}>
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
                      className={`border-t ${
                        darkMode ? "border-white/10 hover:bg-white/[0.04]" : "border-ra-marron/10 hover:bg-white/50"
                      }`}
                    >
                      <td className="px-5 py-4 text-center">
                        <div
                          className={`inline-flex items-center justify-center gap-2 font-extrabold ${
                            darkMode ? "text-white" : "text-ra-marron"
                          }`}
                        >
                          <MapPin className="h-4 w-4 opacity-60" />
                          {item.nombre}
                        </div>
                      </td>

                      <td className={`px-5 py-4 text-center font-semibold ${ui.subText}`}>ID {item.id}</td>

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
                    <td colSpan={3} className={`px-6 py-12 text-center text-[14px] ${ui.subText}`}>
                      No existen sucursales para la búsqueda seleccionada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET */}

          <div className="lg:hidden p-3 sm:p-4 space-y-3">
            {sucursalesFiltradas.map((item) => {
              const procesando = busyId === item.id;

              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-4 ${
                    darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/45"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        darkMode ? "bg-white/[0.06] text-[#ffdda1]" : "bg-[#aa5013]/10 text-[#aa5013]"
                      }`}
                    >
                      <MapPin className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <h3 className={`text-base font-extrabold break-words ${ui.titleMain}`}>{item.nombre}</h3>

                      <p className={`mt-1 text-[12px] ${ui.subText}`}>ID {item.id}</p>
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
              <div className={`py-10 text-center text-[14px] ${ui.subText}`}>
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
  );
}

function SummaryCard({ darkMode, label, value, type }) {
  const icon = type === "visible" ? <Search className="h-5 w-5" /> : <Building2 className="h-5 w-5" />;

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-[0_12px_34px_rgba(0,0,0,0.08)] ${
        darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/65 border-ra-marron/15"
      }`}
    >
      <div className={`flex items-center justify-between gap-3 ${darkMode ? "text-white/60" : "text-ra-marron/60"}`}>
        <span className="text-[11px] sm:text-[12px] uppercase tracking-[0.08em] font-extrabold">{label}</span>

        {icon}
      </div>

      <strong
        className={`mt-2 block text-2xl sm:text-3xl font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}
      >
        {value}
      </strong>
    </div>
  );
}
