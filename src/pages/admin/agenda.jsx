// src/pages/admin/agenda.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addDays,
  addMinutes,
  startOfDay,
  isBefore,
} from "date-fns";
import esES from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

/* =======================
   WELI: Theme
======================= */
const THEME = "#e82d89";

/* =======================
   Calendar Localizer
======================= */
const locales = { es: esES };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

/* =======================
   Helpers: Auth / Academia
======================= */
function getRolFromTokenSafe() {
  const t = getToken?.();
  if (!t) return 0;
  try {
    const p = jwtDecode(t);
    return Number(p?.rol_id ?? 0) || 0;
  } catch {
    return 0;
  }
}

function readSelectedAcademiaIdSafe() {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY || "weli_selected_academia");
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
}

function getPanelHomeByRol(rol) {
  return rol === 3 ? "/super-dashboard" : "/admin";
}

/* =======================
   Helpers: Dates
======================= */
const toDateSafe = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;

  if (typeof v === "string" && v.includes(" ")) {
    const parsed = parse(v, "yyyy-MM-dd HH:mm:ss", new Date());
    return isNaN(parsed) ? null : parsed;
  }

  const d = new Date(v);
  return isNaN(d) ? null : d;
};

const toSQLDateTime = (dateObj) => {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  const mm = pad(dateObj.getMonth() + 1);
  const dd = pad(dateObj.getDate());
  const HH = pad(dateObj.getHours());
  const MM = pad(dateObj.getMinutes());
  const SS = pad(dateObj.getSeconds());
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
};

const isHoliday = (title = "") => {
  const t = String(title).toLowerCase();
  return t.includes("feriado") || t.includes("festivo");
};

const prettyDT = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return "—";
  return format(d, "dd-MM-yyyy HH:mm", { locale: esES });
};

/* =======================
   Helpers: API Variants
======================= */
const getList = async (path, signal) => {
  const variants = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  for (const url of variants) {
    try {
      const r = await api.get(url, { signal });
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.items)) return d.items;
      if (Array.isArray(d?.results)) return d.results;
      return [];
    } catch (e) {
      if (
        e?.name === "CanceledError" ||
        e?.code === "ERR_CANCELED" ||
        String(e?.message || "").toLowerCase().includes("canceled")
      ) {
        return [];
      }

      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
      // prueba siguiente variante
    }
  }
  return [];
};

const delWithVariants = async (path) => {
  const variants = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr;
  for (const url of variants) {
    try {
      return await api.delete(url);
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st && st !== 404) throw e;
    }
  }
  throw lastErr;
};

/* =======================
   🎨 Colores estables
======================= */
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

