// src/pages/admin/superDashboard.jsx

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { LogOut, Plus, Building2, Sun, Moon, CreditCard, MapPin, Layers3, Trash2 } from "lucide-react";

import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";

import { logoutAdmin } from "../../services/auth";
import { useTheme } from "../../context/ThemeContext";

/* =========================================================
   ENDPOINTS
========================================================= */

const academiasPath = "/academias";
const deportesPath = "/deportes";

/* =========================================================
   LÍMITES
========================================================= */

const MAX_SUCURSALES = 50;
const MAX_PLANES = 20;

const MAX_NOMBRE_ACADEMIA = 120;
const MAX_NOMBRE_SUCURSAL = 100;
const MAX_NOMBRE_PLAN = 120;
const MAX_DESCRIPCION_PLAN = 500;
const MAX_PERIODICIDAD = 30;

/* =========================================================
   HELPERS RESPUESTAS
========================================================= */

function pickAcademias(payload) {
  if (!payload) return [];

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.academias)) {
    return payload.academias;
  }

  if (Array.isArray(payload?.rows)) {
    return payload.rows;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
}

function pickDeportes(payload) {
  if (!payload) return [];

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.deportes)) {
    return payload.deportes;
  }

  if (Array.isArray(payload?.rows)) {
    return payload.rows;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
}

/* =========================================================
   HELPERS AUTH
========================================================= */

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);

  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.user?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol ?? 0;

  const rol = Number(raw);

  return Number.isInteger(rol) && [1, 2, 3].includes(rol) ? rol : 0;
};

/* =========================================================
   HELPERS TEXTO
========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeComparable(value) {
  return normalizeText(value).toLocaleLowerCase("es");
}

/* =========================================================
   HELPERS RUT
========================================================= */

/**
 * Retorna solamente la parte numérica del RUT.
 *
 * El modelo WELI guarda:
 *
 * rut_academia INT
 *
 * El DV NO se almacena aquí.
 */
