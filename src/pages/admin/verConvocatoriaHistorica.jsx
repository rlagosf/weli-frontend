// src/pages/admin/verConvocacionHistorica.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { useTheme } from "../../context/ThemeContext";
import api, {
  getToken,
  clearToken,
  ACADEMIA_STORAGE_KEY,
} from "../../services/api";
import IsLoading from "../../components/isLoading";
import { FileText, X } from "lucide-react";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatRutWithDV } from "../../services/rut";

/* ================= Helpers ================= */

const toArray = (resp) => {
  const d = resp?.data ?? resp ?? [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (d?.ok && Array.isArray(d.items)) return d.items;
  if (d?.ok && Array.isArray(d.data)) return d.data;
  return [];
};

const isCanceled = (e) =>
  e?.name === "CanceledError" ||
  e?.code === "ERR_CANCELED" ||
  String(e?.message || "").toLowerCase().includes("canceled");

const getStatus = (e) => e?.status ?? e?.response?.status;
const getMessage = (e, fallback = "Error") =>
  e?.message || e?.data?.message || e?.response?.data?.message || fallback;

const FUCHSIA = [232, 45, 137]; // #e82d89

const isNonEmptyStr = (s) => typeof s === "string" && s.trim().length > 0;
const coalesceStr = (...vals) => vals.find(isNonEmptyStr) || "";

const calcEdad = (fnac) => {
  if (!fnac) return "";
  const f = new Date(fnac);
  if (Number.isNaN(f.getTime())) return "";
  const diff = Date.now() - f.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

// Normaliza rut para usarlo como clave en Map (solo dígitos; rut sin DV)
const normalizeRutKey = (val) => {
  if (val == null) return "";
  const s = String(val).trim();
  if (!s) return "";
  return s.replace(/\D/g, "");
};

const nombreDesdeJugador = (j) =>
  coalesceStr(
    j?.nombre_jugador,
    j?.nombre_completo,
    [j?.nombres, j?.apellidos].filter(isNonEmptyStr).join(" ").trim(),
    j?.nombre
  );

const nombreDesdeConvocado = (c) =>
  coalesceStr(c?.nombre_jugador, c?.jugador_nombre, c?.nombre, c?.nombre_completo);

/* ================= Auth / Headers (WELI) ================= */

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);
  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;
  const parsed = Number(rawRol);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Soporta "1" o JSON {"id":1} */
const getAcademiaIdFromStorage = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);
    if (!raw) return null;

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const parsed = JSON.parse(raw);
    const id = Number(
      parsed?.id ?? parsed?.academia_id ?? parsed?.academiaId ?? 0
    );
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

const getWithFallback = async (path, { signal, headers } = {}) => {
  const urls = path.endsWith("/")
    ? [path, path.slice(0, -1)]
    : [path, `${path}/`];

  let lastErr = null;
  for (const url of urls) {
    try {
      return await api.get(url, { signal, headers });
    } catch (e) {
      lastErr = e;
      const st = getStatus(e);
      if (st === 401 || st === 403) throw e;
    }
  }
  throw lastErr ?? new Error("GET failed");
};

/* ================= Componente ================= */

