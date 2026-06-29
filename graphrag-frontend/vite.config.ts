import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // In production (Vercel), VITE_API_URL points to Render backend.
  // In development, we proxy /api and /health to localhost:8000.
  const isDev = mode === 'development'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      ...(isDev && {
        proxy: {
          '/api': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('error', (_err, _req, res) => {
                if (res && !res.headersSent) {
                  (res as import('http').ServerResponse).writeHead(503, {
                    'Content-Type': 'application/json',
                  });
                  (res as import('http').ServerResponse).end(
                    JSON.stringify({ error: 'Backend offline' })
                  );
                }
              });
            },
          },
          '/health': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('error', (_err, _req, res) => {
                if (res && !res.headersSent) {
                  (res as import('http').ServerResponse).writeHead(503, {
                    'Content-Type': 'application/json',
                  });
                  (res as import('http').ServerResponse).end(
                    JSON.stringify({ status: 'offline' })
                  );
                }
              });
            },
          },
        },
      }),
    },
    // Make VITE_API_URL available at build time
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || ''),
    },
  }
})