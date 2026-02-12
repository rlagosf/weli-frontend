// src/pages/admin/listarPagos.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import { jwtDecode } from "jwt-decode";
import { formatRutWithDV } from "../../services/rut";
import { Pencil, Trash2, X, CreditCard } from "lucide-react";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import IsLoading from "../../components/isLoading";

/* =======================
   🎨 Conjunto X (MISMA GAMA)
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

/* ─────────────────────────────
   CONSTANTES NEGOCIO
───────────────────────────── */
const ESTADO_JUGADOR_ACTIVO = 1;
const TIPO_PAGO_MENSUALIDAD = 3;
const SITUACION_PAGO_PAGADO_ID = 1; // Ajusta si tu catálogo usa otro ID
const START_DEUDA_YEAR = 2025;
const START_DEUDA_MONTH = 12;

/* Paginación */
const PAGE_SIZE = 10;
const MAX_PAGES = 200;
const MANUAL_PAGE_SIZE = 10;

/* ─────────────────────────────
   HELPERS
───────────────────────────── */
const monthLabelEs = (year, month) => {
  const d = new Date(year, month - 1, 1);
  const m = new Intl.DateTimeFormat("es-CL", { month: "long" }).format(d);
  return `${m} ${year}`;
};

const ymKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

const buildMesesExigibles = (
  now,
  diaCorte = 5,
  startYear = START_DEUDA_YEAR,
  startMonth = START_DEUDA_MONTH
) => {
  const yNow = now.getFullYear();
  const mNow = now.getMonth() + 1;
  const dNow = now.getDate();

  let endY = yNow;
  let endM = mNow - 1;

  if (endM === 0) {
    endM = 12;
    endY = yNow - 1;
  }
  if (dNow > diaCorte) {
    endY = yNow;
    endM = mNow;
  }

  const startKey = startYear * 100 + startMonth;
  const endKey = endY * 100 + endM;
  if (endKey < startKey) return [];

  const out = [];
  let y = startYear;
  let m = startMonth;

  while (y * 100 + m <= endKey) {
    out.push({ year: y, month: m, key: ymKey(y, m) });
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
};

const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  return [];
};

const buildIdNameMap = (arr, idKey = "id", nameKey = "nombre") => {
  const m = new Map();
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = x?.[idKey];
    const name = x?.[nameKey] ?? String(id ?? "—");
    if (id != null) m.set(String(id), String(name).trim());
  }
  return m;
};

const normalizeCatalog = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      id: Number(
        x?.id ??
          x?.posicion_id ??
          x?.categoria_id ??
          x?.establec_educ_id ??
          x?.prevision_medica_id ??
          x?.estado_id ??
          x?.sucursal_id ??
          x?.comuna_id
      ),
      nombre: String(x?.nombre ?? x?.descripcion ?? "").trim(),
    }))
    .filter((x) => Number.isFinite(x.id) && x.nombre);

