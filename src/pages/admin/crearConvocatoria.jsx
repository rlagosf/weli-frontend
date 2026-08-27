import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { jwtDecode } from "jwt-decode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import IsLoading from "../../components/isLoading";
import { useTheme } from "../../context/ThemeContext";
import { useMobileAutoScrollTop } from "../../hooks/useMobileScrollTop";
import api, { ACADEMIA_STORAGE_KEY, clearToken, getToken, } from "../../services/api";

/* =======================
   🎨 Conjunto X (WELI cobre)
======================= */

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

/* =======================================================
   Helpers
======================================================= */

const toArray = (resp) => {
  const data = resp?.data ?? resp ?? [];

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (data?.ok && Array.isArray(data.items)) {
    return data.items;
  }

  if (data?.ok && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
};

const jugadorKey = (jugador, index) =>
  String(
    jugador?.rut_jugador ??
      jugador?.rut ??
      jugador?.rutJugador ??
      jugador?.id ??
      `tmp-${index}`,
  );

const dateOnly = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/* =======================================================
   Helpers PDF / Academia
======================================================= */

/**
 * Convierte un color HEX (#rrggbb) a RGB
 * compatible con jsPDF / jspdf-autotable.
 */
const hexToRgb = (hex) => {
  const clean = String(hex || "")
    .replace("#", "")
    .trim();

  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [0, 0, 0];
  }

  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
};

/* =======================================================
   Generación UUID segura
======================================================= */

const generarUuidDocumento = () => {
  /*
   * Navegadores modernos.
   */
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  /*
   * Fallback por compatibilidad.
   */
  const bytes = new Uint8Array(16);

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);

    /*
     * UUID v4.
     */
    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  /*
   * Último fallback.
   *
   * No se usa para seguridad criptográfica;
   * únicamente garantiza variación documental.
   */
  return (
    `${Date.now()}-` +
    `${Math.random().toString(36).slice(2)}-` +
    `${Math.random().toString(36).slice(2)}`
  );
};

/* =======================================================
   Auth
======================================================= */

const isExpired = (decoded) => {
  const now = Math.floor(Date.now() / 1000);

  return !decoded?.exp || decoded.exp <= now;
};

const extractRol = (decoded) => {
  const rawRol = decoded?.rol_id ?? decoded?.role_id ?? decoded?.role;

  const parsed = Number(rawRol);

  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Lee academia seleccionada:
 *
 * "12"
 *
 * o:
 *
 * {
 *   id: 12
 * }
 */
const getAcademiaIdFromStorage = () => {
  const key = ACADEMIA_STORAGE_KEY || "weli_selected_academia";

  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return 0;
    }

    const direct = Number(raw);

    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const parsed = JSON.parse(raw);

    const id = Number(
      parsed?.id ??
        parsed?.academia_id ??
        parsed?.academy_id ??
        parsed?.academiaId ??
        0,
    );

    return Number.isFinite(id) && id > 0 ? id : 0;
  } catch {
    return 0;
  }
};

/**
 * Guard de seguridad.
 *
 * Roles:
 * 1 Admin
 * 2 Staff
 * 3 Superadmin
 */
const ensureScopeOrRedirect = (navigate) => {
  const token = getToken?.() || "";

  if (!token) {
    clearToken?.();

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
    };
  }

  try {
    const decoded = jwtDecode(token);

    if (isExpired(decoded)) {
      throw new Error("expired");
    }

    const rol = extractRol(decoded);

    if (![1, 2, 3].includes(rol)) {
      throw new Error("no-role");
    }

    const academiaId = getAcademiaIdFromStorage();

    /*
     * Superadmin requiere academia objetivo.
     */
    if (rol === 3) {
      if (academiaId <= 0) {
        navigate("/super-dashboard", {
          replace: true,
        });

        return {
          ok: false,
          rol,
        };
      }

      return {
        ok: true,
        rol,
      };
    }

    /*
     * Admin / Staff requieren scope.
     */
    if (academiaId <= 0) {
      clearToken?.();

      navigate("/login", {
        replace: true,
      });

      return {
        ok: false,
        rol,
      };
    }

    return {
      ok: true,
      rol,
    };
  } catch {
    clearToken?.();

    navigate("/login", {
      replace: true,
    });

    return {
      ok: false,
      rol: 0,
    };
  }
};

