// src/services/jugadoresService.js
import api from './api';

/* ─────────────── Utilidades de seguridad ─────────────── */

// Crea un error “público” sin PII (ni url, ni params, ni rut)
const publicError = (status = 0, message = 'Error de red o servidor') => {
  const e = new Error(message);
  // Attach solo lo mínimo útil para la UI
  e.status = Number(status) || 0;
  return e;
};

// Envuelve una llamada GET y devuelve data o lanza error “público”
const safeGet = async (path) => {
  try {
    const res = await api.get(path);
    return res?.data;
  } catch (err) {
    const status = err?.status || err?.response?.status || 0;
    const msg =
      err?.message ||
      err?.response?.data?.message ||
      'No se pudo completar la operación';
    throw publicError(status, msg);
  }
};

/**
 * Intenta GET contra varias rutas hasta que una responda con data válida.
 * - Si alguna responde 2xx con data, retorna esa data.
 * - Si una da 404, sigue probando silenciosamente.
 * - Si todas fallan: relanza un error “público” (sin PII).
 */
const tryGet = async (candidates) => {
  let lastStatus = 0;
  let lastMsg = 'No se pudo obtener información';
  for (const path of candidates) {
    try {
      const data = await safeGet(path);
      if (data !== undefined && data !== null) return data;
    } catch (e) {
      // 404: seguimos probando otras variantes sin ruidos
      if (e?.status === 404) {
        lastStatus = 404;
        lastMsg = 'No encontrado';
        continue;
      }
      // Guardamos lo último para, eventualmente, relanzar
      lastStatus = e?.status || 0;
      lastMsg = e?.message || lastMsg;
    }
  }
  throw publicError(lastStatus, lastMsg);
};

/* ───────────────────────── Jugador ───────────────────────── */
/**
 * Devuelve el jugador por RUT o `null` si no existe.
 * Nunca lanza con PII. Si hay otro error (500/timeout), lanza error “público”.
 */
export const obtenerJugador = async (rut) => {
  const rutStr = String(rut ?? '').trim();
  if (!rutStr) return null;

  // 1) Variantes directas (alineado a tu backend)
  try {
    const direct = await tryGet([
      `/jugadores/rut/${encodeURIComponent(rutStr)}`,
      `/jugadores?rut=${encodeURIComponent(rutStr)}`,
      `/jugadores?jugador_rut=${encodeURIComponent(rutStr)}`,
    ]);

    // Si vuelve objeto plano, lo devolvemos
    if (direct && !Array.isArray(direct)) return direct;

    // Si vuelve array, filtramos por campo
    if (Array.isArray(direct)) {
      const hit = direct.find(
        (j) => String(j?.rut_jugador ?? j?.rut ?? '').trim() === rutStr
      );
      if (hit) return hit;
    }
  } catch (e) {
    // 404: seguimos al fallback; otros errores se relanzan
    if (e?.status && e.status !== 404) throw e;
  }

  // 2) Fallback: listar todos y filtrar (válido para volúmenes pequeños)
  try {
    const todos = await safeGet('/jugadores'); // { ok, items } o array, según tu backend
    const list = Array.isArray(todos?.items) ? todos.items : Array.isArray(todos) ? todos : [];
    const jugador = list.find(
      (j) => String(j?.rut_jugador ?? j?.rut ?? '').trim() === rutStr
    );
    return jugador ?? null;
  } catch (e) {
    // si aquí falla, relanzamos error público
    throw e;
  }
};

/* ────────────────────── Conteo Convocatorias ────────────────────── */
/**
 * Intenta obtener conteos (torneos_convocados, titular_partidos) desde distintas rutas.
 * Si no hay endpoint, devuelve ceros (no rompe la UI).
 */
