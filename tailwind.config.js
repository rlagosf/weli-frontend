/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",

  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  theme: {
    extend: {
      colors: {
        ra: {
          /*
           * =================================================
           * PALETA WELI DINÁMICA
           * =================================================
           *
           * Cada color utiliza una variable CSS cuando nos
           * encontramos dentro del entorno de una academia.
           *
           * Si la variable no existe, conserva exactamente
           * el color WELI original.
           *
           * Esto permite mantener funcionando:
           *
           * bg-ra-terracotta
           * bg-ra-terracotta/90
           * text-ra-marron
           * text-ra-marron/70
           * border-ra-marron/15
           * etc.
           */

          marron: "rgb(var(--weli-text-rgb, 109 88 41) / <alpha-value>)",

          terracotta: "rgb(var(--weli-primary-rgb, 226 119 59) / <alpha-value>)",

          sand: "rgb(var(--weli-bg-rgb, 255 221 161) / <alpha-value>)",

          cream: "rgb(var(--weli-bg-rgb, 232 218 196) / <alpha-value>)",

          caramel: "rgb(var(--weli-secondary-rgb, 221 162 114) / <alpha-value>)",

          gold: "rgb(var(--weli-secondary-rgb, 183 159 105) / <alpha-value>)",

          fucsia: "rgb(var(--weli-primary-rgb, 170 80 19) / <alpha-value>)",
        },

        /*
         * =================================================
         * COLORES NUEVOS DEL SISTEMA DE TEMAS
         * =================================================
         *
         * Estos no reemplazan colores semánticos como:
         *
         * red-*     errores
         * emerald-* éxito
         * amber-*   advertencias
         *
         * Se utilizan exclusivamente para elementos
         * visuales de la academia.
         */

        weli: {
          card: "rgb(var(--weli-card-rgb, 255 255 255) / <alpha-value>)",

          icon: "rgb(var(--weli-icon-rgb, 170 80 19) / <alpha-value>)",

          primary: "rgb(var(--weli-primary-rgb, 170 80 19) / <alpha-value>)",

          secondary: "rgb(var(--weli-secondary-rgb, 109 88 41) / <alpha-value>)",

          text: "rgb(var(--weli-text-rgb, 109 88 41) / <alpha-value>)",

          background: "rgb(var(--weli-bg-rgb, 232 218 196) / <alpha-value>)",
        },
      },

      fontFamily: {
        sans: ['"Bebas Neue"', "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },

      letterSpacing: {
        tightish: "-0.01em",
        wideish: "0.02em",
      },

      fontSize: {
        base: [
          "1.07rem",
          {
            lineHeight: "1.6",
          },
        ],
      },

      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },

  plugins: [],
};
