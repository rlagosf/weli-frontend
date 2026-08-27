// src/pages/admin/crearConvocatorias.jsx

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { jwtDecode } from "jwt-decode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken } from "../../services/api";

/* =========================================================
   Configuración visual
========================================================= */

const PALETTE = {
  fucsia: "#aa5013",
  marron: "#6d5829",
  gold: "#b79f69",
  cream: "#e8dac4",
  sand: "#ffdda1",
  caramel: "#dda272",
  terracotta: "#e2773b",
};

const ACCENT = PALETTE.fucsia;

const PANEL_ROLES = new Set([1, 2, 3]);
const PANEL_TYPES = new Set(["admin", "user", "staff", "superadmin"]);

/* =========================================================
   Helpers generales
========================================================= */

const toArray = (response) => {
  const data = response?.data ?? response ?? [];

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (data?.ok && Array.isArray(data?.data)) return data.data;

  return [];
};

const jugadorKey = (jugador, index) =>
  String(jugador?.rut_jugador ?? jugador?.rut ?? jugador?.rutJugador ?? jugador?.id ?? `tmp-${index}`);

const dateOnly = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/* =========================================================
   PDF
========================================================= */

const hexToRgb = (hex) => {
  const clean = String(hex || "")
    .replace("#", "")
    .trim();

  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];

  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
};

/* =========================================================
   UUID documental
========================================================= */

const generarUuidDocumento = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  }

  /*
   * Fallback exclusivamente documental.
   * No se utiliza para secretos ni material criptográfico.
   */
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

/* =========================================================
   JWT / Auth
========================================================= */

const decodeToken = (token) => {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

const isExpired = (decoded) => {
  const exp = Number(decoded?.exp ?? 0);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(exp) || exp <= 0) return true;

  return now >= exp;
};

const extractType = (decoded) =>
  String(decoded?.type ?? decoded?.user?.type ?? "")
    .trim()
    .toLowerCase();

const extractRol = (decoded) => {
  const rol = Number(decoded?.rol_id ?? decoded?.user?.rol_id ?? 0);

  return Number.isInteger(rol) && PANEL_ROLES.has(rol) ? rol : 0;
};

/**
 * Admin y Staff obtienen su academia exclusivamente
 * desde el JWT firmado.
 */
const extractTokenAcademiaId = (decoded) => {
  const academiaId = Number(decoded?.academia_id ?? decoded?.user?.academia_id ?? 0);

  return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
};

/**
 * Esta función se utiliza EXCLUSIVAMENTE para Superadmin.
 *
 * Admin y Staff jamás deben utilizar weli_selected_academia
 * como fuente de tenant.
 */
const getSelectedAcademiaIdForSuperadmin = () => {
  try {
    const raw = localStorage.getItem(ACADEMIA_STORAGE_KEY);

    if (!raw) return 0;

    const direct = Number(raw);

    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);
    const academiaId = Number(parsed?.id ?? parsed?.academia_id ?? 0);

    return Number.isInteger(academiaId) && academiaId > 0 ? academiaId : 0;
  } catch {
    return 0;
  }
};

/**
 * Valida sesión, rol y tenant.
 *
 * Retorna además academiaId efectivo para evitar que los
 * componentes vuelvan a consultar localStorage por su cuenta.
 */
