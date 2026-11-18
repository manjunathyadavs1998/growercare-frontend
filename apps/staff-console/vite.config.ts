import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// SPEC-FE-01 D4: in dev every /api call goes to the edge gateway (no CORS needed); built apps read /config.json.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:8080' } },
  preview: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:8080' } },
  build: { sourcemap: false, target: 'es2022' },
});
