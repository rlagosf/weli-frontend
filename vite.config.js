// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Tu sitio vive en https://www.realacademyfc.cl/
  base: '/',

  build: {
    outDir: 'dist',    // explícito, aunque ya es el default
    sourcemap: false,  // 🔒 no publicar .map en producción
    rollupOptions: {
      output: {
        // Por ahora no tocamos nada más
      },
    },
  },
});
