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
 * La decodificación frontend NO valida criptográficamente el JWT.
 * Solamente se utiliza para comportamiento de interfaz.
 * La autorización efectiva sigue estando exclusivamente en backend.
 */
function decodeTokenSafe() {
  const token = getToken?.() || "";

  if (!token) return null;

  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function isTokenExpired(decoded) {
  const exp = Number(decoded?.exp ?? 0);

  if (!Number.isFinite(exp) || exp <= 0) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);

  return exp <= now;
}

function getRolFromDecoded(decoded) {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
}

function getRolFromTokenSafe() {
  const decoded = decodeTokenSafe();

  if (!decoded) return 0;

  return getRolFromDecoded(decoded);
}

function getAcademiaIdFromToken(decoded) {
  const raw = decoded?.academia_id ?? decoded?.user?.academia_id ?? 0;

  const academiaId = Number(raw);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
}

/**
 * Lee weli_selected_academia.
 * Se utiliza exclusivamente como contexto de academia objetivo
 * del Superadmin. Admin y Staff NO dependen de este valor.
 */
function readSelectedAcademiaIdSafe() {
  const key = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

  try {
    const raw = localStorage.getItem(key);

    if (!raw) return 0;

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academy_id ?? parsed?.academiaId ?? parsed?.value ?? 0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

function getPanelHomeByRol(rol) {
  return rol === 3 ? "/super-dashboard" : "/admin";
}

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
  if (!value) return null;

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

  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
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

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  return [];
};

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
   COLORES ESTABLES DE EVENTOS
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

  const { darkMode, themeTokens } = useTheme();

  const [isLoading, setIsLoading] = useState(true);

  const [eventos, setEventos] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());

  const [modalAbierto, setModalAbierto] = useState(false);

  const [nuevoEvento, setNuevoEvento] = useState({
    titulo: "",
    descripcion: "",
    fecha_inicio: new Date(),
    fecha_fin: new Date(),
  });

  const [eventoSel, setEventoSel] = useState(null);

  const [modalDetalle, setModalDetalle] = useState(false);

  const [error, setError] = useState("");

  const [mensaje, setMensaje] = useState("");

  const [modalCreado, setModalCreado] = useState(false);

  const [eventoCreadoData, setEventoCreadoData] = useState(null);

  const [modalConfirmDelete, setModalConfirmDelete] = useState(false);

  const [eventoDeleteTarget, setEventoDeleteTarget] = useState(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [modalEliminado, setModalEliminado] = useState(false);

  const [eventoEliminadoData, setEventoEliminadoData] = useState(null);

  const todayStart = useMemo(() => startOfDay(new Date()), []);

  useMobileAutoScrollTop();

  /* =======================================================
     TOKENS DE APARIENCIA

     ThemeContext es la fuente principal.
     El fallback sólo protege el componente si por algún motivo
     themeTokens todavía no se encuentra disponible.
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
     TENANT / ROLE GUARD

     Admin 1    → academia JWT
     Staff 2    → academia JWT
     Superadmin → academia seleccionada
  ======================================================= */

  const ensureScopeOrRedirect = useCallback(() => {
    const token = getToken?.() || "";

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

    if (!decoded) {
      hardLogoutToLogin(navigate, 0);

      return {
        ok: false,
        rol: 0,
        token,
        academiaId: 0,
      };
    }

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

    if (![1, 2, 3].includes(rol)) {
      hardLogoutToLogin(navigate, 0);

      return {
        ok: false,
        rol: 0,
        token,
        academiaId: 0,
      };
    }

    if (rol === 3) {
      const academiaId = readSelectedAcademiaIdSafe();

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

    const academiaId = getAcademiaIdFromToken(decoded);

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

            normalizedEvent.color = isHoliday(normalizedEvent.title) ? tokens.primary : pickEventColor(normalizedEvent);

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

        if (status === 401) {
          hardLogoutToLogin(navigate, rol);

          return;
        }

        if (status === 403) {
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
  }, [ensureScopeOrRedirect, navigate, tokens.primary]);

  /* =======================================================
     CALENDAR STYLING
  ======================================================= */

  const eventPropGetter = useCallback(
    (event) => {
      const holiday = isHoliday(event?.title);

      const base = holiday ? tokens.primary : event?.color || pickEventColor(event);

      return {
        style: {
          backgroundColor: base,
          borderRadius: 9999,

          color: holiday ? tokens.primaryContrast : "#FFFFFF",

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
    },
    [tokens.primary, tokens.primaryContrast]
  );

  /*
   * IMPORTANTE:
   *
   * react-big-calendar controla internamente las siete columnas.
   * dayPropGetter solamente aplica apariencia.
   *
   * Los días externos siguen existiendo estructuralmente para
   * mantener correctamente la posición del primer/último día,
   * pero quedan completamente invisibles.
   */

  const dayPropGetter = useCallback(
    (date) => {
      const isCurrentMonth =
        date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();

      const isPastDay = isBefore(startOfDay(date), todayStart);

      if (!isCurrentMonth) {
        return {
          className: "weli-outside-month",

          style: {
            backgroundColor: "transparent",

            borderColor: "transparent",

            color: tokens.textMuted,

            opacity: 0,

            pointerEvents: "none",
          },
        };
      }

      return {
        className: "weli-current-month",

        style: {
          backgroundColor: "transparent",

          color: tokens.text,

          opacity: isPastDay ? 0.55 : 1,

          filter: isPastDay ? "grayscale(0.5)" : "none",
        },
      };
    },
    [currentDate, todayStart, tokens.text, tokens.textMuted]
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
            className="min-h-10 px-3 rounded-xl border font-bold transition hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: tokens.surfaceSoft,

              borderColor: tokens.borderStrong,

              color: tokens.text,
            }}
            onClick={() => props.onNavigate("PREV")}
          >
            ◀
          </button>

          <button
            type="button"
            className="min-h-10 px-4 rounded-xl border font-extrabold transition hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: tokens.primary,

              borderColor: tokens.primary,

              color: tokens.primaryContrast,
            }}
            onClick={() => props.onNavigate("TODAY")}
          >
            Hoy
          </button>

          <button
            type="button"
            className="min-h-10 px-3 rounded-xl border font-bold transition hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: tokens.surfaceSoft,

              borderColor: tokens.borderStrong,

              color: tokens.text,
            }}
            onClick={() => props.onNavigate("NEXT")}
          >
            ▶
          </button>
        </div>

        <div
          className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-center"
          style={{
            color: tokens.text,
          }}
        >
          {format(props.date, "MMMM yyyy", {
            locale: esES,
          })}
        </div>
      </div>
    ),
    [tokens]
  );

  /* =======================================================
     CALENDAR SHELL
  ======================================================= */

  const calendarShell = useMemo(() => {
    const wrapper =
      "p-3 sm:p-4 rounded-2xl border overflow-x-hidden shadow-[0_14px_42px_rgba(0,0,0,0.12)] transition-colors duration-200";

    return {
      wrapper,

      style: {
        backgroundColor: tokens.surface,

        borderColor: tokens.border,

        color: tokens.text,
      },

      styleTag: `
          /* =================================================
             BASE
          ================================================= */

          .rbc-calendar,
          .rbc-month-view,
          .rbc-time-view,
          .rbc-agenda-view {
            border: none !important;
            color: ${tokens.text} !important;
            background: ${tokens.surface} !important;
          }

          .rbc-month-row,
          .rbc-header,
          .rbc-row-content {
            border: none !important;
          }

          /* =================================================
             CABECERAS
          ================================================= */

          .rbc-header {
            background: ${tokens.primary} !important;
            color: ${tokens.primaryContrast} !important;

            border: 1px solid ${tokens.primary} !important;
            border-radius: 10px;

            font-weight: 800;
            padding: 7px 0;
            margin: 2px;
            letter-spacing: .02em;
          }

          .rbc-header + .rbc-header {
            margin-left: 2px;
          }

          /* =================================================
             GRILLA
          ================================================= */

          .rbc-row-bg {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            width: 100% !important;
          }

          .rbc-row {
            flex-wrap: nowrap !important;
          }

          .rbc-day-bg {
            flex: 1 1 0% !important;

            width: auto !important;
            min-width: 0 !important;

            box-sizing: border-box !important;

            margin: 2px !important;

            border:
              1.4px solid ${tokens.border} !important;

            border-radius:
              12px !important;

            background:
              ${tokens.surface} !important;
          }

          /*
           * Días pertenecientes a meses externos.
           *
           * Se conservan estructuralmente para que el primer
           * día continúe ubicado bajo el día correcto de la
           * semana, pero visualmente desaparecen.
           */

          .rbc-day-bg.rbc-off-range-bg,
          .rbc-off-range-bg,
          .rbc-day-bg.weli-outside-month {
            background:
              transparent !important;

            border-color:
              transparent !important;

            box-shadow:
              none !important;

            pointer-events:
              none !important;
          }

          .weli-outside-month {
            background:
              transparent !important;

            border-color:
              transparent !important;

            box-shadow:
              none !important;

            color:
              ${tokens.textMuted} !important;

            opacity:
              0 !important;

            pointer-events:
              none !important;
          }

          /*
           * Los textos externos utilizan textMuted como token
           * semántico, aunque posteriormente quedan ocultos.
           */

          .rbc-off-range {
            color:
              ${tokens.textMuted} !important;
          }

          .rbc-off-range .rbc-button-link,
          .rbc-off-range .rbc-date-cell > a,
          .rbc-off-range a {
            color:
              ${tokens.textMuted} !important;

            visibility:
              hidden !important;

            pointer-events:
              none !important;
          }

          /*
           * Si una semana completa pertenece fuera del mes
           * actual, se elimina completamente del layout.
           *
           * De esta manera septiembre 2026 utiliza solamente
           * las cinco semanas necesarias y desaparece la
           * sexta fila vacía.
           */

          .rbc-month-row:not(
            :has(
              .rbc-row-bg
              > .rbc-day-bg:not(.rbc-off-range-bg)
            )
          ) {
            display:
              none !important;
          }

          /* =================================================
             CELDAS DEL MES ACTUAL
          ================================================= */

          .weli-current-month {
            border-color:
              ${tokens.border} !important;
          }

          .rbc-date-cell {
            position: relative;

            color:
              ${tokens.text} !important;
          }

          .rbc-date-cell > a,
          .rbc-date-cell .rbc-button-link {
            color:
              ${tokens.text} !important;

            font-weight:
              800;
          }

          .rbc-month-view .rbc-month-row {
            border-bottom:
              1px solid ${tokens.border} !important;
          }

          /* =================================================
             DÍA ACTUAL
          ================================================= */

          .rbc-today {
            background-color:
              ${tokens.surface2} !important;
          }

          .rbc-today .rbc-date-cell > a,
          .rbc-today .rbc-button-link {
            color:
              ${tokens.text} !important;
          }

          /* =================================================
             EVENTOS
          ================================================= */

          .rbc-month-view .rbc-row-segment {
            padding:
              6px 12px 2px 12px;

            overflow:
              visible;
          }

          .rbc-month-view .rbc-event {
            width:
              100% !important;

            margin:
              4px 0 !important;

            border-radius:
              9999px !important;

            overflow:
              hidden !important;

            box-shadow:
              0 1px 0 rgba(0,0,0,.08);

            border:
              none !important;
          }

          .rbc-month-view .rbc-event-content {
            width:
              100% !important;

            overflow:
              hidden !important;

            text-overflow:
              ellipsis !important;

            white-space:
              nowrap !important;

            text-align:
              center !important;

            line-height:
              20px;

            font-weight:
              700;
          }

          .rbc-show-more {
            color:
              ${tokens.primary} !important;

            background:
              transparent !important;

            font-weight:
              800 !important;
          }

          /* =================================================
             SELECCIÓN
          ================================================= */

          .rbc-slot-selection {
            background:
              ${tokens.primary} !important;

            color:
              ${tokens.primaryContrast} !important;
          }

          /* =================================================
             DATEPICKER
          ================================================= */

          .weli-datepicker,
          .weli-datepicker .react-datepicker-wrapper,
          .weli-datepicker .react-datepicker__input-container,
          .weli-datepicker input {
            width:
              100%;
          }

          .react-datepicker {
            background:
              ${tokens.surface} !important;

            border-color:
              ${tokens.border} !important;

            color:
              ${tokens.text} !important;
          }

          .react-datepicker__header {
            background:
              ${tokens.surface2} !important;

            border-bottom-color:
              ${tokens.border} !important;
          }

          .react-datepicker__current-month,
          .react-datepicker-time__header,
          .react-datepicker-year-header {
            color:
              ${tokens.text} !important;
          }

          .react-datepicker__day-name {
            color:
              ${tokens.textMuted} !important;
          }

          .react-datepicker__day,
          .react-datepicker__time-name {
            color:
              ${tokens.text} !important;
          }

          .react-datepicker__day--outside-month {
            color:
              ${tokens.textMuted} !important;
          }

          .react-datepicker__day:hover {
            background:
              ${tokens.surfaceHover} !important;
          }

          .react-datepicker__day--selected,
          .react-datepicker__day--keyboard-selected {
            background:
              ${tokens.primary} !important;

            color:
              ${tokens.primaryContrast} !important;
          }

          .react-datepicker__navigation-icon::before {
            border-color:
              ${tokens.textMuted} !important;
          }

          .react-datepicker__time-container {
            border-left-color:
              ${tokens.border} !important;
          }

          .react-datepicker__time {
            background:
              ${tokens.surface} !important;
          }

          .react-datepicker__time-box,
          .react-datepicker__time-list {
            background:
              ${tokens.surface} !important;
          }

          .react-datepicker__time-list-item {
            background:
              ${tokens.surface} !important;

            color:
              ${tokens.text} !important;
          }

          .react-datepicker__time-list-item:hover {
            background:
              ${tokens.surfaceHover} !important;
          }

          .react-datepicker__time-list-item--selected {
            background:
              ${tokens.primary} !important;

            color:
              ${tokens.primaryContrast} !important;
          }

          /* =================================================
             INPUTS / PLACEHOLDERS
          ================================================= */

          .weli-agenda-input {
            background:
              ${tokens.inputBg} !important;

            border-color:
              ${tokens.inputBorder} !important;

            color:
              ${tokens.inputText} !important;
          }

          .weli-agenda-input::placeholder {
            color:
              ${tokens.textMuted} !important;

            opacity:
              .72;
          }

          .weli-datepicker input {
            background:
              ${tokens.inputBg} !important;

            border-color:
              ${tokens.inputBorder} !important;

            color:
              ${tokens.inputText} !important;
          }

          .weli-datepicker input::placeholder {
            color:
              ${tokens.textMuted} !important;

            opacity:
              .72;
          }

          /* =================================================
             MOBILE
          ================================================= */

          @media (max-width: 640px) {
            .rbc-month-view {
              min-height:
                520px !important;
            }

            .rbc-month-view .rbc-row-segment {
              padding:
                6px 10px 2px 10px !important;
            }

            .rbc-month-view .rbc-event {
              font-size:
                .72rem !important;
            }
          }
        `,
    };
  }, [tokens]);

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

      const isSameMonth =
        clickedDate.getMonth() === currentDate.getMonth() && clickedDate.getFullYear() === currentDate.getFullYear();

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
       * NO x-academia-id manual.
       * api.js + backend determinan tenant efectivo.
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

      newEvent.color = isHoliday(newEvent.title) ? tokens.primary : pickEventColor(newEvent);

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

      if (status === 401) {
        hardLogoutToLogin(navigate, rol);

        return;
      }

      if (status === 403) {
        setError("No tienes permisos para crear eventos.");

        return;
      }

      setError(`❌ (${status || 500}) ${message}`);
    }
  }, [ensureScopeOrRedirect, nuevoEvento, todayStart, navigate, tokens.primary]);

  /* =======================================================
     CONFIRMAR / ELIMINAR EVENTO
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
     ESTILOS

     Dashboard controla el fondo global.
     Agenda permanece transparente.
     Todas las superficies consumen themeTokens.
  ======================================================= */

  const ui = {
    page: "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16 overflow-x-hidden font-sans",

    content: "w-full max-w-[1700px] mx-auto",

    modal: "w-full p-4 sm:p-6 rounded-2xl border shadow-2xl transition-colors duration-200",

    input:
      "weli-agenda-input w-full min-h-11 rounded-xl px-3.5 py-2.5 border outline-none text-[14px] sm:text-[15px] font-medium transition focus:ring-2",

    label: "block mb-1.5 text-[13px] sm:text-[14px] font-extrabold",

    primary:
      "inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition hover:opacity-90 active:scale-[0.98]",

    ghost:
      "inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2.5 text-[14px] sm:text-[15px] font-bold transition hover:opacity-90 active:scale-[0.98]",

    danger:
      "inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2.5 font-extrabold text-white bg-red-600 hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed",

    error:
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700"),

    ok:
      "rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold " +
      (darkMode
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"),
  };

  const pageStyle = {
    color: tokens.text,
  };

  const titleStyle = {
    color: tokens.text,
  };

  const subtitleStyle = {
    color: tokens.textMuted,
  };

  const modalStyle = {
    maxWidth: 620,

    backgroundColor: tokens.surface,

    borderColor: tokens.borderStrong,

    color: tokens.text,
  };

  const inputStyle = {
    backgroundColor: tokens.inputBg,

    borderColor: tokens.inputBorder,

    color: tokens.inputText,

    "--tw-ring-color": `${tokens.focus}33`,
  };

  const labelStyle = {
    color: tokens.text,
  };

  const primaryStyle = {
    backgroundColor: tokens.primary,

    borderColor: tokens.primary,

    color: tokens.primaryContrast,
  };

  const ghostStyle = {
    backgroundColor: tokens.surfaceSoft,

    borderColor: tokens.borderStrong,

    color: tokens.text,
  };

  const textAreaBase = ui.input;

  const btnPrimary = ui.primary;

  const btnGhost = ui.ghost;

  const btnDanger = ui.danger;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page} style={pageStyle}>
      <div className={ui.content}>
        <header className="text-center mb-5">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight" style={titleStyle}>
            Agenda
          </h1>

          <p className="mx-auto mt-2 max-w-3xl text-[14px] sm:text-[15px] lg:text-base" style={subtitleStyle}>
            Gestiona y visualiza los eventos programados de la academia.
          </p>
        </header>

        <div className="space-y-3 mb-4">
          {error && <div className={ui.error}>{error}</div>}

          {mensaje && <div className={ui.ok}>{mensaje}</div>}
        </div>

        {/* =================================================
            CALENDARIO
        ================================================= */}

        <div className={calendarShell.wrapper} style={calendarShell.style}>
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6"
            style={{
              backgroundColor: tokens.overlay,
            }}
          >
            <div className={ui.modal} style={modalStyle}>
              <div className="mb-4">
                <h3
                  className="text-2xl text-center font-extrabold"
                  style={{
                    color: tokens.text,
                  }}
                >
                  Crear evento
                </h3>

                <p
                  className="text-center text-sm mt-1"
                  style={{
                    color: tokens.textMuted,
                  }}
                >
                  Completa los datos del evento y presiona Guardar.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={ui.label} style={labelStyle}>
                    Título
                  </label>

                  <input
                    className={ui.input}
                    style={inputStyle}
                    value={nuevoEvento.titulo}
                    onChange={(event) =>
                      setNuevoEvento({
                        ...nuevoEvento,

                        titulo: event.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className={ui.label} style={labelStyle}>
                    Descripción
                  </label>

                  <textarea
                    rows={3}
                    className={textAreaBase}
                    style={inputStyle}
                    value={nuevoEvento.descripcion}
                    onChange={(event) =>
                      setNuevoEvento({
                        ...nuevoEvento,

                        descripcion: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="w-full">
                    <label className={ui.label} style={labelStyle}>
                      Inicio
                    </label>

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
                        className={ui.input}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="w-full">
                    <label className={ui.label} style={labelStyle}>
                      Fin
                    </label>

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
                        className={ui.input}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                <button type="button" onClick={() => setModalAbierto(false)} className={btnGhost} style={ghostStyle}>
                  Cancelar
                </button>

                <button type="button" onClick={guardarEvento} className={btnPrimary} style={primaryStyle}>
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
        ================================================= */}

        {/*
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
    </div>
  );
}