export const obtenerConteoConvocatorias = async (rut) => {
  const rutStr = String(rut ?? '').trim();
  if (!rutStr) return { torneos_convocados: 0, titular_partidos: 0 };

  const candidates = [
    `/convocatorias/conteo/${encodeURIComponent(rutStr)}`,
    `/convocatorias/conteo?jugador_rut=${encodeURIComponent(rutStr)}`,
    `/convocatorias-historico/conteo/${encodeURIComponent(rutStr)}`,
    `/convocatorias-historico/conteo?jugador_rut=${encodeURIComponent(rutStr)}`,
  ];

  for (const path of candidates) {
    try {
      const data = await safeGet(path);
      return {
        torneos_convocados: Number(data?.torneos_convocados ?? 0),
        titular_partidos: Number(data?.titular_partidos ?? 0),
      };
    } catch (e) {
      if (e?.status && e.status !== 404) {
        // Si es error duro (500, etc.), paramos y damos ceros para no romper
        return { torneos_convocados: 0, titular_partidos: 0 };
      }
      // 404 → probamos la siguiente variante
    }
  }
  return { torneos_convocados: 0, titular_partidos: 0 };
};

/* ───────────────────────── Estadísticas ───────────────────────── */
/**
 * Si existen → normaliza a números.
 * Si 404 → plantilla en 0 (sin filtrar datos personales).
 * Otros errores → error “público”.
 */
export const obtenerEstadisticasJugador = async (rut) => {
  const rutStr = String(rut ?? '').trim();
  if (!rutStr) return generarEstadisticasVaciasConConteo({ torneos_convocados: 0, titular_partidos: 0 });

  try {
    const data = await tryGet([
      `/estadisticas/jugador/${encodeURIComponent(rutStr)}`, // principal en tu backend
      `/estadisticas?jugador_rut=${encodeURIComponent(rutStr)}`, // variantes tolerantes
      `/estadisticas/${encodeURIComponent(rutStr)}`,
      `/jugadores/estadisticas/${encodeURIComponent(rutStr)}`,
    ]);
    return normalizarEstadisticas(data);
  } catch (e) {
    // 404 → template en cero (no rompemos UI ni exponemos rut)
    if (e?.status === 404) {
      return normalizarEstadisticas(
        generarEstadisticasVaciasConConteo({ torneos_convocados: 0, titular_partidos: 0 })
      );
    }
    // otros → relanzar público
    throw e;
  }
};

/* ───────────────────────── Helpers ───────────────────────── */
const normalizarEstadisticas = (raw) => {
  const base = generarEstadisticasVaciasConConteo({ torneos_convocados: 0, titular_partidos: 0 });
  const merged = { ...base, ...(raw || {}) };

  // Casts defensivos a número
  const nums = Object.fromEntries(
    Object.entries(merged).map(([k, v]) => {
      const n = Number(v ?? 0);
      return [k, Number.isFinite(n) ? n : 0];
    })
  );

  return nums;
};

const generarEstadisticasVaciasConConteo = (conteo) => ({
  goles: 0, asistencias: 0, tiros_libres: 0, penales: 0, tiros_arco: 0,
  tiros_fuera: 0, tiros_bloqueados: 0, regates_exitosos: 0, centros_acertados: 0, pases_clave: 0,
  intercepciones: 0, despejes: 0, duelos_ganados: 0, entradas_exitosas: 0, bloqueos: 0, recuperaciones: 0,
  pases_completados: 0, pases_errados: 0, posesion_perdida: 0, offsides: 0,
  faltas_cometidas: 0, faltas_recibidas: 0, distancia_recorrida_km: 0, sprints: 0,
  duelos_aereos_ganados: 0, minutos_jugados: 0, partidos_jugados: 0, lesiones: 0, dias_baja: 0,
  tarjetas_amarillas: 0, tarjetas_rojas: 0, sanciones_federativas: 0,
  torneos_convocados: Number(conteo?.torneos_convocados ?? 0),
  titular_partidos: Number(conteo?.titular_partidos ?? 0),
});