const ensureScopeOrRedirect = (navigate) => {
  const token = getToken() || "";

  if (!token) {
    clearToken();
    navigate("/login", { replace: true });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }

  try {
    const decoded = decodeToken(token);

    if (!decoded || isExpired(decoded)) {
      clearToken();
      navigate("/login", { replace: true });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    const type = extractType(decoded);
    const rol = extractRol(decoded);

    if (!PANEL_TYPES.has(type) || !rol) {
      clearToken();
      navigate("/login", { replace: true });

      return {
        ok: false,
        rol: 0,
        academiaId: 0,
      };
    }

    /*
     * ADMIN / STAFF
     *
     * Academia exclusivamente desde JWT.
     */
    if (rol === 1 || rol === 2) {
      const academiaId = extractTokenAcademiaId(decoded);

      if (!academiaId) {
        clearToken();
        navigate("/login", { replace: true });

        return {
          ok: false,
          rol,
          academiaId: 0,
        };
      }

      return {
        ok: true,
        rol,
        academiaId,
      };
    }

    /*
     * SUPERADMIN
     *
     * Academia objetivo desde selector WELI.
     */
    const academiaId = getSelectedAcademiaIdForSuperadmin();

    if (!academiaId) {
      navigate("/super-dashboard", { replace: true });

      return {
        ok: false,
        rol,
        academiaId: 0,
      };
    }

    return {
      ok: true,
      rol,
      academiaId,
    };
  } catch {
    clearToken();
    navigate("/login", { replace: true });

    return {
      ok: false,
      rol: 0,
      academiaId: 0,
    };
  }
};

/* =========================================================
   GET con fallback
========================================================= */

const getList = async (basePath, signal) => {
  const urls = basePath.endsWith("/") ? [basePath, basePath.slice(0, -1)] : [basePath, `${basePath}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await api.get(url, {
        signal,
        meta: { isPublic: false },
      });

      return toArray(response);
    } catch (error) {
      lastError = error;

      if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") {
        return [];
      }

      const status = error?.response?.status ?? error?.status;

      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  if (import.meta.env.DEV && lastError) {
    console.warn(`[WELI GET] No se pudo cargar ${basePath}`);
  }

  return [];
};

/* =========================================================
   POST con fallback
========================================================= */

const postWithFallback = async (path, body) => {
  const urls = path.endsWith("/") ? [path, path.slice(0, -1)] : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        meta: { isPublic: false },
      });
    } catch (error) {
      lastError = error;

      const status = error?.response?.status ?? error?.status;

      /*
       * Nunca hacemos fallback ante errores
       * de autenticación/autorización.
       */
      if (status === 401 || status === 403) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("POST failed");
};

/* =========================================================
   Componente
========================================================= */

export default function CrearConvocatorias() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  useMobileAutoScrollTop();

  const [jugadoresRaw, setJugadoresRaw] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [eventos, setEventos] = useState([]);

  const [convocatorias, setConvocatorias] = useState({});

  const [error, setError] = useState("");

  const [mostrarModal, setMostrarModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [generandoListado, setGenerandoListado] = useState(false);
  const [guardandoConvocatoria, setGuardandoConvocatoria] = useState(false);

  const [convocatoriaInfo, setConvocatoriaInfo] = useState(null);
  const [rolActual, setRolActual] = useState(0);

  /*
   * Nombre utilizado exclusivamente para presentación/PDF.
   * No participa en autorización ni tenant scope.
   */
  const [nombreAcademia, setNombreAcademia] = useState("");

  /* =======================================================
     Auth inicial
  ======================================================= */

  useEffect(() => {
    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) return;

    setRolActual(guard.rol);
  }, [navigate]);

  /* =======================================================
     Cargar datos
  ======================================================= */

  useEffect(() => {
    if (!rolActual) return;

    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) {
      setIsLoading(false);
      return;
    }

    /*
     * IMPORTANTÍSIMO:
     *
     * Admin/Staff:
     * guard.academiaId proviene del JWT.
     *
     * Superadmin:
     * guard.academiaId proviene del selector.
     */
    const academiaIdActual = guard.academiaId;

    const abortController = new AbortController();

    const cargarDatos = async () => {
      setIsLoading(true);
      setError("");

      try {
        const [jugadoresData, eventosData, categoriasData, academiaResponse] = await Promise.all([
          getList("/jugadores", abortController.signal),
          getList("/eventos", abortController.signal),
          getList("/categorias", abortController.signal),

          /*
           * El backend verifica que :id corresponda
           * a la academia efectiva del usuario.
           *
           * Esta petición solo se utiliza para obtener
           * el nombre visible de la academia.
           */
          api.get(`/academias/${academiaIdActual}`, {
            signal: abortController.signal,
            meta: { isPublic: false },
          }),
        ]);

        const initialConvocatorias = {};

        jugadoresData.forEach((jugador, index) => {
          initialConvocatorias[jugadorKey(jugador, index)] = {
            fecha_partido: "",
            evento_id: "",
            asistio: false,
            titular: false,
            observaciones: "",
          };
        });

        setJugadoresRaw(jugadoresData);
        setEventos(eventosData);
        setCategorias(categoriasData);

        const nombreAcademiaActual = String(academiaResponse?.data?.item?.nombre ?? "").trim();

        setNombreAcademia(nombreAcademiaActual);
        setConvocatorias(initialConvocatorias);
      } catch (requestError) {
        if (abortController.signal.aborted) return;

        const status = requestError?.response?.status ?? requestError?.status;

        if (status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }

        if (status === 403) {
          setError("No tienes permisos para acceder a Convocatorias.");
          return;
        }

        setError("❌ Error al cargar datos.");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    cargarDatos();

    return () => abortController.abort();
  }, [navigate, rolActual]);

  /* =======================================================
     Categorías
  ======================================================= */

  const catMap = useMemo(
    () => new Map(categorias.map((categoria) => [Number(categoria.id), categoria.nombre])),
    [categorias]
  );

  /* =======================================================
     Jugadores normalizados
  ======================================================= */

  const jugadores = useMemo(
    () =>
      jugadoresRaw.map((jugador, index) => {
        const key = jugadorKey(jugador, index);

        const categoriaNombre =
          jugador?.categoria?.nombre ?? catMap.get(Number(jugador?.categoria_id)) ?? "Sin categoría";

        const nombre =
          jugador?.nombre_jugador ??
          jugador?.nombre_completo ??
          (jugador?.nombres && jugador?.apellidos ? `${jugador.nombres} ${jugador.apellidos}` : jugador?.nombre) ??
          "—";

        return {
          _key: key,

          rut_jugador: Number(jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? 0),

          nombre_jugador: nombre,
          categoriaNombre,
        };
      }),
    [jugadoresRaw, catMap]
  );

  /* =======================================================
     Eventos futuros
  ======================================================= */

  const today = useMemo(() => dateOnly(new Date()), []);

  const eventosFuturos = useMemo(
    () =>
      eventos.filter((evento) => {
        const date = dateOnly(evento?.fecha_inicio ?? evento?.fecha);

        return date && today && date >= today;
      }),
    [eventos, today]
  );

  const fechasDisponibles = useMemo(
    () =>
      Array.from(
        new Set(eventosFuturos.map((evento) => String(evento?.fecha_inicio ?? evento?.fecha).slice(0, 10)))
      ).sort(),
    [eventosFuturos]
  );

  /* =======================================================
     Fecha
  ======================================================= */

  const handleFechaChange = useCallback(
    (key, fecha) => {
      const evento = eventosFuturos.find((item) => String(item?.fecha_inicio ?? item?.fecha).slice(0, 10) === fecha);

      setConvocatorias((previous) => ({
        ...previous,

        [key]: {
          ...previous[key],
          fecha_partido: fecha,
          evento_id: evento ? String(evento.id) : previous[key]?.evento_id,
        },
      }));
    },
    [eventosFuturos]
  );

  /* =======================================================
     Evento
  ======================================================= */

  const handleEventoChange = useCallback(
    (key, eventoId) => {
      const evento = eventosFuturos.find((item) => Number(item.id) === Number(eventoId));

      setConvocatorias((previous) => ({
        ...previous,

        [key]: {
          ...previous[key],

          evento_id: eventoId,

          fecha_partido: evento
            ? String(evento.fecha_inicio ?? evento.fecha).slice(0, 10)
            : previous[key]?.fecha_partido,
        },
      }));
    },
    [eventosFuturos]
  );

  /* =======================================================
     Convocado
  ======================================================= */

  const handleAsistencia = useCallback((key, checked) => {
    setConvocatorias((previous) => ({
      ...previous,

      [key]: {
        ...previous[key],
        asistio: checked,

        /*
         * Un jugador no convocado tampoco
         * puede permanecer como titular.
         */
        titular: checked ? !!previous[key]?.titular : false,
      },
    }));
  }, []);

  /* =======================================================
     Titular
  ======================================================= */

  const handleTitular = useCallback((key, checked) => {
    setConvocatorias((previous) => ({
      ...previous,

      [key]: {
        ...previous[key],

        /*
         * Todo titular debe estar convocado.
         */
        asistio: checked ? true : !!previous[key]?.asistio,

        titular: checked,
      },
    }));
  }, []);

  /* =======================================================
     Observaciones
  ======================================================= */

  const handleObservaciones = useCallback((key, text) => {
    setConvocatorias((previous) => ({
      ...previous,

      [key]: {
        ...previous[key],
        observaciones: text,
      },
    }));
  }, []);

  /* =======================================================
     Guardar convocatoria
  ======================================================= */

  const guardarConvocatorias = useCallback(async () => {
    if (guardandoConvocatoria) return;

    setError("");

    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) return;

    try {
      setGuardandoConvocatoria(true);

      const datosEnviar = jugadores
        .map((jugador) => {
          const datos = convocatorias[jugador._key];

          if (!datos?.fecha_partido || !datos?.evento_id) {
            return null;
          }

          return {
            jugador_rut: jugador.rut_jugador,

            fecha_partido: datos.fecha_partido,

            evento_id: Number(datos.evento_id),

            asistio: !!datos.asistio,

            titular: !!datos.titular,

            observaciones: datos.observaciones || null,
          };
        })
        .filter(Boolean);

      if (!datosEnviar.length) {
        setError("⚠️ Debe seleccionar al menos un evento.");
        return;
      }

      if (!datosEnviar.some((item) => item.asistio)) {
        setError("⚠️ Marque al menos un jugador como convocado.");
        return;
      }

      /*
       * Una convocatoria corresponde
       * exclusivamente a un evento.
       */
      const eventosSeleccionados = Array.from(new Set(datosEnviar.map((item) => Number(item.evento_id))));

      if (eventosSeleccionados.length !== 1) {
        setError("⚠️ Todos los jugadores de una convocatoria deben pertenecer al mismo evento.");
        return;
      }

      /*
       * academia_id NO se envía.
       *
       * El backend debe derivar la academia efectiva
       * desde authz/getEffectiveAcademiaId.
       */
      const response = await postWithFallback("/convocatorias", datosEnviar);

      const eventoIdBackend = response?.data?.evento_id ?? datosEnviar[0].evento_id;

      const convocatoriaIdBackend = response?.data?.convocatoria_id;

      if (!convocatoriaIdBackend) {
        throw new Error("Backend no retornó convocatoria_id");
      }

      setConvocatoriaInfo({
        evento_id: Number(eventoIdBackend),

        convocatoria_id: Number(convocatoriaIdBackend),
      });

      setMostrarModal(true);
    } catch (requestError) {
      const status = requestError?.response?.status ?? requestError?.status;

      if (status === 401) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (status === 403) {
        setError("No tienes permisos para guardar convocatorias.");

        return;
      }

      const detail =
        requestError?.response?.data?.message ?? requestError?.response?.data?.error ?? requestError?.message;

      if (import.meta.env.DEV) {
        console.error("[WELI CONVOCATORIA]", requestError);
      }

      setError(detail ? `❌ Error al guardar convocatorias: ${detail}` : "❌ Error al guardar convocatorias");
    } finally {
      setGuardandoConvocatoria(false);
    }
  }, [jugadores, convocatorias, navigate, guardandoConvocatoria]);

  /* =======================================================
     Generar PDF + histórico
  ======================================================= */

  const generarListado = useCallback(async () => {
    if (generandoListado) return;

    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) return;

    try {
      setGenerandoListado(true);

      if (!convocatoriaInfo) {
        alert("❌ No hay información de convocatoria base. Guarde primero.");

        return;
      }

      /*
       * Nombre obtenido previamente mediante
       * GET /academias/:id.
       *
       * No interviene en autorización.
       */
      const nombreAcademiaPdf = nombreAcademia || "Academia";

      const convocados = jugadores
        .map((jugador) => {
          const datos = convocatorias[jugador._key];

          if (!datos?.asistio || !datos?.evento_id) {
            return null;
          }

          return {
            ...datos,

            nombre: jugador.nombre_jugador,

            categoria: jugador.categoriaNombre,

            jugador_rut: jugador.rut_jugador,
          };
        })
        .filter(Boolean);

      if (!convocados.length) {
        alert("⚠️ No hay jugadores convocados.");

        return;
      }

      const eventoSeleccionado = eventos.find((evento) => Number(evento?.id) === Number(convocatoriaInfo.evento_id));

      const nombreEvento =
        eventoSeleccionado?.titulo ?? eventoSeleccionado?.nombre ?? `Evento #${convocatoriaInfo.evento_id}`;

      const fechaEvento =
        convocados?.[0]?.fecha_partido ?? eventoSeleccionado?.fecha_inicio ?? eventoSeleccionado?.fecha ?? "";

      /* ─────────────────────────────────────────────
         Identidad documental
      ───────────────────────────────────────────── */

      const documentoUuid = generarUuidDocumento();

      const fechaGeneracion = new Date().toISOString();

      const marcaDocumento = `WELI-DOC:${documentoUuid}|${fechaGeneracion}`;

      /* ─────────────────────────────────────────────
         Colores
      ───────────────────────────────────────────── */

      const COLOR_MARRON = hexToRgb(PALETTE.marron);

      const COLOR_FUCSIA = hexToRgb(PALETTE.fucsia);

      const COLOR_GOLD = hexToRgb(PALETTE.gold);

      const COLOR_CREAM = hexToRgb(PALETTE.cream);

      const COLOR_SAND = hexToRgb(PALETTE.sand);

      const COLOR_CARAMEL = hexToRgb(PALETTE.caramel);

      const COLOR_TERRACOTTA = hexToRgb(PALETTE.terracotta);

      /* ─────────────────────────────────────────────
         Documento
      ───────────────────────────────────────────── */

      const doc = new jsPDF({
        unit: "mm",
        format: [330, 216],
        orientation: "landscape",
        compress: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setProperties({
        title: `Convocatoria ${convocatoriaInfo.convocatoria_id}`,

        subject: `WELI-${documentoUuid}`,

        author: nombreAcademiaPdf,

        creator: "WELI",

        keywords: `convocatoria,${documentoUuid},${fechaGeneracion}`,
      });

      /* ─────────────────────────────────────────────
         Cabecera
      ───────────────────────────────────────────── */

      doc.setDrawColor(...COLOR_FUCSIA);
      doc.setLineWidth(1.5);

      doc.line(14, 11, pageWidth - 14, 11);

      doc.setFont("times", "bold");

      doc.setFontSize(20);

      doc.setTextColor(...COLOR_MARRON);

      doc.text(nombreAcademiaPdf.toUpperCase(), pageWidth / 2, 22, {
        align: "center",
      });

      doc.setDrawColor(...COLOR_GOLD);

      doc.setLineWidth(0.6);

      doc.line(pageWidth / 2 - 55, 27, pageWidth / 2 + 55, 27);

      doc.setFont("times", "bold");

      doc.setFontSize(16);

      doc.setTextColor(...COLOR_FUCSIA);

      doc.text("LISTADO DE CONVOCADOS", pageWidth / 2, 36, {
        align: "center",
      });

      /* ─────────────────────────────────────────────
         Información
      ───────────────────────────────────────────── */

      doc.setFontSize(11);
      doc.setTextColor(...COLOR_MARRON);

      let infoY = 47;

      doc.setFont("times", "bold");
      doc.text("Evento:", 18, infoY);

      doc.setFont("times", "normal");
      doc.text(String(nombreEvento), 39, infoY);

      infoY += 6;

      if (fechaEvento) {
        doc.setFont("times", "bold");

        doc.text("Fecha:", 18, infoY);

        doc.setFont("times", "normal");

        doc.text(String(fechaEvento).slice(0, 10), 39, infoY);

        infoY += 6;
      }

      doc.setFont("times", "bold");

      doc.text("Convocatoria:", 18, infoY);

      doc.setFont("times", "normal");

      doc.text(`N° ${convocatoriaInfo.convocatoria_id}`, 46, infoY);

      doc.setFont("times", "bold");

      doc.text("Total convocados:", pageWidth - 73, 47);

      doc.setFont("times", "normal");

      doc.text(String(convocados.length), pageWidth - 34, 47);

      /* ─────────────────────────────────────────────
         Identificación
      ───────────────────────────────────────────── */

      const documentInfoY = infoY + 8;

      doc.setFont("times", "normal");

      doc.setFontSize(7.5);

      doc.setTextColor(100, 100, 100);

      doc.text(`Documento: ${documentoUuid}`, 18, documentInfoY);

      doc.text(`Generado: ${fechaGeneracion}`, pageWidth - 18, documentInfoY, {
        align: "right",
      });

      /*
       * Marca técnica interna.
       */
      doc.setFontSize(1);

      doc.setTextColor(248, 248, 248);

      doc.text(marcaDocumento, 2, 2);

      /* ─────────────────────────────────────────────
         Tabla
      ───────────────────────────────────────────── */

      const startTableY = documentInfoY + 7;

      autoTable(doc, {
        startY: startTableY,

        head: [["Jugador", "Categoría", "Rol", "Observaciones"]],

        body: convocados.map((convocado) => [
          convocado.nombre,
          convocado.categoria,
          convocado.titular ? "Titular" : "Convocado",
          convocado.observaciones || "",
        ]),

        theme: "grid",

        styles: {
          font: "times",
          fontSize: 9.5,
          textColor: COLOR_MARRON,
          lineColor: COLOR_GOLD,
          lineWidth: 0.2,
          cellPadding: 3.2,
          valign: "middle",
        },

        headStyles: {
          font: "times",
          fontStyle: "bold",
          fontSize: 10,
          fillColor: COLOR_MARRON,
          textColor: [255, 255, 255],
          lineColor: COLOR_GOLD,
          lineWidth: 0.3,
          halign: "center",
        },

        bodyStyles: {
          fillColor: COLOR_CREAM,
        },

        alternateRowStyles: {
          fillColor: COLOR_SAND,
        },

        columnStyles: {
          0: {
            cellWidth: 78,
          },

          1: {
            cellWidth: 55,
            halign: "center",
          },

          2: {
            cellWidth: 38,
            halign: "center",
          },

          3: {
            cellWidth: "auto",
          },
        },

        margin: {
          left: 18,
          right: 18,
        },

        didDrawPage: () => {
          doc.setDrawColor(...COLOR_TERRACOTTA);

          doc.setLineWidth(0.35);

          doc.line(18, pageHeight - 10, pageWidth - 18, pageHeight - 10);
        },
      });

      /* ─────────────────────────────────────────────
         Firma
      ───────────────────────────────────────────── */

      const finalY = doc.lastAutoTable?.finalY ?? startTableY;

      let firmaY = finalY + 24;

      if (firmaY + 20 > pageHeight) {
        doc.addPage();

        firmaY = 45;

        doc.setFont("times", "bold");

        doc.setFontSize(13);

        doc.setTextColor(...COLOR_MARRON);

        doc.text(nombreAcademiaPdf.toUpperCase(), pageWidth / 2, 20, {
          align: "center",
        });

        doc.setDrawColor(...COLOR_GOLD);

        doc.setLineWidth(0.5);

        doc.line(pageWidth / 2 - 50, 25, pageWidth / 2 + 50, 25);
      }

      const firmaWidth = 70;

      const firmaInicioX = (pageWidth - firmaWidth) / 2;

      doc.setDrawColor(...COLOR_MARRON);

      doc.setLineWidth(0.45);

      doc.line(firmaInicioX, firmaY, firmaInicioX + firmaWidth, firmaY);

      doc.setFont("times", "normal");

      doc.setFontSize(9);

      doc.setTextColor(...COLOR_MARRON);

      doc.text("Firma del responsable", pageWidth / 2, firmaY + 6, {
        align: "center",
      });

      /* ─────────────────────────────────────────────
         Pie
      ───────────────────────────────────────────── */

      doc.setFont("times", "italic");

      doc.setFontSize(7);

      doc.setTextColor(...COLOR_CARAMEL);

      doc.text(`Documento generado mediante WELI · ${documentoUuid}`, pageWidth / 2, pageHeight - 5, {
        align: "center",
      });

      /* ─────────────────────────────────────────────
         PDF → Base64
      ───────────────────────────────────────────── */

      const dataUri = doc.output("datauristring");

      const commaIndex = dataUri.indexOf(",");

      if (commaIndex < 0) {
        throw new Error("No se pudo serializar el PDF.");
      }

      const base64 = dataUri.slice(commaIndex + 1);

      if (!base64 || base64.length < 100) {
        throw new Error("El PDF generado está vacío o incompleto.");
      }

      /*
       * No imprimimos contenido Base64.
       *
       * En desarrollo solo dejamos metadata
       * documental no sensible.
       */
      if (import.meta.env.DEV) {
        console.info("[WELI PDF]", {
          documento_uuid: documentoUuid,

          academia: nombreAcademiaPdf,

          fecha_generacion: fechaGeneracion,

          convocatoria_id: convocatoriaInfo.convocatoria_id,

          base64_length: base64.length,
        });
      }

      /* ─────────────────────────────────────────────
         Histórico
      ───────────────────────────────────────────── */

      /*
       * IMPORTANTE:
       *
       * academia_id NO se envía.
       *
       * El backend obtiene tenant mediante
       * getEffectiveAcademiaId(req).
       */
      await postWithFallback("/convocatorias-historico", {
        evento_id: Number(convocatoriaInfo.evento_id),

        convocatoria_id: Number(convocatoriaInfo.convocatoria_id),

        fecha_generacion: fechaGeneracion,

        listado_base64: base64,
      });

      /* ─────────────────────────────────────────────
         Descargar
      ───────────────────────────────────────────── */

      const nombreArchivo = `${documentoUuid}.pdf`;

      doc.save(nombreArchivo);

      /* ─────────────────────────────────────────────
         Reset
      ───────────────────────────────────────────── */

      const initialConvocatorias = {};

      jugadores.forEach((jugador, index) => {
        initialConvocatorias[jugadorKey(jugador, index)] = {
          fecha_partido: "",
          evento_id: "",
          asistio: false,
          titular: false,
          observaciones: "",
        };
      });

      setConvocatorias(initialConvocatorias);

      setConvocatoriaInfo(null);
      setMostrarModal(false);

      alert(
        `✅ Listado generado correctamente.\n\nDocumento: ${documentoUuid}\n\nEl PDF fue descargado y almacenado en el histórico.`
      );
    } catch (requestError) {
      const status = requestError?.response?.status ?? requestError?.status;

      if (status === 401) {
        clearToken();

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (status === 403) {
        alert("No tienes permisos para generar o guardar el histórico.");

        return;
      }

      const detail =
        requestError?.response?.data?.error ?? requestError?.response?.data?.message ?? requestError?.message ?? "";

      if (import.meta.env.DEV) {
        console.error("[WELI CONVOCATORIA PDF]", requestError);
      }

      alert(detail ? `❌ Error al generar el PDF: ${detail}` : "❌ Error al generar el PDF");
    } finally {
      setGenerandoListado(false);
    }
  }, [convocatoriaInfo, jugadores, convocatorias, eventos, nombreAcademia, navigate, generandoListado]);

  /* =======================================================
     UI
  ======================================================= */

  /*
   * Las clases ra-* se mantienen temporalmente.
   *
   * Son tokens visuales definidos en Tailwind/CSS.
   * Deben renombrarse coordinadamente cuando hagamos
   * la purga del tema visual.
   */
  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const fondoClase = `${shell} min-h-screen px-2 sm:px-4 pt-4 pb-16 font-sans overflow-x-hidden`;

  const tarjetaClase =
    "rounded-2xl p-4 border shadow-lg " +
    (darkMode ? "bg-white/10 border-white/15" : "bg-white/60 border-ra-marron/15");

  const tablaCabecera = "text-white " + (darkMode ? "bg-white/10" : "bg-ra-marron/80");

  const filaHover = darkMode ? "hover:bg-white/5" : "hover:bg-white/40";

  const inputClase =
    "w-full rounded-xl px-3 py-2 border outline-none transition " +
    (darkMode
      ? "bg-white/10 border-white/15 text-white placeholder-white/40 focus:border-white/30"
      : "bg-white/60 border-ra-marron/15 text-ra-marron placeholder-ra-marron/40 focus:border-ra-terracotta");

  const btnPrimary =
    "text-white px-8 py-2 rounded-xl shadow font-extrabold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed";

  const modalCard =
    "p-6 rounded-2xl shadow-2xl text-center border w-full max-w-md " +
    (darkMode ? "bg-[#1f2937] border-white/15 text-white" : "bg-white border-ra-marron/15 text-ra-marron");

  const msgError = darkMode ? "text-red-200" : "text-red-700";

  /* =======================================================
     Agrupar jugadores
  ======================================================= */

  const grupos = useMemo(() => {
    const map = new Map();

    jugadores.forEach((jugador) => {
      if (!map.has(jugador.categoriaNombre)) {
        map.set(jugador.categoriaNombre, []);
      }

      map.get(jugador.categoriaNombre).push(jugador);
    });

    return [...map.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "es", {
        sensitivity: "base",
      })
    );
  }, [jugadores]);

  /* =======================================================
     Loading
  ======================================================= */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =======================================================
     Render
  ======================================================= */

  return (
    <div className={fondoClase}>
      <h2 className="text-2xl font-extrabold mb-6 text-center tracking-wide">Registro de Convocatorias</h2>

      {error && (
        <p className={`${msgError} mb-4 font-bold text-center`} role="alert">
          {error}
        </p>
      )}

      <div className="space-y-6">
        {grupos.map(([categoria, lista]) => (
          <div key={categoria} className={tarjetaClase}>
            <h3 className="text-xl font-extrabold mb-3 text-center">Categoría {categoria}</h3>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs sm:text-sm table-fixed min-w-[1050px]">
                <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                  <tr>
                    <th className="p-2 border border-white/10 text-center w-40">Nombre Jugador</th>

                    <th className="p-2 border border-white/10 text-center w-36">Categoría</th>

                    <th className="p-2 border border-white/10 text-center w-36">Fecha Partido</th>

                    <th className="p-2 border border-white/10 text-center w-44">Evento</th>

                    <th className="p-2 border border-white/10 text-center w-20">Convocado</th>

                    <th className="p-2 border border-white/10 text-center w-20">Titular</th>

                    <th className="p-2 border border-white/10 text-center w-64">Observaciones</th>
                  </tr>
                </thead>

                <tbody>
                  {lista.map((jugador) => {
                    const row = convocatorias[jugador._key] || {
                      fecha_partido: "",
                      evento_id: "",
                      asistio: false,
                      titular: false,
                      observaciones: "",
                    };

                    return (
                      <tr key={jugador._key} className={filaHover}>
                        <td className="p-2 border border-white/10 text-center">{jugador.nombre_jugador}</td>

                        <td className="p-2 border border-white/10 text-center">{jugador.categoriaNombre}</td>

                        <td className="p-2 border border-white/10 text-center">
                          <select
                            className={inputClase}
                            value={row.fecha_partido}
                            onChange={(event) => handleFechaChange(jugador._key, event.target.value)}
                          >
                            <option value="">Seleccionar fecha</option>

                            {fechasDisponibles.map((fecha) => (
                              <option key={fecha} value={fecha}>
                                {fecha}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <select
                            className={inputClase}
                            value={row.evento_id}
                            onChange={(event) => handleEventoChange(jugador._key, event.target.value)}
                          >
                            <option value="">Seleccionar evento</option>

                            {eventosFuturos.map((evento) => (
                              <option key={evento.id} value={evento.id}>
                                {evento.titulo ?? evento.nombre ?? `Evento #${evento.id}`}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.asistio}
                            onChange={(event) => handleAsistencia(jugador._key, event.target.checked)}
                            className="h-5 w-5 accent-[#aa5013]"
                            aria-label={`Convocar a ${jugador.nombre_jugador}`}
                          />
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.titular}
                            disabled={!row.asistio}
                            onChange={(event) => handleTitular(jugador._key, event.target.checked)}
                            className="h-5 w-5 accent-[#aa5013] disabled:opacity-40"
                            aria-label={`Marcar titular a ${jugador.nombre_jugador}`}
                          />
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="text"
                            className={inputClase}
                            value={row.observaciones}
                            maxLength={500}
                            placeholder="Observaciones"
                            onChange={(event) => handleObservaciones(jugador._key, event.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-6">
        <button
          type="button"
          onClick={guardarConvocatorias}
          disabled={guardandoConvocatoria}
          className={btnPrimary}
          style={{
            backgroundColor: ACCENT,
          }}
        >
          {guardandoConvocatoria ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 flex justify-center items-center bg-black/60 z-50 px-3">
          <div className={modalCard}>
            <h2 className="text-xl font-extrabold mb-3">✅ Convocatoria creada</h2>

            <p className="text-sm opacity-80 mb-5">
              La convocatoria fue almacenada correctamente. Presione Aceptar para generar el listado PDF y almacenarlo
              en el histórico.
            </p>

            <button
              type="button"
              disabled={generandoListado}
              className="text-white px-6 py-2 rounded-xl font-extrabold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: ACCENT,
              }}
              onClick={generarListado}
            >
              {generandoListado ? "Generando..." : "Aceptar"}
            </button>

            <button
              type="button"
              disabled={generandoListado}
              className="mt-3 block mx-auto hover:opacity-90 underline disabled:opacity-40"
              onClick={() => setMostrarModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
