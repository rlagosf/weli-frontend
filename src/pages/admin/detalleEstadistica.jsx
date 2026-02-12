// src/pages/admin/detalleEstadistica.jsx
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { LoaderCircle } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
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
const ACCENT = PALETTE.copper;

const isSuperTreePath = (pathname) =>
  String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

const STORAGE_KEY = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

const readSelectedAcademiaId = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const p = JSON.parse(raw);
    const id = Number(p?.id ?? p?.academia_id ?? p?.academy_id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

/**
 * ✅ Guard normado
 * - roles permitidos: 1/2/3
 * - super tree: SOLO rol 3 + academia seleccionada
 * - admin tree: 1/2/3 pero exige academia seleccionada (tenant)
 */
const ensureScopeOrRedirect = ({ navigate, isSuperTree }) => {
  const token = getToken?.() || "";
  if (!token) {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }

  try {
    const decoded = jwtDecode(token);
    if (isExpired(decoded)) throw new Error("expired");

    const rol = extractRol(decoded);
    if (![1, 2, 3].includes(rol)) {
      navigate("/admin", { replace: true });
      return { ok: false, rol };
    }

    const academiaId = readSelectedAcademiaId();

    if (isSuperTree) {
      if (rol !== 3) {
        navigate("/admin", { replace: true });
        return { ok: false, rol };
      }
      if (academiaId <= 0) {
        navigate("/super-dashboard", { replace: true });
        return { ok: false, rol };
      }
      return { ok: true, rol };
    }

    // admin tree exige scope también
    if (academiaId <= 0) {
      clearToken?.();
      navigate("/login", { replace: true });
      return { ok: false, rol };
    }

    return { ok: true, rol };
  } catch {
    clearToken?.();
    navigate("/login", { replace: true });
    return { ok: false, rol: 0 };
  }
};

export default function DetalleEstadistica() {
  const { darkMode } = useTheme();
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const mountedRef = useRef(true);

  const superTree = useMemo(() => isSuperTreePath(location.pathname), [location.pathname]);
  const basePath = superTree ? "/super-dashboard/admin/dashboard" : "/admin";
  const backTo = useMemo(
    () => location.state?.from || `${basePath}/registrar-estadisticas`,
    [location.state, basePath]
  );

  const [rol, setRol] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [jugador, setJugador] = useState(null);
  const [jugadorId, setJugadorId] = useState(null);

  const [statsId, setStatsId] = useState(null); // stats_base.id
  const [formData, setFormData] = useState({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [statsExistentes, setStatsExistentes] = useState(null);

  useMobileAutoScrollTop();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ============== Breadcrumb (mantener) ============== */
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    const defaultFrom = `${basePath}/registrar-estadisticas`;

    const crumbBase = Array.isArray(location.state?.breadcrumb)
      ? location.state.breadcrumb
      : [{ label: "Registrar Estadísticas", to: location.state?.from || defaultFrom }];

    const last = crumbBase[crumbBase.length - 1];
    const needsAppend = !last || last.label !== "Detalle Estadística";

    if (needsAppend) {
      navigate(currentPath, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [...crumbBase, { label: "Detalle Estadística", to: currentPath }],
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* ===================== UI (SuperDashboard style) ===================== */
  const ui = useMemo(() => {
    // shell general (igual patrón ListarEstadisticas “superdashboard style”)
    const shell =
      "min-h-screen font-sans " +
      (darkMode
        ? "bg-[#111827] text-white"
        : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron");

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    // contenedor grande
    const panel =
      "max-w-6xl mx-auto mt-6 rounded-2xl border shadow-lg overflow-hidden " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    // tarjeta interna
    const card =
      "rounded-2xl border p-4 " +
      (darkMode ? "bg-white/8 border-white/15" : "bg-white/55 border-ra-marron/15");

    // pills (valores actuales)
    const pill =
      "rounded-xl border px-3 py-2 " +
      (darkMode ? "bg-black/20 border-white/15" : "bg-white/55 border-ra-marron/15");

    // inputs: en light NO blanco sobre claro → texto marrón, fondo blanco suave
    const input =
      "w-full p-2 rounded-lg text-sm outline-none border transition " +
      "focus:ring-2 focus:ring-[rgba(170,80,19,0.22)] focus:border-[rgba(170,80,19,0.35)] " +
      (darkMode
        ? "bg-black/25 text-white border-white/15 placeholder-white/60"
        : "bg-white/70 text-ra-marron border-ra-marron/20 placeholder-ra-marron/50");

    const sectionTitleStyle = { color: darkMode ? PALETTE.cream : PALETTE.brown };

    const btnGhost =
      "px-6 py-2 rounded-xl font-extrabold border transition-all shadow-sm " +
      (darkMode
        ? "bg-white/10 border-white/15 hover:bg-white/15"
        : "bg-white/70 border-ra-marron/20 hover:bg-white/80");

    const btnPrimary =
      "px-6 py-2 rounded-xl font-extrabold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

    const btnPrimaryStyle = {
      background: `linear-gradient(135deg, ${PALETTE.copper}, ${PALETTE.terracotta})`,
      color: "#1a1208",
      border: darkMode ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(109,88,41,0.18)",
    };

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold text-center " +
      (darkMode
        ? "border-red-200/20 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-800");

    return {
      shell,
      titleMain,
      subText,
      panel,
      card,
      pill,
      input,
      sectionTitleStyle,
      btnGhost,
      btnPrimary,
      btnPrimaryStyle,
      danger,
    };
  }, [darkMode]);

  /* ============================ Campos ============================ */
  const campos = useMemo(
    () => ({
      Ofensivas: [
        "goles",
        "asistencias",
        "tiros_libres",
        "penales",
        "tiros_arco",
        "tiros_fuera",
        "tiros_bloqueados",
        "regates_exitosos",
        "centros_acertados",
        "pases_clave",
      ],
      Defensivas: ["intercepciones", "despejes", "duelos_ganados", "entradas_exitosas", "bloqueos", "recuperaciones"],
      Técnicas: ["pases_completados", "pases_errados", "posesion_perdida", "offsides", "faltas_cometidas", "faltas_recibidas"],
      Físicas: ["distancia_recorrida_km", "sprints", "duelos_aereos_ganados", "minutos_jugados", "partidos_jugados"],
      Médicas: ["lesiones", "dias_baja"],
      Disciplina: ["tarjetas_amarillas", "tarjetas_rojas", "sanciones_federativas"],
    }),
    []
  );

  const opciones = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);
  const allFields = useMemo(() => Object.values(campos).flat(), [campos]);

  const blankForm = useCallback(
    (sid) => {
      const baseForm = { stats_id: sid ?? null };
      allFields.forEach((campo) => {
        baseForm[campo] = campo === "distancia_recorrida_km" ? 0.0 : 0;
      });
      return baseForm;
    },
    [allFields]
  );

  const unwrapJugador = (resData) => {
    const root = resData?.data ?? resData;
    if (Array.isArray(root?.items) && root.items.length > 0) return root.items[0];
    if (root?.item) return root.item;
    if (root?.jugador) return root.jugador;
    return root;
  };

  const pretty = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  const rutConDV = useMemo(() => {
    if (!jugador) return formatRutWithDV(rut);
    return formatRutWithDV(jugador.rut_jugador ?? rut);
  }, [jugador, rut]);

  const flattenJoined = useCallback(
    (joined) => {
      const baseStats = joined?.base || {};
      const sportStats = joined?.sport || {};
      const out = { ...baseStats, ...sportStats };

      if (out.id != null && out.stats_id == null) out.stats_id = out.id;

      allFields.forEach((k) => {
        if (out[k] == null) out[k] = k === "distancia_recorrida_km" ? 0.0 : 0;
      });

      return out;
    },
    [allFields]
  );

  const pickEditablePayload = useCallback(
    (obj) => {
      const out = {};
      allFields.forEach((k) => {
        const v = obj?.[k];
        if (v === undefined) return;
        out[k] =
          k === "distancia_recorrida_km"
            ? Number.isFinite(Number.parseFloat(String(v)))
              ? Number.parseFloat(String(v))
              : 0
            : Number.isFinite(Number.parseInt(String(v), 10))
              ? Number.parseInt(String(v), 10)
              : 0;
      });
      return out;
    },
    [allFields]
  );

  /* ============================ Auth ============================ */
  useEffect(() => {
    const g = ensureScopeOrRedirect({ navigate, isSuperTree: superTree });
    if (!g.ok) return;

    if (mountedRef.current) {
      setRol(g.rol);
      setCanWrite([1, 3].includes(g.rol));
    }
  }, [navigate, superTree]);

  /* ====================== Cargar jugador + stats ====================== */
  useEffect(() => {
    if (rol == null) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setError("");

      try {
        const stateJugadorId = Number(location.state?.jugador_id ?? 0) || null;
        let jid = stateJugadorId;

        let jRaw = null;

        if (jid) {
          try {
            const resJ = await api.get(`/jugadores/${encodeURIComponent(String(jid))}`, { meta: { isPublic: false } });
            jRaw = unwrapJugador(resJ.data);
          } catch {
            // fallback rut
          }
        }

        if (!jRaw) {
          const jugadorRes = await api.get(`/jugadores/rut/${encodeURIComponent(rut)}`, { meta: { isPublic: false } });
          jRaw = unwrapJugador(jugadorRes.data);
        }

        if (!alive) return;

        if (!jRaw) {
          setError("El jugador no existe.");
          setLoading(false);
          return;
        }

        const inferredJugadorId = Number(jRaw?.id ?? jRaw?.jugador_id ?? 0) || null;
        if (!jid && inferredJugadorId) jid = inferredJugadorId;

        if (!jid) {
          setError("No se pudo resolver jugador_id (falta id en respuesta del backend).");
          setLoading(false);
          return;
        }

        setJugador(jRaw);
        setJugadorId(jid);

        const joinedRes = await api.get(`/estadisticas/by-jugador/${encodeURIComponent(String(jid))}`, {
          meta: { isPublic: false },
        });

        if (!alive) return;

        const joined = joinedRes?.data?.item ?? joinedRes?.data?.data?.item ?? null;

        if (!joined) {
          setStatsExistentes({});
          setStatsId(null);
          setFormData(blankForm(null));
          setLoading(false);
          return;
        }

        const flat = flattenJoined(joined);

        const sid = Number(flat?.stats_id ?? flat?.id ?? 0) || null;
        setStatsId(sid);
        setStatsExistentes(flat);

        // modo acumulativo: incrementos en 0
        setFormData(blankForm(sid));
      } catch (err) {
        const st = getErrStatus(err);

        if (st === 401) {
          clearToken?.();
          navigate("/login", { replace: true });
          return;
        }

        if (st === 403) {
          // ✅ 403 no logout automático
          setError("No tienes permisos para ver/editar estadísticas en esta academia.");
          setTimeout(() => navigate(backTo, { replace: true }), 900);
          return;
        }

        if (st === 404) setError("El jugador o sus stats no existen.");
        else setError("Error al cargar los datos.");

        setTimeout(() => navigate(backTo, { replace: true }), 900);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [rol, rut, navigate, location.state, blankForm, flattenJoined, backTo]);

  /* ============================ Handlers ============================ */
  const handleChange = (campo, value) => {
    setFormData((prev) => ({
      ...prev,
      [campo]:
        campo === "distancia_recorrida_km"
          ? Number.isFinite(parseFloat(value))
            ? parseFloat(value)
            : 0
          : Number.isFinite(parseInt(value, 10))
            ? parseInt(value, 10)
            : 0,
    }));
  };

  const handleResetLocal = () => setFormData(blankForm(statsId));

  const handleSubmit = async () => {
    if (submitting) return;

    const g = ensureScopeOrRedirect({ navigate, isSuperTree: superTree });
    if (!g.ok) return;

    if (!canWrite) {
      setError("No tienes permisos para guardar (solo roles 1 y 3).");
      return;
    }
    if (!jugadorId) {
      setError("Falta jugador_id.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const currentStats = statsExistentes && typeof statsExistentes === "object" ? statsExistentes : {};
      const incStats = formData && typeof formData === "object" ? formData : {};

      const sumado = {};
      allFields.forEach((campo) => {
        const antiguo = Number(currentStats?.[campo] ?? 0);
        const nuevo = Number(incStats?.[campo] ?? 0);

        sumado[campo] =
          campo === "distancia_recorrida_km"
            ? Number((antiguo + nuevo).toFixed(2))
            : (Number.isFinite(antiguo) ? antiguo : 0) + (Number.isFinite(nuevo) ? nuevo : 0);
      });

      const payload = pickEditablePayload(sumado);

      if (statsId) {
        await api.put(`/estadisticas/${encodeURIComponent(String(statsId))}`, payload, { meta: { isPublic: false } });
      } else {
        const academia_id =
          Number(jugador?.academia_id ?? 0) || Number(location.state?.scope?.academia_id ?? 0) || null;

        const deporte_id =
          Number(jugador?.deporte_id ?? 0) || Number(location.state?.scope?.deporte_id ?? 0) || null;

        if (!academia_id || !deporte_id) {
          throw new Error("Falta academia_id/deporte_id para crear stats.");
        }

        await api.post(
          "/estadisticas",
          { academia_id, deporte_id, jugador_id: jugadorId, ...payload },
          { meta: { isPublic: false } }
        );
      }

      alert("✅ Estadísticas acumuladas y guardadas correctamente");
      navigate(backTo, { replace: true });
    } catch (err) {
      const st = getErrStatus(err);

      if (st === 401) {
        clearToken?.();
        navigate("/login", { replace: true });
        return;
      }

      if (st === 403) {
        setError("No tienes permisos para guardar estadísticas en esta academia.");
        return;
      }

      const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(detail || "❌ Error al guardar estadísticas");
    } finally {
      setSubmitting(false);
    }
  };

  /* ============================ Render ============================ */
  if (loading) {
    return (
      <div className={`${ui.shell} flex justify-center items-center`}>
        <LoaderCircle className="animate-spin w-12 h-12" style={{ color: ACCENT }} />
      </div>
    );
  }

  const nombreJugador = jugador?.nombre_jugador ?? jugador?.nombre ?? "Jugador";

  return (
    <div className={ui.shell}>
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
          Detalle Estadística
        </h1>
        <p className={`text-2xl mt-2 ${ui.subText}`}>
          {nombreJugador} · RUT: <span className="font-semibold">{rutConDV}</span>
          {jugadorId ? ` · Jugador ID: ${jugadorId}` : ""}
          {statsId ? ` · Stats ID: ${statsId}` : " · Stats: (sin id aún)"}
          {!canWrite ? " · (Solo lectura)" : ""}
        </p>
      </header>

      <main className="px-6 pb-20">
        {error && (
          <div className="max-w-6xl mx-auto mt-6">
            <div className={ui.danger}>{error}</div>
          </div>
        )}

        <div className={ui.panel}>
          <div className="p-4 md:p-6">
            {/* Valores actuales */}
            {statsExistentes &&
              typeof statsExistentes === "object" &&
              Object.keys(statsExistentes).length > 0 && (
                <div className={`${ui.card} mb-5`}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-extrabold" style={ui.sectionTitleStyle}>
                      Valores actuales (acumulados)
                    </h2>

                    <button
                      type="button"
                      onClick={() => navigate(backTo, { replace: true })}
                      className={ui.btnGhost}
                      title="Volver"
                    >
                      Volver
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                    {allFields.map((k) => (
                      <div key={k} className={`flex items-center justify-between gap-2 ${ui.pill}`}>
                        <span className={darkMode ? "text-white/80" : "text-ra-marron/80"}>
                          {pretty(k)}
                        </span>
                        <span className={darkMode ? "text-white font-extrabold" : "text-ra-marron font-extrabold"}>
                          {k === "distancia_recorrida_km"
                            ? Number(statsExistentes?.[k] ?? 0).toFixed(2)
                            : Number(statsExistentes?.[k] ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className={`mt-3 text-[12px] ${darkMode ? "text-white/70" : "text-ra-marron/70"}`}>
                    Lo que ingreses abajo se <b>suma</b> a estos valores (modo acumulativo).
                  </p>
                </div>
              )}

            {/* Form por categorías */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Object.entries(campos).map(([categoria, listaCampos]) => (
                <section key={categoria} className={ui.card}>
                  <h3 className="text-base font-extrabold mb-3" style={ui.sectionTitleStyle}>
                    {categoria}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {listaCampos.map((campo) => (
                      <div key={campo} className="space-y-1">
                        <label className={`block text-xs sm:text-sm font-semibold ${darkMode ? "text-white/85" : "text-ra-marron/85"}`}>
                          {pretty(campo)}
                        </label>

                        {campo === "distancia_recorrida_km" ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData[campo] ?? 0}
                            onChange={(e) => handleChange(campo, e.target.value)}
                            className={ui.input}
                            disabled={!canWrite}
                          />
                        ) : (
                          <select
                            value={formData[campo] ?? 0}
                            onChange={(e) => handleChange(campo, e.target.value)}
                            className={ui.input}
                            disabled={!canWrite}
                          >
                            {opciones.map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap justify-center gap-3 mt-7">
              <button
                type="button"
                onClick={handleResetLocal}
                className={ui.btnGhost}
                disabled={!canWrite}
                title={!canWrite ? "Solo lectura" : "Limpiar"}
              >
                Limpiar a 0
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting || !canWrite}
                className={ui.btnPrimary}
                style={{
                  ...(ui.btnPrimaryStyle || {}),
                  opacity: submitting || !canWrite ? 0.6 : 1,
                }}
                title={!canWrite ? "Solo lectura (roles 1 y 3 pueden guardar)" : "Guardar"}
              >
                {submitting ? "Guardando..." : "Acumular y Guardar"}
              </button>

              <button
                type="button"
                onClick={() => navigate(backTo, { replace: true })}
                className={ui.btnGhost}
                title="Volver"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
