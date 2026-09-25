// src/pages/admin/ListarEstadisticas.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";

import { useNavigate, useLocation } from "react-router-dom";

import { useTheme } from "../../context/ThemeContext";
import { Pencil } from "lucide-react";
import { jwtDecode } from "jwt-decode";

import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* =========================================================
   SCOPE HELPERS
========================================================= */

const STORAGE_KEY = "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? 0);

    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    const deporte_id = Number(parsed?.deporte_id ?? 0);

    return {
      id,

      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,

      nombre: parsed?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) => String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

/* =========================================================
   AUTH HELPERS
========================================================= */

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);

  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

  const number = Number(raw);

  return Number.isFinite(number) ? number : 0;
};

/* =========================================================
   ACADEMIA SUPERADMIN

   Soporta:
   "1"

   o:
   {
     id: 1
   }
========================================================= */

const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const direct = Number(raw);

    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);

    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

/* =========================================================
   HEADERS
========================================================= */

const buildHeaders = (rol) => {
  const token = getToken();

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  if (rol === 3) {
    const academiaId = getAcademiaIdFromStorage();

    if (academiaId) {
      headers["x-academia-id"] = String(academiaId);
    }
  }

  return headers;
};

/* =========================================================
   COMPONENTE
========================================================= */

export default function ListarEstadisticas() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();

  const location = useLocation();

  const [jugadoresRaw, setJugadoresRaw] = useState([]);

  const [categoriasRaw, setCategoriasRaw] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState("");

  const [rol, setRol] = useState(null);

  const [scope, setScope] = useState({
    academia_id: null,

    deporte_id: null,

    academia_nombre: null,
  });

  useMobileAutoScrollTop();

  /* =======================================================
     ÁRBOL ACTUAL
  ======================================================= */

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  /* =======================================================
     BREADCRUMB ANTI-LOOP
  ======================================================= */

  const breadcrumbBootRef = useRef(false);

  useEffect(() => {
    if (breadcrumbBootRef.current) {
      return;
    }

    const currentPath = location.pathname + location.search;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    const label = "Registrar Estadísticas";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            {
              to: currentPath,

              label,
            },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* =======================================================
     AUTH + SCOPE
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);

      if (isExpired(decoded)) {
        throw new Error("expired");
      }

      const parsedRol = extractRol(decoded);

      if (![1, 2, 3].includes(parsedRol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        return;
      }

      setRol(parsedRol);

      const superTree = isSuperTreePath(location.pathname);

      if (superTree) {
        const snapshot = readSelectedAcademia();

        if (!snapshot?.id) {
          navigate("/super-dashboard", {
            replace: true,
          });

          return;
        }

        setScope({
          academia_id: snapshot.id,

          deporte_id: snapshot.deporte_id,

          academia_nombre: snapshot.nombre ?? null,
        });
      } else {
        const academiaId = Number(decoded?.academia_id ?? decoded?.academy_id ?? 0) || null;

        const deporteId = Number(decoded?.deporte_id ?? decoded?.sport_id ?? 0) || null;

        setScope({
          academia_id: academiaId,

          deporte_id: deporteId,

          academia_nombre: null,
        });
      }

      /*
       * Si es rol 3 y falta academia target,
       * se trata como sesión inválida para este módulo.
       */

      if (parsedRol === 3) {
        const academiaId = getAcademiaIdFromStorage();

        if (!academiaId) {
          throw new Error("missing-academia-target");
        }
      }
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, location.pathname, dashboardBase]);

  /* =======================================================
     LIVE UPDATE SUPERADMIN
  ======================================================= */

  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) {
        return;
      }

      if (!isSuperTreePath(location.pathname)) {
        return;
      }

      const snapshot = readSelectedAcademia();

      if (snapshot?.id) {
        setScope((previous) => {
          const next = {
            academia_id: snapshot.id,

            deporte_id: snapshot.deporte_id,

            academia_nombre: snapshot.nombre ?? null,
          };

          const same =
            previous?.academia_id === next.academia_id &&
            previous?.deporte_id === next.deporte_id &&
            previous?.academia_nombre === next.academia_nombre;

          return same ? previous : next;
        });
      }
    };

    tick();

    const interval = setInterval(tick, 1200);

    const onStorage = () => tick();

    const onEvent = () => tick();

    window.addEventListener("storage", onStorage);

    window.addEventListener("weli:selectedAcademiaChanged", onEvent);

    return () => {
      alive = false;

      clearInterval(interval);

      window.removeEventListener("storage", onStorage);

      window.removeEventListener("weli:selectedAcademiaChanged", onEvent);
    };
  }, [location.pathname]);

  /* =======================================================
     HELPERS FETCH
  ======================================================= */

  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) {
      return [];
    }

    const data = res?.data ?? res;

    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.results)) {
      return data.results;
    }

    if (Array.isArray(data?.items)) {
      return data.items;
    }

    if (Array.isArray(data?.rows)) {
      return data.rows;
    }

    if (data?.ok && Array.isArray(data.items)) {
      return data.items;
    }

    if (data?.ok && Array.isArray(data.data)) {
      return data.data;
    }

    return [];
  };

  const getErrStatus = (requestError) => requestError?.status ?? requestError?.response?.status ?? 0;

  const tryGetList = async (paths, { signal, headers } = {}) => {
    const list = Array.isArray(paths) ? paths : [paths];

    const variants = [];

    for (const pathRaw of list) {
      const path = String(pathRaw || "");

      const base = path.startsWith("/") ? path : `/${path}`;

      variants.push(
        base,

        base.endsWith("/") ? base.slice(0, -1) : `${base}/`
      );
    }

    const uniqueUrls = [...new Set(variants)];

    for (const url of uniqueUrls) {
      try {
        const response = await api.get(url, {
          signal,
          headers,
        });

        return normalizeListResponse(response);
      } catch (requestError) {
        const status = getErrStatus(requestError);

        if (status === 401 || status === 403) {
          throw requestError;
        }
      }
    }

    return [];
  };

  /* =======================================================
     CARGA DE DATOS
  ======================================================= */

  useEffect(() => {
    if (rol == null) {
      return;
    }

    const abort = new AbortController();

    const headers = buildHeaders(rol);

    (async () => {
      setIsLoading(true);

      setError("");

      try {
        const academiaId = scope.academia_id;

        const deporteId = scope.deporte_id;

        const jugadoresPaths = [];

        if (academiaId && deporteId) {
          if (rol === 2) {
            jugadoresPaths.push(`/jugadores/staff?academia_id=${academiaId}&deporte_id=${deporteId}`);

            jugadoresPaths.push(`/jugadores/staff?academia_id=${academiaId}`);
          } else {
            jugadoresPaths.push(`/jugadores?academia_id=${academiaId}&deporte_id=${deporteId}`);

            jugadoresPaths.push(`/jugadores?academia_id=${academiaId}`);
          }
        } else if (academiaId) {
          if (rol === 2) {
            jugadoresPaths.push(`/jugadores/staff?academia_id=${academiaId}`);
          } else {
            jugadoresPaths.push(`/jugadores?academia_id=${academiaId}`);
          }
        }

        if (rol === 2) {
          jugadoresPaths.push("/jugadores/staff");
        }

        jugadoresPaths.push("/jugadores");

        const [jugadores, categorias] = await Promise.all([
          tryGetList(jugadoresPaths, {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/categorias"], {
            signal: abort.signal,

            headers,
          }),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        const jugadoresArr = Array.isArray(jugadores) ? jugadores : [];

        setJugadoresRaw(jugadoresArr);

        setCategoriasRaw(Array.isArray(categorias) ? categorias : []);

        if ((!scope.academia_id || !scope.deporte_id) && jugadoresArr.length) {
          const jugadorScope = jugadoresArr.find((item) => item && (item.academia_id || item.deporte_id));

          const academiaInferida = Number(jugadorScope?.academia_id ?? 0) || null;

          const deporteInferido = Number(jugadorScope?.deporte_id ?? 0) || null;

          if (academiaInferida || deporteInferido) {
            setScope((previous) => ({
              ...previous,

              academia_id: previous.academia_id ?? academiaInferida,

              deporte_id: previous.deporte_id ?? deporteInferido,
            }));
          }
        }
      } catch (requestError) {
        if (abort.signal.aborted) {
          return;
        }

        const status = getErrStatus(requestError);

        if (status === 401 || status === 403) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        setError("❌ Error al cargar los jugadores/categorías");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, scope.academia_id, scope.deporte_id, navigate, location.pathname]);

  /* =======================================================
     CATEGORY MAPS
  ======================================================= */

  const categoriaMap = useMemo(() => {
    const map = new Map();

    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((categoria) => {
      const id = categoria?.id ?? categoria?.categoria_id;

      const nombre = categoria?.nombre ?? categoria?.descripcion;

      if (id != null && nombre) {
        map.set(Number(id), String(nombre));
      }
    });

    return map;
  }, [categoriasRaw]);

  const categoriaOrder = useMemo(() => {
    const order = new Map();

    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((categoria, index) => {
      const nombre = (categoria?.nombre ?? categoria?.descripcion ?? "").toString();

      if (nombre) {
        order.set(nombre, index);
      }
    });

    return order;
  }, [categoriasRaw]);

  const toCategoria = useCallback(
    (jugador) => {
      if (jugador?.categoria?.nombre) {
        return String(jugador.categoria.nombre);
      }

      if (jugador?.categoria_nombre) {
        return String(jugador.categoria_nombre);
      }

      const categoriaId = jugador?.categoria_id ?? jugador?.categoria?.id ?? jugador?.categoriaId;

      const nombre = categoriaId != null ? categoriaMap.get(Number(categoriaId)) : undefined;

      return nombre || "Sin categoría";
    },
    [categoriaMap]
  );

  /* =======================================================
     NORMALIZAR JUGADORES
  ======================================================= */

  const jugadores = useMemo(() => {
    const toNombre = (jugador) =>
      jugador?.nombre_jugador ||
      jugador?.nombre_completo ||
      jugador?.nombre ||
      [jugador?.nombres, jugador?.apellidos].filter(Boolean).join(" ") ||
      "—";

    const base = Array.isArray(jugadoresRaw) ? jugadoresRaw : [];

    const academiaId = scope.academia_id;

    const deporteId = scope.deporte_id;

    const scoped =
      !academiaId && !deporteId
        ? base
        : base.filter((jugador) => {
            const jugadorAcademiaId = Number(jugador?.academia_id ?? 0);

            const jugadorDeporteId = Number(jugador?.deporte_id ?? 0);

            if (academiaId && jugadorAcademiaId !== academiaId) {
              return false;
            }

            if (deporteId && jugadorDeporteId !== deporteId) {
              return false;
            }

            return true;
          });

    return scoped.map((jugador, index) => {
      const jugador_id = Number(jugador?.id ?? jugador?.jugador_id ?? 0) || null;

      const rutBase =
        jugador?.rut_jugador ??
        jugador?.rut ??
        jugador?.rutJugador ??
        jugador?.rut_base ??
        (jugador_id ? String(jugador_id) : `tmp-${index}`);

      const rutStr = String(rutBase);

      return {
        jugador_id,

        rut: rutStr,

        rutConDV: formatRutWithDV(rutStr),

        nombre: toNombre(jugador),

        categoriaNombre: toCategoria(jugador),
      };
    });
  }, [jugadoresRaw, scope.academia_id, scope.deporte_id, toCategoria]);

  /* =======================================================
     GRUPOS
  ======================================================= */

  const grupos = useMemo(() => {
    const map = new Map();

    for (const jugador of jugadores) {
      const categoria = jugador.categoriaNombre || "Sin categoría";

      if (!map.has(categoria)) {
        map.set(categoria, []);
      }

      map.get(categoria).push(jugador);
    }

    const entries = [...map.entries()];

    entries.sort((a, b) => {
      const [categoriaA] = a;

      const [categoriaB] = b;

      if (categoriaA === "Sin categoría" && categoriaB !== "Sin categoría") {
        return 1;
      }

      if (categoriaB === "Sin categoría" && categoriaA !== "Sin categoría") {
        return -1;
      }

      const indexA = categoriaOrder.has(categoriaA) ? categoriaOrder.get(categoriaA) : Number.MAX_SAFE_INTEGER;

      const indexB = categoriaOrder.has(categoriaB) ? categoriaOrder.get(categoriaB) : Number.MAX_SAFE_INTEGER;

      return indexA - indexB || categoriaA.localeCompare(categoriaB, "es");
    });

    return entries.map(([categoria, list]) => ({
      categoria,

      items: [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    }));
  }, [jugadores, categoriaOrder]);

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la fuente visual principal.
     Dashboard mantiene el fondo general.
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

        secondaryHover: "#C8B27F",

        secondaryContrast: "#111827",

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

        overlay: "rgba(0,0,0,.65)",
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

      secondaryHover: "#5E4B23",

      secondaryContrast: "#FFFFFF",

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

      overlay: "rgba(0,0,0,.55)",
    };
  }, [themeTokens, darkMode]);

  /* =======================================================
     UI

     Homologado con listarPagos.jsx.

     - Fondo transparente.
     - Tarjetas usan surface.
     - Cabecera usa tableHead.
     - Hover usa surfaceHover.
     - Acción usa primary.
     - Textos usan text / textMuted.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const card = "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const thead = "text-[10px] sm:text-xs";

    const th = "p-2 text-center whitespace-nowrap font-extrabold border-r";

    const td = "p-2 text-center border-r";

    const tr = "weli-estadisticas-row border-b transition-colors duration-200";

    const warn =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : "border-amber-300/60 bg-amber-50 text-amber-900");

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const actionBtn =
      "weli-estadisticas-action inline-flex items-center justify-center p-2 rounded-lg border transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    return {
      page,
      content,
      card,
      thead,
      th,
      td,
      tr,
      warn,
      danger,
      actionBtn,

      rootStyle: {
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

      theadStyle: {
        backgroundColor: tokens.tableHead,

        color: tokens.text,
      },

      thStyle: {
        borderColor: tokens.border,

        color: tokens.text,
      },

      tdStyle: {
        borderColor: tokens.border,

        color: tokens.text,
      },

      actionStyle: {
        backgroundColor: tokens.primary,

        borderColor: tokens.primary,

        color: tokens.primaryContrast,
      },

      cssVars: {
        "--weli-estadisticas-row-border": tokens.border,

        "--weli-estadisticas-row-hover": tokens.surfaceHover,

        "--weli-estadisticas-focus": tokens.focus,
      },
    };
  }, [darkMode, tokens]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (error) {
    return (
      <div className={`${ui.page} font-sans`} style={ui.rootStyle}>
        <div className={`${ui.content} min-h-[70vh] flex items-center justify-center`}>
          <div className={`${ui.card} p-6 max-w-xl w-full`} style={ui.cardStyle}>
            <div className={ui.danger}>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     SCOPE LABEL
  ======================================================= */

  const scopeLabelParts = [];

  if (scope.academia_id) {
    scopeLabelParts.push(`Academia #${scope.academia_id}`);
  }

  if (scope.academia_nombre) {
    scopeLabelParts.push(String(scope.academia_nombre));
  }

  if (scope.deporte_id) {
    scopeLabelParts.push(`Deporte #${scope.deporte_id}`);
  }

  const scopeLabel = scopeLabelParts.join(" · ");

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${ui.page} font-sans`} style={ui.rootStyle}>
      <style>
        {`
          .weli-estadisticas-row {
            border-color: var(--weli-estadisticas-row-border);
          }

          .weli-estadisticas-row:hover {
            background-color: var(--weli-estadisticas-row-hover);
          }

          .weli-estadisticas-action:focus-visible {
            outline: 2px solid var(--weli-estadisticas-focus);
            outline-offset: 3px;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
            Registrar Estadísticas de Jugadores
          </h1>

          {!!scopeLabel && (
            <p className="text-sm sm:text-[15px] mt-2" style={ui.subTextStyle}>
              {scopeLabel}
            </p>
          )}
        </header>

        {/* =================================================
            MAIN
        ================================================= */}

        <main>
          {/* ===============================================
              SIN DEPORTE
          =============================================== */}

          {!scope.deporte_id && (
            <div className="max-w-5xl mx-auto mt-5">
              <div className={ui.warn}>
                Falta <b>deporte_id</b> en el scope. Si estás en super-dashboard, selecciona una academia con deporte
                asignado.
              </div>
            </div>
          )}

          {/* ===============================================
              SIN JUGADORES
          =============================================== */}

          {grupos.length === 0 ? (
            <div className="max-w-5xl mx-auto mt-5">
              <div className={`${ui.card} p-6 text-center`} style={ui.cardStyle}>
                <span style={ui.subTextStyle}>No hay jugadores registrados para este contexto.</span>
              </div>
            </div>
          ) : (
            /* =============================================
               GRUPOS POR CATEGORÍA
            ============================================= */

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map(({ categoria, items }) => (
                <section key={categoria} className={`${ui.card} p-5 sm:p-6`} style={ui.cardStyle}>
                  {/* =====================================
                        CABECERA
                    ===================================== */}

                  <header className="mb-4 flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-extrabold" style={ui.titleStyle}>
                      {categoria}
                    </h2>

                    <span className="text-xs" style={ui.subTextStyle}>
                      {items.length} jugador
                      {items.length !== 1 ? "es" : ""}
                    </span>
                  </header>

                  {/* =====================================
                        TABLA
                        SIN SCROLL HORIZONTAL
                    ===================================== */}

                  <div className="w-full">
                    <table className="w-full text-xs sm:text-sm table-fixed border-separate border-spacing-0">
                      <thead className={ui.thead} style={ui.theadStyle}>
                        <tr>
                          <th className={`${ui.th} w-28`} style={ui.thStyle}>
                            RUT
                          </th>

                          <th className={ui.th} style={ui.thStyle}>
                            Nombre
                          </th>

                          <th
                            className={`${ui.th} w-20 whitespace-nowrap border-r-0`}
                            style={{
                              ...ui.thStyle,

                              borderRightColor: "transparent",
                            }}
                          >
                            Acciones
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {items.map((jugador) => {
                          const isSuperTree = isSuperTreePath(location.pathname);

                          const basePath = isSuperTree ? "/super-dashboard/admin/dashboard" : "/admin";

                          const to = `${basePath}/registrar-estadisticas/detalle-estadistica`;

                          const from = `${basePath}/registrar-estadisticas`;

                          return (
                            <tr key={String(jugador.jugador_id ?? jugador.rut)} className={ui.tr} style={ui.cssVars}>
                              <td className={`${ui.td} break-all`} style={ui.tdStyle}>
                                {jugador.rutConDV}
                              </td>

                              <td className={ui.td} style={ui.tdStyle}>
                                <span className="block truncate" title={jugador.nombre}>
                                  {jugador.nombre}
                                </span>
                              </td>

                              <td
                                className={`${ui.td} w-24 border-r-0`}
                                style={{
                                  ...ui.tdStyle,

                                  borderRightColor: "transparent",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(to, {
                                      state: {
                                        from,

                                        rut: String(jugador.rut ?? ""),

                                        jugador_id: jugador.jugador_id ?? null,

                                        scope: {
                                          ...scope,
                                        },

                                        breadcrumb: [
                                          {
                                            label: "Registrar Estadísticas",

                                            to: from,
                                          },

                                          {
                                            label: "Detalle Estadística",

                                            to,
                                          },
                                        ],
                                      },
                                    })
                                  }
                                  className={ui.actionBtn}
                                  style={ui.actionStyle}
                                  aria-label={`Editar estadísticas de ${jugador.nombre}`}
                                  title={`Editar estadísticas de ${jugador.nombre}`}
                                  disabled={!jugador.jugador_id && !jugador.rut}
                                >
                                  <Pencil size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