const hashString = (s = "") => {
  const str = String(s);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

const pickEventColor = (e) => {
  const key = e?.id != null ? `id:${e.id}` : `t:${e?.title || ""}`;
  const idx = hashString(key) % EVENT_COLORS.length;
  return EVENT_COLORS[idx];
};

export default function Agenda() {
  const navigate = useNavigate();
  const { darkMode } = useTheme();

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

  // Modal “Evento creado”
  const [modalCreado, setModalCreado] = useState(false);
  const [eventoCreadoData, setEventoCreadoData] = useState(null);

  // Confirmación eliminar
  const [modalConfirmDelete, setModalConfirmDelete] = useState(false);
  const [eventoDeleteTarget, setEventoDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal “Evento eliminado”
  const [modalEliminado, setModalEliminado] = useState(false);
  const [eventoEliminadoData, setEventoEliminadoData] = useState(null);

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  useMobileAutoScrollTop();

  /* =======================
     Load Events (sin flicker)
  ======================= */
  useEffect(() => {
    const t = getToken?.();
    const rol = getRolFromTokenSafe();

    if (!t) {
      setIsLoading(false);
      return;
    }

    // ✅ SUPERADMIN: si no hay academia seleccionada, NO intentes /eventos
    if (rol === 3) {
      const academiaId = readSelectedAcademiaIdSafe();
      if (academiaId <= 0) {
        setIsLoading(false);
        navigate("/super-dashboard", { replace: true });
        return;
      }
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const arr = await getList("/eventos", abort.signal);

        const mapped = arr
          .map((e) => {
            const start = toDateSafe(e?.fecha_inicio ?? e?.start);
            const end = toDateSafe(e?.fecha_fin ?? e?.end);
            if (!start || !end) return null;

            const ev = {
              id: e.id,
              title: e.titulo ?? e.title ?? `Evento #${e.id}`,
              desc: e.descripcion ?? e.desc ?? "",
              start,
              end,
              allDay:
                e.allDay === true ||
                (start.getHours() === 0 &&
                  end.getHours() === 0 &&
                  start.toDateString() !== end.toDateString()),
            };

            ev.color = isHoliday(ev.title) ? THEME : pickEventColor(ev);
            return ev;
          })
          .filter(Boolean);

        setEventos(mapped);
      } catch (e) {
        const st = e?.status ?? e?.response?.status;
        const msg = String(e?.data?.message || e?.message || "").trim();

        if (st === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 403) {
          // ✅ NO logout por 403
          if (rol === 3) {
            const academiaId = readSelectedAcademiaIdSafe();
            if (academiaId <= 0) {
              // superadmin sin academia: lo mandamos al selector
              navigate("/super-dashboard", { replace: true });
              return;
            }
          }
          // si sí hay academia, nos quedamos y mostramos error (sin rebote)
          setError(msg || "No tienes permisos para acceder a Agenda.");
          return;
        }

        setError(msg || "❌ Error al cargar eventos.");
      } finally {
        setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [navigate]);

  /* =======================
     UI: Calendar Styling
  ======================= */
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
        return { style: { ...style, opacity: 0.85, filter: "grayscale(0.2)" } };
      }
      return { style };
    },
    [currentDate, todayStart]
  );

  const Toolbar = useCallback(
    (props) => (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            className={
              "px-3 py-1 rounded-lg border " +
              (darkMode ? "border-white/30" : "border-[#1d0b0b]/30") +
              " hover:opacity-80"
            }
            onClick={() => props.onNavigate("PREV")}
          >
            ◀
          </button>
          <button
            className="px-4 py-1 rounded-lg text-white"
            style={{ backgroundColor: THEME }}
            onClick={() => props.onNavigate("TODAY")}
          >
            Hoy
          </button>
          <button
            className={
              "px-3 py-1 rounded-lg border " +
              (darkMode ? "border-white/30" : "border-[#1d0b0b]/30") +
              " hover:opacity-80"
            }
            onClick={() => props.onNavigate("NEXT")}
          >
            ▶
          </button>
        </div>
        <div className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-center">
          {format(props.date, "MMMM yyyy", { locale: esES })}
        </div>
      </div>
    ),
    [darkMode]
  );

  const calendarShell = useMemo(() => {
    return {
      wrapper:
        (darkMode ? "bg-[#1f2937]" : "bg-white") +
        " p-4 rounded-xl shadow overflow-x-hidden",
      styleTag: `
        .rbc-calendar, .rbc-month-view, .rbc-time-view, .rbc-agenda-view { border: none !important; }
        .rbc-month-row, .rbc-header, .rbc-row-content { border: none !important; }
        .rbc-date-cell { position: relative; }

        .rbc-header {
          background: ${THEME};
          color: #fff;
          border-radius: 6px;
          font-weight: 700;
          padding: 6px 0;
          margin: 2px;
        }
        .rbc-header + .rbc-header { margin-left: 2px; }

        .rbc-month-view .rbc-row-bg .rbc-day-bg { border-right: 1px solid ${THEME}44 !important; }
        .rbc-month-view .rbc-month-row { border-bottom: 1px solid ${THEME}44 !important; }
        .rbc-today { background-color: ${THEME}14 !important; }
        .rbc-off-range-bg { background: transparent !important; }
        .rbc-off-range .rbc-date-cell > a { color: ${THEME}; font-weight: 800; }

        .rbc-month-view .rbc-row-segment{
          padding: 6px 12px 2px 12px;
          overflow: visible;
        }
        .rbc-month-view .rbc-event{
          width: 100% !important;
          margin: 4px 0 !important;
          border-radius: 9999px !important;
          overflow: hidden !important;
          box-shadow: 0 1px 0 rgba(0,0,0,.08);
          border: none !important;
        }
        .rbc-month-view .rbc-event-content{
          width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
          text-align: center !important;
          line-height: 20px;
        }

        .weli-datepicker { width: 100%; }
        .weli-datepicker .react-datepicker-wrapper { width: 100%; }
        .weli-datepicker .react-datepicker__input-container { width: 100%; }
        .weli-datepicker input { width: 100%; }

        @media (max-width: 640px) {
          .rbc-month-view { min-height: 520px !important; }
          .rbc-month-view .rbc-row-segment{ padding: 6px 10px 2px 10px !important; }
          .rbc-month-view .rbc-event{ font-size: 0.72rem !important; }
        }
      `,
    };
  }, [darkMode]);

  /* =======================
     Actions
  ======================= */
  const abrirModal = useCallback(
    (slotInfo) => {
      const clickedDate = slotInfo.start;

      if (isBefore(startOfDay(clickedDate), todayStart)) {
        setMensaje("");
        setError("No puedes agendar eventos en días pasados.");
        return;
      }

      const isSameMonth = clickedDate.getMonth() === currentDate.getMonth();
      if (!isSameMonth) return;

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

  const guardarEvento = useCallback(async () => {
    setMensaje("");
    setError("");

    const inicio = new Date(nuevoEvento.fecha_inicio);
    const fin = new Date(nuevoEvento.fecha_fin);

    if (isNaN(inicio) || isNaN(fin)) {
      setError("Fechas inválidas.");
      return;
    }

    if (isBefore(startOfDay(inicio), todayStart)) {
      setError("No puedes agendar eventos en días pasados.");
      return;
    }

    let finAjustado = fin;
    if (
      inicio.toDateString() !== fin.toDateString() &&
      inicio.getHours() === 0 &&
      fin.getHours() === 0
    ) {
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
        titulo: (nuevoEvento.titulo || "").trim(),
        descripcion: (nuevoEvento.descripcion || "").trim() || null,
        fecha_inicio: startSQL,
        fecha_fin: endSQL,
      };

      if (!payload.titulo) {
        setError("El título es obligatorio.");
        return;
      }

      const res = await api.post("/eventos", payload);
      const creado = res?.data?.item ?? res?.data;

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
        title: creado.titulo ?? creado.title ?? payload.titulo,
        desc: creado.descripcion ?? creado.desc ?? payload.descripcion ?? "",
        start,
        end,
        allDay:
          start.getHours() === 0 &&
          end.getHours() === 0 &&
          start.toDateString() !== end.toDateString(),
      };
      newEvent.color = isHoliday(newEvent.title) ? THEME : pickEventColor(newEvent);

      setEventos((prev) => [...prev, newEvent]);

      setModalAbierto(false);
      setEventoCreadoData(newEvent);
      setModalCreado(true);
      setMensaje("✅ Evento creado correctamente.");
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      const msg = e?.message || "Error al guardar evento";

      if (st === 401) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      if (st === 403) {
        setError("No tienes permisos para crear eventos.");
        return;
      }

      setError(`❌ (${st || 500}) ${msg}`);
    }
  }, [nuevoEvento, todayStart, navigate]);

  const pedirConfirmacionEliminar = useCallback(() => {
    if (!eventoSel?.id) return;
    setError("");
    setMensaje("");
    setEventoDeleteTarget(eventoSel);
    setModalConfirmDelete(true);
  }, [eventoSel]);

  const confirmarEliminarEvento = useCallback(async () => {
    if (!eventoDeleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    setError("");
    setMensaje("");

    try {
      await delWithVariants("/eventos/" + eventoDeleteTarget.id);
      setEventos((prev) => prev.filter((e) => e.id !== eventoDeleteTarget.id));

      setModalConfirmDelete(false);
      setModalDetalle(false);

      setEventoEliminadoData(eventoDeleteTarget);
      setModalEliminado(true);
      setEventoDeleteTarget(null);
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      const msg = e?.message || "Error al eliminar evento";

      if (st === 401) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      if (st === 403) {
        setError("No tienes permisos para eliminar eventos.");
        return;
      }

      setError(`❌ (${st || 500}) ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [eventoDeleteTarget, isDeleting, navigate]);

  if (isLoading) return <IsLoading />;

  const fondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";

  const modalBase =
    (darkMode ? "bg-[#111827] text-white border-[#334155]" : "bg-white text-[#111827] border-slate-200") +
    " p-6 rounded-xl shadow-xl w-full border";

  const inputBase =
    (darkMode ? "bg-[#0b1220] text-white border-[#334155]" : "bg-white text-[#111827] border-slate-300") +
    " w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-[#e82d89]/30 focus:border-[#e82d89]/40";

  const textAreaBase =
    (darkMode ? "bg-[#0b1220] text-white border-[#334155]" : "bg-white text-[#111827] border-slate-300") +
    " w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-[#e82d89]/30 focus:border-[#e82d89]/40";

  const btnPrimary =
    "px-5 py-2.5 rounded-lg text-white shadow-sm hover:opacity-90 active:scale-[0.99] transition";
  const btnGhost =
    (darkMode ? "bg-white/10 hover:bg-white/15" : "bg-black/5 hover:bg-black/10") +
    " px-5 py-2.5 rounded-lg shadow-sm active:scale-[0.99] transition";
  const btnDanger =
    "px-5 py-2.5 rounded-lg text-white shadow-sm hover:opacity-90 active:scale-[0.99] transition bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className={fondo + " min-h-screen px-4 sm:px-6 pb-16 overflow-x-hidden"}>
      <h1 className="text-3xl font-bold text-center mb-3">Agenda</h1>

      {error && <p className="text-red-500 text-center mb-2">{error}</p>}
      {mensaje && <p className="text-green-600 text-center mb-2">{mensaje}</p>}

      {/* ... el resto de tu JSX (Calendar + Modales) va EXACTAMENTE igual que tu versión anterior ... */}
      {/* Mantén tu JSX tal como lo tienes; aquí no lo repito para no duplicar 900 líneas. */}
      {/* Importante: no cambies nada de la UI. El fix está arriba en el load/catches. */}

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
          style={{ minHeight: 680, height: "100%", width: "100%" }}
          onDoubleClickEvent={(e) => {
            setEventoSel(e);
            setModalDetalle(true);
          }}
          onSelectEvent={(e) => {
            setEventoSel(e);
            setModalDetalle(true);
          }}
          components={{ toolbar: Toolbar }}
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
      {/* Modal crear */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 px-3">
          <div className={modalBase} style={{ maxWidth: 620 }}>
            <div className="mb-4">
              <h3 className="text-2xl text-center" style={{ color: darkMode ? "#fff" : "#111827" }}>
                Crear evento
              </h3>
              <p className="text-center text-sm opacity-75 mt-1">
                Completa los datos del evento y presiona Guardar.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block mb-1 opacity-80">Título</label>
                <input
                  className={inputBase}
                  value={nuevoEvento.titulo}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, titulo: e.target.value })}
                />
              </div>

              <div>
                <label className="block mb-1 opacity-80">Descripción</label>
                <textarea
                  rows={3}
                  className={textAreaBase}
                  value={nuevoEvento.descripcion}
                  onChange={(e) => setNuevoEvento({ ...nuevoEvento, descripcion: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="w-full">
                  <label className="block mb-1 opacity-80">Inicio</label>
                  <div className="weli-datepicker">
                    <DatePicker
                      selected={new Date(nuevoEvento.fecha_inicio)}
                      onChange={(date) => {
                        if (!date) return;
                        setNuevoEvento({ ...nuevoEvento, fecha_inicio: date });
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

                <div className="w-full">
                  <label className="block mb-1 opacity-80">Fin</label>
                  <div className="weli-datepicker">
                    <DatePicker
                      selected={new Date(nuevoEvento.fecha_fin)}
                      onChange={(date) => {
                        if (!date) return;
                        setNuevoEvento({ ...nuevoEvento, fecha_fin: date });
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
              <button onClick={() => setModalAbierto(false)} className={btnGhost}>
                Cancelar
              </button>
              <button onClick={guardarEvento} className={btnPrimary} style={{ backgroundColor: THEME }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación creado */}
      {modalCreado && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 px-3">
          <div className={modalBase} style={{ maxWidth: 620 }}>
            <div className="mb-4">
              <h3 className="text-2xl text-center" style={{ color: darkMode ? "#fff" : "#111827" }}>
                Evento creado
              </h3>
              <p className="text-center text-sm opacity-75 mt-1">
                El evento fue registrado correctamente.
              </p>
            </div>

            <div
              className={
                (darkMode ? "bg-white/5 border-[#334155]" : "bg-slate-50 border-slate-200") +
                " border rounded-xl p-4"
              }
            >
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <div className="opacity-70">Título</div>
                  <div className="mt-0.5">{eventoCreadoData?.title || "—"}</div>
                </div>

                <div>
                  <div className="opacity-70">Descripción</div>
                  <div className="mt-0.5 whitespace-pre-wrap">{eventoCreadoData?.desc || "—"}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="opacity-70">Inicio</div>
                    <div className="mt-0.5">{prettyDT(eventoCreadoData?.start)}</div>
                  </div>
                  <div>
                    <div className="opacity-70">Fin</div>
                    <div className="mt-0.5">{prettyDT(eventoCreadoData?.end)}</div>
                  </div>
                </div>

                <div>
                  <div className="opacity-70">ID</div>
                  <div className="mt-0.5">{eventoCreadoData?.id ?? "—"}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  setModalCreado(false);
                  setEventoCreadoData(null);
                }}
                className={btnPrimary}
                style={{ backgroundColor: THEME }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 px-3">
          <div className={modalBase} style={{ maxWidth: 520 }}>
            <h3 className="text-lg mb-2">Detalle Evento</h3>

            <div className="space-y-2 text-sm">
              <div>
                <div className="opacity-70">Título</div>
                <div className="mt-0.5">{eventoSel?.title}</div>
              </div>
              <div>
                <div className="opacity-70">Descripción</div>
                <div className="mt-0.5 whitespace-pre-wrap">{eventoSel?.desc}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="opacity-70">Inicio</div>
                  <div className="mt-0.5">{prettyDT(eventoSel?.start)}</div>
                </div>
                <div>
                  <div className="opacity-70">Fin</div>
                  <div className="mt-0.5">{prettyDT(eventoSel?.end)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <button onClick={pedirConfirmacionEliminar} className={btnDanger}>
                Eliminar
              </button>
              <button onClick={() => setModalDetalle(false)} className={btnGhost}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminar */}
      {modalConfirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-3">
          <div className={modalBase} style={{ maxWidth: 520 }}>
            <div className="mb-3">
              <h3 className="text-xl text-center" style={{ color: darkMode ? "#fff" : "#111827" }}>
                ¿Estás seguro?
              </h3>
              <p className="text-center text-sm opacity-75 mt-1">
                Esta acción eliminará el evento y no se puede deshacer.
              </p>
            </div>

            <div
              className={
                (darkMode ? "bg-white/5 border-[#334155]" : "bg-slate-50 border-slate-200") +
                " border rounded-xl p-4 text-sm"
              }
            >
              <div className="grid gap-2">
                <div>
                  <div className="opacity-70">Título</div>
                  <div className="mt-0.5">{eventoDeleteTarget?.title || "—"}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="opacity-70">Inicio</div>
                    <div className="mt-0.5">{prettyDT(eventoDeleteTarget?.start)}</div>
                  </div>
                  <div>
                    <div className="opacity-70">Fin</div>
                    <div className="mt-0.5">{prettyDT(eventoDeleteTarget?.end)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={() => {
                  if (isDeleting) return;
                  setModalConfirmDelete(false);
                  setEventoDeleteTarget(null);
                }}
                className={btnGhost}
              >
                Cancelar
              </button>

              <button
                onClick={confirmarEliminarEvento}
                className={btnDanger}
                disabled={isDeleting}
                title={isDeleting ? "Eliminando..." : "Confirmar eliminación"}
              >
                {isDeleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal “evento eliminado” */}
      {modalEliminado && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 px-3">
          <div className={modalBase} style={{ maxWidth: 620 }}>
            <div className="mb-4">
              <h3 className="text-2xl text-center" style={{ color: darkMode ? "#fff" : "#111827" }}>
                Evento eliminado
              </h3>
              <p className="text-center text-sm opacity-75 mt-1">
                El evento fue eliminado correctamente.
              </p>
            </div>

            <div
              className={
                (darkMode ? "bg-white/5 border-[#334155]" : "bg-slate-50 border-slate-200") +
                " border rounded-xl p-4"
              }
            >
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <div className="opacity-70">Título</div>
                  <div className="mt-0.5">{eventoEliminadoData?.title || "—"}</div>
                </div>

                <div>
                  <div className="opacity-70">Descripción</div>
                  <div className="mt-0.5 whitespace-pre-wrap">{eventoEliminadoData?.desc || "—"}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="opacity-70">Inicio</div>
                    <div className="mt-0.5">{prettyDT(eventoEliminadoData?.start)}</div>
                  </div>
                  <div>
                    <div className="opacity-70">Fin</div>
                    <div className="mt-0.5">{prettyDT(eventoEliminadoData?.end)}</div>
                  </div>
                </div>

                <div>
                  <div className="opacity-70">ID</div>
                  <div className="mt-0.5">{eventoEliminadoData?.id ?? "—"}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  setModalEliminado(false);
                  setEventoEliminadoData(null);
                }}
                className={btnPrimary}
                style={{ backgroundColor: THEME }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
