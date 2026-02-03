// src/pages/Servicios.jsx
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    titulo: "Panel de control",
    descripcion:
      "Vista ejecutiva con indicadores clave: pagos al día, asistencia, alertas, estados y resumen por categoría. Todo lo relevante en un solo lugar.",
    Icon: LayoutDashboard,
  },
  {
    titulo: "Gestión de jugadores y apoderados",
    descripcion:
      "Ficha completa del jugador, contacto, categoría, documentación y relación con apoderados. Control ordenado y trazabilidad del historial deportivo.",
    Icon: Users,
  },
  {
    titulo: "Pagos y estados de cuenta",
    descripcion:
      "Registro de mensualidades, pagos manuales, comprobantes y estados de cuenta. Seguimiento claro para administración y visibilidad para apoderados.",
    Icon: CreditCard,
  },
  {
    titulo: "Estadísticas deportivas",
    descripcion:
      "Rendimiento por jugador y equipo: métricas, evolución y comparativas. Datos para tomar decisiones justas y elevar el estándar competitivo.",
    Icon: BarChart3,
  },
  {
    titulo: "Agenda y organización",
    descripcion:
      "Planificación de entrenamientos, partidos y actividades. Orden operativo para el staff, con foco en continuidad y control del día a día.",
    Icon: CalendarDays,
  },
  {
    titulo: "Roles y seguridad",
    descripcion:
      "Accesos diferenciados por perfil: administración/staff y portal apoderados. Control de permisos, protección de datos y operación responsable.",
    Icon: ShieldCheck,
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

export default function Servicios() {
  return (
    <motion.section
      id="servicios"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.2 }}
      variants={SECTION_VARIANTS}
      className="text-white py-16 px-6 font-sans bg-transparent flex flex-col items-center"
    >
      {/* Header */}
      <div className="max-w-4xl text-center mb-10">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-ra-sand drop-shadow-[0_0_12px_rgba(170,80,19,0.25)]">
          ¿Qué ofrece WELI?
        </h2>
        <p className="text-white/70 text-lg">
          Gestión deportiva inteligente: orden, trazabilidad y rendimiento para
          elevar el estándar del fútbol amateur.
        </p>
      </div>

      {/* Grid de 6 tarjetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl w-full">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.titulo}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
            className="
              relative rounded-2xl p-6 overflow-hidden
              bg-white/5 backdrop-blur-lg
              border border-ra-fucsia/20
              shadow-[0_0_26px_rgba(0,0,0,0.35)]
              hover:shadow-[0_0_28px_rgba(170,80,19,0.18)]
              transition-all duration-300
              flex flex-col
              min-h-[260px]
            "
          >
            {/* Glow sutil WELI */}
            <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-ra-fucsia/15 blur-3xl pointer-events-none" />

            {/* Contenido (flex-1 para empujar la línea abajo) */}
            <div className="flex-1">
              <div className="flex items-start gap-4">
                <div
                  className="
                    flex items-center justify-center
                    w-12 h-12 rounded-xl
                    bg-black/20
                    border border-ra-fucsia/30
                    shadow-[0_0_18px_rgba(170,80,19,0.12)]
                    shrink-0
                  "
                  aria-hidden="true"
                >
                  <f.Icon className="w-6 h-6 text-ra-sand" />
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-bold text-ra-sand mb-2">
                    {f.titulo}
                  </h3>

                  <p className="text-white/70 text-sm md:text-base leading-relaxed text-justify">
                    {f.descripcion}
                  </p>
                </div>
              </div>
            </div>

            {/* Línea inferior SIEMPRE alineada */}
            <div className="mt-6 h-[2px] w-full bg-gradient-to-r from-ra-fucsia via-ra-terracotta to-ra-sand opacity-75" />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
