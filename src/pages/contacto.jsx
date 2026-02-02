import { motion } from "framer-motion";
import { MessageCircle, Mail } from "lucide-react";

const NUMERO_WHATSAPP = "56967438184";

const MENSAJE_WHATSAPP =
  "Hola, me gustaría solicitar una DEMO de WELI. Me interesa gestionar jugadores, pagos/estados de cuenta, asistencia, agenda y estadísticas. ¿Podemos coordinar una breve reunión y ver planes?";

const WHATSAPP_LINK = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(
  MENSAJE_WHATSAPP
)}`;

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

export default function Contacto() {
  return (
    <section
      id="contacto"
      className="text-white font-sans py-16 px-6 bg-transparent flex items-center justify-center"
    >
      {/* ✅ Animación aplicada a la tarjeta (más confiable en scroll) */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.25, margin: "-80px" }}
        variants={SECTION_VARIANTS}
        className="
          w-full max-w-4xl mx-auto overflow-hidden rounded-2xl
          bg-white/10 backdrop-blur-md border border-white/10
          shadow-[0_0_30px_rgba(0,0,0,0.35)]
        "
      >
        <div className="md:grid md:grid-cols-2">
          {/* Imagen izquierda (solo desktop) */}
          <div className="hidden md:block relative">
            <img
              src="/image/demo-3.jpg"
              alt="WELI - Gestión deportiva inteligente"
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>

          {/* Contenido derecha */}
          <div className="relative flex items-center justify-center">
            <div className="w-full text-center px-7 sm:px-10 md:px-12 py-14 md:py-16">
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                Lleva tu academia a otro nivel con{" "}
                <span className="text-[#e82d89] drop-shadow-[0_0_10px_#e82d89aa]">
                  WELI
                </span>
              </h2>

              <p className="mt-4 text-gray-200/90 text-sm md:text-base leading-relaxed max-w-md mx-auto">
                Gestiona jugadores, pagos y estados de cuenta, asistencia, agenda y
                estadísticas en un solo lugar. Orden para el staff, claridad para
                administración y continuidad para el proceso del jugador.
              </p>

              {/* CTAs */}
              <div className="mt-7 flex flex-col items-center gap-3">
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    inline-flex items-center justify-center gap-2
                    rounded-full px-8 py-3 text-sm md:text-base font-semibold
                    bg-[#e82d89] hover:bg-[#c9206e] transition
                    shadow-lg hover:shadow-[0_0_25px_rgba(232,45,137,0.45)]
                    w-full sm:w-auto
                  "
                >
                  <MessageCircle className="w-5 h-5" />
                  Solicitar demo por WhatsApp
                </a>

                <a
                  href="mailto:contacto@tudominio.cl?subject=Solicitud%20DEMO%20WELI&body=Hola,%20quisiera%20solicitar%20una%20demo%20de%20WELI.%20Me%20interesa%20conocer%20planes%20y%20puesta%20en%20marcha."
                  className="
                    inline-flex items-center justify-center gap-2
                    px-6 py-3 text-sm md:text-base font-medium
                    text-white/90 hover:text-white transition
                    w-full sm:w-auto
                  "
                >
                  <Mail className="w-5 h-5 text-white/80" />
                  Prefiero que me contacten por correo
                </a>

                <p className="text-xs text-white/60 mt-2 max-w-md">
                  Te responderemos con opciones de implementación y un recorrido por
                  módulos: administración, portal apoderados, pagos y métricas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
