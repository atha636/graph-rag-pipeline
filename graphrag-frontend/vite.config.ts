import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Suppress ECONNREFUSED noise when backend is offline.
        // Without this, Vite logs a full error stack every poll cycle.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Only silence connection-refused — let real errors through
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
              if (res && !res.headersSent) {
                (res as import('http').ServerResponse).writeHead(503, {
                  'Content-Type': 'application/json',
                });
                (res as import('http').ServerResponse).end(
                  JSON.stringify({ error: 'Backend offline' })
                );
              }
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
  },
})