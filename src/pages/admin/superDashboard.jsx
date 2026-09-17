import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Edit3,
  LogOut,
  Mail,
  MapPin,
  MapPinned,
  Moon,
  Plus,
  Power,
  PowerOff,
  Sun,
  Tags,
  Trash2,
  WalletCards,
} from "lucide-react";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";
import { logoutAdmin } from "../../services/auth";
import { useTheme } from "../../context/ThemeContext";

const academiasPath = "/academias";
const deportesPath = "/deportes";
const tiposPagoPath = "/tipo-pago/catalogo";
const regionesPath = "/regiones";
const ciudadesPath = "/ciudades";
const comunasPath = "/comunas";
const ciudadComunaPaths = ["/ciudad-comuna", "/ciudad_comuna"];

const MAX_SUCURSALES = 50;
const MAX_CATEGORIAS = 50;
const MAX_TIPOS_PAGO = 50;
const MAX_NOMBRE_ACADEMIA = 120;
const MAX_NOMBRE_SUCURSAL = 100;
const MAX_NOMBRE_CATEGORIA = 50;

const FORM_STEPS = [
  {
    id: 1,
    title: "Antecedentes",
    description: "Datos principales",
    icon: Building2,
  },
  {
    id: 2,
    title: "Sucursales",
    description: "Sedes",
    icon: MapPin,
  },
  {
    id: 3,
    title: "Categorías",
    description: "Divisiones formativas",
    icon: Tags,
  },
  {
    id: 4,
    title: "Tipos de pago",
    description: "Conceptos y tarifas",
    icon: WalletCards,
  },
];

function pickList(payload, keys = []) {
  if (!payload) return [];

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;

  return [];
}

function pickAcademias(payload) {
  return pickList(payload, ["academias"]);
}

function pickDeportes(payload) {
  return pickList(payload, ["deportes"]);
}

function normalizeCatalogItem(item) {
  const id = Number(item?.id ?? 0);
  const nombre = normalizeText(item?.nombre ?? "");

  if (!Number.isInteger(id) || id <= 0 || !nombre) return null;

  return {
    ...item,
    id,
    nombre,
  };
}

function normalizeRegion(item) {
  const normalized = normalizeCatalogItem(item);
  if (!normalized) return null;

  return {
    ...normalized,
    estado_id: Number(item?.estado_id ?? 1),
  };
}

function normalizeCiudad(item) {
  const normalized = normalizeCatalogItem(item);
  if (!normalized) return null;

  const region_id = Number(item?.region_id ?? 0);

  if (!Number.isInteger(region_id) || region_id <= 0) return null;

  return {
    ...normalized,
    region_id,
    estado_id: Number(item?.estado_id ?? 1),
  };
}

function normalizeComuna(item) {
  const normalized = normalizeCatalogItem(item);
  if (!normalized) return null;

  const region_id = Number(item?.region_id ?? 0);

  if (!Number.isInteger(region_id) || region_id <= 0) return null;

  return {
    ...normalized,
    region_id,
  };
}

function normalizeCiudadComuna(item) {
  const id = Number(item?.id ?? item?.ciudad_comuna_id ?? 0);
  const ciudad_id = Number(item?.ciudad_id ?? 0);
  const comuna_id = Number(item?.comuna_id ?? 0);
  const estado_id = Number(item?.estado_id ?? 1);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(ciudad_id) ||
    ciudad_id <= 0 ||
    !Number.isInteger(comuna_id) ||
    comuna_id <= 0
  ) {
    return null;
  }

  return {
    ...item,
    id,
    ciudad_id,
    comuna_id,
    estado_id,
  };
}

async function getListWithFallback(paths, options = {}) {
  const urls = Array.from(new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean)));
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await api.get(url, options);
      return pickList(response?.data ?? response, ["regiones", "ciudades", "comunas", "ciudad_comuna", "relaciones"]);
    } catch (error) {
      lastError = error;

      const status = Number(error?.status ?? error?.response?.status ?? 0);

      if (status === 401 || status === 403) {
        throw error;
      }

      if (status === 404 || status === 405) {
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error("No fue posible cargar el catálogo solicitado.");
}

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);
  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
};

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeComparable(value) {
  return normalizeText(value).toLocaleLowerCase("es");
}

