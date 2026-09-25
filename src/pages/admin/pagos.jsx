// src/pages/admin/registrarPagos.jsx

import { useEffect, useMemo, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import { jwtDecode } from "jwt-decode";

import { useTheme } from "../../context/ThemeContext";

import api, { getToken, clearToken } from "../../services/api";

import IsLoading from "../../components/isLoading";

import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";

import { CreditCard } from "lucide-react";

import { formatRutWithDV } from "../../services/rut";

// Negocio

const SITUACION_PAGADO_ID = 1;

const ESTADO_JUGADOR_ACTIVO = 1;

export default function Pagos() {
  const { darkMode } = useTheme();

  const navigate = useNavigate();

  const location = useLocation();

  useMobileAutoScrollTop();

  const selectedRut = location.state?.rut || new URLSearchParams(location.search).get("rut") || "";

  const currentPath = location.pathname + location.search;

  /* ─────────────────────────────

     Breadcrumb

  ───────────────────────────── */

  useEffect(() => {
    const prev = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : null;

    const alreadyOk = Array.isArray(prev) && prev.length >= 1 && prev[prev.length - 1]?.label === "Ingresar pagos";

    if (alreadyOk) return;

    navigate(currentPath, {
      replace: true,

      state: {
        ...(location.state || {}),

        breadcrumb: [
          {
            label: "Ingresar pagos",

            to: currentPath,
          },
        ],
      },
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  /* ─────────────────────────────

     Auth: solo admin (1)

  ───────────────────────────── */

  const [rol, setRol] = useState(null);

  useEffect(() => {
    try {
      const token = getToken();

      if (!token) {
        throw new Error("no-token");
      }

      const decoded = jwtDecode(token);

      const now = Math.floor(Date.now() / 1000);

      if (decoded?.exp && decoded.exp < now) {
        throw new Error("expired");
      }

      const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;

      const parsed = Number.isFinite(Number(rawRol)) ? Number(rawRol) : 0;

      if (parsed !== 1) {
        navigate("/admin", {
          replace: true,
        });

        return;
      }

      setRol(parsed);
    } catch {
      clearToken();

      navigate("/login", {
        replace: true,
      });
    }
  }, [navigate]);

  /* ─────────────────────────────

     Estado

  ───────────────────────────── */

  const [jugadores, setJugadores] = useState([]);

  const [filtro, setFiltro] = useState("");

  const [form, setForm] = useState({
    tipo_pago_id: "",

    monto: "",

    fecha_pago: "",

    medio_pago_id: "",

    comprobante_url: "",

    observaciones: "",
  });

  const [tiposPago, setTiposPago] = useState([]);

  const [mediosPago, setMediosPago] = useState([]);

  const [mensaje, setMensaje] = useState("");

  const [error, setError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const [categoriasMap, setCategoriasMap] = useState(new Map());

  /* ─────────────────────────────

     Helpers fetch

  ───────────────────────────── */

  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) {
      return [];
    }

    const d = res?.data;

    if (Array.isArray(d)) {
      return d;
    }

    if (Array.isArray(d?.results)) {
      return d.results;
    }

    if (Array.isArray(d?.items)) {
      return d.items;
    }

    if (Array.isArray(d?.rows)) {
      return d.rows;
    }

    return [];
  };

  const tryGetList = async (paths, signal) => {
    const variants = [];

    for (const p of paths) {
      if (p.endsWith("/")) {
        variants.push(p, p.slice(0, -1));
      } else {
        variants.push(p, `${p}/`);
      }
    }

    const uniq = [...new Set(variants)];

    for (const url of uniq) {
      try {
        const r = await api.get(url, {
          signal,
        });

        return normalizeListResponse(r);
      } catch (e) {
        const st = e?.status ?? e?.response?.status;

        if (st === 401 || st === 403) {
          throw e;
        }

        continue;
      }
    }

    return [];
  };

  const prettyBackendErrors = (data) => {
    try {
      if (!data) {
        return null;
      }

      if (data.errors?.fieldErrors) {
        const fe = data.errors.fieldErrors;

        const msgs = Object.entries(fe).flatMap(([k, arr]) => (arr || []).map((m) => `[${k}] ${m}`));

        if (msgs.length) {
          return msgs.join(" | ");
        }
      }

      if (Array.isArray(data.detail) && data.detail.length) {
        return data.detail.map((d) => `[${(d.loc || []).join(".")}] ${d.msg}`).join(" | ");
      }

      if (typeof data.detail === "string") {
        return data.detail;
      }

      if (typeof data.message === "string") {
        return data.message;
      }
    } catch {}

    return null;
  };

  const isPositiveAmount = (v) => {
    const n = Number(v);

    return Number.isFinite(n) && n > 0;
  };

  const resolveCategoriaNombre = (j) => {
    const fromObj = j?.categoria?.nombre ?? j?.categoria?.descripcion ?? j?.categoria?.label ?? null;

    if (fromObj && String(fromObj).trim()) {
      return String(fromObj).trim();
    }

    const fromFlat = j?.categoria_nombre ?? j?.nombre_categoria ?? null;

    if (fromFlat && String(fromFlat).trim()) {
      return String(fromFlat).trim();
    }

    if (typeof j?.categoria === "string" && j.categoria.trim()) {
      return j.categoria.trim();
    }

    const catId = Number(j?.categoria_id ?? j?.categoriaId ?? j?.id_categoria ?? NaN);

    if (Number.isFinite(catId)) {
      const hit = categoriasMap.get(String(catId));

      if (hit) {
        return hit;
      }

      return `Categoría ${catId}`;
    }

    return "Sin categoría";
  };

  /* ─────────────────────────────

     Carga inicial

  ───────────────────────────── */

  useEffect(() => {
    if (rol === null) {
      return;
    }

    if (rol !== 1) {
      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);

      setError("");

      try {
        const [jugadoresList, categoriasList, tipos, medios] = await Promise.all([
          tryGetList(["/jugadores"], abort.signal),

          tryGetList(["/categorias", "/categoria"], abort.signal),

          tryGetList(["/tipo-pago", "/tipo_pago"], abort.signal),

          tryGetList(["/medio-pago", "/medio_pago"], abort.signal),
        ]);

        if (abort.signal.aborted) {
          return;
        }

        // categorías map

        const cm = new Map();

        (Array.isArray(categoriasList) ? categoriasList : [])
          .map((c) => ({
            id: Number(c?.id ?? c?.value ?? c?.key),

            nombre: String(c?.nombre ?? c?.descripcion ?? c?.label ?? "").trim(),
          }))
          .filter((c) => Number.isFinite(c.id) && c.nombre)
          .forEach((c) => cm.set(String(c.id), c.nombre));

        setCategoriasMap(cm);

        // ✅ SOLO ACTIVOS

        const activos = (Array.isArray(jugadoresList) ? jugadoresList : []).filter((j) => {
          const estadoId = Number(j?.estado_id ?? j?.estadoId ?? j?.estado ?? 0);

          return estadoId === ESTADO_JUGADOR_ACTIVO;
        });

        setJugadores(activos);

        setTiposPago(
          (Array.isArray(tipos) ? tipos : [])
            .map((x) => ({
              id: Number(x?.id ?? x?.value ?? x?.key),

              nombre: String(x?.nombre ?? x?.descripcion ?? x?.label ?? "").trim(),
            }))
            .filter((x) => Number.isFinite(x.id) && x.nombre)
        );

        setMediosPago(
          (Array.isArray(medios) ? medios : [])
            .map((x) => ({
              id: Number(x?.id ?? x?.value ?? x?.key),

              nombre: String(x?.nombre ?? x?.descripcion ?? x?.label ?? "").trim(),
            }))
            .filter((x) => Number.isFinite(x.id) && x.nombre)
        );
      } catch (e) {
        if (abort.signal.aborted) {
          return;
        }

        const st = e?.status ?? e?.response?.status;

        if (st === 401 || st === 403) {
          clearToken();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        setError("❌ Error al cargar jugadores/categorías/catálogos.");
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [rol, navigate]);

  /* ─────────────────────────────

     Filtrado + agrupación

  ───────────────────────────── */

  const jugadoresFiltrados = useMemo(() => {
    const f = (filtro || "").toLowerCase().trim();

    if (!f) {
      return jugadores;
    }

    return (jugadores || []).filter((j) => {
      const rut = String(j?.rut_jugador ?? j?.rut ?? "");

      const nombre = String(j?.nombre_jugador ?? j?.nombre ?? j?.nombre_completo ?? "");

      const cat = resolveCategoriaNombre(j);

      return rut.includes(f) || nombre.toLowerCase().includes(f) || String(cat).toLowerCase().includes(f);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jugadores, filtro, categoriasMap]);

  const gruposPorCategoria = useMemo(() => {
    const map = new Map();

    for (const j of jugadoresFiltrados) {
      const cat = resolveCategoriaNombre(j);

      if (!map.has(cat)) {
        map.set(cat, []);
      }

      map.get(cat).push(j);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const na = String(a?.nombre_jugador ?? a?.nombre ?? a?.nombre_completo ?? "");

        const nb = String(b?.nombre_jugador ?? b?.nombre ?? b?.nombre_completo ?? "");

        return na.localeCompare(nb);
      });

      map.set(k, arr);
    }

    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const sinCat = entries.filter(([k]) => k === "Sin categoría");

    const resto = entries.filter(([k]) => k !== "Sin categoría");

    return [...resto, ...sinCat];
  }, [jugadoresFiltrados]);

  /* ─────────────────────────────

     Navegación

  ───────────────────────────── */

  const openFormulario = (rut) => {
    if (!rut) {
      return;
    }

    navigate(`/admin/registrar-pagos?rut=${encodeURIComponent(String(rut))}`, {
      state: {
        rut: String(rut),

        breadcrumb: [
          {
            label: "Ingresar pagos",

            to: "/admin/registrar-pagos",
          },
        ],
      },
    });
  };

  const volverALista = () => {
    navigate("/admin/registrar-pagos", {
      replace: true,

      state: {
        breadcrumb: [
          {
            label: "Ingresar pagos",

            to: "/admin/registrar-pagos",
          },
        ],
      },
    });
  };

  /* ─────────────────────────────

     Form

  ───────────────────────────── */

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "monto" && !/^\d*\.?\d{0,2}$/.test(value)) {
      return;
    }

    setForm((prev) => ({
      ...prev,

      [name]: value,
    }));
  };

  const submitPago = async () => {
    const payload = {
      jugador_rut: Number(selectedRut),

      tipo_pago_id: Number(form.tipo_pago_id),

      situacion_pago_id: SITUACION_PAGADO_ID,

      monto: Number(form.monto),

      fecha_pago: String(form.fecha_pago || "").trim(),

      medio_pago_id: Number(form.medio_pago_id),

      comprobante_url: form.comprobante_url?.trim() || null,

      observaciones: form.observaciones?.trim() || null,
    };

    return api.post("/pagos-jugador", payload);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setMensaje("");

    setError("");

    setIsSubmitting(true);

    if (!selectedRut || !form.tipo_pago_id || !form.monto || !form.fecha_pago || !form.medio_pago_id) {
      setError("Debes completar todos los campos obligatorios.");

      setIsSubmitting(false);

      return;
    }

    if (!isPositiveAmount(form.monto)) {
      setError("El monto debe ser mayor a 0.");

      setIsSubmitting(false);

      return;
    }

    try {
      await submitPago();

      setMensaje("✅ Pago registrado correctamente");

      setForm({
        tipo_pago_id: "",

        monto: "",

        fecha_pago: "",

        medio_pago_id: "",

        comprobante_url: "",

        observaciones: "",
      });
    } catch (err) {
      const st = err?.status ?? err?.response?.status;

      if (st === 401 || st === 403) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      const data = err?.data ?? err?.response?.data ?? {};

      const human = prettyBackendErrors(data);

      setError(human || `❌ Error al registrar el pago (HTTP ${st || "desconocido"})`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─────────────────────────────

     UI styles

     HOMOLOGADO CON listarPagos.jsx

     IMPORTANTE:
     - Dashboard controla el fondo global.
     - Esta vista permanece transparente.
     - Sólo las tarjetas reales tienen superficie.
  ───────────────────────────── */

  const page = "min-h-[calc(100vh-100px)] w-full bg-transparent px-3 sm:px-5 lg:px-7 2xl:px-10 pt-4 pb-16 font-sans";

  const content = "w-full max-w-[1700px] mx-auto";

  const title = darkMode ? "text-white" : "text-[#6d5829]";

  const subtitle = darkMode ? "text-white/70" : "text-[#6d5829]/75";

  const card =
    "rounded-2xl border shadow-[0_14px_42px_rgba(0,0,0,0.12)] " +
    (darkMode ? "bg-white/[0.07] border-white/10" : "bg-white/70 border-[#6d5829]/15");

  const thead = darkMode ? "bg-black/20 text-[#ffdda1]" : "bg-[#f7ead4] text-[#6d5829]";

  const row =
    "transition " + (darkMode ? "border-white/10 hover:bg-white/[0.05]" : "border-[#6d5829]/10 hover:bg-white");

  const inputClase =
    "w-full min-h-11 rounded-xl px-3.5 py-2.5 text-[14px] sm:text-[15px] font-medium outline-none transition " +
    (darkMode
      ? "border border-white/15 bg-[#111827] text-white placeholder:text-white/45 focus:border-[#ffdda1] focus:ring-2 focus:ring-[#ffdda1]/15"
      : "border border-[#9b7b50]/55 bg-white text-[#3f2d18] placeholder:text-[#7b6750] focus:border-[#aa5013] focus:ring-2 focus:ring-[#aa5013]/10");

  const selectClase = inputClase;

  const labelClase =
    "block mb-1.5 text-[13px] sm:text-[14px] font-extrabold " + (darkMode ? "text-[#f5e7d0]" : "text-[#4a351f]");

  const btnPrimario =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition hover:opacity-90 active:scale-[0.98] " +
    (darkMode ? "bg-[#ffdda1] text-[#3f2d18]" : "bg-[#aa5013] text-white");

  const btnSecundario =
    "inline-flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold transition active:scale-[0.98] " +
    (darkMode ? "border-white/15 text-white hover:bg-white/10" : "border-[#6d5829]/20 text-[#6d5829] hover:bg-white");

  const msgOk =
    "mt-4 rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold text-center " +
    (darkMode
      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-800");

  const msgErr =
    "mt-4 rounded-xl border px-4 py-3 text-[14px] sm:text-[15px] font-semibold text-center " +
    (darkMode ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-700");

  const disableSubmit = useMemo(() => {
    return !selectedRut || !form.tipo_pago_id || !form.monto || !form.fecha_pago || !form.medio_pago_id || isSubmitting;
  }, [selectedRut, form, isSubmitting]);

  /* ─────────────────────────────

     Render

  ───────────────────────────── */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     VISTA A: LISTA
  ======================================================= */

  if (!selectedRut) {
    return (
      <div className={page}>
        <div className={content}>
          {/* ===============================================
              HEADER / BUSCADOR
          =============================================== */}

          <section className={`${card} p-4 sm:p-5`}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight text-center sm:text-left ${title}`}>
                  Ingresar pagos
                </h1>

                <p className={`mt-1 text-[13px] sm:text-[14px] leading-relaxed text-center sm:text-left ${subtitle}`}>
                  Selecciona un jugador <span className="font-extrabold">ACTIVO</span> (estado_id = 1) para registrar
                  mensualidad, matrícula, torneo, etc.
                </p>
              </div>

              <div className="w-full sm:w-[420px]">
                <label className={labelClase}>Buscar</label>

                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className={inputClase}
                  placeholder="Buscar por nombre, RUT o categoría…"
                />
              </div>
            </div>

            {error && <div className={msgErr}>{error}</div>}
          </section>

          {/* ===============================================
              CATEGORÍAS
          =============================================== */}

          <div className="space-y-4 sm:space-y-5 mt-5">
            {gruposPorCategoria.map(([categoria, arr]) => (
              <section key={categoria} className={`${card} overflow-hidden`}>
                {/* =======================================
                      CABECERA CATEGORÍA
                  ======================================= */}

                <div className={`px-4 sm:px-5 py-4 border-b ${darkMode ? "border-white/10" : "border-[#6d5829]/10"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`text-lg font-extrabold ${title}`}>{categoria}</h3>

                    <span className={`text-xs font-semibold ${darkMode ? "text-white/70" : "text-[#6d5829]/70"}`}>
                      {arr.length} jugador
                      {arr.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                </div>

                {/* =======================================
                      TABLA
                  ======================================= */}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm table-fixed">
                    <thead className={thead}>
                      <tr className="text-xs uppercase tracking-wide">
                        <th className="w-1/3 px-5 py-3 text-center font-extrabold">Nombre</th>

                        <th className="w-1/3 px-5 py-3 text-center font-extrabold">RUT</th>

                        <th className="w-1/3 px-5 py-3 text-center font-extrabold">Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      {arr.map((j, idx) => {
                        const rutRaw = j?.rut_jugador ?? j?.rut;

                        const nombre = j?.nombre_jugador ?? j?.nombre ?? j?.nombre_completo ?? "—";

                        return (
                          <tr key={`${rutRaw}-${idx}`} className={`border-t ${row}`}>
                            <td
                              className={`w-1/3 px-5 py-4 text-center align-middle font-semibold ${
                                darkMode ? "text-white/90" : "text-[#6d5829]"
                              }`}
                            >
                              <div className="truncate">{nombre}</div>
                            </td>

                            <td
                              className={`w-1/3 px-5 py-4 text-center align-middle font-semibold ${
                                darkMode ? "text-white/90" : "text-[#6d5829]"
                              }`}
                            >
                              {formatRutWithDV(String(rutRaw ?? ""))}
                            </td>

                            <td className="w-1/3 px-5 py-4 text-center align-middle">
                              <div className="flex justify-center">
                                <button type="button" onClick={() => openFormulario(rutRaw)} className={btnPrimario}>
                                  <CreditCard size={16} />
                                  Ingresar pago
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {arr.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className={`px-5 py-8 text-center ${darkMode ? "text-white/70" : "text-[#6d5829]/70"}`}
                          >
                            No hay jugadores en esta categoría.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            {gruposPorCategoria.length === 0 && (
              <div className={`${card} p-8 text-center`}>
                <p className={subtitle}>No hay jugadores activos que coincidan con el filtro.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     VISTA B: FORMULARIO
  ======================================================= */

  return (
    <div className={page}>
      <div className="w-full max-w-3xl mx-auto">
        {/* ===============================================
            CABECERA FORMULARIO
        =============================================== */}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <button type="button" onClick={volverALista} className={btnSecundario}>
            Volver a jugadores
          </button>

          <div className={`text-sm font-extrabold ${darkMode ? "text-white/85" : "text-[#6d5829]/85"}`}>
            RUT: {formatRutWithDV(String(selectedRut))}
          </div>
        </div>

        <header className="text-center mb-5">
          <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${title}`}>Registrar Pago</h1>

          <p className={`mx-auto mt-2 max-w-2xl text-[14px] sm:text-[15px] ${subtitle}`}>
            Completa los datos del pago asociado al jugador seleccionado.
          </p>
        </header>

        {/* ===============================================
            FORMULARIO
        =============================================== */}

        <section className={`${card} p-5 sm:p-6 lg:p-8`}>
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClase}>Tipo de pago *</label>

                <select
                  name="tipo_pago_id"
                  value={form.tipo_pago_id}
                  onChange={handleChange}
                  className={selectClase}
                  required
                >
                  <option value="">Seleccione Tipo de Pago</option>

                  {tiposPago.map((tipo) => (
                    <option key={tipo.id} value={String(tipo.id)}>
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClase}>Medio de pago *</label>

                <select
                  name="medio_pago_id"
                  value={form.medio_pago_id}
                  onChange={handleChange}
                  className={selectClase}
                  required
                >
                  <option value="">Seleccione Medio de Pago</option>

                  {mediosPago.map((medio) => (
                    <option key={medio.id} value={String(medio.id)}>
                      {medio.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClase}>Monto (CLP) *</label>

                <input
                  name="monto"
                  value={form.monto}
                  onChange={handleChange}
                  placeholder="Monto $"
                  className={inputClase}
                  inputMode="decimal"
                  required
                />
              </div>

              <div>
                <label className={labelClase}>Fecha de pago *</label>

                <input
                  name="fecha_pago"
                  type="date"
                  value={form.fecha_pago}
                  onChange={handleChange}
                  className={inputClase}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClase}>URL comprobante (opcional)</label>

              <input
                name="comprobante_url"
                value={form.comprobante_url}
                onChange={handleChange}
                placeholder="https://..."
                className={inputClase}
              />
            </div>

            <div>
              <label className={labelClase}>Observaciones (opcional)</label>

              <textarea
                name="observaciones"
                value={form.observaciones}
                onChange={handleChange}
                placeholder="Observaciones…"
                className={inputClase}
                rows={3}
              />
            </div>

            <button
              type="submit"
              disabled={disableSubmit}
              className={`w-full min-h-11 rounded-xl px-5 py-2.5 text-[14px] sm:text-[15px] font-extrabold transition ${
                disableSubmit
                  ? darkMode
                    ? "bg-white/10 text-white/40 cursor-not-allowed"
                    : "bg-[#6d5829]/20 text-[#6d5829]/50 cursor-not-allowed"
                  : darkMode
                    ? "bg-[#ffdda1] text-[#3f2d18] hover:opacity-90 active:scale-[0.99]"
                    : "bg-[#aa5013] text-white hover:opacity-90 active:scale-[0.99]"
              }`}
            >
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </form>

          {mensaje && <div className={msgOk}>{mensaje}</div>}

          {error && <div className={msgErr}>{error}</div>}
        </section>
      </div>
    </div>
  );
}
