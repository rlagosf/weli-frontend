// src/pages/admin/estadisticasGlobales.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";
import api, { getToken, clearToken } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

Chart.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

/* ───────── Valor centrado en la porción ───────── */
const PieValueInsidePlugin = {
  id: "pieValueInside",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const { ctx } = chart;
    const ds = chart.data.datasets?.[0];
    if (!ds) return;

    const meta = chart.getDatasetMeta(0);
    const values = ds.data || [];

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = (pluginOptions && pluginOptions.font) || "12px sans-serif";
    ctx.fillStyle =
      (pluginOptions && pluginOptions.color) ||
      (chart.options?.plugins?.legend?.labels?.color || "#111");

    meta.data.forEach((arc, i) => {
      const val = Number(values[i] || 0);
      if (!arc || !Number.isFinite(val)) return;
      if ((arc.circumference || 0) < 0.1) return;
      const p = arc.tooltipPosition();
      ctx.fillText(String(val), p.x, p.y);
    });

    ctx.restore();
  },
};

/* ───────── Leyenda HTML: compacta + 2 por línea ───────── */
const HtmlLegendPlugin = {
  id: "htmlLegend",
  afterUpdate(chart, _args, options) {
    const containerID = options?.containerID;
    if (!containerID) return;

    const root = document.getElementById(containerID);
    if (!root) return;

    root.innerHTML = "";
    root.setAttribute("data-weli-legend", "1");

    root.style.setProperty("display", "block", "important");
    root.style.setProperty("width", "100%", "important");
    root.style.setProperty("max-width", "220px", "important");
    root.style.setProperty("overflow-x", "hidden", "important");
    root.style.setProperty("overflow-y", "auto", "important");
    root.style.setProperty("white-space", "normal", "important");
    root.style.setProperty("float", "none", "important");

    const labels = Array.isArray(chart.data?.labels) ? chart.data.labels : [];
    const ds0 = chart.data?.datasets?.[0];
    if (!ds0 || !labels.length) return;

    const values = Array.isArray(ds0.data) ? ds0.data : [];
    const bg = ds0.backgroundColor;

    const col = document.createElement("div");
    col.setAttribute("data-weli-legend-col", "1");

    col.style.setProperty("display", "grid", "important");
    col.style.setProperty("grid-template-columns", "repeat(2, minmax(0, 1fr))", "important");
    col.style.setProperty("gap", "6px", "important");
    col.style.setProperty("width", "100%", "important");
    col.style.setProperty("align-items", "stretch", "important");

    labels.forEach((label, i) => {
      const item = document.createElement("div");
      item.setAttribute("data-weli-legend-item", "1");

      item.style.setProperty("display", "block", "important");
      item.style.setProperty("width", "100%", "important");
      item.style.setProperty("clear", "both", "important");
      item.style.setProperty("padding", "4px 6px", "important");
      item.style.setProperty("border-radius", "6px", "important");
      item.style.setProperty("border", "1px solid rgba(156,163,175,0.55)", "important");
      item.style.setProperty("cursor", "pointer", "important");
      item.style.setProperty("user-select", "none", "important");

      item.onmouseenter = () =>
        item.style.setProperty("background", "rgba(156,163,175,0.12)", "important");
      item.onmouseleave = () =>
        item.style.setProperty("background", "transparent", "important");

      const row = document.createElement("div");
      row.style.setProperty("display", "flex", "important");
      row.style.setProperty("align-items", "center", "important");
      row.style.setProperty("gap", "6px", "important");
      row.style.setProperty("width", "100%", "important");
      row.style.setProperty("min-width", "0", "important");

      const box = document.createElement("span");
      box.style.setProperty("display", "inline-block", "important");
      box.style.setProperty("width", "10px", "important");
      box.style.setProperty("height", "10px", "important");
      box.style.setProperty("border-radius", "3px", "important");
      box.style.setProperty("flex-shrink", "0", "important");

      const color = Array.isArray(bg) ? (bg[i] || "#999") : (bg || "#999");
      box.style.setProperty("background", color, "important");

      const visible = chart.getDataVisibility(i);
      box.style.setProperty("opacity", visible ? "1" : "0.3", "important");

      const val = Number(values?.[i] ?? 0);

      const text = document.createElement("span");
      text.style.setProperty("display", "block", "important");
      text.style.setProperty("width", "100%", "important");
      text.style.setProperty("min-width", "0", "important");
      text.style.setProperty("white-space", "nowrap", "important");
      text.style.setProperty("overflow", "hidden", "important");
      text.style.setProperty("text-overflow", "ellipsis", "important");
      text.style.setProperty("font-size", "11px", "important");
      text.style.setProperty("line-height", "1.1", "important");
      text.style.setProperty("opacity", visible ? "1" : "0.55", "important");

      text.textContent = `${String(label)} (${val})`;
      text.title = `${String(label)} (${val})`;

      item.onclick = () => {
        chart.toggleDataVisibility(i);
        chart.update();
      };

      row.appendChild(box);
      row.appendChild(text);
      item.appendChild(row);
      col.appendChild(item);
    });

    root.appendChild(col);
  },
};

