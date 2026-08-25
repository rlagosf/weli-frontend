// src/services/jugadoresService.js
import api from "./api";

/* ─────────────────────────────────────────────
   Errores públicos
   - No exponen RUT
   - No exponen URL
   - No exponen params
───────────────────────────────────────────── */

const publicError = (
  status = 0,
  message = "Error de red o servidor"
) => {
  const error = new Error(message);
  error.status = Number(status) || 0;
  return error;
};

/* ─────────────────────────────────────────────
   GET seguro
───────────────────────────────────────────── */

const safeGet = async (path) => {
  try {
    const response = await api.get(path);
    return response?.data;
  } catch (err) {
    const status =
      err?.status ??
      err?.response?.status ??
      0;

    const message =
      err?.response?.data?.message ??
      err?.message ??
      "No se pudo completar la operación";

    throw publicError(status, message);
  }
};

/**
 * Intenta múltiples endpoints.
 *
 * - Si responde correctamente, retorna data.
 * - 404 → prueba siguiente variante.
 * - 401/403 → se relanzan inmediatamente.
 * - Otros errores → conserva último error.
 */
const tryGet = async (candidates = []) => {
  let lastStatus = 0;
  let lastMessage =
    "No se pudo obtener información";

  const paths = candidates.filter(Boolean);

  for (const path of paths) {
    try {
      const data = await safeGet(path);

      if (
        data !== undefined &&
        data !== null
      ) {
        return data;
      }
    } catch (error) {
      const status =
        Number(error?.status ?? 0);

      if (status === 404) {
        lastStatus = 404;
        lastMessage = "No encontrado";
        continue;
      }

      if (
        status === 401 ||
        status === 403
      ) {
        throw error;
      }

      lastStatus = status;
      lastMessage =
        error?.message ??
        lastMessage;
    }
  }

  throw publicError(
    lastStatus,
    lastMessage
  );
};

/* ─────────────────────────────────────────────
   Helpers de normalización
───────────────────────────────────────────── */

const unwrapOne = (raw) => {
  if (!raw) return null;

  if (
    raw?.item &&
    typeof raw.item === "object"
  ) {
    return raw.item;
  }

  const data =
    raw?.data ??
    raw;

  if (
    data?.item &&
    typeof data.item === "object"
  ) {
    return data.item;
  }

  if (
    Array.isArray(data?.items) &&
    data.items.length > 0
  ) {
    return data.items[0];
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    return data[0];
  }

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length > 0
  ) {
    return data;
  }

  return null;
};

const toNumberOrZero = (value) => {
  const number = Number(value ?? 0);

  return Number.isFinite(number)
    ? number
    : 0;
};

/**
 * Convierte valores numéricos enviados
 * por MySQL como string a Number.
 *
 * Mantiene strings que realmente no sean
 * valores numéricos.
 */
const numericObject = (object = {}) => {
  const result = {};

  for (
    const [key, value]
    of Object.entries(object)
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      result[key] = 0;
      continue;
    }

    const number = Number(value);

    result[key] =
      Number.isFinite(number)
        ? number
        : value;
  }

  return result;
};

/* ═════════════════════════════════════════════
   ESTADÍSTICAS BASE
   Comunes a TODOS los deportes
═════════════════════════════════════════════ */

/**
 * Representa exclusivamente stats_base.
 *
 * No contiene campos:
 * - fútbol
 * - básquetbol
 * - tenis
 * - vóleibol
 * - pádel
 * - tenis de mesa
 */
export const generarStatsBaseVacias = () => ({
  minutos_jugados: 0,
  partidos_jugados: 0,
  lesiones: 0,
  dias_baja: 0,
  sanciones_federativas: 0,
});

/* ═════════════════════════════════════════════
   CONVOCATORIAS
   Transversales a TODOS los deportes
═════════════════════════════════════════════ */

