// src/pages/admin/ListarEstadisticas.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api, { getToken, clearToken, clearSelectedAcademia, getSelectedAcademiaId } from "../../services/api";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { Pencil } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* =========================================================
   RUTAS
========================================================= */
const SUPER_ADMIN_ROOT = "/super-dashboard/admin/dashboard";

const isSuperTreePath = (pathname) => String(pathname || "").startsWith(SUPER_ADMIN_ROOT);

/* =========================================================
   SESIÓN / SCOPE
========================================================= */

/**
 * Contrato definitivo WELI:
 *
 * weli_selected_academia contiene EXCLUSIVAMENTE:
 *
 * "1"
 * "5"
 * "27"
 *
 * Nunca contiene JSON, nombre, deporte, RUT ni otros datos.
 */
const readSelectedAcademiaId = () => {
  return getSelectedAcademiaId();
};

const clearPanelSession = () => {
  try {
    clearToken?.();
  } catch {}

  try {
    clearSelectedAcademia?.();
  } catch {}
};

/* =========================================================
   JWT
========================================================= */

const isExpired = (decoded) => {
  const exp = Number(decoded?.exp ?? 0);
  if (!Number.isFinite(exp) || exp <= 0) return true;

  const now = Math.floor(Date.now() / 1000);
  return exp <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
};

const extractTokenAcademiaId = (decoded) => {
  const raw = decoded?.academia_id ?? decoded?.user?.academia_id ?? decoded?.academy_id ?? 0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
};

const extractTokenDeporteId = (decoded) => {
  const raw = decoded?.deporte_id ?? decoded?.user?.deporte_id ?? decoded?.sport_id ?? 0;

  const deporteId = Number(raw);

  return Number.isInteger(deporteId) && deporteId > 0 ? deporteId : 0;
};

/* =========================================================
   ERROR
========================================================= */

const getErrStatus = (requestError) => requestError?.status ?? requestError?.response?.status ?? 0;

/* =========================================================
   CONTEXTO ACADEMIA SUPERADMIN
========================================================= */

/**
 * Superadmin persiste sólo academia_id.
 *
 * Nombre y deporte se recuperan desde backend y permanecen
 * únicamente en memoria React.
 */
const fetchAcademiaContext = async (academiaId, signal) => {
  const response = await api.get(`/academias/${encodeURIComponent(String(academiaId))}`, {
    signal,
      });

  const item = response?.data?.item ?? response?.data?.academia ?? response?.data ?? null;

  const id = Number(item?.id ?? 0);

  if (!Number.isInteger(id) || id <= 0 || id !== Number(academiaId)) {
    const error = new Error("ACADEMIA_CONTEXT_INVALID");
    error.code = "ACADEMIA_CONTEXT_INVALID";
    throw error;
  }

  const deporteId = Number(item?.deporte_id ?? item?.sport_id ?? 0);

  return {
    id,
    deporte_id: Number.isInteger(deporteId) && deporteId > 0 ? deporteId : null,
    nombre: String(item?.nombre ?? "").trim() || null,
  };
};

/* =========================================================
   HELPERS FETCH
========================================================= */

const normalizeListResponse = (res) => {
  if (!res || res.status === 204) return [];

  const data = res?.data ?? res;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (data?.ok && Array.isArray(data.items)) return data.items;
  if (data?.ok && Array.isArray(data.data)) return data.data;

  return [];
};

/**
 * No construimos Authorization ni x-academia-id aquí.
 *
 * api.js es la única capa responsable de:
 * - Authorization;
 * - contexto tenant Superadmin;
 * - eliminación de headers manuales no autorizados.
 */
