// src/pages/admin/powerbiFinanzas.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken } from "../../services/api";
import { jwtDecode } from "jwt-decode";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function PowerbiFinanzas() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [rol, setRol] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagos, setPagos] = useState([]);

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  // ─────────────────────────────
  // 🧭 Breadcrumb (ANTI-LOOP)
  // ─────────────────────────────
  const breadcrumbBootRef = useRef(false);

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname + location.search;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Power BI financiero";
    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ to: currentPath, label }],
        },
      });
    } else {
      breadcrumbBootRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // ─────────────────────────────
  // 🔐 Auth (roles permitidos: 1 y 3)
  // ─────────────────────────────
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      // ✅ misma regla fuerte (evita “0.6s y expulsión” por exp indefinido)
      if (!decoded?.exp || decoded.exp <= now) throw new Error("expired");

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
      const r = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      // ✅ PowerBI permitido para 1 y 3 (igual que Dashboard)
      if (![1, 3].includes(r)) {
        navigate(dashboardBase, { replace: true });
        setIsLoading(false);
        return;
      }

      setRol(r);
      setIsLoading(false);
    } catch {
      clearToken();
      navigate("/login", { replace: true });
      setIsLoading(false);
    }
  }, [navigate, dashboardBase]);

  // ─────────────────────────────
  // ✅ apiOps estable (no “backend loco”)
  // ─────────────────────────────
  const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

  const apiOps = useMemo(() => {
    const withVariants = (fn) => async (base, ...args) => {
      const urls = base.endsWith("/") ? [base, base.slice(0, -1)] : [base, `${base}/`];
      let lastErr = null;

      for (const u of urls) {
        try {
          return await fn(u, ...args);
        } catch (err) {
          lastErr = err;
          const st = getErrStatus(err);
          if (st === 401 || st === 403) throw err; // auth corta altiro
        }
      }
      throw lastErr || new Error("ENDPOINT_VARIANTS_FAILED");
    };

    return {
      getVar: withVariants((u, cfg) => api.get(u, cfg)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────
  // Normalizadores robustos
  // ─────────────────────────────
  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data ?? res;

    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d?.data)) return d.data;
    if (d?.ok && Array.isArray(d?.items)) return d.items;

    return [];
  };

  // ✅ para estado-cuenta: “pesca pagos donde sea”
  const extractPagosEstadoCuenta = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data ?? res;

    // casos típicos
    if (Array.isArray(d?.pagos)) return d.pagos;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d)) return d;

    // algunos backends: { ok:true, data:{ pagos:[...] } }
    if (d?.ok && Array.isArray(d?.data?.pagos)) return d.data.pagos;

    return [];
  };

  const buildIdNameMap = (arr, idKey = "id", nameKey = "nombre") => {
    const m = new Map();
    for (const x of Array.isArray(arr) ? arr : []) {
      const id = x?.[idKey];
      const name = x?.[nameKey] ?? String(id ?? "—");
      if (id != null) m.set(String(id), name);
    }
    return m;
  };

  const normalizePagos = (arr, { tipoPagoMap, medioPagoMap, situacionPagoMap, jugadoresMap }) => {
    const list = Array.isArray(arr) ? arr : [];
    return list.map((p) => {
      const tipoId = p?.tipo_pago_id ?? p?.tipo_id ?? p?.tipoPagoId ?? p?.tipo_pago?.id ?? null;
      const medioId = p?.medio_pago_id ?? p?.medio_id ?? p?.medioPagoId ?? p?.medio_pago?.id ?? null;
      const situId =
        p?.situacion_pago_id ?? p?.estado_pago_id ?? p?.estado_id ?? p?.situacion_pago?.id ?? null;

      const rutPlano = p?.jugador_rut ?? p?.rut_jugador ?? p?.rut ?? p?.jugador?.rut_jugador ?? null;
      const jAnidado = p?.jugador ?? {};
      const jFromMap = rutPlano != null ? jugadoresMap.get(String(rutPlano)) : null;

      const jugadorNombre =
        jAnidado?.nombre_jugador ??
        jAnidado?.nombre ??
        jAnidado?.nombre_completo ??
        jFromMap?.nombre ??
        p?.jugador_nombre ??
        p?.nombre_jugador ??
        "—";

      const catId = jAnidado?.categoria?.id ?? jAnidado?.categoria_id ?? jFromMap?.categoria?.id ?? null;

      const catNombre =
        jAnidado?.categoria?.nombre ??
        jAnidado?.categoria_nombre ??
        jFromMap?.categoria?.nombre ??
        (typeof jAnidado?.categoria === "string" ? jAnidado?.categoria : null) ??
        "Sin categoría";

      const tipoNombre =
        p?.tipo_pago?.nombre ??
        p?.tipo_pago_nombre ??
        (tipoId != null ? tipoPagoMap.get(String(tipoId)) ?? String(tipoId) : "—");

      const medioNombre =
        p?.medio_pago?.nombre ??
        p?.medio_pago_nombre ??
        (medioId != null ? medioPagoMap.get(String(medioId)) ?? String(medioId) : "—");

      const situNombre =
        p?.situacion_pago?.nombre ??
        p?.estado_pago_nombre ??
        p?.estado_nombre ??
        (situId != null ? situacionPagoMap.get(String(situId)) ?? String(situId) : "—");

      const fecha = p?.fecha_pago ?? p?.fecha ?? null;

      return {
        id: p?.id ?? p?.ID ?? null,
        monto: Number(p?.monto ?? 0),
        fecha_pago: fecha,
        jugador: {
          rut_jugador: rutPlano ?? "—",
          nombre_jugador: jugadorNombre,
          categoria: { id: catId, nombre: catNombre },
        },
        tipo_pago: { id: tipoId, nombre: tipoNombre },
        situacion_pago: { id: situId, nombre: situNombre },
        medio_pago: { id: medioId, nombre: medioNombre },
        observaciones: p?.observaciones ?? "",
      };
    });
  };

  const handleAuth = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true });
  }, [navigate]);

  // ─────────────────────────────
  // 📥 Carga de datos (1 vez controlada)
  // ─────────────────────────────
  useEffect(() => {
    if (![1, 3].includes(rol)) return;

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        // catálogos + jugadores (en paralelo)
        const [tiposRes, mediosRes, situacionesRes, jugadoresRes, categoriasRes] = await Promise.all([
          apiOps.getVar("/tipo-pago", { signal: abort.signal }).catch(() => null),
          apiOps.getVar("/medio-pago", { signal: abort.signal }).catch(() => null),
          apiOps
            .getVar("/situacion-pago", { signal: abort.signal })
            .catch(() => apiOps.getVar("/estado-pago", { signal: abort.signal }).catch(() => null)),
          apiOps.getVar("/jugadores", { signal: abort.signal }).catch(() => null),
          apiOps.getVar("/categorias", { signal: abort.signal }).catch(() => null),
        ]);

        if (abort.signal.aborted) return;

        const tipos = normalizeListResponse(tiposRes);
        const medios = normalizeListResponse(mediosRes);
        const situaciones = normalizeListResponse(situacionesRes);
        const jugadoresList = normalizeListResponse(jugadoresRes);
        const categorias = normalizeListResponse(categoriasRes);

        const tipoPagoMap = buildIdNameMap(tipos, "id", "nombre");
        const medioPagoMap = buildIdNameMap(medios, "id", "nombre");
        const situacionPagoMap = buildIdNameMap(situaciones, "id", "nombre");
        const categoriasMap = buildIdNameMap(categorias, "id", "nombre");

        const jugadoresMap = new Map();
        for (const j of jugadoresList) {
          const rut = j?.rut_jugador ?? j?.rut ?? null;
          if (rut == null) continue;

          const categoriaId = j?.categoria_id ?? j?.categoria?.id ?? null;
          const categoriaNombre =
            j?.categoria?.nombre ??
            j?.categoria_nombre ??
            (categoriaId != null ? categoriasMap.get(String(categoriaId)) ?? String(categoriaId) : null) ??
            j?.categoria ??
            "Sin categoría";

          jugadoresMap.set(String(rut), {
            nombre: j?.nombre_jugador ?? j?.nombre ?? j?.nombre_completo ?? "—",
            categoria: { id: categoriaId, nombre: categoriaNombre },
          });
        }

        // ✅ Ahora: pagos (estado-cuenta) con variantes y parse robusto
        const respEstado = await apiOps.getVar("/pagos-jugador/estado-cuenta", { signal: abort.signal });
        if (abort.signal.aborted) return;

        const rawPagos = extractPagosEstadoCuenta(respEstado);
        const pagosNorm = normalizePagos(rawPagos, {
          tipoPagoMap,
          medioPagoMap,
          situacionPagoMap,
          jugadoresMap,
        });

        setPagos(pagosNorm);
      } catch (e) {
        if (abort.signal.aborted) return;
        const st = getErrStatus(e);

        if (st === 401 || st === 403) return handleAuth();

        setError("❌ No se pudieron cargar los datos financieros para los gráficos.");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [rol, apiOps, handleAuth]);

  // ─────────────────────────────
  // 🎨 UI
  // ─────────────────────────────
  const estiloFondo = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tarjetaClase = darkMode
    ? "bg-[#1f2937] shadow-lg rounded-lg p-4 border border-gray-700"
    : "bg-white shadow-md rounded-lg p-4 border border-gray-200";

  // 📊 Configuración de gráficos (sin tocar tu paleta)
  const colores = useMemo(
    () => ["#4dc9f6", "#f67019", "#f53794", "#537bc4", "#acc236", "#166a8f", "#00a950", "#58595b", "#8549ba"],
    []
  );

  const chartOpts = useMemo(
    () => ({
      indexAxis: "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: darkMode ? "white" : "#1d0b0b" } },
      },
      scales: {
        x: { ticks: { color: darkMode ? "white" : "#1d0b0b" } },
        y: { ticks: { color: darkMode ? "white" : "#1d0b0b" } },
      },
    }),
    [darkMode]
  );

  const datasetFrom = (labels, data, label = "Total (CLP)") => ({
    labels,
    datasets: [{ label, data, backgroundColor: labels.map((_, i) => colores[i % colores.length]) }],
  });

  const datosPorTipo = useMemo(() => {
    const agg = new Map();
    for (const p of pagos) {
      const key = p?.tipo_pago?.nombre || "—";
      agg.set(key, (agg.get(key) || 0) + Number(p?.monto || 0));
    }
    return { labels: Array.from(agg.keys()), data: Array.from(agg.values()) };
  }, [pagos]);

  const datosPorMedio = useMemo(() => {
    const agg = new Map();
    for (const p of pagos) {
      const key = p?.medio_pago?.nombre || "—";
      agg.set(key, (agg.get(key) || 0) + Number(p?.monto || 0));
    }
    return { labels: Array.from(agg.keys()), data: Array.from(agg.values()) };
  }, [pagos]);

  const datosPorCategoria = useMemo(() => {
    const agg = new Map();
    for (const p of pagos) {
      const key = p?.jugador?.categoria?.nombre ?? p?.jugador?.categoria ?? "Sin categoría";
      agg.set(key, (agg.get(key) || 0) + Number(p?.monto || 0));
    }
    return { labels: Array.from(agg.keys()), data: Array.from(agg.values()) };
  }, [pagos]);

  const datosPorMes = useMemo(() => {
    const agg = new Map();
    for (const p of pagos) {
      if (!p?.fecha_pago) continue;
      const d = new Date(p.fecha_pago);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      agg.set(key, (agg.get(key) || 0) + Number(p?.monto || 0));
    }
    const sorted = Array.from(agg.keys()).sort();
    const last6 = sorted.slice(-6);
    const values = last6.map((k) => agg.get(k));
    const labels = last6.map((k) => {
      const [y, m] = k.split("-").map(Number);
      const dt = new Date(y, m - 1, 1);
      return new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric" }).format(dt);
    });
    return { labels, data: values };
  }, [pagos]);

  // ───────── Render ─────────
  if (isLoading) return <IsLoading />;

  if (error) {
    return (
      <div className={`${estiloFondo} min-h-[calc(100vh-100px)] flex items-center justify-center`}>
        <p className="text-red-500 text-sm sm:text-base">{error}</p>
      </div>
    );
  }

  return (
    <div className={`${estiloFondo} min-h-[calc(100vh-100px)] px-4 pt-4 pb-16 font-realacademy`}>
      <h2 className="text-2xl font-bold mb-2 text-center">Power BI Financiero — Resumen de Pagos</h2>

      <p className="text-center mb-6 text-sm opacity-80">
        Visualización consolidada de <span className="font-semibold">pagos_jugador</span> vía{" "}
        <span className="font-semibold">/pagos-jugador/estado-cuenta</span>.
      </p>

      {pagos.length === 0 && (
        <p className="text-center text-sm opacity-70 mb-6">
          No llegaron pagos al frontend. Si el endpoint responde con data, esto era un tema de parseo.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={tarjetaClase}>
          <h4 className="text-sm font-semibold mb-3 text-center">Total por Tipo de Pago</h4>
          <div style={{ height: "360px" }}>
            <Bar data={datasetFrom(datosPorTipo.labels, datosPorTipo.data)} options={chartOpts} />
          </div>
        </div>

        <div className={tarjetaClase}>
          <h4 className="text-sm font-semibold mb-3 text-center">Total por Medio de Pago</h4>
          <div style={{ height: "360px" }}>
            <Bar data={datasetFrom(datosPorMedio.labels, datosPorMedio.data)} options={chartOpts} />
          </div>
        </div>

        <div className={tarjetaClase}>
          <h4 className="text-sm font-semibold mb-3 text-center">Total por Categoría</h4>
          <div style={{ height: "360px" }}>
            <Bar data={datasetFrom(datosPorCategoria.labels, datosPorCategoria.data)} options={chartOpts} />
          </div>
        </div>

        <div className={tarjetaClase}>
          <h4 className="text-sm font-semibold mb-3 text-center">Total por Mes (últimos 6)</h4>
          <div style={{ height: "360px" }}>
            <Bar data={datasetFrom(datosPorMes.labels, datosPorMes.data)} options={chartOpts} />
          </div>
        </div>
      </div>
    </div>
  );
}
