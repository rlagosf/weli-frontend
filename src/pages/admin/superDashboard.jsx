// src/pages/admin/superDashboard.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { getToken, clearToken } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { LogOut, Plus, Building2, Sun, Moon } from "lucide-react";
import { jwtDecode } from "jwt-decode";

const STORAGE_KEY = "weli_selected_academia";

// rutas estables: api.js ya asegura baseURL termina en /api
const academiasPath = "/academias";
const deportesPath = "/deportes";

function pickAcademias(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.items)) return payload.items;       // ✅ estándar catálogos: { ok, count, items }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.academias)) return payload.academias;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;
  return [];
}

function pickDeportes(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.items)) return payload.items;       // ✅ estándar
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.deportes)) return payload.deportes;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;
  return [];
}

/* ───────────── Modal ───────────── */
const Modal = ({ open, onClose, title, subtitle, darkMode, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className={[
          "relative w-full max-w-xl rounded-2xl shadow-2xl border p-6",
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
              darkMode ? "bg-white/10 hover:bg-white/15 border-white/10 text-white" : "bg-white hover:bg-ra-cream border-ra-marron/15 text-ra-marron",
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

export default function SuperDashboard() {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();

  const [academias, setAcademias] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [deportes, setDeportes] = useState([]);
  const [deportesReady, setDeportesReady] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ nombre: "", deporte_id: "", estado_id: "1" });

  /* ───────── Guard: solo rol 3 ───────── */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      const rol = Number(decoded?.rol_id ?? decoded?.role_id ?? decoded?.role ?? 0);

      if (rol !== 3) {
        // Si no es superadmin, fuera
        navigate("/admin", { replace: true });
      }
    } catch {
      clearToken();
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const loadAcademias = useCallback(async (signal) => {
    setLoading(true);
    setMsg("");

    try {
      const res = await api.get(academiasPath, {
        signal,
        headers: { "Cache-Control": "no-cache" },
      });
      setAcademias(pickAcademias(res?.data ?? {}));
    } catch (err) {
      if (signal?.aborted) return;

      // api.js normaliza error a {status,message,data}
      const status = err?.status ?? err?.response?.status ?? 0;
      const message =
        err?.data?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Error cargando academias";

      if (status === 401) setMsg("No autorizado (token ausente/expirado).");
      else if (status === 403) setMsg("Acceso denegado: requiere rol superadmin.");
      else if (status === 404) setMsg("Endpoint no encontrado.");
      else setMsg(String(message));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const loadDeportes = useCallback(async (signal) => {
    setDeportesReady(false);

    try {
      const res = await api.get(deportesPath, {
        signal,
        headers: { "Cache-Control": "no-cache" },
      });

      const raw = pickDeportes(res?.data ?? {});
      const normalized = (raw || [])
        .map((d) => ({
          id: Number(d?.id ?? d?.deporte_id ?? 0),
          nombre: String(d?.nombre ?? d?.name ?? "").trim(),
        }))
        .filter((d) => Number.isFinite(d.id) && d.id > 0 && d.nombre.length > 0);

      setDeportes(normalized);
      setDeportesReady(true);
    } catch {
      setDeportes([]);
      setDeportesReady(true);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    loadAcademias(ctrl.signal);
    loadDeportes(ctrl.signal);
    return () => ctrl.abort();
  }, [loadAcademias, loadDeportes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return academias;

    return academias.filter((a) => {
      const name = String(a?.nombre ?? "").toLowerCase();
      const sportName = String(a?.deporte_nombre ?? "").toLowerCase();
      const estadoName = String(a?.estado_nombre ?? "").toLowerCase();
      return name.includes(needle) || sportName.includes(needle) || estadoName.includes(needle);
    });
  }, [academias, q]);

  const enterAcademia = (a) => {
    const id = Number(a?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return;

    const snapshot = {
      id,
      nombre: a?.nombre ?? null,
      deporte_id: a?.deporte_id ?? null,
      deporte_nombre: a?.deporte_nombre ?? null,
      estado_id: a?.estado_id ?? null,
      estado_nombre: a?.estado_nombre ?? null,
      ts: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {}

    // salto real
    window.location.assign("/super-dashboard/admin/dashboard");
  };

  const handleCerrarSesion = useCallback(async () => {
    const token = getToken();

    try {
      await api.post("/auth/logout", null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // idempotente
    } finally {
      clearToken();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.location.replace("/");
    }
  }, []);

  const openCreateModal = () => {
    setMsg("");
    setForm({ nombre: "", deporte_id: "", estado_id: "1" });
    setOpenCreate(true);
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setMsg("");

    const nombre = String(form.nombre || "").trim();
    const deporte_id = Number(form.deporte_id);
    const estado_id = Number(form.estado_id);

    if (nombre.length < 2) return setMsg("El nombre debe tener al menos 2 caracteres.");
    if (!Number.isFinite(deporte_id) || deporte_id <= 0) return setMsg("Debes seleccionar un deporte válido.");
    if (!Number.isFinite(estado_id) || estado_id <= 0) return setMsg("Debes indicar un estado válido.");

    setCreating(true);
    try {
      await api.post(academiasPath, { nombre, deporte_id, estado_id });
      setOpenCreate(false);

      const ctrl = new AbortController();
      await loadAcademias(ctrl.signal);
    } catch (err) {
      const status = err?.status ?? err?.response?.status ?? 0;
      const message =
        err?.data?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Error creando academia";

      if (status === 409) setMsg("Ya existe una academia con ese nombre.");
      else if (status === 401) setMsg("No autorizado. Inicia sesión nuevamente.");
      else if (status === 403) setMsg("Acceso denegado: requiere rol superadmin.");
      else setMsg(String(message));
    } finally {
      setCreating(false);
    }
  };

  /* ───────────── Theme classes (WELI) ───────────── */
  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const headerSub = darkMode ? "text-white/70" : "text-ra-marron/70";
  const buttonIcon = darkMode ? "hover:bg-white/10" : "hover:bg-white/30";

  const searchInput = darkMode
    ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
    : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta";

  const msgBox = darkMode
    ? "border-red-200/20 bg-red-500/10 text-red-100"
    : "border-red-200 bg-red-50 text-red-700";

  const card = darkMode
    ? "bg-white/10 border-white/15 hover:bg-white/15 hover:border-white/25"
    : "bg-white/60 border-ra-marron/15 hover:bg-white/80 hover:border-ra-terracotta";

  const badge = darkMode
    ? "bg-white/10 border-white/10 text-white/80"
    : "bg-white/60 border-ra-marron/10 text-ra-marron/80";

  const selectDark =
    "w-full rounded-xl px-4 py-3 bg-[#111827] text-white border border-white/15 outline-none focus:border-white/30";

  const modalInput = darkMode
    ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
    : "bg-white border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta";

  return (
    <div className={`${shell} min-h-screen font-sans`}>
      <header className="flex items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tightish">Panel de Academias</h1>
          <p className={`text-sm mt-1 ${headerSub}`}>Selecciona una academia para entrar a su panel.</p>
        </div>

        <div className="flex items-center gap-2">
          <button title="Cambiar tema" onClick={toggleTheme} className={`p-2 rounded-xl transition ${buttonIcon}`}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <button title="Crear academia" onClick={openCreateModal} className={`p-2 rounded-xl transition ${buttonIcon}`}>
            <Plus size={20} />
          </button>

          <button title="Cerrar sesión" onClick={handleCerrarSesion} className={`p-2 rounded-xl transition ${buttonIcon}`}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="px-6 pb-20">
        <div className="mt-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, deporte o estado…"
            className={`w-full md:w-[560px] rounded-2xl px-5 py-3 border outline-none transition ${searchInput}`}
          />
        </div>

        {loading && <div className={`mt-10 ${darkMode ? "text-white/70" : "text-ra-marron/70"}`}>Cargando academias…</div>}

        {!loading && msg && <div className={`mt-8 rounded-2xl border px-5 py-4 font-semibold ${msgBox}`}>{msg}</div>}

        {!loading && !msg && (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((a) => {
                const id = Number(a?.id ?? 0);
                const nombre = a?.nombre ?? `Academia #${id}`;
                const deporteNombre = a?.deporte_nombre ?? "—";
                const estadoNombre = a?.estado_nombre ?? "—";

                return (
                  <button
                    key={String(id)}
                    type="button"
                    onClick={() => enterAcademia(a)}
                    className={`${card} rounded-2xl p-6 shadow-lg transition transform flex flex-col items-center justify-center gap-3 h-44 hover:-translate-y-1 text-center`}
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-ra-terracotta/90 border border-white/10">
                      <Building2 className="w-8 h-8 text-white" />
                    </div>

                    <div className={`font-extrabold text-lg leading-tight ${darkMode ? "text-white" : "text-ra-marron"}`}>
                      {nombre}
                    </div>

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

      <Modal
        open={openCreate}
        onClose={() => (!creating ? setOpenCreate(false) : null)}
        title="Nueva academia"
        subtitle="Crea una nueva academia y defínela con su deporte y estado."
        darkMode={darkMode}
      >
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className={`text-sm font-bold ${darkMode ? "text-white/80" : "text-ra-marron/80"}`}>Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
              className={`mt-2 w-full rounded-xl px-4 py-3 border outline-none transition ${modalInput}`}
              placeholder="Ej: Academia WELI"
              maxLength={120}
              disabled={creating}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`text-sm font-bold ${darkMode ? "text-white/80" : "text-ra-marron/80"}`}>Deporte</label>

              <select
                value={form.deporte_id}
                onChange={(e) => setForm((s) => ({ ...s, deporte_id: e.target.value }))}
                className={selectDark}
                disabled={creating || !deportesReady}
              >
                {!deportesReady && (
                  <option value="" disabled>
                    Cargando deportes…
                  </option>
                )}

                {deportesReady && deportes.length === 0 && (
                  <option value="" disabled>
                    No hay deportes (crea registros en tabla deportes)
                  </option>
                )}

                {deportesReady && deportes.length > 0 && (
                  <>
                    <option value="" disabled>
                      Selecciona…
                    </option>

                    {deportes
                      .slice()
                      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }))
                      .map((d) => (
                        <option key={String(d.id)} value={String(d.id)}>
                          {d.nombre}
                        </option>
                      ))}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className={`text-sm font-bold ${darkMode ? "text-white/80" : "text-ra-marron/80"}`}>Estado</label>

              <select
                value={form.estado_id}
                onChange={(e) => setForm((s) => ({ ...s, estado_id: e.target.value }))}
                className={selectDark}
                disabled={creating}
              >
                <option value="1">Activado</option>
                <option value="2">Desactivado</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className={[
                "rounded-xl px-5 py-3 border font-bold transition",
                darkMode ? "bg-white/10 border-white/15 hover:bg-white/15 text-white" : "bg-white/60 border-ra-marron/15 hover:bg-white/80 text-ra-marron",
              ].join(" ")}
              disabled={creating}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="rounded-xl px-6 py-3 font-extrabold text-white bg-ra-terracotta hover:opacity-90 active:scale-[0.98] transition"
              disabled={creating || !deportesReady || !form.deporte_id}
              title={!deportesReady ? "Cargando deportes…" : !form.deporte_id ? "Selecciona un deporte" : ""}
            >
              {creating ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
