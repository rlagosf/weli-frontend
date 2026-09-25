// src/pages/admin/listarJugadores.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";

import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";

import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* =======================
   🎨 Conjunto X

   Se conserva como referencia histórica del componente.
   La UI efectiva utiliza themeTokens.
======================= */

const PALETTE = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

/* =========================================================
   RUTAS
========================================================= */

const ADMIN_HOME = "/admin";
const SUPER_HOME = "/super-dashboard";
const SUPER_ADMIN_ROOT = "/super-dashboard/admin/dashboard";

/* =========================================================
   AUTH / HEADERS
========================================================= */

const isExpired = (decoded) => {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  return exp <= now;
};

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const parsed = Number(rawRol);

  return Number.isInteger(parsed) && [1, 2, 3].includes(parsed) ? parsed : 0;
};

/* ─────────────────────────────────────────────────────────
   ACADEMIA DESDE JWT

   EXCLUSIVAMENTE ADMIN / STAFF
───────────────────────────────────────────────────────── */

const extractTokenAcademiaId = (decoded) => {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
};

/* ─────────────────────────────────────────────────────────
   ÁRBOL SUPERADMIN
───────────────────────────────────────────────────────── */

const isSuperTreePath = (pathname) => {
  const path = String(pathname ?? "");

  return path === SUPER_ADMIN_ROOT || path.startsWith(`${SUPER_ADMIN_ROOT}/`);
};

/* =========================================================
   ACADEMIA SUPERADMIN

   EXCLUSIVAMENTE ROL 3
========================================================= */

/**
 * Soporta:
 *
 * "1"
 *
 * o:
 *
 * {
 *   id: 1
 * }
 */

const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    /* ===============================================
       FORMATO DIRECTO
    =============================================== */

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /* ===============================================
       SNAPSHOT JSON
    =============================================== */

    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? parsed?.academy_id ?? parsed?.academyId ?? 0
    );

    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

/* =========================================================
   HEADERS

   Se conserva el comportamiento existente:

   Authorization siempre.

   x-academia-id únicamente Superadmin.
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
   HELPERS RESPUESTA
========================================================= */

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

  if (data?.ok && Array.isArray(data?.data)) {
    return data.data;
  }

  if (data?.ok && Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
};

/* =========================================================
   GET CON FALLBACK CONTROLADO

   IMPORTANTE:

   Solo se intenta otra variante ante:
   - 404
   - 405

   No ocultamos:
   - 400
   - 401
   - 403
   - 409
   - 422
   - 500
   - etc.
========================================================= */

const tryGetList = async (paths, { signal, headers } = {}) => {
  const list = Array.isArray(paths) ? paths : [paths];

  const variants = [];

  for (const path of list) {
    const raw = String(path ?? "");

    const base = raw.startsWith("/") ? raw : `/${raw}`;

    variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
  }

  const uniqueUrls = [...new Set(variants)];

  let lastError = null;

  for (const url of uniqueUrls) {
    try {
      const response = await api.get(url, {
        signal,
        headers,
      });

      return normalizeListResponse(response);
    } catch (error) {
      lastError = error;

      /* ===============================================
         REQUEST CANCELADO
      =============================================== */

      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        return [];
      }

      const status = error?.status ?? error?.response?.status ?? 0;

      /* ===============================================
         AUTH / AUTHZ

         Nunca probar otra ruta.
      =============================================== */

      if (status === 401 || status === 403) {
        throw error;
      }

      /* ===============================================
         FALLBACK DE RUTA

         Solo 404 / 405.
      =============================================== */

      if (status === 404 || status === 405) {
        continue;
      }

      /* ===============================================
         ERROR REAL
      =============================================== */

      throw error;
    }
  }

  throw lastError ?? new Error("No fue posible cargar el recurso solicitado.");
};

/* =========================================================
   COMPONENTE
========================================================= */

