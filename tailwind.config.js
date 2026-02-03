/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",

  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  theme: {
    extend: {
      // 🎨 Marca (mantengo namespace ra para no romper el proyecto)
      colors: {
        ra: {
          fucsia: "#aa5013", // cobre (acento principal)
          marron: "#6d5829", // base oscura cálida
          gold: "#b79f69",
          cream: "#e8dac4",
          sand: "#ffdda1",
          caramel: "#dda272",
          terracotta: "#e2773b",
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