/**
 * Convocatorias NO pertenecen a fútbol.
 *
 * Son transversales:
 *
 * evento
 *   ↓
 * convocatoria
 *   ↓
 * jugador
 *   ↓
 * asistencia / ausencia / participación
 *
 * Se conservan nombres históricos del
 * proyecto por compatibilidad.
 */
const normalizarConteoConvocatorias = (
  raw
) => {
  const data =
    raw?.data ??
    raw ??
    {};

  return {
    /**
     * Nombre histórico.
     *
     * Si posteriormente el backend utiliza
     * "convocatorias_total", también se soporta.
     */
    torneos_convocados:
      toNumberOrZero(
        data?.torneos_convocados ??
          data?.convocatorias_total ??
          data?.total_convocatorias
      ),

    /**
     * Nombre histórico.
     *
     * Se mantiene para evitar romper
     * funcionalidades existentes.
     */
    titular_partidos:
      toNumberOrZero(
        data?.titular_partidos ??
          data?.titularidades ??
          data?.veces_titular
      ),

    /**
     * Nuevas métricas transversales.
     *
     * Si el backend todavía no las retorna,
     * simplemente quedan en 0.
     */
    convocatorias_asistidas:
      toNumberOrZero(
        data?.convocatorias_asistidas ??
          data?.asistencias ??
          data?.total_asistencias
      ),

    convocatorias_ausentes:
      toNumberOrZero(
        data?.convocatorias_ausentes ??
          data?.inasistencias ??
          data?.total_inasistencias
      ),
  };
};

/**
 * Obtiene información de convocatorias.
 *
 * Si el backend todavía no posee alguno
 * de estos endpoints, no rompe la aplicación.
 */
export const obtenerConteoConvocatorias =
  async (rut) => {
    const rutStr =
      String(rut ?? "").trim();

    if (!rutStr) {
      return normalizarConteoConvocatorias(
        {}
      );
    }

    const encodedRut =
      encodeURIComponent(rutStr);

    const candidates = [
      `/convocatorias/conteo/${encodedRut}`,

      `/convocatorias/conteo?jugador_rut=${encodedRut}`,

      `/convocatorias-historico/conteo/${encodedRut}`,

      `/convocatorias-historico/conteo?jugador_rut=${encodedRut}`,
    ];

    for (const path of candidates) {
      try {
        const data =
          await safeGet(path);

        return normalizarConteoConvocatorias(
          data
        );
      } catch (error) {
        const status =
          Number(
            error?.status ?? 0
          );

        /*
         * Seguridad:
         *
         * 401/403 no deben esconderse.
         */
        if (
          status === 401 ||
          status === 403
        ) {
          throw error;
        }

        /*
         * Endpoint inexistente:
         * probamos siguiente variante.
         */
        if (status === 404) {
          continue;
        }

        /*
         * Las convocatorias son información
         * complementaria.
         *
         * Un error 500 temporal no debería
         * derribar todo DetalleJugador.
         */
        return normalizarConteoConvocatorias(
          {}
        );
      }
    }

    return normalizarConteoConvocatorias(
      {}
    );
  };

/* ═════════════════════════════════════════════
   JUGADOR
═════════════════════════════════════════════ */

/**
 * Obtiene jugador mediante RUT.
 *
 * Retorna:
 * - jugador
 * - null si no existe
 *
 * Nunca expone PII dentro del error.
 */
