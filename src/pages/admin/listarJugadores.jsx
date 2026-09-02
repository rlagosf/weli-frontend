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

    variants.push(
      base,

      base.endsWith("/") ? base.slice(0, -1) : `${base}/`
    );
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
  const { darkMode } = useTheme();

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
     UI
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-screen font-sans bg-transparent px-6 pt-6 pb-20";

    const title = darkMode ? "text-white" : "text-ra-marron";

    const subtitle = darkMode ? "text-white/70" : "text-ra-marron/70";

    const msgBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    const card =
      "max-w-6xl mx-auto rounded-2xl shadow-2xl border p-6 " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const line = darkMode ? "rgba(255,255,255,0.18)" : "rgba(109,88,41,0.22)";

    const border = `1px solid ${line}`;

    const tableWrap = "w-full overflow-x-auto";

    const table = "w-full text-xs sm:text-sm min-w-[900px] border-separate border-spacing-0";

    const thead = "text-[10px] sm:text-xs " + (darkMode ? "bg-black/20" : "bg-ra-cream/90");

    const thBase =
      "p-2 text-center whitespace-nowrap font-extrabold " + (darkMode ? "text-[#ffdda1]" : "text-[#6d5829]");

    const cellBorderStyle = {
      borderRight: border,

      borderBottom: border,
    };

    const headBorderStyle = {
      borderRight: border,

      borderBottom: border,

      borderTop: border,
    };

    const tr = "cursor-pointer transition " + (darkMode ? "hover:bg-white/10" : "hover:bg-white/70");

    const tdBase = "p-2 text-center " + (darkMode ? "text-white/90" : "text-ra-marron");

    const badge =
      "text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border " +
      (darkMode ? "bg-white/10 border-white/10 text-white/80" : "bg-white/60 border-ra-marron/10 text-ra-marron/80");

    return {
      page,
      title,
      subtitle,
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
      line,
    };
  }, [darkMode]);

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
      <div className={`${ui.page} flex justify-center items-center`}>
        <div className={ui.msgBox}>{error}</div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="max-w-6xl mx-auto">
        <div className="text-center">
          <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.title}`}>Lista de Jugadores</h1>

          <p className={`text-sm mt-2 ${ui.subtitle}`}>Selecciona un jugador para ver su detalle.</p>
        </div>
      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="mt-8">
        {!!error && (
          <div className="max-w-6xl mx-auto mb-6">
            <div className={ui.warnBox}>{error}</div>
          </div>
        )}

        {grupos.length === 0 ? (
          <div className={ui.card}>
            <p className={`text-center py-6 ${ui.subtitle}`}>No hay jugadores registrados.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grupos.map(([categoriaNombre, lista]) => (
              <div key={categoriaNombre} className={ui.card}>
                {/* =====================================
                      CABECERA CATEGORÍA
                  ===================================== */}

                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-xl font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                    Categoría {categoriaNombre}
                  </h3>

                  <span className={ui.badge}>Jugadores: {lista.length}</span>
                </div>

                <div
                  className="mt-4"
                  style={{
                    height: 1,

                    background: ui.line,
                  }}
                />

                {/* =====================================
                      TABLA
                  ===================================== */}

                <div className={`mt-4 ${ui.tableWrap}`}>
                  <table className={ui.table}>
                    <thead className={ui.thead}>
                      <tr>
                        <th
                          className={`${ui.thBase} w-44`}
                          style={{
                            ...ui.headBorderStyle,

                            borderLeft: ui.border,
                          }}
                        >
                          Nombre
                        </th>

                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          RUT
                        </th>

                        <th className={`${ui.thBase} w-16`} style={ui.headBorderStyle}>
                          Edad
                        </th>

                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          Teléfono
                        </th>

                        <th className={`${ui.thBase} w-44`} style={ui.headBorderStyle}>
                          Email
                        </th>

                        <th className={`${ui.thBase} w-28`} style={ui.headBorderStyle}>
                          Posición
                        </th>

                        <th className={`${ui.thBase} w-24`} style={ui.headBorderStyle}>
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
                          >
                            <td
                              className={ui.tdBase}
                              style={{
                                ...ui.cellBorderStyle,

                                borderLeft: ui.border,
                              }}
                            >
                              {jugador?.nombre_jugador ?? "—"}
                            </td>

                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {rutFmt || rutCrudo || "-"}
                            </td>

                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.edad ?? "-"}
                            </td>

                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.telefono ?? "-"}
                            </td>

                            <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                              {jugador?.email ?? "-"}
                            </td>

                            <td className={ui.tdBase} style={ui.cellBorderStyle}>
                              {jugador?.posicion?.nombre ?? jugador?.posicion_id ?? "-"}
                            </td>

                            <td
                              className={ui.tdBase}
                              style={{
                                ...ui.cellBorderStyle,

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
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
