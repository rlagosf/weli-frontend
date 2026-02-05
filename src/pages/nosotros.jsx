// src/pages/nosotros.jsx
import { useEffect, useMemo, useRef, useState } from "react";

const TARJETAS = [
  {
    titulo: "Quiénes somos",
    align: "text-left pr-6",
    texto: `WELI ES UNA PLATAFORMA DE GESTIÓN DEPORTIVA Y ANÁLISIS DE RENDIMIENTO CREADA PARA PROFESIONALIZAR EL FÚTBOL AMATEUR SIN PERDER SU ESENCIA.

NACEMOS DE UNA CONVICCIÓN SIMPLE: EN CANCHAS DE BARRIO, ESCUELAS Y ACADEMIAS HAY TALENTO REAL QUE QUEDA FUERA DEL RADAR, NO POR FALTA DE CAPACIDAD, SINO POR FALTA DE ESTRUCTURA, SEGUIMIENTO Y EVIDENCIA.

POR ESO CONSTRUIMOS UNA HERRAMIENTA QUE ORDENA LA OPERACIÓN DIARIA Y, AL MISMO TIEMPO, REGISTRA EL PROCESO DEL JUGADOR: ASISTENCIA, MINUTOS, PROGRESO, DISCIPLINA Y EVOLUCIÓN. QUEREMOS QUE ESA HISTORIA DEPORTIVA SEA CONSISTENTE, CONSULTABLE Y ÚTIL, INCLUSO SI EL JUGADOR CAMBIA DE EQUIPO O CATEGORÍA.`,
  },
  {
    titulo: "Filosofía",
    align: "text-right pl-6",
    texto: `EN WELI CREEMOS QUE EL TALENTO NO SIEMPRE GRITA: MUCHAS VECES SE CONSTRUYE EN SILENCIO. Y EN EL FÚTBOL AMATEUR, LO QUE NO SE REGISTRA, SE PIERDE.

NUESTRA FILOSOFÍA ES ELEVAR EL ESTÁNDAR CON TRES PRINCIPIOS: JUSTICIA, CONTINUIDAD Y CLARIDAD. JUSTICIA, PORQUE LAS OPORTUNIDADES DEBEN BASARSE EN HECHOS Y EVOLUCIÓN, NO SOLO EN PERCEPCIONES. CONTINUIDAD, PORQUE LA PROGRESIÓN DEL JUGADOR NO DEBE “REINICIARSE” CADA TEMPORADA O CADA CAMBIO DE CLUB. Y CLARIDAD, PORQUE ENTRENADORES, STAFF Y DIRECTIVOS NECESITAN INFORMACIÓN ORDENADA PARA TOMAR MEJORES DECISIONES.

WELI EXISTE PARA QUE EL POTENCIAL INFRAVALORADO TENGA RESPALDO, PARA QUE LA INFORMACIÓN VIAJE DE EQUIPO EN EQUIPO, Y PARA QUE EL FÚTBOL AMATEUR SUBA SU NIVEL DESDE LA BASE, CON DATOS Y DISCIPLINA.`,
  },
];

export default function Nosotros() {
  const rootRef = useRef(null);
  const [inView, setInView] = useState(false);

  // opciones estables para no recrear observer
  const ioOptions = useMemo(
    () => ({
      root: null,
      threshold: 0.18,
      // dispara un poco antes para que "se note" al llegar desde navbar/footer
      rootMargin: "-10% 0px -10% 0px",
    }),
    []
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(([entry]) => {
      // ✅ entra => aparece; sale => desaparece
      setInView(entry.isIntersecting);
    }, ioOptions);

    obs.observe(el);
    return () => obs.disconnect();
  }, [ioOptions]);

  return (
    <section
      id="nosotros"
      ref={rootRef}
      className={[
        "text-white font-sans px-6 pt-16 pb-12 flex flex-col items-center",
        // ✅ animación barata: opacity + translate (GPU)
        "transition-all duration-500 ease-out transform-gpu will-change-transform will-change-opacity",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
      ].join(" ")}
    >
      {/* Frase destacada */}
      <div className="max-w-4xl text-center mb-10">
        <p className="text-2xl md:text-3xl font-bold italic text-ra-sand">
          “El talento se demuestra. La constancia se registra.”
        </p>
      </div>

      {/* Contenedor: “tarjetas invisibles” (solo layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full items-stretch">
        {TARJETAS.map((t) => (
          <article
            key={t.titulo}
            className="p-0 md:p-2 bg-transparent border-0 shadow-none rounded-none"
          >
            <h3
              className={`text-2xl font-bold mb-4 uppercase tracking-wide text-ra-sand ${t.align}`}
            >
              {t.titulo}
            </h3>

            <p className="text-white/75 text-sm md:text-base leading-relaxed text-justify whitespace-pre-line">
              {t.texto}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
