// src/pages/admin/formjugador.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, {
  getToken,
  clearToken,
  ACADEMIA_STORAGE_KEY,
} from "../../services/api";
import IsLoading from "../../components/isLoading";
import { jwtDecode } from "jwt-decode";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

// ✅ Forma B (frontend genera contrato PDF)
import { CONTRATO_TEMPLATE } from "../../services/contratoTemplate";
import { fillContratoTemplate } from "../../services/contratoFill";
import { buildContratoPdfBlob } from "../../services/contratoPdf";
import { formatRutWithDV } from "../../services/rut";

/* ───────── Helpers robustos ───────── */
const asList = (raw) => {
  if (!raw) return [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.roles)) return d.roles;
  return [];
};

const trimStrings = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj))
    out[k] = typeof v === "string" ? v.trim() : v;
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

/* ───────── Modal simple ───────── */
function Modal({ open, title, children, onClose, darkMode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative w-full max-w-md rounded-2xl shadow-xl p-5 ${
          darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]"
        }`}
      >
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <div className="text-sm mb-4">{children}</div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#24C6FF] text-white py-2 px-4 rounded hover:brightness-90"
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
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
  const n = Number(rawRol);
  return Number.isFinite(n) ? n : 0;
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
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

// intenta varias rutas y variantes con / y sin / + headers blindados
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
      const arr = asList(r);
      if (arr.length >= 0) return arr;
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
  const urls = path.endsWith("/")
    ? [path, path.slice(0, -1)]
    : [path, `${path}/`];

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

      // ✅ ahora incluye superadmin (3)
      if (![1, 2, 3].includes(rol)) throw new Error("no-role");

      // ✅ superadmin requiere academia target
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

  /* ───────── Cargar catálogos (resistente + abort + headers) ───────── */
  useEffect(() => {
    const abort = new AbortController();
    let alive = true;

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const headers = buildHeaders(rolActual);

        const [_pos, _cat, _estados, _edu, _prev, _suc, _com] =
          await Promise.all([
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
            .filter((e) => Number.isFinite(e.id));

        setPosiciones(norm(_pos, ["id", "posicion_id"]));
        setCategorias(norm(_cat, ["id", "categoria_id"]));
        setEstados(norm(_estados, ["id", "estado_id"]));
        setEstablecimientos(norm(_edu, ["id", "establec_educ_id"]));
        setPrevisiones(norm(_prev, ["id", "prevision_medica_id"]));
        setSucursales(norm(_suc, ["id"]));
        setComunas(norm(_com, ["id"]));

        const allEmpty = [_pos, _cat, _estados, _edu, _prev, _suc, _com].every(
          (arr) => !Array.isArray(arr) || arr.length === 0
        );
        if (allEmpty) setError("❌ No se pudieron cargar los datos de selección");
      } catch (err) {
        const st = err?.status ?? err?.response?.status;
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        if (!abort.signal.aborted) setError("❌ No se pudieron cargar los datos de selección");
      } finally {
        if (alive && !abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
      abort.abort();
    };
  }, [navigate, rolActual]);

  /* ───────── Autoselección si hay una sola opción ───────── */
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      posicion_id:
        !prev.posicion_id && posiciones.length === 1 ? String(posiciones[0].id) : prev.posicion_id,
      categoria_id:
        !prev.categoria_id && categorias.length === 1 ? String(categorias[0].id) : prev.categoria_id,
      estado_id:
        !prev.estado_id && estados.length === 1 ? String(estados[0].id) : prev.estado_id,
      establec_educ_id:
        !prev.establec_educ_id && establecimientos.length === 1
          ? String(establecimientos[0].id)
          : prev.establec_educ_id,
      prevision_medica_id:
        !prev.prevision_medica_id && previsiones.length === 1
          ? String(previsiones[0].id)
          : prev.prevision_medica_id,
      sucursal_id:
        !prev.sucursal_id && sucursales.length === 1 ? String(sucursales[0].id) : prev.sucursal_id,
      comuna_id:
        !prev.comuna_id && comunas.length === 1 ? String(comunas[0].id) : prev.comuna_id,
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
    if (name === "telefono" || name === "telefono_apoderado")
      value = onlyPhone(value).slice(0, 15);
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

    const comunaNombre =
      comunas.find((c) => String(c.id) === String(formData.comuna_id))?.nombre || "";

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

    // Validaciones suaves (lo imprescindible)
    const edadNum = Number(formData.edad || "0");
    if (formData.edad && (edadNum < 5 || edadNum > 100)) {
      return setError("La edad debe estar entre 5 y 100 años si la indicas");
    }

    if (formData.telefono) {
      const okTel =
        /^\+\d{9,15}$/.test(formData.telefono) || /^\d{9,11}$/.test(formData.telefono);
      if (!okTel) return setError("Teléfono inválido: usa +569... o 9–11 dígitos.");
    }

    const rutApoDigits = String(formData.rut_apoderado || "").replace(/\D/g, "");
    const hasRutApo = rutApoDigits.length > 0;

    if (hasRutApo && !/^\d{7,8}$/.test(rutApoDigits)) {
      return setError("El RUT del apoderado debe ser de 7 u 8 dígitos (sin DV).");
    }

    if (hasRutApo && !String(formData.nombre_apoderado || "").trim()) {
      return setError(
        "Si ingresas RUT de apoderado, debes ingresar también el nombre del apoderado."
      );
    }

    if ([formData.posicion_id, formData.categoria_id, formData.estado_id].some((v) => !v)) {
      return setError("Debes seleccionar posición, categoría y estado");
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

      console.debug("POST /jugadores payload →", {
        ...payload,
        contrato_prestacion: "(base64 oculto)",
        _headers: headers,
      });

      // 3) Crear jugador (robusto con / y sin /)
      const res = await postWithFallback("/jugadores", payload, headers);
      const body = res?.data || {};

      const nombreOk = body?.nombre_jugador || cleaned.nombre_jugador || "Jugador";
      const idOk = body?.id ?? null;

      const apoderadoCredencial = hasRutApo && /^\d{7,8}$/.test(rutApoDigits);

      setMensaje(
        `✅ Jugador registrado: ${nombreOk}${idOk ? ` (ID ${idOk})` : ""}` +
          (apoderadoCredencial
            ? " • Apoderado habilitado para portal (credencial temporal) ✅"
            : "")
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
      const msg =
        data?.message ??
        err?.message ??
        (text ? String(text).slice(0, 300) : "Error");

      if (st === 401 || st === 403) {
        clearToken();
        return navigate("/login", { replace: true });
      }

      setError(String(msg || "❌ No se pudo guardar el jugador"));
      console.warn("❌ guardar jugador error:", { st, data, text, err });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ───────── Clases ───────── */
  const c = useMemo(
    () => ({
      fondo: darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]",
      tarjeta: darkMode ? "bg-[#1f2937] text-white" : "bg-white text-[#1d0b0b]",
      input:
        (darkMode
          ? "bg-[#1f2937] text-white border border-gray-600 placeholder-gray-400"
          : "bg-white text-black border border-gray-300 placeholder-gray-500") +
        " w-full box-border",
    }),
    [darkMode]
  );

  if (isLoading) return <IsLoading />;

  return (
    <div className={`${c.fondo} px-4 pt-4 pb-16 font-weli`}>
      <h2 className="text-2xl font-bold mb-4 text-center">Registrar Jugador</h2>

      <div className={`${c.tarjeta} shadow-lg rounded-2xl p-4 sm:p-6 w-full max-w-full md:max-w-2xl mx-auto`}>
        {error && (
          <div className="mb-4 p-3 rounded border border-red-400 text-red-600 bg-red-50">
            {error}
          </div>
        )}

        <form onSubmit={enviarJugador} className="grid md:grid-cols-1 lg:grid-cols-1 gap-4 text-sm">
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
                className={`${c.input} p-2 rounded`}
              />
            );

            return (
              <>
                {before.map(renderInput)}

                <select
                  name="comuna_id"
                  value={formData.comuna_id ?? ""}
                  onChange={handleChange}
                  className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} p-2 rounded`}
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
            className={`${c.input} col-span-full p-2 rounded h-24 resize-none`}
          />

          {/* ✅ Un solo botón Guardar (contrato + jugador) */}
          <div className="col-span-full flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`${
                isSubmitting ? "opacity-60 cursor-not-allowed" : ""
              } bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700`}
            >
              {isSubmitting ? "Guardando… (generando contrato)" : "Guardar"}
            </button>
          </div>

          {isSubmitting && (
            <div className="col-span-full text-xs opacity-80">
              Procesando contrato y guardando jugador… no cierres esta pestaña 😄
            </div>
          )}
        </form>

        {mensaje && <p className="text-green-500 mt-4 text-center">{mensaje}</p>}
      </div>

      {/* ✅ Modal "jugador creado" */}
      <Modal
        open={createdOpen}
        onClose={() => setCreatedOpen(false)}
        title="✅ Jugador creado"
        darkMode={darkMode}
      >
        <div>
          <div>
            <b>Nombre:</b> {createdInfo.nombre}
          </div>
          {createdInfo.id != null && (
            <div>
              <b>ID:</b> {createdInfo.id}
            </div>
          )}

          <div className="mt-2 opacity-80">
            Contrato generado y almacenado en la base de datos.
          </div>

          {createdInfo.apoderadoCredencial && (
            <div className="mt-2 text-xs opacity-90">
              ✅ Apoderado habilitado para portal: credencial temporal creada.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
