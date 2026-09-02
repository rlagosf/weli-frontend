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

/* =========================================================
   PALETA
========================================================= */

const PALETTE = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

/* =========================================================
   CONSTANTES NEGOCIO
========================================================= */

const ESTADO_JUGADOR_ACTIVO = 1;

const SITUACION_PAGO_PAGADO_ID = 1;

/* =========================================================
   PAGINACIÓN
========================================================= */

const PAGE_SIZE = 10;

const MAX_PAGES = 200;

const MANUAL_PAGE_SIZE = 10;

/* =========================================================
   HELPERS GENERALES
========================================================= */

const asList = (raw) => {
  if (!raw) return [];

  const data = raw?.data ?? raw;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
};

const buildIdNameMap = (arr, idKey = "id", nameKey = "nombre") => {
  const map = new Map();

  for (const item of Array.isArray(arr) ? arr : []) {
    const id = item?.[idKey];

    const nombre = item?.[nameKey] ?? String(id ?? "—");

    if (id != null) {
      map.set(String(id), String(nombre).trim());
    }
  }

  return map;
};

const normalizeCatalog = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((item) => ({
      id: Number(
        item?.id ??
          item?.posicion_id ??
          item?.categoria_id ??
          item?.establec_educ_id ??
          item?.prevision_medica_id ??
          item?.estado_id ??
          item?.sucursal_id ??
          item?.comuna_id
      ),

      nombre: String(item?.nombre ?? item?.descripcion ?? "").trim(),
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.nombre);

/* =========================================================
   PLANES
========================================================= */

const normalizePlanes = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((item) => {
      const id = Number(item?.id ?? item?.plan_id ?? 0);

      return {
        ...item,

        id,

        nombre: String(item?.nombre ?? item?.plan_nombre ?? item?.descripcion ?? `Plan ${id}`).trim(),
      };
    })
    .filter((item) => Number.isInteger(item.id) && item.id > 0);

/* =========================================================
   TARIFAS
========================================================= */

const normalizeTarifas = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((item) => {
      const id = Number(item?.id ?? item?.tarifa_id ?? 0);

      const planId = Number(item?.plan_id ?? item?.plan?.id ?? 0);

      const tipoPagoId = Number(item?.tipo_pago_id ?? item?.tipo_pago?.id ?? 0);

      const monto = Number(item?.monto ?? item?.monto_total ?? item?.valor ?? 0);

      return {
        ...item,

        id,

        plan_id: Number.isInteger(planId) && planId > 0 ? planId : null,

        tipo_pago_id: Number.isInteger(tipoPagoId) && tipoPagoId > 0 ? tipoPagoId : null,

        monto: Number.isFinite(monto) ? monto : 0,

        nombre: String(item?.nombre ?? item?.tarifa_nombre ?? item?.descripcion ?? `Tarifa ${id}`).trim(),
      };
    })
    .filter((item) => Number.isInteger(item.id) && item.id > 0);

/* =========================================================
   ASIGNACIONES JUGADOR → PLAN
========================================================= */

const normalizeJugadorPlanes = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((item) => {
      const id = Number(item?.id ?? item?.jugador_plan_id ?? 0);

      const jugadorId = Number(item?.jugador_id ?? item?.jugador?.id ?? 0);

      const planId = Number(item?.plan_id ?? item?.plan?.id ?? 0);

      const rut = item?.jugador_rut ?? item?.rut_jugador ?? item?.jugador?.rut_jugador ?? null;

      return {
        ...item,

        id: Number.isInteger(id) && id > 0 ? id : null,

        jugador_id: Number.isInteger(jugadorId) && jugadorId > 0 ? jugadorId : null,

        plan_id: Number.isInteger(planId) && planId > 0 ? planId : null,

        jugador_rut: rut != null ? String(rut) : null,
      };
    })
    .filter((item) => item.plan_id);

/* =========================================================
   CARGOS
========================================================= */

const normalizeCargos = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((item) => {
      const id = Number(item?.id ?? item?.cargo_id ?? 0);

      const jugadorId = Number(item?.jugador_id ?? item?.jugador?.id ?? 0);

      const jugadorPlanId = Number(item?.jugador_plan_id ?? item?.jugador_plan?.id ?? 0);

      const planId = Number(item?.plan_id ?? item?.plan?.id ?? item?.jugador_plan?.plan_id ?? 0);

      const tarifaId = Number(item?.tarifa_id ?? item?.tarifa?.id ?? 0);

      const tipoPagoId = Number(item?.tipo_pago_id ?? item?.tipo_pago?.id ?? item?.tarifa?.tipo_pago_id ?? 0);

      const montoTotal = Number(item?.monto_total ?? item?.monto ?? item?.total ?? 0);

      const saldoRaw = item?.saldo ?? item?.saldo_pendiente ?? item?.monto_pendiente ?? null;

      const saldo = saldoRaw == null ? null : Number(saldoRaw);

      const rut = item?.jugador_rut ?? item?.rut_jugador ?? item?.jugador?.rut_jugador ?? null;

      return {
        ...item,

        id: Number.isInteger(id) && id > 0 ? id : null,

        jugador_id: Number.isInteger(jugadorId) && jugadorId > 0 ? jugadorId : null,

        jugador_plan_id: Number.isInteger(jugadorPlanId) && jugadorPlanId > 0 ? jugadorPlanId : null,

        plan_id: Number.isInteger(planId) && planId > 0 ? planId : null,

        tarifa_id: Number.isInteger(tarifaId) && tarifaId > 0 ? tarifaId : null,

        tipo_pago_id: Number.isInteger(tipoPagoId) && tipoPagoId > 0 ? tipoPagoId : null,

        monto_total: Number.isFinite(montoTotal) ? montoTotal : 0,

        saldo: Number.isFinite(saldo) ? saldo : null,

        jugador_rut: rut != null ? String(rut) : null,

        descripcion: String(item?.descripcion ?? item?.concepto ?? item?.nombre ?? `Cargo #${id}`).trim(),
      };
    })
    .filter((item) => item.id);

/* =========================================================
   AUTH
========================================================= */

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);

  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;

  const parsed = Number(rawRol);

  return Number.isFinite(parsed) ? parsed : 0;
};

const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const direct = Number(raw);

    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0);

    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const buildHeaders = (rol) => {
  const token = getToken();

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  if (rol === 3) {
    const academiaId = getAcademiaIdFromStorage();

    if (academiaId) {
      headers["x-academia-id"] = String(academiaId);
    }
  }

  return headers;
};

/* =========================================================
   API FALLBACK
========================================================= */

