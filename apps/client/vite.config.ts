import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const SERVER = process.env.TAKE2_SERVER ?? 'http://localhost:2567';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // Same path as production, where Caddy forwards /api to the game server.
      '/api': { target: SERVER, ws: true, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