/* =======================================================
   GET con fallback
======================================================= */

const getList = async (basePath, signal) => {
  const urls = basePath.endsWith("/")
    ? [basePath, basePath.slice(0, -1)]
    : [basePath, `${basePath}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await api.get(url, {
        signal,

        meta: {
          isPublic: false,
        },
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

  if (lastError) {
    console.warn(`[GET FALLBACK] No se pudo cargar ${basePath}`, lastError);
  }

  return [];
};

/* =======================================================
   POST con fallback
======================================================= */

const postWithFallback = async (path, body) => {
  const urls = path.endsWith("/")
    ? [path, path.slice(0, -1)]
    : [path, `${path}/`];

  let lastError = null;

  for (const url of urls) {
    try {
      return await api.post(url, body, {
        meta: {
          isPublic: false,
        },
      });
    } catch (error) {
      lastError = error;

      const status = error?.response?.status ?? error?.status;

      /*
       * Seguridad:
       * auth / autorización no usa fallback.
       */
      if (status === 401 || status === 403) {
        throw error;
      }

      /*
       * Si no es 404/405 tampoco tendría
       * demasiado sentido probar la misma
       * ruta con slash, pero lo conservamos
       * por compatibilidad con tu API actual.
       */
    }
  }

  throw lastError ?? new Error("POST failed");
};

/* =======================================================
   Componente
======================================================= */

export default function CrearConvocatorias() {
  const { darkMode } = useTheme();

  const navigate = useNavigate();

  useMobileAutoScrollTop();

  /* =====================================================
     States
  ===================================================== */

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
   * Nombre visible de la academia para el PDF.
   *
   * No participa en autorización ni tenant scope.
   */
  const [nombreAcademia, setNombreAcademia] = useState("");

  /* =====================================================
     Auth
  ===================================================== */

  useEffect(() => {
    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) {
      return;
    }

    setRolActual(guard.rol);
  }, [navigate]);

  /* =====================================================
     Cargar jugadores, eventos, categorías y academia
  ===================================================== */

  useEffect(() => {
    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) {
      setIsLoading(false);

      return;
    }

    const abort = new AbortController();

    (async () => {
      setIsLoading(true);
      setError("");

      try {
        const academiaIdActual = getAcademiaIdFromStorage();

        const [jugadoresData, eventosData, categoriasData, academiaResponse] =
          await Promise.all([
            getList("/jugadores", abort.signal),

            getList("/eventos", abort.signal),

            getList("/categorias", abort.signal),

            api.get(`/academias/${academiaIdActual}`, {
              signal: abort.signal,

              meta: {
                isPublic: false,
              },
            }),
          ]);

        const init = {};

        jugadoresData.forEach((jugador, index) => {
          init[jugadorKey(jugador, index)] = {
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

        /*
         * El backend ya validó que el :id solicitado
         * corresponde a la academia efectiva del usuario.
         *
         * Este valor se utiliza solo para presentación.
         */
        const nombreAcademiaActual = String(
          academiaResponse?.data?.item?.nombre ?? "",
        ).trim();

        setNombreAcademia(nombreAcademiaActual);

        setConvocatorias(init);
      } catch (err) {
        const status = err?.response?.status ?? err?.status;

        if (status === 401) {
          clearToken?.();

          navigate("/login", {
            replace: true,
          });

          return;
        }

        if (status === 403) {
          setError("No tienes permisos para acceder a Convocatorias.");

          return;
        }

        if (!abort.signal.aborted) {
          setError("❌ Error al cargar datos");
        }
      } finally {
        if (!abort.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => abort.abort();
  }, [navigate, rolActual]);

  /* =====================================================
     Categorías
  ===================================================== */

  const catMap = useMemo(
    () =>
      new Map(
        categorias.map((categoria) => [Number(categoria.id), categoria.nombre]),
      ),
    [categorias],
  );

  /* =====================================================
     Jugadores normalizados
  ===================================================== */

  const jugadores = useMemo(() => {
    return jugadoresRaw.map((jugador, index) => {
      const key = jugadorKey(jugador, index);

      const categoriaNombre =
        jugador?.categoria?.nombre ??
        catMap.get(Number(jugador?.categoria_id)) ??
        "Sin categoría";

      const nombre =
        jugador?.nombre_jugador ??
        jugador?.nombre_completo ??
        (jugador?.nombres && jugador?.apellidos
          ? `${jugador.nombres} ${jugador.apellidos}`
          : jugador?.nombre) ??
        "—";

      return {
        _key: key,

        rut_jugador: Number(
          jugador?.rut_jugador ?? jugador?.rut ?? jugador?.id ?? 0,
        ),

        nombre_jugador: nombre,

        categoriaNombre,
      };
    });
  }, [jugadoresRaw, catMap]);

  /* =====================================================
     Eventos futuros
  ===================================================== */

  const today = useMemo(() => dateOnly(new Date()), []);

  const eventosFuturos = useMemo(() => {
    return eventos.filter((evento) => {
      const date = dateOnly(evento?.fecha_inicio ?? evento?.fecha);

      return date && today && date >= today;
    });
  }, [eventos, today]);

  const fechasDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          eventosFuturos.map((evento) =>
            String(evento?.fecha_inicio ?? evento?.fecha).slice(0, 10),
          ),
        ),
      ).sort(),
    [eventosFuturos],
  );

  /* =====================================================
     Handler fecha
  ===================================================== */

  const handleFechaChange = useCallback(
    (key, fecha) => {
      const evento = eventosFuturos.find(
        (item) =>
          String(item?.fecha_inicio ?? item?.fecha).slice(0, 10) === fecha,
      );

      setConvocatorias((prev) => ({
        ...prev,

        [key]: {
          ...prev[key],

          fecha_partido: fecha,

          evento_id: evento ? String(evento.id) : prev[key]?.evento_id,
        },
      }));
    },
    [eventosFuturos],
  );

  /* =====================================================
     Handler evento
  ===================================================== */

  const handleEventoChange = useCallback(
    (key, eventoId) => {
      const evento = eventosFuturos.find(
        (item) => Number(item.id) === Number(eventoId),
      );

      setConvocatorias((prev) => ({
        ...prev,

        [key]: {
          ...prev[key],

          evento_id: eventoId,

          fecha_partido: evento
            ? String(evento.fecha_inicio ?? evento.fecha).slice(0, 10)
            : prev[key]?.fecha_partido,
        },
      }));
    },
    [eventosFuturos],
  );

  /* =====================================================
     Handler convocado
  ===================================================== */

  const handleAsistencia = useCallback((key, checked) => {
    setConvocatorias((prev) => ({
      ...prev,

      [key]: {
        ...prev[key],

        asistio: checked,

        /*
         * Si deja de estar convocado,
         * tampoco puede ser titular.
         */
        titular: checked ? !!prev[key]?.titular : false,
      },
    }));
  }, []);

  /* =====================================================
     Handler titular
  ===================================================== */

  const handleTitular = useCallback((key, checked) => {
    setConvocatorias((prev) => ({
      ...prev,

      [key]: {
        ...prev[key],

        /*
         * Todo titular debe estar convocado.
         */
        asistio: checked ? true : !!prev[key]?.asistio,

        titular: checked,
      },
    }));
  }, []);

  /* =====================================================
     Observaciones
  ===================================================== */

  const handleObservaciones = useCallback((key, text) => {
    setConvocatorias((prev) => ({
      ...prev,

      [key]: {
        ...prev[key],

        observaciones: text,
      },
    }));
  }, []);

  /* =====================================================
     Guardar convocatoria
  ===================================================== */

  const guardarConvocatorias = useCallback(async () => {
    if (guardandoConvocatoria) {
      return;
    }

    setError("");

    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) {
      return;
    }

    try {
      setGuardandoConvocatoria(true);

      const datosEnviar = jugadores
        .map((jugador) => {
          const datos = convocatorias[jugador._key];

          /*
           * Sólo enviamos jugadores
           * para los que existe evento/fecha.
           */
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

      /*
       * Al menos un jugador convocado.
       */
      if (!datosEnviar.some((item) => item.asistio)) {
        setError("⚠️ Marque al menos un jugador como convocado.");

        return;
      }

      /*
       * Una convocatoria corresponde
       * a un único evento.
       */
      const eventosSeleccionados = Array.from(
        new Set(datosEnviar.map((item) => Number(item.evento_id))),
      );

      if (eventosSeleccionados.length !== 1) {
        setError(
          "⚠️ Todos los jugadores de una convocatoria deben pertenecer al mismo evento.",
        );

        return;
      }

      const response = await postWithFallback("/convocatorias", datosEnviar);

      const eventoIdBackend =
        response?.data?.evento_id ?? datosEnviar[0].evento_id;

      const convocatoriaIdBackend = response?.data?.convocatoria_id;

      if (!convocatoriaIdBackend) {
        throw new Error("Backend no retornó convocatoria_id");
      }

      setConvocatoriaInfo({
        evento_id: Number(eventoIdBackend),

        convocatoria_id: Number(convocatoriaIdBackend),
      });

      setMostrarModal(true);
    } catch (err) {
      const status = err?.response?.status ?? err?.status;

      if (status === 401) {
        clearToken?.();

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
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message;

      console.error("[CREAR CONVOCATORIA]", err);

      setError(
        detail
          ? `❌ Error al guardar convocatorias: ${detail}`
          : "❌ Error al guardar convocatorias",
      );
    } finally {
      setGuardandoConvocatoria(false);
    }
  }, [jugadores, convocatorias, navigate, guardandoConvocatoria]);

  /* =====================================================
     Generar PDF + Histórico
  ===================================================== */

  const generarListado = useCallback(async () => {
    if (generandoListado) {
      return;
    }

    const guard = ensureScopeOrRedirect(navigate);

    if (!guard.ok) {
      return;
    }

    try {
      setGenerandoListado(true);

      /* -----------------------------------------------
             Validar convocatoria base
          ----------------------------------------------- */

      if (!convocatoriaInfo) {
        alert("❌ No hay información de convocatoria base. Guarde primero.");

        return;
      }

      /* -----------------------------------------------
             Academia actual

             El nombre fue obtenido mediante
             GET /academias/:id, cuya validación de academia
             efectiva se realiza en el backend.

             Aquí se utiliza exclusivamente para presentación.
          ----------------------------------------------- */

      const nombreAcademiaPdf = nombreAcademia || "Academia";

      /* -----------------------------------------------
             Convocados
          ----------------------------------------------- */

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

      /* -----------------------------------------------
             Evento
          ----------------------------------------------- */

      const eventoSeleccionado = eventos.find(
        (evento) => Number(evento?.id) === Number(convocatoriaInfo.evento_id),
      );

      const nombreEvento =
        eventoSeleccionado?.titulo ??
        eventoSeleccionado?.nombre ??
        `Evento #${convocatoriaInfo.evento_id}`;

      const fechaEvento =
        convocados?.[0]?.fecha_partido ??
        eventoSeleccionado?.fecha_inicio ??
        eventoSeleccionado?.fecha ??
        "";

      /* =================================================
             IDENTIDAD ÚNICA DEL DOCUMENTO
          ================================================= */

      const documentoUuid = generarUuidDocumento();

      const fechaGeneracion = new Date().toISOString();

      const marcaDocumento = `WELI-DOC:${documentoUuid}|${fechaGeneracion}`;

      /* =================================================
             PALETA PDF
          ================================================= */

      const COLOR_MARRON = hexToRgb(PALETTE.marron);

      const COLOR_FUCSIA = hexToRgb(PALETTE.fucsia);

      const COLOR_GOLD = hexToRgb(PALETTE.gold);

      const COLOR_CREAM = hexToRgb(PALETTE.cream);

      const COLOR_SAND = hexToRgb(PALETTE.sand);

      const COLOR_CARAMEL = hexToRgb(PALETTE.caramel);

      const COLOR_TERRACOTTA = hexToRgb(PALETTE.terracotta);

      /* -----------------------------------------------
             Crear PDF
          ----------------------------------------------- */

      const doc = new jsPDF({
        unit: "mm",

        format: [330, 216],

        orientation: "landscape",

        compress: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      const pageHeight = doc.internal.pageSize.getHeight();

      /* -----------------------------------------------
             Metadatos únicos
          ----------------------------------------------- */

      doc.setProperties({
        title: `Convocatoria ${convocatoriaInfo.convocatoria_id}`,

        subject: `WELI-${documentoUuid}`,

        author: nombreAcademiaPdf,

        creator: "WELI",

        keywords: `convocatoria,${documentoUuid},${fechaGeneracion}`,
      });

      /* =================================================
             CABECERA INSTITUCIONAL
          ================================================= */

      doc.setDrawColor(...COLOR_FUCSIA);

      doc.setLineWidth(1.5);

      doc.line(14, 11, pageWidth - 14, 11);

      /* -----------------------------------------------
             Nombre academia centrado
          ----------------------------------------------- */

      doc.setFont("times", "bold");

      doc.setFontSize(20);

      doc.setTextColor(...COLOR_MARRON);

      doc.text(nombreAcademiaPdf.toUpperCase(), pageWidth / 2, 22, {
        align: "center",
      });

      /* -----------------------------------------------
             Separador dorado
          ----------------------------------------------- */

      doc.setDrawColor(...COLOR_GOLD);

      doc.setLineWidth(0.6);

      doc.line(pageWidth / 2 - 55, 27, pageWidth / 2 + 55, 27);

      /* -----------------------------------------------
             Título documento
          ----------------------------------------------- */

      doc.setFont("times", "bold");

      doc.setFontSize(16);

      doc.setTextColor(...COLOR_FUCSIA);

      doc.text("LISTADO DE CONVOCADOS", pageWidth / 2, 36, {
        align: "center",
      });

      /* =================================================
             INFORMACIÓN ADMINISTRATIVA
          ================================================= */

      doc.setFont("times", "normal");

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

      /* =================================================
             IDENTIFICACIÓN DOCUMENTAL
          ================================================= */

      const documentInfoY = infoY + 8;

      doc.setFont("times", "normal");

      doc.setFontSize(7.5);

      doc.setTextColor(100, 100, 100);

      doc.text(`Documento: ${documentoUuid}`, 18, documentInfoY);

      doc.text(`Generado: ${fechaGeneracion}`, pageWidth - 18, documentInfoY, {
        align: "right",
      });

      /* =================================================
             MARCA TÉCNICA INTERNA
          ================================================= */

      doc.setFontSize(1);

      doc.setTextColor(248, 248, 248);

      doc.text(marcaDocumento, 2, 2);

      /* =================================================
             TABLA
          ================================================= */

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

      /* =================================================
             FIRMA DEL RESPONSABLE
          ================================================= */

      let finalY = doc.lastAutoTable?.finalY ?? startTableY;

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

      /* =================================================
             PIE DOCUMENTAL
          ================================================= */

      doc.setFont("times", "italic");

      doc.setFontSize(7);

      doc.setTextColor(...COLOR_CARAMEL);

      doc.text(
        `Documento generado mediante WELI · ${documentoUuid}`,
        pageWidth / 2,
        pageHeight - 5,
        {
          align: "center",
        },
      );

      /* =================================================
             PDF -> Base64

             Se mantiene exactamente el flujo funcional:
             el PDF se serializa antes de enviarlo al backend.
          ================================================= */

      const dataUri = doc.output("datauristring");

      const commaIndex = dataUri.indexOf(",");

      if (commaIndex < 0) {
        throw new Error("No se pudo serializar el PDF.");
      }

      const base64 = dataUri.slice(commaIndex + 1);

      if (!base64 || base64.length < 100) {
        throw new Error("El PDF generado está vacío o incompleto.");
      }

      console.info("[WELI PDF]", {
        documento_uuid: documentoUuid,

        academia: nombreAcademiaPdf,

        fecha_generacion: fechaGeneracion,

        convocatoria_id: convocatoriaInfo.convocatoria_id,

        base64_length: base64.length,

        base64_preview: `${base64.slice(0, 40)}...`,
      });

      /* =================================================
             Guardar histórico

             academia_id NO viene del frontend.
             Se conserva el contrato actual del backend.
          ================================================= */

      await postWithFallback("/convocatorias-historico", {
        evento_id: Number(convocatoriaInfo.evento_id),

        convocatoria_id: Number(convocatoriaInfo.convocatoria_id),

        fecha_generacion: fechaGeneracion,

        listado_base64: base64,
      });

      /* =================================================
             Nombre físico del documento
          ================================================= */

      const nombreArchivo = `${documentoUuid}.pdf`;

      /* -----------------------------------------------
             Descargar PDF
          ----------------------------------------------- */

      doc.save(nombreArchivo);

      /* -----------------------------------------------
             Reset
          ----------------------------------------------- */

      const init = {};

      jugadores.forEach((jugador, index) => {
        init[jugadorKey(jugador, index)] = {
          fecha_partido: "",

          evento_id: "",

          asistio: false,

          titular: false,

          observaciones: "",
        };
      });

      setConvocatorias(init);

      setConvocatoriaInfo(null);

      setMostrarModal(false);

      alert(
        `✅ Listado generado correctamente.\n\nDocumento: ${documentoUuid}\n\nEl PDF fue descargado y almacenado en el histórico.`,
      );
    } catch (err) {
      const status = err?.response?.status ?? err?.status;

      if (status === 401) {
        clearToken?.();

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
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.message ??
        "";

      console.error("[CONVOCATORIA PDF]", err);

      alert(
        detail
          ? `❌ Error al generar el PDF: ${detail}`
          : "❌ Error al generar el PDF",
      );
    } finally {
      setGenerandoListado(false);
    }
  }, [
    convocatoriaInfo,
    jugadores,
    convocatorias,
    eventos,
    nombreAcademia,
    navigate,
    generandoListado,
  ]);

  /* =====================================================
     UI
  ===================================================== */

  const shell = darkMode
    ? "bg-[#111827] text-white"
    : "bg-gradient-to-br from-ra-cream via-ra-sand to-ra-caramel text-ra-marron";

  const fondoClase = `${shell} min-h-screen px-2 sm:px-4 pt-4 pb-16 font-sans overflow-x-hidden`;

  const tarjetaClase =
    "rounded-2xl p-4 border shadow-lg " +
    (darkMode
      ? "bg-white/10 border-white/15"
      : "bg-white/60 border-ra-marron/15");

  const tablaCabecera =
    "text-white " + (darkMode ? "bg-white/10" : "bg-ra-marron/80");

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
    (darkMode
      ? "bg-[#1f2937] border-white/15 text-white"
      : "bg-white border-ra-marron/15 text-ra-marron");

  const msgError = darkMode ? "text-red-200" : "text-red-700";

  /* =====================================================
     Agrupar por categoría
  ===================================================== */

  const grupos = useMemo(() => {
    const map = new Map();

    jugadores.forEach((jugador) => {
      if (!map.has(jugador.categoriaNombre)) {
        map.set(jugador.categoriaNombre, []);
      }

      map.get(jugador.categoriaNombre).push(jugador);
    });

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [jugadores]);

  /* =====================================================
     Loading
  ===================================================== */

  if (isLoading) {
    return <IsLoading />;
  }

  /* =====================================================
     Render
  ===================================================== */

  return (
    <div className={fondoClase}>
      <h2 className="text-2xl font-extrabold mb-6 text-center tracking-wide">
        Registro de Convocatorias
      </h2>

      {error && (
        <p className={`${msgError} mb-4 font-bold text-center`}>{error}</p>
      )}

      <div className="space-y-6">
        {grupos.map(([categoria, lista]) => (
          <div key={categoria} className={tarjetaClase}>
            <h3 className="text-xl font-extrabold mb-3 text-center">
              Categoría {categoria}
            </h3>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs sm:text-sm table-fixed min-w-[1050px]">
                <thead className={`${tablaCabecera} text-[10px] sm:text-xs`}>
                  <tr>
                    <th className="p-2 border border-white/10 text-center w-40">
                      Nombre Jugador
                    </th>

                    <th className="p-2 border border-white/10 text-center w-36">
                      Categoría
                    </th>

                    <th className="p-2 border border-white/10 text-center w-36">
                      Fecha Partido
                    </th>

                    <th className="p-2 border border-white/10 text-center w-44">
                      Evento
                    </th>

                    <th className="p-2 border border-white/10 text-center w-20">
                      Convocado
                    </th>

                    <th className="p-2 border border-white/10 text-center w-20">
                      Titular
                    </th>

                    <th className="p-2 border border-white/10 text-center w-64">
                      Observaciones
                    </th>
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
                        <td className="p-2 border border-white/10 text-center">
                          {jugador.nombre_jugador}
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          {jugador.categoriaNombre}
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <select
                            className={inputClase}
                            value={row.fecha_partido}
                            onChange={(event) =>
                              handleFechaChange(
                                jugador._key,
                                event.target.value,
                              )
                            }
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
                            onChange={(event) =>
                              handleEventoChange(
                                jugador._key,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Seleccionar evento</option>

                            {eventosFuturos.map((evento) => (
                              <option key={evento.id} value={evento.id}>
                                {evento.titulo ??
                                  evento.nombre ??
                                  `Evento #${evento.id}`}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.asistio}
                            onChange={(event) =>
                              handleAsistencia(
                                jugador._key,
                                event.target.checked,
                              )
                            }
                            className="h-5 w-5 accent-[#aa5013]"
                            aria-label={`Convocar a ${jugador.nombre_jugador}`}
                          />
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.titular}
                            disabled={!row.asistio}
                            onChange={(event) =>
                              handleTitular(jugador._key, event.target.checked)
                            }
                            className="h-5 w-5 accent-[#aa5013] disabled:opacity-40"
                            aria-label={`Marcar titular a ${jugador.nombre_jugador}`}
                          />
                        </td>

                        <td className="p-2 border border-white/10 text-center">
                          <input
                            type="text"
                            className={inputClase}
                            value={row.observaciones}
                            placeholder="Observaciones"
                            onChange={(event) =>
                              handleObservaciones(
                                jugador._key,
                                event.target.value,
                              )
                            }
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

      {/* Guardar */}

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

      {/* Modal */}

      {mostrarModal && (
        <div className="fixed inset-0 flex justify-center items-center bg-black/60 z-50 px-3">
          <div className={modalCard}>
            <h2 className="text-xl font-extrabold mb-3">
              ✅ Convocatoria creada
            </h2>

            <p className="text-sm opacity-80 mb-5">
              La convocatoria fue almacenada correctamente. Presione Aceptar
              para generar el listado PDF y almacenarlo en el histórico.
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