const tryGetList = async (paths, { signal, headers }) => {
  const variants = [];

  for (const path of paths) {
    variants.push(path.endsWith("/") ? path : `${path}/`);

    variants.push(path.endsWith("/") ? path.slice(0, -1) : path);
  }

  const unique = [...new Set(variants)];

  for (const url of unique) {
    try {
      const response = await api.get(url, {
        signal,
        headers,
      });

      return asList(response);
    } catch (error) {
      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  return [];
};

const getWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.get(url, {
        signal,
        headers,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("GET failed");
};

const postWithFallback = async (path, body, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        signal,
        headers,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("POST failed");
};

const putWithFallback = async (path, body, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.put(url, body, {
        signal,
        headers,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("PUT failed");
};

const deleteWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.delete(url, {
        signal,
        headers,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("DELETE failed");
};

/* =========================================================
   NORMALIZAR PAGOS
========================================================= */

const normalizePagos = (
  arr,
  { tipoPagoMap, medioPagoMap, situacionPagoMap, jugadoresMap, cargosMap, planesMap, tarifasMap }
) => {
  const list = Array.isArray(arr) ? arr : [];

  const safeInt = (value) => {
    const number = value == null ? NaN : Number(value);

    return Number.isFinite(number) ? number : null;
  };

  const safeId = (value) => {
    const number = value == null ? NaN : Number(value);

    return Number.isFinite(number) && number > 0 ? number : null;
  };

  return list.map((pago) => {
    const tipoId = safeInt(pago?.tipo_pago_id ?? pago?.tipo_id ?? pago?.tipoPagoId ?? pago?.tipo_pago?.id);

    const medioId = safeInt(pago?.medio_pago_id ?? pago?.medio_id ?? pago?.medioPagoId ?? pago?.medio_pago?.id);

    const situacionId = safeInt(
      pago?.situacion_pago_id ?? pago?.estado_pago_id ?? pago?.estado_id ?? pago?.situacion_pago?.id
    );

    const cargoId = safeId(pago?.cargo_id ?? pago?.cargo?.id);

    const cargo = cargoId ? (cargosMap.get(String(cargoId)) ?? null) : null;

    const tarifaId = safeId(pago?.tarifa_id ?? pago?.tarifa?.id ?? cargo?.tarifa_id);

    const tarifa = tarifaId ? (tarifasMap.get(String(tarifaId)) ?? null) : null;

    const planId = safeId(pago?.plan_id ?? pago?.plan?.id ?? cargo?.plan_id ?? tarifa?.plan_id);

    const plan = planId ? (planesMap.get(String(planId)) ?? null) : null;

    const rut =
      pago?.jugador_rut ?? pago?.rut_jugador ?? pago?.rut ?? pago?.jugador?.rut_jugador ?? pago?.jugador?.rut ?? null;

    const jugadorMap = rut != null ? jugadoresMap.get(String(rut)) : null;

    const jugador = pago?.jugador ?? {};

    const jugadorNombre =
      jugador?.nombre_jugador ??
      jugador?.nombre ??
      jugador?.nombre_completo ??
      jugadorMap?.nombre ??
      pago?.jugador_nombre ??
      pago?.nombre_jugador ??
      "—";

    const categoriaNombre =
      jugador?.categoria?.nombre ?? jugador?.categoria_nombre ?? jugadorMap?.categoria?.nombre ?? "Sin categoría";

    const fecha = pago?.fecha_pago ?? pago?.fecha ?? null;

    const tipoNombre =
      pago?.tipo_pago?.nombre ??
      pago?.tipo_pago_nombre ??
      (tipoId != null ? (tipoPagoMap.get(String(tipoId)) ?? String(tipoId)) : "—");

    const medioNombre =
      pago?.medio_pago?.nombre ??
      pago?.medio_pago_nombre ??
      (medioId != null ? (medioPagoMap.get(String(medioId)) ?? String(medioId)) : "—");

    const situacionNombre =
      pago?.situacion_pago?.nombre ??
      pago?.estado_pago_nombre ??
      pago?.estado_nombre ??
      (situacionId != null ? (situacionPagoMap.get(String(situacionId)) ?? String(situacionId)) : "—");

    const id = safeId(pago?.id ?? pago?.ID ?? pago?.pago_id ?? pago?.pagoId ?? pago?.id_pago);

    return {
      ...pago,

      id,

      cargo_id: cargoId,

      tarifa_id: tarifaId,

      plan_id: planId,

      monto: Number(pago?.monto ?? 0),

      fecha_pago: fecha,

      jugador: {
        rut_jugador: rut ?? "—",

        nombre_jugador: jugadorNombre,

        categoria: {
          nombre: categoriaNombre,
        },
      },

      plan: {
        id: planId,

        nombre: pago?.plan?.nombre ?? plan?.nombre ?? "—",
      },

      tarifa: {
        id: tarifaId,

        nombre: pago?.tarifa?.nombre ?? tarifa?.nombre ?? "—",
      },

      tipo_pago: {
        id: tipoId,

        nombre: tipoNombre,
      },

      situacion_pago: {
        id: situacionId,

        nombre: situacionNombre,
      },

      medio_pago: {
        id: medioId,

        nombre: medioNombre,
      },

      observaciones: pago?.observaciones ?? "",
    };
  });
};

/* =========================================================
   COMPONENTE
========================================================= */

export default function ListarPagos() {
  const { darkMode } = useTheme();

  const navigate = useNavigate();

  const location = useLocation();

  useMobileAutoScrollTop();

  const dashboardBase = useMemo(() => {
    const path = location.pathname || "";

    return path.startsWith("/super-dashboard/admin/dashboard") ? "/super-dashboard/admin/dashboard" : "/admin";
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

  const [planes, setPlanes] = useState([]);

  const [tarifas, setTarifas] = useState([]);

  const [jugadorPlanes, setJugadorPlanes] = useState([]);

  const [cargos, setCargos] = useState([]);

  const [filtroTexto, setFiltroTexto] = useState("");

  const [filtroEstado, setFiltroEstado] = useState("");

  const [filtroTipoPago, setFiltroTipoPago] = useState("");

  const [filtroMedioPago, setFiltroMedioPago] = useState("");

  const [page, setPage] = useState(1);

  const [manualFiltro, setManualFiltro] = useState("");

  const [manualPage, setManualPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);

  const [editBusy, setEditBusy] = useState(false);

  const [editError, setEditError] = useState("");

  const [successOpen, setSuccessOpen] = useState(false);

  const [successMsg, setSuccessMsg] = useState("");

  const [reloadBusy, setReloadBusy] = useState(false);

  const [editForm, setEditForm] = useState({
    id: null,

    create: false,

    jugador_rut: "",

    plan_id: "",

    tarifa_id: "",

    cargo_id: "",

    monto: "",

    fecha_pago: "",

    tipo_pago_id: "",

    medio_pago_id: "",

    situacion_pago_id: "",

    observaciones: "",
  });

  /* =======================================================
     AUTH
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

      if (![1, 3].includes(rol)) {
        navigate(dashboardBase, {
          replace: true,
        });

        return;
      }

      if (rol === 3) {
        const academiaId = getAcademiaIdFromStorage();

        if (!academiaId) {
          throw new Error("missing-academia-target");
        }

        setAcademiaTarget(academiaId);
      }

      setRolActual(rol);
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate, dashboardBase]);

  /* =======================================================
     BREADCRUMB
  ======================================================= */

  useEffect(() => {
    if (breadcrumbBootRef.current) {
      return;
    }

    const currentPath = location.pathname + location.search;

    const breadcrumb = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];

    const last = breadcrumb[breadcrumb.length - 1];

    const label = "Pagos centralizados";

    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;

      navigate(currentPath, {
        replace: true,

        state: {
          ...(location.state || {}),

          breadcrumb: [
            {
              label,

              to: location.pathname,
            },
          ],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* =======================================================
     CAMBIO ACADEMIA SUPERADMIN
  ======================================================= */

  useEffect(() => {
    const sync = () => setAcademiaTarget(getAcademiaIdFromStorage());

    const onStorage = (event) => {
      if (event?.key === ACADEMIA_STORAGE_KEY) {
        sync();
      }
    };

    let last = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");

    const timer = setInterval(() => {
      const current = String(localStorage.getItem(ACADEMIA_STORAGE_KEY) ?? "");

      if (current !== last) {
        last = current;

        sync();
      }
    }, 800);

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);

      clearInterval(timer);
    };
  }, []);

  /* =======================================================
     MAPS
  ======================================================= */

  const planesMap = useMemo(() => new Map(planes.map((plan) => [String(plan.id), plan])), [planes]);

  const tarifasMap = useMemo(() => new Map(tarifas.map((tarifa) => [String(tarifa.id), tarifa])), [tarifas]);

  const cargosMap = useMemo(() => new Map(cargos.map((cargo) => [String(cargo.id), cargo])), [cargos]);

  /* =======================================================
     CARGA
  ======================================================= */

  useEffect(() => {
    if (!rolActual) {
      return;
    }

    if (rolActual === 3 && !academiaTarget) {
      return;
    }

    const abort = new AbortController();

    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);

      setError("");

      try {
        const [
          tipos,
          medios,
          situaciones,
          jugadoresList,
          categoriasRaw,
          sucursalesRaw,
          planesRaw,
          tarifasRaw,
          jugadorPlanesRaw,
          cargosRaw,
        ] = await Promise.all([
          tryGetList(["/tipo-pago", "/tipo_pago"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/medio-pago", "/medio_pago"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/situacion-pago", "/situacion_pago", "/estado-pago", "/estado_pago"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/jugadores"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/categorias"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/sucursales-real", "/sucursales-real/"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/planes"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/plan-tarifas"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/jugador-planes"], {
            signal: abort.signal,

            headers,
          }),

          tryGetList(["/cargos-jugador"], {
            signal: abort.signal,

            headers,
          }),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        const tipoMap = buildIdNameMap(tipos, "id", "nombre");

        const medioMap = buildIdNameMap(medios, "id", "nombre");

        const situMap = buildIdNameMap(situaciones, "id", "nombre");

        setTipoPagoMap(tipoMap);

        setMedioPagoMap(medioMap);

        setSituacionPagoMap(situMap);

        const planesN = normalizePlanes(planesRaw);

        const tarifasN = normalizeTarifas(tarifasRaw);

        const jugadorPlanesN = normalizeJugadorPlanes(jugadorPlanesRaw);

        const cargosN = normalizeCargos(cargosRaw);

        setPlanes(planesN);

        setTarifas(tarifasN);

        setJugadorPlanes(jugadorPlanesN);

        setCargos(cargosN);

        const planesMapLocal = new Map(planesN.map((plan) => [String(plan.id), plan]));

        const tarifasMapLocal = new Map(tarifasN.map((tarifa) => [String(tarifa.id), tarifa]));

        const cargosMapLocal = new Map(cargosN.map((cargo) => [String(cargo.id), cargo]));

        const categorias = normalizeCatalog(categoriasRaw);

        const sucursales = normalizeCatalog(sucursalesRaw);

        const catMap = new Map(categorias.map((categoria) => [Number(categoria.id), categoria.nombre]));

        const sucMap = new Map(sucursales.map((sucursal) => [Number(sucursal.id), sucursal.nombre]));

        const activos = (Array.isArray(jugadoresList) ? jugadoresList : []).filter((jugador) => {
          const estadoId = Number(jugador?.estado_id ?? jugador?.estadoId ?? jugador?.estado ?? 0);

          return estadoId === ESTADO_JUGADOR_ACTIVO;
        });

        const jugadorMap = new Map();

        for (const jugador of activos) {
          const rut = jugador?.rut_jugador ?? jugador?.rut ?? null;

          if (rut == null) {
            continue;
          }

          const jugadorId = Number(jugador?.id ?? jugador?.jugador_id ?? 0);

          const categoriaId = jugador?.categoria_id ?? jugador?.categoria?.id ?? null;

          const categoriaNombre =
            jugador?.categoria?.nombre ??
            jugador?.categoria_nombre ??
            (categoriaId != null ? (catMap.get(Number(categoriaId)) ?? String(categoriaId)) : null) ??
            "Sin categoría";

          const sucursalId = jugador?.sucursal_id ?? jugador?.sucursal?.id ?? jugador?.id_sucursal ?? null;

          const sucursalNombre =
            jugador?.sucursal?.nombre ??
            jugador?.sucursal_nombre ??
            jugador?.nombre_sucursal ??
            (sucursalId != null ? sucMap.get(Number(sucursalId)) : null) ??
            (sucursalId != null ? `Sucursal ${sucursalId}` : null) ??
            "Sin sucursal";

          jugadorMap.set(String(rut), {
            id: Number.isInteger(jugadorId) && jugadorId > 0 ? jugadorId : null,

            nombre: jugador?.nombre_jugador ?? jugador?.nombre ?? jugador?.nombre_completo ?? "—",

            categoria: {
              id: categoriaId,

              nombre: categoriaNombre,
            },

            sucursal: {
              id: sucursalId,

              nombre: sucursalNombre,
            },
          });
        }

        setJugadoresMap(jugadorMap);

        const respEstado = await getWithFallback("/pagos-jugador/estado-cuenta", {
          signal: abort.signal,

          headers,
        });

        if (abort.signal.aborted) {
          return;
        }

        const rawPagos = Array.isArray(respEstado?.data?.pagos) ? respEstado.data.pagos : [];

        const rutsActivos = new Set(Array.from(jugadorMap.keys()));

        const rawPagosActivos = rawPagos.filter((pago) => {
          const rut =
            pago?.jugador_rut ?? pago?.rut_jugador ?? pago?.rut ?? pago?.jugador?.rut_jugador ?? pago?.jugador?.rut;

          return rut != null && rutsActivos.has(String(rut));
        });

        setPagos(
          normalizePagos(rawPagosActivos, {
            tipoPagoMap: tipoMap,

            medioPagoMap: medioMap,

            situacionPagoMap: situMap,

            jugadoresMap: jugadorMap,

            cargosMap: cargosMapLocal,

            planesMap: planesMapLocal,

            tarifasMap: tarifasMapLocal,
          })
        );
      } catch (errorCarga) {
        if (abort.signal.aborted) {
          return;
        }

        const status = errorCarga?.status ?? errorCarga?.response?.status;

        const message = String(errorCarga?.message ?? "").toLowerCase();

        if (status === 401 || status === 403) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (rolActual === 3 && (message.includes("academia") || message.includes("x-academia"))) {
          setError("⚠️ Superadmin: selecciona una academia para ver pagos centralizados.");

          return;
        }

        setError("❌ No se pudieron cargar los pagos centralizados.");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual, academiaTarget]);

  /* =======================================================
     UI RESPONSIVA

     CAMBIOS:
     - tarjetas más anchas
     - sin overflow horizontal
     - sin min-width forzado
     - tablas solo en desktop
     - cards en mobile/tablet
  ======================================================= */

  const ui = useMemo(() => {
    const page = "min-h-[calc(100vh-100px)] w-full font-sans bg-transparent px-2 sm:px-4 lg:px-6 2xl:px-8 pt-3 pb-16";

    const content = "w-full max-w-[1600px] mx-auto";

    const title = darkMode ? "text-white" : "text-ra-marron";

    const subtitle = darkMode ? "text-white/70" : "text-ra-marron/70";

    const msgBox =
      "rounded-xl border px-4 py-3 font-semibold text-sm " +
      (darkMode ? "border-red-200/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

    const warnBox =
      "rounded-xl border px-4 py-3 font-semibold text-sm " +
      (darkMode ? "border-amber-200/20 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-800");

    /*
     * CAMBIO:
     * ya no max-w-6xl.
     */
    const card =
      "w-full max-w-[1600px] mx-auto rounded-xl shadow-[0_14px_40px_rgba(0,0,0,0.18)] border " +
      (darkMode ? "bg-white/8 border-white/12" : "bg-white/55 border-ra-marron/12");

    const cardPad = "p-3 sm:p-4";

    const line = darkMode ? "rgba(255,255,255,0.14)" : "rgba(109,88,41,0.18)";

    const border = `1px solid ${line}`;

    /*
     * SIN overflow-x-auto.
     */
    const tableWrap = "w-full";

    /*
     * SIN min-w.
     *
     * table-fixed fuerza distribución dentro
     * del ancho real disponible.
     */
    const table = "w-full table-fixed text-[10px] 2xl:text-[11px] border-separate border-spacing-0";

    const thead = "text-[9px] 2xl:text-[10px] " + (darkMode ? "bg-black/20" : "bg-ra-cream/90");

    const thBase =
      "py-2 px-1.5 text-center font-extrabold leading-tight " + (darkMode ? "text-[#ffdda1]" : "text-[#6d5829]");

    /*
     * break-words / whitespace-normal permiten
     * que las columnas no ensanchen la tabla.
     */
    const tdBase =
      "py-2 px-1.5 text-center align-middle whitespace-normal break-words leading-tight " +
      (darkMode ? "text-white/90" : "text-ra-marron");

    const tr = "transition " + (darkMode ? "hover:bg-white/7" : "hover:bg-white/70");

    const cellBorderStyle = {
      borderRight: border,

      borderBottom: border,
    };

    const headBorderStyle = {
      borderRight: border,

      borderBottom: border,

      borderTop: border,
    };

    const controlBase =
      "w-full h-10 px-3 rounded-md text-[12px] outline-none transition " +
      (darkMode
        ? "border border-white/20 bg-[#111827] text-white placeholder:text-white/50 focus:border-[#ffdda1] focus:ring-2 focus:ring-[#ffdda1]/20 [&>option]:bg-[#111827] [&>option]:text-white"
        : "border border-[#9b7b50] bg-white text-[#3f2d18] placeholder:text-[#7b6750] focus:border-[#aa5013] focus:ring-2 focus:ring-[#aa5013]/15 [&>option]:bg-white [&>option]:text-[#3f2d18]");

    const controlDisabled = darkMode
      ? "disabled:bg-[#1f2937] disabled:text-white/70 disabled:border-white/10"
      : "disabled:bg-[#eee7dc] disabled:text-[#67594a] disabled:border-[#c8b79f]";

    const controlTextArea =
      "w-full min-h-[80px] rounded-md p-2.5 text-[12px] outline-none transition " +
      (darkMode
        ? "border border-white/20 bg-[#111827] text-white placeholder:text-white/50 focus:border-[#ffdda1] focus:ring-2 focus:ring-[#ffdda1]/20"
        : "border border-[#9b7b50] bg-white text-[#3f2d18] placeholder:text-[#7b6750] focus:border-[#aa5013] focus:ring-2 focus:ring-[#aa5013]/15");

    const modalLabel =
      "block text-[10px] sm:text-[11px] mb-0.5 sm:mb-1 font-bold " + (darkMode ? "text-[#f5e7d0]" : "text-[#4a351f]");

    const modalHelp = "text-[10px] mt-1 " + (darkMode ? "text-[#d6c7b2]" : "text-[#6d5829]");

    const btnPrimary =
      "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-extrabold text-[12px] transition disabled:opacity-50 disabled:cursor-not-allowed";

    const btnPrimaryStyle = {
      backgroundColor: PALETTE.sand,

      color: PALETTE.brown,

      boxShadow: darkMode ? "0 10px 26px rgba(0,0,0,0.22)" : "0 10px 26px rgba(109,88,41,0.14)",
    };

    const btnSecondary =
      "px-3 py-2 rounded-md border transition font-semibold text-[12px] " +
      (darkMode
        ? "border-white/18 hover:bg-white/8 text-white"
        : "border-ra-marron/18 hover:bg-white/70 text-ra-marron") +
      " disabled:opacity-50 disabled:cursor-not-allowed";

    const badge =
      "text-[10px] sm:text-[11px] inline-flex items-center gap-2 rounded-full px-2.5 py-1 border font-semibold " +
      (darkMode ? "bg-white/8 border-white/10 text-white/80" : "bg-white/60 border-ra-marron/10 text-ra-marron/80");

    /*
     * Tarjetas mobile.
     */
    const mobileCard =
      "rounded-xl border p-3 sm:p-4 shadow-sm " +
      (darkMode ? "bg-black/15 border-white/12" : "bg-white/65 border-ra-marron/15");

    const mobileLabel =
      "text-[10px] uppercase tracking-wide font-bold " + (darkMode ? "text-white/50" : "text-ra-marron/55");

    const mobileValue =
      "text-[12px] sm:text-[13px] font-semibold break-words " + (darkMode ? "text-white/90" : "text-ra-marron");

    const pill = (estadoRaw) => {
      const estado = String(estadoRaw ?? "")
        .trim()
        .toUpperCase();

      if (estado === "PAGADO") {
        return darkMode
          ? "bg-emerald-500/15 text-emerald-100 border border-emerald-300/20"
          : "bg-emerald-100 text-emerald-800 border border-emerald-300";
      }

      if (estado === "VENCIDO") {
        return darkMode
          ? "bg-red-500/15 text-red-100 border border-red-300/20"
          : "bg-red-100 text-red-800 border border-red-300";
      }

      return darkMode
        ? "bg-white/10 text-white/90 border border-white/12"
        : "bg-stone-100 text-stone-700 border border-stone-300";
    };

    const modalCard =
      "w-[98%] sm:w-[94%] max-w-2xl rounded-xl shadow-[0_16px_60px_rgba(0,0,0,0.45)] border backdrop-blur-md overflow-hidden " +
      (darkMode ? "bg-[#111827] border-white/20 text-white" : "bg-[#fffaf2] border-[#b99a70] text-[#3f2d18]");

    return {
      page,
      content,
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

      controlBase: `${controlBase} ${controlDisabled}`,

      controlTextArea: `${controlTextArea} ${controlDisabled}`,

      modalLabel,
      modalHelp,
      btnPrimary,
      btnPrimaryStyle,
      btnSecondary,
      badge,
      mobileCard,
      mobileLabel,
      mobileValue,
      pill,
      modalCard,
    };
  }, [darkMode]);

  /* =======================================================
     CLP
  ======================================================= */

  const toCLP = (value) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",

      currency: "CLP",

      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  /* =======================================================
     FILAS PAGOS REALES
  ======================================================= */

  const filas = useMemo(() => {
    const seen = new Set();

    const rows = [];

    for (const pago of pagos) {
      const rut = String(pago?.jugador?.rut_jugador ?? "");

      if (!rut) {
        continue;
      }

      const id = Number(pago?.id ?? 0);

      const safeId = Number.isFinite(id) && id > 0 ? id : null;

      const key = safeId
        ? `PAGO-${safeId}`
        : ["PAGO", rut, pago?.cargo_id ?? "", pago?.fecha_pago ?? "", pago?.monto ?? ""].join("-");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const fecha = pago?.fecha_pago ? new Date(pago.fecha_pago) : null;

      const timestamp = fecha && !Number.isNaN(fecha.getTime()) ? fecha.getTime() : 0;

      rows.push({
        key,

        id: safeId,

        rut,

        nombre: pago?.jugador?.nombre_jugador ?? "—",

        categoria: pago?.jugador?.categoria?.nombre ?? "Sin categoría",

        estado: pago?.situacion_pago?.nombre ?? "—",

        pago,

        ts: timestamp,
      });
    }

    rows.sort((a, b) => b.ts - a.ts);

    return rows;
  }, [pagos]);

  /* =======================================================
     FILTROS
  ======================================================= */

  const opcionesTipoPago = useMemo(
    () =>
      Array.from(tipoPagoMap, ([value, label]) => ({
        value,
        label,
      })),
    [tipoPagoMap]
  );

  const opcionesMedioPago = useMemo(
    () =>
      Array.from(medioPagoMap, ([value, label]) => ({
        value,
        label,
      })),
    [medioPagoMap]
  );

  const filasFiltradas = useMemo(() => {
    const filtro = (filtroTexto || "").toLowerCase().trim();

    return filas.filter((row) => {
      const pago = row.pago ?? {};

      const rut = row.rut || "";

      const nombre = row.nombre || "";

      const categoria = row.categoria || "";

      const plan = pago?.plan?.nombre ?? "";

      const tarifa = pago?.tarifa?.nombre ?? "";

      let okTexto = true;

      if (filtro) {
        okTexto =
          rut.includes(filtro) ||
          formatRutWithDV(rut).toLowerCase().includes(filtro) ||
          nombre.toLowerCase().includes(filtro) ||
          categoria.toLowerCase().includes(filtro) ||
          plan.toLowerCase().includes(filtro) ||
          tarifa.toLowerCase().includes(filtro);
      }

      let okEstado = true;

      if (filtroEstado) {
        okEstado = (row.estado ?? "").toUpperCase() === filtroEstado.toUpperCase();
      }

      let okTipo = true;

      if (filtroTipoPago) {
        const tipoId = pago?.tipo_pago?.id ? String(pago.tipo_pago.id) : "";

        okTipo = tipoId === filtroTipoPago;
      }

      let okMedio = true;

      if (filtroMedioPago) {
        const medioId = pago?.medio_pago?.id ? String(pago.medio_pago.id) : "";

        okMedio = medioId === filtroMedioPago;
      }

      return okTexto && okEstado && okTipo && okMedio;
    });
  }, [filas, filtroTexto, filtroEstado, filtroTipoPago, filtroMedioPago]);

  const totalPages = useMemo(() => {
    const total = Math.ceil(filasFiltradas.length / PAGE_SIZE);

    return Math.max(1, Math.min(total || 1, MAX_PAGES));
  }, [filasFiltradas]);

  useEffect(() => setPage(1), [filtroTexto, filtroEstado, filtroTipoPago, filtroMedioPago]);

  const pageData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return filasFiltradas.slice(start, start + PAGE_SIZE);
  }, [filasFiltradas, page]);

  /* =======================================================
     JUGADORES MANUALES
  ======================================================= */

  const jugadoresManualRows = useMemo(() => {
    const filtro = (manualFiltro || "").toLowerCase().trim();

    const rows = Array.from(jugadoresMap.entries()).map(([rut, jugador]) => ({
      rut: String(rut),

      id: jugador?.id ?? null,

      nombre: jugador?.nombre ?? "—",

      categoria: jugador?.categoria?.nombre ?? "Sin categoría",

      sucursal: jugador?.sucursal?.nombre ?? "Sin sucursal",
    }));

    const filtrados = !filtro
      ? rows
      : rows.filter((row) => {
          const rutFmt = formatRutWithDV(row.rut).toLowerCase();

          return (
            row.rut.includes(filtro) ||
            rutFmt.includes(filtro) ||
            row.nombre.toLowerCase().includes(filtro) ||
            row.categoria.toLowerCase().includes(filtro) ||
            row.sucursal.toLowerCase().includes(filtro)
          );
        });

    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));

    return filtrados;
  }, [jugadoresMap, manualFiltro]);

  const manualTotalPages = useMemo(() => {
    const total = Math.ceil(jugadoresManualRows.length / MANUAL_PAGE_SIZE);

    return Math.max(1, Math.min(total || 1, MAX_PAGES));
  }, [jugadoresManualRows]);

  useEffect(() => setManualPage(1), [manualFiltro]);

  const manualPageData = useMemo(() => {
    const start = (manualPage - 1) * MANUAL_PAGE_SIZE;

    return jugadoresManualRows.slice(start, start + MANUAL_PAGE_SIZE);
  }, [jugadoresManualRows, manualPage]);

  /* =======================================================
     CONTEXTO FINANCIERO
  ======================================================= */

  const jugadorActual = useMemo(
    () => (editForm.jugador_rut ? (jugadoresMap.get(String(editForm.jugador_rut)) ?? null) : null),
    [editForm.jugador_rut, jugadoresMap]
  );

  const planesJugador = useMemo(() => {
    if (!editForm.jugador_rut) {
      return [];
    }

    const rut = String(editForm.jugador_rut);

    const jugadorId = jugadorActual?.id ?? null;

    const planIds = new Set();

    jugadorPlanes.forEach((asignacion) => {
      const matchId = jugadorId && asignacion.jugador_id === jugadorId;

      const matchRut = asignacion.jugador_rut && String(asignacion.jugador_rut) === rut;

      if ((matchId || matchRut) && asignacion.plan_id) {
        planIds.add(String(asignacion.plan_id));
      }
    });

    cargos.forEach((cargo) => {
      const matchId = jugadorId && cargo.jugador_id === jugadorId;

      const matchRut = cargo.jugador_rut && String(cargo.jugador_rut) === rut;

      if ((matchId || matchRut) && cargo.plan_id) {
        planIds.add(String(cargo.plan_id));
      }
    });

    return Array.from(planIds)
      .map((planId) => planesMap.get(String(planId)))
      .filter(Boolean);
  }, [editForm.jugador_rut, jugadorActual, jugadorPlanes, cargos, planesMap]);

  const tarifasDisponibles = useMemo(() => {
    const planId = Number(editForm.plan_id);

    if (!Number.isInteger(planId) || planId <= 0) {
      return [];
    }

    return tarifas.filter((tarifa) => Number(tarifa.plan_id) === planId);
  }, [editForm.plan_id, tarifas]);

  const cargosDisponibles = useMemo(() => {
    if (!editForm.jugador_rut) {
      return [];
    }

    const rut = String(editForm.jugador_rut);

    const jugadorId = jugadorActual?.id ?? null;

    const planId = Number(editForm.plan_id);

    const tarifaId = Number(editForm.tarifa_id);

    return cargos.filter((cargo) => {
      const matchJugador =
        (jugadorId && cargo.jugador_id === jugadorId) || (cargo.jugador_rut && String(cargo.jugador_rut) === rut);

      if (!matchJugador) {
        return false;
      }

      if (Number.isInteger(planId) && planId > 0 && cargo.plan_id && cargo.plan_id !== planId) {
        return false;
      }

      if (Number.isInteger(tarifaId) && tarifaId > 0 && cargo.tarifa_id && cargo.tarifa_id !== tarifaId) {
        return false;
      }

      if (cargo.saldo != null && cargo.saldo <= 0) {
        return false;
      }

      return true;
    });
  }, [editForm.jugador_rut, editForm.plan_id, editForm.tarifa_id, jugadorActual, cargos]);

  /* =======================================================
     CAMBIOS PLAN/TARIFA/CARGO
  ======================================================= */

  const handlePlanChange = (event) => {
    const planId = event.target.value;

    setEditForm((previous) => ({
      ...previous,

      plan_id: planId,

      tarifa_id: "",

      cargo_id: "",

      tipo_pago_id: "",

      monto: "",
    }));
  };

  const handleTarifaChange = (event) => {
    const tarifaId = event.target.value;

    const tarifa = tarifasMap.get(String(tarifaId));

    setEditForm((previous) => ({
      ...previous,

      tarifa_id: tarifaId,

      cargo_id: "",

      tipo_pago_id: tarifa?.tipo_pago_id ? String(tarifa.tipo_pago_id) : previous.tipo_pago_id,

      monto: tarifa && tarifa.monto > 0 ? String(tarifa.monto) : previous.monto,
    }));
  };

  const handleCargoChange = (event) => {
    const cargoId = event.target.value;

    const cargo = cargosMap.get(String(cargoId));

    if (!cargo) {
      setEditForm((previous) => ({
        ...previous,

        cargo_id: "",
      }));

      return;
    }

    const tarifa = cargo.tarifa_id ? tarifasMap.get(String(cargo.tarifa_id)) : null;

    const monto = cargo.saldo != null && cargo.saldo > 0 ? cargo.saldo : cargo.monto_total;

    setEditForm((previous) => ({
      ...previous,

      cargo_id: String(cargo.id),

      plan_id: cargo.plan_id ? String(cargo.plan_id) : previous.plan_id,

      tarifa_id: cargo.tarifa_id ? String(cargo.tarifa_id) : previous.tarifa_id,

      tipo_pago_id: cargo.tipo_pago_id
        ? String(cargo.tipo_pago_id)
        : tarifa?.tipo_pago_id
          ? String(tarifa.tipo_pago_id)
          : previous.tipo_pago_id,

      monto: Number.isFinite(monto) && monto > 0 ? String(monto) : previous.monto,
    }));
  };

  /* =======================================================
     MODAL
  ======================================================= */

  const openEdit = (row) => {
    const pago = row?.pago;

    if (!pago || !row?.rut) {
      return;
    }

    const id = Number(pago?.id ?? row?.id ?? 0);

    setEditError("");

    setEditForm({
      id: Number.isFinite(id) && id > 0 ? id : null,

      create: false,

      jugador_rut: row.rut,

      plan_id: pago?.plan_id ? String(pago.plan_id) : "",

      tarifa_id: pago?.tarifa_id ? String(pago.tarifa_id) : "",

      cargo_id: pago?.cargo_id ? String(pago.cargo_id) : "",

      monto: pago?.monto ?? "",

      fecha_pago: pago?.fecha_pago ? String(pago.fecha_pago).slice(0, 10) : "",

      tipo_pago_id: pago?.tipo_pago?.id != null ? String(pago.tipo_pago.id) : "",

      medio_pago_id: pago?.medio_pago?.id != null ? String(pago.medio_pago.id) : "",

      situacion_pago_id: pago?.situacion_pago?.id != null ? String(pago.situacion_pago.id) : "",

      observaciones: pago?.observaciones ?? "",
    });

    setEditOpen(true);
  };

  const openManualPago = (rut) => {
    const value = String(rut ?? "").trim();

    if (!value) {
      return;
    }

    setEditError("");

    setEditForm({
      id: null,

      create: true,

      jugador_rut: value,

      plan_id: "",

      tarifa_id: "",

      cargo_id: "",

      monto: "",

      fecha_pago: new Date().toISOString().slice(0, 10),

      tipo_pago_id: "",

      medio_pago_id: "",

      situacion_pago_id: String(SITUACION_PAGO_PAGADO_ID),

      observaciones: "",
    });

    setEditOpen(true);
  };

  const closeEdit = () => {
    if (editBusy || reloadBusy) {
      return;
    }

    setEditOpen(false);
  };

  /* =======================================================
     REFRESH
  ======================================================= */

  const refetchPagosActivos = useCallback(async () => {
    const headers = buildHeaders(rolActual);

    const response = await getWithFallback("/pagos-jugador/estado-cuenta", {
      headers,
    });

    const rawPagos = Array.isArray(response?.data?.pagos) ? response.data.pagos : [];

    const rutsActivos = new Set(Array.from(jugadoresMap.keys()));

    const rawPagosActivos = rawPagos.filter((pago) => {
      const rut =
        pago?.jugador_rut ?? pago?.rut_jugador ?? pago?.rut ?? pago?.jugador?.rut_jugador ?? pago?.jugador?.rut;

      return rut != null && rutsActivos.has(String(rut));
    });

    setPagos(
      normalizePagos(rawPagosActivos, {
        tipoPagoMap,
        medioPagoMap,
        situacionPagoMap,
        jugadoresMap,
        cargosMap,
        planesMap,
        tarifasMap,
      })
    );
  }, [jugadoresMap, tipoPagoMap, medioPagoMap, situacionPagoMap, cargosMap, planesMap, tarifasMap, rolActual]);

  const showSuccessAndReload = useCallback(
    async (message) => {
      setSuccessMsg(message);

      setSuccessOpen(true);

      await new Promise((resolve) => setTimeout(resolve, 900));

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

  /* =======================================================
     GUARDAR
  ======================================================= */

  const submitEdit = async (event) => {
    event.preventDefault();

    if (!editForm.jugador_rut) {
      setEditError("RUT inválido.");

      return;
    }

    const isCreate = Boolean(editForm.create);

    if (isCreate && !editForm.plan_id) {
      setEditError("Selecciona el plan asociado al jugador.");

      return;
    }

    if (isCreate && !editForm.tarifa_id) {
      setEditError("Selecciona una tarifa.");

      return;
    }

    const monto = Number(editForm.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      setEditError("El monto debe ser mayor a 0.");

      return;
    }

    if (!editForm.fecha_pago) {
      setEditError("La fecha de pago es obligatoria.");

      return;
    }

    if (!editForm.medio_pago_id) {
      setEditError("Seleccione medio de pago.");

      return;
    }

    if (!editForm.tipo_pago_id) {
      setEditError("La tarifa seleccionada no tiene un tipo de pago válido.");

      return;
    }

    if (!editForm.situacion_pago_id) {
      setEditError("Seleccione situación.");

      return;
    }

    const payload = {
      jugador_rut: editForm.jugador_rut,

      ...(editForm.cargo_id
        ? {
            cargo_id: Number(editForm.cargo_id),
          }
        : {}),

      monto,

      fecha_pago: editForm.fecha_pago,

      tipo_pago_id: Number(editForm.tipo_pago_id),

      medio_pago_id: Number(editForm.medio_pago_id),

      situacion_pago_id: Number(editForm.situacion_pago_id),

      observaciones: editForm.observaciones ?? "",
    };

    setEditBusy(true);

    setEditError("");

    const headers = buildHeaders(rolActual);

    try {
      if (isCreate) {
        await postWithFallback("/pagos-jugador", payload, {
          headers,
        });

        setEditOpen(false);

        await showSuccessAndReload("Pago registrado correctamente");

        return;
      }

      const id = Number(editForm.id);

      if (!Number.isFinite(id) || id <= 0) {
        setEditError("ID de pago inválido.");

        return;
      }

      await putWithFallback(`/pagos-jugador/${id}`, payload, {
        headers,
      });

      setPagos((previous) =>
        previous.map((pago) => {
          if (Number(pago?.id) !== id) {
            return pago;
          }

          return {
            ...pago,

            monto,

            fecha_pago: payload.fecha_pago,

            cargo_id: payload.cargo_id ?? pago.cargo_id,

            tipo_pago: {
              id: payload.tipo_pago_id,

              nombre: tipoPagoMap.get(String(payload.tipo_pago_id)) ?? pago.tipo_pago?.nombre,
            },

            medio_pago: {
              id: payload.medio_pago_id,

              nombre: medioPagoMap.get(String(payload.medio_pago_id)) ?? pago.medio_pago?.nombre,
            },

            situacion_pago: {
              id: payload.situacion_pago_id,

              nombre: situacionPagoMap.get(String(payload.situacion_pago_id)) ?? pago.situacion_pago?.nombre,
            },

            observaciones: payload.observaciones,
          };
        })
      );

      setEditOpen(false);

      await showSuccessAndReload("Registro actualizado");
    } catch (errorSubmit) {
      const status = errorSubmit?.status ?? errorSubmit?.response?.status;

      if (status === 401 || status === 403) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      setEditError(errorSubmit?.response?.data?.message ?? errorSubmit?.message ?? "No se pudo guardar el pago.");
    } finally {
      setEditBusy(false);
    }
  };

  /* =======================================================
     ELIMINAR
  ======================================================= */

  const removePago = async (row) => {
    const pago = row?.pago;

    if (!pago || !pago.id) {
      return;
    }

    const confirmed = window.confirm(`¿Eliminar el pago #${pago.id}? Esta acción es irreversible.`);

    if (!confirmed) {
      return;
    }

    const headers = buildHeaders(rolActual);

    try {
      await deleteWithFallback(`/pagos-jugador/${pago.id}`, {
        headers,
      });

      setPagos((previous) => previous.filter((item) => Number(item.id) !== Number(pago.id)));
    } catch (errorDelete) {
      const status = errorDelete?.status ?? errorDelete?.response?.status;

      if (status === 401 || status === 403) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      alert(errorDelete?.message ?? "No se pudo eliminar el pago");
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  if (error && !pagos.length) {
    return (
      <div className={`${ui.page} flex justify-center items-center`}>
        <div className={ui.msgBox}>{error}</div>
      </div>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={ui.page}>
      <div className={ui.content}>
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="w-full">
          <div className="text-center">
            <h1 className={`text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tightish ${ui.title}`}>
              Pagos Centralizados
            </h1>

            <p className={`text-[11px] sm:text-xs mt-1 ${ui.subtitle}`}>
              Vista consolidada de pagos reales registrados para jugadores{" "}
              <span className="font-semibold">ACTIVOS</span>. Los planes, tarifas y cargos provienen del modelo
              financiero de WELI.
            </p>
          </div>
        </header>

        <main className="mt-4 w-full">
          {!!error && (
            <div className="w-full mb-3">
              <div className={ui.warnBox}>{error}</div>
            </div>
          )}

          {/* =================================================
              FILTROS
          ================================================= */}

          <div className={`${ui.card} ${ui.cardPad}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>Filtros</h3>

              <span className={ui.badge}>
                Filtrados: {filasFiltradas.length}
                {" · "}
                Página: {page}/{totalPages}
              </span>
            </div>

            <div
              className="mt-3"
              style={{
                height: 1,

                background: ui.line,
              }}
            />

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 w-full">
              <input
                type="text"
                placeholder="Buscar por RUT, nombre, categoría, plan o tarifa"
                value={filtroTexto}
                onChange={(event) => setFiltroTexto(event.target.value)}
                className={ui.controlBase}
              />

              <select
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                className={ui.controlBase}
              >
                <option value="">Estado (todos)</option>

                <option value="PAGADO">PAGADO</option>

                <option value="VENCIDO">VENCIDO</option>
              </select>

              <select
                value={filtroTipoPago}
                onChange={(event) => setFiltroTipoPago(event.target.value)}
                className={ui.controlBase}
              >
                <option value="">Tipo de pago (todos)</option>

                {opcionesTipoPago.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={filtroMedioPago}
                onChange={(event) => setFiltroMedioPago(event.target.value)}
                className={ui.controlBase}
              >
                <option value="">Medio de pago (todos)</option>

                {opcionesMedioPago.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* =================================================
              PAGOS
          ================================================= */}

          <div className={`${ui.card} ${ui.cardPad} mt-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>Tabla de Pagos</h3>

              <span className={ui.badge}>
                Mostrando {pageData.length}
                {" de "}
                {filasFiltradas.length}
              </span>
            </div>

            <div
              className="mt-3"
              style={{
                height: 1,

                background: ui.line,
              }}
            />

            {/* ===============================================
                DESKTOP XL

                SIN SCROLL HORIZONTAL
            =============================================== */}

            <div className="hidden xl:block mt-3 w-full">
              <table className={ui.table}>
                <thead className={ui.thead}>
                  <tr>
                    <th
                      className={`${ui.thBase} w-[9%]`}
                      style={{
                        ...ui.headBorderStyle,
                        borderLeft: ui.border,
                      }}
                    >
                      RUT
                    </th>

                    <th className={`${ui.thBase} w-[15%]`} style={ui.headBorderStyle}>
                      Nombre
                    </th>

                    <th className={`${ui.thBase} w-[11%]`} style={ui.headBorderStyle}>
                      Plan
                    </th>

                    <th className={`${ui.thBase} w-[12%]`} style={ui.headBorderStyle}>
                      Tarifa
                    </th>

                    <th className={`${ui.thBase} w-[10%]`} style={ui.headBorderStyle}>
                      Tipo
                    </th>

                    <th className={`${ui.thBase} w-[8%]`} style={ui.headBorderStyle}>
                      Estado
                    </th>

                    <th className={`${ui.thBase} w-[9%]`} style={ui.headBorderStyle}>
                      Fecha
                    </th>

                    <th className={`${ui.thBase} w-[9%]`} style={ui.headBorderStyle}>
                      Monto
                    </th>

                    <th className={`${ui.thBase} w-[11%]`} style={ui.headBorderStyle}>
                      Medio
                    </th>

                    <th
                      className={`${ui.thBase} w-[6%]`}
                      style={{
                        ...ui.headBorderStyle,
                        borderRight: ui.border,
                      }}
                    >
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {pageData.map((row) => {
                    const pago = row.pago;

                    return (
                      <tr key={row.key} className={ui.tr}>
                        <td
                          className={ui.tdBase}
                          style={{
                            ...ui.cellBorderStyle,

                            borderLeft: ui.border,
                          }}
                        >
                          {row.rut ? formatRutWithDV(row.rut) : "—"}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          {row.nombre}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          {pago?.plan?.nombre ?? "—"}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          {pago?.tarifa?.nombre ?? "—"}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          {pago?.tipo_pago?.nombre ?? "—"}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          <span
                            className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${ui.pill(
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
                          {toCLP(pago?.monto)}
                        </td>

                        <td className={ui.tdBase} style={ui.cellBorderStyle}>
                          {pago?.medio_pago?.nombre ?? "—"}
                        </td>

                        <td
                          className={ui.tdBase}
                          style={{
                            ...ui.cellBorderStyle,

                            borderRight: ui.border,
                          }}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEdit(row)}
                              className="p-1 rounded hover:bg-white/10 disabled:opacity-50"
                              title="Editar pago"
                              disabled={reloadBusy}
                            >
                              <Pencil size={15} />
                            </button>

                            <button
                              onClick={() => removePago(row)}
                              className="p-1 rounded hover:bg-white/10 disabled:opacity-50"
                              title="Eliminar pago"
                              disabled={reloadBusy || !pago?.id}
                            >
                              <Trash2 size={15} color="#ff6b6b" />
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
                        style={{
                          ...ui.cellBorderStyle,

                          borderLeft: ui.border,

                          borderRight: ui.border,
                        }}
                        colSpan={10}
                      >
                        No hay registros que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ===============================================
                MOBILE / TABLET

                CARDS EN VEZ DE TABLA.
                NO EXISTE SCROLL HORIZONTAL.
            =============================================== */}

            <div className="xl:hidden mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {pageData.map((row) => {
                const pago = row.pago;

                return (
                  <article key={`MOBILE-${row.key}`} className={ui.mobileCard}>
                    {/* encabezado */}

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className={ui.mobileLabel}>Jugador</div>

                        <div className={`${ui.mobileValue} text-[14px]`}>{row.nombre}</div>

                        <div className={`mt-0.5 text-[11px] ${ui.subtitle}`}>
                          {row.rut ? formatRutWithDV(row.rut) : "—"}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 inline-flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-semibold ${ui.pill(
                          row.estado
                        )}`}
                      >
                        {row.estado}
                      </span>
                    </div>

                    <div
                      className="my-3"
                      style={{
                        height: 1,

                        background: ui.line,
                      }}
                    />

                    {/* datos principales */}

                    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                      <div>
                        <div className={ui.mobileLabel}>Plan</div>

                        <div className={ui.mobileValue}>{pago?.plan?.nombre ?? "—"}</div>
                      </div>

                      <div>
                        <div className={ui.mobileLabel}>Tarifa</div>

                        <div className={ui.mobileValue}>{pago?.tarifa?.nombre ?? "—"}</div>
                      </div>

                      <div>
                        <div className={ui.mobileLabel}>Tipo</div>

                        <div className={ui.mobileValue}>{pago?.tipo_pago?.nombre ?? "—"}</div>
                      </div>

                      <div>
                        <div className={ui.mobileLabel}>Medio</div>

                        <div className={ui.mobileValue}>{pago?.medio_pago?.nombre ?? "—"}</div>
                      </div>

                      <div>
                        <div className={ui.mobileLabel}>Fecha</div>

                        <div className={ui.mobileValue}>
                          {pago?.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString("es-CL") : "—"}
                        </div>
                      </div>

                      <div>
                        <div className={ui.mobileLabel}>Monto</div>

                        <div className={`${ui.mobileValue} font-extrabold`}>{toCLP(pago?.monto)}</div>
                      </div>
                    </div>

                    {/* acciones */}

                    <div
                      className="mt-3 pt-3 flex gap-2"
                      style={{
                        borderTop: ui.border,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        disabled={reloadBusy}
                        className={`${ui.btnSecondary} flex-1 inline-flex items-center justify-center gap-2`}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => removePago(row)}
                        disabled={reloadBusy || !pago?.id}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-red-400/30 bg-red-500/10 text-red-500 font-semibold text-[12px] transition hover:bg-red-500/15 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                        Eliminar
                      </button>
                    </div>
                  </article>
                );
              })}

              {pageData.length === 0 && (
                <div className={`${ui.mobileCard} md:col-span-2 text-center ${ui.subtitle}`}>
                  No hay registros que coincidan con los filtros.
                </div>
              )}
            </div>

            {/* ===============================================
                PAGINACIÓN PAGOS
            =============================================== */}

            <div className="mt-4 flex flex-col items-center justify-center gap-2">
              <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={reloadBusy || page <= 1}
                  className={`${ui.btnSecondary} flex-1 sm:flex-none`}
                >
                  Anterior
                </button>

                <span className={ui.badge}>
                  {page}/{totalPages}
                </span>

                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={reloadBusy || page >= totalPages}
                  className={`${ui.btnSecondary} flex-1 sm:flex-none`}
                >
                  Siguiente
                </button>
              </div>

              <div className={`text-[11px] ${ui.subtitle} text-center`}>
                Mostrando <span className="font-semibold">{pageData.length}</span> de{" "}
                <span className="font-semibold">{filasFiltradas.length}</span> pagos filtrados.
              </div>
            </div>
          </div>

          {/* =================================================
              PAGOS MANUALES
          ================================================= */}

          <div className={`${ui.card} ${ui.cardPad} mt-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className={`text-sm font-extrabold ${darkMode ? "text-white" : "text-ra-marron"}`}>
                Ingresar Pagos Manuales
              </h3>

              <span className={ui.badge}>Jugadores activos: {jugadoresManualRows.length}</span>
            </div>

            <p className={`mt-1 text-[11px] ${ui.subtitle}`}>
              Selecciona un jugador y registra el pago utilizando su plan, tarifa y cargo financiero real.
            </p>

            <div
              className="mt-3"
              style={{
                height: 1,

                background: ui.line,
              }}
            />

            <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
              <input
                type="text"
                placeholder="Buscar por RUT, nombre, categoría o sucursal"
                value={manualFiltro}
                onChange={(event) => setManualFiltro(event.target.value)}
                className={ui.controlBase}
              />

              <div className={`text-[11px] ${ui.subtitle} text-center md:text-right`}>
                Página {manualPage}/{manualTotalPages}
              </div>
            </div>

            {/* ===============================================
                MANUAL DESKTOP
            =============================================== */}

            <div className="hidden lg:block mt-3 w-full">
              <table className={ui.table}>
                <thead className={ui.thead}>
                  <tr>
                    <th
                      className={`${ui.thBase} w-[15%]`}
                      style={{
                        ...ui.headBorderStyle,

                        borderLeft: ui.border,
                      }}
                    >
                      RUT
                    </th>

                    <th className={`${ui.thBase} w-[32%]`} style={ui.headBorderStyle}>
                      Nombre
                    </th>

                    <th className={`${ui.thBase} w-[18%]`} style={ui.headBorderStyle}>
                      Categoría
                    </th>

                    <th className={`${ui.thBase} w-[20%]`} style={ui.headBorderStyle}>
                      Sucursal
                    </th>

                    <th
                      className={`${ui.thBase} w-[15%]`}
                      style={{
                        ...ui.headBorderStyle,

                        borderRight: ui.border,
                      }}
                    >
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {manualPageData.map((jugador) => (
                    <tr key={`MANUAL-${jugador.rut}`} className={ui.tr}>
                      <td
                        className={ui.tdBase}
                        style={{
                          ...ui.cellBorderStyle,

                          borderLeft: ui.border,
                        }}
                      >
                        {formatRutWithDV(jugador.rut)}
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        {jugador.nombre}
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        {jugador.categoria}
                      </td>

                      <td className={ui.tdBase} style={ui.cellBorderStyle}>
                        {jugador.sucursal}
                      </td>

                      <td
                        className={ui.tdBase}
                        style={{
                          ...ui.cellBorderStyle,

                          borderRight: ui.border,
                        }}
                      >
                        <button
                          onClick={() => openManualPago(jugador.rut)}
                          disabled={reloadBusy}
                          className={ui.btnPrimary}
                          style={ui.btnPrimaryStyle}
                        >
                          <CreditCard size={14} />
                          Ingresar pago
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ===============================================
                MANUAL MOBILE / TABLET
            =============================================== */}

            <div className="lg:hidden mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {manualPageData.map((jugador) => (
                <article key={`MANUAL-MOBILE-${jugador.rut}`} className={ui.mobileCard}>
                  <div className={ui.mobileLabel}>Jugador</div>

                  <div className={`${ui.mobileValue} text-[14px]`}>{jugador.nombre}</div>

                  <div className={`mt-0.5 text-[11px] ${ui.subtitle}`}>{formatRutWithDV(jugador.rut)}</div>

                  <div
                    className="my-3"
                    style={{
                      height: 1,

                      background: ui.line,
                    }}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className={ui.mobileLabel}>Categoría</div>

                      <div className={ui.mobileValue}>{jugador.categoria}</div>
                    </div>

                    <div>
                      <div className={ui.mobileLabel}>Sucursal</div>

                      <div className={ui.mobileValue}>{jugador.sucursal}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openManualPago(jugador.rut)}
                    disabled={reloadBusy}
                    className={`${ui.btnPrimary} w-full mt-4 py-2.5`}
                    style={ui.btnPrimaryStyle}
                  >
                    <CreditCard size={15} />
                    Ingresar pago
                  </button>
                </article>
              ))}

              {manualPageData.length === 0 && (
                <div className={`${ui.mobileCard} sm:col-span-2 text-center ${ui.subtitle}`}>
                  No hay jugadores que coincidan con el filtro.
                </div>
              )}
            </div>

            {/* ===============================================
                PAGINACIÓN MANUAL
            =============================================== */}

            <div className="mt-4 flex flex-col items-center justify-center gap-2">
              <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setManualPage((current) => Math.max(1, current - 1))}
                  disabled={reloadBusy || manualPage <= 1}
                  className={`${ui.btnSecondary} flex-1 sm:flex-none`}
                >
                  Anterior
                </button>

                <span className={ui.badge}>
                  {manualPage}/{manualTotalPages}
                </span>

                <button
                  onClick={() => setManualPage((current) => Math.min(manualTotalPages, current + 1))}
                  disabled={reloadBusy || manualPage >= manualTotalPages}
                  className={`${ui.btnSecondary} flex-1 sm:flex-none`}
                >
                  Siguiente
                </button>
              </div>

              <div className={`text-[11px] ${ui.subtitle} text-center`}>
                Mostrando <span className="font-semibold">{manualPageData.length}</span> de{" "}
                <span className="font-semibold">{jugadoresManualRows.length}</span> jugadores filtrados.
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* =================================================
          MODAL

          SE CONSERVA LA LÓGICA Y CONTRASTE.
      ================================================= */}

      {/* =================================================
    MODAL PAGO
================================================= */}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-2 sm:px-3 py-2 sm:py-4">
          <div className={`${ui.modalCard} flex flex-col max-h-[94vh] sm:max-h-[92vh]`}>
            {/* ===========================================
          CABECERA
      =========================================== */}

            <div
              className={`shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-b flex items-start justify-between gap-3 ${
                darkMode ? "border-white/15" : "border-[#c9b18d]"
              }`}
            >
              <div className="min-w-0">
                <h3
                  className={`text-[12px] sm:text-[14px] font-extrabold leading-tight break-words ${
                    darkMode ? "text-white" : "text-[#3f2d18]"
                  }`}
                >
                  {editForm.create
                    ? `Ingresar pago — ${formatRutWithDV(editForm.jugador_rut)}`
                    : `Editar pago #${editForm.id}`}
                </h3>

                {editForm.create && (
                  <p className={`hidden sm:block ${ui.modalHelp}`}>Selecciona el plan, tarifa y datos del pago.</p>
                )}
              </div>

              <button
                type="button"
                className={
                  darkMode
                    ? "shrink-0 p-1.5 rounded text-white hover:bg-white/10 disabled:opacity-50"
                    : "shrink-0 p-1.5 rounded text-[#3f2d18] hover:bg-[#eadbc5] disabled:opacity-50"
                }
                onClick={closeEdit}
                disabled={editBusy || reloadBusy}
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {/* ===========================================
          CUERPO SCROLLABLE

          Solo esta zona hace scroll.
      =========================================== */}

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3">
              {editError && <div className={`mb-2 ${ui.warnBox}`}>{editError}</div>}

              <form id="pago-manual-form" onSubmit={submitEdit} className="grid grid-cols-2 gap-x-2 gap-y-2 sm:gap-3">
                {/* =====================================
              RUT
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>RUT</label>

                  <input
                    type="text"
                    value={formatRutWithDV(editForm.jugador_rut)}
                    className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                    disabled
                  />
                </div>

                {/* =====================================
              FECHA
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>Fecha</label>

                  <input
                    type="date"
                    value={editForm.fecha_pago}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,

                        fecha_pago: event.target.value,
                      }))
                    }
                    className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                    required
                    disabled={editBusy || reloadBusy}
                  />
                </div>

                {/* =====================================
              PLAN
          ===================================== */}

                <div className="col-span-2 sm:col-span-1">
                  <label className={ui.modalLabel}>Plan</label>

                  {editForm.create ? (
                    <select
                      value={editForm.plan_id}
                      onChange={handlePlanChange}
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      required
                      disabled={editBusy || reloadBusy}
                    >
                      <option value="">Selecciona plan…</option>

                      {planesJugador.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={
                        editForm.plan_id
                          ? (planesMap.get(String(editForm.plan_id))?.nombre ?? `Plan #${editForm.plan_id}`)
                          : "Sin plan"
                      }
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      disabled
                    />
                  )}
                </div>

                {/* =====================================
              TARIFA
          ===================================== */}

                <div className="col-span-2 sm:col-span-1">
                  <label className={ui.modalLabel}>Tarifa</label>

                  {editForm.create ? (
                    <select
                      value={editForm.tarifa_id}
                      onChange={handleTarifaChange}
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      required
                      disabled={!editForm.plan_id || editBusy || reloadBusy}
                    >
                      <option value="">Selecciona tarifa…</option>

                      {tarifasDisponibles.map((tarifa) => (
                        <option key={tarifa.id} value={tarifa.id}>
                          {tarifa.nombre}
                          {" · "}
                          {toCLP(tarifa.monto)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={
                        editForm.tarifa_id
                          ? (tarifasMap.get(String(editForm.tarifa_id))?.nombre ?? `Tarifa #${editForm.tarifa_id}`)
                          : "Sin tarifa"
                      }
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      disabled
                    />
                  )}
                </div>

                {/* =====================================
              CARGO

              Solo creación.
          ===================================== */}

                {editForm.create && (
                  <div className="col-span-2">
                    <label className={ui.modalLabel}>Cargo pendiente</label>

                    <select
                      value={editForm.cargo_id}
                      onChange={handleCargoChange}
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      disabled={!editForm.plan_id || editBusy || reloadBusy}
                    >
                      <option value="">Sin cargo específico</option>

                      {cargosDisponibles.map((cargo) => {
                        const monto = cargo.saldo != null ? cargo.saldo : cargo.monto_total;

                        return (
                          <option key={cargo.id} value={cargo.id}>
                            {cargo.descripcion}
                            {" · "}
                            {toCLP(monto)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* =====================================
              MONTO
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>Monto</label>

                  <input
                    type="number"
                    min="1"
                    value={editForm.monto}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,

                        monto: event.target.value,
                      }))
                    }
                    className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                    required
                    disabled={editBusy || reloadBusy}
                  />
                </div>

                {/* =====================================
              TIPO
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>Tipo</label>

                  {editForm.create ? (
                    <input
                      type="text"
                      value={
                        editForm.tipo_pago_id
                          ? (tipoPagoMap.get(String(editForm.tipo_pago_id)) ?? `Tipo #${editForm.tipo_pago_id}`)
                          : "Por tarifa"
                      }
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      disabled
                    />
                  ) : (
                    <select
                      value={editForm.tipo_pago_id}
                      onChange={(event) =>
                        setEditForm((form) => ({
                          ...form,

                          tipo_pago_id: event.target.value,
                        }))
                      }
                      className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
                      required
                      disabled={editBusy || reloadBusy}
                    >
                      <option value="">Seleccione…</option>

                      {Array.from(tipoPagoMap, ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* =====================================
              MEDIO
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>Medio</label>

                  <select
                    value={editForm.medio_pago_id}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,

                        medio_pago_id: event.target.value,
                      }))
                    }
                    className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
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

                {/* =====================================
              SITUACIÓN
          ===================================== */}

                <div className="col-span-1">
                  <label className={ui.modalLabel}>Situación</label>

                  <select
                    value={editForm.situacion_pago_id}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,

                        situacion_pago_id: event.target.value,
                      }))
                    }
                    className={`${ui.controlBase} !h-8 sm:!h-10 !text-[11px] sm:!text-[12px]`}
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
                </div>

                {/* =====================================
              OBSERVACIONES

              Más compacta en móvil.
          ===================================== */}

                <div className="col-span-2">
                  <label className={ui.modalLabel}>Observaciones</label>

                  <textarea
                    value={editForm.observaciones}
                    onChange={(event) =>
                      setEditForm((form) => ({
                        ...form,

                        observaciones: event.target.value,
                      }))
                    }
                    className={`${ui.controlTextArea} !min-h-[54px] sm:!min-h-[76px] !text-[11px] sm:!text-[12px]`}
                    placeholder="Opcional"
                    disabled={editBusy || reloadBusy}
                  />
                </div>
              </form>
            </div>

            {/* ===========================================
          FOOTER FIJO

          Los botones quedan siempre visibles.
      =========================================== */}

            <div
              className={`shrink-0 px-3 sm:px-4 py-2.5 border-t ${
                darkMode ? "border-white/15 bg-[#111827]" : "border-[#c9b18d] bg-[#fffaf2]"
              }`}
            >
              <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={editBusy || reloadBusy}
                  className={`${ui.btnSecondary} w-full sm:w-auto !py-2`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  form="pago-manual-form"
                  disabled={editBusy || reloadBusy}
                  className={`${ui.btnPrimary} w-full sm:w-auto !py-2`}
                  style={ui.btnPrimaryStyle}
                >
                  {editBusy ? "Guardando…" : editForm.create ? "Ingresar pago" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          ÉXITO
      ================================================= */}

      {successOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-3">
          <div className={ui.modalCard}>
            <div className="p-5 text-center">
              <div className="text-3xl mb-1">✅</div>

              <h4 className={`text-[13px] font-extrabold mb-1 ${darkMode ? "text-white" : "text-[#3f2d18]"}`}>
                {successMsg}
              </h4>

              <p className={ui.modalHelp}>Actualizando información…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
