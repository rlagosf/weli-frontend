/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  theme: {
    extend: {
      colors: {
        ra: {
          // Base cálida WELI
          marron: "#6d5829",
          terracotta: "#e2773b",
          sand: "#ffdda1",

          // Tonos claros usados en admin layouts
          cream: "#e8dac4",
          caramel: "#dda272",
          gold: "#b79f69",

          // Acento (si quieres “cobre”, úsalo acá)
          fucsia: "#aa5013",
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
        base: ["1.07rem", { lineHeight: "1.6" }],
      },

      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },

  plugins: [],
};
