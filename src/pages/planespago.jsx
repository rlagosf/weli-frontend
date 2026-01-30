import { motion } from 'framer-motion';

/* ════════════════════  DATA  ════════════════════ */
const planes = [
  {
    icono: '💸',
    titulo: 'PASE DIARIO',
    precio: '$12.500',
    detalles: [
      'Clase de 1 hora',
      'Pago obligatorio hasta el día anterior (23:59 hrs)',
      'No asegura cupo permanente',
      'No incluye participación en encuentros deportivos (solo entrenamiento)',
    ],
  },
  {
    icono: '🗓️',
    titulo: 'PLAN SÁBADO POR MEDIO',
    precio: '$20.000',
    detalles: [
      'Clase de 1 hora sábado por medio (máx. 2 sábados al mes)',
      'Pago anticipado mensual',
    ],
  },
  {
    icono: '🏷️',
    titulo: 'PLAN PREPAGO MENSUAL FÚTBOL',
    precio: '$35.000',
    detalles: [
      'Clases de 1 hora semanal',
      'Primer mes proporcional',
      'Pago anticipado mensual',
    ],
  },
  {
    icono: '📦',
    titulo: 'PLAN PREPAGO TRIMESTRAL FÚTBOL',
    precio: '$90.000',
    detalles: [
      'Clases de 1 hora semanal',
      'Equivale a $30.000 mensual',
      'Primer mes proporcional',
      'Pago anticipado mensual',
    ],
  },
];

/* ════════════════════  COMPONENTE  ════════════════════ */
export default function PlanesPagos() {
  return (
    <motion.section
      id="planes"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.2 }}
      variants={{
        hidden: { opacity: 0, y: 50 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.8, ease: 'easeOut' },
        },
      }}
      className="text-white py-20 px-6 font-sans bg-transparent flex flex-col items-center"
    >
      {/* Título */}
      <div className="max-w-4xl text-center mb-12">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-[#e82d89]">
          Planes de Pago
        </h2>
        <p className="text-gray-300 text-lg">
          Flexibilidad y transparencia para que entrenes a tu ritmo — elige el plan que más te acomode.
        </p>
      </div>

      {/* Tarjetas responsivas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-6xl">
        {planes.map((plan, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="border border-[#e82d89] bg-black rounded-xl p-6 text-center hover:shadow-lg hover:shadow-[#e82d89]/30 transition duration-300"
          >
            <div className="text-5xl mb-3">{plan.icono}</div>
            <h3 className="text-xl font-semibold mb-1 text-[#e82d89]">{plan.titulo}</h3>
            <p className="text-lg font-bold mb-4">{plan.precio}</p>
            <ul className="text-sm text-gray-300 leading-relaxed space-y-1 list-disc list-inside text-left">
              {plan.detalles.map((d, idx) => (
                <li key={idx}>{d}</li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