export const obtenerJugador = async (
  rut
) => {
  const rutStr =
    String(rut ?? "").trim();

  if (!rutStr) {
    return null;
  }

  const encodedRut =
    encodeURIComponent(rutStr);

  /* ─────────────────────────
     1. Endpoints directos
  ───────────────────────── */

  try {
    const direct =
      await tryGet([
        `/jugadores/rut/${encodedRut}`,

        `/jugadores?rut=${encodedRut}`,

        `/jugadores?jugador_rut=${encodedRut}`,
      ]);

    /*
     * Puede venir:
     *
     * { ok:true, item:{} }
     *
     * o:
     *
     * jugador plano
     */
    const one =
      unwrapOne(direct);

    if (one) {
      const candidateRut =
        String(
          one?.rut_jugador ??
            one?.rut ??
            ""
        ).trim();

      /*
       * Algunos endpoints directos pueden
       * no retornar rut_jugador en cierto
       * DTO reducido.
       */
      if (
        !candidateRut ||
        candidateRut === rutStr
      ) {
        return one;
      }
    }

    /*
     * Compatibilidad si alguna variante
     * retorna array.
     */
    const list =
      Array.isArray(
        direct?.items
      )
        ? direct.items
        : Array.isArray(direct)
          ? direct
          : [];

    const hit =
      list.find(
        (jugador) =>
          String(
            jugador?.rut_jugador ??
              jugador?.rut ??
              ""
          ).trim() === rutStr
      );

    if (hit) {
      return hit;
    }
  } catch (error) {
    /*
     * 404 → fallback.
     *
     * 401,403,500,etc →
     * no escondemos el error.
     */
    if (
      error?.status &&
      error.status !== 404
    ) {
      throw error;
    }
  }

  /* ─────────────────────────
     2. Fallback
  ───────────────────────── */

  try {
    const todos =
      await safeGet(
        "/jugadores"
      );

    const list =
      Array.isArray(
        todos?.items
      )
        ? todos.items
        : Array.isArray(todos)
          ? todos
          : [];

    const jugador =
      list.find(
        (item) =>
          String(
            item?.rut_jugador ??
              item?.rut ??
              ""
          ).trim() === rutStr
      );

    return jugador ?? null;
  } catch (error) {
    throw error;
  }
};

/* ═════════════════════════════════════════════
   ESTADÍSTICAS JOINED
═════════════════════════════════════════════ */

/**
 * Espera preferentemente:
 *
 * {
 *   item: {
 *      base: {...},
 *      sport: {...}
 *   }
 * }
 *
 * o:
 *
 * {
 *   base: {...},
 *   sport: {...}
 * }
 *
 *
 * Resultado:
 *
 * {
 *   ...stats_base,
 *   ...stats_deporte
 * }
 */
export const normalizarEstadisticasJoined =
  (raw) => {
    const root =
      raw?.data ??
      raw ??
      {};

    const item =
      root?.item &&
      typeof root.item ===
        "object"
        ? root.item
        : root?.data?.item &&
            typeof root.data
              .item === "object"
          ? root.data.item
          : root;

    const base =
      item?.base &&
      typeof item.base ===
        "object"
        ? item.base
        : {};

    const sport =
      item?.sport &&
      typeof item.sport ===
        "object"
        ? item.sport
        : {};

    const isJoined =
      Object.keys(base).length >
        0 ||
      Object.keys(sport).length >
        0;

    /*
     * Compatibilidad:
     *
     * si el backend antiguo entrega
     * estadísticas planas, también
     * las aceptamos.
     */
    const merged =
      isJoined
        ? {
            ...base,
            ...sport,
          }
        : {
            ...(item || {}),
          };

    /*
     * stats_base usa "id",
     * stats deporte usa "stats_id".
     */
    if (
      merged.stats_id == null &&
      merged.id != null
    ) {
      merged.stats_id =
        merged.id;
    }

    return {
      /*
       * Siempre aseguramos stats_base.
       */
      ...generarStatsBaseVacias(),

      /*
       * Luego agregamos estadísticas
       * realmente provenientes del backend.
       */
      ...numericObject(merged),
    };
  };

/* ═════════════════════════════════════════════
   OBTENER ESTADÍSTICAS DEL JUGADOR
═════════════════════════════════════════════ */

/**
 * IMPORTANTE:
 *
 * Ahora trabaja principalmente con jugador_id,
 * NO con RUT.
 *
 * Porque:
 *
 * jugador
 *   ├── id
 *   └── deporte_id
 *
 * permiten resolver correctamente:
 *
 * stats_base
 * +
 * stats_<deporte>
 */
