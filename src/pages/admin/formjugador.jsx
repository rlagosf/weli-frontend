// src/pages/admin/formjugador.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { UserRound, Users, ChevronLeft, ChevronRight, MapPin, Check } from "lucide-react";

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
        <div className={darkMode ? "text-sm mb-4 text-white/85" : "text-sm mb-4 text-ra-marron/80"}>{children}</div>
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

  // Academia objetivo actual (solo importa para rol 3).
  const [academiaTarget, setAcademiaTarget] = useState(() => getAcademiaIdFromStorage());

  // Paso 1: jugador / Paso 2: apoderado.
  const [paso, setPaso] = useState(1);

  // Estado del formulario.
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

    // Nuevo modelo visual: un jugador puede seleccionar N sucursales.
    sucursal_ids: [],
  });

  // Listas para selects.
  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Búsqueda de identidad canónica del apoderado por RUT.
  const [buscandoApoderado, setBuscandoApoderado] = useState(false);
  const [apoderadoEncontrado, setApoderadoEncontrado] = useState(false);
  const [apoderadoLookupMsg, setApoderadoLookupMsg] = useState("");

  // Modal creado.
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

      // Rol 1/2: no usamos x-academia-id.
      if ((rol === 1 || rol === 2) && storedAcademia && tokenAcademia && storedAcademia !== tokenAcademia) {
        try {
          localStorage.removeItem(ACADEMIA_STORAGE_KEY);
        } catch {}
      }

      // Rol 3: requiere academia target.
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

  /* ───────── Detecta cambios de academia objetivo ───────── */
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

  /* ───────── Cargar catálogos por academia ───────── */
  useEffect(() => {
    if (![1, 2, 3].includes(rolActual)) return;
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

              return {
                id: Number(id),
                nombre: String(nombre ?? "").trim() || String(id ?? "").trim(),
              };
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

        if (allEmpty) {
          setError("❌ No se pudieron cargar los datos de selección para esta academia.");
        }

        // Invalida datos seleccionados si cambió la academia/catálogo.
        setFormData((prev) => {
          const exists = (arr, id) => arr.some((x) => String(x.id) === String(id));
          const next = { ...prev };

          if (prev.posicion_id && !exists(posN, prev.posicion_id)) next.posicion_id = "";
          if (prev.categoria_id && !exists(catN, prev.categoria_id)) next.categoria_id = "";
          if (prev.estado_id && !exists(estN, prev.estado_id)) next.estado_id = "";
          if (prev.establec_educ_id && !exists(eduN, prev.establec_educ_id)) next.establec_educ_id = "";
          if (prev.prevision_medica_id && !exists(prevN, prev.prevision_medica_id)) next.prevision_medica_id = "";
          if (prev.comuna_id && !exists(comN, prev.comuna_id)) next.comuna_id = "";

          next.sucursal_ids = (Array.isArray(prev.sucursal_ids) ? prev.sucursal_ids : []).filter((id) =>
            exists(sucN, id)
          );

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

        if (!abort.signal.aborted) {
          setError("❌ No se pudieron cargar los datos de selección.");
        }
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
        !prev.establec_educ_id && establecimientos.length === 1
          ? String(establecimientos[0].id)
          : prev.establec_educ_id,
      prevision_medica_id:
        !prev.prevision_medica_id && previsiones.length === 1 ? String(previsiones[0].id) : prev.prevision_medica_id,
      comuna_id: !prev.comuna_id && comunas.length === 1 ? String(comunas[0].id) : prev.comuna_id,
      sucursal_ids:
        (!Array.isArray(prev.sucursal_ids) || prev.sucursal_ids.length === 0) && sucursales.length === 1
          ? [String(sucursales[0].id)]
          : prev.sucursal_ids,
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

  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ───────── Manejador de cambios ───────── */
  const handleChange = ({ target: { name, value } }) => {
    const onlyInt = (v) => (/^\d*$/.test(v) ? v : formData[name]);
    const onlyPhone = (v) => (/^\+?\d*$/.test(v) ? v : formData[name]);
    const onlyNum = (v) => (/^\d*([.]\d{0,2})?$/.test(v) ? v : formData[name]);

    if (name === "rut_jugador" || name === "rut_apoderado") {
      value = onlyInt(value).slice(0, 8);

      if (name === "rut_apoderado") {
        // Si cambia el RUT, invalida cualquier identidad previamente encontrada.
        setApoderadoEncontrado(false);
        setApoderadoLookupMsg("");

        setFormData((prev) => ({
          ...prev,
          rut_apoderado: value,

          // Solo limpiamos el nombre si venía autocompletado desde backend.
          nombre_apoderado: apoderadoEncontrado ? "" : prev.nombre_apoderado,
        }));

        return;
      }
    }

    if (name === "edad") value = onlyInt(value).slice(0, 3);

    if (name === "telefono" || name === "telefono_apoderado") {
      value = onlyPhone(value).slice(0, 15);
    }

    if (name === "peso") value = onlyNum(value).slice(0, 6);
    if (name === "estatura") value = onlyInt(value).slice(0, 3);

    if (name === "fecha_nacimiento") {
      const edadAuto = calcEdad(value);

      setFormData((prev) => ({
        ...prev,
        [name]: value,
        edad: edadAuto,
      }));

      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* ───────── Buscar apoderado existente por RUT ───────── */
  useEffect(() => {
    if (paso !== 2) return;

    const rut = String(formData.rut_apoderado || "").replace(/\D/g, "");

    // El sistema de apoderados_auth trabaja con 8 dígitos sin DV.
    if (rut.length !== 8) {
      setBuscandoApoderado(false);
      setApoderadoEncontrado(false);
      setApoderadoLookupMsg("");
      return;
    }

    const ctrl = new AbortController();

    const timer = setTimeout(async () => {
      setBuscandoApoderado(true);
      setApoderadoLookupMsg("");

      try {
        const headers = buildHeaders(rolActual);

        const res = await api.get(`/jugadores/apoderado/rut/${rut}`, {
          signal: ctrl.signal,
          headers,
        });

        const body = res?.data ?? {};
        const item = body?.item ?? body?.data ?? body;

        const nombre = String(item?.nombre_apoderado ?? "").trim();

        if (!nombre) {
          setApoderadoEncontrado(false);
          setApoderadoLookupMsg("Apoderado nuevo: ingresa su nombre completo.");
          return;
        }

        setFormData((prev) => ({
          ...prev,
          nombre_apoderado: nombre,
        }));

        setApoderadoEncontrado(true);
        setApoderadoLookupMsg("✓ Apoderado encontrado. Nombre autocompletado.");
      } catch (err) {
        if (ctrl.signal.aborted) return;

        const status = err?.status ?? err?.response?.status ?? 0;

        if (status === 404) {
          setApoderadoEncontrado(false);
          setFormData((prev) => ({
            ...prev,
            nombre_apoderado: "",
          }));
          setApoderadoLookupMsg("Apoderado nuevo: ingresa su nombre completo.");
          return;
        }

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (status === 403) {
          if (rolActual === 3) {
            setError("⚠️ Superadmin: falta x-academia-id o academia no autorizada.");
            return;
          }

          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        setApoderadoEncontrado(false);
        setApoderadoLookupMsg("No fue posible verificar el RUT del apoderado.");
      } finally {
        if (!ctrl.signal.aborted) {
          setBuscandoApoderado(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [paso, formData.rut_apoderado, rolActual, navigate]);

  const toggleSucursal = (id) => {
    const sid = String(id);

    setFormData((prev) => {
      const actuales = Array.isArray(prev.sucursal_ids) ? prev.sucursal_ids : [];
      const existe = actuales.some((x) => String(x) === sid);

      return {
        ...prev,
        sucursal_ids: existe ? actuales.filter((x) => String(x) !== sid) : [...actuales, sid],
      };
    });
  };

  /* ───────── Validar paso jugador ───────── */
  const validarPasoJugador = () => {
    setError("");

    const rutJugDigits = String(formData.rut_jugador || "").replace(/\D/g, "");

    if (!String(formData.nombre_jugador || "").trim()) {
      setError("Debes ingresar el nombre del jugador.");
      return false;
    }

    if (!/^\d{7,8}$/.test(rutJugDigits)) {
      setError("El RUT del jugador debe ser de 7 u 8 dígitos (sin DV).");
      return false;
    }

    const edadNum = Number(formData.edad || "0");

    if (formData.edad && (edadNum < 5 || edadNum > 100)) {
      setError("La edad debe estar entre 5 y 100 años si la indicas.");
      return false;
    }

    if (formData.telefono) {
      const okTel = /^\+\d{9,15}$/.test(formData.telefono) || /^\d{9,11}$/.test(formData.telefono);

      if (!okTel) {
        setError("Teléfono inválido: usa +569... o 9–11 dígitos.");
        return false;
      }
    }

    if ([formData.posicion_id, formData.categoria_id, formData.estado_id].some((v) => !v)) {
      setError("Debes seleccionar posición, categoría y estado.");
      return false;
    }

    if (!Array.isArray(formData.sucursal_ids) || formData.sucursal_ids.length === 0) {
      setError("Debes seleccionar al menos una sucursal para el jugador.");
      return false;
    }

    if (rolActual === 3 && !getAcademiaIdFromStorage()) {
      setError("⚠️ Superadmin: selecciona una academia antes de continuar.");
      return false;
    }

    return true;
  };

  const irPasoApoderado = () => {
    if (!validarPasoJugador()) return;

    setPaso(2);
    setError("");
    scrollTop();
  };

  const volverPasoJugador = () => {
    setPaso(1);
    setError("");
    scrollTop();
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

    if (!/^\d{7,8}$/.test(rutApoDigits)) {
      throw new Error("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
    }

    if (!/^\d{7,8}$/.test(rutJugDigits)) {
      throw new Error("El RUT del jugador debe ser de 7 u 8 dígitos (sin DV).");
    }

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

    if (!base64 || base64.length < 50) {
      throw new Error("El contrato se generó vacío o inválido.");
    }

    return base64;
  }, [formData, comunas]);

  /* ───────── Enviar jugador ───────── */
  const enviarJugador = async (e) => {
    e.preventDefault();

    setMensaje("");
    setError("");

    // El envío final solo se realiza desde el paso 2.
    if (paso !== 2) {
      irPasoApoderado();
      return;
    }

    if (!validarPasoJugador()) {
      setPaso(1);
      scrollTop();
      return;
    }

    const rutApoDigits = String(formData.rut_apoderado || "").replace(/\D/g, "");

    if (!/^\d{7,8}$/.test(rutApoDigits)) {
      return setError("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
    }

    if (!String(formData.nombre_apoderado || "").trim()) {
      return setError("Debes ingresar el nombre del apoderado.");
    }

    if (formData.telefono_apoderado) {
      const okTel = /^\+\d{9,15}$/.test(formData.telefono_apoderado) || /^\d{9,11}$/.test(formData.telefono_apoderado);

      if (!okTel) {
        return setError("Teléfono del apoderado inválido: usa +569... o 9–11 dígitos.");
      }
    }

    if (rolActual === 3 && !getAcademiaIdFromStorage()) {
      return setError("⚠️ Superadmin: selecciona una academia antes de guardar (x-academia-id).");
    }

    try {
      setIsSubmitting(true);

      // 1) Generar contrato.
      const contratoBase64 = await generarContratoBase64();

      // 2) Payload.
      const cleaned = trimStrings(formData);
      const comunaId = cleaned.comuna_id ? Number(cleaned.comuna_id) : undefined;

      const sucursalIds = (Array.isArray(formData.sucursal_ids) ? formData.sucursal_ids : [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0);

      const sucursalPrincipal = sucursalIds[0];

      const payload = emptyToUndef({
        ...cleaned,

        // No mandamos el estado interno de UI.
        sucursal_ids: undefined,

        rut_jugador: cleaned.rut_jugador ? Number(cleaned.rut_jugador) : undefined,
        rut_apoderado: cleaned.rut_apoderado ? Number(cleaned.rut_apoderado) : undefined,
        edad: cleaned.edad ? Number(cleaned.edad) : undefined,
        posicion_id: cleaned.posicion_id ? Number(cleaned.posicion_id) : undefined,
        categoria_id: cleaned.categoria_id ? Number(cleaned.categoria_id) : undefined,
        estado_id: cleaned.estado_id ? Number(cleaned.estado_id) : undefined,
        establec_educ_id: cleaned.establec_educ_id ? Number(cleaned.establec_educ_id) : undefined,
        prevision_medica_id: cleaned.prevision_medica_id ? Number(cleaned.prevision_medica_id) : undefined,

        // Compatibilidad con la columna legacy.
        sucursal_id: sucursalPrincipal,

        // Nuevo arreglo para jugador_sucursal.
        sucursales: sucursalIds,

        direccion: cleaned.direccion ? String(cleaned.direccion) : undefined,
        comuna_id: Number.isFinite(comunaId) && comunaId > 0 ? comunaId : undefined,

        contrato_prestacion: contratoBase64,
        contrato_prestacion_mime: "application/pdf",
      });

      const headers = buildHeaders(rolActual);

      // 3) Crear jugador.
      const res = await postWithFallback("/jugadores", payload, headers);
      const body = res?.data || {};

      const nombreOk = body?.nombre_jugador || cleaned.nombre_jugador || "Jugador";
      const idOk = body?.id ?? null;

      const apoderadoCredencial = /^\d{7,8}$/.test(rutApoDigits);

      setMensaje(
        `✅ Jugador registrado: ${nombreOk}${idOk ? ` (ID ${idOk})` : ""}` +
          (apoderadoCredencial ? " • Apoderado habilitado para portal ✅" : "")
      );

      setCreatedInfo({
        nombre: nombreOk,
        id: idOk,
        apoderadoCredencial,
      });

      setCreatedOpen(true);

      // Limpia formulario.
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
        sucursal_ids: [],
      });

      setApoderadoEncontrado(false);
      setApoderadoLookupMsg("");
      setBuscandoApoderado(false);
      setPaso(1);
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
        if (rolActual === 3) {
          return setError("⚠️ Superadmin: falta x-academia-id o academia no autorizada.");
        }

        clearToken();
        return navigate("/login", { replace: true });
      }

      setError(String(msg || "❌ No se pudo guardar el jugador"));
      console.warn("❌ guardar jugador error:", { st, data, text, err });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ───────── UI ───────── */
  const ui = useMemo(() => {
    const page =
      "min-h-screen px-3 sm:px-4 pt-4 pb-16 font-sans overflow-x-hidden " +
      (darkMode
        ? "bg-[#111827] text-white"
        : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron");

    const card =
      "w-full max-w-5xl mx-auto rounded-3xl border shadow-xl backdrop-blur-md " +
      (darkMode ? "bg-white/[0.07] border-white/15" : "bg-white/70 border-ra-marron/15");

    const section =
      "rounded-2xl border p-4 sm:p-5 " +
      (darkMode ? "bg-white/[0.05] border-white/10" : "bg-white/55 border-ra-marron/10");

    const input =
      "w-full box-border rounded-xl px-3.5 py-2.5 border outline-none transition " +
      (darkMode
        ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30 focus:ring-2 focus:ring-white/10"
        : "bg-white/80 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta focus:ring-2 focus:ring-[rgba(170,80,19,0.18)]");

    const select = input;
    const textarea = input + " min-h-28 resize-y";

    const label = "block text-xs sm:text-sm font-bold mb-1.5 " + (darkMode ? "text-white/75" : "text-ra-marron/75");

    const helper = "text-xs " + (darkMode ? "text-white/50" : "text-ra-marron/55");

    const bannerErr =
      "mb-4 p-3 rounded-2xl border " +
      (darkMode ? "bg-red-500/10 border-red-300/20 text-red-100" : "bg-red-500/10 border-red-600/25 text-red-800");

    const bannerWarn =
      "mb-4 p-3 rounded-2xl border " +
      (darkMode
        ? "bg-amber-500/10 border-amber-300/20 text-amber-100"
        : "bg-amber-500/10 border-amber-600/25 text-amber-900");

    const btn =
      "inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl font-extrabold border border-white/15 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed";

    const btnSecondary =
      "inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl font-extrabold border transition disabled:opacity-60 disabled:cursor-not-allowed " +
      (darkMode
        ? "bg-white/10 border-white/15 text-white hover:bg-white/15"
        : "bg-white/70 border-ra-marron/15 text-ra-marron hover:bg-white");

    const btnBg = {
      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
      color: "white",
    };

    const titleColor = darkMode ? "text-white" : "text-ra-marron";

    return {
      page,
      card,
      section,
      input,
      select,
      textarea,
      label,
      helper,
      bannerErr,
      bannerWarn,
      btn,
      btnSecondary,
      btnBg,
      titleColor,
    };
  }, [darkMode]);

  if (isLoading) return <IsLoading />;

  const StepIndicator = () => (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-6">
      <div
        className={[
          "rounded-2xl border p-3 sm:p-4 transition",
          paso === 1
            ? darkMode
              ? "bg-white/15 border-white/25"
              : "bg-white border-ra-terracotta/50 shadow-sm"
            : darkMode
              ? "bg-white/[0.04] border-white/10"
              : "bg-white/40 border-ra-marron/10",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{
              background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
            }}
          >
            {paso > 1 ? <Check size={19} /> : <UserRound size={19} />}
          </div>

          <div className="min-w-0">
            <div className={ui.helper}>Paso 1 de 2</div>
            <div className="font-extrabold text-sm sm:text-base truncate">Datos del jugador</div>
          </div>
        </div>
      </div>

      <div
        className={[
          "rounded-2xl border p-3 sm:p-4 transition",
          paso === 2
            ? darkMode
              ? "bg-white/15 border-white/25"
              : "bg-white border-ra-terracotta/50 shadow-sm"
            : darkMode
              ? "bg-white/[0.04] border-white/10"
              : "bg-white/40 border-ra-marron/10",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div
            className={[
              "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0",
              paso === 2 ? "text-white" : darkMode ? "bg-white/10 text-white/50" : "bg-ra-marron/10 text-ra-marron/50",
            ].join(" ")}
            style={
              paso === 2
                ? {
                    background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
                  }
                : undefined
            }
          >
            <Users size={19} />
          </div>

          <div className="min-w-0">
            <div className={ui.helper}>Paso 2 de 2</div>
            <div className="font-extrabold text-sm sm:text-base truncate">Datos del apoderado</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={ui.page}>
      <div className="w-full max-w-5xl mx-auto mb-4 sm:mb-6 text-center">
        <h2 className={`text-2xl sm:text-3xl font-extrabold ${ui.titleColor}`}>Registrar jugador</h2>

        <p className={`mt-1 ${ui.helper}`}>
          Completa primero la información del jugador y luego los datos de su apoderado.
        </p>
      </div>

      <div className={`${ui.card} p-4 sm:p-6 lg:p-8`}>
        <StepIndicator />

        {rolActual === 3 && !academiaTarget && (
          <div className={ui.bannerWarn}>
            ⚠️ Superadmin: selecciona una academia para operar (se enviará <b>x-academia-id</b>).
          </div>
        )}

        {error && <div className={ui.bannerErr}>{error}</div>}

        <form onSubmit={enviarJugador}>
          {paso === 1 && (
            <div className="space-y-5">
              {/* Identificación */}
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{
                      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
                    }}
                  >
                    <UserRound size={20} />
                  </div>

                  <div>
                    <h3 className="font-extrabold text-lg">Identificación del jugador</h3>
                    <p className={ui.helper}>Información personal y de contacto.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={ui.label}>Nombre completo *</label>
                    <input
                      name="nombre_jugador"
                      value={formData.nombre_jugador}
                      onChange={handleChange}
                      placeholder="Nombre completo del jugador"
                      className={ui.input}
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>RUT *</label>
                    <input
                      name="rut_jugador"
                      value={formData.rut_jugador}
                      onChange={handleChange}
                      placeholder="Sin puntos, guion ni DV"
                      className={ui.input}
                      inputMode="numeric"
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Fecha de nacimiento</label>
                    <input
                      name="fecha_nacimiento"
                      type="date"
                      value={formData.fecha_nacimiento}
                      onChange={handleChange}
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Edad</label>
                    <input
                      name="edad"
                      value={formData.edad}
                      onChange={handleChange}
                      placeholder="Edad"
                      className={ui.input}
                      inputMode="numeric"
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Teléfono</label>
                    <input
                      name="telefono"
                      value={formData.telefono}
                      onChange={handleChange}
                      placeholder="+569... o 9–11 dígitos"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Correo</label>
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="correo@ejemplo.cl"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Dirección</label>
                    <input
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleChange}
                      placeholder="Dirección"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Comuna</label>
                    <select name="comuna_id" value={formData.comuna_id} onChange={handleChange} className={ui.select}>
                      <option value="">Selecciona comuna</option>
                      {comunas.map((co) => (
                        <option key={co.id} value={co.id}>
                          {co.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Datos deportivos */}
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{
                      background: `linear-gradient(135deg, ${PALETTE.brown}, ${PALETTE.copper})`,
                    }}
                  >
                    <MapPin size={20} />
                  </div>

                  <div>
                    <h3 className="font-extrabold text-lg">Información deportiva</h3>
                    <p className={ui.helper}>Categoría, posición, estado y sucursales en las que participará.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className={ui.label}>Posición *</label>
                    <select
                      name="posicion_id"
                      value={formData.posicion_id}
                      onChange={handleChange}
                      required
                      className={ui.select}
                    >
                      <option value="">Selecciona posición</option>
                      {posiciones.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Categoría *</label>
                    <select
                      name="categoria_id"
                      value={formData.categoria_id}
                      onChange={handleChange}
                      required
                      className={ui.select}
                    >
                      <option value="">Selecciona categoría</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Estado *</label>
                    <select
                      name="estado_id"
                      value={formData.estado_id}
                      onChange={handleChange}
                      required
                      className={ui.select}
                    >
                      <option value="">Selecciona estado</option>
                      {estados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
                    <div>
                      <label className={ui.label}>Sucursales *</label>
                      <p className={ui.helper}>Puedes seleccionar una o varias sucursales de esta academia.</p>
                    </div>

                    <div className={ui.helper}>
                      {formData.sucursal_ids.length} seleccionada
                      {formData.sucursal_ids.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  {sucursales.length === 0 ? (
                    <div
                      className={[
                        "rounded-xl border p-4 text-sm",
                        darkMode
                          ? "border-white/10 bg-white/[0.04] text-white/60"
                          : "border-ra-marron/10 bg-white/40 text-ra-marron/60",
                      ].join(" ")}
                    >
                      No hay sucursales disponibles para esta academia.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sucursales.map((s) => {
                        const selected = formData.sucursal_ids.some((id) => String(id) === String(s.id));

                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSucursal(s.id)}
                            className={[
                              "w-full rounded-xl border p-3 text-left transition flex items-center gap-3",
                              selected
                                ? darkMode
                                  ? "bg-white/15 border-white/30"
                                  : "bg-white border-ra-terracotta/50 shadow-sm"
                                : darkMode
                                  ? "bg-white/[0.04] border-white/10 hover:bg-white/[0.08]"
                                  : "bg-white/40 border-ra-marron/10 hover:bg-white/70",
                            ].join(" ")}
                            aria-pressed={selected}
                          >
                            <span
                              className={[
                                "w-6 h-6 rounded-md border flex items-center justify-center shrink-0",
                                selected
                                  ? "border-transparent text-white"
                                  : darkMode
                                    ? "border-white/25"
                                    : "border-ra-marron/25",
                              ].join(" ")}
                              style={
                                selected
                                  ? {
                                      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
                                    }
                                  : undefined
                              }
                            >
                              {selected && <Check size={15} />}
                            </span>

                            <span className="font-bold text-sm">{s.nombre}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* Complementarios */}
              <section className={ui.section}>
                <h3 className="font-extrabold text-lg mb-1">Información complementaria</h3>
                <p className={`${ui.helper} mb-4`}>Datos físicos, educacionales y médicos del jugador.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className={ui.label}>Establecimiento educacional</label>
                    <select
                      name="establec_educ_id"
                      value={formData.establec_educ_id}
                      onChange={handleChange}
                      className={ui.select}
                    >
                      <option value="">Selecciona establecimiento</option>
                      {establecimientos.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Previsión médica</label>
                    <select
                      name="prevision_medica_id"
                      value={formData.prevision_medica_id}
                      onChange={handleChange}
                      className={ui.select}
                    >
                      <option value="">Selecciona previsión</option>
                      {previsiones.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Peso (kg)</label>
                    <input
                      name="peso"
                      value={formData.peso}
                      onChange={handleChange}
                      placeholder="Ej: 52.5"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Estatura (cm)</label>
                    <input
                      name="estatura"
                      value={formData.estatura}
                      onChange={handleChange}
                      placeholder="Ej: 165"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Talla polera</label>
                    <input
                      name="talla_polera"
                      value={formData.talla_polera}
                      onChange={handleChange}
                      placeholder="Ej: M"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Talla short</label>
                    <input
                      name="talla_short"
                      value={formData.talla_short}
                      onChange={handleChange}
                      placeholder="Ej: M"
                      className={ui.input}
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={ui.label}>Observaciones</label>
                    <textarea
                      name="observaciones"
                      value={formData.observaciones}
                      onChange={handleChange}
                      placeholder="Observaciones relevantes del jugador"
                      className={ui.textarea}
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={irPasoApoderado}
                  disabled={rolActual === 3 && !academiaTarget}
                  className={ui.btn}
                  style={ui.btnBg}
                >
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-5">
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{
                      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
                    }}
                  >
                    <Users size={20} />
                  </div>

                  <div>
                    <h3 className="font-extrabold text-lg">Datos del apoderado</h3>
                    <p className={ui.helper}>
                      El RUT debe utilizarse como referencia para identificar al apoderado de forma consistente.
                    </p>
                  </div>
                </div>

                <div
                  className={[
                    "mb-5 rounded-2xl border p-4",
                    darkMode ? "bg-white/[0.04] border-white/10" : "bg-white/50 border-ra-marron/10",
                  ].join(" ")}
                >
                  <div className="font-bold text-sm">Jugador: {formData.nombre_jugador || "—"}</div>

                  <div className={`${ui.helper} mt-1`}>
                    Sucursales seleccionadas:{" "}
                    {sucursales
                      .filter((s) => formData.sucursal_ids.some((id) => String(id) === String(s.id)))
                      .map((s) => s.nombre)
                      .join(", ") || "—"}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={ui.label}>RUT del apoderado *</label>
                    <input
                      name="rut_apoderado"
                      value={formData.rut_apoderado}
                      onChange={handleChange}
                      placeholder="8 dígitos, sin puntos, guion ni DV"
                      className={ui.input}
                      inputMode="numeric"
                      maxLength={8}
                      required
                    />

                    <div className="mt-1.5 min-h-[18px]">
                      {buscandoApoderado ? (
                        <p className={ui.helper}>Buscando apoderado…</p>
                      ) : apoderadoLookupMsg ? (
                        <p
                          className={
                            apoderadoEncontrado
                              ? darkMode
                                ? "text-xs text-emerald-200"
                                : "text-xs text-emerald-700"
                              : ui.helper
                          }
                        >
                          {apoderadoLookupMsg}
                        </p>
                      ) : (
                        <p className={ui.helper}>Al completar el RUT, WELI verificará si el apoderado ya existe.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={ui.label}>Nombre completo *</label>
                    <input
                      name="nombre_apoderado"
                      value={formData.nombre_apoderado}
                      onChange={handleChange}
                      placeholder={
                        buscandoApoderado
                          ? "Buscando apoderado…"
                          : apoderadoEncontrado
                            ? "Nombre registrado"
                            : "Nombre completo del apoderado"
                      }
                      className={[
                        ui.input,
                        apoderadoEncontrado
                          ? darkMode
                            ? "opacity-80 cursor-not-allowed"
                            : "bg-emerald-50/70 cursor-not-allowed"
                          : "",
                      ].join(" ")}
                      readOnly={apoderadoEncontrado}
                      disabled={buscandoApoderado}
                      required
                    />

                    {apoderadoEncontrado && (
                      <p className={darkMode ? "text-xs text-emerald-200 mt-1.5" : "text-xs text-emerald-700 mt-1.5"}>
                        Este nombre proviene del registro maestro de apoderados.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className={ui.label}>Teléfono del apoderado</label>
                    <input
                      name="telefono_apoderado"
                      value={formData.telefono_apoderado}
                      onChange={handleChange}
                      placeholder="+569... o 9–11 dígitos"
                      className={ui.input}
                    />
                  </div>
                </div>

                <div
                  className={[
                    "mt-5 rounded-xl border px-4 py-3 text-xs sm:text-sm",
                    darkMode
                      ? "border-white/10 bg-white/[0.04] text-white/70"
                      : "border-ra-marron/10 bg-white/45 text-ra-marron/70",
                  ].join(" ")}
                >
                  Si el RUT ya está registrado, WELI reutiliza automáticamente el nombre canónico del apoderado. Si es
                  un RUT nuevo, podrás ingresar su nombre y quedará asociado a esa identidad al crear el jugador.
                </div>
              </section>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <button type="button" onClick={volverPasoJugador} disabled={isSubmitting} className={ui.btnSecondary}>
                  <ChevronLeft size={18} />
                  Volver
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || (rolActual === 3 && !academiaTarget)}
                  className={ui.btn}
                  style={ui.btnBg}
                >
                  {isSubmitting ? (
                    "Guardando…"
                  ) : (
                    <>
                      <Check size={18} />
                      Crear jugador
                    </>
                  )}
                </button>
              </div>

              {isSubmitting && (
                <div className={`text-xs text-center ${darkMode ? "text-white/70" : "text-ra-marron/65"}`}>
                  Generando contrato y registrando al jugador…
                </div>
              )}
            </div>
          )}
        </form>

        {mensaje && (
          <p
            className={
              darkMode ? "text-emerald-200 mt-5 text-center font-bold" : "text-emerald-700 mt-5 text-center font-bold"
            }
          >
            {mensaje}
          </p>
        )}
      </div>

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
