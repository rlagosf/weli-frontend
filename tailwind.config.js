/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ Dark mode nativo (reemplaza tailwindcss-dark-mode)
  // Usa 'class' para que tú lo controles (ThemeContext / botón toggle)
  darkMode: 'class',

  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {
      // 🎨 Marca RAFC
      colors: {
        ra: {
          fucsia: '#e82d89',
          marron: '#1d0b0b',
        },
      },

      // ✍️ Tipografía
      fontFamily: {
        sans: ['"Bebas Neue"', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },

      // 🔡 Espaciado tipográfico
      letterSpacing: {
        tightish: '-0.01em',
        wideish: '0.02em',
      },

      // 🔠 Base un pelín más grande
      fontSize: {
        base: ['1.07rem', { lineHeight: '1.6' }],
      },

      // 🌑 Sombras/bordes suaves (ayudan a estética sin “aparatosidad”)
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
    },
  },

  plugins: [],
};