export const obtenerEstadisticasJugador =
  async ({
    jugadorId,
    deporteId,
  } = {}) => {
    const jid =
      Number(
        jugadorId ?? 0
      );

    const did =
      Number(
        deporteId ?? 0
      );

    /*
     * Jugador nuevo o no resuelto.
     *
     * No fabricamos fútbol.
     */
    if (
      !Number.isFinite(jid) ||
      jid <= 0
    ) {
      return generarStatsBaseVacias();
    }

    const encodedJugadorId =
      encodeURIComponent(
        String(jid)
      );

    const deporteQuery =
      Number.isFinite(did) &&
      did > 0
        ? `?deporte_id=${encodeURIComponent(
            String(did)
          )}`
        : "";

    try {
      const data =
        await tryGet([
          /*
           * Endpoint actual recomendado.
           */
          `/estadisticas/by-jugador/${encodedJugadorId}${deporteQuery}`,

          /*
           * Compatibilidad si backend no
           * necesita deporte_id explícito.
           */
          `/estadisticas/by-jugador/${encodedJugadorId}`,

          /*
           * Variantes históricas.
           */
          `/estadisticas/jugador/${encodedJugadorId}${deporteQuery}`,

          `/estadisticas/jugador/${encodedJugadorId}`,
        ]);

      return normalizarEstadisticasJoined(
        data
      );
    } catch (error) {
      /*
       * Jugador existe pero todavía
       * no tiene stats.
       *
       * Esto NO es error de UI.
       */
      if (error?.status === 404) {
        return generarStatsBaseVacias();
      }

      throw error;
    }
  };

/* ═════════════════════════════════════════════
   CONTEXTO ESTADÍSTICO COMPLETO
═════════════════════════════════════════════ */

/**
 * Centraliza:
 *
 * jugador
 *   │
 *   ├── stats_base
 *   │
 *   ├── stats_<deporte>
 *   │
 *   └── convocatorias
 *
 *
 * Este servicio NO decide qué estadísticas
 * mostrar visualmente.
 *
 * Esa responsabilidad corresponde a:
 *
 * - detalleJugador.jsx
 * - detalleEstadistica.jsx
 * - estadisticasGlobales.jsx
 *
 * según deporte_id.
 */
export const obtenerContextoEstadisticoJugador =
  async (jugador) => {
    if (!jugador) {
      return {
        stats:
          generarStatsBaseVacias(),

        convocatorias:
          normalizarConteoConvocatorias(
            {}
          ),

        deporte_id: null,
      };
    }

    const jugadorId =
      Number(
        jugador?.id ??
          jugador?.jugador_id ??
          jugador?.id_jugador ??
          0
      );

    const deporteId =
      Number(
        jugador?.deporte_id ??
          jugador?.id_deporte ??
          0
      );

    const rut =
      String(
        jugador?.rut_jugador ??
          jugador?.rut ??
          ""
      ).trim();

    /*
     * Stats y convocatorias son independientes,
     * por lo que sí podemos cargarlas
     * concurrentemente una vez conocemos
     * al jugador.
     */
    const [
      stats,
      convocatorias,
    ] =
      await Promise.all([
        obtenerEstadisticasJugador(
          {
            jugadorId,
            deporteId,
          }
        ),

        obtenerConteoConvocatorias(
          rut
        ),
      ]);

    return {
      /*
       * Vista unificada útil para componentes.
       *
       * No altera las tablas.
       */
      stats: {
        ...stats,
        ...convocatorias,
      },

      /*
       * También las conservamos separadas
       * para componentes de Eventos /
       * Convocatorias.
       */
      convocatorias,

      deporte_id:
        Number.isFinite(
          deporteId
        ) &&
        deporteId > 0
          ? deporteId
          : null,
    };
  };