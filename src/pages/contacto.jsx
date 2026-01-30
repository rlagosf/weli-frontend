import { motion } from "framer-motion";
import { FileText } from "lucide-react";

const NUMERO_WHATSAPP = "56967438184";
const MENSAJE_WHATSAPP =
  "Hola, me gustaría recibir información sobre cupos, horarios y valores en Real Academy FC. ¿Podemos coordinar una evaluación inicial?";

const WHATSAPP_LINK = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(
  MENSAJE_WHATSAPP
)}`;

// Variantes reutilizables (fuera del componente para no recrearlas)
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const fadeTiltLeft = {
  hidden: { opacity: 0, rotate: -4, y: -6 },
  visible: { opacity: 1, rotate: -2, y: 0, transition: { duration: 0.6 } },
};

const fadeTiltRight = {
  hidden: { opacity: 0, rotate: 2, y: 8 },
  visible: { opacity: 1, rotate: 1, y: 0, transition: { duration: 0.6, delay: 0.08 } },
};

const EQUIPAMIENTO = [
  { src: "CONTACTO_BOTELLA.png", alt: "Botella deportiva RAFC", label: "Botella deportiva" },
  { src: "CONTACTO_MORRAL.png", alt: "Morral RAFC", label: "Morral oficial" },
  { src: "CONTACTO_UNIFORME_ENTRENAMIENTO.png", alt: "Uniforme de entrenamiento RAFC", label: "Uniforme de entrenamiento" },
  { src: "CONTACTO_UNIFORME_OFICIAL.png", alt: "Uniforme oficial RAFC", label: "Uniforme oficial" },
];

export default function Contacto() {
  return (
    <section id="contacto" className="min-h-[80vh] text-white flex items-center justify-center font-sans">
      <div className="w-full max-w-6xl px-6 py-16 mx-auto flex flex-col items-center text-center">
        {/* Imagen principal */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="w-full flex justify-center mb-8"
        >
          <img
            src="PROHIBIDO_RENDIRSE.png"
            alt="Prohibido rendirse — Real Academy FC"
            loading="eager"
            className="w-full max-w-5xl md:max-w-3xl h-auto object-contain drop-shadow-[0_10px_25px_rgba(232,45,137,0.25)]"
          />
        </motion.div>

        {/* Letreros inclinados */}
        <div className="relative mb-10 select-none">
          <motion.div
            variants={fadeTiltLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            className="inline-block -rotate-2"
          >
            <span className="block text-2xl md:text-3xl font-extrabold uppercase tracking-wider px-6 py-3 rounded leading-tight backdrop-blur-sm">
              <span className="text-[#e82d89] drop-shadow-[0_0_15px_#e82d89aa]">
                Vive la experiencia
              </span>
            </span>
          </motion.div>

          <motion.div
            variants={fadeTiltRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            className="mt-3 inline-block rotate-1"
          >
            <span className="block text-xl md:text-2xl font-black uppercase tracking-widest px-6 py-3 rounded">
              ¡Reserva tu cupo!
            </span>
          </motion.div>
        </div>

        {/* Botón WhatsApp */}
        <motion.a
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Contactar por WhatsApp"
          className="group inline-flex items-center gap-3 rounded-full px-6 py-3 text-lg font-bold uppercase tracking-wide
                     bg-[#25D366] hover:bg-[#1ebe57] text-white shadow-lg transition"
        >
          <i className="fab fa-whatsapp text-2xl"></i>
          <span className="text-base md:text-lg">
            Escríbenos por <span className="font-extrabold">WhatsApp</span>
          </span>
        </motion.a>

        {/* Equipamiento */}
        <div className="w-full mt-16">
          <div className="mb-6">
            <div className="inline-block -rotate-1">
              <span className="inline-block px-6 py-3 rounded backdrop-blur-sm text-lg md:text-xl font-bold uppercase tracking-wide">
                Al ser parte de{" "}
                <span className="text-[#e82d89]">Real Academy FC</span>, tendrás este equipamiento:
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {EQUIPAMIENTO.map((item, i) => (
              <motion.article
                key={item.src}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-xl backdrop-blur-sm flex flex-col items-center text-center p-4"
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  className="w-full h-48 object-contain transition-all duration-300 drop-shadow-[0_10px_25px_rgba(232,45,137,0.35)] hover:translate-y-[-2px] hover:drop-shadow-[0_14px_28px_rgba(232,45,137,0.45)]"
                />
                <div className="mt-4">
                  <h3 className="text-lg font-semibold drop-shadow-[0_0_8px_#000000aa]">
                    {item.label}
                  </h3>
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        {/* Reglamento */}
        <a
          href="/REGLAMENTO_INTERNO.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-12 flex flex-col items-center justify-center text-white text-xl font-semibold hover:text-[#e82d89] transition"
        >
          <span className="mb-6">Mira nuestro reglamento interno</span>
          <FileText size={100} className="text-[#e82d89] transition duration-300 hover:scale-105" />
        </a>
      </div>
    </section>
  );
}
