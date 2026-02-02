import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ✅ Texto animado
import { TextAnimate } from "../context/TextAnimate";

// ✅ Logo oficial (desde /src)
import logoOficial from "../statics/logo/logo-weli.png";

const IMAGENES = [
  "/image/demo-1.jpg",
  "/image/demo-2.jpg",
  "/image/demo-3.jpg",
  "/image/demo-4.jpg",
  "/image/demo-5.jpg",
  "/image/demo-6.jpg",
];

const LEYENDAS = [
  "Gestión deportiva centralizada en un solo lugar",
  "Control de pagos, asistencia y estados de cuenta",
  "Estadísticas claras para tomar mejores decisiones",
  "Seguimiento por categorías, metas y rendimiento",
  "Reportes automáticos para staff y administración",
  "Organiza tu academia con datos, no con suposiciones",
];

const MASK_STYLE = {
  WebkitMaskImage:
    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)",
  maskImage:
    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)",
};

function precargarImagenes(srcs) {
  srcs.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

export default function Landing() {
  const [indice, setIndice] = useState(0);

  // ✅ si la imagen actual falla, no dejamos pantalla vacía
  const [fallidas, setFallidas] = useState(() => new Set());

  const slides = useMemo(
    () =>
      IMAGENES.map((src, i) => ({
        src,
        caption: LEYENDAS[i % LEYENDAS.length],
      })),
    []
  );

  useEffect(() => {
    precargarImagenes(IMAGENES);

    const intervalo = setInterval(() => {
      setIndice((p) => (p + 1) % IMAGENES.length);
    }, 5000);

    return () => clearInterval(intervalo);
  }, []);

  const current = slides[indice];

  return (
    <>
      <div className="w-full h-screen relative z-10" id="inicio" />

      <section className="absolute top-0 left-0 w-full h-screen overflow-hidden text-white font-sans z-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={indice}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={MASK_STYLE}
          >
            {!fallidas.has(current.src) ? (
              <img
                src={current.src}
                alt={`Fondo ${indice}`}
                className="absolute inset-0 w-full h-full object-cover object-[center_35%] scale-105"
                loading="eager"
                decoding="async"
                onError={() =>
                  setFallidas((prev) => new Set([...prev, current.src]))
                }
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )}

            <div className="absolute inset-0 bg-black/50 z-10" />
          </motion.div>
        </AnimatePresence>

        {/* Logo + Texto centrado */}
        <motion.div
          key={`text-${indice}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 1 }}
          className="absolute top-1/2 z-50 transform -translate-y-1/2 w-full px-6 pointer-events-auto"
        >
          <div className="max-w-6xl mx-auto">
            <div className="max-w-3xl mx-auto text-center">
              {/* ✅ Logo arriba del texto */}
              <div className="flex justify-center mb-4">
                <img
                  src={logoOficial}
                  alt="WELI"
                  className="h-20 md:h-28 lg:h-32 w-auto max-w-[85vw] object-contain drop-shadow-lg"
                  draggable={false}
                />

              </div>

              <h2 className="text-3xl md:text-5xl font-bold mb-2 leading-tight">
                <TextAnimate
                  animation="blurInUp"
                  by="character"
                  once
                  className="inline-block"
                >
                  {current.caption}
                </TextAnimate>
              </h2>
            </div>
          </div>
        </motion.div>
      </section>
    </>
  );
}