Chart.register(PieValueInsidePlugin, HtmlLegendPlugin);

/* ───────────────── Scope helpers ───────────────── */
const STORAGE_KEY = "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const id = Number(p?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const deporte_id = Number(p?.deporte_id ?? 0);
    return {
      id,
      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
      nombre: p?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) =>
  String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

/* ───────────────── Deportes: config por deporte ───────────────── */
const SPORT_META = {
  1: {
    nombre: "Fútbol",
    grupos: {
      ofensivas: [
        "goles",
        "asistencias",
        "tiros_libres",
        "penales",
        "tiros_arco",
        "tiros_fuera",
        "tiros_bloqueados",
        "regates_exitosos",
        "centros_acertados",
        "pases_clave",
      ],
      defensivas: [
        "intercepciones",
        "despejes",
        "duelos_ganados",
        "entradas_exitosas",
        "bloqueos",
        "recuperaciones",
      ],
      tecnicas: [
        "pases_completados",
        "pases_errados",
        "posesion_perdida",
        "offsides",
        "faltas_cometidas",
        "faltas_recibidas",
      ],
      fisicas: [
        "distancia_recorrida_km",
        "sprints",
        "duelos_aereos_ganados",
        "minutos_jugados",
        "partidos_jugados", // ✅ ojo: alias también soporta partidos_jugador
      ],
      medicas: ["lesiones", "dias_baja"],
      disciplina: ["tarjetas_amarillas", "tarjetas_rojas", "sanciones_federativas"],
    },
    traducciones: {
      goles: "Goles",
      asistencias: "Asistencias",
      tiros_libres: "Tiros Libres",
      penales: "Penales",
      tiros_arco: "Tiros al Arco",
      tiros_fuera: "Tiros Fuera",
      tiros_bloqueados: "Tiros Bloqueados",
      regates_exitosos: "Regates Exitosos",
      centros_acertados: "Centros Acertados",
      pases_clave: "Pases Clave",
      intercepciones: "Intercepciones",
      despejes: "Despejes",
      duelos_ganados: "Duelos Ganados",
      entradas_exitosas: "Entradas Exitosas",
      bloqueos: "Bloqueos",
      recuperaciones: "Recuperaciones",
      pases_completados: "Pases Completados",
      pases_errados: "Pases Errados",
      posesion_perdida: "Pérdidas de Posesión",
      offsides: "Offsides",
      faltas_cometidas: "Faltas Cometidas",
      faltas_recibidas: "Faltas Recibidas",
      distancia_recorrida_km: "Distancia Recorrida (Km)",
      sprints: "Sprints",
      duelos_aereos_ganados: "Duelos Aéreos Ganados",
      minutos_jugados: "Minutos Jugados",
      partidos_jugados: "Partidos Jugados",
      lesiones: "Lesiones",
      dias_baja: "Días de Baja",
      tarjetas_amarillas: "Tarjetas Amarillas",
      tarjetas_rojas: "Tarjetas Rojas",
      sanciones_federativas: "Sanciones Federativas",
    },
  },
  2: { nombre: "Vóleibol", grupos: { rendimiento: [] }, traducciones: {} },
  3: { nombre: "Tenis", grupos: { rendimiento: [] }, traducciones: {} },
  4: { nombre: "Pádel", grupos: { rendimiento: [] }, traducciones: {} },
  5: { nombre: "Tenis de mesa", grupos: { rendimiento: [] }, traducciones: {} },
  6: { nombre: "Básquetbol", grupos: { rendimiento: [] }, traducciones: {} },
};

