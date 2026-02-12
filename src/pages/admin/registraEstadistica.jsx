// src/pages/admin/ListarEstadisticas.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api, { getToken, clearToken, ACADEMIA_STORAGE_KEY } from "../../services/api";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { Pencil } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import IsLoading from "../../components/isLoading";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import { formatRutWithDV } from "../../services/rut";

/* ───────────────── Scope helpers ───────────────── */
const STORAGE_KEY = "weli_selected_academia";

const readSelectedAcademia = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);

    const id = Number(p?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;

    const deporte_id = Number(p?.deporte_id ?? 0);
    return {
      id,
      deporte_id: Number.isFinite(deporte_id) && deporte_id > 0 ? deporte_id : null,
      nombre: p?.nombre ?? null,
    };
  } catch {
    return null;
  }
};

const isSuperTreePath = (pathname) =>
  String(pathname || "").startsWith("/super-dashboard/admin/dashboard");

/* =======================
   🎨 Conjunto X
======================= */
const PALETTE_X = {
  copper: "#aa5013",
  brown: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

/* ───────────────── Auth helpers ───────────────── */
const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const raw = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? decoded?.rol;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

/** Soporta "1" o JSON {"id":1} */
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

const buildHeaders = (rol) => {
  const token = getToken();
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  if (rol === 3) {
    const a = getAcademiaIdFromStorage();
    if (a) h["x-academia-id"] = String(a);
  }
  return h;
};

export default function ListarEstadisticas() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [jugadoresRaw, setJugadoresRaw] = useState([]);
  const [categoriasRaw, setCategoriasRaw] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [rol, setRol] = useState(null);

  const [scope, setScope] = useState({
    academia_id: null,
    deporte_id: null,
    academia_nombre: null,
  });

  useMobileAutoScrollTop();

  // ✅ Estrategia dorada: detecta árbol actual
  const dashboardBase = useMemo(() => {
    const p = location.pathname || "";
    return p.startsWith("/super-dashboard/admin/dashboard")
      ? "/super-dashboard/admin/dashboard"
      : "/admin";
  }, [location.pathname]);

  // ─────────────────────────────
  // 🧭 Breadcrumb (ANTI-LOOP) — como PowerbiFinanzas
  // ─────────────────────────────
  const breadcrumbBootRef = useRef(false);

  useEffect(() => {
    if (breadcrumbBootRef.current) return;

    const currentPath = location.pathname + location.search;
    const bc = Array.isArray(location.state?.breadcrumb) ? location.state.breadcrumb : [];
    const last = bc[bc.length - 1];

    const label = "Registrar Estadísticas";
    if (!last || last.label !== label) {
      breadcrumbBootRef.current = true;
      navigate(currentPath, {
        replace: true,
        state: { ...(location.state || {}), breadcrumb: [{ to: currentPath, label }] },
      });
    } else {
      breadcrumbBootRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  /* ───────────────── Auth + Scope ───────────────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const parsedRol = extractRol(decoded);
      if (![1, 2, 3].includes(parsedRol)) {
        navigate(dashboardBase, { replace: true });
        return;
      }
      setRol(parsedRol);

      const superTree = isSuperTreePath(location.pathname);

      if (superTree) {
        const snap = readSelectedAcademia();
        if (!snap?.id) {
          navigate("/super-dashboard", { replace: true });
          return;
        }

        setScope({
          academia_id: snap.id,
          deporte_id: snap.deporte_id,
          academia_nombre: snap.nombre ?? null,
        });
      } else {
        const acad = Number(decoded?.academia_id ?? decoded?.academy_id ?? 0) || null;
        const dep = Number(decoded?.deporte_id ?? decoded?.sport_id ?? 0) || null;

        setScope({ academia_id: acad, deporte_id: dep, academia_nombre: null });
      }

      // ✅ si es rol 3 y falta academia target, lo tratamos como sesión inválida para este módulo
      if (parsedRol === 3) {
        const a = getAcademiaIdFromStorage();
        if (!a) throw new Error("missing-academia-target");
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname, dashboardBase]);

  /* ───────────────── Live update (super selector) ───────────────── */
  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) return;
      if (!isSuperTreePath(location.pathname)) return;

      const snap = readSelectedAcademia();
      if (snap?.id) {
        setScope((prev) => {
          const next = {
            academia_id: snap.id,
            deporte_id: snap.deporte_id,
            academia_nombre: snap.nombre ?? null,
          };
          const same =
            prev?.academia_id === next.academia_id &&
            prev?.deporte_id === next.deporte_id &&
            prev?.academia_nombre === next.academia_nombre;
          return same ? prev : next;
        });
      }
    };

    tick();
    const iv = setInterval(tick, 1200);

    const onStorage = () => tick();
    const onEvent = () => tick();

    window.addEventListener("storage", onStorage);
    window.addEventListener("weli:selectedAcademiaChanged", onEvent);

    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("weli:selectedAcademiaChanged", onEvent);
    };
  }, [location.pathname]);

  /* ───────────────── Helpers fetch ───────────────── */
  const normalizeListResponse = (res) => {
    if (!res || res.status === 204) return [];
    const d = res?.data ?? res;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.rows)) return d.rows;
    if (d?.ok && Array.isArray(d.items)) return d.items;
    if (d?.ok && Array.isArray(d.data)) return d.data;
    return [];
  };

  const getErrStatus = (e) => e?.status ?? e?.response?.status ?? 0;

  const tryGetList = async (paths, { signal, headers } = {}) => {
    const list = Array.isArray(paths) ? paths : [paths];

    const variants = [];
    for (const p0 of list) {
      const p = String(p0 || "");
      const base = p.startsWith("/") ? p : `/${p}`;
      variants.push(base, base.endsWith("/") ? base.slice(0, -1) : `${base}/`);
    }
    const uniq = [...new Set(variants)];

    for (const url of uniq) {
      try {
        const r = await api.get(url, { signal, headers });
        return normalizeListResponse(r);
      } catch (e) {
        const st = getErrStatus(e);
        if (st === 401 || st === 403) throw e;
      }
    }
    return [];
  };

  /* ───────────────── Carga de datos ───────────────── */
  useEffect(() => {
    if (rol == null) return;

    const abort = new AbortController();
    const headers = buildHeaders(rol);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const acadId = scope.academia_id;
        const depId = scope.deporte_id;

        const jugadoresPaths = [];

        if (acadId && depId) {
          if (rol === 2) {
            jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}&deporte_id=${depId}`);
            jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}`);
          } else {
            jugadoresPaths.push(`/jugadores?academia_id=${acadId}&deporte_id=${depId}`);
            jugadoresPaths.push(`/jugadores?academia_id=${acadId}`);
          }
        } else if (acadId) {
          if (rol === 2) jugadoresPaths.push(`/jugadores/staff?academia_id=${acadId}`);
          else jugadoresPaths.push(`/jugadores?academia_id=${acadId}`);
        }

        if (rol === 2) jugadoresPaths.push("/jugadores/staff");
        jugadoresPaths.push("/jugadores");

        const [jugadores, categorias] = await Promise.all([
          tryGetList(jugadoresPaths, { signal: abort.signal, headers }),
          tryGetList(["/categorias"], { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        const jugadoresArr = Array.isArray(jugadores) ? jugadores : [];
        setJugadoresRaw(jugadoresArr);
        setCategoriasRaw(Array.isArray(categorias) ? categorias : []);

        if ((!scope.academia_id || !scope.deporte_id) && jugadoresArr.length) {
          const j0 = jugadoresArr.find((x) => x && (x.academia_id || x.deporte_id));
          const a0 = Number(j0?.academia_id ?? 0) || null;
          const d0 = Number(j0?.deporte_id ?? 0) || null;

          if (a0 || d0) {
            setScope((prev) => ({
              ...prev,
              academia_id: prev.academia_id ?? a0,
              deporte_id: prev.deporte_id ?? d0,
            }));
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;

        const st = getErrStatus(err);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        setError("❌ Error al cargar los jugadores/categorías");
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, scope.academia_id, scope.deporte_id, navigate, location.pathname]);

  /* ───────────────── Categoria maps ───────────────── */
  const categoriaMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((c) => {
      const id = c?.id ?? c?.categoria_id;
      const nombre = c?.nombre ?? c?.descripcion;
      if (id != null && nombre) map.set(Number(id), String(nombre));
    });
    return map;
  }, [categoriasRaw]);

  const categoriaOrder = useMemo(() => {
    const order = new Map();
    (Array.isArray(categoriasRaw) ? categoriasRaw : []).forEach((c, i) => {
      const nombre = (c?.nombre ?? c?.descripcion ?? "").toString();
      if (nombre) order.set(nombre, i);
    });
    return order;
  }, [categoriasRaw]);

  const toCategoria = useCallback(
    (j) => {
      if (j?.categoria?.nombre) return String(j.categoria.nombre);
      if (j?.categoria_nombre) return String(j.categoria_nombre);

      const cid = j?.categoria_id ?? j?.categoria?.id ?? j?.categoriaId;
      const nombre = cid != null ? categoriaMap.get(Number(cid)) : undefined;
      return nombre || "Sin categoría";
    },
    [categoriaMap]
  );

  /* ───────────────── Normalizar jugadores ───────────────── */
  const jugadores = useMemo(() => {
    const toNombre = (j) =>
      j?.nombre_jugador ||
      j?.nombre_completo ||
      j?.nombre ||
      [j?.nombres, j?.apellidos].filter(Boolean).join(" ") ||
      "—";

    const base = Array.isArray(jugadoresRaw) ? jugadoresRaw : [];

    const a = scope.academia_id;
    const d = scope.deporte_id;

    const scoped =
      !a && !d
        ? base
        : base.filter((j) => {
          const aj = Number(j?.academia_id ?? 0);
          const dj = Number(j?.deporte_id ?? 0);
          if (a && aj !== a) return false;
          if (d && dj !== d) return false;
          return true;
        });

    return scoped.map((j, idx) => {
      const jugador_id = Number(j?.id ?? j?.jugador_id ?? 0) || null;

      const rutBase =
        j?.rut_jugador ??
        j?.rut ??
        j?.rutJugador ??
        j?.rut_base ??
        (jugador_id ? String(jugador_id) : `tmp-${idx}`);

      const rutStr = String(rutBase);

      return {
        jugador_id,
        rut: rutStr,
        rutConDV: formatRutWithDV(rutStr),
        nombre: toNombre(j),
        categoriaNombre: toCategoria(j),
      };
    });
  }, [jugadoresRaw, scope.academia_id, scope.deporte_id, toCategoria]);

  /* ───────────────── Grupos ───────────────── */
  const grupos = useMemo(() => {
    const map = new Map();
    for (const j of jugadores) {
      const cat = j.categoriaNombre || "Sin categoría";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(j);
    }

    const entries = [...map.entries()];
    entries.sort((a, b) => {
      const [na] = a;
      const [nb] = b;

      if (na === "Sin categoría" && nb !== "Sin categoría") return 1;
      if (nb === "Sin categoría" && na !== "Sin categoría") return -1;

      const ia = categoriaOrder.has(na) ? categoriaOrder.get(na) : Number.MAX_SAFE_INTEGER;
      const ib = categoriaOrder.has(nb) ? categoriaOrder.get(nb) : Number.MAX_SAFE_INTEGER;

      return ia - ib || na.localeCompare(nb, "es");
    });

    return entries.map(([cat, list]) => ({
      categoria: cat,
      items: [...list].sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
    }));
  }, [jugadores, categoriaOrder]);

  /* ───────────────── UI (SuperDashboard style + tablas notorias) ───────────────── */
  const ui = useMemo(() => {
    const shell = darkMode
      ? "bg-[#111827] text-white"
      : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

    const titleMain = darkMode ? "text-white" : "text-ra-marron";
    const subText = darkMode ? "text-white/70" : "text-ra-marron/70";

    const card =
      "rounded-2xl border shadow-lg transition " +
      (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

    const thead =
      "text-[10px] sm:text-xs " +
      (darkMode
        ? "bg-black/30 text-white border-b border-white/25"
        : "bg-[rgba(109,88,41,0.14)] text-[rgba(109,88,41,0.95)] border-b border-[rgba(109,88,41,0.28)]");

    const th =
      "p-2 text-center whitespace-nowrap border-r " +
      (darkMode ? "border-white/20" : "border-[rgba(109,88,41,0.28)]");

    const td =
      "p-2 text-center border-r " +
      (darkMode ? "border-white/15" : "border-[rgba(109,88,41,0.22)]");


    const tr =
      "border-b cursor-pointer transition " +
      (darkMode
        ? "border-white/15 hover:bg-white/5"
        : "border-[rgba(109,88,41,0.18)] hover:bg-[rgba(109,88,41,0.06)]");

    const warn =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : "border-amber-300/60 bg-amber-50 text-amber-900");

    const danger =
      "rounded-2xl border px-5 py-4 font-semibold " +
      (darkMode
        ? "border-red-200/20 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-700");

    const actionBtn =
      "inline-flex items-center justify-center p-2 rounded-lg border transition-all " +
      "hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    const actionStyle = {
      background: `linear-gradient(135deg, ${PALETTE_X.copper}, ${PALETTE_X.terracotta})`,
      color: "#1a1208",
      borderColor: darkMode ? "rgba(255,255,255,0.20)" : "rgba(109,88,41,0.18)",
    };

    return { shell, titleMain, subText, card, thead, th, td, tr, warn, danger, actionBtn, actionStyle };
  }, [darkMode]);

  if (isLoading) return <IsLoading />;

  if (error) {
    return (
      <div className={`${ui.shell} min-h-screen font-sans flex items-center justify-center px-6`}>
        <div className={`${ui.card} p-6 max-w-xl w-full`}>
          <div className={ui.danger}>{error}</div>
        </div>
      </div>
    );
  }

  const scopeLabelParts = [];
  if (scope.academia_id) scopeLabelParts.push(`Academia #${scope.academia_id}`);
  if (scope.academia_nombre) scopeLabelParts.push(String(scope.academia_nombre));
  if (scope.deporte_id) scopeLabelParts.push(`Deporte #${scope.deporte_id}`);
  const scopeLabel = scopeLabelParts.join(" · ");

  return (
    <div className={`${ui.shell} min-h-screen font-sans`}>
      <header className="px-6 pt-6 text-center">
        <h1 className={`text-4xl font-extrabold tracking-tightish ${ui.titleMain}`}>
          Registrar Estadísticas de Jugadores
        </h1>
        {!!scopeLabel && <p className={`text-sm mt-2 ${ui.subText}`}>{scopeLabel}</p>}
      </header>

      <main className="px-6 pb-20">
        {!scope.deporte_id && (
          <div className="max-w-5xl mx-auto mt-6">
            <div className={ui.warn}>
              Falta <b>deporte_id</b> en el scope. Si estás en super-dashboard, selecciona una academia con deporte asignado.
            </div>
          </div>
        )}

        {grupos.length === 0 ? (
          <div className="max-w-5xl mx-auto mt-8">
            <div className={`${ui.card} p-6 text-center ${darkMode ? "text-white/75" : "text-ra-marron/80"}`}>
              No hay jugadores registrados para este contexto.
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map(({ categoria, items }) => (
              <section key={categoria} className={`${ui.card} p-6`}>
                <header className="mb-4 flex items-baseline justify-between">
                  <h2
                    className="text-lg font-extrabold"
                    style={{ color: darkMode ? PALETTE_X.cream : PALETTE_X.brown }}
                  >
                    {categoria}
                  </h2>
                  <span className={darkMode ? "text-xs text-white/70" : "text-xs text-ra-marron/70"}>
                    {items.length} jugador{items.length !== 1 ? "es" : ""}
                  </span>
                </header>

                {/* ✅ SIN SCROLL HORIZONTAL: no overflow-x-auto, no min-w */}
                <div className="w-full">
                  <table className="w-full text-xs sm:text-sm table-fixed">
                    <thead className={ui.thead}>
                      <tr>
                        {/* ✅ un pelín más compacto */}
                        <th className={`${ui.th} w-28`}>RUT</th>
                        <th className={ui.th}>Nombre</th>

                        {/* ✅ FIX corte: ancho real suficiente + nowrap */}
                        <th className={`${ui.th} w-20 whitespace-nowrap`}>Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((j) => {
                        const isSuperTree = isSuperTreePath(location.pathname);
                        const basePath = isSuperTree ? "/super-dashboard/admin/dashboard" : "/admin";

                        const to = `${basePath}/registrar-estadisticas/detalle-estadistica`;
                        const from = `${basePath}/registrar-estadisticas`;

                        return (
                          <tr key={String(j.jugador_id ?? j.rut)} className={ui.tr}>
                            <td className={`${ui.td} break-all`}>{j.rutConDV}</td>

                            {/* ✅ Nombre no empuja: se trunca */}
                            <td className={`${ui.td}`}>
                              <span className="block truncate" title={j.nombre}>
                                {j.nombre}
                              </span>
                            </td>

                            <td className={`${ui.td} w-24`}>
                              <button
                                onClick={() =>
                                  navigate(to, {
                                    state: {
                                      from,
                                      rut: String(j.rut ?? ""),
                                      jugador_id: j.jugador_id ?? null,
                                      scope: { ...scope },
                                      breadcrumb: [
                                        { label: "Registrar Estadísticas", to: from },
                                        { label: "Detalle Estadística", to },
                                      ],
                                    },
                                  })
                                }
                                className={ui.actionBtn}
                                style={ui.actionStyle}
                                aria-label={`Editar estadísticas de ${j.nombre}`}
                                title={`Editar estadísticas de ${j.nombre}`}
                                disabled={!j.jugador_id && !j.rut}
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
