// src/pages/admin/agenda.jsx

import { useEffect, useMemo, useState, useCallback } from "react";

import { useNavigate } from "react-router-dom";

import { jwtDecode } from "jwt-decode";

import { useTheme } from "../../context/ThemeContext";

import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";

import IsLoading from "../../components/isLoading";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";

import { format, parse, startOfWeek, getDay, addDays, addMinutes, startOfDay, isBefore } from "date-fns";

import esES from "date-fns/locale/es";

import "react-big-calendar/lib/css/react-big-calendar.css";

import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =========================================================
   🎨 Conjunto WELI (cobre)
========================================================= */

const PALETTE = {
  fucsia: "#aa5013",
  marron: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

const THEME = PALETTE.fucsia;

/* =========================================================
   CALENDAR LOCALIZER
========================================================= */

const locales = {
  es: esES,
};

const localizer = dateFnsLocalizer({
  format,
  parse,

  startOfWeek: () =>
    startOfWeek(new Date(), {
      weekStartsOn: 1,
    }),

  getDay,
  locales,
});

/* =========================================================
   AUTH / TENANT HELPERS
========================================================= */

/**
 * IMPORTANTE:
 *
 * La decodificación frontend NO valida
 * criptográficamente el JWT.
 *
 * Solamente se utiliza para comportamiento
 * de interfaz.
 *
 * La autorización efectiva sigue estando
 * exclusivamente en backend.
 */

function decodeTokenSafe() {
  const token = getToken?.() || "";

  if (!token) {
    return null;
  }

  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   EXPIRACIÓN
───────────────────────────────────────────────────────── */

function isTokenExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  return exp <= now;
}

/* ─────────────────────────────────────────────────────────
   ROL
───────────────────────────────────────────────────────── */

function getRolFromDecoded(decoded) {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function getRolFromTokenSafe() {
  const decoded = decodeTokenSafe();

  if (!decoded) {
    return 0;
  }

  return getRolFromDecoded(decoded);
}

/* ─────────────────────────────────────────────────────────
   ACADEMIA FIRMADA EN JWT
   SOLO ADMIN / STAFF
───────────────────────────────────────────────────────── */

function getAcademiaIdFromToken(decoded) {
  const raw = decoded?.academia_id ?? decoded?.user?.academia_id ?? 0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/* ─────────────────────────────────────────────────────────
   ACADEMIA SELECCIONADA
   SOLO SUPERADMIN
───────────────────────────────────────────────────────── */

/**
 * Lee weli_selected_academia.
 *
 * Se utiliza exclusivamente como contexto
 * de academia objetivo del Superadmin.
 *
 * Admin y Staff NO dependen de este valor.
 */
function readSelectedAcademiaIdSafe() {
  const key = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return 0;
    }

    /*
     * Compatibilidad:
     *
     * "12"
     */
    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    /*
     * Compatibilidad:
     *
     * {
     *   id: 12
     * }
     */
    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? parsed?.value ?? 0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

/* ─────────────────────────────────────────────────────────
   HOME SEGÚN ROL
───────────────────────────────────────────────────────── */

function getPanelHomeByRol(rol) {
  return rol === 3 ? "/super-dashboard" : "/admin";
}

/* ─────────────────────────────────────────────────────────
   LOGOUT REAL

   SOLO:
   - sin token;
   - token inválido;
   - token expirado;
   - estructura JWT inválida.
───────────────────────────────────────────────────────── */

function hardLogoutToLogin(navigate, rol = 0) {
  try {
    clearToken?.();
  } catch {}

  navigate("/login", {
    replace: true,

    state: {
      from: getPanelHomeByRol(rol),
    },
  });
}

/* =========================================================
   DATE HELPERS
========================================================= */

const toDateSafe = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && value.includes(" ")) {
    const parsed = parse(value, "yyyy-MM-dd HH:mm:ss", new Date());

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const toSQLDateTime = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return null;
  }

  const pad = (number) => String(number).padStart(2, "0");

  const yyyy = dateObj.getFullYear();

  const mm = pad(dateObj.getMonth() + 1);

  const dd = pad(dateObj.getDate());

  const HH = pad(dateObj.getHours());

  const MM = pad(dateObj.getMinutes());

  const SS = pad(dateObj.getSeconds());

  return `${yyyy}-${mm}-${dd} ` + `${HH}:${MM}:${SS}`;
};

const isHoliday = (title = "") => {
  const text = String(title).toLowerCase();

  return text.includes("feriado") || text.includes("festivo");
};

const prettyDT = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "—";
  }

  return format(date, "dd-MM-yyyy HH:mm", {
    locale: esES,
  });
};

