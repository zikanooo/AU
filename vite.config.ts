import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Jika dijalankan dengan "vite" langsung (tanpa server.ts), teruskan API ke backend Python.
      proxy: {
        '/music-api': { target: `http://127.0.0.1:${process.env.BACKEND_PORT || 8765}`, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/music-api/, '') },
        '/api': { target: `http://127.0.0.1:${process.env.BACKEND_PORT || 8765}`, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
