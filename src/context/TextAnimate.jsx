// src/context/TextAnimate.jsx
import React from "react";
import { motion } from "framer-motion";

const effects = {
  blurInUp: {
    hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
};

export function TextAnimate({
  children,
  animation = "blurInUp",
  by = "character", // "character" | "word"
  className = "",
  duration = 0.55,
  stagger = 0.03,
  delay = 0,
}) {
  const text = String(children ?? "");
  const variant = effects[animation] ?? effects.blurInUp;

  // ✅ Si animas por palabra, simple (sin cortes raros)
  if (by === "word") {
    const words = text.split(" ");

    let idx = 0;
    return (
      <span className={className} aria-label={text} role="text">
        {words.map((w, wi) => {
          const d = delay + idx * stagger;
          idx += 1;

          return (
            <React.Fragment key={`${w}-${wi}`}>
              <motion.span
                initial="hidden"
                animate="show"
                variants={variant}
                transition={{ duration, delay: d }}
                className="inline-block whitespace-nowrap will-change-transform"
              >
                {w}
              </motion.span>
              {wi < words.length - 1 && " "}
            </React.Fragment>
          );
        })}
      </span>
    );
  }

  // ✅ Animación por carácter, pero agrupando palabras para que NO se corte dentro de ellas
  // Preserva múltiples espacios:
  const segments = text.split(/(\s+)/); // ["Hola", " ", "mundo", "  ", "..." ]

  let globalCharIndex = 0;

  return (
    <span className={className} aria-label={text} role="text">
      {segments.map((seg, si) => {
        const isWhitespace = /^\s+$/.test(seg);

        // Espacios: render normal, permiten wrap natural entre palabras
        if (isWhitespace) {
          return (
            <span key={`ws-${si}`} className="whitespace-pre">
              {seg}
            </span>
          );
        }

        // Palabra / segmento no-espacio: NO puede cortarse dentro
        const chars = [...seg];

        return (
          <span
            key={`word-${si}`}
            className="inline-flex whitespace-nowrap align-baseline"
          >
            {chars.map((ch, ci) => {
              const d = delay + globalCharIndex * stagger;
              globalCharIndex += 1;

              return (
                <motion.span
                  key={`ch-${si}-${ci}`}
                  initial="hidden"
                  animate="show"
                  variants={variant}
                  transition={{ duration, delay: d }}
                  className="inline-block will-change-transform"
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