/* =========================================================
   API HELPERS
========================================================= */

const getList = async (path, signal) => {
  const variants = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  for (const url of variants) {
    try {
      const response = await api.get(url, {
        signal,
      });

      const data = response?.data;

      if (Array.isArray(data)) {
        return data;
      }

      if (Array.isArray(data?.items)) {
        return data.items;
      }

      if (Array.isArray(data?.results)) {
        return data.results;
      }

      if (Array.isArray(data?.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      if (
        error?.name === "CanceledError" ||
        error?.code === "ERR_CANCELED" ||
        String(error?.message ?? "")
          .toLowerCase()
          .includes("canceled")
      ) {
        return [];
      }

      const status = error?.status ?? error?.response?.status;

      /*
       * 401 y 403 no activan
       * fallback de URL.
       *
       * Deben llegar al caller.
       */
      if (status === 401 || status === 403) {
        throw error;
      }

      /*
       * Para cualquier otro error
       * probamos variante con/sin slash.
       */
    }
  }

  return [];
};

/* ─────────────────────────────────────────────────────────
   DELETE CON VARIANTES
───────────────────────────────────────────────────────── */

const delWithVariants = async (path) => {
  const variants = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of variants) {
    try {
      return await api.delete(url);
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status && status !== 404) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("No se pudo eliminar el evento");
};

/* =========================================================
   COLORES ESTABLES
========================================================= */

const EVENT_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#A855F7",
  "#F97316",
  "#EF4444",
  "#F59E0B",
  "#06B6D4",
  "#64748B",
];

const hashString = (value = "") => {
  const str = String(value);

  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);

    hash |= 0;
  }

  return Math.abs(hash);
};

const pickEventColor = (event) => {
  const key = event?.id != null ? `id:${event.id}` : `t:${event?.title ?? ""}`;

  const index = hashString(key) % EVENT_COLORS.length;

  return EVENT_COLORS[index];
};

/* =========================================================
   COMPONENT
========================================================= */