function normalizeRutAcademia(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

function calcularDvRut(rut) {
  const clean = normalizeRutAcademia(rut);
  if (!clean) return "";

  let suma = 0;
  let multiplo = 2;

  for (let i = clean.length - 1; i >= 0; i -= 1) {
    suma += Number(clean[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = 11 - (suma % 11);

  if (resto === 11) return "0";
  if (resto === 10) return "K";

  return String(resto);
}

function formatRutNumber(rut) {
  const clean = normalizeRutAcademia(rut);
  return clean ? clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

function formatRutCompleto(rut) {
  const clean = normalizeRutAcademia(rut);
  if (!clean) return "";

  return `${formatRutNumber(clean)}-${calcularDvRut(clean)}`;
}

function formatCLP(value) {
  const monto = Number(value ?? 0);

  if (!Number.isFinite(monto)) return "$0";

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(monto);
}

function normalizeTipoPagoCatalogo(item) {
  const id = Number(item?.id ?? item?.tipo_pago_id ?? 0);
  const nombre = normalizeText(item?.nombre ?? "");
  const descripcion = item?.descripcion == null ? null : normalizeText(item.descripcion);
  const estado_id = Number(item?.estado_id ?? 1);

  if (!Number.isInteger(id) || id <= 0 || !nombre) return null;

  return {
    id,
    nombre,
    descripcion,
    estado_id: Number.isInteger(estado_id) && estado_id > 0 ? estado_id : 1,
  };
}

function createEmptyForm() {
  return {
    nombre: "",
    rut_academia: "",
    deporte_id: "",

    direccion: "",
    region_id: "",
    ciudad_id: "",
    comuna_id: "",
    ciudad_comuna_id: "",
    email: "",

    estado_id: "1",

    sucursales: [],
    categorias: [],
    tipos_pago: [],
  };
}

function normalizeAcademiaForEdit(item, catalogoTiposPago = []) {
  const sucursales = (item?.sucursales ?? []).map((sucursal) => ({
    id: Number(sucursal?.id),

    nombre: normalizeText(sucursal?.nombre),
  }));

  const catalogoById = new Map(
    (catalogoTiposPago ?? [])
      .map(normalizeTipoPagoCatalogo)
      .filter(Boolean)
      .map((tipo) => [Number(tipo.id), tipo])
  );

  const categorias = (item?.categorias ?? []).map((categoria) => ({
    id: Number(categoria?.id),

    nombre: normalizeText(categoria?.nombre),
  }));

  const tipos_pago = (item?.tipos_pago ?? [])
    .map((tipo) => {
      const id = Number(tipo?.tipo_pago_id ?? tipo?.id ?? 0);

      if (!Number.isInteger(id) || id <= 0) {
        return null;
      }

      const catalogo = catalogoById.get(id);

      return {
        ...(catalogo ?? {
          id,

          nombre: normalizeText(tipo?.tipo_pago_nombre ?? tipo?.nombre ?? `Tipo de pago #${id}`),

          descripcion: tipo?.descripcion ?? null,

          estado_id: Number(tipo?.estado_id ?? 1),
        }),

        id,

        monto: tipo?.monto == null ? "" : String(tipo.monto),

        tarifa_id: tipo?.tarifa_id == null ? null : Number(tipo.tarifa_id),
      };
    })
    .filter(Boolean);

  return {
    nombre: String(item?.nombre ?? ""),

    rut_academia: String(item?.rut_academia ?? ""),

    deporte_id: String(item?.deporte_id ?? ""),

    direccion: String(item?.direccion ?? ""),

    region_id: String(item?.region_id ?? ""),

    ciudad_id: String(item?.ciudad_id ?? ""),

    comuna_id: String(item?.comuna_id ?? ""),

    ciudad_comuna_id: String(item?.ciudad_comuna_id ?? ""),

    email: String(item?.email ?? ""),

    estado_id: String(item?.estado_id ?? 1),

    sucursales,

    categorias,

    tipos_pago,
  };
}

const Modal = ({ open, onClose, title, subtitle, darkMode, children }) => {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-2 sm:px-4 py-3 sm:py-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div
        className={[
          "relative z-10 w-full max-w-6xl rounded-2xl shadow-2xl border",
          "max-h-[94vh] flex flex-col overflow-hidden",
          darkMode ? "bg-ra-marron/95 border-white/10 text-white" : "bg-ra-cream border-ra-marron/15 text-ra-marron",
        ].join(" ")}
      >
        <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tightish">{title}</h2>

              {subtitle ? (
                <p
                  className={
                    darkMode ? "text-white/70 text-xs sm:text-sm mt-1" : "text-ra-marron/70 text-xs sm:text-sm mt-1"
                  }
                >
                  {subtitle}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={[
                "rounded-xl px-3 py-2 border transition shrink-0",
                darkMode
                  ? "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                  : "bg-white hover:bg-ra-cream border-ra-marron/15 text-ra-marron",
              ].join(" ")}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6">{children}</div>
      </div>
    </div>
  );
};

export default function SuperDashboard() {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();

  const [academias, setAcademias] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error");

  const [deportes, setDeportes] = useState([]);
  const [deportesReady, setDeportesReady] = useState(false);

  const [catalogoTiposPago, setCatalogoTiposPago] = useState([]);
  const [tiposPagoReady, setTiposPagoReady] = useState(false);

  const [regiones, setRegiones] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [comunas, setComunas] = useState([]);
  const [ciudadComuna, setCiudadComuna] = useState([]);
  const [territorioReady, setTerritorioReady] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [formStep, setFormStep] = useState(1);
  const [editingAcademiaId, setEditingAcademiaId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [actionBusyId, setActionBusyId] = useState(null);

  /*
   * Inputs independientes de alta.
   * Se limpian después de agregar cada registro.
   */
  const [sucursalDraft, setSucursalDraft] = useState("");

  const [categoriaDraft, setCategoriaDraft] = useState("");

  const [form, setForm] = useState(createEmptyForm);

  /* =========================================================
     AUTH
  ========================================================= */

  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);

      if (rol !== 3) {
        navigate("/admin", { replace: true });
        return;
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* =========================================================
     CARGA GENERAL
  ========================================================= */

  const loadAcademias = useCallback(
    async (signal) => {
      setLoading(true);

      try {
        const res = await api.get(academiasPath, {
          signal,
          headers: { "Cache-Control": "no-cache" },
        });

        setAcademias(pickAcademias(res?.data ?? {}));
      } catch (err) {
        if (signal?.aborted) return;

        const status = Number(err?.status ?? err?.response?.status ?? 0);
        const message =
          err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error cargando academias";

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
        } else if (status === 403) {
          setMsgType("error");
          setMsg("Acceso denegado: esta operación requiere rol Superadmin.");
        } else {
          setMsgType("error");
          setMsg(String(message));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [navigate]
  );

  const loadTiposPago = useCallback(
    async (signal) => {
      setTiposPagoReady(false);

      try {
        const res = await api.get(tiposPagoPath, {
          signal,
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        const raw = pickList(res?.data ?? {}, ["tipos_pago", "tipo_pago"]);

        const normalized = (raw ?? [])
          .map(normalizeTipoPagoCatalogo)
          .filter(Boolean)
          .filter((item) => Number(item.estado_id) === 1)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        setCatalogoTiposPago(normalized);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }

        setCatalogoTiposPago([]);

        const status = Number(err?.status ?? err?.response?.status ?? 0);

        if (status === 401) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        const message =
          err?.data?.message ??
          err?.response?.data?.message ??
          err?.message ??
          "Error cargando catálogo de tipos de pago";

        setMsgType("error");
        setMsg(String(message));
      } finally {
        if (!signal?.aborted) {
          setTiposPagoReady(true);
        }
      }
    },
    [navigate]
  );

  const loadTerritorio = useCallback(
    async (signal) => {
      setTerritorioReady(false);

      try {
        const options = {
          signal,
          headers: {
            "Cache-Control": "no-cache",
          },
        };

        const [regionesRaw, ciudadesRaw, comunasRaw, relacionesRaw] = await Promise.all([
          getListWithFallback([regionesPath], options),
          getListWithFallback([ciudadesPath], options),
          getListWithFallback([comunasPath], options),
          getListWithFallback(ciudadComunaPaths, options),
        ]);

        const regionesNormalizadas = (regionesRaw ?? [])
          .map(normalizeRegion)
          .filter(Boolean)
          .filter((item) => Number(item.estado_id) === 1)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        const ciudadesNormalizadas = (ciudadesRaw ?? [])
          .map(normalizeCiudad)
          .filter(Boolean)
          .filter((item) => Number(item.estado_id) === 1)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        const comunasNormalizadas = (comunasRaw ?? [])
          .map(normalizeComuna)
          .filter(Boolean)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        const relacionesNormalizadas = (relacionesRaw ?? [])
          .map(normalizeCiudadComuna)
          .filter(Boolean)
          .filter((item) => Number(item.estado_id) === 1);

        setRegiones(regionesNormalizadas);
        setCiudades(ciudadesNormalizadas);
        setComunas(comunasNormalizadas);
        setCiudadComuna(relacionesNormalizadas);
      } catch (err) {
        if (signal?.aborted) return;

        setRegiones([]);
        setCiudades([]);
        setComunas([]);
        setCiudadComuna([]);

        const status = Number(err?.status ?? err?.response?.status ?? 0);

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        setMsgType("error");
        setMsg(
          err?.data?.message ??
            err?.response?.data?.message ??
            err?.message ??
            "No fue posible cargar región, ciudad y comuna."
        );
      } finally {
        if (!signal?.aborted) {
          setTerritorioReady(true);
        }
      }
    },
    [navigate]
  );

  const loadDeportes = useCallback(async (signal) => {
    setDeportesReady(false);

    try {
      const res = await api.get(deportesPath, {
        signal,
        headers: { "Cache-Control": "no-cache" },
      });

      const raw = pickDeportes(res?.data ?? {});

      const normalized = (raw || [])
        .map((item) => ({
          id: Number(item?.id ?? item?.deporte_id ?? 0),
          nombre: normalizeText(item?.nombre ?? item?.name ?? ""),
        }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.nombre);

      setDeportes(normalized);
    } catch {
      setDeportes([]);
    } finally {
      setDeportesReady(true);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();

    loadAcademias(ctrl.signal);
    loadDeportes(ctrl.signal);
    loadTiposPago(ctrl.signal);
    loadTerritorio(ctrl.signal);

    return () => ctrl.abort();
  }, [loadAcademias, loadDeportes, loadTiposPago, loadTerritorio]);

  /* =========================================================
     FILTRADO
  ========================================================= */

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    if (!needle) return academias;

    const numericNeedle = needle.replace(/\D/g, "");

    return academias.filter((academia) => {
      const nombre = String(academia?.nombre ?? "").toLowerCase();
      const deporte = String(academia?.deporte_nombre ?? "").toLowerCase();
      const estado = String(academia?.estado_nombre ?? "").toLowerCase();
      const rut = String(academia?.rut_academia ?? "");

      return (
        nombre.includes(needle) ||
        deporte.includes(needle) ||
        estado.includes(needle) ||
        (numericNeedle && rut.includes(numericNeedle))
      );
    });
  }, [academias, q]);

  /* =========================================================
     SELECCIÓN DE ACADEMIA
  ========================================================= */

  const clearSelectedAcademiaIfNeeded = (academiaId) => {
    try {
      const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
      if (!raw) return;

      const selected = JSON.parse(raw);

      if (Number(selected?.id) === Number(academiaId)) {
        localStorage.removeItem(ACADEMIA_STORAGE_KEY);
        window.dispatchEvent(new Event("weli:selectedAcademiaChanged"));
      }
    } catch {}
  };

  const enterAcademia = (academia) => {
    const id = Number(academia?.id ?? 0);
    const estadoId = Number(academia?.estado_id ?? 0);

    if (!Number.isInteger(id) || id <= 0) return;

    if (estadoId !== 1) {
      setMsgType("error");
      setMsg("La academia se encuentra desactivada. Debes reactivarla antes de ingresar.");
      return;
    }

    const snapshot = {
      id,
      nombre: academia?.nombre ?? null,
      rut_academia: academia?.rut_academia ?? null,
      deporte_id: academia?.deporte_id ?? null,
      deporte_nombre: academia?.deporte_nombre ?? null,
      direccion: academia?.direccion ?? null,
      ciudad_comuna_id: academia?.ciudad_comuna_id ?? null,
      ciudad_id: academia?.ciudad_id ?? null,
      ciudad_nombre: academia?.ciudad_nombre ?? null,
      comuna_id: academia?.comuna_id ?? null,
      comuna_nombre: academia?.comuna_nombre ?? null,
      region_id: academia?.region_id ?? null,
      region_nombre: academia?.region_nombre ?? null,
      email: academia?.email ?? null,
      estado_id: academia?.estado_id ?? null,
      estado_nombre: academia?.estado_nombre ?? null,
      ts: Date.now(),
    };

    try {
      localStorage.setItem(ACADEMIA_STORAGE_KEY, JSON.stringify(snapshot));
      window.dispatchEvent(new Event("weli:selectedAcademiaChanged"));
    } catch {}

    window.location.assign("/super-dashboard/admin/dashboard");
  };

  /* =========================================================
     LOGOUT
  ========================================================= */

  const handleCerrarSesion = useCallback(async () => {
    try {
      await logoutAdmin();
    } finally {
      window.location.replace("/");
    }
  }, []);

  /* =========================================================
     MODAL CREATE / EDIT
  ========================================================= */

  const resetFormUI = () => {
    setFormStep(1);
    setSucursalDraft("");
    setCategoriaDraft("");
  };

  const openCreateModal = () => {
    setMsg("");
    setMsgType("error");
    setEditingAcademiaId(null);
    setFormMode("create");
    setForm(createEmptyForm());
    resetFormUI();
    setOpenForm(true);
  };

  const openEditModal = async (academia) => {
    const id = Number(academia?.id ?? 0);

    if (!Number.isInteger(id) || id <= 0) return;

    setMsg("");
    setMsgType("error");
    setLoadingEdit(true);
    setEditingAcademiaId(id);

    try {
      const academiaRes = await api.get(`${academiasPath}/${id}`, {
        headers: { "Cache-Control": "no-cache" },
      });

      const item = academiaRes?.data?.item ?? academiaRes?.data?.academia ?? academiaRes?.data;

      if (!item?.id) {
        throw new Error("No fue posible recuperar los datos de la academia.");
      }

      setForm(normalizeAcademiaForEdit(item, catalogoTiposPago));
      setFormMode("edit");
      resetFormUI();
      setOpenForm(true);
    } catch (err) {
      const status = Number(err?.status ?? err?.response?.status ?? 0);
      const message = err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error cargando academia";

      if (status === 401) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }

      setMsgType("error");
      setMsg(String(message));
    } finally {
      setLoadingEdit(false);
    }
  };

  const closeFormModal = () => {
    if (saving) return;

    setOpenForm(false);
    setEditingAcademiaId(null);
    setFormMode("create");
    setForm(createEmptyForm());
    resetFormUI();
    setMsg("");
  };

  /* =========================================================
     SUCURSALES
  ========================================================= */

  const addSucursal = () => {
    setMsg("");
    setMsgType("error");

    const nombre = normalizeText(sucursalDraft);

    if (nombre.length < 2) {
      setMsg("Ingresa un nombre de sucursal de al menos 2 caracteres.");
      return;
    }

    if (nombre.length > MAX_NOMBRE_SUCURSAL) {
      setMsg(`El nombre de la sucursal no puede superar los ${MAX_NOMBRE_SUCURSAL} caracteres.`);
      return;
    }

    if (form.sucursales.length >= MAX_SUCURSALES) {
      setMsg(`No puedes registrar más de ${MAX_SUCURSALES} sucursales.`);
      return;
    }

    const exists = form.sucursales.some(
      (sucursal) => normalizeComparable(sucursal.nombre) === normalizeComparable(nombre)
    );

    if (exists) {
      setMsg("Ya existe una sucursal con ese nombre.");
      return;
    }

    setForm((current) => ({
      ...current,
      sucursales: [
        ...current.sucursales,
        {
          nombre,
        },
      ],
    }));

    /*
     * El alta se reinicia inmediatamente.
     */
    setSucursalDraft("");
  };

  const updateSucursal = (index, value) => {
    setForm((current) => ({
      ...current,
      sucursales: current.sucursales.map((sucursal, i) =>
        i === index
          ? {
              ...sucursal,
              nombre: value,
            }
          : sucursal
      ),
    }));
  };

  const removeSucursal = (index) => {
    setForm((current) => ({
      ...current,

      sucursales: current.sucursales.filter((_, i) => i !== index),
    }));
  };

  /* =========================================================
     CATEGORÍAS
  ========================================================= */

  const addCategoria = () => {
    setMsg("");
    setMsgType("error");

    const nombre = normalizeText(categoriaDraft);

    if (!nombre) {
      setMsg("Ingresa un nombre de categoría.");
      return;
    }

    if (nombre.length > MAX_NOMBRE_CATEGORIA) {
      setMsg(`El nombre de la categoría no puede superar los ${MAX_NOMBRE_CATEGORIA} caracteres.`);
      return;
    }

    if (form.categorias.length >= MAX_CATEGORIAS) {
      setMsg(`No puedes registrar más de ${MAX_CATEGORIAS} categorías.`);
      return;
    }

    const exists = form.categorias.some(
      (categoria) => normalizeComparable(categoria.nombre) === normalizeComparable(nombre)
    );

    if (exists) {
      setMsg("Ya existe una categoría con ese nombre.");
      return;
    }

    setForm((current) => ({
      ...current,
      categorias: [
        ...current.categorias,
        {
          nombre,
        },
      ],
    }));

    setCategoriaDraft("");
  };

  const updateCategoria = (index, value) => {
    setForm((current) => ({
      ...current,
      categorias: current.categorias.map((categoria, i) =>
        i === index
          ? {
              ...categoria,
              nombre: value,
            }
          : categoria
      ),
    }));
  };

  const removeCategoria = (index) => {
    setForm((current) => ({
      ...current,
      categorias: current.categorias.filter((_, i) => i !== index),
    }));
  };

  /* =========================================================
     TIPOS DE PAGO
  ========================================================= */

  const toggleTipoPago = (tipoPagoId) => {
    const id = Number(tipoPagoId);

    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    setForm((current) => {
      const selected = current.tipos_pago.some((tipo) => Number(tipo.id) === id);

      if (selected) {
        return {
          ...current,

          tipos_pago: current.tipos_pago.filter((tipo) => Number(tipo.id) !== id),
        };
      }

      if (current.tipos_pago.length >= MAX_TIPOS_PAGO) {
        setMsgType("error");

        setMsg(`No puedes habilitar más de ${MAX_TIPOS_PAGO} tipos de pago.`);

        return current;
      }

      const tipoCatalogo = catalogoTiposPago.find((tipo) => Number(tipo.id) === id);

      if (!tipoCatalogo) {
        setMsgType("error");

        setMsg("El tipo de pago seleccionado no existe en el catálogo global.");

        return current;
      }

      return {
        ...current,

        tipos_pago: [
          ...current.tipos_pago,

          {
            ...tipoCatalogo,
            monto: "",
          },
        ].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      };
    });
  };

  const updateTipoPagoMonto = (tipoPagoId, value) => {
    const id = Number(tipoPagoId);

    setForm((current) => ({
      ...current,

      tipos_pago: current.tipos_pago.map((tipo) =>
        Number(tipo.id) === id
          ? {
              ...tipo,
              monto: value,
            }
          : tipo
      ),
    }));
  };

  const ciudadesDisponibles = useMemo(() => {
    const regionId = Number(form.region_id);

    if (!Number.isInteger(regionId) || regionId <= 0) {
      return [];
    }

    return ciudades.filter((item) => Number(item.region_id) === regionId);
  }, [ciudades, form.region_id]);

  const comunasDisponibles = useMemo(() => {
    const ciudadId = Number(form.ciudad_id);

    if (!Number.isInteger(ciudadId) || ciudadId <= 0) {
      return [];
    }

    const map = new Map();

    ciudadComuna
      .filter((item) => Number(item.ciudad_id) === ciudadId && Number(item.estado_id) === 1)
      .forEach((item) => {
        const comunaId = Number(item.comuna_id);

        if (!Number.isInteger(comunaId) || comunaId <= 0) {
          return;
        }

        map.set(comunaId, {
          id: comunaId,
          nombre: String(item.comuna_nombre ?? "").trim() || `Comuna #${comunaId}`,
        });
      });

    return Array.from(map.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", {
        sensitivity: "base",
      })
    );
  }, [ciudadComuna, form.ciudad_id]);

  const resolveCiudadComunaId = useCallback(
    (ciudadIdRaw, comunaIdRaw) => {
      const ciudadId = Number(ciudadIdRaw);
      const comunaId = Number(comunaIdRaw);

      if (!Number.isInteger(ciudadId) || ciudadId <= 0 || !Number.isInteger(comunaId) || comunaId <= 0) {
        return "";
      }

      const relation = ciudadComuna.find(
        (item) => Number(item.ciudad_id) === ciudadId && Number(item.comuna_id) === comunaId
      );

      return relation ? String(relation.id) : "";
    },
    [ciudadComuna]
  );

  /* =========================================================
     VALIDACIONES POR PASO
  ========================================================= */

  const validateAcademiaStep = () => {
    const nombre = normalizeText(form.nombre);
    const rutClean = normalizeRutAcademia(form.rut_academia);
    const rutAcademia = Number(rutClean);
    const deporteId = Number(form.deporte_id);
    const regionId = Number(form.region_id);
    const ciudadId = Number(form.ciudad_id);
    const comunaId = Number(form.comuna_id);
    const ciudadComunaId = Number(form.ciudad_comuna_id);
    const direccion = normalizeText(form.direccion);
    const email = normalizeText(form.email).toLowerCase();
    const estadoId = Number(form.estado_id);

    if (nombre.length < 2) {
      throw new Error("El nombre de la academia debe tener al menos 2 caracteres.");
    }

    if (nombre.length > MAX_NOMBRE_ACADEMIA) {
      throw new Error(`El nombre de la academia no puede superar los ${MAX_NOMBRE_ACADEMIA} caracteres.`);
    }

    if (!rutClean || !Number.isInteger(rutAcademia) || rutAcademia <= 0 || rutClean.length > 8) {
      throw new Error("Debes ingresar un RUT de academia válido, sin dígito verificador.");
    }

    if (!Number.isInteger(deporteId) || deporteId <= 0) {
      throw new Error("Debes seleccionar un deporte válido.");
    }

    if (direccion.length < 3 || direccion.length > 180) {
      throw new Error("Debes ingresar una dirección válida para la academia.");
    }

    if (!Number.isInteger(regionId) || regionId <= 0) {
      throw new Error("Debes seleccionar una región.");
    }

    if (!Number.isInteger(ciudadId) || ciudadId <= 0) {
      throw new Error("Debes seleccionar una ciudad.");
    }

    if (!Number.isInteger(comunaId) || comunaId <= 0) {
      throw new Error("Debes seleccionar una comuna.");
    }

    const expectedCiudadComunaId = Number(resolveCiudadComunaId(ciudadId, comunaId));

    if (!Number.isInteger(ciudadComunaId) || ciudadComunaId <= 0 || ciudadComunaId !== expectedCiudadComunaId) {
      throw new Error("La combinación de ciudad y comuna seleccionada no es válida.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      throw new Error("Debes ingresar un correo institucional válido.");
    }

    if (![1, 2].includes(estadoId)) {
      throw new Error("Debes indicar un estado válido.");
    }

    return true;
  };

  const validateSucursalesStep = () => {
    /*
     * El estado inicial es 0, pero para avanzar exigimos al menos una.
     */
    if (!form.sucursales.length) {
      throw new Error("Debes agregar al menos una sucursal antes de continuar.");
    }

    if (form.sucursales.length > MAX_SUCURSALES) {
      throw new Error(`No puedes registrar más de ${MAX_SUCURSALES} sucursales.`);
    }

    const nombres = form.sucursales.map((sucursal) => normalizeText(sucursal.nombre));

    if (nombres.some((nombre) => nombre.length < 2)) {
      throw new Error("Todas las sucursales deben tener un nombre de al menos 2 caracteres.");
    }

    if (nombres.some((nombre) => nombre.length > MAX_NOMBRE_SUCURSAL)) {
      throw new Error(`El nombre de una sucursal no puede superar los ${MAX_NOMBRE_SUCURSAL} caracteres.`);
    }

    const comparables = nombres.map(normalizeComparable);

    if (new Set(comparables).size !== comparables.length) {
      throw new Error("No puedes registrar sucursales duplicadas.");
    }

    return true;
  };

  const validateCategoriasStep = () => {
    if (!form.categorias.length) {
      throw new Error("Debes agregar al menos una categoría antes de continuar.");
    }

    if (form.categorias.length > MAX_CATEGORIAS) {
      throw new Error(`No puedes registrar más de ${MAX_CATEGORIAS} categorías.`);
    }

    const nombres = form.categorias.map((categoria) => normalizeText(categoria.nombre));

    if (nombres.some((nombre) => !nombre)) {
      throw new Error("Todas las categorías deben tener un nombre.");
    }

    if (nombres.some((nombre) => nombre.length > MAX_NOMBRE_CATEGORIA)) {
      throw new Error(`El nombre de una categoría no puede superar los ${MAX_NOMBRE_CATEGORIA} caracteres.`);
    }

    const comparables = nombres.map(normalizeComparable);

    if (new Set(comparables).size !== comparables.length) {
      throw new Error("No puedes registrar categorías duplicadas.");
    }

    return true;
  };

  const validateTiposPagoStep = () => {
    if (!tiposPagoReady) {
      throw new Error("El catálogo global de tipos de pago todavía no está disponible.");
    }

    if (!catalogoTiposPago.length) {
      throw new Error("No existen tipos de pago disponibles en el catálogo global.");
    }

    if (!form.tipos_pago.length) {
      throw new Error("Debes habilitar al menos un tipo de pago para esta academia.");
    }

    if (form.tipos_pago.length > MAX_TIPOS_PAGO) {
      throw new Error(`No puedes habilitar más de ${MAX_TIPOS_PAGO} tipos de pago.`);
    }

    const ids = form.tipos_pago.map((tipo) => Number(tipo.id));

    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error("Existe un tipo de pago inválido.");
    }

    if (new Set(ids).size !== ids.length) {
      throw new Error("No puedes habilitar tipos de pago duplicados.");
    }

    const catalogIds = new Set(catalogoTiposPago.map((tipo) => Number(tipo.id)));

    if (ids.some((id) => !catalogIds.has(id))) {
      throw new Error("Uno o más tipos de pago ya no existen en el catálogo global.");
    }

    for (const tipo of form.tipos_pago) {
      const rawMonto = String(tipo?.monto ?? "").trim();

      if (!rawMonto) {
        throw new Error(`Debes ingresar la tarifa inicial para "${tipo?.nombre ?? "el tipo de pago seleccionado"}".`);
      }

      const monto = Number(rawMonto);

      if (!Number.isFinite(monto) || monto < 0 || monto > 999999999.99) {
        throw new Error(`La tarifa de "${tipo?.nombre ?? "un tipo de pago"}" no es válida.`);
      }
    }

    return true;
  };

  /* =========================================================
     WIZARD
  ========================================================= */

  const validateStep = (step) => {
    if (step === 1) return validateAcademiaStep();
    if (step === 2) return validateSucursalesStep();
    if (step === 3) return validateCategoriasStep();
    if (step === 4) return validateTiposPagoStep();

    return false;
  };

  const goNextStep = () => {
    setMsg("");
    setMsgType("error");

    try {
      validateStep(formStep);

      setFormStep((current) => Math.min(current + 1, FORM_STEPS.length));
    } catch (error) {
      setMsg(String(error?.message ?? error));
    }
  };

  const goPreviousStep = () => {
    setMsg("");
    setMsgType("error");

    setFormStep((current) => Math.max(current - 1, 1));
  };

  const goToStep = (targetStep) => {
    if (targetStep === formStep || targetStep < 1 || targetStep > FORM_STEPS.length) {
      return;
    }

    if (targetStep < formStep) {
      setMsg("");
      setFormStep(targetStep);
      return;
    }

    setMsg("");
    setMsgType("error");

    try {
      for (let step = formStep; step < targetStep; step += 1) {
        validateStep(step);
      }

      setFormStep(targetStep);
    } catch (error) {
      setMsg(String(error?.message ?? error));
    }
  };

  const isStepCompleted = (step) => {
    try {
      validateStep(step);
      return true;
    } catch {
      return false;
    }
  };

  /* =========================================================
     PAYLOAD
  ========================================================= */

  const buildPayload = () => {
    validateAcademiaStep();
    validateSucursalesStep();
    validateCategoriasStep();
    validateTiposPagoStep();

    const nombre = normalizeText(form.nombre);

    const rut_academia = Number(normalizeRutAcademia(form.rut_academia));

    const deporte_id = Number(form.deporte_id);

    const direccion = normalizeText(form.direccion);

    const ciudad_comuna_id = Number(form.ciudad_comuna_id);

    const email = normalizeText(form.email).toLowerCase();

    const estado_id = Number(form.estado_id);

    const tipos_pago = form.tipos_pago.map((tipo) => ({
      tipo_pago_id: Number(tipo.id),

      monto: Number(tipo.monto),

      estado_id: 1,
    }));

    if (formMode === "create") {
      return {
        nombre,
        rut_academia,
        deporte_id,
        direccion,
        ciudad_comuna_id,
        email,
        estado_id,

        sucursales: form.sucursales.map((sucursal) => normalizeText(sucursal.nombre)),

        categorias: form.categorias.map((categoria) => normalizeText(categoria.nombre)),

        tipos_pago,
      };
    }

    return {
      nombre,
      rut_academia,
      deporte_id,
      direccion,
      ciudad_comuna_id,
      email,
      estado_id,

      sucursales: form.sucursales.map((sucursal) => ({
        ...(Number(sucursal.id) > 0
          ? {
              id: Number(sucursal.id),
            }
          : {}),

        nombre: normalizeText(sucursal.nombre),
      })),

      categorias: form.categorias.map((categoria) => ({
        ...(Number(categoria.id) > 0
          ? {
              id: Number(categoria.id),
            }
          : {}),

        nombre: normalizeText(categoria.nombre),
      })),

      tipos_pago,
    };
  };

  /* =========================================================
     GUARDAR
  ========================================================= */

  const submitForm = async (event) => {
    event.preventDefault();

    setMsg("");
    setMsgType("error");

    if (formStep !== FORM_STEPS.length) {
      goNextStep();
      return;
    }

    let payload;

    try {
      payload = buildPayload();
    } catch (error) {
      setMsg(String(error?.message ?? error));
      return;
    }

    setSaving(true);

    try {
      if (formMode === "edit") {
        if (!Number.isInteger(Number(editingAcademiaId)) || Number(editingAcademiaId) <= 0) {
          throw new Error("No fue posible identificar la academia a modificar.");
        }

        await api.put(`${academiasPath}/${editingAcademiaId}`, payload);

        if (Number(payload.estado_id) === 2) {
          clearSelectedAcademiaIfNeeded(editingAcademiaId);
        }

        setMsgType("success");
        setMsg("Academia actualizada correctamente.");
      } else {
        await api.post(academiasPath, payload);

        setMsgType("success");
        setMsg("Academia creada correctamente.");
      }

      setOpenForm(false);
      setEditingAcademiaId(null);
      setFormMode("create");
      setForm(createEmptyForm());
      resetFormUI();

      const ctrl = new AbortController();
      await loadAcademias(ctrl.signal);
    } catch (err) {
      const status = Number(err?.status ?? err?.response?.status ?? 0);

      const message = err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error guardando academia";

      if (status === 401) {
        clearToken();
        navigate("/login", {
          replace: true,
        });
        return;
      }

      setMsgType("error");
      setMsg(String(message));
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     ACTIVAR / DESACTIVAR
  ========================================================= */

  const toggleAcademiaEstado = async (academia) => {
    const id = Number(academia?.id ?? 0);
    const actual = Number(academia?.estado_id ?? 0);

    if (!Number.isInteger(id) || id <= 0) return;

    const nuevoEstado = actual === 1 ? 2 : 1;
    const accion = nuevoEstado === 1 ? "reactivar" : "desactivar";

    const confirmed = window.confirm(`¿Deseas ${accion} la academia "${academia?.nombre ?? `#${id}`}"?`);

    if (!confirmed) return;

    setActionBusyId(id);
    setMsg("");

    try {
      await api.put(`${academiasPath}/${id}`, {
        estado_id: nuevoEstado,
      });

      if (nuevoEstado === 2) {
        clearSelectedAcademiaIfNeeded(id);
      }

      setMsgType("success");
      setMsg(nuevoEstado === 1 ? "Academia reactivada correctamente." : "Academia desactivada correctamente.");

      const ctrl = new AbortController();
      await loadAcademias(ctrl.signal);
    } catch (err) {
      const status = Number(err?.status ?? err?.response?.status ?? 0);

      const message =
        err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error cambiando estado de la academia";

      if (status === 401) {
        clearToken();
        navigate("/login", {
          replace: true,
        });
        return;
      }

      setMsgType("error");
      setMsg(String(message));
    } finally {
      setActionBusyId(null);
    }
  };

  /* =========================================================
     ELIMINAR
  ========================================================= */

  const deleteAcademia = async (academia) => {
    const id = Number(academia?.id ?? 0);
    const nombre = String(academia?.nombre ?? `Academia #${id}`);

    if (!Number.isInteger(id) || id <= 0) return;

    const confirmation = window.prompt(
      `ELIMINACIÓN DEFINITIVA\n\nEsta acción eliminará la academia "${nombre}" y su configuración comercial cuando no existan dependencias que lo impidan.\n\nEscribe ELIMINAR para confirmar:`
    );

    if (confirmation !== "ELIMINAR") {
      if (confirmation !== null) {
        setMsgType("error");
        setMsg("Eliminación cancelada: la confirmación escrita no coincide.");
      }

      return;
    }

    setActionBusyId(id);
    setMsg("");

    try {
      await api.delete(`${academiasPath}/${id}`);

      clearSelectedAcademiaIfNeeded(id);

      setMsgType("success");
      setMsg(`La academia "${nombre}" fue eliminada correctamente.`);

      const ctrl = new AbortController();
      await loadAcademias(ctrl.signal);
    } catch (err) {
      const status = Number(err?.status ?? err?.response?.status ?? 0);

      const message = err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error eliminando academia";

      if (status === 401) {
        clearToken();
        navigate("/login", {
          replace: true,
        });
        return;
      }

      setMsgType("error");
      setMsg(String(message));
    } finally {
      setActionBusyId(null);
    }
  };

  /* =========================================================
     DERIVADOS
  ========================================================= */

  const rutPreview = useMemo(
    () => (form.rut_academia ? formatRutCompleto(form.rut_academia) : ""),
    [form.rut_academia]
  );

  const stepCompleted = FORM_STEPS.reduce((acc, step) => {
    const previousCompleted = step.id === 1 ? true : acc[step.id - 1];

    acc[step.id] = previousCompleted && isStepCompleted(step.id);

    return acc;
  }, {});

  /* =========================================================
     ESTILOS
  ========================================================= */

  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

  const buttonIcon = darkMode ? "hover:bg-white/10" : "hover:bg-white/30";

  const searchInput = darkMode
    ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
    : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta";

  const card = darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15";

  const badge = darkMode
    ? "bg-white/10 border-white/10 text-white/80"
    : "bg-white/60 border-ra-marron/10 text-ra-marron/80";

  const selectDark = darkMode
    ? "w-full rounded-xl px-4 py-3 bg-[#111827] text-white border border-white/15 outline-none focus:border-white/30"
    : "w-full rounded-xl px-4 py-3 bg-white text-ra-marron border border-ra-marron/15 outline-none focus:border-ra-terracotta";

  const modalInput = darkMode
    ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
    : "bg-white border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta";

  const sectionCard = darkMode ? "bg-white/[0.06] border-white/10" : "bg-white/45 border-ra-marron/10";

  const helperText = darkMode ? "text-white/50" : "text-ra-marron/50";

  const labelText = darkMode ? "text-white/80" : "text-ra-marron/80";

  const checkboxCard = darkMode
    ? "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
    : "border-ra-marron/10 bg-white/50 hover:bg-white/80";

  const tarifaCard = darkMode ? "bg-white/[0.04] border-white/10" : "bg-ra-cream/50 border-ra-marron/10";

  const noticeBox =
    msgType === "success"
      ? darkMode
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"
      : darkMode
        ? "border-red-200/20 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-700";

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className={`${shell} min-h-screen font-sans`}>
      {/* HEADER */}

      <header className="px-4 sm:px-6 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={`text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.18em] ${
                darkMode ? "text-ra-sand/80" : "text-ra-marron/55"
              }`}
            >
              Superadministración WELI
            </div>

            <h1 className="mt-1 text-2xl sm:text-4xl font-extrabold tracking-tightish">Gestión de Academias</h1>

            <p className={`text-xs sm:text-sm mt-1.5 max-w-2xl ${headerSub}`}>
              Administra la información institucional, configuración operativa y acceso a cada academia registrada.
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              title="Cambiar tema"
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition ${buttonIcon}`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button
              type="button"
              title="Cerrar sesión"
              onClick={handleCerrarSesion}
              className={`p-2 rounded-xl transition ${buttonIcon}`}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* ACADEMIAS */}

      <main className="px-4 sm:px-6 pb-20">
        <div className={`mt-6 rounded-2xl border p-4 sm:p-5 shadow-sm ${card}`}>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <label className={`block text-xs font-extrabold uppercase tracking-[0.08em] ${labelText}`}>
                Buscar academia
              </label>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, RUT, deporte o estado…"
                className={`mt-2 w-full rounded-xl px-4 py-3 border outline-none transition ${searchInput}`}
              />
            </div>

            <div className="lg:w-auto">
              <button
                type="button"
                onClick={openCreateModal}
                className="w-full lg:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 active:scale-[0.99] transition"
              >
                <Plus size={18} />
                Nueva academia
              </button>
            </div>
          </div>

          <div className={`mt-3 text-xs ${helperText}`}>
            {filtered.length} academia{filtered.length === 1 ? "" : "s"} visible{filtered.length === 1 ? "" : "s"}.
          </div>
        </div>

        {msg && !openForm && (
          <div className={`mt-5 rounded-2xl border px-5 py-4 font-semibold ${noticeBox}`}>{msg}</div>
        )}

        {loading && <div className={`mt-10 ${headerSub}`}>Cargando academias…</div>}

        {!loading && (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((academia) => {
                const id = Number(academia?.id ?? 0);
                const nombre = academia?.nombre ?? `Academia #${id}`;
                const deporte = academia?.deporte_nombre ?? "—";
                const estado = academia?.estado_nombre ?? "—";
                const estadoId = Number(academia?.estado_id ?? 0);
                const activa = estadoId === 1;

                const busy = actionBusyId === id || (loadingEdit && editingAcademiaId === id);

                const rut = academia?.rut_academia ? formatRutCompleto(academia.rut_academia) : null;

                return (
                  <article key={String(id)} className={`${card} rounded-2xl p-5 shadow-lg border transition min-w-0`}>
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                          activa ? "bg-ra-terracotta/90" : "bg-slate-500/70"
                        }`}
                      >
                        <Building2 className="w-7 h-7 text-white" />
                      </div>

                      <span
                        className={[
                          "text-[10px] font-extrabold rounded-full border px-3 py-1",

                          activa
                            ? darkMode
                              ? "bg-emerald-500/15 border-emerald-300/20 text-emerald-200"
                              : "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : darkMode
                              ? "bg-red-500/15 border-red-300/20 text-red-200"
                              : "bg-red-50 border-red-200 text-red-700",
                        ].join(" ")}
                      >
                        {activa ? "ACTIVADA" : "DESACTIVADA"}
                      </span>
                    </div>

                    <div className="mt-4">
                      <h2
                        className={`font-extrabold text-lg leading-tight break-words ${
                          darkMode ? "text-white" : "text-ra-marron"
                        }`}
                      >
                        {nombre}
                      </h2>

                      {rut && <div className={`text-xs font-semibold mt-1 ${headerSub}`}>RUT {rut}</div>}

                      <div
                        className={`mt-3 text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border ${badge}`}
                      >
                        <span>{deporte}</span>
                        <span>•</span>
                        <span>{estado}</span>
                      </div>

                      {(academia?.direccion || academia?.comuna_nombre || academia?.ciudad_nombre) && (
                        <div className={`mt-3 flex items-start gap-2 text-xs ${headerSub}`}>
                          <MapPinned size={14} className="mt-0.5 shrink-0" />
                          <span className="leading-relaxed">
                            {[academia?.direccion, academia?.comuna_nombre, academia?.ciudad_nombre]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}

                      {academia?.email && (
                        <div className={`mt-2 flex items-center gap-2 text-xs ${headerSub}`}>
                          <Mail size={14} className="shrink-0" />
                          <span className="truncate">{academia.email}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => enterAcademia(academia)}
                        disabled={!activa || busy}
                        className="col-span-2 rounded-xl px-3 py-2.5 text-xs font-extrabold text-white bg-ra-terracotta hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {activa ? "Entrar a la academia" : "Academia desactivada"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(academia)}
                        disabled={busy}
                        className={[
                          "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 border text-xs font-bold transition disabled:opacity-50",

                          darkMode
                            ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                            : "bg-white border-ra-marron/15 hover:bg-ra-cream text-ra-marron",
                        ].join(" ")}
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleAcademiaEstado(academia)}
                        disabled={busy}
                        className={[
                          "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 border text-xs font-bold transition disabled:opacity-50",

                          activa
                            ? darkMode
                              ? "bg-amber-500/10 border-amber-300/20 text-amber-200 hover:bg-amber-500/20"
                              : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                            : darkMode
                              ? "bg-emerald-500/10 border-emerald-300/20 text-emerald-200 hover:bg-emerald-500/20"
                              : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                        ].join(" ")}
                      >
                        {activa ? <PowerOff size={14} /> : <Power size={14} />}
                        {activa ? "Desactivar" : "Reactivar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteAcademia(academia)}
                        disabled={busy}
                        className={[
                          "col-span-2 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 border text-xs font-bold transition disabled:opacity-50",

                          darkMode
                            ? "bg-red-500/10 border-red-300/20 text-red-200 hover:bg-red-500/20"
                            : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
                        ].join(" ")}
                      >
                        <Trash2 size={14} />
                        Eliminar definitivamente
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className={`mt-10 ${headerSub}`}>No hay academias que coincidan con tu búsqueda.</div>
            )}
          </>
        )}
      </main>

      {/* MODAL */}

      <Modal
        open={openForm}
        onClose={closeFormModal}
        title={formMode === "edit" ? "Editar academia" : "Nueva academia"}
        subtitle={
          formMode === "edit"
            ? "Actualiza la configuración de la academia paso a paso."
            : "Completa identificación, ubicación, sucursales, categorías y tipos de pago con sus tarifas iniciales."
        }
        darkMode={darkMode}
      >
        <form onSubmit={submitForm} className="mt-5">
          {/* INDICADOR */}

          <div className={`rounded-2xl border p-3 sm:p-4 ${sectionCard}`}>
            <div className="grid grid-cols-4">
              {FORM_STEPS.map((step, index) => {
                const Icon = step.icon;
                const completed = Boolean(stepCompleted[step.id]);
                const current = formStep === step.id;

                const previousCompleted = step.id === 1 || Boolean(stepCompleted[step.id - 1]);

                const canOpen = step.id < formStep || (step.id > formStep && previousCompleted);

                return (
                  <div key={step.id} className="relative flex items-center">
                    {index > 0 && (
                      <div
                        className={[
                          "absolute right-1/2 left-[-50%] top-5 h-0.5",
                          step.id <= formStep ? "bg-ra-terracotta" : darkMode ? "bg-white/10" : "bg-ra-marron/10",
                        ].join(" ")}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => (canOpen ? goToStep(step.id) : undefined)}
                      disabled={saving || (!canOpen && !current)}
                      className="relative z-10 w-full flex flex-col items-center text-center disabled:cursor-not-allowed"
                    >
                      <div
                        className={[
                          "w-10 h-10 rounded-full border flex items-center justify-center transition",
                          current
                            ? "bg-ra-terracotta border-ra-terracotta text-white shadow-md"
                            : completed
                              ? darkMode
                                ? "bg-emerald-500/20 border-emerald-300/30 text-emerald-200"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : darkMode
                                ? "bg-[#111827] border-white/15 text-white/40"
                                : "bg-white border-ra-marron/15 text-ra-marron/40",
                        ].join(" ")}
                      >
                        {completed && !current ? <Check size={18} /> : <Icon size={18} />}
                      </div>

                      <span
                        className={`mt-2 text-[10px] sm:text-xs font-extrabold ${
                          current ? (darkMode ? "text-white" : "text-ra-marron") : helperText
                        }`}
                      >
                        {step.id}. {step.title}
                      </span>

                      <span className={`hidden md:block mt-0.5 text-[10px] ${helperText}`}>{step.description}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PASO 1: ANTECEDENTES */}

          {formStep === 1 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                  <Building2 size={20} />
                </div>

                <div>
                  <h3 className="font-extrabold text-lg">Antecedentes de la academia</h3>

                  <p className={`text-xs mt-1 ${helperText}`}>
                    Información institucional, territorial y de contacto que identificará a la academia.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={`text-sm font-bold ${labelText}`}>Nombre</label>

                  <input
                    value={form.nombre}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        nombre: e.target.value,
                      }))
                    }
                    className={`mt-2 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                    placeholder="Ej: Academia WELI"
                    maxLength={MAX_NOMBRE_ACADEMIA}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>RUT academia</label>

                  <input
                    value={form.rut_academia}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        rut_academia: normalizeRutAcademia(e.target.value),
                      }))
                    }
                    className={`mt-2 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                    placeholder="Ej: 76123456"
                    inputMode="numeric"
                    maxLength={8}
                    disabled={saving}
                  />

                  {rutPreview && (
                    <div
                      className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${badge}`}
                    >
                      <CreditCard size={14} />
                      {rutPreview}
                    </div>
                  )}
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Correo institucional</label>

                  <div className="relative mt-2">
                    <Mail
                      size={16}
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
                        darkMode ? "text-white/40" : "text-ra-marron/45"
                      }`}
                    />

                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          email: e.target.value,
                        }))
                      }
                      className={`w-full rounded-xl pl-10 pr-4 py-3 border outline-none transition ${modalInput}`}
                      placeholder="contacto@academia.cl"
                      maxLength={160}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Deporte</label>

                  <select
                    value={form.deporte_id}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        deporte_id: e.target.value,
                      }))
                    }
                    className={`mt-2 ${selectDark}`}
                    disabled={saving || !deportesReady}
                  >
                    {!deportesReady && <option value="">Cargando deportes…</option>}

                    {deportesReady && (
                      <>
                        <option value="">Selecciona…</option>

                        {deportes
                          .slice()
                          .sort((a, b) =>
                            String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" })
                          )
                          .map((deporte) => (
                            <option key={String(deporte.id)} value={String(deporte.id)}>
                              {deporte.nombre}
                            </option>
                          ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Estado</label>

                  <select
                    value={form.estado_id}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        estado_id: e.target.value,
                      }))
                    }
                    className={`mt-2 ${selectDark}`}
                    disabled={saving}
                  >
                    <option value="1">Activado</option>
                    <option value="2">Desactivado</option>
                  </select>
                </div>

                <div className="md:col-span-2 mt-1">
                  <div
                    className={`rounded-xl border px-4 py-3 ${
                      darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/45"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <MapPinned size={18} className={darkMode ? "text-ra-sand mt-0.5" : "text-ra-terracotta mt-0.5"} />

                      <div>
                        <div className={`text-sm font-extrabold ${labelText}`}>Ubicación institucional</div>

                        <p className={`mt-1 text-xs leading-relaxed ${helperText}`}>
                          Selecciona región, ciudad y comuna. WELI guardará la relación territorial válida para
                          utilizarla posteriormente en la identificación contractual de la academia.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className={`text-sm font-bold ${labelText}`}>Dirección</label>

                  <input
                    value={form.direccion}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        direccion: e.target.value,
                      }))
                    }
                    className={`mt-2 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                    placeholder="Ej: Avenida Principal 1234"
                    maxLength={180}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Región</label>

                  <select
                    value={form.region_id}
                    onChange={(e) => {
                      const regionId = e.target.value;

                      setForm((current) => ({
                        ...current,
                        region_id: regionId,
                        ciudad_id: "",
                        comuna_id: "",
                        ciudad_comuna_id: "",
                      }));
                    }}
                    className={`mt-2 ${selectDark}`}
                    disabled={saving || !territorioReady}
                  >
                    {!territorioReady ? (
                      <option value="">Cargando regiones…</option>
                    ) : (
                      <>
                        <option value="">Selecciona…</option>

                        {regiones.map((region) => (
                          <option key={String(region.id)} value={String(region.id)}>
                            {region.nombre}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Ciudad</label>

                  <select
                    value={form.ciudad_id}
                    onChange={(e) => {
                      const ciudadId = e.target.value;

                      setForm((current) => ({
                        ...current,
                        ciudad_id: ciudadId,
                        comuna_id: "",
                        ciudad_comuna_id: "",
                      }));
                    }}
                    className={`mt-2 ${selectDark}`}
                    disabled={saving || !territorioReady || !form.region_id}
                  >
                    <option value="">{!form.region_id ? "Selecciona primero una región" : "Selecciona…"}</option>

                    {ciudadesDisponibles.map((ciudad) => (
                      <option key={String(ciudad.id)} value={String(ciudad.id)}>
                        {ciudad.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Comuna</label>

                  <select
                    value={form.comuna_id}
                    onChange={(e) => {
                      const comunaId = e.target.value;
                      const relationId = resolveCiudadComunaId(form.ciudad_id, comunaId);

                      setForm((current) => ({
                        ...current,
                        comuna_id: comunaId,
                        ciudad_comuna_id: relationId,
                      }));
                    }}
                    className={`mt-2 ${selectDark}`}
                    disabled={saving || !territorioReady || !form.ciudad_id}
                  >
                    <option value="">{!form.ciudad_id ? "Selecciona primero una ciudad" : "Selecciona…"}</option>

                    {comunasDisponibles.map((comuna) => (
                      <option key={String(comuna.id)} value={String(comuna.id)}>
                        {comuna.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`text-sm font-bold ${labelText}`}>Relación territorial</label>

                  <div
                    className={`mt-2 min-h-[50px] rounded-xl border px-4 py-3 flex items-center ${
                      form.ciudad_comuna_id
                        ? darkMode
                          ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : sectionCard
                    }`}
                  >
                    <span className="text-xs font-bold">
                      {form.ciudad_comuna_id
                        ? `Ciudad y comuna validadas · Relación #${form.ciudad_comuna_id}`
                        : "Pendiente de seleccionar ciudad y comuna."}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* PASO 2: SUCURSALES */}

          {formStep === 2 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                  <MapPin size={20} />
                </div>

                <div>
                  <h3 className="font-extrabold text-lg">Sucursales</h3>

                  <p className={`text-xs mt-1 ${helperText}`}>
                    Agrega solamente las sedes que realmente utilizará esta academia.
                  </p>
                </div>
              </div>

              {/* ALTA */}

              <div
                className={`mt-5 rounded-xl border p-3 sm:p-4 ${
                  darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/50"
                }`}
              >
                <label className={`text-xs font-semibold ${labelText}`}>Nueva sucursal</label>

                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    value={sucursalDraft}
                    onChange={(e) => setSucursalDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSucursal();
                      }
                    }}
                    className={`flex-1 rounded-xl px-4 py-2.5 border outline-none transition ${modalInput}`}
                    placeholder="Ej: Sucursal Centro"
                    maxLength={MAX_NOMBRE_SUCURSAL}
                    disabled={saving}
                  />

                  <button
                    type="button"
                    onClick={addSucursal}
                    disabled={saving || form.sucursales.length >= MAX_SUCURSALES}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white bg-ra-terracotta hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Agregar
                  </button>
                </div>

                <div className={`mt-2 text-xs ${helperText}`}>
                  {form.sucursales.length} sucursal
                  {form.sucursales.length === 1 ? "" : "es"} agregada
                  {form.sucursales.length === 1 ? "" : "s"}
                </div>
              </div>

              {/* LISTA */}

              {form.sucursales.length === 0 ? (
                <div
                  className={`mt-4 rounded-xl border border-dashed px-4 py-7 text-center ${
                    darkMode ? "border-white/15 text-white/50" : "border-ra-marron/15 text-ra-marron/50"
                  }`}
                >
                  <MapPin size={26} className="mx-auto mb-2 opacity-50" />
                  <div className="text-sm font-bold">0 sucursales</div>

                  <div className="text-xs mt-1">Agrega una sucursal para continuar.</div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.sucursales.map((sucursal, index) => (
                    <div
                      key={`sucursal-${sucursal.id ?? "new"}-${index}`}
                      className={`rounded-xl border p-3 ${
                        darkMode ? "bg-black/10 border-white/10" : "bg-white/50 border-ra-marron/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <label className={`text-[11px] font-semibold ${helperText}`}>Sucursal {index + 1}</label>

                          <input
                            value={sucursal.nombre}
                            onChange={(e) => updateSucursal(index, e.target.value)}
                            className={`mt-1 w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                            maxLength={MAX_NOMBRE_SUCURSAL}
                            disabled={saving}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeSucursal(index)}
                          disabled={saving}
                          className={[
                            "shrink-0 mt-4 rounded-lg p-2 border transition",
                            darkMode
                              ? "bg-red-500/10 border-red-300/20 text-red-200"
                              : "bg-red-50 border-red-200 text-red-700",
                          ].join(" ")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* PASO 3: CATEGORÍAS */}

          {formStep === 3 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                  <Tags size={20} />
                </div>

                <div>
                  <h3 className="font-extrabold text-lg">Categorías</h3>

                  <p className={`text-xs mt-1 ${helperText}`}>
                    Agrega las categorías que utilizará inicialmente esta academia. El administrador podrá modificarlas
                    después.
                  </p>
                </div>
              </div>

              <div
                className={`mt-5 rounded-xl border p-3 sm:p-4 ${
                  darkMode ? "border-white/10 bg-black/10" : "border-ra-marron/10 bg-white/50"
                }`}
              >
                <label className={`text-xs font-semibold ${labelText}`}>Nueva categoría</label>

                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    value={categoriaDraft}
                    onChange={(e) => setCategoriaDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategoria();
                      }
                    }}
                    className={`flex-1 rounded-xl px-4 py-2.5 border outline-none transition ${modalInput}`}
                    placeholder="Ej: Sub 10"
                    maxLength={MAX_NOMBRE_CATEGORIA}
                    disabled={saving}
                  />

                  <button
                    type="button"
                    onClick={addCategoria}
                    disabled={saving || form.categorias.length >= MAX_CATEGORIAS}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white bg-ra-terracotta hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Agregar
                  </button>
                </div>

                <div className={`mt-2 text-xs ${helperText}`}>
                  {form.categorias.length} categoría
                  {form.categorias.length === 1 ? "" : "s"} agregada
                  {form.categorias.length === 1 ? "" : "s"}
                </div>
              </div>

              {form.categorias.length === 0 ? (
                <div
                  className={`mt-4 rounded-xl border border-dashed px-4 py-7 text-center ${
                    darkMode ? "border-white/15 text-white/50" : "border-ra-marron/15 text-ra-marron/50"
                  }`}
                >
                  <Tags size={26} className="mx-auto mb-2 opacity-50" />
                  <div className="text-sm font-bold">0 categorías</div>

                  <div className="text-xs mt-1">Agrega una categoría para continuar.</div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.categorias.map((categoria, index) => (
                    <div
                      key={`categoria-${categoria.id ?? "new"}-${index}`}
                      className={`rounded-xl border p-3 ${
                        darkMode ? "bg-black/10 border-white/10" : "bg-white/50 border-ra-marron/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <label className={`text-[11px] font-semibold ${helperText}`}>Categoría {index + 1}</label>

                          <input
                            value={categoria.nombre}
                            onChange={(e) => updateCategoria(index, e.target.value)}
                            className={`mt-1 w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                            maxLength={MAX_NOMBRE_CATEGORIA}
                            disabled={saving}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeCategoria(index)}
                          disabled={saving}
                          className={[
                            "shrink-0 mt-4 rounded-lg p-2 border transition",
                            darkMode
                              ? "bg-red-500/10 border-red-300/20 text-red-200"
                              : "bg-red-50 border-red-200 text-red-700",
                          ].join(" ")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* PASO 4: TIPOS DE PAGO */}

          {formStep === 4 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                  <WalletCards size={20} />
                </div>

                <div>
                  <h3 className="font-extrabold text-lg">Tipos de pago</h3>

                  <p className={`text-xs mt-1 ${helperText}`}>
                    Selecciona desde el catálogo global los conceptos económicos que esta academia podrá utilizar.
                  </p>
                </div>
              </div>

              {!tiposPagoReady ? (
                <div className={`mt-5 rounded-xl border px-4 py-5 text-sm ${sectionCard}`}>
                  Cargando catálogo global de tipos de pago…
                </div>
              ) : catalogoTiposPago.length === 0 ? (
                <div
                  className={`mt-5 rounded-xl border border-dashed px-4 py-7 text-center ${
                    darkMode ? "border-white/15 text-white/50" : "border-ra-marron/15 text-ra-marron/50"
                  }`}
                >
                  <WalletCards size={26} className="mx-auto mb-2 opacity-50" />

                  <div className="text-sm font-bold">Catálogo sin registros</div>

                  <div className="text-xs mt-1">
                    Debes crear tipos de pago en el catálogo global antes de configurar una academia.
                  </div>
                </div>
              ) : (
                <>
                  <div className={`mt-4 text-xs ${helperText}`}>
                    {form.tipos_pago.length} de {catalogoTiposPago.length} tipo
                    {catalogoTiposPago.length === 1 ? "" : "s"} de pago habilitado
                    {form.tipos_pago.length === 1 ? "" : "s"}.
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {catalogoTiposPago.map((tipo) => {
                      const checked = form.tipos_pago.some((selected) => Number(selected.id) === Number(tipo.id));

                      return (
                        <label
                          key={tipo.id}
                          className={[
                            "rounded-xl border p-3 transition cursor-pointer",
                            checked ? "border-ra-terracotta bg-ra-terracotta/10" : checkboxCard,
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTipoPago(tipo.id)}
                              disabled={saving}
                              className="mt-1 w-4 h-4 accent-ra-terracotta"
                            />

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <WalletCards size={15} className="shrink-0" />
                                <span className="font-extrabold text-sm">{tipo.nombre}</span>
                              </div>

                              {tipo.descripcion ? (
                                <p className={`text-xs mt-1 ${helperText}`}>{tipo.descripcion}</p>
                              ) : null}

                              {checked ? (
                                <div
                                  className={`mt-3 rounded-lg border p-3 ${tarifaCard}`}
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <label className={`text-[11px] font-bold ${labelText}`}>Tarifa inicial</label>

                                  <div className="mt-1 flex items-center gap-2">
                                    <span className={`text-sm font-extrabold ${labelText}`}>$</span>

                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={
                                        form.tipos_pago.find((selected) => Number(selected.id) === Number(tipo.id))
                                          ?.monto ?? ""
                                      }
                                      onChange={(e) => updateTipoPagoMonto(tipo.id, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className={`w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                                      placeholder="Ej: 30000"
                                      disabled={saving}
                                    />
                                  </div>

                                  {String(
                                    form.tipos_pago.find((selected) => Number(selected.id) === Number(tipo.id))
                                      ?.monto ?? ""
                                  ).trim() ? (
                                    <div className={`mt-1 text-[11px] ${helperText}`}>
                                      {formatCLP(
                                        form.tipos_pago.find((selected) => Number(selected.id) === Number(tipo.id))
                                          ?.monto
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* MENSAJES */}

          {msg && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${noticeBox}`}>{msg}</div>}

          {/* NAVEGACIÓN */}

          <div
            className={[
              "mt-5 pt-4 border-t flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3",
              darkMode ? "border-white/10" : "border-ra-marron/10",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={closeFormModal}
              disabled={saving}
              className={[
                "rounded-xl px-5 py-3 border font-bold transition disabled:opacity-50",
                darkMode
                  ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                  : "bg-white/60 border-ra-marron/15 hover:bg-white/80 text-ra-marron",
              ].join(" ")}
            >
              Cancelar
            </button>

            <div className="flex-1" />

            {formStep > 1 && (
              <button
                type="button"
                onClick={goPreviousStep}
                disabled={saving}
                className={[
                  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 border font-bold transition disabled:opacity-50",
                  darkMode
                    ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                    : "bg-white border-ra-marron/15 hover:bg-ra-cream text-ra-marron",
                ].join(" ")}
              >
                <ArrowLeft size={17} />
                Anterior
              </button>
            )}

            {formStep < FORM_STEPS.length ? (
              <button
                type="button"
                onClick={goNextStep}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
              >
                Siguiente
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving || !deportesReady || !tiposPagoReady || !territorioReady}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
              >
                <Check size={17} />

                {saving
                  ? formMode === "edit"
                    ? "Guardando cambios…"
                    : "Creando academia…"
                  : formMode === "edit"
                    ? "Guardar cambios"
                    : "Crear academia"}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
