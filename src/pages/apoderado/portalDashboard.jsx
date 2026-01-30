// src/pages/apoderado/portalDashboard.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { getToken, clearToken } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";
import { FiSettings, FiLogOut, FiSun, FiMoon } from "react-icons/fi";
import { FileText } from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* =======================
   Config
======================= */
const ACCENT = "#e82d89";

/* =======================
   Utils
======================= */
const getErrStatus = (err) => err?.status ?? err?.response?.status ?? 0;
const getErrMsg = (err) =>
  err?.data?.message ??
  err?.response?.data?.message ??
  err?.message ??
  "Error";

const clearSession = () => {
  try {
    localStorage.removeItem("user_info");
    localStorage.removeItem("apoderado_must_change_password");
  } catch {}
  try {
    clearToken();
  } catch {}
};

const pickNombreFromAny = (data) => {
  const src = data?.apoderado ?? data?.user ?? data?.usuario ?? data ?? {};
  const nombre = src?.nombre_apoderado ?? src?.nombre ?? src?.name ?? "";
  return String(nombre || "").trim();
};

const readUserInfoLocal = () => {
  try {
    const raw = localStorage.getItem("user_info");
    if (!raw) return "";
    const obj = JSON.parse(raw);
    return pickNombreFromAny(obj);
  } catch {
    return "";
  }
};

const fmtCLP = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
};

const fmtDate = (v) => {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}-${m}-${y}`;
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}-${mm}-${yy}`;
  }
  return s;
};

