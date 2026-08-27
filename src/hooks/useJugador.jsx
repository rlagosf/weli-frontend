// src/hooks/useJugador.jsx
import { useEffect, useState } from "react";
import {
  obtenerJugador,
  obtenerContextoEstadisticoJugador,
  generarStatsBaseVacias,
} from "../services/jugadoresService";

/**
 * Hook común para detalle de jugador.
 *
 * Responsabilidades:
 * - obtiene el jugador;
 * - obtiene stats_base;
 * - obtiene stats específicas según deporte_id;
 * - incorpora métricas transversales de convocatorias;
 * - mantiene valores base en 0 cuando todavía no hay estadísticas.
 *
 * NO fabrica campos de otro deporte.
 */
export default function useJugador(rut) {
  const [jugador, setJugador] = useState(null);
  const [stats, setStats] = useState(generarStatsBaseVacias());
  const [convocatorias, setConvocatorias] = useState({});
  const [deporteId, setDeporteId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    async function fetchData() {
      const rutStr = String(rut ?? "").trim();

      if (!rutStr) {
        if (!activo) return;

        setJugador(null);
        setStats(generarStatsBaseVacias());
        setConvocatorias({});
        setDeporteId(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Primero necesitamos conocer al jugador,
        // porque jugador_id y deporte_id determinan las estadísticas.
        const j = await obtenerJugador(rutStr);

        if (!activo) return;

        if (!j) {
          setJugador(null);
          setStats(generarStatsBaseVacias());
          setConvocatorias({});
          setDeporteId(null);
          setError("Jugador no encontrado");
          return;
        }

        setJugador(j);

        const contexto = await obtenerContextoEstadisticoJugador(j);

        if (!activo) return;

        setStats(contexto?.stats || generarStatsBaseVacias());

        setConvocatorias(contexto?.convocatorias || {});

        setDeporteId(contexto?.deporte_id ?? Number(j?.deporte_id ?? 0) ?? null);
      } catch (e) {
        if (!activo) return;

        const msg =
          e?.status === 404
            ? "Jugador no encontrado"
            : e?.status === 403
              ? "No tienes permisos para ver este jugador"
              : "Error al cargar datos del jugador";

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

  return {
    jugador,
    stats,
    convocatorias,
    deporteId,
    loading,
    error,
  };
}
