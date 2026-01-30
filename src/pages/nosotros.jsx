import { motion } from "framer-motion";

const TARJETAS = [
  {
    titulo: "Quiénes somos",
    align: "text-left pr-6",
    texto: `NUESTRO PROYECTO DEPORTIVO NACE DE UNA VISIÓN ENRIQUECIDA POR LA EXPERIENCIA EN EUROPA Y SUDAMÉRICA, FUSIONANDO LO MEJOR DE AMBAS CULTURAS FUTBOLÍSTICAS PARA ADAPTARLO CON CORAZÓN Y SENTIDO A LA REALIDAD CHILENA.

EN REAL ACADEMY FC NO SOLO HACEMOS FÚTBOL. DESDE JUNIO DE 2023 FORMAMOS PERSONAS CON CARÁCTER, COMPROMISO, DISCIPLINA Y VISIÓN. ENTRENAMOS CON PROPÓSITO, MEJORAMOS CON CONSTANCIA, MOLDEAMOS EL TALENTO Y ENSEÑAMOS A COMPETIR CON AMBICIÓN Y RESPETO. NUESTROS ENTRENAMIENTOS SON MODERNOS, COMPETITIVOS Y HUMANOS.`,
  },
  {
    titulo: "Filosofía",
    align: "text-right pl-6",
    texto: `UTILIZAMOS EL FÚTBOL COMO MEDIO PARA FORMAR PERSONAS CON LA CERTEZA DE QUE EL ESFUERZO ABRE PUERTAS DENTRO Y FUERA DE LA CANCHA. LO QUE SE APRENDE AQUÍ TRASCIENDE AL DEPORTE: PROMOVEMOS UN DESARROLLO INTEGRAL QUE INSPIRA A VIVIR CON PASIÓN, LUCHAR POR LOS OBJETIVOS Y SUPERARSE DÍA A DÍA CON DEDICACIÓN.`,
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
      <div className="max-w-4xl text-center mb-10">
        <p className="text-2xl md:text-3xl font-bold italic text-[#e82d89] transform rotate-[-2deg] scale-105 drop-shadow-[0_0_15px_#e82d89aa]">
          “No buscamos estrellas, formamos leyendas.”
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full items-stretch">
        {TARJETAS.map((t, i) => (
          <motion.div
            key={t.titulo}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="relative p-4 md:p-6 rounded-2xl flex flex-col justify-start"
          >
            <h3 className={`text-2xl font-bold mb-4 uppercase tracking-wide ${t.align}`}>
              {t.titulo}
            </h3>

            <p className="text-gray-200 text-sm md:text-base leading-relaxed text-justify whitespace-pre-line">
              {t.texto}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
