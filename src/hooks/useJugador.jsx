import { useEffect, useState } from 'react';
import {
  obtenerJugador,
  obtenerEstadisticasJugador,
} from '../services/jugadoresService';

/**
 * Hook seguro para obtener información y estadísticas de un jugador.
 * - No expone RUT ni logs en consola.
 * - Devuelve valores en 0 cuando no hay data.
 * - Pensado para integrarse en componentes tipo "DetalleJugador".
 */
export default function useJugador(rut) {
  const [jugador, setJugador] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    async function fetchData() {
      if (!rut) {
        setJugador(null);
        setStats(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [j, s] = await Promise.all([
          obtenerJugador(rut),
          obtenerEstadisticasJugador(rut),
        ]);

        if (!activo) return;
        setJugador(j || null);
        setStats(s || {});
      } catch (e) {
        if (!activo) return;
        const msg =
          e?.status === 404
            ? 'Jugador no encontrado'
            : 'Error al cargar datos del jugador';
        setError(msg);
      } finally {
        if (activo) setLoading(false);
      }
    }

    fetchData();

    return () => {
      activo = false;
    };
  }, [rut]);

  return { jugador, stats, loading, error };
}