/* ✅ NEW: aliases y getter robusto */
const STAT_ALIASES = {
  // tu caso típico:
  partidos_jugados: ["partidos_jugador", "partidos", "pj"],

  // por si backend cambia nombres:
  distancia_recorrida_km: ["distancia_km", "km_recorridos"],

  // si tu backend prefiere singular/plural
  sprints: ["sprint"],

  // si el backend retorna un key distinto
  torneos_convocados: ["torneos", "convocados"],
};

function pick(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  return obj[key];
}

function getStatValue(row, key) {
  if (!row) return 0;

  // 1) directo
  let v = pick(row, key);

  // 2) aliases
  if (v == null) {
    const alt = STAT_ALIASES[key] || [];
    for (const k of alt) {
      v = pick(row, k);
      if (v != null) break;
    }
  }

  // 3) nested (muy común cuando haces join y devuelves { base:..., futbol:... })
  if (v == null) {
    const nests = ["futbol", "stats_futbol", "stats", "detail", "data"];
    for (const nk of nests) {
      const sub = pick(row, nk);
      if (!sub) continue;
      v = pick(sub, key);
      if (v == null) {
        const alt = STAT_ALIASES[key] || [];
        for (const k of alt) {
          v = pick(sub, k);
          if (v != null) break;
        }
      }
      if (v != null) break;
    }
  }

  // 4) prefijos típicos
  if (v == null) {
    const prefixes = ["sf_", "stats_futbol_", "futbol_", "st_"];
    for (const pre of prefixes) {
      v = pick(row, `${pre}${key}`);
      if (v != null) break;

      const alt = STAT_ALIASES[key] || [];
      for (const k of alt) {
        v = pick(row, `${pre}${k}`);
        if (v != null) break;
      }
      if (v != null) break;
    }
  }

  // 5) número final
  const n = key === "distancia_recorrida_km" ? Number.parseFloat(String(v ?? 0)) : Number.parseInt(String(v ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function EstadisticasGlobales() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [jugadoresActivos, setJugadoresActivos] = useState([]);
  const [jugadoresTodos, setJugadoresTodos] = useState([]);
  const [estadisticas, setEstadisticas] = useState([]);

  const [categorias, setCategorias] = useState([]);
  const [posiciones, setPosiciones] = useState([]);
  const [estados, setEstados] = useState([]);

  const [sucursales, setSucursales] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rol, setRol] = useState(null);

  const [scope, setScope] = useState({
    academia_id: null,
    deporte_id: null,
    academia_nombre: null,
  });

  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjetaClase = darkMode
    ? "bg-[#1f2937] text-white border border-gray-700"
    : "bg-white text-[#1d0b0b] border border-gray-200";

  useMobileAutoScrollTop();

  const deporteId = Number(scope.deporte_id ?? 1) || 1;
  const sportMeta = SPORT_META[deporteId] ?? SPORT_META[1];

  useEffect(() => {
    const prevTitle = document.title;
    const title = `Estadísticas Globales — ${sportMeta.nombre}`;

    document.dispatchEvent(new CustomEvent("updateBreadcrumb", { detail: { title } }));
    document.dispatchEvent(new CustomEvent("weli:setTitle", { detail: { title } }));

    return () => {
      document.title = prevTitle;
    };
  }, [sportMeta.nombre]);

  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded?.exp && decoded.exp < now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
      const parsedRol = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (![1, 2, 3].includes(parsedRol)) {
        navigate("/admin", { replace: true });
        return;
      }
      setRol(parsedRol);

      const isSuperTree = isSuperTreePath(location.pathname);

      if (isSuperTree) {
        const snap = readSelectedAcademia();
        if (!snap?.id) {
          navigate("/super-dashboard", { replace: true });
          return;
        }
        setScope({
          academia_id: snap.id,
          deporte_id: snap.deporte_id,
          academia_nombre: snap.nombre ?? null,
        });
      } else {
        const acad = Number(decoded?.academia_id ?? decoded?.academy_id ?? 0) || null;
        const dep = Number(decoded?.deporte_id ?? decoded?.sport_id ?? 0) || null;
        setScope({ academia_id: acad, deporte_id: dep, academia_nombre: null });
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname]);

  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    return [];
  };

  const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

  const tryGetList = async (paths, signal) => {
    const list = Array.isArray(paths) ? paths : [paths];

    const variants = [];
    for (const p0 of list) {
      const p = String(p0 || "");
      const base = p.startsWith("/") ? p : `/${p}`;
      variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
    }
    const uniq = [...new Set(variants)];

    for (const url of uniq) {
      try {
        const r = await api.get(url, { signal });
        return normalizeListResponse(r);
      } catch (e) {
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
        continue;
      }
    }
    return [];
  };

  const normalizeCatalog = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => ({
        id: Number(
          x?.id ??
            x?.categoria_id ??
            x?.posicion_id ??
            x?.estado_id ??
            x?.sucursal_id ??
            x?.prevision_medica_id
        ),
        nombre: String(x?.nombre ?? x?.descripcion ?? "").trim(),
      }))
      .filter((x) => Number.isFinite(x.id) && x.nombre);

  useEffect(() => {
    if (rol == null) return;

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const acadId = scope.academia_id;
        const depId = scope.deporte_id;

        const jugadoresTodosPaths =
          rol === 2
            ? [
                "/jugadores/staff?include_inactivos=1",
                "/jugadores/staff/todos",
                "/jugadores/staff/all",
                "/jugadores?include_inactivos=1",
                "/jugadores/todos",
                "/jugadores/all",
                "/jugadores/staff",
                "/jugadores",
              ]
            : ["/jugadores?include_inactivos=1", "/jugadores/todos", "/jugadores/all", "/jugadores"];

        const jugadoresActivosPaths =
          rol === 2
            ? [
                "/jugadores/staff?estado_id=1",
                "/jugadores/staff?estado=1",
                "/jugadores/staff",
                "/jugadores?estado_id=1",
                "/jugadores?estado=1",
                "/jugadores",
              ]
            : ["/jugadores?estado_id=1", "/jugadores?estado=1", "/jugadores"];

        const statsPaths = [];
        if (acadId && depId) statsPaths.push(`/estadisticas?academia_id=${acadId}&deporte_id=${depId}`);
        else if (acadId) statsPaths.push(`/estadisticas?academia_id=${acadId}`);
        else statsPaths.push("/estadisticas");

        const [rawTodos, rawActivos, cats, poss, ests, sucs, prevs, stats] = await Promise.all([
          tryGetList(jugadoresTodosPaths, abort.signal),
          tryGetList(jugadoresActivosPaths, abort.signal),
          tryGetList(["/categorias"], abort.signal),
          tryGetList(["/posiciones"], abort.signal),
          tryGetList(["/estado"], abort.signal),
          tryGetList(["/sucursales-real", "/sucursales"], abort.signal),
          tryGetList(["/prevision-medica"], abort.signal),
          tryGetList(statsPaths, abort.signal),
        ]);

        if (abort.signal.aborted) return;

        const catsN = normalizeCatalog(cats);
        const possN = normalizeCatalog(poss);
        const estsN = normalizeCatalog(ests);
        const sucsN = normalizeCatalog(sucs);
        const prevsN = normalizeCatalog(prevs);

        setCategorias(catsN);
        setPosiciones(possN);
        setEstados(estsN);
        setSucursales(sucsN);
        setPrevisiones(prevsN);

        const posMapLocal = new Map((possN ?? []).map((p) => [Number(p.id), p.nombre]));
        const catMapLocal = new Map((catsN ?? []).map((c) => [Number(c.id), c.nombre]));
        const estMapLocal = new Map((estsN ?? []).map((e) => [Number(e.id), e.nombre]));
        const sucMapLocal = new Map((sucsN ?? []).map((s) => [Number(s.id), s.nombre]));
        const prevMapLocal = new Map((prevsN ?? []).map((p) => [Number(p.id), p.nombre]));

        const normalizeJugadores = (arr) => {
          const safe = Array.isArray(arr) ? arr : [];
          return safe.map((j) => {
            const catObj = j?.categoria
              ? j.categoria
              : catMapLocal.has(Number(j?.categoria_id))
              ? { nombre: catMapLocal.get(Number(j.categoria_id)) }
              : null;

            return {
              ...j,
              posicion:
                j?.posicion ??
                (posMapLocal.has(Number(j?.posicion_id))
                  ? { nombre: posMapLocal.get(Number(j.posicion_id)) }
                  : null),
              categoria: catObj,
              estado:
                j?.estado ??
                (estMapLocal.has(Number(j?.estado_id))
                  ? { nombre: estMapLocal.get(Number(j.estado_id)) }
                  : null),
              sucursal:
                j?.sucursal ??
                (sucMapLocal.has(Number(j?.sucursal_id))
                  ? { nombre: sucMapLocal.get(Number(j.sucursal_id)) }
                  : null),
              prevision_medica:
                j?.prevision_medica ??
                (prevMapLocal.has(Number(j?.prevision_medica_id))
                  ? { nombre: prevMapLocal.get(Number(j.prevision_medica_id)) }
                  : null),
            };
          });
        };

        const applyScopeFilter = (arr, fallbackSetScope) => {
          const safe = Array.isArray(arr) ? arr : [];
          let a = scope.academia_id;
          let d = scope.deporte_id;

          if ((!a || !d) && safe.length) {
            const j0 = safe.find((x) => x && (x.academia_id || x.deporte_id));
            const a0 = Number(j0?.academia_id ?? 0) || null;
            const d0 = Number(j0?.deporte_id ?? 0) || null;

            if (!a && a0) a = a0;
            if (!d && d0) d = d0;

            if (fallbackSetScope && (a || d)) {
              setScope((prev) => ({
                ...prev,
                academia_id: prev.academia_id ?? a,
                deporte_id: prev.deporte_id ?? d,
              }));
            }
          }

          if (!a && !d) return safe;

          return safe.filter((j) => {
            const aj = Number(j?.academia_id ?? 0);
            const dj = Number(j?.deporte_id ?? 0);
            if (a && aj !== a) return false;
            if (d && dj !== d) return false;
            return true;
          });
        };

        const todosScoped = applyScopeFilter(rawTodos, true);
        const activosScoped = applyScopeFilter(rawActivos, true);

        setJugadoresTodos(normalizeJugadores(todosScoped));
        setJugadoresActivos(normalizeJugadores(activosScoped));

        // ✅ NEW: estadísticas: dejamos el array tal cual, pero nuestras sumas son robustas.
        const statsArr = Array.isArray(stats) ? stats : [];
        setEstadisticas(statsArr);

        if (!todosScoped.length) {
          setError("⚠️ No se encontraron jugadores en este scope (academia/deporte).");
        }
      } catch (e) {
        if (abort.signal.aborted) return;

        const st = getErrStatus(e);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError("Error al cargar datos");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, scope.academia_id, scope.deporte_id, location.pathname, navigate]);

  const grupos = sportMeta.grupos || {};
  const traducciones = sportMeta.traducciones || {};

  const coloresFijos = useMemo(
    () => [
      "#4dc9f6",
      "#f67019",
      "#f53794",
      "#537bc4",
      "#acc236",
      "#166a8f",
      "#00a950",
      "#58595b",
      "#8549ba",
      "#ffa600",
      "#ff6384",
      "#36a2eb",
    ],
    []
  );

  const catMap = useMemo(() => new Map((categorias || []).map((c) => [Number(c.id), c.nombre])), [categorias]);
  const posMap = useMemo(() => new Map((posiciones || []).map((p) => [Number(p.id), p.nombre])), [posiciones]);
  const estMap = useMemo(() => new Map((estados || []).map((e) => [Number(e.id), e.nombre])), [estados]);
  const sucMap = useMemo(() => new Map((sucursales || []).map((s) => [Number(s.id), s.nombre])), [sucursales]);
  const prevMap = useMemo(() => new Map((previsiones || []).map((p) => [Number(p.id), p.nombre])), [previsiones]);

  const conteos = useMemo(() => {
    const activos = Array.isArray(jugadoresActivos) ? jugadoresActivos : [];
    const todos = Array.isArray(jugadoresTodos) ? jugadoresTodos : [];

    const sumBy = (arr, extractor) => {
      const m = new Map();
      arr.forEach((j) => {
        const key = extractor(j) || "—";
        m.set(key, (m.get(key) || 0) + 1);
      });
      return Object.fromEntries(m);
    };

    const getCategoriaNombre = (j) =>
      j?.categoria?.nombre ?? (j?.categoria_id != null ? catMap.get(Number(j.categoria_id)) : undefined);

    const getPosicionNombre = (j) =>
      j?.posicion?.nombre ?? (j?.posicion_id != null ? posMap.get(Number(j.posicion_id)) : undefined);

    const getEstadoNombre = (j) =>
      j?.estado?.nombre ?? (j?.estado_id != null ? estMap.get(Number(j.estado_id)) : undefined);

    const getSucursalNombre = (j) =>
      j?.sucursal?.nombre ?? (j?.sucursal_id != null ? sucMap.get(Number(j.sucursal_id)) : undefined);

    const getPrevisionNombre = (j) =>
      j?.prevision_medica?.nombre ??
      (j?.prevision_medica_id != null ? prevMap.get(Number(j.prevision_medica_id)) : undefined);

    const edades = {};
    activos.forEach((j) => {
      const e = Number(j?.edad);
      const key = Number.isFinite(e) && e >= 0 ? String(e) : "—";
      edades[key] = (edades[key] || 0) + 1;
    });

    return {
      edades,
      categorias: sumBy(activos, getCategoriaNombre),
      posiciones: sumBy(activos, getPosicionNombre),
      sucursales: sumBy(activos, getSucursalNombre),
      previsiones: sumBy(activos, getPrevisionNombre),
      estados: sumBy(todos, getEstadoNombre),
    };
  }, [jugadoresActivos, jugadoresTodos, catMap, posMap, estMap, sucMap, prevMap]);

  /* ✅ NEW: Sumas de métricas por grupo usando getter robusto */
  const sumasPorGrupo = useMemo(() => {
    const statsArr = Array.isArray(estadisticas) ? estadisticas : [];

    const sumGroup = (campos) => {
      const r = {};
      for (const campo of campos) {
        r[campo] = statsArr.reduce((acc, row) => acc + getStatValue(row, campo), 0);
      }
      return r;
    };

    const entries = Object.entries(grupos || {});
    if (!entries.length) return {};

    return Object.fromEntries(entries.map(([nombre, campos]) => [nombre, sumGroup(campos)]));
  }, [estadisticas, grupos]);

  const generatePieData = (conteo) => {
    const labels = Object.keys(conteo || {});
    const data = Object.values(conteo || {});
    const colores = labels.map((_, idx) => coloresFijos[idx % coloresFijos.length]);
    return { labels, datasets: [{ data, backgroundColor: colores }] };
  };

  const crearDatosBar = (datos) => {
    const keys = Object.keys(datos || {});
    return {
      labels: keys.map((k) => traducciones[k] ?? k),
      datasets: [
        {
          label: "Total",
          data: Object.values(datos || {}),
          backgroundColor: coloresFijos.slice(0, keys.length),
        },
      ],
    };
  };

  if (isLoading) return <IsLoading />;

  if (error && !jugadoresActivos.length && !jugadoresTodos.length) {
    return (
      <div className={`${fondoClase} min-h-screen flex items-center justify-center`}>
        <p className="text-red-500 text-xl">{error}</p>
      </div>
    );
  }

  const tarjetasPie = [
    { key: "edades", label: "Edades (Activos)", data: conteos.edades },
    { key: "categorias", label: "Categorías (Activos)", data: conteos.categorias },
    { key: "posiciones", label: "Posiciones (Activos)", data: conteos.posiciones },
    { key: "estados", label: "Estado (Histórico completo)", data: conteos.estados },
    { key: "sucursales", label: "Sucursales (Activos)", data: conteos.sucursales },
    { key: "previsiones", label: "Previsión Médica (Activos)", data: conteos.previsiones },
  ];

  const scopeLabelParts = [];
  if (scope.academia_id) scopeLabelParts.push(`Academia #${scope.academia_id}`);
  if (scope.deporte_id) scopeLabelParts.push(`Deporte: ${sportMeta.nombre}`);
  const scopeLabel = scopeLabelParts.join(" · ");

  return (
    <div className={`${fondoClase} min-h-screen px-2 sm:px-4 pt-4 pb-16 font-weli`}>
      <h1 className="text-2xl font-bold mb-2 text-center">{`Estadísticas Globales — ${sportMeta.nombre}`}</h1>
      <p className="text-center mb-6 text-sm opacity-80">
        {scopeLabel || "Visualización filtrada por tu contexto (academia y deporte)."}
      </p>

      {!!error && (
        <div className="max-w-5xl mx-auto mb-4">
          <div className={`p-4 rounded-lg shadow ${tarjetaClase}`}>
            <p className="text-yellow-400 text-center">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {tarjetasPie.map(({ key, label, data }, idx) => {
          const total = Object.values(data || {}).reduce((a, b) => a + (Number(b) || 0), 0);
          const legendId = `legend-${key}`;

          return (
            <div key={idx} className={`p-4 rounded-lg shadow ${tarjetaClase}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-base sm:text-lg">{label}</h2>
                <span className="text-xs sm:text-sm opacity-80">Total: {total}</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                <div
                  id={legendId}
                  className="w-full sm:w-[200px] shrink-0 max-h-[220px] overflow-y-auto overflow-x-hidden pr-1"
                />

                <div className="relative w-full min-w-0 h-[240px] sm:h-[280px]">
                  <Pie
                    data={generatePieData(data)}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      layout: { padding: 6 },
                      plugins: {
                        legend: { display: false },
                        htmlLegend: { containerID: legendId },
                        pieValueInside: {
                          font: "12px sans-serif",
                          color: darkMode ? "#fff" : "#111",
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(sumasPorGrupo || {}).length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(sumasPorGrupo).map(([grupoNombre, datos], idx) => (
            <div key={idx} className={`p-6 rounded-lg shadow ${tarjetaClase}`}>
              <h2 className="font-semibold mb-4 text-lg text-center">{String(grupoNombre).toUpperCase()}</h2>

              <div className="relative h-[360px] sm:h-[400px]">
                <Bar
                  data={crearDatosBar(datos)}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { labels: { color: darkMode ? "white" : "#1d0b0b" } },
                    },
                    scales: {
                      x: { ticks: { color: darkMode ? "white" : "#1d0b0b" } },
                      y: { ticks: { color: darkMode ? "white" : "#1d0b0b" } },
                    },
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-5xl mx-auto">
          <div className={`p-4 rounded-lg shadow ${tarjetaClase}`}>
            <p className="text-center opacity-80">
              No hay métricas configuradas para <b>{sportMeta.nombre}</b> todavía.
              <br />
              Cuando definamos los campos finales de ese deporte en la tabla correspondiente,
              se activan automáticamente los gráficos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
