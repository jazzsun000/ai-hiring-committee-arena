import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages static demo only. Unset (normal `npm run dev` / `vite build`) keeps base `/`.
  base: process.env.VITE_STATIC_DEMO === '1' ? '/ai-hiring-committee-arena/' : '/',
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
