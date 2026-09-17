// src/pages/admin/formjugador.jsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  UserRound,
  Users,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Check,
  WalletCards,
  ClipboardList,
  GraduationCap,
} from "lucide-react";

import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { CONTRATO_TEMPLATE } from "../../services/contratoTemplate";
import { fillContratoTemplate } from "../../services/contratoFill";
import { buildContratoPdfBlob } from "../../services/contratoPdf";
import { formatRutWithDV } from "../../services/rut";

const PALETTE = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

const PASO_ANTECEDENTES = 1;
const PASO_DEPORTIVO = 2;
const PASO_APODERADO = 3;
const PASO_FINANZAS = 4;
const TOTAL_PASOS = 4;
const ESTADO_ACTIVO = 1;

const FINANZAS_BULK_ENDPOINT = "/jugador-planes/tipos-pago/bulk";

const asList = (raw) => {
  if (!raw) return [];

  const data = raw?.data ?? raw;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.roles)) return data.roles;
  if (Array.isArray(data?.data)) return data.data;

  return [];
};

const trimStrings = (obj) => {
  const out = {};

  for (const [key, value] of Object.entries(obj)) {
    out[key] = typeof value === "string" ? value.trim() : value;
  }

  return out;
};

const emptyToUndef = (obj) => {
  const out = {};

  for (const [key, value] of Object.entries(obj)) {
    out[key] = value === "" ? undefined : value;
  }

  return out;
};

const roundMoney = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  return Math.round(number * 100) / 100;
};

const formatMoney = (value) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) return "$0";

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(number);
};

const todaySQL = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

const fechaEsLarga = (date = new Date()) => {
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

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = meses[date.getMonth()];
  const yyyy = date.getFullYear();

  return `${dd} de ${mm} de ${yyyy}`;
};

const fechaSQLALarga = (value) => {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return raw;

  const [, yyyy, mm, dd] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));

  return Number.isNaN(date.getTime()) ? raw : fechaEsLarga(date);
};

const formatAcademiaRut = (value) => {
  const rut = String(value ?? "").replace(/\D/g, "");

  return /^\d{7,8}$/.test(rut) ? formatRutWithDV(rut) : rut;
};

const normalizeAcademiaInfo = (row) => ({
  id: Number(row?.id ?? 0),
  nombre: String(row?.nombre ?? "").trim(),
  rut_academia: row?.rut_academia ?? "",
  deporte_id: Number(row?.deporte_id ?? 0),
  deporte_nombre: String(row?.deporte_nombre ?? "").trim(),
  direccion: String(row?.direccion ?? "").trim(),
  ciudad_comuna_id: Number(row?.ciudad_comuna_id ?? 0) || null,
  ciudad_id: Number(row?.ciudad_id ?? 0) || null,
  ciudad_nombre: String(row?.ciudad_nombre ?? "").trim(),
  comuna_id: Number(row?.comuna_id ?? 0) || null,
  comuna_nombre: String(row?.comuna_nombre ?? "").trim(),
  region_id: Number(row?.region_id ?? 0) || null,
  region_nombre: String(row?.region_nombre ?? "").trim(),
  email: String(row?.email ?? "").trim(),
  estado_id: Number(row?.estado_id ?? 0),
});

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("No se pudo leer el PDF"));

    reader.onload = () => {
      const result = String(reader.result ?? "");
      const index = result.indexOf("base64,");

      resolve(index !== -1 ? result.slice(index + "base64,".length) : result);
    };

    reader.readAsDataURL(blob);
  });

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

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const number = Number(raw);

  return Number.isInteger(number) && [1, 2, 3].includes(number) ? number : 0;
};

const extractAcademiaFromToken = (decoded) => {
  const raw = decoded?.academia_id ?? decoded?.user?.academia_id ?? 0;
  const number = Number(raw);

  return Number.isInteger(number) && number > 0 ? number : 0;
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);

  return !decoded?.exp || decoded.exp <= now;
};

const buildHeaders = (rolActual) => {
  const token = getToken();

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  if (rolActual === 3) {
    const academiaId = getAcademiaIdFromStorage();

    if (academiaId) {
      headers["x-academia-id"] = String(academiaId);
    }
  }

  return headers;
};

const tryGetList = async (paths, { signal, headers }) => {
  const variants = [];

  for (const path of paths) {
    variants.push(path);
    variants.push(path.endsWith("/") ? path.slice(0, -1) : `${path}/`);
  }

  const unique = [...new Set(variants)];
  let lastError = null;

  for (const url of unique) {
    try {
      const response = await api.get(url, {
        signal,
        headers,
      });

      return asList(response);
    } catch (error) {
      lastError = error;

      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        return [];
      }

      const status = error?.status ?? error?.response?.status ?? 0;

      if (status === 401 || status === 403) throw error;
      if (status === 404 || status === 405) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("GET failed");
};

const postWithFallback = async (path, body, headers) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        headers,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status ?? 0;

      if (status === 401 || status === 403) throw error;
      if (status === 404 || status === 405) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("POST failed");
};

const normalizeTipoPago = (row) => {
  const id = Number(row?.tipo_pago_id ?? row?.id);

  return {
    id,
    tipo_pago_id: id,
    nombre: String(row?.nombre ?? "").trim(),
    descripcion: row?.descripcion ?? null,
    tarifa_id: row?.tarifa_id == null ? null : Number(row.tarifa_id),
    monto: row?.monto == null ? null : Number(row.monto),
    estado_id: Number(row?.academia_estado_id ?? row?.estado_id ?? 1),
    tarifa_estado_id: row?.tarifa_estado_id == null ? null : Number(row.tarifa_estado_id),
  };
};

const normalizePlanCatalogo = (row) => ({
  id: Number(row?.id ?? row?.plan_id),
  nombre: String(row?.nombre ?? "").trim(),
  descripcion: row?.descripcion ?? null,
  estado_id: Number(row?.estado_id ?? 1),
  reglas: Array.isArray(row?.reglas) ? row.reglas : [],
});