export default function VerConvocacionHistorica() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [rolActual, setRolActual] = useState(0);

  const [historicos, setHistoricos] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [modal, setModal] = useState({ open: false, evento: null, jugadores: [] });
  const generatingRef = useRef(false);

  // mapa rutNormalizado -> { nombre, fnac, edad }
  // Lo usamos como "set" de jugadores activos (estado_id=1).
  const jugadoresMapRef = useRef(new Map());

  useMobileAutoScrollTop();

  /* ========= Breadcrumb ========= */
  // 🧭 Breadcrumb por defecto (MISMO PATRÓN que listarPagos.jsx)
  useEffect(() => {
    if (!Array.isArray(location.state?.breadcrumb)) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: {
          ...(location.state || {}),
          breadcrumb: [{ to: location.pathname, label: "Histórico de Convocatorias" }],
        },
      });
    }
  }, [location, navigate]);


  /* ========= Auth =========
     - rol 1: admin
     - rol 2: staff
     - rol 3: superadmin (requiere academia seleccionada)
  */
  useEffect(() => {
    try {
      const token = getToken();
      if (!token) throw new Error("no-token");

      const decoded = jwtDecode(token);
      if (isExpired(decoded)) throw new Error("expired");

      const rol = extractRol(decoded);
      if (![1, 2, 3].includes(rol)) {
        navigate("/admin", { replace: true });
        return;
      }

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

  /* ========= Carga eventos + históricos ========= */
  useEffect(() => {
    const abort = new AbortController();
    const headers = buildHeaders(rolActual);

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const [evRes, hRes] = await Promise.all([
          getWithFallback("/eventos", { signal: abort.signal, headers }),
          getWithFallback("/convocatorias-historico", { signal: abort.signal, headers }),
        ]);

        if (abort.signal.aborted) return;

        setEventos(toArray(evRes));
        setHistoricos(toArray(hRes));
      } catch (err) {
        if (abort.signal.aborted || isCanceled(err)) return;

        const st = getStatus(err);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        setError(getMessage(err, "No se pudo cargar la información"));
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual]);

  /* ========= Carga jugadores (para nombre + fnac + edad) ========= */
  useEffect(() => {
    const abort = new AbortController();
    const headers = buildHeaders(rolActual);

    (async () => {
      try {
        const resp = await getWithFallback("/jugadores", { signal: abort.signal, headers });

        if (abort.signal.aborted) return;

        const js = toArray(resp);
        const map = new Map();

        for (const j of js) {
          // seguridad: si backend trae no-activos, los excluimos igual
          const estadoId = Number(j?.estado_id ?? j?.estadoId ?? j?.estado ?? 0);
          if (estadoId !== 0 && estadoId !== 1) continue; // si viene 0 desconocido, no excluimos; si viene !=1, fuera
          if (estadoId !== 0 && estadoId !== 1) continue;

          const rutRaw = j?.rut_jugador ?? j?.rut ?? j?.id;
          const rutKey = normalizeRutKey(rutRaw);
          if (!rutKey) continue;

          const nombre = nombreDesdeJugador(j);
          if (!isNonEmptyStr(nombre)) continue;

          const fnac =
            j?.fecha_nacimiento ??
            j?.fechaNacimiento ??
            j?.fnac ??
            j?.fecha_nac ??
            null;

          const edadRaw = j?.edad ?? j?.edad_actual ?? null;
          const edad =
            typeof edadRaw === "number"
              ? edadRaw
              : typeof edadRaw === "string" && edadRaw.trim()
                ? Number(edadRaw)
                : fnac
                  ? calcEdad(fnac)
                  : "";

          // En WELI, "activos" suele ser estado_id=1, así que si viene ese dato lo usamos como filtro real:
          if (Number.isFinite(estadoId) && estadoId !== 1) continue;

          map.set(rutKey, { nombre, fnac, edad });
        }

        jugadoresMapRef.current = map;
      } catch (err) {
        if (abort.signal.aborted || isCanceled(err)) return;

        const st = getStatus(err);
        if (st === 401 || st === 403) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        // si falla, seguimos sin mapa
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual]);

  /* ========= Helpers UI/datos ========= */

  const fondoClase = darkMode ? "bg-[#111827] text-white" : "bg-white text-[#1d0b0b]";
  const tablaCabecera = darkMode ? "bg-[#1f2937] text-white" : "bg-gray-100 text-[#1d0b0b]";
  const filaHover = darkMode ? "hover:bg-[#1f2937]" : "hover:bg-gray-50";
  const tarjetaClase = darkMode
    ? "bg-[#1f2937] shadow-lg rounded-lg p-4 border border-gray-700"
    : "bg-white shadow-md rounded-lg p-4 border border-gray-200";

  const getEventoById = (id) =>
    eventos.find((e) => Number(e.id) === Number(id)) || null;

  const nombreEvento = (e) => e?.titulo ?? e?.nombre ?? `Evento #${e?.id ?? "—"}`;
  const fechaEvento = (e) => String(e?.fecha_inicio ?? e?.fecha ?? "").slice(0, 10) || "—";

  const ordenarConvocados = (lista) => {
    const arr = Array.isArray(lista) ? [...lista] : [];
    arr.sort((a, b) => {
      const ra = normalizeRutKey(a?.jugador_rut ?? a?.rut ?? a?.rut_jugador);
      const rb = normalizeRutKey(b?.jugador_rut ?? b?.rut ?? b?.rut_jugador);
      return ra.localeCompare(rb);
    });
    return arr;
  };

  // ✅ Regla de negocio: solo mostramos jugadores vigentes (estado_id=1).
  // Usamos el map de /jugadores como "set" de activos.
  const filtrarSoloActivos = (lista) => {
    const map = jugadoresMapRef.current;
    if (!map || map.size === 0) return Array.isArray(lista) ? lista : []; // fallback si no cargó
    return (Array.isArray(lista) ? lista : []).filter((c) => {
      const rutKey = normalizeRutKey(c?.jugador_rut ?? c?.rut ?? c?.rut_jugador ?? "");
      return rutKey && map.has(rutKey);
    });
  };

  const resolverDatosJugador = (c) => {
    const rutRaw = c?.jugador_rut ?? c?.rut ?? c?.rut_jugador ?? "";
    const rutKey = normalizeRutKey(rutRaw);

    const fromMap = rutKey ? jugadoresMapRef.current.get(rutKey) : null;

    let nombre = nombreDesdeConvocado(c);
    if (!isNonEmptyStr(nombre) && fromMap?.nombre) nombre = fromMap.nombre;

    const fnac =
      fromMap?.fnac ??
      c?.fecha_nacimiento ??
      c?.fechaNacimiento ??
      c?.fnac ??
      c?.fecha_nac ??
      null;

    const edad = fromMap?.edad ?? (fnac ? calcEdad(fnac) : "");

    return {
      rut: rutKey, // rut sin DV (dígitos)
      nombre: nombre || "",
      fnac: fnac || "",
      edad: edad || "",
    };
  };

  /* ========= PDF ========= */

  const exportarPDFDesdeDatos = async (evento, jugadores) => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Marca de agua (logo)
    let logo = null;
    try {
      logo = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = "/logo-en-negativo.png"; // ajusta si aplica
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    } catch {
      logo = null;
    }

    const drawWatermark = (opacity = 0.1) => {
      if (!logo) return;
      const logoW = 350;
      const logoH = 350;

      if (typeof doc.GState === "function" && typeof doc.setGState === "function") {
        const gState = doc.GState({ opacity });
        doc.setGState(gState);
        doc.addImage(logo, "PNG", (pageW - logoW) / 2, (pageH - logoH) / 2, logoW, logoH);
        doc.setGState(doc.GState({ opacity: 1 }));
        return;
      }

      doc.addImage(logo, "PNG", (pageW - logoW) / 2, (pageH - logoH) / 2, logoW, logoH);
    };

    drawWatermark(0.12);

    const titulo = "Listado de Convocados";
    const subtitulo = `${nombreEvento(evento)} — ${fechaEvento(evento)}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text(titulo, pageW / 2, 60, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(80, 80, 80);
    doc.text(subtitulo, pageW / 2, 82, { align: "center" });

    autoTable(doc, {
      head: [["RUT", "Nombre", "Fecha nacimiento", "Edad"]],
      body: ordenarConvocados(jugadores).map((c) => {
        const info = resolverDatosJugador(c);
        return [
          info.rut ? formatRutWithDV(info.rut) : "",
          info.nombre,
          info.fnac ? String(info.fnac).slice(0, 10) : "",
          info.edad || "",
        ];
      }),
      startY: 105,
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        halign: "center",
        fillColor: FUCHSIA,
        textColor: [255, 255, 255],
        fontSize: 10,
      },
      columnStyles: {
        0: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "center" },
      },
      didDrawPage: (data) => {
        drawWatermark(0.08);

        const y = pageH - 24;
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`Creado por WELI • APP Oficial • Página ${data.pageNumber}`, pageW / 2, y, {
          align: "center",
        });
      },
    });

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /* ========= Acciones ========= */

  const fetchConvocadosHistorico = useCallback(
    async ({ evento_id, convocatoria_id }) => {
      const headers = buildHeaders(rolActual);

      const res = await getWithFallback(
        `/convocatorias/evento/${Number(evento_id)}/convocatoria/${Number(convocatoria_id)}`,
        { headers }
      );

      return toArray(res);
    },
    [rolActual]
  );

  const verPDFDeHistorico = async (h) => {
    if (generatingRef.current) return;
    generatingRef.current = true;

    try {
      const evento_id = Number(h.evento_id);
      const convocatoria_id = Number(h.convocatoria_id);

      if (!evento_id || !convocatoria_id) {
        alert("Histórico sin evento_id o convocatoria_id válido.");
        return;
      }

      const evento = getEventoById(evento_id) || { id: evento_id };

      const lista = await fetchConvocadosHistorico({ evento_id, convocatoria_id });

      const listaActivos = filtrarSoloActivos(lista);
      if (!Array.isArray(listaActivos) || listaActivos.length === 0) {
        alert("No hay jugadores activos en esta convocatoria histórica.");
        return;
      }

      await exportarPDFDesdeDatos(evento, listaActivos);
    } catch (err) {
      const st = getStatus(err);
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      alert("No se pudo obtener el listado para exportar.");
    } finally {
      generatingRef.current = false;
    }
  };

  const verConvocadosDeHistorico = async (h) => {
    try {
      const evento_id = Number(h.evento_id);
      const convocatoria_id = Number(h.convocatoria_id);

      if (!evento_id || !convocatoria_id) {
        alert("Histórico sin evento_id o convocatoria_id válido.");
        return;
      }

      const evento = getEventoById(evento_id) || { id: evento_id };

      const lista = await fetchConvocadosHistorico({ evento_id, convocatoria_id });
      const listaActivos = filtrarSoloActivos(lista);

      setModal({ open: true, evento, jugadores: listaActivos });
    } catch (e) {
      const st = getStatus(e);
      if (st === 401 || st === 403) {
        clearToken();
        navigate("/login", { replace: true });
        return;
      }
      alert("No fue posible cargar los convocados.");
    }
  };

  /* ========= Render ========= */

  if (isLoading) return <IsLoading />;

  return (
    <div className={`${fondoClase} px-2 sm:px-4 pt-4 pb-16 font-weli`}>
      {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

      <h2 className="text-2xl font-bold mb-6 text-center">Histórico de Convocatorias</h2>

      <div className={tarjetaClase}>
        <div className="w-full overflow-x-auto">
          {historicos.length === 0 ? (
            <p className="text-center text-gray-400 py-4">No hay convocatorias históricas registradas.</p>
          ) : (
            <table className="w-full text-xs sm:text-sm table-fixed sm:table-auto">
              <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                <tr>
                  <th className="p-2 border text-center w-12">ID</th>
                  <th className="p-2 border text-center w-56">Nombre evento</th>
                  <th className="p-2 border text-center w-20">Convocatoria</th>
                  <th className="p-2 border text-center w-44">Fecha generación</th>
                  <th className="p-2 border text-center w-20">Listado</th>
                  <th className="p-2 border text-center w-28">Convocados</th>
                </tr>
              </thead>

              <tbody>
                {historicos.map((h) => {
                  const evento = getEventoById(h.evento_id);
                  return (
                    <tr key={h.id} className={filaHover}>
                      <td className="p-2 border text-center">{h.id}</td>
                      <td className="p-2 border text-center break-words">
                        {evento ? nombreEvento(evento) : "—"}
                      </td>
                      <td className="p-2 border text-center">#{h.convocatoria_id}</td>
                      <td className="p-2 border text-center">
                        {String(h.fecha_generacion ?? "").replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => verPDFDeHistorico(h)}
                          className={`hover:opacity-80 ${generatingRef.current ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          title="Exportar listado (PDF)"
                          aria-label={`Exportar listado histórico ${h.id}`}
                          disabled={generatingRef.current}
                        >
                          <FileText size={20} color="#D32F2F" />
                        </button>
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => verConvocadosDeHistorico(h)}
                          className="px-3 py-1 rounded bg-[#e82d89] text-white hover:brightness-95"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal convocados */}
      {modal.open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div
            className={`${darkMode ? "bg-[#1f2937] text-white" : "bg-white text-[#1d0b0b]"
              } w-[95%] max-w-3xl rounded-lg p-6 shadow-lg`}
          >
            <div className="flex justify-between items-center mb-4 gap-3">
              <h3 className="text-lg font-bold">
                Convocados (solo activos) — {modal.evento ? nombreEvento(modal.evento) : "Evento"}
                {modal.evento && ` (${fechaEvento(modal.evento)})`}
              </h3>

              <button
                onClick={() => setModal({ open: false, evento: null, jugadores: [] })}
                className="p-2 rounded hover:bg-black/10 dark:hover:bg-white/10"
                title="Cerrar"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {modal.jugadores.length === 0 ? (
              <p className="text-center opacity-70">No hay jugadores activos en esta convocatoria.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-[11px] sm:text-[12px]">
                  <thead className={tablaCabecera}>
                    <tr>
                      <th className="px-2 py-1 border text-center">RUT</th>
                      <th className="px-2 py-1 border text-center">Nombre</th>
                      <th className="px-2 py-1 border text-center">Fecha nacimiento</th>
                      <th className="px-2 py-1 border text-center">Edad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenarConvocados(modal.jugadores).map((c) => {
                      const info = resolverDatosJugador(c);
                      const keyBase = normalizeRutKey(c?.jugador_rut ?? c?.rut ?? c?.rut_jugador);
                      return (
                        <tr key={c.id ?? `${keyBase}-${info.fnac || ""}`} className={filaHover}>
                          <td className="px-2 py-1 border text-center">
                            {info.rut ? formatRutWithDV(info.rut) : ""}
                          </td>
                          <td className="px-2 py-1 border text-center">{info.nombre}</td>
                          <td className="px-2 py-1 border text-center">
                            {info.fnac ? String(info.fnac).slice(0, 10) : ""}
                          </td>
                          <td className="px-2 py-1 border text-center">{info.edad !== "" ? info.edad : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