export default function Agenda() {
  const navigate = useNavigate();

  const { darkMode } = useTheme();

  /* =======================================================
     STATE
  ======================================================= */

  const [isLoading, setIsLoading] = useState(true);

  const [eventos, setEventos] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());

  /* ───────────────────────────────────────────────────────
     MODAL CREAR
  ─────────────────────────────────────────────────────── */

  const [modalAbierto, setModalAbierto] = useState(false);

  const [nuevoEvento, setNuevoEvento] = useState({
    titulo: "",
    descripcion: "",
    fecha_inicio: new Date(),
    fecha_fin: new Date(),
  });

  /* ───────────────────────────────────────────────────────
     DETALLE
  ─────────────────────────────────────────────────────── */

  const [eventoSel, setEventoSel] = useState(null);

  const [modalDetalle, setModalDetalle] = useState(false);

  /* ───────────────────────────────────────────────────────
     MENSAJES
  ─────────────────────────────────────────────────────── */

  const [error, setError] = useState("");

  const [mensaje, setMensaje] = useState("");

  /* ───────────────────────────────────────────────────────
     MODAL CREADO
  ─────────────────────────────────────────────────────── */

  const [modalCreado, setModalCreado] = useState(false);

  const [eventoCreadoData, setEventoCreadoData] = useState(null);

  /* ───────────────────────────────────────────────────────
     ELIMINACIÓN
  ─────────────────────────────────────────────────────── */

  const [modalConfirmDelete, setModalConfirmDelete] = useState(false);

  const [eventoDeleteTarget, setEventoDeleteTarget] = useState(null);

  const [isDeleting, setIsDeleting] = useState(false);

  /* ───────────────────────────────────────────────────────
     MODAL ELIMINADO
  ─────────────────────────────────────────────────────── */

  const [modalEliminado, setModalEliminado] = useState(false);

  const [eventoEliminadoData, setEventoEliminadoData] = useState(null);

  const todayStart = useMemo(() => startOfDay(new Date()), []);

  useMobileAutoScrollTop();

  /* =======================================================
     TENANT / ROLE GUARD

     REGLAS FINALES:

     Admin 1
     → academia desde JWT

     Staff 2
     → academia desde JWT

     Superadmin 3
     → academia desde localStorage
  ======================================================= */

  const ensureScopeOrRedirect = useCallback(() => {
    const token = getToken?.() || "";

    /*
     * Sin token no existe
     * sesión utilizable.
     */
    if (!token) {
      hardLogoutToLogin(navigate, 0);

      return {
        ok: false,
        rol: 0,
        token: "",
        academiaId: 0,
      };
    }

    const decoded = decodeTokenSafe();

    /*
     * Token ilegible.
     */
    if (!decoded) {
      hardLogoutToLogin(navigate, 0);

      return {
        ok: false,
        rol: 0,
        token,
        academiaId: 0,
      };
    }

    /*
     * Token expirado.
     */
    if (isTokenExpired(decoded)) {
      const rol = getRolFromDecoded(decoded);

      hardLogoutToLogin(navigate, rol);

      return {
        ok: false,
        rol,
        token,
        academiaId: 0,
      };
    }

    const rol = getRolFromDecoded(decoded);

    /*
     * Agenda solamente admite
     * roles de panel conocidos.
     */
    if (![1, 2, 3].includes(rol)) {
      hardLogoutToLogin(navigate, 0);

      return {
        ok: false,
        rol: 0,
        token,
        academiaId: 0,
      };
    }

    /* =================================================
           SUPERADMIN
        ================================================= */

    if (rol === 3) {
      const academiaId = readSelectedAcademiaIdSafe();

      /*
       * Superadmin necesita
       * seleccionar academia objetivo.
       *
       * NO se destruye su sesión.
       */
      if (academiaId <= 0) {
        navigate("/super-dashboard", {
          replace: true,
        });

        return {
          ok: false,
          rol,
          token,
          academiaId: 0,
        };
      }

      return {
        ok: true,
        rol,
        token,
        academiaId,
      };
    }

    /* =================================================
           ADMIN / STAFF
        ================================================= */

    /*
     * CORRECCIÓN CRÍTICA:
     *
     * NO usamos:
     *
     * weli_selected_academia
     *
     * Admin/Staff reciben academia_id
     * desde el JWT firmado por backend.
     */
    const academiaId = getAcademiaIdFromToken(decoded);

    /*
     * Si un token de Admin/Staff no trae
     * academia_id, su estructura no cumple
     * el contrato vigente.
     */
    if (academiaId <= 0) {
      hardLogoutToLogin(navigate, rol);

      return {
        ok: false,
        rol,
        token,
        academiaId: 0,
      };
    }

    return {
      ok: true,
      rol,
      token,
      academiaId,
    };
  }, [navigate]);

  /* =======================================================
     LOAD EVENTS
  ======================================================= */

  useEffect(() => {
    const guard = ensureScopeOrRedirect();

    if (!guard.ok) {
      setIsLoading(false);

      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);

      setError("");
      setMensaje("");

      try {
        /*
         * No enviamos academia_id.
         *
         * api.js resuelve:
         *
         * Admin/Staff
         * → Bearer únicamente
         *
         * Superadmin
         * → Bearer + x-academia-id
         */
        const arr = await getList("/eventos", abort.signal);

        const mapped = arr
          .map((event) => {
            const start = toDateSafe(event?.fecha_inicio ?? event?.start);

            const end = toDateSafe(event?.fecha_fin ?? event?.end);

            if (!start || !end) {
              return null;
            }

            const normalizedEvent = {
              id: event.id,

              title: event?.titulo ?? event?.title ?? `Evento #${event.id}`,

              desc: event?.descripcion ?? event?.desc ?? "",

              start,
              end,

              allDay:
                event.allDay === true ||
                (start.getHours() === 0 && end.getHours() === 0 && start.toDateString() !== end.toDateString()),
            };

            normalizedEvent.color = isHoliday(normalizedEvent.title) ? THEME : pickEventColor(normalizedEvent);

            return normalizedEvent;
          })
          .filter(Boolean);

        if (!abort.signal.aborted) {
          setEventos(mapped);
        }
      } catch (errorRequest) {
        if (abort.signal.aborted) {
          return;
        }

        const status = errorRequest?.status ?? errorRequest?.response?.status;

        const message = String(
          errorRequest?.response?.data?.message ?? errorRequest?.data?.message ?? errorRequest?.message ?? ""
        ).trim();

        const rol = getRolFromTokenSafe();

        /* ─────────────────────────────────────
             401
             SESIÓN INVÁLIDA
          ───────────────────────────────────── */

        if (status === 401) {
          hardLogoutToLogin(navigate, rol);

          return;
        }

        /* ─────────────────────────────────────
             403
             SESIÓN VÁLIDA / ACCESO DENEGADO
          ───────────────────────────────────── */

        if (status === 403) {
          /*
           * Si es Superadmin y desapareció
           * la academia seleccionada,
           * vuelve al selector.
           *
           * NO borra token.
           */
          if (rol === 3) {
            const academiaId = readSelectedAcademiaIdSafe();

            if (academiaId <= 0) {
              navigate("/super-dashboard", {
                replace: true,
              });

              return;
            }
          }

          setError(message || "No tienes permisos para acceder a Agenda.");

          return;
        }

        setError(message || "❌ Error al cargar eventos.");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [ensureScopeOrRedirect, navigate]);

  /* =======================================================
     UI: CALENDAR STYLING
  ======================================================= */

  const eventPropGetter = useCallback((event) => {
    const base = isHoliday(event?.title) ? THEME : event?.color || pickEventColor(event);

    return {
      style: {
        backgroundColor: base,

        borderRadius: 9999,

        color: "white",

        fontSize: "0.78rem",

        padding: "3px 10px",

        width: "100%",

        minHeight: "22px",

        lineHeight: "16px",

        boxSizing: "border-box",

        overflow: "hidden",

        whiteSpace: "nowrap",

        textOverflow: "ellipsis",

        display: "flex",

        alignItems: "center",

        justifyContent: "center",

        border: "none",
      },
    };
  }, []);

  const dayPropGetter = useCallback(
    (date) => {
      const isCurrentMonth = date.getMonth() === currentDate.getMonth();

      const isPastDay = isBefore(startOfDay(date), todayStart);

      const style = {
        margin: "2px",

        padding: "6px 1px",

        borderRadius: "12px",

        boxSizing: "border-box",

        minHeight: "90px",

        width: "100%",

        display: "flex",

        flexDirection: "column",

        justifyContent: "flex-start",

        alignItems: "flex-end",

        background: "transparent",

        border: "1.4px solid " + THEME + "22",

        opacity: isPastDay ? 0.55 : 1,

        filter: isPastDay ? "grayscale(0.5)" : "none",
      };

      if (!isCurrentMonth) {
        return {
          style: {
            ...style,

            opacity: 0.85,

            filter: "grayscale(0.2)",
          },
        };
      }

      return {
        style,
      };
    },
    [currentDate, todayStart]
  );

  /* =======================================================
     TOOLBAR
  ======================================================= */

  const Toolbar = useCallback(
    (props) => (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={
              "px-3 py-1 rounded-lg border " + (darkMode ? "border-white/20" : "border-black/10") + " hover:opacity-80"
            }
            onClick={() => props.onNavigate("PREV")}
          >
            ◀
          </button>

          <button
            type="button"
            className="px-4 py-1 rounded-lg text-white font-extrabold"
            style={{
              backgroundColor: THEME,
            }}
            onClick={() => props.onNavigate("TODAY")}
          >
            Hoy
          </button>

          <button
            type="button"
            className={
              "px-3 py-1 rounded-lg border " + (darkMode ? "border-white/20" : "border-black/10") + " hover:opacity-80"
            }
            onClick={() => props.onNavigate("NEXT")}
          >
            ▶
          </button>
        </div>

        <div className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-center">
          {format(props.date, "MMMM yyyy", {
            locale: esES,
          })}
        </div>
      </div>
    ),
    [darkMode]
  );

  /* =======================================================
     CALENDAR SHELL
  ======================================================= */

  const calendarShell = useMemo(() => {
    const wrapper =
      "p-4 rounded-2xl shadow-lg overflow-x-hidden border " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    return {
      wrapper,

      styleTag: `
            .rbc-calendar,
            .rbc-month-view,
            .rbc-time-view,
            .rbc-agenda-view {
              border: none !important;
            }

            .rbc-month-row,
            .rbc-header,
            .rbc-row-content {
              border: none !important;
            }

            .rbc-date-cell {
              position: relative;
            }

            .rbc-header {
              background: ${THEME};
              color: #fff;
              border-radius: 10px;
              font-weight: 800;
              padding: 7px 0;
              margin: 2px;
              letter-spacing: .02em;
            }

            .rbc-header + .rbc-header {
              margin-left: 2px;
            }

            .rbc-month-view .rbc-row-bg .rbc-day-bg {
              border-right: 1px solid ${THEME}33 !important;
            }

            .rbc-month-view .rbc-month-row {
              border-bottom: 1px solid ${THEME}33 !important;
            }

            .rbc-today {
              background-color: ${THEME}14 !important;
            }

            .rbc-off-range-bg {
              background: transparent !important;
            }

            .rbc-off-range .rbc-date-cell > a {
              color: ${THEME};
              font-weight: 900;
            }

            .rbc-month-view .rbc-row-segment {
              padding: 6px 12px 2px 12px;
              overflow: visible;
            }

            .rbc-month-view .rbc-event {
              width: 100% !important;
              margin: 4px 0 !important;
              border-radius: 9999px !important;
              overflow: hidden !important;
              box-shadow: 0 1px 0 rgba(0,0,0,.08);
              border: none !important;
            }

            .rbc-month-view .rbc-event-content {
              width: 100% !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
              text-align: center !important;
              line-height: 20px;
              font-weight: 700;
            }

            .weli-datepicker {
              width: 100%;
            }

            .weli-datepicker .react-datepicker-wrapper {
              width: 100%;
            }

            .weli-datepicker .react-datepicker__input-container {
              width: 100%;
            }

            .weli-datepicker input {
              width: 100%;
            }

            @media (max-width: 640px) {
              .rbc-month-view {
                min-height: 520px !important;
              }

              .rbc-month-view .rbc-row-segment {
                padding: 6px 10px 2px 10px !important;
              }

              .rbc-month-view .rbc-event {
                font-size: 0.72rem !important;
              }
            }
          `,
    };
  }, [darkMode]);

  /* =======================================================
     ABRIR CREACIÓN
  ======================================================= */

  const abrirModal = useCallback(
    (slotInfo) => {
      const clickedDate = slotInfo.start;

      if (isBefore(startOfDay(clickedDate), todayStart)) {
        setMensaje("");

        setError("No puedes agendar eventos en días pasados.");

        return;
      }

      const isSameMonth = clickedDate.getMonth() === currentDate.getMonth();

      if (!isSameMonth) {
        return;
      }

      const inicio = new Date(clickedDate);

      const finDefault = addMinutes(inicio, 60);

      setNuevoEvento({
        titulo: "",
        descripcion: "",
        fecha_inicio: inicio,
        fecha_fin: finDefault,
      });

      setMensaje("");
      setError("");

      setModalAbierto(true);
    },
    [currentDate, todayStart]
  );

  /* =======================================================
     GUARDAR EVENTO
  ======================================================= */

  const guardarEvento = useCallback(async () => {
    const guard = ensureScopeOrRedirect();

    if (!guard.ok) {
      return;
    }

    setMensaje("");
    setError("");

    const inicio = new Date(nuevoEvento.fecha_inicio);

    const fin = new Date(nuevoEvento.fecha_fin);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      setError("Fechas inválidas.");

      return;
    }

    if (isBefore(startOfDay(inicio), todayStart)) {
      setError("No puedes agendar eventos en días pasados.");

      return;
    }

    let finAjustado = fin;

    if (inicio.toDateString() !== fin.toDateString() && inicio.getHours() === 0 && fin.getHours() === 0) {
      finAjustado = addDays(fin, 1);
    }

    if (finAjustado <= inicio) {
      setError("La fecha/hora de término debe ser mayor a la de inicio.");

      return;
    }

    const startSQL = toSQLDateTime(inicio);

    const endSQL = toSQLDateTime(finAjustado);

    if (!startSQL || !endSQL) {
      setError("Error formateando fechas.");

      return;
    }

    try {
      const payload = {
        titulo: String(nuevoEvento.titulo ?? "").trim(),

        descripcion: String(nuevoEvento.descripcion ?? "").trim() || null,

        fecha_inicio: startSQL,

        fecha_fin: endSQL,
      };

      if (!payload.titulo) {
        setError("El título es obligatorio.");

        return;
      }

      /*
       * NO academia_id en body.
       *
       * NO x-academia-id manual.
       *
       * api.js + backend determinan
       * tenant efectivo.
       */
      const response = await api.post("/eventos", payload);

      const creado = response?.data?.item ?? response?.data;

      if (!creado) {
        setMensaje("Evento creado, pero la respuesta no incluyó el item.");

        setModalAbierto(false);

        return;
      }

      const start = toDateSafe(creado?.fecha_inicio ?? creado?.start);

      const end = toDateSafe(creado?.fecha_fin ?? creado?.end);

      if (!start || !end) {
        setMensaje("Evento creado. (No se pudo parsear fechas retornadas)");

        setModalAbierto(false);

        return;
      }

      const newEvent = {
        id: creado.id,

        title: creado?.titulo ?? creado?.title ?? payload.titulo,

        desc: creado?.descripcion ?? creado?.desc ?? payload.descripcion ?? "",

        start,
        end,

        allDay: start.getHours() === 0 && end.getHours() === 0 && start.toDateString() !== end.toDateString(),
      };

      newEvent.color = isHoliday(newEvent.title) ? THEME : pickEventColor(newEvent);

      setEventos((previous) => [...previous, newEvent]);

      setModalAbierto(false);

      setEventoCreadoData(newEvent);

      setModalCreado(true);

      setMensaje("✅ Evento creado correctamente.");
    } catch (errorRequest) {
      const status = errorRequest?.status ?? errorRequest?.response?.status;

      const message =
        errorRequest?.response?.data?.message ??
        errorRequest?.data?.message ??
        errorRequest?.message ??
        "Error al guardar evento";

      const rol = getRolFromTokenSafe();

      /*
       * 401:
       * sesión inválida.
       */
      if (status === 401) {
        hardLogoutToLogin(navigate, rol);

        return;
      }

      /*
       * 403:
       * sesión válida,
       * permiso insuficiente.
       *
       * NO logout.
       */
      if (status === 403) {
        setError("No tienes permisos para crear eventos.");

        return;
      }

      setError(`❌ (${status || 500}) ${message}`);
    }
  }, [ensureScopeOrRedirect, nuevoEvento, todayStart, navigate]);

  /* =======================================================
     CONFIRMAR ELIMINACIÓN
  ======================================================= */

  const pedirConfirmacionEliminar = useCallback(() => {
    if (!eventoSel?.id) {
      return;
    }

    setError("");
    setMensaje("");

    setEventoDeleteTarget(eventoSel);

    setModalConfirmDelete(true);
  }, [eventoSel]);

  /* =======================================================
     ELIMINAR EVENTO
  ======================================================= */

  const confirmarEliminarEvento = useCallback(async () => {
    const guard = ensureScopeOrRedirect();

    if (!guard.ok) {
      return;
    }

    if (!eventoDeleteTarget?.id || isDeleting) {
      return;
    }

    setIsDeleting(true);

    setError("");
    setMensaje("");

    try {
      /*
       * Igual que create:
       *
       * - Admin/Staff: tenant JWT.
       * - Superadmin: header inyectado por api.js.
       */
      await delWithVariants(`/eventos/${eventoDeleteTarget.id}`);

      setEventos((previous) => previous.filter((event) => event.id !== eventoDeleteTarget.id));

      setModalConfirmDelete(false);

      setModalDetalle(false);

      setEventoEliminadoData(eventoDeleteTarget);

      setModalEliminado(true);

      setEventoDeleteTarget(null);
    } catch (errorRequest) {
      const status = errorRequest?.status ?? errorRequest?.response?.status;

      const message =
        errorRequest?.response?.data?.message ??
        errorRequest?.data?.message ??
        errorRequest?.message ??
        "Error al eliminar evento";

      const rol = getRolFromTokenSafe();

      if (status === 401) {
        hardLogoutToLogin(navigate, rol);

        return;
      }

      /*
       * 403 NO elimina sesión.
       */
      if (status === 403) {
        setError("No tienes permisos para eliminar eventos.");

        return;
      }

      setError(`❌ (${status || 500}) ${message}`);
    } finally {
      setIsDeleting(false);
    }
  }, [ensureScopeOrRedirect, eventoDeleteTarget, isDeleting, navigate]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     ESTILO
  ======================================================= */

  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const fondo = `${shell} min-h-screen px-4 sm:px-6 pb-16 overflow-x-hidden font-sans`;

  const modalBase =
    "p-6 rounded-2xl shadow-2xl w-full border " +
    (darkMode ? "bg-[#111827] border-white/15 text-white" : "bg-ra-cream border-ra-marron/15 text-ra-marron");

  const inputBase =
    "w-full rounded-xl px-4 py-3 border outline-none transition " +
    (darkMode
      ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
      : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta");

  const textAreaBase = inputBase;

  const btnPrimary = "rounded-xl px-6 py-3 font-extrabold text-white hover:opacity-90 active:scale-[0.98] transition";

  const btnGhost =
    "rounded-xl px-5 py-3 border font-bold transition active:scale-[0.98] " +
    (darkMode
      ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
      : "bg-white/60 border-ra-marron/15 hover:bg-white/80 text-ra-marron");

  const btnDanger =
    "rounded-xl px-5 py-3 font-extrabold text-white bg-red-600 hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed";

  const msgError = darkMode ? "text-red-200" : "text-red-700";

  const msgOk = darkMode ? "text-emerald-200" : "text-emerald-700";

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={fondo}>
      <h1 className="text-3xl font-extrabold text-center mb-3 tracking-wide">Agenda</h1>

      {error && <p className={`${msgError} text-center mb-2 font-bold`}>{error}</p>}

      {mensaje && <p className={`${msgOk} text-center mb-2 font-bold`}>{mensaje}</p>}

      {/* =================================================
          CALENDARIO
      ================================================= */}

      <div className={calendarShell.wrapper}>
        <style>{calendarShell.styleTag}</style>

        <Calendar
          localizer={localizer}
          events={eventos}
          date={currentDate}
          onNavigate={setCurrentDate}
          startAccessor="start"
          endAccessor="end"
          views={["month"]}
          popup={false}
          selectable="ignoreEvents"
          longPressThreshold={1}
          onSelecting={() => true}
          onSelectSlot={abrirModal}
          dayLayoutAlgorithm="no-overlap"
          style={{
            minHeight: 680,

            height: "100%",

            width: "100%",
          }}
          onDoubleClickEvent={(event) => {
            setEventoSel(event);

            setModalDetalle(true);
          }}
          onSelectEvent={(event) => {
            setEventoSel(event);

            setModalDetalle(true);
          }}
          components={{
            toolbar: Toolbar,
          }}
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          messages={{
            next: "Siguiente",

            previous: "Anterior",

            today: "Hoy",

            month: "Mes",

            week: "Semana",

            day: "Día",

            agenda: "Agenda",

            date: "Fecha",

            time: "Hora",

            event: "Evento",

            noEventsInRange: "No hay eventos",
          }}
        />
      </div>

      {/* =================================================
          MODAL CREAR
      ================================================= */}

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 px-3">
          <div
            className={modalBase}
            style={{
              maxWidth: 620,
            }}
          >
            <div className="mb-4">
              <h3 className="text-2xl text-center font-extrabold">Crear evento</h3>

              <p className="text-center text-sm opacity-75 mt-1">Completa los datos del evento y presiona Guardar.</p>
            </div>

            <div className="space-y-3">
              {/* Título */}

              <div>
                <label className="block mb-1 opacity-80 font-semibold">Título</label>

                <input
                  className={inputBase}
                  value={nuevoEvento.titulo}
                  onChange={(event) =>
                    setNuevoEvento({
                      ...nuevoEvento,

                      titulo: event.target.value,
                    })
                  }
                />
              </div>

              {/* Descripción */}

              <div>
                <label className="block mb-1 opacity-80 font-semibold">Descripción</label>

                <textarea
                  rows={3}
                  className={textAreaBase}
                  value={nuevoEvento.descripcion}
                  onChange={(event) =>
                    setNuevoEvento({
                      ...nuevoEvento,

                      descripcion: event.target.value,
                    })
                  }
                />
              </div>

              {/* Fechas */}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Inicio */}

                <div className="w-full">
                  <label className="block mb-1 opacity-80 font-semibold">Inicio</label>

                  <div className="weli-datepicker">
                    <DatePicker
                      selected={new Date(nuevoEvento.fecha_inicio)}
                      onChange={(date) => {
                        if (!date) {
                          return;
                        }

                        setNuevoEvento({
                          ...nuevoEvento,

                          fecha_inicio: date,
                        });
                      }}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="dd-MM-yyyy HH:mm"
                      minDate={todayStart}
                      className={inputBase}
                    />
                  </div>
                </div>

                {/* Fin */}

                <div className="w-full">
                  <label className="block mb-1 opacity-80 font-semibold">Fin</label>

                  <div className="weli-datepicker">
                    <DatePicker
                      selected={new Date(nuevoEvento.fecha_fin)}
                      onChange={(date) => {
                        if (!date) {
                          return;
                        }

                        setNuevoEvento({
                          ...nuevoEvento,

                          fecha_fin: date,
                        });
                      }}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="dd-MM-yyyy HH:mm"
                      minDate={todayStart}
                      className={inputBase}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <button type="button" onClick={() => setModalAbierto(false)} className={btnGhost}>
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarEvento}
                className={btnPrimary}
                style={{
                  backgroundColor: THEME,
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          MODAL DETALLE

          El archivo proporcionado no contiene actualmente
          el JSX original de estos modales. Se conserva
          el estado y handlers existentes sin inventar UI.
      ================================================= */}

      {modalDetalle && eventoSel && false}

      {/* =================================================
          ESTADOS MANTENIDOS DEL COMPONENTE ORIGINAL

          modalCreado
          eventoCreadoData
          modalConfirmDelete
          eventoDeleteTarget
          isDeleting
          modalEliminado
          eventoEliminadoData
          pedirConfirmacionEliminar
          confirmarEliminarEvento

          El archivo fuente recibido no contiene sus
          respectivos bloques JSX.
      ================================================= */}

      {/*
        Las siguientes referencias se mantienen
        intencionadamente porque forman parte del
        componente recibido y pueden volver a usarse
        cuando reincorporemos sus modales completos:

        modalCreado
        eventoCreadoData
        modalConfirmDelete
        eventoDeleteTarget
        isDeleting
        modalEliminado
        eventoEliminadoData
        pedirConfirmacionEliminar
        confirmarEliminarEvento
        prettyDT
        btnDanger
      */}
    </div>
  );
}
