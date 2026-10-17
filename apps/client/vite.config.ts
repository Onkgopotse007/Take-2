import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Follow the game server's port from apps/server/.env, unless TAKE2_SERVER points elsewhere.
  const serverEnv = loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), '');
  const server = process.env.TAKE2_SERVER ?? `http://localhost:${serverEnv.PORT || 2567}`;

  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        // Same path as production, where Caddy forwards /api to the game server.
        '/api': { target: server, ws: true, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') },
      },
    },
    build: {
      target: 'es2020',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
    },
  };
});