/* ─────────────────────────────
   Auth / Headers (WELI)
───────────────────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Soporta "1" o JSON {"id":1} */
const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const buildHeaders = (rol) => {
  const token = getToken();
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rol === 3) {
    const a = getAcademiaIdFromStorage();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

// intenta varias rutas y variantes con / y sin /
const tryGetList = async (paths, { signal, headers }) => {
  const variants = [];
  for (const p of paths) {
    variants.push(p.endsWith("/") ? p : `${p}/`);
    variants.push(p.endsWith("/") ? p.slice(0, -1) : p);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, headers });
      return asList(r);
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

const getWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.get(url, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("GET failed");
};

const postWithFallback = async (path, body, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.post(url, body, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("POST failed");
};

const putWithFallback = async (path, body, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.put(url, body, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("PUT failed");
};

const deleteWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.delete(url, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("DELETE failed");
};

/* ✅ FINAL: normalizePagos */
const normalizePagos = (arr, { tipoPagoMap, medioPagoMap, situacionPagoMap, jugadoresMap }) => {
  const list = Array.isArray(arr) ? arr : [];

  const safeInt = (v) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const safeIdPos = (v) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  return list.map((p) => {
    const tipoIdRaw = p?.tipo_pago_id ?? p?.tipo_id ?? p?.tipoPagoId ?? p?.tipo_pago?.id ?? null;
    const medioIdRaw = p?.medio_pago_id ?? p?.medio_id ?? p?.medioPagoId ?? p?.medio_pago?.id ?? null;
    const situIdRaw =
      p?.situacion_pago_id ?? p?.estado_pago_id ?? p?.estado_id ?? p?.situacion_pago?.id ?? null;

    const tipoId = safeInt(tipoIdRaw);
    const medioId = safeInt(medioIdRaw);
    const situId = safeInt(situIdRaw);

    const rutPlano =
      p?.jugador_rut ??
      p?.rut_jugador ??
      p?.rut ??
      p?.jugador?.rut_jugador ??
      p?.jugador?.rut ??
      null;

    const jAnidado = p?.jugador ?? {};
    const jFromMap = rutPlano != null ? jugadoresMap.get(String(rutPlano)) : null;

    const jugadorNombre =
      jAnidado?.nombre_jugador ??
      jAnidado?.nombre ??
      jAnidado?.nombre_completo ??
      jFromMap?.nombre ??
      p?.jugador_nombre ??
      p?.nombre_jugador ??
      "—";

    const catIdRaw =
      jAnidado?.categoria?.id ?? jAnidado?.categoria_id ?? jFromMap?.categoria?.id ?? null;
    const catId = safeInt(catIdRaw);

    const catNombre =
      jAnidado?.categoria?.nombre ??
      jAnidado?.categoria_nombre ??
      jFromMap?.categoria?.nombre ??
      (typeof jAnidado?.categoria === "string" ? jAnidado?.categoria : null) ??
      "Sin categoría";

    const fecha = p?.fecha_pago ?? p?.fecha ?? null;
    const d = parseDate(fecha);

    let tipoNombreBase =
      p?.tipo_pago?.nombre ??
      p?.tipo_pago_nombre ??
      (tipoId != null ? tipoPagoMap.get(String(tipoId)) ?? String(tipoId) : "—");

    if (tipoId === TIPO_PAGO_MENSUALIDAD && d) {
      const labelMes = monthLabelEs(d.getFullYear(), d.getMonth() + 1);
      if (!String(tipoNombreBase).toLowerCase().includes(String(labelMes).toLowerCase())) {
        tipoNombreBase = `Mensualidad ${labelMes}`;
      }
    }

    const medioNombre =
      p?.medio_pago?.nombre ??
      p?.medio_pago_nombre ??
      (medioId != null ? medioPagoMap.get(String(medioId)) ?? String(medioId) : "—");

    const situNombre =
      p?.situacion_pago?.nombre ??
      p?.estado_pago_nombre ??
      p?.estado_nombre ??
      (situId != null ? situacionPagoMap.get(String(situId)) ?? String(situId) : "—");

    const idRaw =
      p?.id ??
      p?.ID ??
      p?.pago_id ??
      p?.pagoId ??
      (typeof p?.id_pago !== "undefined" ? p.id_pago : null);
    const id = safeIdPos(idRaw);

    return {
      id,
      monto: Number(p?.monto ?? 0),
      fecha_pago: fecha,
      jugador: {
        rut_jugador: rutPlano ?? "—",
        nombre_jugador: jugadorNombre,
        categoria: { id: catId, nombre: catNombre },
      },
      tipo_pago: { id: tipoId, nombre: tipoNombreBase },
      situacion_pago: { id: situId, nombre: situNombre },
      medio_pago: { id: medioId, nombre: medioNombre },
      observaciones: p?.observaciones ?? "",
    };
  });
};

/* ─────────────────────────────
   COMPONENTE
───────────────────────────── */
export default function ListarPagos() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual (sin hardcodear)
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
  }, [location.pathname]);

  const breadcrumbBootRef = useRef(false);

  const [rolActual, setRolActual] = useState(0);
  const [academiaTarget, setAcademiaTarget] = useState(() => getAcademiaIdFromStorage());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [pagos, setPagos] = useState([]);

  const [tipoPagoMap, setTipoPagoMap] = useState(new Map());
  const [medioPagoMap, setMedioPagoMap] = useState(new Map());
  const [situacionPagoMap, setSituacionPagoMap] = useState(new Map());
  const [jugadoresMap, setJugadoresMap] = useState(new Map());

  // Filtros pagos
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState(""); // PAGADO / VENCIDO
  const [filtroTipoPago, setFiltroTipoPago] = useState(""); // id tipo_pago
  const [filtroMedioPago, setFiltroMedioPago] = useState(""); // id medio_pago

  // Paginación pagos
  const [page, setPage] = useState(1);

  // Pagos manuales: filtro + paginación
  const [manualFiltro, setManualFiltro] = useState("");
  const [manualPage, setManualPage] = useState(1);

  // Modal edición/registro
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  // Modal de éxito + recarga visual
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [reloadBusy, setReloadBusy] = useState(false);

  const [editForm, setEditForm] = useState({
    id: null,
    virtual: false,
    create: false,
    deuda_year: null,
    deuda_month: null,
    jugador_rut: "",
    monto: "",
    fecha_pago: "",
    tipo_pago_id: "",
    medio_pago_id: "",
    situacion_pago_id: "",
    observaciones: "",
  });

  /* 🔐 Sesión + rol */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);
      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, { replace: true });
        return;
      }

      if (rol === 3) {
        const a = getAcademiaIdFromStorage();
        if (!a) throw new Error("missing-academia-target");
        setAcademiaTarget(a);
      }

      setRolActual(rol);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, dashboardBase]);

  /* 🧭 Breadcrumb (ANTI-LOOP) */
  useEffect(() => {
    if (breadcrumbBootRef.current) return;
    const currentPath = location.pathname + location.search;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Pagos centralizados";
    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ label, to: location.pathname }],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* ✅ cambios de academia target (rol 3) */
  useEffect(() => {
    const sync = () => setAcademiaTarget(getAcademiaIdFromStorage());

    const onStorage = (e) => {
      if (e?.key === ACADEMIA_STORAGE_KEY) sync();
    };

    let last = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");
    const t = setInterval(() => {
      const now = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");
      if (now !== last) {
        last = now;
        sync();
      }
    }, 800);

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);

  /* 📡 Carga catálogos + jugadores + pagos */
  useEffect(() => {
    if (!rolActual) return;
    if (rolActual === 3 && !academiaTarget) return;

    const abort = new AbortController();
    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const [tipos, medios, situaciones, jugadoresList, categoriasRaw, sucursalesRaw] = await Promise.all([
          tryGetList(["/tipo-pago", "/tipo_pago"], { signal: abort.signal, headers }),
          tryGetList(["/medio-pago", "/medio_pago"], { signal: abort.signal, headers }),
          tryGetList(["/situacion-pago", "/situacion_pago", "/estado-pago", "/estado_pago"], {
            signal: abort.signal,
            headers,
          }),
          tryGetList(["/jugadores"], { signal: abort.signal, headers }),
          tryGetList(["/categorias"], { signal: abort.signal, headers }),
          tryGetList(["/sucursales-real", "/sucursales-real/"], { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        const tipoMap = buildIdNameMap(tipos, "id", "nombre");
        const medioMap = buildIdNameMap(medios, "id", "nombre");
        const situMap = buildIdNameMap(situaciones, "id", "nombre");
        setTipoPagoMap(tipoMap);
        setMedioPagoMap(medioMap);
        setSituacionPagoMap(situMap);

        const _categorias = normalizeCatalog(categoriasRaw);
        const _sucursales = normalizeCatalog(sucursalesRaw);

        const catMap = new Map(_categorias.map((c) => [Number(c.id), c.nombre]));
        const sucMap = new Map(_sucursales.map((s) => [Number(s.id), s.nombre]));

        const activos = (Array.isArray(jugadoresList) ? jugadoresList : []).filter((j) => {
          const estadoId = Number(j?.estado_id ?? j?.estadoId ?? j?.estado ?? 0);
          return estadoId === ESTADO_JUGADOR_ACTIVO;
        });

        const jm = new Map();
        for (const j of activos) {
          const rut = j?.rut_jugador ?? j?.rut ?? null;
          if (rut == null) continue;

          const categoriaId = j?.categoria_id ?? j?.categoria?.id ?? null;
          const categoriaNombre =
            j?.categoria?.nombre ??
            j?.categoria_nombre ??
            (categoriaId != null ? catMap.get(Number(categoriaId)) ?? String(categoriaId) : null) ??
            (typeof j?.categoria === "string" ? j.categoria : null) ??
            "Sin categoría";

          const sucursalId = j?.sucursal_id ?? j?.sucursal?.id ?? j?.id_sucursal ?? null;
          const sucursalNombre =
            j?.sucursal?.nombre ??
            j?.sucursal_nombre ??
            j?.nombre_sucursal ??
            (sucursalId != null ? sucMap.get(Number(sucursalId)) : null) ??
            (sucursalId != null ? `Sucursal ${sucursalId}` : null) ??
            "Sin sucursal";

          jm.set(String(rut), {
            nombre: j?.nombre_jugador ?? j?.nombre ?? j?.nombre_completo ?? "—",
            categoria: { id: categoriaId, nombre: categoriaNombre },
            sucursal: { id: sucursalId, nombre: sucursalNombre },
          });
        }
        setJugadoresMap(jm);

        const respEstado = await getWithFallback("/pagos-jugador/estado-cuenta", {
          signal: abort.signal,
          headers,
        });
        if (abort.signal.aborted) return;

        const rawPagos = Array.isArray(respEstado?.data?.pagos) ? respEstado.data.pagos : [];

        // Filtrar pagos solo de activos
        const rutsActivos = new Set(Array.from(jm.keys()));
        const rawPagosActivos = rawPagos.filter((p) => {
          const rut =
            p?.jugador_rut ?? p?.rut_jugador ?? p?.rut ?? p?.jugador?.rut_jugador ?? p?.jugador?.rut;
          return rut != null && rutsActivos.has(String(rut));
        });

        const pagosNorm = normalizePagos(rawPagosActivos, {
          tipoPagoMap: tipoMap,
          medioPagoMap: medioMap,
          situacionPagoMap: situMap,
          jugadoresMap: jm,
        });

        setPagos(pagosNorm);
      } catch (e) {
        if (abort.signal.aborted) return;

        const st = e?.status ?? e?.response?.status;
        const msg = String(e?.message ?? "").toLowerCase();

        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (rolActual === 3 && (msg.includes("academia") || msg.includes("x-academia"))) {
          setError("⚠️ Superadmin: selecciona una academia para ver pagos centralizados.");
          return;
        }

        setError("❌ No se pudieron cargar los pagos centralizados.");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual, academiaTarget]);

  /* =======================
     UI (compacta)
     - page bg-transparent (plan gama)
     - cards coherentes
     - tablas + modales compactos
======================= */
  const ui = useMemo(() => {
    // ✅ Plan gama: sin fondo “cuadro”
    const page = "min-h-[calc(100vh-100px)] font-sans bg-transparent px-3 pt-3 pb-16";

    const title = darkMode ? "text-white" : "text-ra-marron";
    const subtitle = darkMode ? "text-white/70" : "text-ra-marron/70";

    const msgBox =
      "rounded-xl border px-4 py-3 font-semibold text-sm " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-xl border px-4 py-3 font-semibold text-sm " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    const card =
      "max-w-6xl mx-auto rounded-xl shadow-[0_14px_40px_rgba(0,0,0,0.18)] border " +
      (darkMode ? "bg-white/8 border-white/12" : "bg-white/55 border-ra-marron/12");

    const cardPad = "p-3"; // ✅ compacto

    const line = darkMode ? "rgba(255,255,255,0.14)" : "rgba(109,88,41,0.18)";
    const border = `1px solid ${line}`;

    const tableWrap = "w-full overflow-x-auto";

    // ✅ tabla compacta
    const table = "w-full text-[11px] sm:text-xs min-w-[920px] border-separate border-spacing-0";

    const thead = "text-[10px] sm:text-[11px] " + (darkMode ? "bg-black/20" : "bg-ra-cream/90");

    const thBase =
      "py-1.5 px-2 text-center whitespace-nowrap font-extrabold " +
      (darkMode ? "text-[#ffdda1]" : "text-[#6d5829]");

    const tdBase = "py-1.5 px-2 text-center " + (darkMode ? "text-white/90" : "text-ra-marron");

    const tr = "transition " + (darkMode ? "hover:bg-white/7" : "hover:bg-white/70");

    const cellBorderStyle = { borderRight: border, borderBottom: border };
    const headBorderStyle = { borderRight: border, borderBottom: border, borderTop: border };

    // ✅ controles compactos
    const controlBase =
      "w-full h-9 px-2.5 rounded-md text-[12px] leading-none outline-none transition " +
      (darkMode
        ? "border border-white/12 bg-black/20 text-white placeholder-white/45 focus:border-white/22"
        : "border border-ra-marron/12 bg-white/70 text-ra-marron placeholder-ra-marron/45 focus:border-ra-marron/24");

    const controlTextArea =
      "w-full min-h-[70px] rounded-md p-2.5 text-[12px] outline-none transition " +
      (darkMode
        ? "border border-white/12 bg-black/20 text-white placeholder-white/45 focus:border-white/22"
        : "border border-ra-marron/12 bg-white/70 text-ra-marron placeholder-ra-marron/45 focus:border-ra-marron/24");

    // ✅ botones compactos
    const btnPrimary =
      "inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md font-extrabold text-[12px] transition " +
      "disabled:opacity-50 disabled:cursor-not-allowed";
    const btnPrimaryStyle = {
      backgroundColor: PALETTE.sand,
      color: PALETTE.brown,
      boxShadow: darkMode ? "0 10px 26px rgba(0,0,0,0.22)" : "0 10px 26px rgba(109,88,41,0.14)",
    };

    const btnSecondary =
      "px-2.5 py-1 rounded-md border transition font-semibold text-[12px] " +
      (darkMode ? "border-white/18 hover:bg-white/8 text-white" : "border-ra-marron/18 hover:bg-white/70 text-ra-marron") +
      " disabled:opacity-50 disabled:cursor-not-allowed";

    const badge =
      "text-[11px] inline-flex items-center gap-2 rounded-full px-2.5 py-1 border font-semibold " +
      (darkMode ? "bg-white/8 border-white/10 text-white/80" : "bg-white/60 border-ra-marron/10 text-ra-marron/80");

    const pill = (estadoRaw) => {
      const e = String(estadoRaw ?? "").trim().toUpperCase();
      if (e === "PAGADO") return "bg-emerald-500/15 text-emerald-100 border border-emerald-300/20";
      if (e === "VENCIDO") return "bg-red-500/15 text-red-100 border border-red-300/20";
      return "bg-white/10 text-white/90 border border-white/12";
    };

    const modalCard =
      "w-[95%] max-w-xl rounded-xl shadow-[0_16px_60px_rgba(0,0,0,0.35)] border " +
      (darkMode ? "bg-[#121212]/82 border-white/12" : "bg-white/88 border-ra-marron/12") +
      " backdrop-blur-md";

    return {
      page,
      title,
      subtitle,
      msgBox,
      warnBox,
      card,
      cardPad,
      line,
      border,
      tableWrap,
      table,
      thead,
      thBase,
      tdBase,
      tr,
      cellBorderStyle,
      headBorderStyle,
      controlBase,
      controlTextArea,
      btnPrimary,
      btnPrimaryStyle,
      btnSecondary,
      badge,
      pill,
      modalCard,
    };
  }, [darkMode]);

  const toCLP = (n) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(
      Number(n || 0)
    );

  const findIdByName = (map, wantedName) => {
    const target = String(wantedName || "").trim().toUpperCase();
    for (const [id, name] of map.entries()) {
      if (String(name || "").trim().toUpperCase() === target) return Number(id);
    }
    return null;
  };

  const situacionVencidoId = useMemo(() => findIdByName(situacionPagoMap, "VENCIDO"), [situacionPagoMap]);

  /* ─────────────────────────────
     Filas pagos (incluye vencidos virtuales)
  ───────────────────────────── */
  const filas = useMemo(() => {
    const rows = [];

    const getPeriodoMensualidad = (p) => {
      const dy = p?.deuda_year ?? p?.periodo?.year ?? null;
      const dm = p?.deuda_month ?? p?.periodo?.month ?? null;

      const y = dy != null ? Number(dy) : null;
      const m = dm != null ? Number(dm) : null;

      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return { year: y, month: m, key: ymKey(y, m) };
      }

      const d = p?.fecha_pago ? new Date(p.fecha_pago) : null;
      if (!d || isNaN(d.getTime())) return null;
      return { year: d.getFullYear(), month: d.getMonth() + 1, key: ymKey(d.getFullYear(), d.getMonth() + 1) };
    };

    const mensualidadesPagadas = new Map(); // rut -> Set("YYYY-MM")

    for (const p of pagos) {
      const rut = String(p?.jugador?.rut_jugador ?? "");
      if (!rut) continue;

      const tipoId = Number(p?.tipo_pago?.id ?? p?.tipo_pago_id ?? NaN);
      const situId = Number(p?.situacion_pago?.id ?? p?.situacion_pago_id ?? NaN);

      if (tipoId !== TIPO_PAGO_MENSUALIDAD) continue;
      if (situId !== SITUACION_PAGO_PAGADO_ID) continue;

      const periodo = getPeriodoMensualidad(p);
      if (!periodo) continue;

      const set = mensualidadesPagadas.get(rut) || new Set();
      set.add(periodo.key);
      mensualidadesPagadas.set(rut, set);
    }

    const seen = new Set();

    for (const p of pagos) {
      const rut = String(p?.jugador?.rut_jugador ?? "");
      if (!rut) continue;

      const nombre = p?.jugador?.nombre_jugador ?? "—";
      const categoria =
        p?.jugador?.categoria?.nombre ??
        (typeof p?.jugador?.categoria === "string" ? p.jugador.categoria : null) ??
        "Sin categoría";

      const estado = p?.situacion_pago?.nombre || "—";

      const tipoId = Number(p?.tipo_pago?.id ?? p?.tipo_pago_id ?? NaN);
      const idNum = p?.id != null ? Number(p.id) : NaN;
      const safeId = Number.isFinite(idNum) && idNum > 0 ? idNum : null;

      const periodo = tipoId === TIPO_PAGO_MENSUALIDAD ? getPeriodoMensualidad(p) : null;

      const dedupeKey = safeId
        ? `ID-${safeId}`
        : periodo
          ? `MENS-${rut}-${tipoId}-${periodo.key}`
          : `NOID-${rut}-${tipoId}-${String(p?.fecha_pago ?? "")}-${String(p?.monto ?? "")}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const ts = (() => {
        if (!p?.fecha_pago) return 0;
        const d = new Date(p.fecha_pago);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      })();

      rows.push({ key: safeId ?? dedupeKey, id: safeId, rut, nombre, categoria, estado, pago: p, ts, virtual: false });
    }

    const mesesExigibles = buildMesesExigibles(new Date(), 5);

    for (const [rut, j] of jugadoresMap.entries()) {
      const setPagadas = mensualidadesPagadas.get(String(rut)) || new Set();

      for (const mm of mesesExigibles) {
        if (setPagadas.has(mm.key)) continue;

        const labelMes = monthLabelEs(mm.year, mm.month);
        const vKey = `VIRTUAL-${rut}-${mm.key}`;

        if (seen.has(`MENS-${rut}-${TIPO_PAGO_MENSUALIDAD}-${mm.key}`)) continue;

        rows.push({
          key: vKey,
          id: null,
          rut: String(rut),
          nombre: j?.nombre ?? "—",
          categoria: j?.categoria?.nombre ?? "Sin categoría",
          estado: "VENCIDO",
          pago: {
            id: null,
            monto: 0,
            fecha_pago: null,
            deuda_year: mm.year,
            deuda_month: mm.month,
            jugador: {
              rut_jugador: String(rut),
              nombre_jugador: j?.nombre ?? "—",
              categoria: j?.categoria ?? null,
            },
            tipo_pago: { id: TIPO_PAGO_MENSUALIDAD, nombre: `Mensualidad ${labelMes}` },
            situacion_pago: { id: null, nombre: "VENCIDO" },
            medio_pago: { id: null, nombre: "—" },
            observaciones: "",
          },
          ts: 0,
          virtual: true,
        });
      }
    }

    const pesoEstado = (estadoRaw) => {
      const e = (estadoRaw ?? "").toString().toUpperCase();
      if (e === "VENCIDO") return 0;
      if (e === "PAGADO") return 1;
      return 2;
    };

    rows.sort((a, b) => {
      const ea = pesoEstado(a.estado);
      const eb = pesoEstado(b.estado);
      if (ea !== eb) return ea - eb;

      const aKey = String(a?.key ?? "");
      const bKey = String(b?.key ?? "");

      if (aKey.startsWith("VIRTUAL-") && bKey.startsWith("VIRTUAL-")) {
        return aKey.localeCompare(bKey);
      }
      return b.ts - a.ts;
    });

    return rows;
  }, [pagos, jugadoresMap]);

  /* ─────────────────────────────
     Opciones filtros pagos
  ───────────────────────────── */
  const opcionesTipoPago = useMemo(() => {
    const m = new Map();
    for (const r of filas) {
      const id = r?.pago?.tipo_pago?.id;
      const nombre = r?.pago?.tipo_pago?.nombre;
      if (!id || !nombre) continue;
      m.set(String(id), nombre);
    }
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [filas]);

  const opcionesMedioPago = useMemo(() => {
    const m = new Map();
    for (const r of filas) {
      const id = r?.pago?.medio_pago?.id;
      const nombre = r?.pago?.medio_pago?.nombre;
      if (!id || !nombre) continue;
      m.set(String(id), nombre);
    }
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [filas]);

  /* ─────────────────────────────
     Filtros pagos + paginación
     ✅ Sin filtro categoría (columna eliminada)
  ───────────────────────────── */
  const filasFiltradas = useMemo(() => {
    const f = (filtroTexto || "").toLowerCase().trim();

    return filas.filter((row) => {
      const pago = row.pago ?? {};
      const rut = row.rut || "";
      const nombre = row.nombre || "";
      const categoria = row.categoria || "";

      let okTexto = true;
      if (f) {
        okTexto =
          rut.includes(f) ||
          formatRutWithDV(rut).toLowerCase().includes(f) ||
          nombre.toLowerCase().includes(f) ||
          // ✅ se mantiene búsqueda por categoría (aunque no se muestre la columna)
          categoria.toLowerCase().includes(f);
      }

      let okEstado = true;
      if (filtroEstado) okEstado = (row.estado ?? "").toUpperCase() === filtroEstado.toUpperCase();

      let okTipo = true;
      if (filtroTipoPago) {
        const idTipo = pago?.tipo_pago?.id ? String(pago.tipo_pago.id) : "";
        okTipo = idTipo === filtroTipoPago;
      }

      let okMedio = true;
      if (filtroMedioPago) {
        const idMedio = pago?.medio_pago?.id ? String(pago.medio_pago.id) : "";
        okMedio = idMedio === filtroMedioPago;
      }

      return okTexto && okEstado && okTipo && okMedio;
    });
  }, [filas, filtroTexto, filtroEstado, filtroTipoPago, filtroMedioPago]);

  const totalPages = useMemo(() => {
    const tp = Math.ceil(filasFiltradas.length / PAGE_SIZE);
    return Math.max(1, Math.min(tp || 1, MAX_PAGES));
  }, [filasFiltradas]);

  useEffect(() => setPage(1), [filtroTexto, filtroEstado, filtroTipoPago, filtroMedioPago]);

  const pageData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filasFiltradas.slice(start, end);
  }, [filasFiltradas, page]);

  /* ─────────────────────────────
     Jugadores para pagos manuales
  ───────────────────────────── */
  const jugadoresManualRows = useMemo(() => {
    const f = (manualFiltro || "").toLowerCase().trim();

    const rows = Array.from(jugadoresMap.entries()).map(([rut, j]) => ({
      rut: String(rut),
      nombre: j?.nombre ?? "—",
      categoria: j?.categoria?.nombre ?? "Sin categoría",
      sucursal: j?.sucursal?.nombre ?? "Sin sucursal",
    }));

    const filtrados = !f
      ? rows
      : rows.filter((r) => {
          const rutFmt = formatRutWithDV(r.rut).toLowerCase();
          return (
            r.rut.includes(f) ||
            rutFmt.includes(f) ||
            r.nombre.toLowerCase().includes(f) ||
            r.categoria.toLowerCase().includes(f) ||
            r.sucursal.toLowerCase().includes(f)
          );
        });

    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return filtrados;
  }, [jugadoresMap, manualFiltro]);

  const manualTotalPages = useMemo(() => {
    const tp = Math.ceil(jugadoresManualRows.length / MANUAL_PAGE_SIZE);
    return Math.max(1, Math.min(tp || 1, MAX_PAGES));
  }, [jugadoresManualRows]);

  useEffect(() => setManualPage(1), [manualFiltro]);

  const manualPageData = useMemo(() => {
    const start = (manualPage - 1) * MANUAL_PAGE_SIZE;
    const end = start + MANUAL_PAGE_SIZE;
    return jugadoresManualRows.slice(start, end);
  }, [jugadoresManualRows, manualPage]);

  /* ─────────────────────────────
     Acciones
  ───────────────────────────── */
  const openEdit = (row) => {
    const pago = row?.pago;
    if (!row?.rut) return;

    const isVirtual = Boolean(row.virtual);

    const deudaYear = pago?.deuda_year ?? null;
    const deudaMonth = pago?.deuda_month ?? null;

    const defaultFechaDeuda =
      deudaYear && deudaMonth ? `${deudaYear}-${String(deudaMonth).padStart(2, "0")}-01` : "";

    const idRaw = pago?.id ?? row?.id ?? null;
    const idNum = idRaw == null ? null : Number(idRaw);
    const safeId = Number.isFinite(idNum) && idNum > 0 ? idNum : null;

    setEditError("");
    setEditForm({
      id: isVirtual ? null : safeId,
      virtual: isVirtual,
      create: false,

      deuda_year: deudaYear,
      deuda_month: deudaMonth,

      jugador_rut: row.rut,
      monto: pago?.monto ?? "",
      fecha_pago: isVirtual
        ? defaultFechaDeuda
        : pago?.fecha_pago
          ? String(pago.fecha_pago).slice(0, 10)
          : "",
      tipo_pago_id: isVirtual
        ? String(TIPO_PAGO_MENSUALIDAD)
        : pago?.tipo_pago?.id != null
          ? String(pago.tipo_pago.id)
          : "",
      medio_pago_id: pago?.medio_pago?.id != null ? String(pago.medio_pago.id) : "",
      situacion_pago_id: isVirtual
        ? (situacionVencidoId != null ? String(situacionVencidoId) : "")
        : pago?.situacion_pago?.id != null
          ? String(pago.situacion_pago.id)
          : "",
      observaciones: pago?.observaciones ?? "",
    });

    setEditOpen(true);
  };

  const openManualPago = (rut) => {
    const r = String(rut ?? "").trim();
    if (!r) return;

    setEditError("");
    setEditForm({
      id: null,
      virtual: false,
      create: true,

      deuda_year: null,
      deuda_month: null,

      jugador_rut: r,
      monto: "",
      fecha_pago: "",
      tipo_pago_id: "",
      medio_pago_id: "",
      situacion_pago_id: String(SITUACION_PAGO_PAGADO_ID),
      observaciones: "",
    });

    setEditOpen(true);
  };

  const closeEdit = () => {
    if (editBusy || reloadBusy) return;
    setEditOpen(false);
  };

  const refetchPagosActivos = useCallback(async () => {
    const headers = buildHeaders(rolActual);

    const respEstado = await getWithFallback("/pagos-jugador/estado-cuenta", { headers });
    const rawPagos = Array.isArray(respEstado?.data?.pagos) ? respEstado.data.pagos : [];

    const rutsActivos = new Set(Array.from(jugadoresMap.keys()));
    const rawPagosActivos = rawPagos.filter((p) => {
      const rut = p?.jugador_rut ?? p?.rut_jugador ?? p?.rut ?? p?.jugador?.rut_jugador ?? p?.jugador?.rut;
      return rut != null && rutsActivos.has(String(rut));
    });

    const pagosNorm = normalizePagos(rawPagosActivos, {
      tipoPagoMap,
      medioPagoMap,
      situacionPagoMap,
      jugadoresMap,
    });

    setPagos(pagosNorm);
  }, [jugadoresMap, tipoPagoMap, medioPagoMap, situacionPagoMap, rolActual]);

  const showSuccessAndReload = useCallback(
    async (msg) => {
      setSuccessMsg(msg);
      setSuccessOpen(true);
      await new Promise((r) => setTimeout(r, 900));
      setSuccessOpen(false);

      setReloadBusy(true);
      setIsLoading(true);

      try {
        await refetchPagosActivos();
      } finally {
        setIsLoading(false);
        setReloadBusy(false);
      }
    },
    [refetchPagosActivos]
  );

  const submitEdit = async (e) => {
    e.preventDefault();

    if (!editForm.jugador_rut) {
      setEditError("RUT inválido");
      return;
    }

    const isVirtual = Boolean(editForm.virtual);
    const isCreate = Boolean(editForm.create);

    const payload = {
      jugador_rut: editForm.jugador_rut,
      monto: Number(editForm.monto),
      fecha_pago: editForm.fecha_pago,
      tipo_pago_id: isVirtual ? TIPO_PAGO_MENSUALIDAD : Number(editForm.tipo_pago_id),
      medio_pago_id: Number(editForm.medio_pago_id),
      // 👇 tu comportamiento actual: virtual se guarda como PAGADO
      situacion_pago_id: isVirtual ? SITUACION_PAGO_PAGADO_ID : Number(editForm.situacion_pago_id),
      observaciones: editForm.observaciones ?? "",
    };

    if (!payload.monto || Number(payload.monto) <= 0) return setEditError("El monto debe ser mayor a 0");
    if (!payload.fecha_pago) return setEditError("La fecha de pago es obligatoria");
    if (!payload.medio_pago_id) return setEditError("Seleccione medio de pago");
    if (!payload.tipo_pago_id) return setEditError("Seleccione tipo de pago");
    if (!payload.situacion_pago_id) return setEditError("Seleccione situación");

    setEditBusy(true);
    setEditError("");

    const headers = buildHeaders(rolActual);

    try {
      if (isVirtual || isCreate) {
        await postWithFallback("/pagos-jugador", payload, { headers });
        setEditOpen(false);
        await showSuccessAndReload("Pago completado");
        return;
      }

      const idNum = Number(editForm.id);
      if (!Number.isFinite(idNum) || idNum <= 0) {
        setEditError("ID de pago inválido");
        return;
      }

      await putWithFallback(`/pagos-jugador/${idNum}`, payload, { headers });

      setPagos((prev) =>
        prev.map((p) => {
          const pid = Number(p?.id);
          if (!Number.isFinite(pid) || pid !== idNum) return p;

          return {
            ...p,
            id: idNum,
            monto: Number(payload.monto),
            fecha_pago: payload.fecha_pago,
            tipo_pago: {
              id: Number(payload.tipo_pago_id),
              nombre: tipoPagoMap.get(String(payload.tipo_pago_id)) ?? p.tipo_pago?.nombre,
            },
            medio_pago: {
              id: Number(payload.medio_pago_id),
              nombre: medioPagoMap.get(String(payload.medio_pago_id)) ?? p.medio_pago?.nombre,
            },
            situacion_pago: {
              id: Number(payload.situacion_pago_id),
              nombre: situacionPagoMap.get(String(payload.situacion_pago_id)) ?? p.situacion_pago?.nombre,
            },
            observaciones: payload.observaciones ?? "",
          };
        })
      );

      setEditOpen(false);
      await showSuccessAndReload("Registro actualizado");
    } catch (err) {
      const st = err?.status ?? err?.response?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      setEditError(err?.response?.data?.message || err?.message || "No se pudo guardar el pago");
    } finally {
      setEditBusy(false);
    }
  };

  const removePago = async (row) => {
    const pago = row?.pago;
    if (!pago || !pago.id || row?.virtual) return;

    const ok = window.confirm(`¿Eliminar el pago #${pago.id}? Esta acción es irreversible.`);
    if (!ok) return;

    const headers = buildHeaders(rolActual);

    try {
      await deleteWithFallback(`/pagos-jugador/${pago.id}`, { headers });
      setPagos((prev) => prev.filter((p) => Number(p.id) !== Number(pago.id)));
    } catch (err) {
      const st = err?.status ?? err?.response?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      alert(err?.message || "No se pudo eliminar el pago");
    }
  };

  /* ─────────────────────────────
     Render
  ───────────────────────────── */
  if (isLoading) return <IsLoading />;

  if (error && !pagos.length) {
    return (
      <div className={`${ui.page} flex justify-center items-center`}>
        <div className={ui.msgBox}>{error}</div>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      {/* Header */}
      <header className="max-w-6xl mx-auto">
        <div className="text-center">
          <h1 className={`text-xl sm:text-2xl font-extrabold tracking-tightish ${ui.title}`}>
            Pagos Centralizados
          </h1>
          <p className={`text-[11px] sm:text-xs mt-1 ${ui.subtitle}`}>
            Vista consolidada de pagos de jugadores <span className="font-semibold">ACTIVOS</span>. Se agregan filas virtuales de{" "}
            <span className="font-semibold">Mensualidad VENCIDA</span> cuando falta el registro.
          </p>
        </div>
      </header>

      <main className="mt-4">
        {!!error && (
          <div className="max-w-6xl mx-auto mb-3">
            <div className={ui.warnBox}>{error}</div>
          </div>
        )}

        {/* Filtros pagos */}
        <div className={`${ui.card} ${ui.cardPad}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>Filtros</h3>
            <span className={ui.badge}>
              Filtrados: {filasFiltradas.length} · Página: {page}/{totalPages}
            </span>
          </div>

          <div className="mt-3" style={{ height: 1, background: ui.line }} />

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end w-full">
            <input
              type="text"
              placeholder="Buscar por RUT, nombre (o categoría)"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className={ui.controlBase}
            />

            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={ui.controlBase}>
              <option value="">Estado (todos)</option>
              <option value="PAGADO">PAGADO</option>
              <option value="VENCIDO">VENCIDO</option>
            </select>

            <select value={filtroTipoPago} onChange={(e) => setFiltroTipoPago(e.target.value)} className={ui.controlBase}>
              <option value="">Tipo de pago (todos)</option>
              {opcionesTipoPago.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select value={filtroMedioPago} onChange={(e) => setFiltroMedioPago(e.target.value)} className={ui.controlBase}>
              <option value="">Medio de pago (todos)</option>
              {opcionesMedioPago.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla pagos */}
        <div className={`${ui.card} ${ui.cardPad} mt-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>Tabla de Pagos</h3>
            <span className={ui.badge}>
              Mostrando {pageData.length} de {filasFiltradas.length}
            </span>
          </div>

          <div className="mt-3" style={{ height: 1, background: ui.line }} />

          <div className={`mt-3 ${ui.tableWrap}`}>
            <table className={ui.table}>
              <thead className={ui.thead}>
                <tr>
                  <th className={`${ui.thBase} min-w-[110px]`} style={{ ...ui.headBorderStyle, borderLeft: ui.border }}>
                    RUT
                  </th>
                  <th className={`${ui.thBase} min-w-[220px]`} style={ui.headBorderStyle}>
                    Nombre
                  </th>
                  {/* ✅ CATEGORÍA ELIMINADA */}
                  <th className={`${ui.thBase} min-w-[190px]`} style={ui.headBorderStyle}>
                    Tipo
                  </th>
                  <th className={`${ui.thBase} min-w-[130px]`} style={ui.headBorderStyle}>
                    Estado
                  </th>
                  <th className={`${ui.thBase} min-w-[110px]`} style={ui.headBorderStyle}>
                    Fecha
                  </th>
                  <th className={`${ui.thBase} min-w-[110px]`} style={ui.headBorderStyle}>
                    Monto
                  </th>
                  <th className={`${ui.thBase} min-w-[150px]`} style={ui.headBorderStyle}>
                    Medio
                  </th>
                  <th className={`${ui.thBase} min-w-[96px]`} style={{ ...ui.headBorderStyle, borderRight: ui.border }}>
                    Acción
                  </th>
                </tr>
              </thead>

              <tbody>
                {pageData.map((row) => {
                  const pago = row.pago;
                  return (
                    <tr key={row.key} className={ui.tr}>
                      <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderLeft: ui.border }}>
                        {row.rut ? formatRutWithDV(row.rut) : "—"}
                      </td>

                      <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                        {row.nombre}
                      </td>

                      <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                        {pago?.tipo_pago?.nombre ?? "—"}
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        <span
                          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ui.pill(
                            row.estado
                          )}`}
                        >
                          {row.estado}
                        </span>
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        {pago?.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString("es-CL") : "—"}
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        {pago ? toCLP(pago.monto) : "—"}
                      </td>

                      <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                        {pago?.medio_pago?.nombre ?? "—"}
                      </td>

                      <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderRight: ui.border }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEdit(row)}
                            className="p-0.5 rounded hover:bg-white/10 disabled:opacity-50"
                            title={row.virtual ? "Registrar pago de mensualidad" : "Editar pago"}
                            disabled={reloadBusy}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            onClick={() => removePago(row)}
                            className="p-0.5 rounded hover:bg-white/10 disabled:opacity-50"
                            title={row.virtual ? "No se puede eliminar (fila virtual)" : "Eliminar pago"}
                            disabled={reloadBusy || row.virtual || !pago?.id}
                          >
                            <Trash2 size={16} color="#ff6b6b" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {pageData.length === 0 && (
                  <tr>
                    <td
                      className={ui.tdBase}
                      style={{ ...ui.cellBorderStyle, borderLeft: ui.border, borderRight: ui.border }}
                      colSpan={8}
                    >
                      No hay registros que coincidan con los filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación pagos */}
          <div className="mt-4 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={reloadBusy || page <= 1}
                className={ui.btnSecondary}
              >
                Anterior
              </button>

              <span className={ui.badge}>
                Página <span style={{ color: PALETTE.sand }} className="font-extrabold">{page}</span> de{" "}
                <span className="font-extrabold">{totalPages}</span>
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={reloadBusy || page >= totalPages}
                className={ui.btnSecondary}
              >
                Siguiente
              </button>
            </div>

            <div className={`text-[11px] ${ui.subtitle}`}>
              Mostrando <span className="font-semibold">{pageData.length}</span> de{" "}
              <span className="font-semibold">{filasFiltradas.length}</span> pagos filtrados.
            </div>
          </div>
        </div>

        {/* ─────────────────────────────
            INGRESAR PAGOS MANUALES
          ───────────────────────────── */}
        <div className={`${ui.card} ${ui.cardPad} mt-6`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
              Ingresar Pagos Manuales
            </h3>
            <span className={ui.badge}>Jugadores activos: {jugadoresManualRows.length}</span>
          </div>

          <div className="mt-1">
            <p className={`text-[11px] ${ui.subtitle} text-center sm:text-left`}>
              Se listan <span className="font-semibold">solo jugadores activos</span> (estado_id = 1).
            </p>
          </div>

          <div className="mt-3" style={{ height: 1, background: ui.line }} />

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 items-end">
            <input
              type="text"
              placeholder="Buscar por RUT, nombre, categoría o sucursal"
              value={manualFiltro}
              onChange={(e) => setManualFiltro(e.target.value)}
              className={ui.controlBase}
            />
            <div className={`text-[11px] ${ui.subtitle} md:text-right`}>
              Página {manualPage}/{manualTotalPages}
            </div>
          </div>

          <div className={`mt-3 ${ui.tableWrap}`}>
            <table className={ui.table}>
              <thead className={ui.thead}>
                <tr>
                  <th className={`${ui.thBase} min-w-[110px]`} style={{ ...ui.headBorderStyle, borderLeft: ui.border }}>
                    RUT
                  </th>
                  <th className={`${ui.thBase} min-w-[260px]`} style={ui.headBorderStyle}>
                    Nombre
                  </th>
                  <th className={`${ui.thBase} min-w-[150px]`} style={ui.headBorderStyle}>
                    Categoría
                  </th>
                  <th className={`${ui.thBase} min-w-[150px]`} style={ui.headBorderStyle}>
                    Sucursal
                  </th>
                  <th className={`${ui.thBase} min-w-[150px]`} style={{ ...ui.headBorderStyle, borderRight: ui.border }}>
                    Acción
                  </th>
                </tr>
              </thead>

              <tbody>
                {manualPageData.map((j) => (
                  <tr key={`MANUAL-${j.rut}`} className={ui.tr}>
                    <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderLeft: ui.border }}>
                      {formatRutWithDV(j.rut)}
                    </td>
                    <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                      {j.nombre}
                    </td>
                    <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                      {j.categoria}
                    </td>
                    <td className={`${ui.tdBase} break-all`} style={ui.cellBorderStyle}>
                      {j.sucursal}
                    </td>
                    <td className={ui.tdBase} style={{ ...ui.cellBorderStyle, borderRight: ui.border }}>
                      <button
                        onClick={() => openManualPago(j.rut)}
                        disabled={reloadBusy}
                        className={ui.btnPrimary}
                        style={ui.btnPrimaryStyle}
                        title="Ingresar pago manual"
                      >
                        <CreditCard size={14} />
                        Ingresar pago
                      </button>
                    </td>
                  </tr>
                ))}

                {manualPageData.length === 0 && (
                  <tr>
                    <td
                      className={ui.tdBase}
                      style={{ ...ui.cellBorderStyle, borderLeft: ui.border, borderRight: ui.border }}
                      colSpan={5}
                    >
                      No hay jugadores que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* paginación manual */}
          <div className="mt-4 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setManualPage((p) => Math.max(1, p - 1))}
                disabled={reloadBusy || manualPage <= 1}
                className={ui.btnSecondary}
              >
                Anterior
              </button>

              <span className={ui.badge}>
                Página <span style={{ color: PALETTE.sand }} className="font-extrabold">{manualPage}</span> de{" "}
                <span className="font-extrabold">{manualTotalPages}</span>
              </span>

              <button
                onClick={() => setManualPage((p) => Math.min(manualTotalPages, p + 1))}
                disabled={reloadBusy || manualPage >= manualTotalPages}
                className={ui.btnSecondary}
              >
                Siguiente
              </button>
            </div>

            <div className={`text-[11px] ${ui.subtitle}`}>
              Mostrando <span className="font-semibold">{manualPageData.length}</span> de{" "}
              <span className="font-semibold">{jugadoresManualRows.length}</span> jugadores filtrados.
            </div>
          </div>
        </div>
      </main>

      {/* Modal Edición / Registro */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-3">
          <div className={ui.modalCard}>
            <div
              className={`px-4 py-3 border-b flex items-center justify-between gap-3 ${
                darkMode ? "border-white/10" : "border-ra-marron/10"
              }`}
            >
              <h3 className={`text-[13px] font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                {editForm.virtual
                  ? `Registrar mensualidad vencida (${monthLabelEs(editForm.deuda_year, editForm.deuda_month)}) - ${formatRutWithDV(
                      editForm.jugador_rut
                    )}`
                  : editForm.create
                    ? `Ingresar pago manual - ${formatRutWithDV(editForm.jugador_rut)}`
                    : `Editar pago #${editForm.id}`}
              </h3>

              <button
                className="p-1 rounded hover:bg-white/10 disabled:opacity-50"
                onClick={closeEdit}
                disabled={editBusy || reloadBusy}
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4">
              {editError && <div className={`mb-2 ${ui.warnBox}`}>{editError}</div>}

              <form onSubmit={submitEdit} className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>RUT Jugador</label>
                  <input type="text" value={formatRutWithDV(editForm.jugador_rut)} className={ui.controlBase} disabled />
                </div>

                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Monto (CLP)</label>
                  <input
                    type="number"
                    value={editForm.monto}
                    onChange={(e) => setEditForm((f) => ({ ...f, monto: e.target.value }))}
                    className={ui.controlBase}
                    required
                    disabled={editBusy || reloadBusy}
                  />
                </div>

                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Fecha pago</label>
                  <input
                    type="date"
                    value={editForm.fecha_pago}
                    onChange={(e) => setEditForm((f) => ({ ...f, fecha_pago: e.target.value }))}
                    className={ui.controlBase}
                    required
                    disabled={editBusy || reloadBusy}
                  />
                </div>

                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Tipo de pago</label>
                  <select
                    value={editForm.tipo_pago_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, tipo_pago_id: e.target.value }))}
                    className={ui.controlBase}
                    required
                    disabled={editForm.virtual || editBusy || reloadBusy}
                  >
                    <option value="">Seleccione…</option>
                    {Array.from(tipoPagoMap, ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Medio de pago</label>
                  <select
                    value={editForm.medio_pago_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, medio_pago_id: e.target.value }))}
                    className={ui.controlBase}
                    required
                    disabled={editBusy || reloadBusy}
                  >
                    <option value="">Seleccione…</option>
                    {Array.from(medioPagoMap, ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Situación</label>

                  {editForm.virtual ? (
                    <>
                      <input type="text" value="VENCIDO" className={ui.controlBase} disabled />
                      <p className={`text-[10px] mt-1 ${ui.subtitle}`}>
                        Esta fila es <span className="font-semibold">VENCIDA</span>. Al guardar se registrará como{" "}
                        <span className="font-semibold">PAGADO</span>.
                      </p>
                    </>
                  ) : (
                    <select
                      value={editForm.situacion_pago_id}
                      onChange={(e) => setEditForm((f) => ({ ...f, situacion_pago_id: e.target.value }))}
                      className={ui.controlBase}
                      required
                      disabled={editBusy || reloadBusy}
                    >
                      <option value="">Seleccione…</option>
                      {Array.from(situacionPagoMap, ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className={`block text-[11px] mb-1 ${ui.subtitle}`}>Observaciones</label>
                  <textarea
                    value={editForm.observaciones}
                    onChange={(e) => setEditForm((f) => ({ ...f, observaciones: e.target.value }))}
                    className={ui.controlTextArea}
                    placeholder="Opcional"
                    disabled={editBusy || reloadBusy}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2 mt-1.5">
                  <button type="button" onClick={closeEdit} disabled={editBusy || reloadBusy} className={ui.btnSecondary}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={editBusy || reloadBusy} className={ui.btnPrimary} style={ui.btnPrimaryStyle}>
                    {editBusy ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de éxito */}
      {successOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-3">
          <div className={ui.modalCard}>
            <div className="p-5 text-center">
              <div className="text-3xl mb-1">✅</div>
              <h4 className={`text-[13px] font-extrabold mb-1 ${darkMode ? "text-white" : "text-ra-marron"}`}>
                {successMsg}
              </h4>
              <p className={`text-[11px] ${ui.subtitle}`}>Actualizando información…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
