import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; everything else from the root.
  base: process.env.GITHUB_PAGES === 'true' ? '/horizon-drift/' : '/',
  plugins: [tailwindcss()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // The prototype ships alongside the app until Phase 2.9 for side-by-side comparison.
        legacy: resolve(import.meta.dirname, 'legacy/index.html'),
      },
    },
  },
});