const tryGetList = async (paths, { signal } = {}) => {
  const list = Array.isArray(paths) ? paths : [paths];
  const variants = [];

  for (const pathRaw of list) {
    const path = String(pathRaw || "");
    const base = path.startsWith("/") ? path : `/${path}`;

    variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
  }

  const uniqueUrls = [...new Set(variants)];
  let lastError = null;

  for (const url of uniqueUrls) {
    try {
      const response = await api.get(url, { signal });
      return normalizeListResponse(response);
    } catch (requestError) {
      lastError = requestError;

      if (requestError?.name === "CanceledError" || requestError?.code === "ERR_CANCELED") {
        return [];
      }

      const status = getErrStatus(requestError);

      /* Auth/AuthZ no prueba endpoints alternativos. */
      if (status === 401 || status === 403) {
        throw requestError;
      }

      /* Sólo rutas inexistentes justifican fallback. */
      if (status === 404 || status === 405) {
        continue;
      }

      throw requestError;
    }
  }

  if (lastError) throw lastError;

  return [];
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

  const academiaRequestRef = useRef(null);

  useMobileAutoScrollTop();

  /* =======================================================
     ÁRBOL ACTUAL
  ======================================================= */

  const dashboardBase = useMemo(() => {
    return isSuperTreePath(location.pathname) ? SUPER_ADMIN_ROOT : "/admin";
  }, [location.pathname]);

  /* =======================================================
     BREADCRUMB ANTI-LOOP
  ======================================================= */

  const breadcrumbBootRef = useRef(false);

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

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
     CARGAR CONTEXTO SUPERADMIN
  ======================================================= */

  const loadSuperadminScope = useCallback(
    async ({ decoded, signal, redirectIfMissing = true }) => {
      const academiaId = readSelectedAcademiaId();

      if (!academiaId) {
        setScope({
          academia_id: null,
          deporte_id: null,
          academia_nombre: null,
        });

        if (redirectIfMissing) {
          navigate("/super-dashboard", {
            replace: true,
          });
        }

        return false;
      }

      try {
        const academia = await fetchAcademiaContext(academiaId, signal);

        if (signal?.aborted) {
          return false;
        }

        const tokenDeporteId = extractTokenDeporteId(decoded);

        const stateDeporteId = Number(location.state?.scope?.deporte_id ?? location.state?.scope?.sport_id ?? 0);

        const deporteId =
          academia.deporte_id ||
          tokenDeporteId ||
          (Number.isInteger(stateDeporteId) && stateDeporteId > 0 ? stateDeporteId : null);

        setScope({
          academia_id: academia.id,
          deporte_id: deporteId,
          academia_nombre: academia.nombre,
        });

        return true;
      } catch (requestError) {
        if (signal?.aborted) {
          return false;
        }

        const status = getErrStatus(requestError);

        if (status === 401) {
          clearPanelSession();

          navigate("/login", {
            replace: true,
          });

          return false;
        }

        if (status === 403 || status === 404 || requestError?.code === "ACADEMIA_CONTEXT_INVALID") {
          try {
            clearSelectedAcademia?.();
          } catch {}

          navigate("/super-dashboard", {
            replace: true,
          });

          return false;
        }

        setError(
          requestError?.response?.data?.message ??
            requestError?.data?.message ??
            requestError?.message ??
            "No fue posible cargar la academia seleccionada."
        );

        return false;
      }
    },
    [navigate, location.state]
  );

  /* =======================================================
     AUTH + SCOPE
  ======================================================= */

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
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

        const superTree = isSuperTreePath(location.pathname);

        /* ===============================================
           SUPERADMIN
        =============================================== */

        if (parsedRol === 3) {
          if (!superTree) {
            navigate("/super-dashboard", {
              replace: true,
            });

            return;
          }

          setRol(parsedRol);

          await loadSuperadminScope({
            decoded,
            signal: abort.signal,
          });

          return;
        }

        /* ===============================================
           ADMIN / STAFF
        =============================================== */

        if (superTree) {
          navigate("/admin", {
            replace: true,
          });

          return;
        }

        const academiaId = extractTokenAcademiaId(decoded);

        if (!academiaId) {
          throw new Error("missing-academia");
        }

        const deporteId = extractTokenDeporteId(decoded) || null;

        setRol(parsedRol);

        setScope({
          academia_id: academiaId,
          deporte_id: deporteId,
          academia_nombre: null,
        });
      } catch {
        if (abort.signal.aborted) {
          return;
        }

        clearPanelSession();

        navigate("/login", {
          replace: true,
        });
      }
    })();

    return () => {
      abort.abort();
    };
  }, [navigate, location.pathname, dashboardBase, loadSuperadminScope]);

  /* =======================================================
     LIVE UPDATE SUPERADMIN

     Escucha cambio real de ID.
     No existe polling de snapshots JSON.
  ======================================================= */

  useEffect(() => {
    if (rol !== 3 || !isSuperTreePath(location.pathname)) {
      return undefined;
    }

    const refreshScope = async () => {
      const token = getToken();

      if (!token) {
        clearPanelSession();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      let decoded;

      try {
        decoded = jwtDecode(token);
      } catch {
        clearPanelSession();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (isExpired(decoded) || extractRol(decoded) !== 3) {
        clearPanelSession();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      try {
        academiaRequestRef.current?.abort?.();
      } catch {}

      const controller = new AbortController();

      academiaRequestRef.current = controller;

      await loadSuperadminScope({
        decoded,
        signal: controller.signal,
      });
    };

    const onStorage = () => {
      void refreshScope();
        return;
      }

      void refreshScope();
    

    const onEvent = () => {
      void refreshScope();
    };

    window.addEventListener("storage", onStorage);

    window.addEventListener("weli:selectedAcademiaChanged", onEvent);

    return () => {
      try {
        academiaRequestRef.current?.abort?.();
      } catch {}

      window.removeEventListener("storage", onStorage);

      window.removeEventListener("weli:selectedAcademiaChanged", onEvent);
    };
  }, [rol, location.pathname, navigate, loadSuperadminScope]);

  /* =======================================================
     CARGA DE DATOS
  ======================================================= */

  useEffect(() => {
    if (rol == null) return;

    const superTree = isSuperTreePath(location.pathname);

    if (superTree && !scope.academia_id) {
      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const academiaId = scope.academia_id;

        const deporteId = scope.deporte_id;

        const jugadoresPaths = [];

        if (academiaId && deporteId) {
          if (rol === 2) {
            jugadoresPaths.push(
              `/jugadores/staff?academia_id=${academiaId}&deporte_id=${deporteId}`,
              `/jugadores/staff?academia_id=${academiaId}`
            );
          } else {
            jugadoresPaths.push(
              `/jugadores?academia_id=${academiaId}&deporte_id=${deporteId}`,
              `/jugadores?academia_id=${academiaId}`
            );
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
          }),

          tryGetList(["/categorias"], {
            signal: abort.signal,
          }),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        const jugadoresArr = Array.isArray(jugadores) ? jugadores : [];

        setJugadoresRaw(jugadoresArr);

        setCategoriasRaw(Array.isArray(categorias) ? categorias : []);

        /* ===============================================
           FALLBACK DE SCOPE DESDE DATOS AUTORIZADOS

           No modifica localStorage.
        =============================================== */

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

        /* ===============================================
           401 - SESIÓN INVÁLIDA
        =============================================== */

        if (status === 401) {
          clearPanelSession();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* ===============================================
           403 - SESIÓN VÁLIDA / SIN PERMISO

           No eliminamos sesión.
        =============================================== */

        if (status === 403) {
          setError("No tienes permisos para acceder a los jugadores de esta academia.");

          return;
        }

        setError(
          requestError?.response?.data?.message ??
            requestError?.data?.message ??
            requestError?.message ??
            "❌ Error al cargar los jugadores/categorías"
        );
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
                  {/* CABECERA */}

                  <header className="mb-4 flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-extrabold" style={ui.titleStyle}>
                      {categoria}
                    </h2>

                    <span className="text-xs" style={ui.subTextStyle}>
                      {items.length} jugador
                      {items.length !== 1 ? "es" : ""}
                    </span>
                  </header>

                  {/* TABLA */}

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

                          const basePath = isSuperTree ? SUPER_ADMIN_ROOT : "/admin";

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

                                        /*
                                         * Este scope viaja sólo
                                         * en memoria de React
                                         * Router. No se persiste.
                                         */
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
