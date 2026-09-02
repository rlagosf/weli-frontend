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
  Layers3,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Power,
  PowerOff,
  Sun,
  Trash2,
  WalletCards,
} from "lucide-react";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";
import { logoutAdmin } from "../../services/auth";
import { useTheme } from "../../context/ThemeContext";

const academiasPath = "/academias";
const deportesPath = "/deportes";
const tiposPagoPath = "/tipo-pago";

const MAX_SUCURSALES = 50;
const MAX_TIPOS_PAGO = 50;
const MAX_PLANES = 20;
const MAX_TARIFAS_PLAN = 20;
const MAX_NOMBRE_ACADEMIA = 120;
const MAX_NOMBRE_SUCURSAL = 100;
const MAX_NOMBRE_PLAN = 120;
const MAX_DESCRIPCION_PLAN = 500;

const FORM_STEPS = [
  {
    id: 1,
    title: "Academia",
    description: "Antecedentes",
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
    title: "Tipos de pago",
    description: "Conceptos",
    icon: WalletCards,
  },
  {
    id: 4,
    title: "Planes",
    description: "Planes y tarifas",
    icon: Layers3,
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

function createEmptyTarifa(tipoPagoId) {
  return {
    tipo_pago_id: Number(tipoPagoId),
    monto: "",
    sucursales: [],
  };
}

function createEmptyPlan() {
  return {
    nombre: "",
    descripcion: "",
    estado_id: "1",
    sucursales: [],
    tarifas: [],
  };
}

function createEmptyForm() {
  return {
    nombre: "",
    rut_academia: "",
    deporte_id: "",
    estado_id: "1",

    // Ambos comienzan realmente desde cero.
    sucursales: [],
    tipos_pago: [],
    planes: [],
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

  const tiposPago = (item?.tipos_pago ?? [])
    .map((tipo) => {
      const id = Number(tipo?.id ?? tipo?.tipo_pago_id ?? tipo ?? 0);

      if (!Number.isInteger(id) || id <= 0) return null;

      const fromCatalog = catalogoById.get(id);

      if (fromCatalog) return fromCatalog;

      const fallback = normalizeTipoPagoCatalogo({
        id,
        nombre: tipo?.nombre ?? tipo?.tipo_pago_nombre ?? `Tipo de pago #${id}`,
        descripcion: tipo?.descripcion ?? null,
        estado_id: tipo?.estado_id ?? 1,
      });

      return fallback;
    })
    .filter(Boolean);

  /*
   * Una tarifa histórica puede referenciar un tipo global que no venga
   * dentro de item.tipos_pago. Lo preservamos en edición para no perder
   * la referencia existente.
   */
  const selectedById = new Map(tiposPago.map((tipo) => [Number(tipo.id), tipo]));

  for (const plan of item?.planes ?? []) {
    for (const tarifa of plan?.tarifas ?? []) {
      const tipoPagoId = Number(tarifa?.tipo_pago_id ?? 0);

      if (!Number.isInteger(tipoPagoId) || tipoPagoId <= 0 || selectedById.has(tipoPagoId)) {
        continue;
      }

      const fromCatalog = catalogoById.get(tipoPagoId);

      const fallback =
        fromCatalog ??
        normalizeTipoPagoCatalogo({
          id: tipoPagoId,
          nombre: tarifa?.tipo_pago_nombre ?? `Tipo de pago #${tipoPagoId}`,
          estado_id: 1,
        });

      if (fallback) {
        tiposPago.push(fallback);
        selectedById.set(tipoPagoId, fallback);
      }
    }
  }

  const indexBySucursalId = new Map(sucursales.map((sucursal, index) => [Number(sucursal.id), index]));

  const planes = (item?.planes ?? []).map((plan) => ({
    id: Number(plan?.id),
    nombre: normalizeText(plan?.nombre),
    descripcion: String(plan?.descripcion ?? ""),
    estado_id: String(plan?.estado_id ?? 1),

    sucursales: (plan?.sucursales ?? [])
      .map((id) => indexBySucursalId.get(Number(id)))
      .filter((index) => Number.isInteger(index)),

    tarifas: (plan?.tarifas ?? []).map((tarifa) => ({
      id: Number(tarifa?.id),
      tipo_pago_id: Number(tarifa?.tipo_pago_id ?? 0),
      monto: String(tarifa?.monto ?? ""),

      sucursales: (tarifa?.sucursales ?? [])
        .map((id) => indexBySucursalId.get(Number(id)))
        .filter((index) => Number.isInteger(index)),
    })),
  }));

  return {
    nombre: String(item?.nombre ?? ""),
    rut_academia: String(item?.rut_academia ?? ""),
    deporte_id: String(item?.deporte_id ?? ""),
    estado_id: String(item?.estado_id ?? 1),
    sucursales,
    tipos_pago: tiposPago,
    planes,
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
          headers: { "Cache-Control": "no-cache" },
        });

        const raw = pickList(res?.data ?? {}, ["tipos_pago", "tipo_pago"]);

        const normalized = (raw || [])
          .map(normalizeTipoPagoCatalogo)
          .filter(Boolean)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        setCatalogoTiposPago(normalized);
      } catch (err) {
        if (signal?.aborted) return;

        setCatalogoTiposPago([]);

        const status = Number(err?.status ?? err?.response?.status ?? 0);

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
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
        if (!signal?.aborted) setTiposPagoReady(true);
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

    return () => ctrl.abort();
  }, [loadAcademias, loadDeportes, loadTiposPago]);

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

      /*
       * Ahora se puede eliminar incluso la última.
       */
      sucursales: current.sucursales.filter((_, i) => i !== index),

      planes: current.planes.map((plan) => ({
        ...plan,

        sucursales: plan.sucursales
          .filter((sucursalIndex) => sucursalIndex !== index)
          .map((sucursalIndex) => (sucursalIndex > index ? sucursalIndex - 1 : sucursalIndex)),

        tarifas: plan.tarifas.map((tarifa) => ({
          ...tarifa,

          sucursales: tarifa.sucursales
            .filter((sucursalIndex) => sucursalIndex !== index)
            .map((sucursalIndex) => (sucursalIndex > index ? sucursalIndex - 1 : sucursalIndex)),
        })),
      })),
    }));
  };

  /* =========================================================
     TIPOS DE PAGO
  ========================================================= */

  const toggleTipoPago = (tipoPagoId) => {
    const id = Number(tipoPagoId);

    if (!Number.isInteger(id) || id <= 0) return;

    setForm((current) => {
      const selected = current.tipos_pago.some((tipo) => Number(tipo.id) === id);

      if (selected) {
        const usedByPlan = current.planes.some((plan) =>
          plan.tarifas.some((tarifa) => Number(tarifa.tipo_pago_id) === id)
        );

        if (usedByPlan) {
          const tipo = current.tipos_pago.find((item) => Number(item.id) === id);

          const confirmed = window.confirm(
            `El tipo de pago "${tipo?.nombre ?? `#${id}`}" está utilizado por una o más tarifas. ` +
              "Al deshabilitarlo también se retirarán esas tarifas. ¿Deseas continuar?"
          );

          if (!confirmed) return current;
        }

        return {
          ...current,
          tipos_pago: current.tipos_pago.filter((tipo) => Number(tipo.id) !== id),
          planes: current.planes.map((plan) => ({
            ...plan,
            tarifas: plan.tarifas.filter((tarifa) => Number(tarifa.tipo_pago_id) !== id),
          })),
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
        tipos_pago: [...current.tipos_pago, tipoCatalogo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      };
    });
  };

  /* =========================================================
     PLANES
  ========================================================= */

  const addPlan = () => {
    setForm((current) => {
      if (current.planes.length >= MAX_PLANES) return current;

      return {
        ...current,
        planes: [...current.planes, createEmptyPlan()],
      };
    });
  };

  const updatePlan = (planIndex, field, value) => {
    setForm((current) => ({
      ...current,
      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,
              [field]: value,
            }
          : plan
      ),
    }));
  };

  const removePlan = (planIndex) => {
    setForm((current) => ({
      ...current,
      planes: current.planes.filter((_, index) => index !== planIndex),
    }));
  };

  const togglePlanSucursal = (planIndex, sucursalIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) => {
        if (index !== planIndex) return plan;

        const selected = plan.sucursales.includes(sucursalIndex);

        const sucursales = selected
          ? plan.sucursales.filter((value) => value !== sucursalIndex)
          : [...plan.sucursales, sucursalIndex].sort((a, b) => a - b);

        const tarifas = selected
          ? plan.tarifas.map((tarifa) => ({
              ...tarifa,
              sucursales: tarifa.sucursales.filter((value) => value !== sucursalIndex),
            }))
          : plan.tarifas;

        return {
          ...plan,
          sucursales,
          tarifas,
        };
      }),
    }));
  };

  const selectAllPlanSucursales = (planIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,
              sucursales: current.sucursales.map((_, sucursalIndex) => sucursalIndex),
            }
          : plan
      ),
    }));
  };

  const clearPlanSucursales = (planIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,
              sucursales: [],
              tarifas: plan.tarifas.map((tarifa) => ({
                ...tarifa,
                sucursales: [],
              })),
            }
          : plan
      ),
    }));
  };

  /* =========================================================
     TARIFAS
  ========================================================= */

  const addTarifa = (planIndex, tipoPagoId) => {
    setMsg("");
    setMsgType("error");

    const id = Number(tipoPagoId);
    const tipo = form.tipos_pago.find((item) => Number(item.id) === id);

    if (!tipo) {
      setMsg("El tipo de pago seleccionado no está habilitado para esta academia.");
      return;
    }

    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) => {
        if (index !== planIndex) return plan;

        if (plan.tarifas.length >= MAX_TARIFAS_PLAN) {
          return plan;
        }

        const exists = plan.tarifas.some((tarifa) => Number(tarifa.tipo_pago_id) === id);

        if (exists) return plan;

        return {
          ...plan,
          tarifas: [...plan.tarifas, createEmptyTarifa(id)],
        };
      }),
    }));
  };

  const updateTarifa = (planIndex, tarifaIndex, field, value) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,

              tarifas: plan.tarifas.map((tarifa, indexTarifa) =>
                indexTarifa === tarifaIndex
                  ? {
                      ...tarifa,
                      [field]: value,
                    }
                  : tarifa
              ),
            }
          : plan
      ),
    }));
  };

  const removeTarifa = (planIndex, tarifaIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,
              tarifas: plan.tarifas.filter((_, indexTarifa) => indexTarifa !== tarifaIndex),
            }
          : plan
      ),
    }));
  };

  const toggleTarifaSucursal = (planIndex, tarifaIndex, sucursalIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) => {
        if (index !== planIndex || !plan.sucursales.includes(sucursalIndex)) {
          return plan;
        }

        return {
          ...plan,

          tarifas: plan.tarifas.map((tarifa, indexTarifa) => {
            if (indexTarifa !== tarifaIndex) return tarifa;

            const selected = tarifa.sucursales.includes(sucursalIndex);

            return {
              ...tarifa,

              sucursales: selected
                ? tarifa.sucursales.filter((value) => value !== sucursalIndex)
                : [...tarifa.sucursales, sucursalIndex].sort((a, b) => a - b),
            };
          }),
        };
      }),
    }));
  };

  const selectAllTarifaSucursales = (planIndex, tarifaIndex) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, index) =>
        index === planIndex
          ? {
              ...plan,

              tarifas: plan.tarifas.map((tarifa, indexTarifa) =>
                indexTarifa === tarifaIndex
                  ? {
                      ...tarifa,
                      sucursales: [...plan.sucursales],
                    }
                  : tarifa
              ),
            }
          : plan
      ),
    }));
  };

  const clearTarifaSucursales = (planIndex, tarifaIndex) => {
    updateTarifa(planIndex, tarifaIndex, "sucursales", []);
  };

  /* =========================================================
     VALIDACIONES POR PASO
  ========================================================= */

  const validateAcademiaStep = () => {
    const nombre = normalizeText(form.nombre);
    const rutClean = normalizeRutAcademia(form.rut_academia);
    const rutAcademia = Number(rutClean);
    const deporteId = Number(form.deporte_id);
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

    return true;
  };

  const validatePlanesStep = () => {
    if (!form.planes.length) {
      throw new Error("Debes registrar al menos un plan para completar la academia.");
    }

    if (form.planes.length > MAX_PLANES) {
      throw new Error(`No puedes registrar más de ${MAX_PLANES} planes.`);
    }

    const tiposPagoIds = new Set(form.tipos_pago.map((tipo) => Number(tipo.id)));

    const nombresPlanes = [];

    for (let planIndex = 0; planIndex < form.planes.length; planIndex += 1) {
      const plan = form.planes[planIndex];
      const nombrePlan = normalizeText(plan.nombre);

      if (nombrePlan.length < 2) {
        throw new Error(`El plan ${planIndex + 1} debe tener un nombre de al menos 2 caracteres.`);
      }

      if (nombrePlan.length > MAX_NOMBRE_PLAN) {
        throw new Error(`El nombre del plan "${nombrePlan}" no puede superar los ${MAX_NOMBRE_PLAN} caracteres.`);
      }

      if (normalizeText(plan.descripcion).length > MAX_DESCRIPCION_PLAN) {
        throw new Error(
          `La descripción del plan "${nombrePlan}" no puede superar los ${MAX_DESCRIPCION_PLAN} caracteres.`
        );
      }

      if (![1, 2].includes(Number(plan.estado_id))) {
        throw new Error(`El plan "${nombrePlan}" tiene un estado inválido.`);
      }

      if (!plan.sucursales.length) {
        throw new Error(`El plan "${nombrePlan}" debe estar disponible al menos en una sucursal.`);
      }

      if (!plan.tarifas.length) {
        throw new Error(`El plan "${nombrePlan}" debe tener al menos una tarifa.`);
      }

      if (plan.tarifas.length > MAX_TARIFAS_PLAN) {
        throw new Error(`El plan "${nombrePlan}" no puede contener más de ${MAX_TARIFAS_PLAN} tarifas.`);
      }

      for (let tarifaIndex = 0; tarifaIndex < plan.tarifas.length; tarifaIndex += 1) {
        const tarifa = plan.tarifas[tarifaIndex];
        const monto = Number(tarifa.monto);

        const tipoPagoId = Number(tarifa.tipo_pago_id);

        if (!Number.isInteger(tipoPagoId) || tipoPagoId <= 0 || !tiposPagoIds.has(tipoPagoId)) {
          throw new Error(`La tarifa ${tarifaIndex + 1} del plan "${nombrePlan}" utiliza un tipo de pago inválido.`);
        }

        if (tarifa.monto === "" || !Number.isFinite(monto) || monto < 0) {
          throw new Error(`La tarifa ${tarifaIndex + 1} del plan "${nombrePlan}" debe tener un monto válido.`);
        }

        if (!tarifa.sucursales.length) {
          throw new Error(
            `La tarifa ${tarifaIndex + 1} del plan "${nombrePlan}" debe aplicar al menos en una sucursal.`
          );
        }

        const invalidSucursal = tarifa.sucursales.some((sucursalIndex) => !plan.sucursales.includes(sucursalIndex));

        if (invalidSucursal) {
          throw new Error(`Una tarifa del plan "${nombrePlan}" utiliza una sucursal donde el plan no está disponible.`);
        }
      }

      nombresPlanes.push(normalizeComparable(nombrePlan));
    }

    if (new Set(nombresPlanes).size !== nombresPlanes.length) {
      throw new Error("No puedes registrar planes con nombres duplicados.");
    }

    return true;
  };

  /* =========================================================
     WIZARD
  ========================================================= */

  const validateStep = (step) => {
    if (step === 1) return validateAcademiaStep();
    if (step === 2) return validateSucursalesStep();
    if (step === 3) return validateTiposPagoStep();
    if (step === 4) return validatePlanesStep();

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
    validateTiposPagoStep();
    validatePlanesStep();

    const nombre = normalizeText(form.nombre);
    const rut_academia = Number(normalizeRutAcademia(form.rut_academia));
    const deporte_id = Number(form.deporte_id);
    const estado_id = Number(form.estado_id);

    const resolveSucursalRef = (index) => {
      const sucursal = form.sucursales[index];

      if (!sucursal) {
        throw new Error("Existe una referencia inválida hacia una sucursal.");
      }

      if (formMode === "edit" && Number.isInteger(Number(sucursal.id)) && Number(sucursal.id) > 0) {
        return Number(sucursal.id);
      }

      return normalizeText(sucursal.nombre);
    };

    const tipos_pago = form.tipos_pago.map((tipo) => Number(tipo.id));

    const planes = form.planes.map((plan) => ({
      ...(formMode === "edit" && Number(plan.id) > 0
        ? {
            id: Number(plan.id),
          }
        : {}),

      nombre: normalizeText(plan.nombre),
      descripcion: normalizeText(plan.descripcion) || null,
      estado_id: Number(plan.estado_id),

      sucursales: plan.sucursales.map(resolveSucursalRef),

      tarifas: plan.tarifas.map((tarifa) => ({
        ...(formMode === "edit" && Number(tarifa.id) > 0
          ? {
              id: Number(tarifa.id),
            }
          : {}),

        tipo_pago_id: Number(tarifa.tipo_pago_id),
        monto: Number(tarifa.monto),
        sucursales: tarifa.sucursales.map(resolveSucursalRef),
      })),
    }));

    if (formMode === "create") {
      return {
        nombre,
        rut_academia,
        deporte_id,
        estado_id,

        sucursales: form.sucursales.map((sucursal) => normalizeText(sucursal.nombre)),
        tipos_pago,
        planes,
      };
    }

    return {
      nombre,
      rut_academia,
      deporte_id,
      estado_id,

      sucursales: form.sucursales.map((sucursal) => ({
        ...(Number(sucursal.id) > 0
          ? {
              id: Number(sucursal.id),
            }
          : {}),

        nombre: normalizeText(sucursal.nombre),
      })),

      tipos_pago,
      planes,
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

      <header className="flex items-center justify-between px-4 sm:px-6 pt-6 gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tightish">Panel de Academias</h1>

          <p className={`text-xs sm:text-sm mt-1 ${headerSub}`}>Administra las academias registradas en WELI.</p>
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
            title="Crear academia"
            onClick={openCreateModal}
            className={`p-2 rounded-xl transition ${buttonIcon}`}
          >
            <Plus size={20} />
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
      </header>

      {/* ACADEMIAS */}

      <main className="px-4 sm:px-6 pb-20">
        <div className="mt-6 flex flex-col md:flex-row md:items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, RUT, deporte o estado…"
            className={`w-full md:w-[560px] rounded-2xl px-5 py-3 border outline-none transition ${searchInput}`}
          />

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 transition"
          >
            <Plus size={18} />
            Nueva academia
          </button>
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
            : "Completa antecedentes, sucursales, conceptos de pago, planes y tarifas."
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

          {/* PASO 1: ACADEMIA */}

          {formStep === 1 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                  <Building2 size={20} />
                </div>

                <div>
                  <h3 className="font-extrabold text-lg">Antecedentes de la academia</h3>

                  <p className={`text-xs mt-1 ${helperText}`}>
                    Información principal de identificación de la academia.
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
                    disabled={saving || !deportesReady || !tiposPagoReady}
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

          {/* PASO 3: TIPOS DE PAGO */}

          {formStep === 3 && (
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

          {/* PASO 4: PLANES Y TARIFAS */}

          {formStep === 4 && (
            <section className={`mt-5 rounded-2xl border p-4 sm:p-5 ${sectionCard}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ra-terracotta text-white shrink-0">
                    <Layers3 size={20} />
                  </div>

                  <div>
                    <h3 className="font-extrabold text-lg">Planes y tarifas</h3>

                    <p className={`text-xs mt-1 ${helperText}`}>
                      Relaciona planes, sucursales y los tipos de pago configurados.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addPlan}
                  disabled={saving || form.planes.length >= MAX_PLANES}
                  className={[
                    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 border text-sm font-bold transition disabled:opacity-50",
                    darkMode
                      ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                      : "bg-white/60 border-ra-marron/15 hover:bg-white text-ra-marron",
                  ].join(" ")}
                >
                  <Plus size={16} />
                  Agregar plan
                </button>
              </div>

              <div className={`mt-2 text-xs ${helperText}`}>
                {form.planes.length} plan
                {form.planes.length === 1 ? "" : "es"} configurado
                {form.planes.length === 1 ? "" : "s"}
              </div>

              {form.planes.length === 0 && (
                <div
                  className={`mt-4 rounded-xl border border-dashed px-4 py-7 text-center ${
                    darkMode ? "border-white/15 text-white/50" : "border-ra-marron/15 text-ra-marron/50"
                  }`}
                >
                  <Layers3 size={26} className="mx-auto mb-2 opacity-50" />

                  <div className="text-sm font-bold">0 planes</div>

                  <div className="text-xs mt-1">Agrega un plan para comenzar.</div>
                </div>
              )}

              <div className="mt-4 space-y-4">
                {form.planes.map((plan, planIndex) => {
                  const tiposDisponibles = form.tipos_pago.filter(
                    (tipo) => !plan.tarifas.some((tarifa) => Number(tarifa.tipo_pago_id) === Number(tipo.id))
                  );

                  return (
                    <div
                      key={`plan-${plan.id ?? "new"}-${planIndex}`}
                      className={`rounded-xl border p-3 sm:p-4 ${
                        darkMode ? "bg-black/10 border-white/10" : "bg-white/50 border-ra-marron/10"
                      }`}
                    >
                      {/* CABECERA COMPACTA */}

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr_160px_42px] gap-3 items-end">
                        <div>
                          <label className={`text-xs font-semibold ${labelText}`}>Nombre del plan</label>

                          <input
                            value={plan.nombre}
                            onChange={(e) => updatePlan(planIndex, "nombre", e.target.value)}
                            className={`mt-1 w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                            placeholder="Ej: Plan Regular"
                            maxLength={MAX_NOMBRE_PLAN}
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <label className={`text-xs font-semibold ${labelText}`}>Descripción</label>

                          <input
                            value={plan.descripcion}
                            onChange={(e) => updatePlan(planIndex, "descripcion", e.target.value)}
                            className={`mt-1 w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                            placeholder="Descripción breve"
                            maxLength={MAX_DESCRIPCION_PLAN}
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <label className={`text-xs font-semibold ${labelText}`}>Estado</label>

                          <select
                            value={plan.estado_id}
                            onChange={(e) => updatePlan(planIndex, "estado_id", e.target.value)}
                            className={`mt-1 !py-2 ${selectDark}`}
                            disabled={saving}
                          >
                            <option value="1">Activado</option>

                            <option value="2">Desactivado</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => removePlan(planIndex)}
                          disabled={saving}
                          title="Eliminar plan"
                          className={[
                            "h-[42px] rounded-lg border flex items-center justify-center",
                            darkMode
                              ? "bg-red-500/10 border-red-300/20 text-red-200"
                              : "bg-red-50 border-red-200 text-red-700",
                          ].join(" ")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* SUCURSALES PLAN */}

                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className={`text-xs font-bold ${labelText}`}>Sucursales del plan</div>

                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => selectAllPlanSucursales(planIndex)}
                              className={`text-[11px] font-bold underline ${labelText}`}
                            >
                              Todas
                            </button>

                            <button
                              type="button"
                              onClick={() => clearPlanSucursales(planIndex)}
                              className={`text-[11px] font-bold underline ${helperText}`}
                            >
                              Ninguna
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {form.sucursales.map((sucursal, sucursalIndex) => {
                            const checked = plan.sucursales.includes(sucursalIndex);

                            return (
                              <label
                                key={`plan-${planIndex}-sucursal-${sucursalIndex}`}
                                className={[
                                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-xs font-semibold transition",
                                  checked ? "border-ra-terracotta bg-ra-terracotta/10" : checkboxCard,
                                ].join(" ")}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePlanSucursal(planIndex, sucursalIndex)}
                                  disabled={saving}
                                  className="w-4 h-4 accent-ra-terracotta"
                                />

                                {normalizeText(sucursal.nombre)}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* TARIFAS */}

                      <div className="mt-4 pt-4 border-t border-current/10">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <WalletCards size={16} />

                              <h4 className="text-sm font-extrabold">Tarifas</h4>
                            </div>

                            <p className={`text-[11px] mt-1 ${helperText}`}>
                              Agrega directamente uno de los tipos de pago habilitados desde el catálogo global.
                            </p>
                          </div>

                          {tiposDisponibles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {tiposDisponibles.map((tipo) => (
                                <button
                                  key={tipo.id}
                                  type="button"
                                  onClick={() => addTarifa(planIndex, tipo.id)}
                                  disabled={saving || plan.tarifas.length >= MAX_TARIFAS_PLAN}
                                  className={[
                                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition",
                                    darkMode
                                      ? "bg-white/10 border-white/15 hover:bg-white/15"
                                      : "bg-white border-ra-marron/15 hover:bg-ra-cream",
                                  ].join(" ")}
                                >
                                  <Plus size={13} />
                                  {tipo.nombre}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {plan.tarifas.length === 0 ? (
                          <div
                            className={`mt-3 rounded-lg border border-dashed px-3 py-4 text-xs text-center ${helperText}`}
                          >
                            El plan aún no tiene tarifas.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {plan.tarifas.map((tarifa, tarifaIndex) => {
                              const tipoPago = form.tipos_pago.find(
                                (tipo) => Number(tipo.id) === Number(tarifa.tipo_pago_id)
                              );

                              return (
                                <div
                                  key={`tarifa-${tarifa.id ?? "new"}-${tarifa.tipo_pago_id}`}
                                  className={`rounded-lg border p-3 ${tarifaCard}`}
                                >
                                  <div className="grid grid-cols-1 md:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.7fr)_42px] gap-3 items-end">
                                    <div>
                                      <div className={`text-[11px] font-semibold ${helperText}`}>Tipo de pago</div>

                                      <div className="mt-1 min-h-[42px] rounded-lg border border-current/10 px-3 py-2 flex items-center gap-2 font-bold text-sm">
                                        <WalletCards size={15} />
                                        {tipoPago?.nombre ?? "Tipo de pago"}
                                      </div>
                                    </div>

                                    <div>
                                      <label className={`text-[11px] font-semibold ${helperText}`}>Monto</label>

                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={tarifa.monto}
                                        onChange={(e) => updateTarifa(planIndex, tarifaIndex, "monto", e.target.value)}
                                        className={`mt-1 w-full rounded-lg px-3 py-2 border outline-none ${modalInput}`}
                                        placeholder="Ej: 50000"
                                        disabled={saving}
                                      />

                                      {tarifa.monto !== "" && (
                                        <div className={`text-[10px] mt-1 ${helperText}`}>
                                          {formatCLP(tarifa.monto)}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => removeTarifa(planIndex, tarifaIndex)}
                                      className={[
                                        "h-[42px] rounded-lg border flex items-center justify-center",
                                        darkMode
                                          ? "bg-red-500/10 border-red-300/20 text-red-200"
                                          : "bg-red-50 border-red-200 text-red-700",
                                      ].join(" ")}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>

                                  <div className="mt-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className={`text-[11px] font-semibold ${labelText}`}>
                                        Sucursales donde aplica
                                      </div>

                                      <div className="flex gap-3">
                                        <button
                                          type="button"
                                          onClick={() => selectAllTarifaSucursales(planIndex, tarifaIndex)}
                                          className={`text-[10px] font-bold underline ${labelText}`}
                                        >
                                          Todas
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => clearTarifaSucursales(planIndex, tarifaIndex)}
                                          className={`text-[10px] font-bold underline ${helperText}`}
                                        >
                                          Ninguna
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {form.sucursales.map((sucursal, sucursalIndex) => {
                                        const disponible = plan.sucursales.includes(sucursalIndex);

                                        const checked = tarifa.sucursales.includes(sucursalIndex);

                                        return (
                                          <label
                                            key={`tarifa-${planIndex}-${tarifaIndex}-${sucursalIndex}`}
                                            className={[
                                              "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                                              disponible
                                                ? checked
                                                  ? "cursor-pointer border-ra-terracotta bg-ra-terracotta/10"
                                                  : `cursor-pointer ${checkboxCard}`
                                                : "cursor-not-allowed opacity-35 border-current/10",
                                            ].join(" ")}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() =>
                                                toggleTarifaSucursal(planIndex, tarifaIndex, sucursalIndex)
                                              }
                                              disabled={saving || !disponible}
                                              className="w-3.5 h-3.5 accent-ra-terracotta"
                                            />

                                            {normalizeText(sucursal.nombre)}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {form.planes.length > 0 && (
                <div className={`mt-4 rounded-xl border px-4 py-3 ${sectionCard}`}>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-lg font-extrabold">{form.sucursales.length}</div>
                      <div className={`text-[10px] ${helperText}`}>Sucursales</div>
                    </div>

                    <div>
                      <div className="text-lg font-extrabold">{form.tipos_pago.length}</div>
                      <div className={`text-[10px] ${helperText}`}>Tipos de pago</div>
                    </div>

                    <div>
                      <div className="text-lg font-extrabold">{form.planes.length}</div>
                      <div className={`text-[10px] ${helperText}`}>Planes</div>
                    </div>

                    <div>
                      <div className="text-lg font-extrabold">
                        {form.planes.reduce((total, plan) => total + plan.tarifas.length, 0)}
                      </div>

                      <div className={`text-[10px] ${helperText}`}>Tarifas</div>
                    </div>
                  </div>
                </div>
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
                disabled={saving || !deportesReady || !tiposPagoReady}
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