function normalizeRutAcademia(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

/**
 * Calcula DV chileno.
 *
 * Solo se utiliza para presentación.
 */
function calcularDvRut(rut) {
  const clean = normalizeRutAcademia(rut);

  if (!clean) {
    return "";
  }

  let suma = 0;
  let multiplo = 2;

  for (let i = clean.length - 1; i >= 0; i -= 1) {
    suma += Number(clean[i]) * multiplo;

    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = 11 - (suma % 11);

  if (resto === 11) {
    return "0";
  }

  if (resto === 10) {
    return "K";
  }

  return String(resto);
}

function formatRutNumber(rut) {
  const clean = normalizeRutAcademia(rut);

  if (!clean) {
    return "";
  }

  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatRutCompleto(rut) {
  const clean = normalizeRutAcademia(rut);

  if (!clean) {
    return "";
  }

  const dv = calcularDvRut(clean);

  return `${formatRutNumber(clean)}-${dv}`;
}

/* =========================================================
   PLAN INICIAL
========================================================= */

function createEmptyPlan() {
  return {
    nombre: "",
    descripcion: "",
    periodicidad: "MENSUAL",
    estado_id: "1",
  };
}

/* =========================================================
   MODAL
========================================================= */

const Modal = ({ open, onClose, title, subtitle, darkMode, children }) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
      {/*
        Fondo bloqueante.

        No contiene onClick:
        el usuario debe utilizar los controles
        explícitos del modal.
      */}
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      <div
        className={[
          "relative z-10 w-full max-w-3xl rounded-2xl shadow-2xl border p-6",
          "max-h-[92vh] overflow-y-auto",

          darkMode ? "bg-ra-marron/95 border-white/10 text-white" : "bg-ra-cream border-ra-marron/15 text-ra-marron",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tightish">{title}</h2>

            {subtitle ? (
              <p className={darkMode ? "text-white/70 text-sm mt-1" : "text-ra-marron/70 text-sm mt-1"}>{subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={[
              "rounded-xl px-3 py-2 border transition",

              darkMode
                ? "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                : "bg-white hover:bg-ra-cream border-ra-marron/15 text-ra-marron",
            ].join(" ")}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
};

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function SuperDashboard() {
  const navigate = useNavigate();

  const { darkMode, toggleTheme } = useTheme();

  /* =======================================================
     ESTADO GENERAL
  ======================================================= */

  const [academias, setAcademias] = useState([]);

  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState("");

  /* =======================================================
     CATÁLOGOS
  ======================================================= */

  const [deportes, setDeportes] = useState([]);

  const [deportesReady, setDeportesReady] = useState(false);

  /* =======================================================
     MODAL
  ======================================================= */

  const [openCreate, setOpenCreate] = useState(false);

  const [creating, setCreating] = useState(false);

  /* =======================================================
     FORMULARIO NUEVA ACADEMIA
  ======================================================= */

  const [form, setForm] = useState({
    nombre: "",

    /*
     * RUT numérico SIN DV.
     */
    rut_academia: "",

    deporte_id: "",
    estado_id: "1",

    /*
     * Siempre debe existir al menos
     * una sucursal.
     */
    sucursales: [""],

    /*
     * Los planes iniciales son opcionales.
     */
    planes: [],
  });

  /* =======================================================
     GUARD SUPERADMIN
  ======================================================= */

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);

      if (isExpired(decoded)) {
        throw new Error("expired");
      }

      const rol = extractRol(decoded);

      if (rol !== 3) {
        navigate("/admin", {
          replace: true,
        });

        return;
      }
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate]);

  /* =======================================================
     CARGAR ACADEMIAS
  ======================================================= */

  const loadAcademias = useCallback(
    async (signal) => {
      setLoading(true);
      setMsg("");

      try {
        /*
         * api.js agrega Authorization.
         *
         * /academias es recurso global,
         * por lo que no agrega x-academia-id.
         */
        const res = await api.get(academiasPath, {
          signal,

          headers: {
            "Cache-Control": "no-cache",
          },
        });

        setAcademias(pickAcademias(res?.data ?? {}));
      } catch (err) {
        if (signal?.aborted) {
          return;
        }

        const status = Number(err?.status ?? err?.response?.status ?? 0);

        const message =
          err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error cargando academias";

        if (status === 401) {
          setMsg("No autorizado. La sesión no es válida o expiró.");

          clearToken();

          navigate("/login", {
            replace: true,
          });
        } else if (status === 403) {
          /*
           * 403 NO significa token inválido.
           */
          setMsg("Acceso denegado: esta operación requiere rol Superadmin.");
        } else if (status === 404) {
          setMsg("Endpoint de academias no encontrado.");
        } else {
          setMsg(String(message));
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [navigate]
  );

  /* =======================================================
     CARGAR DEPORTES
  ======================================================= */

  const loadDeportes = useCallback(async (signal) => {
    setDeportesReady(false);

    try {
      const res = await api.get(deportesPath, {
        signal,

        headers: {
          "Cache-Control": "no-cache",
        },
      });

      const raw = pickDeportes(res?.data ?? {});

      const normalized = (raw || [])
        .map((d) => ({
          id: Number(d?.id ?? d?.deporte_id ?? 0),

          nombre: normalizeText(d?.nombre ?? d?.name ?? ""),
        }))
        .filter((d) => Number.isInteger(d.id) && d.id > 0 && d.nombre.length > 0);

      setDeportes(normalized);
    } catch {
      setDeportes([]);
    } finally {
      setDeportesReady(true);
    }
  }, []);

  /* =======================================================
     CARGA INICIAL
  ======================================================= */

  useEffect(() => {
    const ctrl = new AbortController();

    loadAcademias(ctrl.signal);

    loadDeportes(ctrl.signal);

    return () => ctrl.abort();
  }, [loadAcademias, loadDeportes]);

  /* =======================================================
     FILTRADO
  ======================================================= */

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    if (!needle) {
      return academias;
    }

    const numericNeedle = needle.replace(/\D/g, "");

    return academias.filter((academia) => {
      const nombre = String(academia?.nombre ?? "").toLowerCase();

      const deporteNombre = String(academia?.deporte_nombre ?? "").toLowerCase();

      const estadoNombre = String(academia?.estado_nombre ?? "").toLowerCase();

      const rut = String(academia?.rut_academia ?? "");

      return (
        nombre.includes(needle) ||
        deporteNombre.includes(needle) ||
        estadoNombre.includes(needle) ||
        (numericNeedle && rut.includes(numericNeedle))
      );
    });
  }, [academias, q]);

  /* =======================================================
     ENTRAR ACADEMIA
  ======================================================= */

  const enterAcademia = (academia) => {
    const id = Number(academia?.id ?? 0);

    if (!Number.isInteger(id) || id <= 0) {
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

  /* =======================================================
     LOGOUT
  ======================================================= */

  const handleCerrarSesion = useCallback(async () => {
    try {
      await logoutAdmin();
    } finally {
      window.location.replace("/");
    }
  }, []);

  /* =======================================================
     MODAL NUEVA ACADEMIA
  ======================================================= */

  const openCreateModal = () => {
    setMsg("");

    setForm({
      nombre: "",
      rut_academia: "",
      deporte_id: "",
      estado_id: "1",
      sucursales: [""],
      planes: [],
    });

    setOpenCreate(true);
  };

  const closeCreateModal = () => {
    if (creating) {
      return;
    }

    setOpenCreate(false);
    setMsg("");
  };

  /* =======================================================
     SUCURSALES
  ======================================================= */

  const addSucursal = () => {
    setForm((current) => {
      if (current.sucursales.length >= MAX_SUCURSALES) {
        return current;
      }

      return {
        ...current,

        sucursales: [...current.sucursales, ""],
      };
    });
  };

  const updateSucursal = (index, value) => {
    setForm((current) => ({
      ...current,

      sucursales: current.sucursales.map((sucursal, i) => (i === index ? value : sucursal)),
    }));
  };

  const removeSucursal = (index) => {
    setForm((current) => {
      if (current.sucursales.length <= 1) {
        return current;
      }

      return {
        ...current,

        sucursales: current.sucursales.filter((_, i) => i !== index),
      };
    });
  };

  /* =======================================================
     PLANES INICIALES
  ======================================================= */

  const addPlan = () => {
    setForm((current) => {
      if (current.planes.length >= MAX_PLANES) {
        return current;
      }

      return {
        ...current,

        planes: [...current.planes, createEmptyPlan()],
      };
    });
  };

  const updatePlan = (index, field, value) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.map((plan, i) =>
        i === index
          ? {
              ...plan,
              [field]: value,
            }
          : plan
      ),
    }));
  };

  const removePlan = (index) => {
    setForm((current) => ({
      ...current,

      planes: current.planes.filter((_, i) => i !== index),
    }));
  };

  /* =======================================================
     RUT VISUAL
  ======================================================= */

  const rutPreview = useMemo(
    () => (form.rut_academia ? formatRutCompleto(form.rut_academia) : ""),
    [form.rut_academia]
  );

  /* =======================================================
     CREAR ACADEMIA
  ======================================================= */

  const submitCreate = async (e) => {
    e.preventDefault();

    setMsg("");

    /* ─────────────────────────────────────
         Academia
      ───────────────────────────────────── */

    const nombre = normalizeText(form.nombre);

    const rutClean = normalizeRutAcademia(form.rut_academia);

    const rut_academia = Number(rutClean);

    const deporte_id = Number(form.deporte_id);

    const estado_id = Number(form.estado_id);

    /* ─────────────────────────────────────
         Sucursales
      ───────────────────────────────────── */

    const sucursales = form.sucursales.map(normalizeText);

    /* ─────────────────────────────────────
         Planes
      ───────────────────────────────────── */

    const planes = form.planes.map((plan) => ({
      nombre: normalizeText(plan.nombre),

      descripcion: normalizeText(plan.descripcion) || null,

      periodicidad: normalizeText(plan.periodicidad).toUpperCase(),

      estado_id: Number(plan.estado_id),
    }));

    /* ===================================================
         VALIDACIONES ACADEMIA
      =================================================== */

    if (nombre.length < 2) {
      return setMsg("El nombre debe tener al menos 2 caracteres.");
    }

    if (nombre.length > MAX_NOMBRE_ACADEMIA) {
      return setMsg(`El nombre de la academia no puede superar los ${MAX_NOMBRE_ACADEMIA} caracteres.`);
    }

    /*
     * rut_academia corresponde solamente
     * al cuerpo numérico.
     */
    if (!rutClean || !Number.isInteger(rut_academia) || rut_academia <= 0 || rutClean.length > 8) {
      return setMsg("Debes ingresar un RUT de academia válido, sin dígito verificador.");
    }

    if (!Number.isInteger(deporte_id) || deporte_id <= 0) {
      return setMsg("Debes seleccionar un deporte válido.");
    }

    if (!Number.isInteger(estado_id) || ![1, 2].includes(estado_id)) {
      return setMsg("Debes indicar un estado válido.");
    }

    /* ===================================================
         VALIDACIONES SUCURSALES
      =================================================== */

    if (sucursales.length === 0) {
      return setMsg("Debes registrar al menos una sucursal.");
    }

    if (sucursales.length > MAX_SUCURSALES) {
      return setMsg(`No puedes registrar más de ${MAX_SUCURSALES} sucursales.`);
    }

    if (sucursales.some((sucursal) => sucursal.length < 2)) {
      return setMsg("Todas las sucursales deben tener un nombre de al menos 2 caracteres.");
    }

    if (sucursales.some((sucursal) => sucursal.length > MAX_NOMBRE_SUCURSAL)) {
      return setMsg(`El nombre de una sucursal no puede superar los ${MAX_NOMBRE_SUCURSAL} caracteres.`);
    }

    const sucursalesNormalizadas = sucursales.map(normalizeComparable);

    if (new Set(sucursalesNormalizadas).size !== sucursalesNormalizadas.length) {
      return setMsg("No puedes registrar sucursales duplicadas.");
    }

    /* ===================================================
         VALIDACIONES PLANES
      =================================================== */

    if (planes.length > MAX_PLANES) {
      return setMsg(`No puedes registrar más de ${MAX_PLANES} planes iniciales.`);
    }

    if (planes.some((plan) => plan.nombre.length < 2)) {
      return setMsg("Todos los planes registrados deben tener un nombre de al menos 2 caracteres.");
    }

    if (planes.some((plan) => plan.nombre.length > MAX_NOMBRE_PLAN)) {
      return setMsg(`El nombre de un plan no puede superar los ${MAX_NOMBRE_PLAN} caracteres.`);
    }

    if (planes.some((plan) => (plan.descripcion ?? "").length > MAX_DESCRIPCION_PLAN)) {
      return setMsg(`La descripción de un plan no puede superar los ${MAX_DESCRIPCION_PLAN} caracteres.`);
    }

    if (planes.some((plan) => !plan.periodicidad || plan.periodicidad.length > MAX_PERIODICIDAD)) {
      return setMsg(
        `La periodicidad de los planes es obligatoria y no puede superar los ${MAX_PERIODICIDAD} caracteres.`
      );
    }

    if (planes.some((plan) => ![1, 2].includes(plan.estado_id))) {
      return setMsg("Uno o más planes tienen un estado inválido.");
    }

    const planesNormalizados = planes.map((plan) => normalizeComparable(plan.nombre));

    if (new Set(planesNormalizados).size !== planesNormalizados.length) {
      return setMsg("No puedes registrar planes iniciales con nombres duplicados.");
    }

    /* ===================================================
         PAYLOAD
      =================================================== */

    const payload = {
      nombre,

      /*
       * INT.
       * NO se envía DV.
       */
      rut_academia,

      deporte_id,
      estado_id,

      /*
       * Al menos una.
       */
      sucursales,

      /*
       * Puede ser [].
       *
       * El backend debe crear estos registros
       * dentro de la misma transacción
       * utilizada para crear la academia.
       */
      planes,
    };

    /* ===================================================
         ENVIAR
      =================================================== */

    setCreating(true);

    try {
      /*
       * api.js agrega automáticamente
       * Authorization.
       *
       * Como /academias es global,
       * NO agrega x-academia-id.
       */
      await api.post(academiasPath, payload);

      setOpenCreate(false);

      setForm({
        nombre: "",
        rut_academia: "",
        deporte_id: "",
        estado_id: "1",
        sucursales: [""],
        planes: [],
      });

      const ctrl = new AbortController();

      await loadAcademias(ctrl.signal);
    } catch (err) {
      const status = Number(err?.status ?? err?.response?.status ?? 0);

      const message = err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Error creando academia";

      if (status === 409) {
        setMsg(String(message));
      } else if (status === 400) {
        setMsg(String(message));
      } else if (status === 401) {
        setMsg("La sesión no es válida o expiró.");

        clearToken();

        navigate("/login", {
          replace: true,
        });
      } else if (status === 403) {
        /*
         * No destruimos sesión por un 403.
         */
        setMsg("Acceso denegado: esta operación requiere rol Superadmin.");
      } else {
        setMsg(String(message));
      }
    } finally {
      setCreating(false);
    }
  };

  /* =======================================================
     THEME CLASSES
  ======================================================= */

  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";

  const buttonIcon = darkMode ? "hover:bg-white/10" : "hover:bg-white/30";

  const searchInput = darkMode
    ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
    : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta";

  const msgBox = darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700";

  const card = darkMode
    ? "bg-white/10 border-white/15 hover:bg-white/15 hover:border-white/25"
    : "bg-white/60 border-ra-marron/15 hover:bg-white/80 hover:border-ra-terracotta";

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

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={`${shell} min-h-screen font-sans`}>
      {/* =================================================
          HEADER
      ================================================= */}

      <header className="flex items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tightish">Panel de Academias</h1>

          <p className={`text-sm mt-1 ${headerSub}`}>Selecciona una academia para entrar a su panel.</p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* =================================================
          CONTENIDO
      ================================================= */}

      <main className="px-6 pb-20">
        <div className="mt-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, RUT, deporte o estado…"
            className={`w-full md:w-[560px] rounded-2xl px-5 py-3 border outline-none transition ${searchInput}`}
          />
        </div>

        {loading && (
          <div className={`mt-10 ${darkMode ? "text-white/70" : "text-ra-marron/70"}`}>Cargando academias…</div>
        )}

        {!loading && msg && !openCreate && (
          <div className={`mt-8 rounded-2xl border px-5 py-4 font-semibold ${msgBox}`}>{msg}</div>
        )}

        {!loading && !msg && (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((academia) => {
                const id = Number(academia?.id ?? 0);

                const nombre = academia?.nombre ?? `Academia #${id}`;

                const deporteNombre = academia?.deporte_nombre ?? "—";

                const estadoNombre = academia?.estado_nombre ?? "—";

                const rut = academia?.rut_academia ? formatRutCompleto(academia.rut_academia) : null;

                return (
                  <button
                    key={String(id)}
                    type="button"
                    onClick={() => enterAcademia(academia)}
                    className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 min-h-48 hover:-translate-y-1 text-center`}
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-ra-terracotta/90 border border-white/10">
                      <Building2 className="w-8 h-8 text-white" />
                    </div>

                    <div
                      className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}
                    >
                      {nombre}
                    </div>

                    {rut && (
                      <div className={`text-xs font-semibold ${darkMode ? "text-white/60" : "text-ra-marron/60"}`}>
                        RUT {rut}
                      </div>
                    )}

                    <div className={`text-xs inline-flex items-center gap-2 rounded-full px-3 py-1 border ${badge}`}>
                      <span>{deporteNombre}</span>

                      <span className={darkMode ? "text-white/40" : "text-ra-marron/40"}>•</span>

                      <span>{estadoNombre}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className={`mt-10 ${darkMode ? "text-white/70" : "text-ra-marron/70"}`}>
                No hay academias que coincidan con tu búsqueda.
              </div>
            )}
          </>
        )}
      </main>

      {/* =================================================
          MODAL CREAR ACADEMIA
      ================================================= */}

      <Modal
        open={openCreate}
        onClose={closeCreateModal}
        title="Nueva academia"
        subtitle="Registra la academia, sus sucursales y, si corresponde, configura sus planes iniciales."
        darkMode={darkMode}
      >
        <form onSubmit={submitCreate} className="space-y-6">
          {/* ===============================================
              DATOS GENERALES
          =============================================== */}

          <section className={`rounded-2xl border p-4 ${sectionCard}`}>
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={19} />

              <div>
                <h3 className="font-extrabold">Datos de la academia</h3>

                <p className={`text-xs mt-0.5 ${helperText}`}>Información principal de identificación.</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Nombre */}

              <div>
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
                  disabled={creating}
                  required
                />
              </div>

              {/* RUT */}

              <div>
                <label className={`text-sm font-bold ${labelText}`}>RUT academia</label>

                <div className="relative mt-2">
                  <input
                    value={form.rut_academia}
                    onChange={(e) => {
                      const clean = normalizeRutAcademia(e.target.value);

                      setForm((current) => ({
                        ...current,

                        rut_academia: clean,
                      }));
                    }}
                    className={`w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                    placeholder="Ej: 76123456"
                    inputMode="numeric"
                    maxLength={8}
                    disabled={creating}
                    required
                  />
                </div>

                <div className={`mt-2 text-xs ${helperText}`}>
                  Ingresa solamente la parte numérica, sin puntos, guion ni DV.
                </div>

                {rutPreview && (
                  <div
                    className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${badge}`}
                  >
                    <CreditCard size={15} />
                    RUT completo:
                    <span>{rutPreview}</span>
                  </div>
                )}
              </div>

              {/* Deporte / Estado */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    disabled={creating || !deportesReady}
                    required
                  >
                    {!deportesReady && (
                      <option value="" disabled>
                        Cargando deportes…
                      </option>
                    )}

                    {deportesReady && deportes.length === 0 && (
                      <option value="" disabled>
                        No hay deportes disponibles
                      </option>
                    )}

                    {deportesReady && deportes.length > 0 && (
                      <>
                        <option value="" disabled>
                          Selecciona…
                        </option>

                        {deportes
                          .slice()
                          .sort((a, b) =>
                            String(a.nombre).localeCompare(String(b.nombre), "es", {
                              sensitivity: "base",
                            })
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
                    disabled={creating}
                  >
                    <option value="1">Activado</option>

                    <option value="2">Desactivado</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* ===============================================
              SUCURSALES
          =============================================== */}

          <section className={`rounded-2xl border p-4 ${sectionCard}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <MapPin size={19} className="mt-0.5" />

                <div>
                  <h3 className="font-extrabold">Sucursales</h3>

                  <p className={`text-xs mt-0.5 ${helperText}`}>La academia debe comenzar con al menos una sucursal.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={addSucursal}
                disabled={creating || form.sucursales.length >= MAX_SUCURSALES}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2",
                  "border text-sm font-bold transition",
                  "disabled:opacity-50 disabled:cursor-not-allowed",

                  darkMode
                    ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                    : "bg-white/60 border-ra-marron/15 hover:bg-white text-ra-marron",
                ].join(" ")}
              >
                <Plus size={16} />
                Agregar
              </button>
            </div>

            <div className={`mt-2 text-xs ${helperText}`}>
              {form.sucursales.length} de {MAX_SUCURSALES} sucursales
            </div>

            <div className="mt-4 space-y-3">
              {form.sucursales.map((sucursal, index) => (
                <div key={`sucursal-${index}`} className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className={`text-xs font-semibold ${helperText}`}>Sucursal {index + 1}</label>

                    <input
                      value={sucursal}
                      onChange={(e) => updateSucursal(index, e.target.value)}
                      className={`mt-1 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                      placeholder={`Ej: Sucursal ${index + 1}`}
                      maxLength={MAX_NOMBRE_SUCURSAL}
                      disabled={creating}
                      required
                    />
                  </div>

                  {form.sucursales.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSucursal(index)}
                      disabled={creating}
                      className={[
                        "shrink-0 mt-5 rounded-xl px-3 py-3 border",
                        "font-bold transition",

                        darkMode
                          ? "bg-red-500/10 border-red-300/20 text-red-200 hover:bg-red-500/20"
                          : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
                      ].join(" ")}
                      title={`Eliminar sucursal ${index + 1}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ===============================================
              PLANES INICIALES
          =============================================== */}

          <section className={`rounded-2xl border p-4 ${sectionCard}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <Layers3 size={19} className="mt-0.5" />

                <div>
                  <h3 className="font-extrabold">Planes iniciales</h3>

                  <p className={`text-xs mt-0.5 ${helperText}`}>
                    Opcional. Puedes dejar definidos los planes comerciales con los que comenzará la academia.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={addPlan}
                disabled={creating || form.planes.length >= MAX_PLANES}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2",
                  "border text-sm font-bold transition",
                  "disabled:opacity-50 disabled:cursor-not-allowed",

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
              {form.planes.length} de {MAX_PLANES} planes
            </div>

            {form.planes.length === 0 && (
              <div
                className={`mt-4 rounded-xl border border-dashed px-4 py-5 text-center text-sm ${
                  darkMode ? "border-white/15 text-white/50" : "border-ra-marron/15 text-ra-marron/50"
                }`}
              >
                No se han definido planes iniciales. Puedes crear la academia igualmente y configurarlos posteriormente.
              </div>
            )}

            <div className="mt-4 space-y-4">
              {form.planes.map((plan, index) => (
                <div
                  key={`plan-${index}`}
                  className={`rounded-xl border p-4 ${
                    darkMode ? "bg-black/10 border-white/10" : "bg-white/50 border-ra-marron/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="font-extrabold">Plan {index + 1}</div>

                    <button
                      type="button"
                      onClick={() => removePlan(index)}
                      disabled={creating}
                      className={[
                        "rounded-xl p-2 border transition",

                        darkMode
                          ? "bg-red-500/10 border-red-300/20 text-red-200 hover:bg-red-500/20"
                          : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
                      ].join(" ")}
                      title={`Eliminar plan ${index + 1}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Nombre */}

                    <div>
                      <label className={`text-xs font-semibold ${labelText}`}>Nombre del plan</label>

                      <input
                        value={plan.nombre}
                        onChange={(e) => updatePlan(index, "nombre", e.target.value)}
                        className={`mt-1 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                        placeholder="Ej: Plan Mensual"
                        maxLength={MAX_NOMBRE_PLAN}
                        disabled={creating}
                        required
                      />
                    </div>

                    {/* Descripción */}

                    <div>
                      <label className={`text-xs font-semibold ${labelText}`}>
                        Descripción
                        <span className={`ml-1 font-normal ${helperText}`}>(opcional)</span>
                      </label>

                      <textarea
                        value={plan.descripcion}
                        onChange={(e) => updatePlan(index, "descripcion", e.target.value)}
                        className={`mt-1 w-full min-h-24 resize-y rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
                        placeholder="Ej: Plan base de entrenamiento mensual."
                        maxLength={MAX_DESCRIPCION_PLAN}
                        disabled={creating}
                      />

                      <div className={`text-[11px] mt-1 text-right ${helperText}`}>
                        {plan.descripcion.length}/{MAX_DESCRIPCION_PLAN}
                      </div>
                    </div>

                    {/* Periodicidad / Estado */}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={`text-xs font-semibold ${labelText}`}>Periodicidad</label>

                        <input
                          value={plan.periodicidad}
                          onChange={(e) => updatePlan(index, "periodicidad", e.target.value.toUpperCase())}
                          className={`mt-1 w-full rounded-xl px-4 py-3 border outline-none transition uppercase ${modalInput}`}
                          placeholder="MENSUAL"
                          maxLength={MAX_PERIODICIDAD}
                          disabled={creating}
                          required
                        />

                        <p className={`text-[11px] mt-1 ${helperText}`}>Por defecto: MENSUAL.</p>
                      </div>

                      <div>
                        <label className={`text-xs font-semibold ${labelText}`}>Estado</label>

                        <select
                          value={plan.estado_id}
                          onChange={(e) => updatePlan(index, "estado_id", e.target.value)}
                          className={`mt-1 ${selectDark}`}
                          disabled={creating}
                        >
                          <option value="1">Activado</option>

                          <option value="2">Desactivado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ===============================================
              RESUMEN
          =============================================== */}

          <section className={`rounded-2xl border px-4 py-3 ${sectionCard}`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-extrabold">{form.sucursales.length}</div>

                <div className={`text-xs ${helperText}`}>Sucursales</div>
              </div>

              <div>
                <div className="text-xl font-extrabold">{form.planes.length}</div>

                <div className={`text-xs ${helperText}`}>Planes iniciales</div>
              </div>

              <div>
                <div className="text-xl font-extrabold">{rutPreview ? "✓" : "—"}</div>

                <div className={`text-xs ${helperText}`}>RUT</div>
              </div>
            </div>
          </section>

          {/* ===============================================
              MENSAJES
          =============================================== */}

          {msg && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${msgBox}`}>{msg}</div>}

          {/* ===============================================
              BOTONES
          =============================================== */}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeCreateModal}
              className={[
                "rounded-xl px-5 py-3 border font-bold transition",

                darkMode
                  ? "bg-white/10 border-white/15 hover:bg-white/15 text-white"
                  : "bg-white/60 border-ra-marron/15 hover:bg-white/80 text-ra-marron",
              ].join(" ")}
              disabled={creating}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="rounded-xl px-6 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={creating || !deportesReady || !form.deporte_id || !form.rut_academia}
              title={
                !deportesReady
                  ? "Cargando deportes…"
                  : !form.rut_academia
                    ? "Ingresa el RUT de la academia"
                    : !form.deporte_id
                      ? "Selecciona un deporte"
                      : ""
              }
            >
              {creating ? "Creando academia…" : "Crear academia"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