export default function ListarJugadores() {
  const { darkMode, themeTokens } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();

  const [rolActual, setRolActual] = useState(0);

  const [jugadores, setJugadores] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState("");

  useMobileAutoScrollTop();

  /* =======================================================
     ÁRBOL ACTUAL
  ======================================================= */

  const superTree = useMemo(() => isSuperTreePath(location.pathname), [location.pathname]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            {
              to: location.pathname,

              label: "Listar Jugadores",
            },
          ],
        },
      });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  /* =======================================================
     VALIDACIÓN DE SESIÓN / ROL / CONTEXTO

     ADMIN / STAFF:
     academia desde JWT.

     SUPERADMIN:
     academia desde selector.

     No se mezclan ambos contextos.
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken?.() || "";

      /* ===============================================
         SIN TOKEN
      =============================================== */

      if (!token) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const decoded = jwtDecode(token);

      /* ===============================================
         TOKEN EXPIRADO
      =============================================== */

      if (isExpired(decoded)) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const rol = extractRol(decoded);

      /* ===============================================
         ROL INVÁLIDO
      =============================================== */

      if (!rol) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      /* =================================================
         SUPERADMIN
      ================================================= */

      if (rol === 3) {
        /*
         * Superadmin no debe operar
         * directamente desde /admin.
         *
         * Sesión válida:
         * NO logout.
         */

        if (!superTree) {
          navigate(SUPER_HOME, {
            replace: true,
          });

          return;
        }

        const academiaId = getAcademiaIdFromStorage();

        /*
         * Superadmin válido pero sin
         * academia seleccionada.
         *
         * NO logout.
         */

        if (!academiaId) {
          navigate(SUPER_HOME, {
            replace: true,
          });

          return;
        }

        setRolActual(rol);

        return;
      }

      /* =================================================
         ADMIN / STAFF
         roles 1 / 2
      ================================================= */

      /*
       * Roles 1/2 no deben operar
       * dentro del árbol Superadmin.
       *
       * NO logout.
       */

      if (superTree) {
        navigate(ADMIN_HOME, {
          replace: true,
        });

        return;
      }

      /*
       * Academia exclusivamente
       * desde JWT firmado.
       */

      const academiaId = extractTokenAcademiaId(decoded);

      /*
       * Un JWT de Admin/Staff válido
       * según el contrato actual debe
       * contener academia_id.
       */

      if (!academiaId) {
        clearToken?.();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      setRolActual(rol);
    } catch {
      clearToken?.();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, superTree]);

  /* =======================================================
     CARGAR JUGADORES + CATÁLOGOS
  ======================================================= */

  useEffect(() => {
    if (!rolActual) {
      return;
    }

    const abort = new AbortController();

    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const jugadoresPaths = ["/jugadores?include_inactivos=1", "/jugadores"];

        const [rawJugadores, posList, catList, estList] = await Promise.all([
          tryGetList(jugadoresPaths, {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/posiciones", "/posicion"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/categorias", "/categoria"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/estado", "/estados"], {
            signal: abort.signal,

            headers,
          }),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        /* =============================================
             POSICIONES
        ============================================= */

        const posMap = new Map(
          (posList ?? [])
            .map((posicion) => [
              Number(posicion?.id ?? posicion?.posicion_id),

              String(posicion?.nombre ?? posicion?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && Boolean(nombre))
        );

        /* =============================================
             CATEGORÍAS
        ============================================= */

        const catMap = new Map(
          (catList ?? [])
            .map((categoria) => [
              Number(categoria?.id ?? categoria?.categoria_id),

              String(categoria?.nombre ?? categoria?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && Boolean(nombre))
        );

        /* =============================================
             ESTADOS
        ============================================= */

        const estMap = new Map(
          (estList ?? [])
            .map((estado) => [
              Number(estado?.id ?? estado?.estado_id),

              String(estado?.nombre ?? estado?.descripcion ?? "").trim(),
            ])
            .filter(([id, nombre]) => Number.isFinite(id) && id > 0 && Boolean(nombre))
        );

        /* =============================================
             NORMALIZAR JUGADORES
        ============================================= */

        const safeJugadores = Array.isArray(rawJugadores) ? rawJugadores : [];

        const data = safeJugadores.map((jugador) => {
          const posId = Number(jugador?.posicion_id ?? jugador?.posicion?.id ?? NaN);

          const catId = Number(jugador?.categoria_id ?? jugador?.categoria?.id ?? NaN);

          const estId = Number(jugador?.estado_id ?? jugador?.estado?.id ?? NaN);

          const posicion =
            jugador?.posicion ??
            (Number.isFinite(posId) && posMap.has(posId)
              ? {
                  nombre: posMap.get(posId),
                }
              : null);

          const categoria =
            jugador?.categoria ??
            (Number.isFinite(catId) && catMap.has(catId)
              ? {
                  nombre: catMap.get(catId),
                }
              : null);

          const estado =
            jugador?.estado ??
            (Number.isFinite(estId) && estMap.has(estId)
              ? {
                  nombre: estMap.get(estId),
                }
              : null);

          return {
            ...jugador,
            posicion,
            categoria,
            estado,
          };
        });

        setJugadores(data);

        if (!data.length) {
          setError("⚠️ No se encontraron jugadores.");
        }
      } catch (err) {
        if (abort.signal.aborted) {
          return;
        }

        const status = err?.status ?? err?.response?.status ?? 0;

        /* =============================================
             401

             Sesión inválida.
        ============================================= */

        if (status === 401) {
          clearToken?.();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        /* =============================================
             403

             Sesión válida, acceso denegado.
             NO logout.
        ============================================= */

        if (status === 403) {
          setError(
            rolActual === 3
              ? "⚠️ No tienes permisos para listar jugadores en la academia seleccionada."
              : "No tienes permisos para listar jugadores."
          );

          return;
        }

        /* =============================================
             OTRO ERROR
        ============================================= */

        setError("❌ No se pudo cargar la lista de jugadores");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rolActual, navigate]);

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la fuente visual principal.

     El fallback es exclusivamente defensivo.
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

     MISMA BASE VISUAL DE listarPagos.jsx

     - Dashboard controla el fondo global.
     - Este componente permanece transparente.
     - Sólo las tarjetas reales tienen superficie.
     - Toda la apariencia consume themeTokens.
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16";

    const content = "w-full max-w-[1700px] mx-auto";

    const msgBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    const card =
      "max-w-6xl mx-auto rounded-2xl border p-4 sm:p-5 lg:p-6 shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    const tableWrap = "w-full overflow-x-auto";

    const table = "w-full text-xs sm:text-sm min-w-[900px] border-separate border-spacing-0";

    const thead = "text-[10px] sm:text-xs";

    const thBase = "p-2 text-center whitespace-nowrap font-extrabold";

    const tr = "weli-jugadores-row cursor-pointer transition-colors duration-200";

    const tdBase = "p-2 text-center";

    const badge = "text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border";

    const border = `1px solid ${tokens.border}`;

    const cellBorderStyle = {
      borderRight: border,

      borderBottom: border,
    };

    const headBorderStyle = {
      borderRight: border,

      borderBottom: border,

      borderTop: border,
    };

    return {
      page,
      content,
      msgBox,
      warnBox,
      card,
      tableWrap,
      table,
      thead,
      thBase,
      tr,
      tdBase,
      badge,
      cellBorderStyle,
      headBorderStyle,
      border,

      pageStyle: {
        color: tokens.text,
      },

      titleStyle: {
        color: tokens.text,
      },

      subtitleStyle: {
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
        color: tokens.text,
      },

      tdStyle: {
        color: tokens.text,
      },

      badgeStyle: {
        backgroundColor: tokens.surfaceSoft,

        borderColor: tokens.border,

        color: tokens.textMuted,
      },

      dividerStyle: {
        backgroundColor: tokens.border,
      },
    };
  }, [darkMode, tokens]);

  /* =======================================================
     IR AL DETALLE
  ======================================================= */

  const handleClick = (rut, stateBreadcrumb) => {
    const base = String(location.pathname ?? "").replace(/\/$/, "");

    const rutClean = String(rut ?? "").trim();

    if (!rutClean) {
      return;
    }

    const to = `${base}/detalle-jugador`;

    navigate(to, {
      state: {
        rut: rutClean,

        from: base,

        breadcrumb: [
          ...(stateBreadcrumb ?? [
            {
              label: "Listar Jugadores",

              to: base,
            },
          ]),

          {
            label: "Detalle Jugador",

            to,
          },
        ],
      },
    });
  };

  /* =======================================================
     AGRUPAR POR CATEGORÍA
  ======================================================= */

  const grupos = useMemo(() => {
    const map = new Map();

    for (const jugador of jugadores) {
      const categoria = jugador?.categoria?.nombre || "Sin categoría";

      if (!map.has(categoria)) {
        map.set(categoria, []);
      }

      map.get(categoria).push(jugador);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [jugadores]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     ERROR SIN DATOS
  ======================================================= */

  if (error && !jugadores.length) {
    return (
      <div className={ui.page} style={ui.pageStyle}>
        <div className={`${ui.content} min-h-[70vh] flex justify-center items-center`}>
          <div className={ui.msgBox}>{error}</div>
        </div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page} style={ui.pageStyle}>
      <style>
        {`
          .weli-jugadores-row:hover {
            background-color: ${tokens.surfaceHover} !important;
          }

          .weli-jugadores-row:focus-visible {
            outline: 2px solid ${tokens.focus};
            outline-offset: -2px;
          }
        `}
      </style>

      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="max-w-6xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={ui.titleStyle}>
              Lista de Jugadores
            </h1>

            <p className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] lg:text-base" style={ui.subtitleStyle}>
              Selecciona un jugador para ver su detalle.
            </p>
          </div>
        </header>

        {/* =================================================
            MAIN
        ================================================= */}

        <main className="mt-5 sm:mt-6">
          {!!error && (
            <div className="max-w-6xl mx-auto mb-6">
              <div className={ui.warnBox}>{error}</div>
            </div>
          )}

          {grupos.length === 0 ? (
            <div className={ui.card} style={ui.cardStyle}>
              <p className="text-center py-6" style={ui.subtitleStyle}>
                No hay jugadores registrados.
              </p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {grupos.map(([categoriaNombre, lista]) => (
                <section key={categoriaNombre} className={ui.card} style={ui.cardStyle}>
                  {/* =====================================
                        CABECERA CATEGORÍA
                    ===================================== */}

                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg sm:text-xl font-extrabold" style={ui.titleStyle}>
                      Categoría {categoriaNombre}
                    </h3>

                    <span className={ui.badge} style={ui.badgeStyle}>
                      Jugadores: {lista.length}
                    </span>
                  </div>

                  <div
                    className="mt-4"
                    style={{
                      height: 1,

                      backgroundColor: tokens.border,
                    }}
                  />

                  {/* =====================================
                        TABLA
                    ===================================== */}

                  <div className={`mt-4 ${ui.tableWrap}`}>
                    <table className={ui.table}>
                      <thead className={ui.thead} style={ui.theadStyle}>
                        <tr>
                          <th
                            className={`${ui.thBase} w-44`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,

                              borderLeft: ui.border,
                            }}
                          >
                            Nombre
                          </th>

                          <th
                            className={`${ui.thBase} w-28`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            RUT
                          </th>

                          <th
                            className={`${ui.thBase} w-16`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            Edad
                          </th>

                          <th
                            className={`${ui.thBase} w-28`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            Teléfono
                          </th>

                          <th
                            className={`${ui.thBase} w-44`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            Email
                          </th>

                          <th
                            className={`${ui.thBase} w-28`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            Posición
                          </th>

                          <th
                            className={`${ui.thBase} w-24`}
                            style={{
                              ...ui.headBorderStyle,
                              ...ui.thStyle,
                            }}
                          >
                            Estado
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {lista.map((jugador) => {
                          const rutCrudo = jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? null;

                          const rutFmt = rutCrudo ? formatRutWithDV(rutCrudo) : "-";

                          const rutKey = String(jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? "");

                          return (
                            <tr
                              key={`${categoriaNombre}-${rutKey || "no-rut"}`}
                              className={ui.tr}
                              onClick={() => handleClick(jugador?.rut_jugador ?? jugador?.rut ?? rutCrudo)}
                              title="Ver detalle del jugador"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();

                                  handleClick(jugador?.rut_jugador ?? jugador?.rut ?? rutCrudo);
                                }
                              }}
                            >
                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,

                                  borderLeft: ui.border,
                                }}
                              >
                                {jugador?.nombre_jugador ?? "—"}
                              </td>

                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,
                                }}
                              >
                                {rutFmt || rutCrudo || "-"}
                              </td>

                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,
                                }}
                              >
                                {jugador?.edad ?? "-"}
                              </td>

                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,
                                }}
                              >
                                {jugador?.telefono ?? "-"}
                              </td>

                              <td
                                className={`${ui.tdBase} break-all`}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,
                                }}
                              >
                                {jugador?.email ?? "-"}
                              </td>

                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,
                                }}
                              >
                                {jugador?.posicion?.nombre ?? jugador?.posicion_id ?? "-"}
                              </td>

                              <td
                                className={ui.tdBase}
                                style={{
                                  ...ui.cellBorderStyle,
                                  ...ui.tdStyle,

                                  borderRight: ui.border,
                                }}
                              >
                                {jugador?.estado?.nombre ?? jugador?.estado_id ?? "-"}
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
