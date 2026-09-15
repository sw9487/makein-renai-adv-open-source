import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      '@core': fileURLToPath(new URL('../core', import.meta.url)),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 9488,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:9487', changeOrigin: true }, '/assets/authored': {target:'http://localhost:9487',changeOrigin:true} },
  },
});
