// src/pages/admin/detalleJugador.jsx
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "../../context/ThemeContext";
import { FiEdit, FiX } from "react-icons/fi";
import { FileText } from "lucide-react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/* ─────────────────────────────
   Helpers base (estándar dorado)
───────────────────────────── */
const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  return [];
};

const unwrapOne = (raw) => {
  if (!raw) return null;

  if (raw?.item && typeof raw.item === "object") return raw.item;

  const d = raw?.data ?? raw;
  if (d && typeof d === "object") {
    if (d.item && typeof d.item === "object") return d.item;
    if (Array.isArray(d.items) && d.items.length > 0) return d.items[0];
    if (!Array.isArray(d) && Object.keys(d).length > 0 && !("ok" in d) && !("items" in d)) return d;
  }

  if (Array.isArray(raw?.items) && raw.items.length > 0) return raw.items[0];

  if (
    !Array.isArray(raw) &&
    typeof raw === "object" &&
    Object.keys(raw).length > 0 &&
    !("ok" in raw) &&
    !("items" in raw)
  )
    return raw;

  return null;
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

const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const buildFotoDataUrl = (j) => {
  const b64 = j?.foto_base64;
  const mime = j?.foto_mime;
  if (!b64 || !mime) return null;
  return `data:${mime};base64,${b64}`;
};

/* ─────────────────────────────
   Stats helpers (joined base + sport)
───────────────────────────── */
const safeNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const flattenJoinedStats = (payload) => {
  const base = payload?.base && typeof payload.base === "object" ? payload.base : {};
  const sport = payload?.sport && typeof payload.sport === "object" ? payload.sport : {};
  const merged = { ...base, ...sport };

  if (merged?.stats_id == null && merged?.id != null) merged.stats_id = merged.id;

  // intenta normalizar números si vienen como strings
  const out = {};
  for (const [k, v] of Object.entries(merged)) {
    // si es null/undefined, lo dejamos así para que el UI haga ?? 0
    if (v == null) {
      out[k] = v;
      continue;
    }
    // si parsea a número, usamos número, si no, dejamos original
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : v;
  }
  return out;
};

/* ─────────────────────────────
   Auth / Headers (WELI) — dorado
───────────────────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
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

/* =======================
   CONTRATO: base64 -> PDF
======================= */
const b64ToBlob = (b64, mime = "application/pdf") => {
  const raw = String(b64 || "").trim();
  const clean = raw
    .replace(/^data:application\/pdf;base64,/, "")
    .replace(/^data:.*;base64,/, "")
    .replace(/\s+/g, "");

  if (!clean) throw new Error("Base64 vacío");

  const bytes = atob(clean);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const openBlobUrlLikeHistorico = (blobUrl) => {
  const win = window.open(blobUrl, "_blank", "noopener");
  if (!win) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

export default function DetalleJugador() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams(); // fallback legacy
  const { darkMode } = useTheme();

  useMobileAutoScrollTop();

  // ✅ RUT: primero state (ruta nueva), luego params (ruta vieja)
  const rut = useMemo(() => {
    const fromState = location.state?.rut;
    const fromParams = params?.rut;
    const r = fromState ?? fromParams;
    return r != null ? String(r).trim() : "";
  }, [location.state, params]);

  // ✅ Parent path: respeta esquema (no hardcode)
  const parentPath = useMemo(() => {
    if (location.state?.from) return String(location.state.from);
    // corta .../detalle-jugador o .../detalle-jugador/:rut
    return String(location.pathname || "")
      .replace(/\/detalle-jugador\/[^/]+\/?$/, "")
      .replace(/\/detalle-jugador\/?$/, "");
  }, [location.pathname, location.state]);

  const css = {
    fondo: darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]",
    tarjeta: darkMode
      ? "bg-[#1f2937] border border-gray-700 text-white"
      : "bg-white border border-gray-200 text-[#1d0b0b]",
    input: darkMode
      ? "w-full p-1 rounded bg-[#374151] text-white border border-gray-600"
      : "w-full p-1 rounded bg-gray-50 border border-gray-300",
  };

  const [rolActual, setRolActual] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [jugador, setJugador] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [statsId, setStatsId] = useState(null);
  const [fotoDataUrl, setFotoDataUrl] = useState(null);

  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  /* ───────── Guard rail: sin rut no hay detalle ───────── */
  useEffect(() => {
    if (!rut) {
      const backTo = parentPath || "/admin";
      navigate(backTo, { replace: true, state: location.state || {} });
    }
  }, [rut, parentPath, navigate, location.state]);

  /* ───────── Breadcrumb (dorado, sin hardcode) ───────── */
  useEffect(() => {
    const currentPath = location.pathname + location.search;

    const base = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: "Listar Jugadores", to: parentPath || "/admin" }];

    const last = base[base.length - 1];
    if (!last || String(last.label) !== "Detalle Jugador") {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [...base, { label: "Detalle Jugador", to: currentPath }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, parentPath]);

  /* ───────── Auth ───────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);

      if (![1, 2, 3].includes(rol)) {
        navigate("/admin", { replace: true });
        return;
      }

      if (rol === 3) {
        const a = getAcademiaIdFromStorage();
        if (!a) throw new Error("missing-academia-target");
      }

      setRolActual(rol);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* ───────── Carga datos ───────── */
  useEffect(() => {
    if (!rolActual || !rut) return;

    const abort = new AbortController();
    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);
      setErr("");

      try {
        // 1) Jugador
        const rj = await getWithFallback(`/jugadores/rut/${encodeURIComponent(rut)}`, {
          signal: abort.signal,
          headers,
        });
        const j = unwrapOne(rj);

        if (abort.signal.aborted) return;

        if (!j) {
          const backTo = parentPath || "/admin";
          navigate(backTo, { replace: true, state: location.state || {} });
          return;
        }

        setFotoDataUrl(buildFotoDataUrl(j));

        // 2) Stats segmentadas por deporte (joined base + sport)
        let est = {};
        let estId = null;

        try {
          const jugadorId = Number(j?.id ?? j?.jugador_id ?? j?.id_jugador ?? 0) || null;
          const deporteId = Number(j?.deporte_id ?? j?.id_deporte ?? 0) || null;

          if (jugadorId) {
            const candidates = [
              `/estadisticas/by-jugador/${encodeURIComponent(String(jugadorId))}`,
              deporteId
                ? `/estadisticas/by-jugador/${encodeURIComponent(String(jugadorId))}?deporte_id=${encodeURIComponent(
                  String(deporteId)
                )}`
                : null,
              // fallback legacy opcional (si existiera)
              `/estadisticas/jugador/${encodeURIComponent(String(jugadorId))}`,
            ].filter(Boolean);

            let joined = null;

            for (const url of candidates) {
              try {
                const r = await getWithFallback(url, { signal: abort.signal, headers });
                const d = r?.data ?? r;

                const item =
                  d?.item && typeof d.item === "object"
                    ? d.item
                    : d?.data?.item && typeof d.data.item === "object"
                      ? d.data.item
                      : d;

                joined = item;
                break;
              } catch (e) {
                const st = e?.status ?? e?.response?.status ?? 0;
                if (st === 401 || st === 403) throw e;
                continue;
              }
            }

            if (joined) {
              const flat = flattenJoinedStats(joined);

              estId = flat?.stats_id ?? flat?.id ?? null;

              // compat: si backend manda partidos_jugador
              if ("partidos_jugador" in flat && !("partidos_jugados" in flat)) {
                flat.partidos_jugados = safeNum(flat.partidos_jugador, 0);
              }

              est = flat;
            } else {
              est = {};
            }
          } else {
            est = {};
          }
        } catch {
          est = {};
        }

        // 3) Catálogos (rutas mínimas + fallback)
        const [posList, catList, estbList, prevList, estList, sucList, comList] = await Promise.all([
          tryGetList(["/posiciones"], { signal: abort.signal, headers }),
          tryGetList(["/categorias"], { signal: abort.signal, headers }),
          tryGetList(["/establecimientos-educ"], { signal: abort.signal, headers }),
          tryGetList(["/prevision-medica"], { signal: abort.signal, headers }),
          tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
          tryGetList(["/sucursales-real"], { signal: abort.signal, headers }),
          tryGetList(["/comunas", "/catalogos/comunas", "/catalogos/comuna"], { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        const _posiciones = normalizeCatalog(posList);
        const _categorias = normalizeCatalog(catList);
        const _establecimientos = normalizeCatalog(estbList);
        const _previsiones = normalizeCatalog(prevList);
        const _estados = normalizeCatalog(estList);
        const _sucursales = normalizeCatalog(sucList);
        const _comunas = normalizeCatalog(comList);

        setPosiciones(_posiciones);
        setCategorias(_categorias);
        setEstablecimientos(_establecimientos);
        setPrevisiones(_previsiones);
        setEstados(_estados);
        setSucursales(_sucursales);
        setComunas(_comunas);

        const posMap = new Map(_posiciones.map((p) => [Number(p.id), p.nombre]));
        const catMap = new Map(_categorias.map((c) => [Number(c.id), c.nombre]));
        const estbMap = new Map(_establecimientos.map((e) => [Number(e.id), e.nombre]));
        const prevMap = new Map(_previsiones.map((p) => [Number(p.id), p.nombre]));
        const estMap = new Map(_estados.map((e) => [Number(e.id), e.nombre]));
        const sucMap = new Map(_sucursales.map((s) => [Number(s.id), s.nombre]));
        const comMap = new Map(_comunas.map((c) => [Number(c.id), c.nombre]));

        const jugadorEnriquecido = {
          ...j,
          posicion: j.posicion ?? (posMap.has(Number(j.posicion_id)) ? { nombre: posMap.get(Number(j.posicion_id)) } : null),
          categoria: j.categoria ?? (catMap.has(Number(j.categoria_id)) ? { nombre: catMap.get(Number(j.categoria_id)) } : null),
          establec_educ:
            j.establec_educ ?? (estbMap.has(Number(j.establec_educ_id)) ? { nombre: estbMap.get(Number(j.establec_educ_id)) } : null),
          prevision_medica:
            j.prevision_medica ?? (prevMap.has(Number(j.prevision_medica_id)) ? { nombre: prevMap.get(Number(j.prevision_medica_id)) } : null),
          estado: j.estado ?? (estMap.has(Number(j.estado_id)) ? { nombre: estMap.get(Number(j.estado_id)) } : null),
          sucursal: j.sucursal ?? (sucMap.has(Number(j.sucursal_id)) ? { nombre: sucMap.get(Number(j.sucursal_id)) } : null),
          comuna: j.comuna ?? (comMap.has(Number(j.comuna_id)) ? { nombre: comMap.get(Number(j.comuna_id)) } : null),
        };

        setJugador(jugadorEnriquecido);
        setEstadisticas(est);
        setStatsId(estId);

        // fecha -> yyyy-mm-dd
        const iso = j?.fecha_nacimiento;
        let ymd = "";
        if (iso) {
          const d = new Date(iso);
          if (!Number.isNaN(d.getTime())) {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            const da = String(d.getUTCDate()).padStart(2, "0");
            ymd = `${y}-${m}-${da}`;
          } else if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
            ymd = iso.slice(0, 10);
          }
        }

        setFormData({
          ...j,
          fecha_nacimiento: ymd || "",
          estado_id: j?.estado_id ?? null,
          sucursal_id: j?.sucursal_id ?? null,
          estadistica_id: estId ?? j?.estadistica_id ?? null,
          comuna_id: j?.comuna_id ?? null,
          direccion: j?.direccion ?? "",
        });
      } catch (error) {
        if (abort.signal.aborted) return;

        const st = error?.status ?? error?.response?.status;

        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        const backTo = parentPath || "/admin";
        navigate(backTo, { replace: true, state: location.state || {} });
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [rut, rolActual, navigate, parentPath, location.state]);

  /* ───────── Helpers UI ───────── */
  const labelNombre = useCallback(
    (arr, id) => arr.find((i) => Number(i.id) === Number(id))?.nombre || "-",
    []
  );

  const formatearFechaLocal = (fecha) => {
    if (!fecha) return "-";
    if (/^\d{4}-\d{2}-\d{2}/.test(String(fecha))) {
      const [y, m, d] = String(fecha).slice(0, 10).split("-");
      return `${d}-${m}-${y}`;
    }
    const d = new Date(fecha);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${da}-${m}-${y}`;
    }
    return String(fecha);
  };

  const secciones = useMemo(() => {
    if (!estadisticas) return {};
    return {
      Ofensivas: {
        Goles: estadisticas.goles ?? 0,
        Asistencias: estadisticas.asistencias ?? 0,
        "Tiros Libres": estadisticas.tiros_libres ?? 0,
        Penales: estadisticas.penales ?? 0,
        "Tiros al Arco": estadisticas.tiros_arco ?? 0,
        "Tiros Fuera": estadisticas.tiros_fuera ?? 0,
        "Tiros Bloqueados": estadisticas.tiros_bloqueados ?? 0,
        "Regates Exitosos": estadisticas.regates_exitosos ?? 0,
        "Centros Acertados": estadisticas.centros_acertados ?? 0,
        "Pases Clave": estadisticas.pases_clave ?? 0,
      },
      Defensivas: {
        Intercepciones: estadisticas.intercepciones ?? 0,
        Despejes: estadisticas.despejes ?? 0,
        "Duelos Ganados": estadisticas.duelos_ganados ?? 0,
        "Entradas Exitosas": estadisticas.entradas_exitosas ?? 0,
        Bloqueos: estadisticas.bloqueos ?? 0,
        Recuperaciones: estadisticas.recuperaciones ?? 0,
      },
      Técnicas: {
        "Pases Completados": estadisticas.pases_completados ?? 0,
        "Pases Errados": estadisticas.pases_errados ?? 0,
        "Posesión Perdida": estadisticas.posesion_perdida ?? 0,
        Offsides: estadisticas.offsides ?? 0,
        "Faltas Cometidas": estadisticas.faltas_cometidas ?? 0,
        "Faltas Recibidas": estadisticas.faltas_recibidas ?? 0,
      },
      Físicas: {
        "Distancia Recorrida (km)": estadisticas.distancia_recorrida_km ?? 0,
        Sprints: estadisticas.sprints ?? 0,
        "Duelos Aéreos Ganados": estadisticas.duelos_aereos_ganados ?? 0,
        "Minutos Jugados": estadisticas.minutos_jugados ?? 0,
        "Partidos Jugados": estadisticas.partidos_jugados ?? 0,
      },
      Médicas: {
        Lesiones: estadisticas.lesiones ?? 0,
        "Días de Baja": estadisticas.dias_baja ?? 0,
      },
      Disciplina: {
        "Tarjetas Amarillas": estadisticas.tarjetas_amarillas ?? 0,
        "Tarjetas Rojas": estadisticas.tarjetas_rojas ?? 0,
        "Sanciones Federativas": estadisticas.sanciones_federativas ?? 0,
        "Torneos Convocados": estadisticas.torneos_convocados ?? 0,
        "Titular en Partidos": estadisticas.titular_partidos ?? 0,
      },
    };
  }, [estadisticas]);

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const guardarCambios = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setIsLoading(true);

    try {
      const headers = buildHeaders(rolActual);

      const ALLOWED = new Set([
        "nombre_jugador",
        "edad",
        "email",
        "telefono",
        "peso",
        "estatura",
        "talla_polera",
        "talla_short",
        "nombre_apoderado",
        "telefono_apoderado",
        "fecha_nacimiento",
        "posicion_id",
        "categoria_id",
        "establec_educ_id",
        "prevision_medica_id",
        "estado_id",
        "sucursal_id",
        "comuna_id",
        "direccion",
      ]);

      const raw = { ...formData };
      const numeric = (v) => (v === "" || v == null ? null : Number(v));
      const payload = {};

      for (const [k, v] of Object.entries(raw)) {
        if (!ALLOWED.has(k)) continue;

        if (
          [
            "edad",
            "peso",
            "estatura",
            "posicion_id",
            "categoria_id",
            "establec_educ_id",
            "prevision_medica_id",
            "estado_id",
            "sucursal_id",
            "comuna_id",
          ].includes(k)
        ) {
          payload[k] = numeric(v);
        } else if (k === "fecha_nacimiento") {
          payload[k] = v || null;
        } else {
          payload[k] = v ?? null;
        }
      }

      await api.patch(`/jugadores/rut/${encodeURIComponent(rut)}`, payload, { headers });

      setJugador((prev) => ({
        ...(prev || {}),
        ...payload,
        posicion: posiciones.find((p) => Number(p.id) === Number(payload.posicion_id)) || prev?.posicion || null,
        categoria: categorias.find((c) => Number(c.id) === Number(payload.categoria_id)) || prev?.categoria || null,
        establec_educ:
          establecimientos.find((e) => Number(e.id) === Number(payload.establec_educ_id)) || prev?.establec_educ || null,
        prevision_medica:
          previsiones.find((p) => Number(p.id) === Number(payload.prevision_medica_id)) || prev?.prevision_medica || null,
        estado: estados.find((e) => Number(e.id) === Number(payload.estado_id)) || prev?.estado || null,
        sucursal: sucursales.find((s) => Number(s.id) === Number(payload.sucursal_id)) || prev?.sucursal || null,
        comuna: comunas.find((c) => Number(c.id) === Number(payload.comuna_id)) || prev?.comuna || null,
      }));

      setEditMode(false);
      setMsg("✅ Datos actualizados");
      setTimeout(() => setMsg(""), 3000);
    } catch (error) {
      const st = error?.status ?? error?.response?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
      } else {
        setErr(
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          "❌ Error al actualizar"
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onContratoClick = async () => {
    setErr("");
    try {
      const headers = buildHeaders(rolActual);

      let b64 = jugador?.contrato_prestacion;
      let mime = jugador?.contrato_prestacion_mime || "application/pdf";

      if (!b64 || String(b64).trim().length < 50) {
        const r = await getWithFallback(`/jugadores/rut/${encodeURIComponent(rut)}`, { headers });
        const j = unwrapOne(r);
        b64 = j?.contrato_prestacion;
        mime = j?.contrato_prestacion_mime || "application/pdf";

        if (!b64 || String(b64).trim().length < 50) {
          setErr("Este jugador no tiene contrato almacenado.");
          return;
        }

        setJugador((prev) => ({ ...(prev || {}), contrato_prestacion: b64, contrato_prestacion_mime: mime }));
      }

      const mimeLower = String(mime || "").toLowerCase();
      if (!mimeLower.includes("application/pdf")) {
        setErr("El contrato almacenado no está en formato PDF.");
        return;
      }

      const blob = b64ToBlob(b64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openBlobUrlLikeHistorico(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      setErr(e?.response?.data?.message || e?.message || "No se pudo abrir el contrato.");
    }
  };

  if (isLoading || !jugador) return <IsLoading />;

  return (
    <div className={`${css.fondo} min-h-[calc(100vh-100px)] relative`}>
      <div className="px-2 sm:px-4 pt-4 pb-16 font-weli">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="w-40 h-40 mx-auto rounded-full overflow-hidden bg-gray-300 flex items-center justify-center text-6xl dark:bg-gray-700 border border-black/10 dark:border-white/10">
            {fotoDataUrl ? (
              <img
                src={fotoDataUrl}
                alt={`Foto de ${jugador.nombre_jugador}`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setFotoDataUrl(null)}
              />
            ) : (
              <span aria-hidden>👤</span>
            )}
          </div>

          <h1 className="text-3xl font-extrabold mt-4">{jugador.nombre_jugador}</h1>
          <p className="text-sm text-gray-500">
            {jugador.posicion?.nombre || "-"} | {jugador.edad ?? "-"} años
          </p>
          <p className="text-sm text-gray-500">{jugador.categoria?.nombre || "-"}</p>
        </div>

        {/* Tarjeta Datos */}
        <div className={`relative p-4 rounded-lg shadow ${css.tarjeta} w-full`}>
          {rolActual === 1 || rolActual === 3 && (
            <button
              onClick={() => {
                setEditMode(true);
                setErr("");
              }}
              className="absolute top-2 right-3 text-xl hover:text-[#e82d89]"
              title="Editar"
              aria-label="Editar"
            >
              <FiEdit />
            </button>
          )}


          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              ["Email", "email"],
              ["Teléfono", "telefono"],
              ["Peso (kg)", "peso"],
              ["Estatura (cm)", "estatura"],
              ["Fecha Nacimiento", "fecha_nacimiento"],
              ["Talla Polera", "talla_polera"],
              ["Talla Short", "talla_short"],
              ["Nombre Apoderado", "nombre_apoderado"],
              ["Teléfono Apoderado", "telefono_apoderado"],
              ["Posición", "posicion_id"],
              ["Categoría", "categoria_id"],
              ["Establecimiento", "establec_educ_id"],
              ["Previsión Médica", "prevision_medica_id"],
              ["Estado", "estado_id"],
              ["Sucursal", "sucursal_id"],
              ["Comuna", "comuna_id"],
              ["Dirección", "direccion"],
              ["Contrato firmado", "contrato_firmado"],
              ["Estadística ID", "estadistica_id"],
            ].map(([label, key]) => (
              <div key={key}>
                <span className="font-semibold text-sm">{label}:</span>

                {key === "contrato_firmado" ? (
                  <span className="block text-sm mt-1">
                    <button
                      type="button"
                      onClick={onContratoClick}
                      className="inline-flex items-center gap-2 hover:opacity-80"
                      title="Ver contrato (PDF)"
                      aria-label="Ver contrato"
                    >
                      <FileText size={18} color={darkMode ? "#ffffff" : "#D32F2F"} />
                      <span className="opacity-80">Ver contrato</span>
                    </button>
                  </span>
                ) : (
                  <span className="block text-sm">
                    {key === "posicion_id"
                      ? jugador.posicion?.nombre || labelNombre(posiciones, jugador.posicion_id)
                      : key === "categoria_id"
                        ? jugador.categoria?.nombre || labelNombre(categorias, jugador.categoria_id)
                        : key === "establec_educ_id"
                          ? jugador.establec_educ?.nombre || labelNombre(establecimientos, jugador.establec_educ_id)
                          : key === "prevision_medica_id"
                            ? jugador.prevision_medica?.nombre || labelNombre(previsiones, jugador.prevision_medica_id)
                            : key === "estado_id"
                              ? jugador.estado?.nombre || labelNombre(estados, jugador.estado_id)
                              : key === "sucursal_id"
                                ? jugador.sucursal?.nombre || labelNombre(sucursales, jugador.sucursal_id)
                                : key === "comuna_id"
                                  ? jugador.comuna?.nombre || labelNombre(comunas, jugador.comuna_id)
                                  : key === "fecha_nacimiento"
                                    ? formatearFechaLocal(jugador.fecha_nacimiento)
                                    : key === "estadistica_id"
                                      ? statsId ?? jugador.estadistica_id ?? "-"
                                      : jugador[key] ?? "-"}
                  </span>
                )}
              </div>
            ))}
          </div>

          {err && <p className="text-red-500 text-sm mt-3">{err}</p>}
        </div>

        {/* Gráficas */}
        <section className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold mb-4">Estadísticas del Jugador</h2>
          {Object.entries(secciones).map(([titulo, data]) => (
            <div key={titulo} className={`p-4 rounded shadow ${css.tarjeta}`}>
              <h3 className="text-lg font-semibold mb-4">{titulo}</h3>
              <div className="relative h-[300px] w-full">
                <Bar
                  data={{
                    labels: Object.keys(data),
                    datasets: [
                      {
                        label: titulo,
                        data: Object.values(data),
                        backgroundColor: darkMode ? "#3b82f6" : "#e82d89",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Overlay Edición */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 p-4 overflow-auto">
          <form
            onSubmit={guardarCambios}
            className={`w-full max-w-2xl ${css.tarjeta} border-2 border-[#e82d89] shadow-2xl rounded-xl p-6 space-y-6 overflow-y-auto max-h-[90vh]`}
          >
            <div className="flex justify-between items-center mb-6 border-b border-gray-300 pb-2">
              <h3 className="text-xl font-bold text-[#e82d89] text-center w-full">
                Editar Información del Jugador
              </h3>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="absolute top-6 right-6 text-xl hover:text-red-500"
                title="Cerrar"
                aria-label="Cerrar"
              >
                <FiX />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Nombre", "nombre_jugador", "text"],
                ["Edad", "edad", "number"],
                ["Email", "email", "email"],
                ["Teléfono", "telefono", "text"],
                ["Peso (kg)", "peso", "number"],
                ["Estatura (cm)", "estatura", "number"],
                ["Talla Polera", "talla_polera", "text"],
                ["Talla Short", "talla_short", "text"],
                ["Nombre Apoderado", "nombre_apoderado", "text"],
                ["Teléfono Apoderado", "telefono_apoderado", "text"],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold mb-1">{label}</label>
                  <input
                    type={type}
                    name={key}
                    value={formData[key] ?? ""}
                    onChange={handleChange}
                    className={css.input}
                  />
                </div>
              ))}

              <div>
                <label className="block text-sm font-semibold mb-1">Fecha Nacimiento</label>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  value={formData.fecha_nacimiento || ""}
                  onChange={handleChange}
                  className={css.input}
                />
              </div>

              {[
                ["Posición", "posicion_id", posiciones],
                ["Categoría", "categoria_id", categorias],
                ["Establecimiento", "establec_educ_id", establecimientos],
                ["Previsión Médica", "prevision_medica_id", previsiones],
                ["Estado", "estado_id", estados],
                ["Sucursal", "sucursal_id", sucursales],
                ["Comuna", "comuna_id", comunas],
              ].map(([label, key, arr]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold mb-1">{label}</label>
                  <select
                    name={key}
                    value={formData[key] || ""}
                    onChange={handleChange}
                    className={css.input}
                  >
                    <option value="">Seleccione</option>
                    {arr.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div>
                <label className="block text-sm font-semibold mb-1">Dirección</label>
                <input
                  type="text"
                  name="direccion"
                  value={formData.direccion ?? ""}
                  onChange={handleChange}
                  className={css.input}
                  placeholder="Ej: Av. Siempre Viva 742"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Estadística ID</label>
                <input
                  type="text"
                  name="estadistica_id"
                  value={formData.estadistica_id ?? ""}
                  disabled
                  className={`${css.input} opacity-70 cursor-not-allowed`}
                />
                <p className="text-xs text-gray-500 mt-1">Campo informativo (no editable)</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-1">Contrato firmado</label>
                <div
                  className={`${darkMode ? "bg-[#111827]" : "bg-gray-50"
                    } border border-gray-300/30 rounded p-2 flex items-center gap-2`}
                >
                  <FileText size={18} color={darkMode ? "#ffffff" : "#D32F2F"} />
                  <span className="text-sm opacity-80">Disponible en la tarjeta (Ver contrato)</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Se abre en una nueva pestaña como PDF (estilo histórico).
                </p>
              </div>
            </div>

            {err && <p className="text-red-500 text-sm">{err}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="py-1 px-4 border border-gray-500 rounded hover:bg-gray-200 dark:hover:bg-[#111827]"
              >
                Cancelar
              </button>
              <button type="submit" className="py-1 px-4 bg-blue-600 text-white rounded hover:bg-blue-700">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {msg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-40">
          {msg}
        </div>
      )}
    </div>
  );
}