/* -----------------------
   Distancia: robusta
----------------------- */
const toNumberSmart = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;

  let s = String(v).trim();
  if (!s) return NaN;

  s = s.replace(/\u2212/g, "-"); // menos unicode

  // ES: miles "." y decimal ","
  if (s.includes(",")) {
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const pickDistanceFromStats = (estadisticasObj) => {
  const e = estadisticasObj || {};
  const entries = Object.entries(e);

  const priorityKeys = [
    "distancia_recorrida",
    "distancia",
    "km_recorridos",
    "kilometros",
    "distancia_km",
    "distanciaKm",
    "distancia_m",
    "metros_recorridos",
    "distancia_recorrida_m",
  ];

  for (const k of priorityKeys) {
    if (Object.prototype.hasOwnProperty.call(e, k)) {
      const rawVal = e[k];
      if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== "") {
        return { key: k, raw: String(rawVal).trim() };
      }
    }
  }

  const ranked = entries
    .filter(([_, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => {
      const key = String(k).toLowerCase();
      let score = 0;

      if (key.includes("distancia")) score += 100;
      if (key.includes("recorr")) score += 40;
      if (key.includes("km")) score += 30;
      if (key.includes("kil")) score += 20;
      if (key.includes("metro")) score += 10;

      if (key === "id" || key.includes("created") || key.includes("updated")) score -= 999;

      return { k, raw: String(v).trim(), score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score <= 0) return { key: null, raw: "" };
  return { key: best.k, raw: best.raw };
};

const normalizeDistanceKm = (raw) => {
  const n0 = toNumberSmart(raw);
  if (!Number.isFinite(n0)) return null;

  const kmMaybe = Math.abs(n0) > 50 ? n0 / 1000 : n0;
  return Math.max(0, Math.abs(kmMaybe));
};

const fmtKmCL = (km) => {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const s = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${s} km`;
};

/* -----------------------
   Pagos
----------------------- */
const normalizeSituacion = (p) => {
  const raw =
    p?.situacion_pago?.nombre ??
    p?.situacion ??
    p?.estado ??
    p?.estado_pago ??
    p?.estado_nombre ??
    p?.situacion_pago_id ??
    p?.estado_pago_id ??
    "";
  const s = String(raw).trim().toUpperCase();
  if (s === "PAGADO") return "PAGADO";
  if (s === "VENCIDO") return "VENCIDO";
  if (s === "PENDIENTE") return "PENDIENTE";
  return s || "—";
};

const situacionClass = (s, darkMode) => {
  const v = String(s || "").toUpperCase();
  if (v === "PAGADO") return "text-green-500";
  if (v === "VENCIDO") return "text-red-500";
  if (v === "PENDIENTE") return darkMode ? "text-white/80" : "text-black/70";
  return darkMode ? "text-white/70" : "text-black/60";
};

const Pill = ({ children, darkMode, big = false }) => (
  <span
    className={[
      "inline-flex items-center rounded-full font-extrabold",
      big ? "px-4 py-2 text-sm sm:text-base" : "px-3 py-1 text-xs",
      darkMode ? "bg-white/10 text-white/80" : "bg-black/5 text-black/70",
    ].join(" ")}
  >
    {children}
  </span>
);

const KpiCard = ({ title, value, sub, bg }) => (
  <div
    className="rounded-2xl p-4 border border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
    style={{ background: bg }}
  >
    <p className="text-[12px] font-black tracking-widest uppercase text-white/85">{title}</p>
    <div className="mt-1 text-3xl font-extrabold leading-none text-white">{value}</div>
    {sub ? <div className="mt-1 text-xs font-bold text-white/80">{sub}</div> : null}
  </div>
);

/* =======================
   Component
======================= */
export default function PortalDashboard() {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();

  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");

  const [apoderadoNombre, setApoderadoNombre] = useState("");

  const [jugadores, setJugadores] = useState([]);
  const [selectedRut, setSelectedRut] = useState("");

  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalle, setDetalle] = useState(null);

  const [contratoLoading, setContratoLoading] = useState(false);
  const [contratoError, setContratoError] = useState("");
  const [contratoUrl, setContratoUrl] = useState("");

  const [agendaItems, setAgendaItems] = useState([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState("");

  // ✅ Si tu api.js NO inyecta token automáticamente, deja esto.
  const authHeaders = useCallback(() => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const goLogin = useCallback(() => {
    clearSession();
    navigate("/login-apoderado", { replace: true });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await api.post(
        "/auth-apoderado/logout",
        { reason: "user_click" },
        { headers: authHeaders() }
      );
    } catch {
      // si falla auditoría, igual cerramos sesión
    } finally {
      clearSession();
      navigate("/", { replace: true });
    }
  }, [navigate, authHeaders]);

  /* -----------------------
     1) BOOT: /me
  ----------------------- */
  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      setBootLoading(true);
      setError("");

      const token = getToken();
      if (!token) return goLogin();

      const localName = readUserInfoLocal();
      if (localName) setApoderadoNombre(localName);

      try {
        const { data } = await api.get("/portal-apoderado/me", {
          signal: abort.signal,
          headers: authHeaders(),
        });

        const nombre = pickNombreFromAny(data?.apoderado ?? data);
        if (nombre) {
          setApoderadoNombre(nombre);
          try {
            const prev = localStorage.getItem("user_info");
            const parsed = prev ? JSON.parse(prev) : {};
            localStorage.setItem(
              "user_info",
              JSON.stringify({ ...parsed, nombre_apoderado: nombre })
            );
          } catch {}
        }
      } catch (err) {
        const st = getErrStatus(err);
        if (st === 401 || st === 403) return goLogin();
      } finally {
        if (!abort.signal.aborted) setBootLoading(false);
      }
    })();

    return () => abort.abort();
  }, [authHeaders, goLogin]);

  /* -----------------------
     2) Jugadores: /mis-jugadores
  ----------------------- */
  useEffect(() => {
    if (bootLoading) return;

    const abort = new AbortController();

    (async () => {
      setError("");

      try {
        const { data } = await api.get("/portal-apoderado/mis-jugadores", {
          signal: abort.signal,
          headers: authHeaders(),
        });

        const arr = Array.isArray(data?.jugadores) ? data.jugadores : [];
        setJugadores(arr);

        if (!selectedRut && arr.length > 0) {
          setSelectedRut(String(arr[0]?.rut_jugador ?? ""));
        }
      } catch (err) {
        const st = getErrStatus(err);
        const msg = getErrMsg(err);

        if (st === 401) return goLogin();
        if (st === 403) return setError("Debes cambiar tu contraseña para continuar.");
        setError(msg);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootLoading, authHeaders, goLogin]);

  /* -----------------------
     3) Resumen: /jugadores/:rut/resumen
  ----------------------- */
  useEffect(() => {
    if (!selectedRut) return;

    const abort = new AbortController();

    (async () => {
      setDetalleLoading(true);
      setDetalle(null);
      setError("");

      try {
        const { data } = await api.get(
          `/portal-apoderado/jugadores/${encodeURIComponent(selectedRut)}/resumen`,
          { signal: abort.signal, headers: authHeaders() }
        );

        setDetalle(data?.ok ? data : null);
      } catch (err) {
        const st = getErrStatus(err);
        const msg = getErrMsg(err);

        if (st === 401) return goLogin();
        if (st === 403) {
          if (msg === "FORBIDDEN") setError("No tienes acceso a este jugador.");
          else setError("Debes cambiar tu contraseña para continuar.");
          return;
        }
        setError(msg);
      } finally {
        if (!abort.signal.aborted) setDetalleLoading(false);
      }
    })();

    return () => abort.abort();
  }, [selectedRut, authHeaders, goLogin]);

  /* -----------------------
     4) Agenda: /eventos/public
  ----------------------- */
  useEffect(() => {
    if (bootLoading) return;

    const abort = new AbortController();

    (async () => {
      setAgendaLoading(true);
      setAgendaError("");

      try {
        const { data } = await api.get("/eventos/public?limit=50&offset=0", {
          signal: abort.signal,
        });

        const rows = Array.isArray(data?.items) ? data.items : [];
        const now = Date.now();

        const mapped = rows
          .map((e) => {
            const start = new Date(e?.fecha_inicio);
            const end = new Date(e?.fecha_fin);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
            return {
              id: e?.id,
              titulo: e?.titulo ?? "Evento",
              descripcion: e?.descripcion ?? "",
              start,
              end,
              when: fmtDate(e?.fecha_inicio),
            };
          })
          .filter(Boolean)
          .filter((ev) => (ev.end?.getTime?.() ?? 0) >= now)
          .sort((a, b) => (a.start?.getTime?.() ?? 0) - (b.start?.getTime?.() ?? 0));

        setAgendaItems(mapped);
      } catch {
        setAgendaItems([]);
        setAgendaError("No se pudo cargar la agenda.");
      } finally {
        if (!abort.signal.aborted) setAgendaLoading(false);
      }
    })();

    return () => abort.abort();
  }, [bootLoading]);

  /* -----------------------
     5) Contrato: /jugadores/:rut/contrato
  ----------------------- */
  useEffect(() => {
    if (contratoUrl) {
      try {
        URL.revokeObjectURL(contratoUrl);
      } catch {}
    }
    setContratoUrl("");
    setContratoError("");
    setContratoLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRut]);

  useEffect(() => {
    return () => {
      if (contratoUrl) {
        try {
          URL.revokeObjectURL(contratoUrl);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerContrato = async () => {
    if (!selectedRut) return;

    setContratoError("");

    if (contratoUrl) {
      try {
        window.open(contratoUrl, "_blank", "noopener,noreferrer");
      } catch {}
      return;
    }

    setContratoLoading(true);

    try {
      const res = await api.get(
        `/portal-apoderado/jugadores/${encodeURIComponent(selectedRut)}/contrato`,
        { responseType: "blob", headers: authHeaders() }
      );

      const ct = res?.headers?.["content-type"] || res?.headers?.["Content-Type"] || "";
      if (ct && !String(ct).toLowerCase().includes("application/pdf")) {
        throw new Error("El archivo recibido no es un PDF.");
      }

      const url = URL.createObjectURL(res.data);
      setContratoUrl(url);
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {}
    } catch (err) {
      const st = getErrStatus(err);
      const msg = getErrMsg(err);

      if (st === 401) return goLogin();
      if (st === 403) return setContratoError("Debes cambiar tu contraseña para continuar.");
      if (st === 404) return setContratoError("Este jugador aún no tiene contrato registrado.");
      setContratoError(msg);
    } finally {
      setContratoLoading(false);
    }
  };

  /* =======================
     Derived data
  ======================== */
  const jugadorSel = useMemo(() => {
    return (
      jugadores.find((x) => String(x?.rut_jugador) === String(selectedRut)) ||
      jugadores[0] ||
      null
    );
  }, [jugadores, selectedRut]);

  const jugador = detalle?.jugador || null;
  const estadisticas = detalle?.estadisticas || null;
  const pagos = Array.isArray(detalle?.pagos) ? detalle.pagos : [];

  const totalPagado = useMemo(
    () => pagos.reduce((acc, p) => acc + Number(p?.monto || 0), 0),
    [pagos]
  );

  const lastPago = useMemo(() => {
    const arr = pagos.filter((p) => p?.fecha_pago);
    if (!arr.length) return null;
    const sorted = [...arr].sort(
      (a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime()
    );
    return sorted[0] || null;
  }, [pagos]);

  const topPagos = useMemo(() => {
    return [...pagos]
      .filter((p) => p?.fecha_pago)
      .sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
      .slice(0, 5)
      .map((p) => ({
        fecha: fmtDate(p.fecha_pago),
        tipo: p?.tipo_pago?.nombre ?? String(p?.tipo_pago_id ?? "—"),
        monto: fmtCLP(p?.monto),
        situacion: normalizeSituacion(p),
      }));
  }, [pagos]);

  const dash = useMemo(() => {
    const e = estadisticas || {};
    const goles = Number(e?.goles ?? 0);
    const asist = Number(e?.asistencias ?? 0);
    const pj = Number(e?.partidos_jugador ?? e?.pj ?? 0);
    const mins = Number(e?.minutos_jugados ?? e?.minutos ?? 0);
    const ta = Number(e?.tarjetas_amarillas ?? 0);
    const tr = Number(e?.tarjetas_rojas ?? 0);

    const distPick = pickDistanceFromStats(e);
    const distanciaKm = distPick?.raw ? normalizeDistanceKm(distPick.raw) : null;

    const aporte = goles + asist;
    const minPorPartido = pj > 0 ? Math.round(mins / pj) : 0;

    const barData = [
      { name: "Goles", v: goles },
      { name: "Asist", v: asist },
      { name: "PJ", v: pj },
      { name: "Min", v: mins },
      { name: "TA", v: ta },
      { name: "TR", v: tr },
    ];

    const pieData = [
      { name: "OK", v: Math.max(0, pj - (ta + tr)) },
      { name: "TA", v: ta },
      { name: "TR", v: tr },
    ];

    return { goles, asist, pj, mins, aporte, minPorPartido, distanciaKm, barData, pieData };
  }, [estadisticas]);

  const statsEntries = useMemo(() => {
    if (!estadisticas) return [];
    return Object.entries(estadisticas).filter(
      ([k]) => !["id", "created_at", "updated_at"].includes(k)
    );
  }, [estadisticas]);

  const tieneContratoFlag = Boolean(jugador?.tiene_contrato) || Boolean(jugadorSel?.tiene_contrato);

  /* =======================
     Styles
  ======================== */
  const pageClass = darkMode ? "text-white bg-[#0b0b0e]" : "text-[#1a1a1a] bg-[#e9eaec]";
  const surfaceClass = darkMode ? "border-white/10 bg-[#121214]" : "border-black/10 bg-[#f2f2f3]";
  const mutedText = darkMode ? "text-white/65" : "text-black/60";
  const softText = darkMode ? "text-white/75" : "text-black/70";
  const labelFaint = darkMode ? "text-white/40" : "text-black/40";
  const panelBg = darkMode ? "bg-[#0f0f12] border-white/10" : "bg-white border-black/10";

  const kpiBg = {
    goles: "linear-gradient(135deg,#e82d89,#b10f61)",
    aportes: "linear-gradient(135deg,#ff4fb0,#e82d89)",
    minutos: "linear-gradient(135deg,#c61f74,#7a0a3f)",
    distancia: "linear-gradient(135deg,#f06ab8,#a10f5a)",
  };

  const pieColors = ["#22c55e", "#facc15", "#ef4444"];

  if (bootLoading) return <IsLoading />;

  const tituloBienvenida = apoderadoNombre
    ? `Bienvenido ${apoderadoNombre}`
    : "Bienvenido Apoderado";

  return (
    <div className={["min-h-screen font-sans antialiased", pageClass].join(" ")}>
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
        {/* Topbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-widest uppercase text-[#e82d89]">
              {tituloBienvenida}
            </h1>
            <p className={["mt-1 text-sm font-semibold", mutedText].join(" ")}>
              Jugadores, pagos, estadísticas y contrato en un solo tablero.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className={[
                "rounded-xl px-3 py-2 border transition inline-flex items-center justify-center",
                darkMode
                  ? "bg-[#121214] border-white/10 text-white hover:bg-[#1a1a1d]"
                  : "bg-white border-black/10 text-[#1a1a1a] hover:bg-white/70",
              ].join(" ")}
              title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {darkMode ? (
                <FiSun size={18} style={{ color: ACCENT }} />
              ) : (
                <FiMoon size={18} style={{ color: ACCENT }} />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("/portal-apoderado/configuracion")}
              className={[
                "rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest border transition inline-flex items-center gap-2",
                darkMode
                  ? "bg-[#121214] border-white/10 text-white hover:bg-[#1a1a1d]"
                  : "bg-white border-black/10 text-[#1a1a1a] hover:bg-white/70",
              ].join(" ")}
              title="Configuración"
            >
              <FiSettings size={18} style={{ color: ACCENT }} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl px-4 py-2 font-extrabold uppercase tracking-widest bg-[#e82d89] text-white hover:bg-[#c61f74] transition inline-flex items-center gap-2"
              title="Cerrar sesión"
            >
              <FiLogOut size={18} />
            </button>
          </div>
        </div>

        {/* Layout */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* Sidebar jugadores */}
          <aside
            className={[
              "rounded-[26px] border shadow-[0_20px_70px_rgba(0,0,0,0.08)] p-4 sm:p-5",
              surfaceClass,
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                  Jugadores
                </p>
                <p className={["mt-1 text-sm font-extrabold", darkMode ? "text-white/85" : "text-black/80"].join(" ")}>
                  Selecciona a quién ver
                </p>
              </div>
              <Pill darkMode={darkMode}>{jugadores.length} asociado(s)</Pill>
            </div>

            {error ? (
              <div
                className={[
                  "mt-4 rounded-2xl border font-extrabold p-4",
                  darkMode
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : "border-red-200 bg-red-50 text-red-700",
                ].join(" ")}
              >
                ❌ {error}
              </div>
            ) : null}

            {!error && jugadores.length === 0 ? (
              <div
                className={[
                  "mt-4 rounded-2xl border p-4 font-semibold",
                  darkMode ? "border-white/10 bg-[#0f0f12] text-white/75" : "border-black/10 bg-white text-black/70",
                ].join(" ")}
              >
                No hay jugadores asociados a este apoderado.
              </div>
            ) : null}

            {!error && jugadores.length > 0 ? (
              <div className="mt-4 space-y-2">
                {jugadores.map((j) => {
                  const rut = String(j?.rut_jugador ?? "");
                  const active = rut === String(selectedRut);
                  return (
                    <button
                      key={rut}
                      type="button"
                      onClick={() => setSelectedRut(rut)}
                      className={[
                        "w-full text-left rounded-2xl border transition p-4",
                        active
                          ? darkMode
                            ? "border-[#e82d89]/50 bg-white/10"
                            : "border-[#e82d89]/40 bg-white shadow-sm"
                          : darkMode
                          ? "border-white/10 bg-white/5 hover:bg-white/10"
                          : "border-black/10 bg-white/60 hover:bg-white",
                      ].join(" ")}
                    >
                      <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                        Jugador
                      </p>
                      <p className={["mt-1 text-sm font-extrabold", darkMode ? "text-white" : "text-black"].join(" ")}>
                        {j?.nombre_jugador || "Sin nombre"}
                      </p>
                      <p className={["mt-1 text-xs font-semibold", mutedText].join(" ")}>
                        RUT:{" "}
                        <span className={["font-extrabold", darkMode ? "text-white/85" : "text-black/80"].join(" ")}>
                          {rut}
                        </span>
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {j?.categoria?.nombre ? <Pill darkMode={darkMode}>{j.categoria.nombre}</Pill> : null}
                        {j?.posicion?.nombre ? <Pill darkMode={darkMode}>{j.posicion.nombre}</Pill> : null}
                        {j?.estado?.nombre ? <Pill darkMode={darkMode}>{j.estado.nombre}</Pill> : null}
                        {j?.tiene_contrato ? <Pill darkMode={darkMode}>Contrato</Pill> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </aside>

          {/* Main */}
          <main
            className={[
              "rounded-[26px] border shadow-[0_20px_70px_rgba(0,0,0,0.08)] p-5 sm:p-7",
              surfaceClass,
            ].join(" ")}
          >
            {/* Header jugador */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                  Jugador seleccionado
                </p>
                <h2 className={["mt-2 text-2xl sm:text-3xl font-extrabold", darkMode ? "text-white" : "text-black"].join(" ")}>
                  {jugadorSel?.nombre_jugador || "—"}
                </h2>
                <p className={["mt-1 text-sm font-semibold", mutedText].join(" ")}>
                  RUT:{" "}
                  <span className={["font-extrabold", darkMode ? "text-white/85" : "text-black/80"].join(" ")}>
                    {jugadorSel?.rut_jugador || "—"}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {detalleLoading ? <Pill darkMode={darkMode}>Cargando…</Pill> : null}

                <Pill big darkMode={darkMode}>
                  Último pago:{" "}
                  <span className="ml-1 font-extrabold" style={{ color: ACCENT }}>
                    {lastPago ? fmtDate(lastPago.fecha_pago) : "—"}
                  </span>
                </Pill>

                <Pill big darkMode={darkMode}>
                  Total pagado:{" "}
                  <span className={["ml-1 font-extrabold", darkMode ? "text-white" : "text-black"].join(" ")}>
                    {fmtCLP(totalPagado)}
                  </span>
                </Pill>
              </div>
            </div>

            <div className={["mt-6 pt-6 border-t", darkMode ? "border-white/10" : "border-black/10"].join(" ")}>
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                  title="Goles"
                  value={String(dash.goles)}
                  sub={dash.pj ? `${(dash.goles / dash.pj).toFixed(2)} por partido` : "—"}
                  bg={kpiBg.goles}
                />
                <KpiCard title="Aportes" value={String(dash.aporte)} sub="Goles + asistencias" bg={kpiBg.aportes} />
                <KpiCard
                  title="Minutos"
                  value={String(dash.mins)}
                  sub={dash.pj ? `${dash.minPorPartido} min/partido` : "—"}
                  bg={kpiBg.minutos}
                />
                <KpiCard
                  title="Distancia"
                  value={dash.distanciaKm === null ? "—" : fmtKmCL(dash.distanciaKm)}
                  sub="recorrida"
                  bg={kpiBg.distancia}
                />
              </div>

              {/* 2 columnas */}
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                {/* Chart */}
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Estadísticas del jugador
                  </p>

                  {!estadisticas ? (
                    <p className={["mt-3 text-sm font-semibold", mutedText].join(" ")}>
                      Aún no hay estadísticas registradas para este jugador.
                    </p>
                  ) : (
                    <div className="mt-3 h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dash.barData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={darkMode ? 0.15 : 0.35} />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="v" fill={ACCENT} radius={[10, 10, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Pagos + contrato */}
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Últimos pagos (Top 5)
                  </p>

                  <div className="mt-3 overflow-x-hidden">
                    <table className="w-full table-fixed text-[11px] sm:text-sm">
                      <thead>
                        <tr className={["text-left", mutedText].join(" ")}>
                          <th className="py-2 pr-2 w-[26%]">Fecha</th>
                          <th className="py-2 pr-2 w-[26%]">Tipo</th>
                          <th className="py-2 pr-2 w-[28%]">Monto</th>
                          <th className="py-2 w-[20%]">Sit.</th>
                        </tr>
                      </thead>

                      <tbody>
                        {topPagos.length === 0 ? (
                          <tr>
                            <td colSpan={4} className={["py-4 font-semibold", mutedText].join(" ")}>
                              Sin pagos recientes.
                            </td>
                          </tr>
                        ) : (
                          topPagos.map((r, idx) => (
                            <tr
                              key={idx}
                              className={["border-t", darkMode ? "border-white/10" : "border-black/10"].join(" ")}
                            >
                              <td className={["py-2 pr-2 font-semibold truncate", softText].join(" ")} title={r.fecha}>
                                {r.fecha}
                              </td>
                              <td className={["py-2 pr-2 font-semibold truncate", softText].join(" ")} title={r.tipo}>
                                {r.tipo}
                              </td>
                              <td
                                className={[
                                  "py-2 pr-2 font-extrabold truncate",
                                  darkMode ? "text-white" : "text-black",
                                ].join(" ")}
                                title={r.monto}
                              >
                                {r.monto}
                              </td>
                              <td
                                className={[
                                  "py-2 font-extrabold truncate",
                                  situacionClass(r.situacion, darkMode),
                                ].join(" ")}
                                title={r.situacion}
                              >
                                {r.situacion}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={["mt-4 pt-4 border-t", darkMode ? "border-white/10" : "border-black/10"].join(" ")}>
                    {contratoError ? (
                      <div
                        className={[
                          "mb-3 rounded-2xl border font-extrabold p-3 text-sm",
                          darkMode
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : "border-red-200 bg-red-50 text-red-700",
                        ].join(" ")}
                      >
                        ❌ {contratoError}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                          Contrato
                        </p>
                        <p className={["mt-1 text-sm font-semibold", softText].join(" ")}>
                          {tieneContratoFlag ? "Disponible" : "No registrado"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerContrato}
                        disabled={contratoLoading || !tieneContratoFlag}
                        className={[
                          "inline-flex items-center gap-2 rounded-xl px-4 py-2 font-extrabold border transition",
                          contratoLoading || !tieneContratoFlag
                            ? darkMode
                              ? "bg-white/5 border-white/10 text-white/35 cursor-not-allowed"
                              : "bg-black/5 border-black/10 text-black/30 cursor-not-allowed"
                            : darkMode
                            ? "bg-white/10 border-white/10 text-white hover:bg-white/15"
                            : "bg-white border-black/10 text-black hover:bg-white/70",
                        ].join(" ")}
                        title={contratoLoading ? "Cargando…" : !tieneContratoFlag ? "Sin contrato" : "Ver contrato"}
                      >
                        <FileText size={18} style={{ color: ACCENT }} />
                        {contratoLoading ? "Cargando…" : "Ver"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fila inferior */}
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Pie disciplina */}
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Disciplina
                  </p>

                  {!estadisticas ? (
                    <p className={["mt-3 text-sm font-semibold", mutedText].join(" ")}>
                      Sin estadísticas para calcular disciplina.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip />
                            <Pie
                              data={dash.pieData}
                              dataKey="v"
                              nameKey="name"
                              innerRadius="55%"
                              outerRadius="85%"
                              paddingAngle={3}
                            >
                              {dash.pieData.map((_, i) => (
                                <Cell key={i} fill={pieColors[i % pieColors.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {dash.pieData.map((p, i) => (
                          <span
                            key={p.name}
                            className={[
                              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold",
                              darkMode ? "bg-white/10 text-white/80" : "bg-black/5 text-black/70",
                            ].join(" ")}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ background: pieColors[i % pieColors.length] }}
                            />
                            {p.name}: {p.v}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Agenda */}
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Agenda (próximos eventos)
                  </p>

                  {agendaLoading ? (
                    <p className={["mt-3 text-sm font-semibold", mutedText].join(" ")}>
                      Cargando agenda…
                    </p>
                  ) : agendaError ? (
                    <p className="mt-3 text-sm font-extrabold text-red-500">{agendaError}</p>
                  ) : agendaItems.length === 0 ? (
                    <p className={["mt-3 text-sm font-semibold", mutedText].join(" ")}>
                      No hay eventos próximos.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {agendaItems.slice(0, 6).map((ev) => (
                        <div
                          key={ev.id}
                          className={[
                            "rounded-xl border px-3 py-2",
                            darkMode ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={[
                                  "text-sm font-extrabold truncate",
                                  darkMode ? "text-white" : "text-black",
                                ].join(" ")}
                                title={ev.titulo}
                              >
                                {ev.titulo}
                              </p>
                              {ev.descripcion ? (
                                <p className={["text-xs font-semibold truncate", mutedText].join(" ")} title={ev.descripcion}>
                                  {ev.descripcion}
                                </p>
                              ) : null}
                            </div>

                            <span
                              className={[
                                "shrink-0 text-[11px] font-extrabold rounded-full px-2 py-1",
                                darkMode
                                  ? "bg-white/10 text-white/80"
                                  : "bg-white text-black/70 border border-black/10",
                              ].join(" ")}
                              title={ev.when}
                            >
                              {ev.when}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Datos jugador */}
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Datos del jugador
                  </p>

                  <div className={["mt-3 space-y-2 text-sm font-semibold", softText].join(" ")}>
                    <p>
                      Categoría:{" "}
                      <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                        {jugador?.categoria?.nombre || "—"}
                      </span>
                    </p>
                    <p>
                      Posición:{" "}
                      <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                        {jugador?.posicion?.nombre || "—"}
                      </span>
                    </p>
                    <p>
                      Sucursal:{" "}
                      <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                        {jugador?.sucursal?.nombre || "—"}
                      </span>
                    </p>
                    <p>
                      Estado:{" "}
                      <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                        {jugador?.estado?.nombre || "—"}
                      </span>
                    </p>

                    <div className={["pt-3 mt-3 border-t", darkMode ? "border-white/10" : "border-black/10"].join(" ")}>
                      <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                        Contacto
                      </p>
                      <p className="mt-2">
                        Email:{" "}
                        <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                          {jugador?.email || "—"}
                        </span>
                      </p>
                      <p className="mt-1">
                        Teléfono:{" "}
                        <span className={darkMode ? "text-white font-extrabold" : "font-extrabold text-black"}>
                          {jugador?.telefono || "—"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalle completo */}
              <div className="mt-4">
                <div className={["rounded-2xl border p-4", panelBg].join(" ")}>
                  <p className={["text-xs font-black tracking-[0.35em] uppercase", labelFaint].join(" ")}>
                    Estadísticas (detalle completo)
                  </p>

                  {!estadisticas ? (
                    <p className={["mt-3 text-sm font-semibold", mutedText].join(" ")}>
                      Sin estadísticas registradas.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {statsEntries.map(([k, v]) => {
                        const keyLabel = k.replace(/_/g, " ");
                        const valLabel = v === null || v === undefined || v === "" ? "—" : String(v);

                        return (
                          <div
                            key={k}
                            className={[
                              "grid items-center gap-2",
                              "grid-cols-[minmax(0,1fr)_auto]",
                              "border-t pt-2",
                              darkMode ? "border-white/10" : "border-black/10",
                            ].join(" ")}
                          >
                            <div className={["min-w-0 text-[12px] sm:text-sm font-semibold", softText].join(" ")}>
                              <span className="block truncate" title={keyLabel}>
                                {keyLabel}
                              </span>
                            </div>

                            <div className={["text-[12px] sm:text-sm font-extrabold", darkMode ? "text-white" : "text-black"].join(" ")}>
                              <span className="block max-w-[42vw] sm:max-w-[260px] truncate text-right" title={valLabel}>
                                {valLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {contratoUrl ? (
                <p className={["mt-4 text-xs font-semibold", mutedText].join(" ")}>
                  Contrato cacheado en tu navegador: la próxima abre al toque. ⚡
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
