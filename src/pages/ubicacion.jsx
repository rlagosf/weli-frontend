import { motion } from 'framer-motion';

export default function Ubicacion() {
  const MAIPU = { lat: -33.4862355, lng: -70.74722 };
  const LAS_REJAS = { lat: -33.4644888, lng: -70.7093931 };

  const MAIPU_URL =
    'https://www.google.com/maps/place/Complejo+Deportivo+Don+Oscar/@-33.4862355,-70.74722,17z/data=!4m6!3m5!1s0x9662c33dd78591a7:0xd3e2a2279104fda!8m2!3d-33.4862355!4d-70.74722!16s%2Fg%2F11b8z0bbps?entry=ttu';
  const LAS_REJAS_URL =
    'https://www.google.com/maps/place/Estadio+Las+Rejas/@-33.4644888,-70.7093931,17z/data=!4m6!3m5!1s0x9662c484c00cfdd9:0x90104fc4b03dac!8m2!3d-33.4644888!4d-70.7093931!16s%2Fg%2F11c531y4j8?entry=ttu';

  const embed = (lat, lng) =>
    `https://www.google.com/maps?q=${lat},${lng}&hl=es&z=17&output=embed`;

  return (
    <motion.section
      id="ubicacion"
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
      className="text-white pt-20 pb-0 px-6 font-sans"
    >
      <div className="max-w-6xl mx-auto">
        {/* Título */}
        <div className="max-w-4xl text-center mb-10 md:mb-12 mx-auto">
          <p className="text-2xl md:text-3xl font-bold italic text-[#e82d89] transform rotate-[-2deg] scale-105 drop-shadow-[0_0_15px_#e82d89aa]">
            Visítanos en nuestras sucursales, y sé parte de nuestro equipo
          </p>
        </div>

        {/* Grid de sedes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Columna Maipú */}
          <div className="flex flex-col gap-4">
            <div className="w-full rounded-xl shadow-lg border-2 border-[#e82d89] overflow-hidden bg-black/20">
              <div className="relative w-full h-64">
                <iframe
                  title="Ubicación Sucursal Maipú — Complejo Deportivo Don Oscar"
                  src={embed(MAIPU.lat, MAIPU.lng)}
                  width="100%"
                  height="100%"
                  className="border-0"
                  loading="lazy"
                  allowFullScreen
                />
                <a
                  href={MAIPU_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 block"
                  aria-label="Abrir en Google Maps: Complejo Deportivo Don Oscar"
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-1">
                  Sucursal Maipú — Complejo Deportivo Don Oscar
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Sede tradicional de RAFC, con enfoque en formación integral y trabajo técnico/táctico.
                  <br />
                  <br />
                  <span className="opacity-80">
                    Dirección: Av. Los Pajaritos 4273, Maipú, Región Metropolitana
                  </span>
                </p>
              </div>
            </div>

            <div className="w-full rounded-xl p-2 flex justify-center bg-transparent">
              <img
                src="/arena_soccer.jpg"
                alt="Flyer Complejo Deportivo Don Oscar"
                className="w-full max-w-[320px] aspect-[3/4] object-contain rounded-lg"
              />
            </div>
          </div>

          {/* Columna Las Rejas */}
          <div className="flex flex-col gap-4">
            <div className="w-full rounded-xl shadow-lg border-2 border-[#e82d89] overflow-hidden bg-black/20">
              <div className="relative w-full h-64">
                <iframe
                  title="Ubicación Sucursal Estadio Las Rejas"
                  src={embed(LAS_REJAS.lat, LAS_REJAS.lng)}
                  width="100%"
                  height="100%"
                  className="border-0"
                  loading="lazy"
                  allowFullScreen
                />
                <a
                  href={LAS_REJAS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 block"
                  aria-label="Abrir en Google Maps: Estadio Las Rejas"
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-1">
                  Sucursal Estadio Las Rejas
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Nueva sede RAFC orientada al desarrollo futbolístico juvenil, con instalaciones amplias y un entorno inspirador.
                  <br />
                  <span className="opacity-80">
                    Dirección: Los Maitenes 5812, Estación Central, Región Metropolitana
                  </span>
                </p>
              </div>
            </div>

            <div className="w-full rounded-xl p-2 flex justify-center bg-transparent">
              <img
                src="/las_rejas.jpg"
                alt="Flyer Estadio Las Rejas"
                className="w-full max-w-[320px] aspect-[3/4] object-contain rounded-lg"
              />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="-mb-8 lg:-mb-12" aria-hidden="true" />
    </motion.section>
  );
}
