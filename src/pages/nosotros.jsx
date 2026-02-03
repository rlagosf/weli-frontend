import { motion } from "framer-motion";

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

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

export default function Nosotros() {
  return (
    <motion.section
      id="nosotros"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.2 }}
      variants={SECTION_VARIANTS}
      className="text-white font-sans px-6 pt-16 pb-12 flex flex-col items-center"
    >
      {/* Frase destacada (WELI) */}
      <div className="max-w-4xl text-center mb-10">
        <p className="text-2xl md:text-3xl font-bold italic text-ra-sand transform rotate-[-2deg] scale-105 drop-shadow-[0_0_14px_rgba(170,80,19,0.28)]">
          “El talento se demuestra. La constancia se registra.”
        </p>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full items-stretch">
        {TARJETAS.map((t, i) => (
          <motion.article
            key={t.titulo}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="
              relative rounded-2xl p-5 md:p-7 overflow-hidden
              bg-white/5 backdrop-blur-lg
              border border-ra-fucsia/20
              shadow-[0_0_26px_rgba(0,0,0,0.35)]
              hover:shadow-[0_0_28px_rgba(170,80,19,0.16)]
              transition-all duration-300
            "
          >
            {/* Glow sutil WELI */}
            <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-ra-terracotta/15 blur-3xl pointer-events-none" />

            <h3
              className={`text-2xl font-bold mb-4 uppercase tracking-wide text-ra-sand ${t.align}`}
            >
              {t.titulo}
            </h3>

            <p className="text-white/70 text-sm md:text-base leading-relaxed text-justify whitespace-pre-line">
              {t.texto}
            </p>

            {/* Línea inferior de acento (opcional, queda pro) */}
            <div className="mt-6 h-[2px] w-full bg-gradient-to-r from-ra-fucsia via-ra-terracotta to-ra-sand opacity-70" />
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}
