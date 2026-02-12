// src/pages/admin/formjugador.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

// ✅ Forma B (frontend genera contrato PDF)
import { CONTRATO_TEMPLATE } from "../../services/contratoTemplate";
import { fillContratoTemplate } from "../../services/contratoFill";
import { buildContratoPdfBlob } from "../../services/contratoPdf";
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

/* ───────── Helpers robustos ───────── */
const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.roles)) return d.roles;
  if (Array.isArray(d?.data)) return d.data;
  return [];
};

const trimStrings = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === "string" ? v.trim() : v;
  return out;
};

// '' → undefined (para no mandar claves innecesarias)
const emptyToUndef = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === "" ? undefined : v;
  return out;
};

// ✅ fecha larga en español (sin librerías)
const fechaEsLarga = (d = new Date()) => {
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = meses[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd} de ${mm} de ${yyyy}`;
};

// ✅ blob -> base64 (SIN data:...)
const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el PDF"));
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf("base64,");
      if (idx !== -1) return resolve(res.slice(idx + "base64,".length));
      resolve(res);
    };
    reader.readAsDataURL(blob);
  });

/* ───────── Modal simple (ESTILO SuperDashboard) ───────── */
function Modal({ open, title, children, onClose, darkMode }) {
  if (!open) return null;

  const card =
    "relative w-full max-w-md rounded-2xl border backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.25)] p-5 " +
    (darkMode ? "bg-white/10 border-white/15 text-white" : "bg-white/60 border-ra-marron/15 text-ra-marron");

  const titleColor = darkMode ? "text-white" : "text-ra-marron";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={card}>
        <h3 className={`text-lg font-extrabold mb-2 ${titleColor}`}>{title}</h3>
        <div className={darkMode ? "text-sm mb-4 text-white/85" : "text-sm mb-4 text-ra-marron/80"}>
          {children}
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-xl font-bold border border-white/15 hover:opacity-90 active:scale-[0.99] transition"
            style={{
              background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
              color: "white",
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Academia helpers (soporta "1" o JSON) ───────── */
const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    // Caso string/número: "1"
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    // Caso JSON: {"id":1}
    const parsed = JSON.parse(raw);
    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const n = Number(rawRol);
  return Number.isFinite(n) ? n : 0;
};

const extractAcademiaFromToken = (decoded) => {
  const raw =
    decoded?.academia_id ??
    decoded?.academy_id ??
    decoded?.academiaId ??
    decoded?.academyId ??
    decoded?.academia ??
    decoded?.academy ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

/**
 * ✅ Headers multi-academia (alineado backend nuevo):
 * - Authorization siempre
 * - x-academia-id SOLO para rol 3 y solo si existe en storage
 */
const buildHeaders = (rolActual) => {
  const token = getToken();
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rolActual === 3) {
    const a = getAcademiaIdFromStorage();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

// intenta varias rutas y variantes con / y sin / + headers
const tryGetList = async (paths, { signal, headers }) => {
  const variants = [];
  for (const p of paths) {
    variants.push(p);
    variants.push(p.endsWith("/") ? p.slice(0, -1) : `${p}/`);
  }
  const uniq = [...new Set(variants)];

  for (const url of uniq) {
    try {
      const r = await api.get(url, { signal, headers });
      return asList(r);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return [];
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  return [];
};

// POST robusto con headers + fallback slash
const postWithFallback = async (path, body, headers) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.post(url, body, { headers });
    } catch (e) {
      lastErr = e;
      const st = e?.status ?? e?.response?.status;
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("POST failed");
};

export default function FormJugador() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);

  // ✅ academia objetivo actual (solo importa para rol 3)
  const [academiaTarget, setAcademiaTarget] = useState(() => getAcademiaIdFromStorage());

  // 🔸 Estado del formulario
  const [formData, setFormData] = useState({
    nombre_jugador: "",
    rut_jugador: "",
    fecha_nacimiento: "",
    edad: "",
    telefono: "",
    email: "",
    direccion: "",
    comuna_id: "",
    posicion_id: "",
    categoria_id: "",
    estado_id: "",
    talla_polera: "",
    talla_short: "",
    establec_educ_id: "",
    prevision_medica_id: "",
    nombre_apoderado: "",
    rut_apoderado: "",
    telefono_apoderado: "",
    peso: "",
    estatura: "",
    observaciones: "",
    sucursal_id: "",
  });

  // 🔸 Listas para selects
  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true); // carga catálogos
  const [isSubmitting, setIsSubmitting] = useState(false); // contrato + post

  // ✅ Modal creado
  const [createdOpen, setCreatedOpen] = useState(false);
  const [createdInfo, setCreatedInfo] = useState({
    nombre: "",
    id: null,
    apoderadoCredencial: false,
  });

  /* ───────── Validación de token (1/2/3) ───────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);
      if (![1, 2, 3].includes(rol)) throw new Error("no-role");

      const tokenAcademia = extractAcademiaFromToken(decoded);
      const storedAcademia = getAcademiaIdFromStorage();

      // ✅ rol 1/2: NO usamos x-academia-id; si hay basura guardada distinta, la limpiamos
      if ((rol === 1 || rol === 2) && storedAcademia && tokenAcademia && storedAcademia !== tokenAcademia) {
        try {
          localStorage.removeItem(ACADEMIA_STORAGE_KEY);
        } catch {}
      }

      // ✅ rol 3: requiere academia target (storage) porque backend exige x-academia-id
      const a = getAcademiaIdFromStorage();
      if (rol === 3 && !a) {
        setRolActual(rol);
        setAcademiaTarget(null);
        setError("⚠️ Superadmin: selecciona una academia para cargar catálogos (x-academia-id).");
        setIsLoading(false);
        return;
      }

      setRolActual(rol);
      setAcademiaTarget(a);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* ───────── Detecta cambios de academia objetivo (storage) ───────── */
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

  /* ───────── Cargar catálogos (por academia) ───────── */
  useEffect(() => {
    if (![1, 2, 3].includes(rolActual)) return;

    // ✅ superadmin sin academia target = no cargamos (backend exige header)
    if (rolActual === 3 && !academiaTarget) return;

    const abort = new AbortController();
    let alive = true;

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const headers = buildHeaders(rolActual);

        const [_pos, _cat, _estados, _edu, _prev, _suc, _com] = await Promise.all([
          tryGetList(["/posiciones", "/posicion"], { signal: abort.signal, headers }),
          tryGetList(["/categorias", "/categoria"], { signal: abort.signal, headers }),
          tryGetList(["/estado", "/estados"], { signal: abort.signal, headers }),
          tryGetList(["/establecimientos-educ"], { signal: abort.signal, headers }),
          tryGetList(["/prevision-medica"], { signal: abort.signal, headers }),
          tryGetList(["/sucursales-real", "/sucursales"], { signal: abort.signal, headers }),
          tryGetList(["/comunas"], { signal: abort.signal, headers }),
        ]);

        if (!alive) return;

        const norm = (arr, idKeys = ["id"], nameKeys = ["nombre", "descripcion"]) =>
          (Array.isArray(arr) ? arr : [])
            .map((x) => {
              const idKey = idKeys.find((k) => x?.[k] != null);
              const nameKey = nameKeys.find((k) => typeof x?.[k] === "string");
              const id = x?.[idKey];
              const nombre = x?.[nameKey];
              return { id: Number(id), nombre: String(nombre ?? "").trim() || String(id ?? "").trim() };
            })
            .filter((e) => Number.isFinite(e.id) && e.id > 0);

        const posN = norm(_pos, ["id", "posicion_id"]);
        const catN = norm(_cat, ["id", "categoria_id"]);
        const estN = norm(_estados, ["id", "estado_id"]);
        const eduN = norm(_edu, ["id", "establec_educ_id"]);
        const prevN = norm(_prev, ["id", "prevision_medica_id"]);
        const sucN = norm(_suc, ["id"]);
        const comN = norm(_com, ["id"]);

        setPosiciones(posN);
        setCategorias(catN);
        setEstados(estN);
        setEstablecimientos(eduN);
        setPrevisiones(prevN);
        setSucursales(sucN);
        setComunas(comN);

        const allEmpty = [posN, catN, estN, eduN, prevN, sucN, comN].every((arr) => arr.length === 0);
        if (allEmpty) setError("❌ No se pudieron cargar los datos de selección para esta academia.");

        // ✅ Invalida selects si ya no existen (por cambio de academia o data)
        setFormData((prev) => {
          const exists = (arr, id) => arr.some((x) => String(x.id) === String(id));
          const next = { ...prev };

          if (prev.posicion_id && !exists(posN, prev.posicion_id)) next.posicion_id = "";
          if (prev.categoria_id && !exists(catN, prev.categoria_id)) next.categoria_id = "";
          if (prev.estado_id && !exists(estN, prev.estado_id)) next.estado_id = "";
          if (prev.establec_educ_id && !exists(eduN, prev.establec_educ_id)) next.establec_educ_id = "";
          if (prev.prevision_medica_id && !exists(prevN, prev.prevision_medica_id)) next.prevision_medica_id = "";
          if (prev.sucursal_id && !exists(sucN, prev.sucursal_id)) next.sucursal_id = "";
          if (prev.comuna_id && !exists(comN, prev.comuna_id)) next.comuna_id = "";

          return next;
        });
      } catch (err) {
        const st = err?.status ?? err?.response?.status;

        if (st === 401 || st === 403) {
          if (rolActual === 3) {
            setError("⚠️ Superadmin: falta x-academia-id o no tienes academia seleccionada.");
            setIsLoading(false);
            return;
          }
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (!abort.signal.aborted) setError("❌ No se pudieron cargar los datos de selección.");
      } finally {
        if (alive && !abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
      abort.abort();
    };
  }, [navigate, rolActual, academiaTarget]);

  /* ───────── Autoselección si hay una sola opción ───────── */
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      posicion_id: !prev.posicion_id && posiciones.length === 1 ? String(posiciones[0].id) : prev.posicion_id,
      categoria_id: !prev.categoria_id && categorias.length === 1 ? String(categorias[0].id) : prev.categoria_id,
      estado_id: !prev.estado_id && estados.length === 1 ? String(estados[0].id) : prev.estado_id,
      establec_educ_id:
        !prev.establec_educ_id && establecimientos.length === 1 ? String(establecimientos[0].id) : prev.establec_educ_id,
      prevision_medica_id:
        !prev.prevision_medica_id && previsiones.length === 1 ? String(previsiones[0].id) : prev.prevision_medica_id,
      sucursal_id: !prev.sucursal_id && sucursales.length === 1 ? String(sucursales[0].id) : prev.sucursal_id,
      comuna_id: !prev.comuna_id && comunas.length === 1 ? String(comunas[0].id) : prev.comuna_id,
    }));
  }, [posiciones, categorias, estados, establecimientos, previsiones, sucursales, comunas]);

  /* ───────── Helpers ───────── */
  const calcEdad = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return "";
    const hoy = new Date();
    const nac = new Date(yyyy_mm_dd);
    if (Number.isNaN(nac.getTime())) return "";
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return String(Math.max(0, edad));
  };

  /* ───────── Manejador de cambios ───────── */
  const handleChange = ({ target: { name, value } }) => {
    const onlyInt = (v) => (/^\d*$/.test(v) ? v : formData[name]);
    const onlyPhone = (v) => (/^\+?\d*$/.test(v) ? v : formData[name]);
    const onlyNum = (v) => (/^\d*([.]\d{0,2})?$/.test(v) ? v : formData[name]);

    if (name === "rut_jugador" || name === "rut_apoderado") value = onlyInt(value).slice(0, 8);
    if (name === "edad") value = onlyInt(value).slice(0, 3);
    if (name === "telefono" || name === "telefono_apoderado") value = onlyPhone(value).slice(0, 15);
    if (name === "peso") value = onlyNum(value).slice(0, 6);
    if (name === "estatura") value = onlyInt(value).slice(0, 3);

    if (name === "fecha_nacimiento") {
      const edadAuto = calcEdad(value);
      setFormData((prev) => ({ ...prev, [name]: value, edad: edadAuto }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /* ───────── Generar contrato (PDF->base64) ───────── */
  const generarContratoBase64 = useCallback(async () => {
    const required = ["nombre_apoderado", "rut_apoderado", "nombre_jugador", "rut_jugador"];
    for (const k of required) {
      if (!String(formData[k] ?? "").trim()) {
        throw new Error("Faltan campos obligatorios para generar el contrato.");
      }
    }

    const rutApoDigits = String(formData.rut_apoderado).replace(/\D/g, "");
    const rutJugDigits = String(formData.rut_jugador).replace(/\D/g, "");

    if (!/^\d{7,8}$/.test(rutApoDigits))
      throw new Error("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
    if (!/^\d{7,8}$/.test(rutJugDigits))
      throw new Error("El RUT del jugador debe ser de 7 u 8 dígitos (sin DV).");

    const comunaNombre = comunas.find((c) => String(c.id) === String(formData.comuna_id))?.nombre || "";

    const data = {
      fecha_contrato: fechaEsLarga(new Date()),
      nombre_apoderado: String(formData.nombre_apoderado).trim(),
      rut_apoderado: formatRutWithDV(rutApoDigits),
      nombre_jugador: String(formData.nombre_jugador).trim(),
      rut_jugador: formatRutWithDV(rutJugDigits),
      fecha_nacimiento: formData.fecha_nacimiento ? String(formData.fecha_nacimiento) : "",
      dirección: formData.direccion ? String(formData.direccion).trim() : "",
      comuna_id: comunaNombre || "",
    };

    const textoFinal = fillContratoTemplate(CONTRATO_TEMPLATE, data);

    const blob = await buildContratoPdfBlob({
      titulo: "CONTRATO DE PRESTACIÓN DE SERVICIOS",
      subtitulo: `${data.nombre_jugador} • ${data.rut_jugador}`,
      texto: textoFinal,
    });

    const base64 = await blobToBase64(blob);
    if (!base64 || base64.length < 50) throw new Error("El contrato se generó vacío o inválido.");
    return base64;
  }, [formData, comunas]);

  /* ───────── Enviar jugador (Guardar único) ───────── */
  const enviarJugador = async (e) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    const edadNum = Number(formData.edad || "0");
    if (formData.edad && (edadNum < 5 || edadNum > 100)) {
      return setError("La edad debe estar entre 5 y 100 años si la indicas.");
    }

    if (formData.telefono) {
      const okTel = /^\+\d{9,15}$/.test(formData.telefono) || /^\d{9,11}$/.test(formData.telefono);
      if (!okTel) return setError("Teléfono inválido: usa +569... o 9–11 dígitos.");
    }

    const rutApoDigits = String(formData.rut_apoderado || "").replace(/\D/g, "");
    const hasRutApo = rutApoDigits.length > 0;

    if (hasRutApo && !/^\d{7,8}$/.test(rutApoDigits)) {
      return setError("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
    }

    if (hasRutApo && !String(formData.nombre_apoderado || "").trim()) {
      return setError("Si ingresas RUT de apoderado, debes ingresar también el nombre del apoderado.");
    }

    if ([formData.posicion_id, formData.categoria_id, formData.estado_id].some((v) => !v)) {
      return setError("Debes seleccionar posición, categoría y estado.");
    }

    // ✅ rol 3 exige academia target
    if (rolActual === 3 && !getAcademiaIdFromStorage()) {
      return setError("⚠️ Superadmin: selecciona una academia antes de guardar (x-academia-id).");
    }

    try {
      setIsSubmitting(true);

      // 1) Generar contrato
      const contratoBase64 = await generarContratoBase64();

      // 2) Payload
      const cleaned = trimStrings(formData);
      const comunaId = cleaned.comuna_id ? Number(cleaned.comuna_id) : undefined;

      const payload = emptyToUndef({
        ...cleaned,
        rut_jugador: cleaned.rut_jugador ? Number(cleaned.rut_jugador) : undefined,
        rut_apoderado: cleaned.rut_apoderado ? Number(cleaned.rut_apoderado) : undefined,
        edad: cleaned.edad ? edadNum : undefined,
        posicion_id: cleaned.posicion_id ? Number(cleaned.posicion_id) : undefined,
        categoria_id: cleaned.categoria_id ? Number(cleaned.categoria_id) : undefined,
        estado_id: cleaned.estado_id ? Number(cleaned.estado_id) : undefined,
        establec_educ_id: cleaned.establec_educ_id ? Number(cleaned.establec_educ_id) : undefined,
        prevision_medica_id: cleaned.prevision_medica_id ? Number(cleaned.prevision_medica_id) : undefined,
        sucursal_id: cleaned.sucursal_id ? Number(cleaned.sucursal_id) : undefined,
        direccion: cleaned.direccion ? String(cleaned.direccion) : undefined,
        comuna_id: Number.isFinite(comunaId) && comunaId > 0 ? comunaId : undefined,

        // ✅ contrato a BD
        contrato_prestacion: contratoBase64,
        contrato_prestacion_mime: "application/pdf",
      });

      const headers = buildHeaders(rolActual);

      // 3) Crear jugador
      const res = await postWithFallback("/jugadores", payload, headers);
      const body = res?.data || {};

      const nombreOk = body?.nombre_jugador || cleaned.nombre_jugador || "Jugador";
      const idOk = body?.id ?? null;

      const apoderadoCredencial = hasRutApo && /^\d{7,8}$/.test(rutApoDigits);

      setMensaje(
        `✅ Jugador registrado: ${nombreOk}${idOk ? ` (ID ${idOk})` : ""}` +
          (apoderadoCredencial ? " • Apoderado habilitado para portal ✅" : "")
      );

      setCreatedInfo({ nombre: nombreOk, id: idOk, apoderadoCredencial });
      setCreatedOpen(true);

      // Limpia form
      setFormData({
        nombre_jugador: "",
        rut_jugador: "",
        fecha_nacimiento: "",
        edad: "",
        telefono: "",
        email: "",
        direccion: "",
        comuna_id: "",
        posicion_id: "",
        categoria_id: "",
        estado_id: "",
        talla_polera: "",
        talla_short: "",
        establec_educ_id: "",
        prevision_medica_id: "",
        nombre_apoderado: "",
        rut_apoderado: "",
        telefono_apoderado: "",
        peso: "",
        estatura: "",
        observaciones: "",
        sucursal_id: "",
      });
    } catch (err) {
      const st = err?.status ?? err?.response?.status ?? 0;
      const data = err?.data ?? err?.response?.data ?? null;
      const text = err?.request?.responseText;
      const msg = data?.message ?? err?.message ?? (text ? String(text).slice(0, 300) : "Error");

      if (st === 401) {
        clearToken();
        return navigate("/login", { replace: true });
      }

      if (st === 403) {
        if (rolActual === 3) return setError("⚠️ Superadmin: falta x-academia-id o academia no autorizada.");
        clearToken();
        return navigate("/login", { replace: true });
      }

      setError(String(msg || "❌ No se pudo guardar el jugador"));
      console.warn("❌ guardar jugador error:", { st, data, text, err });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ───────── UI (ESTILO SuperDashboard) ───────── */
  const ui = useMemo(() => {
    const page =
      "min-h-screen px-4 pt-4 pb-16 font-sans overflow-x-hidden " +
      (darkMode
        ? "bg-[#111827] text-white"
        : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron");

    const card =
      "w-full max-w-full md:max-w-2xl mx-auto rounded-2xl border shadow-lg " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const input =
      "w-full box-border rounded-xl px-3 py-2 border outline-none transition " +
      (darkMode
        ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30 focus:ring-2 focus:ring-white/10"
        : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta focus:ring-2 focus:ring-[rgba(170,80,19,0.18)]");

    const select = input;
    const textarea = input + " h-24 resize-none";

    const bannerErr =
      "mb-4 p-3 rounded-2xl border " +
      (darkMode ? "bg-red-500/10 border-red-300/20 text-red-100" : "bg-red-500/10 border-red-600/25 text-red-800");

    const bannerWarn =
      "mb-4 p-3 rounded-2xl border " +
      (darkMode
        ? "bg-amber-500/10 border-amber-300/20 text-amber-100"
        : "bg-amber-500/10 border-amber-600/25 text-amber-900");

    const btn =
      "py-2 px-4 rounded-xl font-extrabold border border-white/15 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed";

    const btnBg = {
      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
      color: "white",
    };

    const titleColor = darkMode ? "text-white" : "text-ra-marron";

    return { page, card, input, select, textarea, bannerErr, bannerWarn, btn, btnBg, titleColor };
  }, [darkMode]);

  if (isLoading) return <IsLoading />;

  return (
    <div className={ui.page}>
      <h2 className={`text-2xl font-extrabold mb-4 text-center ${ui.titleColor}`}>Registrar Jugador</h2>

      <div className={`${ui.card} p-4 sm:p-6`}>
        {rolActual === 3 && !academiaTarget && (
          <div className={ui.bannerWarn}>
            ⚠️ Superadmin: selecciona una academia para operar (se enviará <b>x-academia-id</b>).
          </div>
        )}

        {error && <div className={ui.bannerErr}>{error}</div>}

        <form onSubmit={enviarJugador} className="grid gap-4 text-sm">
          {(() => {
            const fields = [
              ["nombre_jugador", "Nombre", true],
              ["rut_jugador", "RUT (sin puntos ni guion ni dígito verificador)", true],
              ["fecha_nacimiento", "Fecha de Nacimiento", false, "date"],
              ["edad", "Edad", false],
              ["telefono", "Teléfono (+56... o 9–11 dígitos)", false],
              ["email", "Correo", false, "email"],
              ["direccion", "Dirección"],
              ["talla_polera", "Talla Polera"],
              ["talla_short", "Talla Short"],
              ["nombre_apoderado", "Nombre Apoderado"],
              ["rut_apoderado", "RUT Apoderado (sin puntos ni guion ni dígito verificador)"],
              ["telefono_apoderado", "Teléfono Apoderado (+56...)"],
              ["peso", "Peso (kg)"],
              ["estatura", "Estatura (cm)"],
            ];

            const idxDireccion = fields.findIndex(([name]) => name === "direccion");
            const before = idxDireccion >= 0 ? fields.slice(0, idxDireccion + 1) : fields;
            const after = idxDireccion >= 0 ? fields.slice(idxDireccion + 1) : [];

            const renderInput = ([name, placeholder, req, type = "text"]) => (
              <input
                key={name}
                name={name}
                type={type}
                value={formData[name] ?? ""}
                onChange={handleChange}
                placeholder={placeholder}
                required={!!req}
                className={ui.input}
              />
            );

            return (
              <>
                {before.map(renderInput)}

                <select
                  name="comuna_id"
                  value={formData.comuna_id ?? ""}
                  onChange={handleChange}
                  className={ui.select}
                >
                  <option value="">Comuna</option>
                  {comunas.map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.nombre}
                    </option>
                  ))}
                </select>

                {after.map(renderInput)}
              </>
            );
          })()}

          <select
            name="posicion_id"
            value={formData.posicion_id}
            onChange={handleChange}
            required
            className={ui.select}
          >
            <option value="">Posición</option>
            {posiciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <select
            name="categoria_id"
            value={formData.categoria_id}
            onChange={handleChange}
            required
            className={ui.select}
          >
            <option value="">Categoría</option>
            {categorias.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.nombre}
              </option>
            ))}
          </select>

          <select
            name="estado_id"
            value={formData.estado_id}
            onChange={handleChange}
            required
            className={ui.select}
          >
            <option value="">Estado</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <select
            name="establec_educ_id"
            value={formData.establec_educ_id}
            onChange={handleChange}
            className={ui.select}
          >
            <option value="">Establecimiento Educacional</option>
            {establecimientos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>

          <select
            name="prevision_medica_id"
            value={formData.prevision_medica_id}
            onChange={handleChange}
            className={ui.select}
          >
            <option value="">Previsión Médica</option>
            {previsiones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <select
            name="sucursal_id"
            value={formData.sucursal_id}
            onChange={handleChange}
            className={ui.select}
          >
            <option value="">Sucursal</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          <textarea
            name="observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            placeholder="Observaciones"
            className={ui.textarea}
          />

          {/* ✅ Un solo botón Guardar (contrato + jugador) */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting || (rolActual === 3 && !academiaTarget)}
              className={ui.btn}
              style={ui.btnBg}
            >
              {isSubmitting ? "Guardando… (generando contrato)" : "Guardar"}
            </button>
          </div>

          {isSubmitting && (
            <div className={darkMode ? "text-xs text-white/75" : "text-xs text-ra-marron/70"}>
              Procesando contrato y guardando jugador… si lo cierras, el sistema te cobra “IVA emocional” 😄
            </div>
          )}
        </form>

        {mensaje && (
          <p className={darkMode ? "text-emerald-200 mt-4 text-center font-bold" : "text-emerald-700 mt-4 text-center font-bold"}>
            {mensaje}
          </p>
        )}
      </div>

      {/* ✅ Modal "jugador creado" */}
      <Modal open={createdOpen} onClose={() => setCreatedOpen(false)} title="✅ Jugador creado" darkMode={darkMode}>
        <div>
          <div>
            <b>Nombre:</b> {createdInfo.nombre}
          </div>
          {createdInfo.id != null && (
            <div>
              <b>ID:</b> {createdInfo.id}
            </div>
          )}

          <div className={darkMode ? "mt-2 text-white/80" : "mt-2 text-ra-marron/75"}>
            Contrato generado y almacenado en la base de datos.
          </div>

          {createdInfo.apoderadoCredencial && (
            <div className={darkMode ? "mt-2 text-xs text-white/85" : "mt-2 text-xs text-ra-marron/80"}>
              ✅ Apoderado habilitado para portal (credencial temporal creada).
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