function Modal({ open, title, children, onClose, darkMode }) {
  if (!open) return null;

  const card =
    "relative w-full max-w-md rounded-2xl border backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.25)] p-5 " +
    (darkMode ? "bg-white/10 border-white/15 text-white" : "bg-white/60 border-ra-marron/15 text-ra-marron");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className={card}>
        <h3 className="text-lg font-extrabold mb-2">{title}</h3>

        <div className={darkMode ? "text-sm mb-4 text-white/85" : "text-sm mb-4 text-ra-marron/80"}>{children}</div>

        <div className="flex justify-end">
          <button
            type="button"
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

export default function FormJugador() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  useMobileAutoScrollTop();

  const [rolActual, setRolActual] = useState(0);
  const [academiaTarget, setAcademiaTarget] = useState(() => getAcademiaIdFromStorage());
  const [academiaInfo, setAcademiaInfo] = useState(null);

  const [paso, setPaso] = useState(PASO_ANTECEDENTES);

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
    sucursal_ids: [],
  });

  const [posiciones, setPosiciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [establecimientos, setEstablecimientos] = useState([]);
  const [previsiones, setPrevisiones] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [comunas, setComunas] = useState([]);

  const [tiposPago, setTiposPago] = useState([]);
  const [planesCatalogo, setPlanesCatalogo] = useState([]);
  const [beneficiosPorTipo, setBeneficiosPorTipo] = useState({});

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [buscandoApoderado, setBuscandoApoderado] = useState(false);
  const [apoderadoEncontrado, setApoderadoEncontrado] = useState(false);
  const [apoderadoLookupMsg, setApoderadoLookupMsg] = useState("");

  const [createdOpen, setCreatedOpen] = useState(false);
  const [createdInfo, setCreatedInfo] = useState({
    nombre: "",
    id: null,
    apoderadoCredencial: false,
    total: 0,
  });

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);

      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);

      if (![1, 2, 3].includes(rol)) {
        throw new Error("no-role");
      }

      const tokenAcademia = extractAcademiaFromToken(decoded);
      const storedAcademia = getAcademiaIdFromStorage();

      if ((rol === 1 || rol === 2) && !tokenAcademia) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      if ((rol === 1 || rol === 2) && storedAcademia && storedAcademia !== tokenAcademia) {
        try {
          localStorage.removeItem(ACADEMIA_STORAGE_KEY);
        } catch {}
      }

      const selected = getAcademiaIdFromStorage();

      if (rol === 3 && !selected) {
        setRolActual(rol);
        setAcademiaTarget(null);
        setError("⚠️ Superadmin: selecciona una academia para cargar los datos.");
        setIsLoading(false);
        return;
      }

      setRolActual(rol);
      setAcademiaTarget(rol === 3 ? selected : tokenAcademia);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (rolActual !== 3) return undefined;

    const sync = () => setAcademiaTarget(getAcademiaIdFromStorage());

    const onStorage = (event) => {
      if (event?.key === ACADEMIA_STORAGE_KEY) {
        sync();
      }
    };

    let last = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");

    const timer = setInterval(() => {
      const now = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");

      if (now !== last) {
        last = now;
        sync();
      }
    }, 800);

    window.addEventListener("storage", onStorage);
    window.addEventListener("weli:selectedAcademiaChanged", sync);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("weli:selectedAcademiaChanged", sync);
      clearInterval(timer);
    };
  }, [rolActual]);

  useEffect(() => {
    if (![1, 2, 3].includes(rolActual)) return;
    if (!academiaTarget) return;

    const abort = new AbortController();
    let alive = true;

    setAcademiaInfo(null);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const headers = buildHeaders(rolActual);

        const [
          academiaResponse,
          posicionesRaw,
          categoriasRaw,
          estadosRaw,
          establecimientosRaw,
          previsionesRaw,
          sucursalesRaw,
          comunasRaw,
        ] = await Promise.all([
          api.get(`/academias/${academiaTarget}`, {
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
          tryGetList(["/establecimientos-educ"], {
            signal: abort.signal,
            headers,
          }),
          tryGetList(["/prevision-medica"], {
            signal: abort.signal,
            headers,
          }),
          tryGetList(["/sucursales-real", "/sucursales"], {
            signal: abort.signal,
            headers,
          }),
          tryGetList(["/comunas"], {
            signal: abort.signal,
            headers,
          }),
        ]);

        if (!alive) return;

        const academiaRaw =
          academiaResponse?.data?.item ?? academiaResponse?.data?.academia ?? academiaResponse?.data ?? null;

        const academiaNormalizada = normalizeAcademiaInfo(academiaRaw);

        if (!academiaNormalizada.id) {
          throw new Error("No fue posible recuperar los antecedentes institucionales de la academia.");
        }

        setAcademiaInfo(academiaNormalizada);

        const normalizeCatalog = (arr, idKeys = ["id"], nameKeys = ["nombre", "descripcion"]) =>
          (Array.isArray(arr) ? arr : [])
            .map((item) => {
              const idKey = idKeys.find((key) => item?.[key] != null);
              const nameKey = nameKeys.find((key) => typeof item?.[key] === "string");

              const id = Number(item?.[idKey]);

              return {
                id,
                nombre: String(item?.[nameKey] ?? id ?? "").trim(),
              };
            })
            .filter((item) => Number.isFinite(item.id) && item.id > 0);

        const posN = normalizeCatalog(posicionesRaw, ["id", "posicion_id"]);
        const catN = normalizeCatalog(categoriasRaw, ["id", "categoria_id"]);
        const estadosN = normalizeCatalog(estadosRaw, ["id", "estado_id"]);
        const eduN = normalizeCatalog(establecimientosRaw, ["id", "establec_educ_id"]);
        const prevN = normalizeCatalog(previsionesRaw, ["id", "prevision_medica_id"]);
        const sucN = normalizeCatalog(sucursalesRaw);
        const comN = normalizeCatalog(comunasRaw);

        setPosiciones(posN);
        setCategorias(catN);
        setEstados(estadosN);
        setEstablecimientos(eduN);
        setPrevisiones(prevN);
        setSucursales(sucN);
        setComunas(comN);

        /*
         * Tarifas: todos los roles necesitan leerlas
         * porque forman parte del contrato.
         */
        const tiposRaw = await tryGetList(["/tipo-pago"], {
          signal: abort.signal,
          headers,
        });

        let catalogoPlanesRaw = [];

        /*
         * Staff no administra beneficios.
         * Para Staff solo necesitamos snapshot de tarifa base.
         */
        if (rolActual !== 2) {
          catalogoPlanesRaw = await tryGetList(["/planes/catalogo"], {
            signal: abort.signal,
            headers,
          });
        }

        if (!alive) return;

        const tipos = (Array.isArray(tiposRaw) ? tiposRaw : [])
          .map(normalizeTipoPago)
          .filter(
            (item) =>
              item.id > 0 &&
              item.estado_id === ESTADO_ACTIVO &&
              item.monto != null &&
              Number.isFinite(Number(item.monto)) &&
              (item.tarifa_estado_id == null || item.tarifa_estado_id === ESTADO_ACTIVO)
          );

        const catalogo = (Array.isArray(catalogoPlanesRaw) ? catalogoPlanesRaw : [])
          .map(normalizePlanCatalogo)
          .filter((item) => item.id > 0 && item.estado_id === ESTADO_ACTIVO);

        setTiposPago(tipos);
        setPlanesCatalogo(catalogo);

        const sinBeneficio = catalogo.find((plan) => String(plan.nombre).trim().toUpperCase() === "SIN BENEFICIO");

        const defaults = {};

        for (const tipo of tipos) {
          defaults[tipo.id] = {
            plan_id: sinBeneficio ? String(sinBeneficio.id) : "",
          };
        }

        setBeneficiosPorTipo(defaults);

        setFormData((previous) => {
          const exists = (array, id) => array.some((item) => String(item.id) === String(id));

          const next = { ...previous };

          if (previous.posicion_id && !exists(posN, previous.posicion_id)) {
            next.posicion_id = "";
          }

          if (previous.categoria_id && !exists(catN, previous.categoria_id)) {
            next.categoria_id = "";
          }

          if (previous.estado_id && !exists(estadosN, previous.estado_id)) {
            next.estado_id = "";
          }

          if (previous.establec_educ_id && !exists(eduN, previous.establec_educ_id)) {
            next.establec_educ_id = "";
          }

          if (previous.prevision_medica_id && !exists(prevN, previous.prevision_medica_id)) {
            next.prevision_medica_id = "";
          }

          if (previous.comuna_id && !exists(comN, previous.comuna_id)) {
            next.comuna_id = "";
          }

          next.sucursal_ids = (Array.isArray(previous.sucursal_ids) ? previous.sucursal_ids : []).filter((id) =>
            exists(sucN, id)
          );

          return next;
        });
      } catch (err) {
        const status = err?.status ?? err?.response?.status ?? 0;

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (status === 403) {
          setError(
            rolActual === 3
              ? "⚠️ Superadmin: falta x-academia-id o no tienes permisos para esta academia."
              : "No tienes permisos para cargar los datos de selección."
          );
          return;
        }

        if (!abort.signal.aborted) {
          setError(err?.response?.data?.message ?? err?.message ?? "❌ No se pudieron cargar los datos de selección.");
        }
      } finally {
        if (alive && !abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      abort.abort();
    };
  }, [navigate, rolActual, academiaTarget]);

  useEffect(() => {
    setFormData((previous) => ({
      ...previous,
      posicion_id: !previous.posicion_id && posiciones.length === 1 ? String(posiciones[0].id) : previous.posicion_id,
      categoria_id:
        !previous.categoria_id && categorias.length === 1 ? String(categorias[0].id) : previous.categoria_id,
      estado_id: !previous.estado_id && estados.length === 1 ? String(estados[0].id) : previous.estado_id,
      establec_educ_id:
        !previous.establec_educ_id && establecimientos.length === 1
          ? String(establecimientos[0].id)
          : previous.establec_educ_id,
      prevision_medica_id:
        !previous.prevision_medica_id && previsiones.length === 1
          ? String(previsiones[0].id)
          : previous.prevision_medica_id,
      comuna_id: !previous.comuna_id && comunas.length === 1 ? String(comunas[0].id) : previous.comuna_id,
      sucursal_ids:
        (!Array.isArray(previous.sucursal_ids) || previous.sucursal_ids.length === 0) && sucursales.length === 1
          ? [String(sucursales[0].id)]
          : previous.sucursal_ids,
    }));
  }, [posiciones, categorias, estados, establecimientos, previsiones, sucursales, comunas]);

  const calcEdad = (yyyyMmDd) => {
    if (!yyyyMmDd) return "";

    const today = new Date();
    const birth = new Date(yyyyMmDd);

    if (Number.isNaN(birth.getTime())) return "";

    let edad = today.getFullYear() - birth.getFullYear();

    const month = today.getMonth() - birth.getMonth();

    if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) {
      edad--;
    }

    return String(Math.max(0, edad));
  };

  const scrollTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleChange = ({ target: { name, value: rawValue } }) => {
    let value = rawValue;

    const onlyInt = (input) => (/^\d*$/.test(input) ? input : formData[name]);

    const onlyPhone = (input) => (/^\+?\d*$/.test(input) ? input : formData[name]);

    const onlyNum = (input) => (/^\d*([.]\d{0,2})?$/.test(input) ? input : formData[name]);

    if (name === "rut_jugador" || name === "rut_apoderado") {
      value = onlyInt(value).slice(0, 8);

      if (name === "rut_apoderado") {
        setApoderadoEncontrado(false);
        setApoderadoLookupMsg("");

        setFormData((previous) => ({
          ...previous,
          rut_apoderado: value,
          nombre_apoderado: apoderadoEncontrado ? "" : previous.nombre_apoderado,
        }));

        return;
      }
    }

    if (name === "edad") {
      value = onlyInt(value).slice(0, 3);
    }

    if (name === "telefono" || name === "telefono_apoderado") {
      value = onlyPhone(value).slice(0, 15);
    }

    if (name === "peso") {
      value = onlyNum(value).slice(0, 6);
    }

    if (name === "estatura") {
      value = onlyInt(value).slice(0, 3);
    }

    if (name === "fecha_nacimiento") {
      setFormData((previous) => ({
        ...previous,
        fecha_nacimiento: value,
        edad: calcEdad(value),
      }));

      return;
    }

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  useEffect(() => {
    if (paso !== PASO_APODERADO) return;

    const rut = String(formData.rut_apoderado ?? "").replace(/\D/g, "");

    if (rut.length !== 8) {
      setBuscandoApoderado(false);
      setApoderadoEncontrado(false);
      setApoderadoLookupMsg("");
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setBuscandoApoderado(true);
      setApoderadoLookupMsg("");

      try {
        const headers = buildHeaders(rolActual);

        const response = await api.get(`/jugadores/apoderado/rut/${rut}`, {
          signal: controller.signal,
          headers,
        });

        const body = response?.data ?? {};
        const item = body?.item ?? body?.data ?? body;
        const nombre = String(item?.nombre_apoderado ?? "").trim();

        if (!nombre) {
          setApoderadoEncontrado(false);
          setApoderadoLookupMsg("Apoderado nuevo: ingresa su nombre completo.");
          return;
        }

        setFormData((previous) => ({
          ...previous,
          nombre_apoderado: nombre,
        }));

        setApoderadoEncontrado(true);
        setApoderadoLookupMsg("✓ Apoderado encontrado. Nombre autocompletado.");
      } catch (err) {
        if (controller.signal.aborted) return;

        const status = err?.status ?? err?.response?.status ?? 0;

        if (status === 404) {
          setApoderadoEncontrado(false);

          setFormData((previous) => ({
            ...previous,
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
          setError(
            rolActual === 3
              ? "⚠️ Superadmin: academia no autorizada."
              : "No tienes permisos para consultar este apoderado."
          );
          return;
        }

        setApoderadoEncontrado(false);
        setApoderadoLookupMsg("No fue posible verificar el RUT del apoderado.");
      } finally {
        if (!controller.signal.aborted) {
          setBuscandoApoderado(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [paso, formData.rut_apoderado, rolActual, navigate]);

  const toggleSucursal = (id) => {
    const sid = String(id);

    setFormData((previous) => {
      const actuales = Array.isArray(previous.sucursal_ids) ? previous.sucursal_ids : [];

      const selected = actuales.some((current) => String(current) === sid);

      return {
        ...previous,
        sucursal_ids: selected ? actuales.filter((current) => String(current) !== sid) : [...actuales, sid],
      };
    });
  };

  const getPlanesParaTipoPago = useCallback(() => {
    return planesCatalogo
      .filter((plan) => Number(plan.estado_id) === ESTADO_ACTIVO)
      .slice()
      .sort((a, b) => {
        const aSin = String(a.nombre).trim().toUpperCase() === "SIN BENEFICIO";

        const bSin = String(b.nombre).trim().toUpperCase() === "SIN BENEFICIO";

        if (aSin && !bSin) return -1;
        if (!aSin && bSin) return 1;

        return String(a.nombre).localeCompare(String(b.nombre), "es");
      });
  }, [planesCatalogo]);

  const getPlan = (planId) => planesCatalogo.find((plan) => Number(plan.id) === Number(planId)) ?? null;

  const calcularMontoFinal = (montoBase, planId) => {
    const base = Math.max(0, Number(montoBase ?? 0));

    const plan = getPlan(planId);

    if (!plan) return base;

    if (String(plan.nombre).trim().toUpperCase() === "SIN BENEFICIO") {
      return base;
    }

    const regla = (Array.isArray(plan.reglas) ? plan.reglas : []).find(
      (item) => Number(item?.estado_id ?? 1) === ESTADO_ACTIVO
    );

    if (!regla) return base;

    const valor = Math.max(0, Number(regla.valor ?? 0));

    switch (
      String(regla.tipo_beneficio ?? "")
        .trim()
        .toUpperCase()
    ) {
      case "PORCENTAJE": {
        const porcentaje = Math.min(100, valor);

        return roundMoney(base * (1 - porcentaje / 100));
      }

      case "DESCUENTO_FIJO":
        return roundMoney(Math.max(0, base - valor));

      case "PRECIO_FIJO":
        return roundMoney(Math.min(base, valor));

      default:
        return base;
    }
  };

  const seleccionarBeneficio = (tipoPagoId, planId) => {
    setBeneficiosPorTipo((previous) => ({
      ...previous,
      [tipoPagoId]: {
        plan_id: String(planId),
      },
    }));
  };

  const totalBase = useMemo(() => tiposPago.reduce((total, tipo) => total + Number(tipo.monto ?? 0), 0), [tiposPago]);

  const totalFinal = useMemo(
    () =>
      tiposPago.reduce((total, tipo) => {
        const planId = beneficiosPorTipo[tipo.id]?.plan_id;

        return total + calcularMontoFinal(tipo.monto, planId);
      }, 0),
    [tiposPago, beneficiosPorTipo, planesCatalogo]
  );

  const totalDescuento = Math.max(0, totalBase - totalFinal);

  const validarAntecedentes = () => {
    setError("");

    const rut = String(formData.rut_jugador ?? "").replace(/\D/g, "");

    if (!String(formData.nombre_jugador ?? "").trim()) {
      setError("Debes ingresar el nombre del jugador.");
      return false;
    }

    if (!/^\d{7,8}$/.test(rut)) {
      setError("El RUT del jugador debe ser de 7 u 8 dígitos (sin DV).");
      return false;
    }

    if (!formData.fecha_nacimiento) {
      setError("Debes ingresar la fecha de nacimiento del jugador para generar el contrato.");
      return false;
    }

    if (!String(formData.direccion ?? "").trim()) {
      setError("Debes ingresar la dirección del jugador para generar el contrato.");
      return false;
    }

    if (!formData.comuna_id) {
      setError("Debes seleccionar la comuna del jugador para generar el contrato.");
      return false;
    }

    const edad = Number(formData.edad ?? 0);

    if (formData.edad && (edad < 5 || edad > 100)) {
      setError("La edad debe estar entre 5 y 100 años.");
      return false;
    }

    if (formData.telefono) {
      const valid = /^\+\d{9,15}$/.test(formData.telefono) || /^\d{9,11}$/.test(formData.telefono);

      if (!valid) {
        setError("Teléfono inválido: usa +569... o 9–11 dígitos.");
        return false;
      }
    }

    return true;
  };

  const validarDeportivo = () => {
    setError("");

    if ([formData.posicion_id, formData.categoria_id, formData.estado_id].some((value) => !value)) {
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

  const validarApoderado = () => {
    setError("");

    const rut = String(formData.rut_apoderado ?? "").replace(/\D/g, "");

    if (!/^\d{7,8}$/.test(rut)) {
      setError("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
      return false;
    }

    if (!String(formData.nombre_apoderado ?? "").trim()) {
      setError("Debes ingresar el nombre del apoderado.");
      return false;
    }

    if (formData.telefono_apoderado) {
      const valid = /^\+\d{9,15}$/.test(formData.telefono_apoderado) || /^\d{9,11}$/.test(formData.telefono_apoderado);

      if (!valid) {
        setError("Teléfono del apoderado inválido: usa +569... o 9–11 dígitos.");
        return false;
      }
    }

    return true;
  };

  const validarFinanzas = () => {
    setError("");

    if (!academiaInfo?.id) {
      setError("No fue posible cargar los antecedentes institucionales de la academia.");
      return false;
    }

    const requiredAcademia = [
      ["nombre", academiaInfo.nombre],
      ["RUT", academiaInfo.rut_academia],
      ["deporte", academiaInfo.deporte_nombre],
      ["dirección", academiaInfo.direccion],
      ["comuna", academiaInfo.comuna_nombre],
      ["ciudad", academiaInfo.ciudad_nombre],
      ["región", academiaInfo.region_nombre],
      ["correo", academiaInfo.email],
    ];

    const missingAcademia = requiredAcademia.find(([, value]) => !String(value ?? "").trim());

    if (missingAcademia) {
      setError(`Falta completar ${missingAcademia[0]} de la academia antes de generar el contrato.`);
      return false;
    }

    if (tiposPago.length === 0) {
      setError("La academia no posee tipos de pago activos con tarifa configurada.");
      return false;
    }

    /*
     * Staff trabaja con tarifa base en modo lectura.
     */
    if (rolActual === 2) {
      return true;
    }

    for (const tipo of tiposPago) {
      if (tipo.monto == null || !Number.isFinite(Number(tipo.monto))) {
        setError(`El concepto "${tipo.nombre}" no posee una tarifa válida.`);
        return false;
      }

      const planId = beneficiosPorTipo[tipo.id]?.plan_id;

      if (!planId) {
        setError(`Debes seleccionar un beneficio para "${tipo.nombre}".`);
        return false;
      }

      const available = getPlanesParaTipoPago(tipo.id).some((plan) => Number(plan.id) === Number(planId));

      if (!available) {
        setError(`El beneficio seleccionado para "${tipo.nombre}" no está disponible.`);
        return false;
      }
    }

    return true;
  };

  const goTo = (next) => {
    setPaso(next);
    setError("");
    scrollTop();
  };

  const siguienteAntecedentes = () => {
    if (validarAntecedentes()) {
      goTo(PASO_DEPORTIVO);
    }
  };

  const siguienteDeportivo = () => {
    if (validarDeportivo()) {
      goTo(PASO_APODERADO);
    }
  };

  const siguienteApoderado = () => {
    if (validarApoderado()) {
      goTo(PASO_FINANZAS);
    }
  };

  const buildContratoContext = useCallback(() => {
    if (!academiaInfo?.id) {
      throw new Error("No fue posible obtener los antecedentes institucionales de la academia.");
    }

    const rutApoderado = String(formData.rut_apoderado ?? "").replace(/\D/g, "");

    const rutJugador = String(formData.rut_jugador ?? "").replace(/\D/g, "");

    if (!/^\d{7,8}$/.test(rutApoderado) || !/^\d{7,8}$/.test(rutJugador)) {
      throw new Error("Los RUT del jugador y apoderado deben contener 7 u 8 dígitos sin DV.");
    }

    const comunaJugador = comunas.find((comuna) => String(comuna.id) === String(formData.comuna_id))?.nombre ?? "";

    const categoriaJugador =
      categorias.find((categoria) => String(categoria.id) === String(formData.categoria_id))?.nombre ?? "";

    const sucursalesSeleccionadas = sucursales.filter((sucursal) =>
      (Array.isArray(formData.sucursal_ids) ? formData.sucursal_ids : []).some(
        (id) => String(id) === String(sucursal.id)
      )
    );

    const conceptos = tiposPago.map((tipo) => {
      const planId = rolActual === 2 ? null : beneficiosPorTipo[tipo.id]?.plan_id;

      const plan = rolActual === 2 ? null : getPlan(planId);

      const montoBase = roundMoney(tipo.monto);

      const montoFinal = rolActual === 2 ? montoBase : roundMoney(calcularMontoFinal(montoBase, planId));

      const descuento = roundMoney(Math.max(0, montoBase - montoFinal));

      return {
        tipo_pago_id: Number(tipo.id),
        tipo_pago_nombre: String(tipo.nombre ?? "").trim() || `Concepto #${tipo.id}`,
        tarifa_id: tipo.tarifa_id == null ? null : Number(tipo.tarifa_id),
        monto_base: montoBase,
        plan_id: plan ? Number(plan.id) : null,
        plan_nombre: plan?.nombre ? String(plan.nombre).trim() : "Sin beneficio",
        monto_descuento: descuento,
        monto_final: montoFinal,
      };
    });

    const contratoTotalBase = roundMoney(conceptos.reduce((total, item) => total + item.monto_base, 0));

    const contratoTotalFinal = roundMoney(conceptos.reduce((total, item) => total + item.monto_final, 0));

    const contratoTotalDescuento = roundMoney(Math.max(0, contratoTotalBase - contratoTotalFinal));

    const detalleTarifas = conceptos
      .map(
        (item) =>
          `• ${item.tipo_pago_nombre}: tarifa base ${formatMoney(
            item.monto_base
          )} · beneficio ${item.plan_nombre} · total ${formatMoney(item.monto_final)}`
      )
      .join("\n");

    const detalleBeneficios = conceptos.map((item) => `• ${item.tipo_pago_nombre}: ${item.plan_nombre}`).join("\n");

    const detallePlan = conceptos
      .map((item) => `• ${item.tipo_pago_nombre}: ${item.plan_nombre} — ${formatMoney(item.monto_final)}`)
      .join("\n");

    const detalleSucursales = sucursalesSeleccionadas.map((sucursal) => `• ${sucursal.nombre}`).join("\n");

    return {
      ciudad_contrato: academiaInfo.ciudad_nombre,
      fecha_contrato: fechaEsLarga(new Date()),
      nombre_academia: academiaInfo.nombre,
      rut_academia: formatAcademiaRut(academiaInfo.rut_academia),
      deporte: academiaInfo.deporte_nombre,
      direccion_academia: academiaInfo.direccion,
      comuna_academia: academiaInfo.comuna_nombre,
      ciudad_academia: academiaInfo.ciudad_nombre,
      region_academia: academiaInfo.region_nombre,
      email_academia: academiaInfo.email,

      nombre_apoderado: String(formData.nombre_apoderado).trim(),
      rut_apoderado: formatRutWithDV(rutApoderado),

      nombre_jugador: String(formData.nombre_jugador).trim(),
      rut_jugador: formatRutWithDV(rutJugador),
      fecha_nacimiento: fechaSQLALarga(formData.fecha_nacimiento),
      direccion_jugador: String(formData.direccion).trim(),
      comuna_jugador: comunaJugador,
      categoria_jugador: categoriaJugador,

      detalle_tarifas: detalleTarifas || "Sin conceptos tarifarios configurados.",
      total_base: formatMoney(contratoTotalBase),
      total_descuento: formatMoney(contratoTotalDescuento),
      total_final: formatMoney(contratoTotalFinal),
      detalle_beneficios: detalleBeneficios || "Sin beneficios aplicados.",
      detalle_plan: detallePlan || "Sin modalidad económica adicional.",
      detalle_sucursales: detalleSucursales || "Sin sucursal informada.",
    };
  }, [
    academiaInfo,
    formData,
    comunas,
    categorias,
    sucursales,
    tiposPago,
    beneficiosPorTipo,
    planesCatalogo,
    rolActual,
  ]);

  const generarContratoBase64 = useCallback(async () => {
    const required = ["nombre_apoderado", "rut_apoderado", "nombre_jugador", "rut_jugador"];

    for (const key of required) {
      if (!String(formData[key] ?? "").trim()) {
        throw new Error("Faltan campos obligatorios para generar el contrato.");
      }
    }

    const data = buildContratoContext();

    const textoFinal = fillContratoTemplate(CONTRATO_TEMPLATE, data);

    const unresolved = textoFinal.match(/<<\s*[^>]+\s*>>/g);

    if (unresolved?.length) {
      throw new Error(`El contrato contiene variables sin resolver: ${unresolved.join(", ")}`);
    }

    const blob = await buildContratoPdfBlob({
      titulo: "CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENSEÑANZA DEPORTIVA",
      subtitulo: `${data.nombre_jugador} • ${data.rut_jugador}`,
      texto: textoFinal,
    });

    const base64 = await blobToBase64(blob);

    if (!base64 || base64.length < 50) {
      throw new Error("El contrato se generó vacío o inválido.");
    }

    return base64;
  }, [formData, buildContratoContext]);

  const guardarConfiguracionFinanciera = async (jugadorId, headers) => {
    if (rolActual === 2) return;

    const items = tiposPago.map((tipo) => ({
      tipo_pago_id: Number(tipo.id),
      plan_id: Number(beneficiosPorTipo[tipo.id]?.plan_id),
    }));

    await postWithFallback(
      FINANZAS_BULK_ENDPOINT,
      {
        jugador_id: Number(jugadorId),
        fecha_inicio: todaySQL(),
        fecha_fin: null,
        estado_id: ESTADO_ACTIVO,
        items,
      },
      headers
    );
  };

  const resetForm = () => {
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

    const sinBeneficio = planesCatalogo.find((plan) => String(plan.nombre).trim().toUpperCase() === "SIN BENEFICIO");

    const defaults = {};

    for (const tipo of tiposPago) {
      defaults[tipo.id] = {
        plan_id: sinBeneficio ? String(sinBeneficio.id) : "",
      };
    }

    setBeneficiosPorTipo(defaults);
    setApoderadoEncontrado(false);
    setApoderadoLookupMsg("");
    setBuscandoApoderado(false);
    setPaso(PASO_ANTECEDENTES);
  };

  const enviarJugador = async (event) => {
    event.preventDefault();

    setMensaje("");
    setError("");

    if (paso !== PASO_FINANZAS) return;

    if (!validarAntecedentes()) {
      goTo(PASO_ANTECEDENTES);
      return;
    }

    if (!validarDeportivo()) {
      goTo(PASO_DEPORTIVO);
      return;
    }

    if (!validarApoderado()) {
      goTo(PASO_APODERADO);
      return;
    }

    if (!validarFinanzas()) return;

    if (rolActual === 3 && !getAcademiaIdFromStorage()) {
      setError("⚠️ Superadmin: selecciona una academia antes de guardar.");
      return;
    }

    try {
      setIsSubmitting(true);

      const contratoBase64 = await generarContratoBase64();

      const cleaned = trimStrings(formData);

      const comunaId = cleaned.comuna_id ? Number(cleaned.comuna_id) : undefined;

      const sucursalIds = (Array.isArray(formData.sucursal_ids) ? formData.sucursal_ids : [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0);

      const sucursalPrincipal = sucursalIds[0];

      const payload = emptyToUndef({
        ...cleaned,
        sucursal_ids: undefined,

        rut_jugador: cleaned.rut_jugador ? Number(cleaned.rut_jugador) : undefined,

        rut_apoderado: cleaned.rut_apoderado ? Number(cleaned.rut_apoderado) : undefined,

        edad: cleaned.edad ? Number(cleaned.edad) : undefined,

        posicion_id: cleaned.posicion_id ? Number(cleaned.posicion_id) : undefined,

        categoria_id: cleaned.categoria_id ? Number(cleaned.categoria_id) : undefined,

        estado_id: cleaned.estado_id ? Number(cleaned.estado_id) : undefined,

        establec_educ_id: cleaned.establec_educ_id ? Number(cleaned.establec_educ_id) : undefined,

        prevision_medica_id: cleaned.prevision_medica_id ? Number(cleaned.prevision_medica_id) : undefined,

        sucursal_id: sucursalPrincipal,
        sucursales: sucursalIds,

        direccion: cleaned.direccion ? String(cleaned.direccion) : undefined,

        comuna_id: Number.isFinite(comunaId) && comunaId > 0 ? comunaId : undefined,

        contrato_prestacion: contratoBase64,

        contrato_prestacion_mime: "application/pdf",
      });

      const headers = buildHeaders(rolActual);

      const response = await postWithFallback("/jugadores", payload, headers);

      const responseBody = response?.data ?? {};

      const jugadorId = Number(responseBody?.id ?? responseBody?.item?.id ?? 0);

      if (!Number.isInteger(jugadorId) || jugadorId <= 0) {
        throw new Error("El jugador fue creado, pero el backend no devolvió un ID válido.");
      }

      await guardarConfiguracionFinanciera(jugadorId, headers);

      const nombreOk =
        responseBody?.nombre_jugador ?? responseBody?.item?.nombre_jugador ?? cleaned.nombre_jugador ?? "Jugador";

      const rutApoderado = String(formData.rut_apoderado ?? "").replace(/\D/g, "");

      const apoderadoCredencial = /^\d{7,8}$/.test(rutApoderado);

      setMensaje(`✅ Jugador registrado: ${nombreOk} (ID ${jugadorId})`);

      setCreatedInfo({
        nombre: nombreOk,
        id: jugadorId,
        apoderadoCredencial,
        total: rolActual === 2 ? totalBase : totalFinal,
      });

      setCreatedOpen(true);
      resetForm();
    } catch (err) {
      const status = err?.status ?? err?.response?.status ?? 0;

      const data = err?.data ?? err?.response?.data ?? null;

      const text = err?.request?.responseText;

      const msg = data?.message ?? err?.message ?? (text ? String(text).slice(0, 300) : "Error");

      if (status === 401) {
        clearToken();
        navigate("/login", {
          replace: true,
        });
        return;
      }

      if (status === 403) {
        setError(
          rolActual === 3
            ? "⚠️ Superadmin: falta x-academia-id o academia no autorizada."
            : "No tienes permisos para registrar este jugador."
        );
        return;
      }

      setError(String(msg || "❌ No se pudo guardar el jugador"));

      console.warn("❌ guardar jugador error:", {
        status,
        data,
        text,
        err,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const ui = useMemo(() => {
    const page =
      "min-h-screen px-3 sm:px-4 pt-4 pb-16 font-sans overflow-x-hidden " +
      (darkMode
        ? "bg-[#111827] text-white"
        : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron");

    const card =
      "w-full max-w-6xl mx-auto rounded-3xl border shadow-xl backdrop-blur-md " +
      (darkMode ? "bg-white/[0.07] border-white/15" : "bg-white/70 border-ra-marron/15");

    const section =
      "rounded-2xl border p-4 sm:p-5 " +
      (darkMode ? "bg-white/[0.05] border-white/10" : "bg-white/55 border-ra-marron/10");

    const input =
      "w-full box-border rounded-xl px-3.5 py-2.5 border outline-none transition " +
      (darkMode
        ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30 focus:ring-2 focus:ring-white/10"
        : "bg-white/80 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta focus:ring-2 focus:ring-[rgba(170,80,19,0.18)]");

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

    return {
      page,
      card,
      section,
      input,
      select: input,
      textarea: input + " min-h-28 resize-y",
      label,
      helper,
      bannerErr,
      bannerWarn,
      btn,
      btnSecondary,
      btnBg: {
        background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
        color: "white",
      },
      titleColor: darkMode ? "text-white" : "text-ra-marron",
    };
  }, [darkMode]);

  if (isLoading) {
    return <IsLoading />;
  }

  const steps = [
    {
      id: PASO_ANTECEDENTES,
      label: "Antecedentes",
      icon: UserRound,
    },
    {
      id: PASO_DEPORTIVO,
      label: "Información deportiva",
      icon: MapPin,
    },
    {
      id: PASO_APODERADO,
      label: "Apoderado",
      icon: Users,
    },
    {
      id: PASO_FINANZAS,
      label: "Tarifas y beneficios",
      icon: WalletCards,
    },
  ];

  const StepIndicator = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
      {steps.map((step) => {
        const Icon = step.icon;
        const active = paso === step.id;
        const done = paso > step.id;

        return (
          <div
            key={step.id}
            className={[
              "rounded-2xl border p-3 sm:p-4 transition",
              active
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
                  active || done
                    ? "text-white"
                    : darkMode
                      ? "bg-white/10 text-white/50"
                      : "bg-ra-marron/10 text-ra-marron/50",
                ].join(" ")}
                style={
                  active || done
                    ? {
                        background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
                      }
                    : undefined
                }
              >
                {done ? <Check size={19} /> : <Icon size={19} />}
              </div>

              <div className="min-w-0">
                <div className={ui.helper}>
                  Paso {step.id} de {TOTAL_PASOS}
                </div>

                <div className="font-extrabold text-sm truncate">{step.label}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={ui.page}>
      <div className="w-full max-w-6xl mx-auto mb-4 sm:mb-6 text-center">
        <h2 className={`text-2xl sm:text-3xl font-extrabold ${ui.titleColor}`}>Registrar jugador</h2>

        <p className={`mt-1 ${ui.helper}`}>
          Registra sus antecedentes, información deportiva, apoderado y configuración financiera inicial.
        </p>

        {academiaInfo?.id && (
          <p className={`mt-2 text-xs font-bold ${darkMode ? "text-white/70" : "text-ra-marron/70"}`}>
            {academiaInfo.nombre} · {academiaInfo.deporte_nombre}
          </p>
        )}
      </div>

      <div className={`${ui.card} p-4 sm:p-6 lg:p-8`}>
        <StepIndicator />

        {rolActual === 3 && !academiaTarget && (
          <div className={ui.bannerWarn}>⚠️ Superadmin: selecciona una academia para operar.</div>
        )}

        {error && <div className={ui.bannerErr}>{error}</div>}

        <form onSubmit={enviarJugador}>
          {paso === PASO_ANTECEDENTES && (
            <div className="space-y-5">
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <UserRound size={22} />

                  <div>
                    <h3 className="font-extrabold text-lg">Antecedentes del jugador</h3>

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
                      inputMode="numeric"
                      maxLength={8}
                      className={ui.input}
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Fecha de nacimiento *</label>

                    <input
                      name="fecha_nacimiento"
                      type="date"
                      value={formData.fecha_nacimiento}
                      onChange={handleChange}
                      className={ui.input}
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Edad</label>

                    <input
                      name="edad"
                      value={formData.edad}
                      onChange={handleChange}
                      inputMode="numeric"
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Teléfono</label>

                    <input
                      name="telefono"
                      value={formData.telefono}
                      onChange={handleChange}
                      placeholder="+569..."
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
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Dirección *</label>

                    <input
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleChange}
                      className={ui.input}
                      required
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Comuna *</label>

                    <select
                      name="comuna_id"
                      value={formData.comuna_id}
                      onChange={handleChange}
                      className={ui.select}
                      required
                    >
                      <option value="">Selecciona comuna</option>

                      {comunas.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <div className="flex justify-end">
                <button type="button" onClick={siguienteAntecedentes} className={ui.btn} style={ui.btnBg}>
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {paso === PASO_DEPORTIVO && (
            <div className="space-y-5">
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <MapPin size={22} />

                  <div>
                    <h3 className="font-extrabold text-lg">Información deportiva</h3>

                    <p className={ui.helper}>Categoría, posición, estado y sucursales.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={ui.label}>Posición *</label>

                    <select
                      name="posicion_id"
                      value={formData.posicion_id}
                      onChange={handleChange}
                      className={ui.select}
                      required
                    >
                      <option value="">Selecciona posición</option>

                      {posiciones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
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
                      className={ui.select}
                      required
                    >
                      <option value="">Selecciona categoría</option>

                      {categorias.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
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
                      className={ui.select}
                      required
                    >
                      <option value="">Selecciona estado</option>

                      {estados.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <label className={ui.label}>Sucursales *</label>

                  <p className={`${ui.helper} mb-3`}>Puedes seleccionar una o varias sucursales.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sucursales.map((item) => {
                      const selected = formData.sucursal_ids.some((id) => String(id) === String(item.id));

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleSucursal(item.id)}
                          className={[
                            "rounded-xl border p-3 text-left flex items-center gap-3 transition",
                            selected
                              ? darkMode
                                ? "bg-white/15 border-white/30"
                                : "bg-white border-ra-terracotta/50 shadow-sm"
                              : darkMode
                                ? "bg-white/[0.04] border-white/10"
                                : "bg-white/40 border-ra-marron/10",
                          ].join(" ")}
                        >
                          <span className="w-6 h-6 border rounded-md flex items-center justify-center">
                            {selected && <Check size={15} />}
                          </span>

                          <span className="font-bold text-sm">{item.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <GraduationCap size={22} />

                  <div>
                    <h3 className="font-extrabold text-lg">Información complementaria</h3>

                    <p className={ui.helper}>Datos físicos, educacionales y médicos.</p>
                  </div>
                </div>

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

                      {establecimientos.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
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

                      {previsiones.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ui.label}>Peso (kg)</label>

                    <input name="peso" value={formData.peso} onChange={handleChange} className={ui.input} />
                  </div>

                  <div>
                    <label className={ui.label}>Estatura (cm)</label>

                    <input name="estatura" value={formData.estatura} onChange={handleChange} className={ui.input} />
                  </div>

                  <div>
                    <label className={ui.label}>Talla polera</label>

                    <input
                      name="talla_polera"
                      value={formData.talla_polera}
                      onChange={handleChange}
                      className={ui.input}
                    />
                  </div>

                  <div>
                    <label className={ui.label}>Talla short</label>

                    <input
                      name="talla_short"
                      value={formData.talla_short}
                      onChange={handleChange}
                      className={ui.input}
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={ui.label}>Observaciones</label>

                    <textarea
                      name="observaciones"
                      value={formData.observaciones}
                      onChange={handleChange}
                      className={ui.textarea}
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-between gap-3">
                <button type="button" onClick={() => goTo(PASO_ANTECEDENTES)} className={ui.btnSecondary}>
                  <ChevronLeft size={18} />
                  Volver
                </button>

                <button type="button" onClick={siguienteDeportivo} className={ui.btn} style={ui.btnBg}>
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {paso === PASO_APODERADO && (
            <div className="space-y-5">
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <Users size={22} />

                  <div>
                    <h3 className="font-extrabold text-lg">Datos del apoderado</h3>

                    <p className={ui.helper}>WELI reutilizará automáticamente una identidad existente.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={ui.label}>RUT del apoderado *</label>

                    <input
                      name="rut_apoderado"
                      value={formData.rut_apoderado}
                      onChange={handleChange}
                      placeholder="Sin puntos, guion ni DV"
                      maxLength={8}
                      inputMode="numeric"
                      className={ui.input}
                      required
                    />

                    <div className="mt-1.5 min-h-[18px]">
                      {buscandoApoderado ? (
                        <p className={ui.helper}>Buscando apoderado…</p>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={ui.label}>Nombre completo *</label>

                    <input
                      name="nombre_apoderado"
                      value={formData.nombre_apoderado}
                      onChange={handleChange}
                      readOnly={apoderadoEncontrado}
                      disabled={buscandoApoderado}
                      className={ui.input}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={ui.label}>Teléfono del apoderado</label>

                    <input
                      name="telefono_apoderado"
                      value={formData.telefono_apoderado}
                      onChange={handleChange}
                      className={ui.input}
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-between gap-3">
                <button type="button" onClick={() => goTo(PASO_DEPORTIVO)} className={ui.btnSecondary}>
                  <ChevronLeft size={18} />
                  Volver
                </button>

                <button type="button" onClick={siguienteApoderado} className={ui.btn} style={ui.btnBg}>
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {paso === PASO_FINANZAS && (
            <div className="space-y-5">
              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-5">
                  <WalletCards size={24} />

                  <div>
                    <h3 className="font-extrabold text-lg">Tarifas y beneficios</h3>

                    <p className={ui.helper}>
                      Valores que quedarán incorporados al contrato al momento de la inscripción.
                    </p>
                  </div>
                </div>

                {tiposPago.length === 0 ? (
                  <div className={ui.bannerWarn}>
                    Esta academia no posee tipos de pago activos con tarifa configurada.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tiposPago.map((tipo) => {
                      const planId = beneficiosPorTipo[tipo.id]?.plan_id ?? "";

                      const montoFinal =
                        rolActual === 2 ? Number(tipo.monto ?? 0) : calcularMontoFinal(tipo.monto, planId);

                      const descuento = Math.max(0, Number(tipo.monto ?? 0) - montoFinal);

                      return (
                        <div
                          key={tipo.id}
                          className={[
                            "rounded-2xl border p-4 sm:p-5",
                            darkMode ? "bg-white/[0.04] border-white/10" : "bg-white/55 border-ra-marron/10",
                          ].join(" ")}
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr] gap-4 items-end">
                            <div>
                              <div className="font-extrabold text-base">{tipo.nombre}</div>

                              {tipo.descripcion && <div className={ui.helper}>{tipo.descripcion}</div>}

                              <div className="mt-3">
                                <span className={ui.helper}>Tarifa base</span>

                                <div className="font-extrabold text-xl">{formatMoney(tipo.monto)}</div>
                              </div>
                            </div>

                            <div>
                              <label className={ui.label}>Beneficio</label>

                              {rolActual === 2 ? (
                                <div
                                  className={`rounded-xl px-3.5 py-2.5 border ${
                                    darkMode
                                      ? "bg-white/5 border-white/10 text-white/70"
                                      : "bg-white/60 border-ra-marron/10 text-ra-marron/70"
                                  }`}
                                >
                                  Sin beneficio modificable
                                </div>
                              ) : (
                                <select
                                  value={planId}
                                  onChange={(event) => seleccionarBeneficio(tipo.id, event.target.value)}
                                  className={ui.select}
                                >
                                  <option value="">Selecciona beneficio</option>

                                  {getPlanesParaTipoPago(tipo.id).map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                      {plan.nombre}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div
                              className={[
                                "rounded-xl border px-4 py-3",
                                darkMode ? "border-white/10 bg-white/[0.05]" : "border-ra-marron/10 bg-white/70",
                              ].join(" ")}
                            >
                              <div className={ui.helper}>Monto contractual</div>

                              <div className="font-extrabold text-2xl">{formatMoney(montoFinal)}</div>

                              {descuento > 0 && (
                                <div className={darkMode ? "text-xs text-emerald-200" : "text-xs text-emerald-700"}>
                                  Ahorro: {formatMoney(descuento)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className={ui.section}>
                <div className="flex items-center gap-3 mb-4">
                  <ClipboardList size={22} />

                  <h3 className="font-extrabold text-lg">Resumen financiero</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border p-4">
                    <div className={ui.helper}>Total sin beneficios</div>

                    <div className="font-extrabold text-xl">{formatMoney(totalBase)}</div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className={ui.helper}>Beneficios aplicados</div>

                    <div className="font-extrabold text-xl">
                      {rolActual === 2 ? formatMoney(0) : formatMoney(totalDescuento)}
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className={ui.helper}>Total contractual</div>

                    <div className="font-extrabold text-2xl">
                      {formatMoney(rolActual === 2 ? totalBase : totalFinal)}
                    </div>
                  </div>
                </div>

                <p className={`${ui.helper} mt-3`}>
                  Estos valores quedarán incorporados al contrato generado para esta inscripción.
                </p>
              </section>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goTo(PASO_APODERADO)}
                  disabled={isSubmitting}
                  className={ui.btnSecondary}
                >
                  <ChevronLeft size={18} />
                  Volver
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !academiaInfo?.id || (rolActual === 3 && !academiaTarget)}
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
                  Generando contrato, registrando jugador y guardando su configuración financiera…
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

          <div className="mt-2">
            <b>Valor contractual:</b> {formatMoney(createdInfo.total)}
          </div>

          <div className={darkMode ? "mt-2 text-white/80" : "mt-2 text-ra-marron/75"}>
            Contrato generado y almacenado correctamente.
          </div>

          {createdInfo.apoderadoCredencial && (
            <div className={darkMode ? "mt-2 text-xs text-white/85" : "mt-2 text-xs text-ra-marron/80"}>
              ✅ Apoderado habilitado para portal.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
