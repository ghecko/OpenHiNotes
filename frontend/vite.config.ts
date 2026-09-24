import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // @ts-ignore - process.env is provided by Vite/Node during config evaluation
    allowedHosts: [process.env.SITE_HOST || 'localhost', 'localhost'],
    hmr: {
      // The browser reaches the HMR WebSocket through the reverse proxy. By
      // default Vite uses the page's own port, which is right whenever the
      // proxy serves both the page and the WebSocket (443, 8443, ...).
      // Set HMR_CLIENT_PORT only if the WebSocket must use a different port;
      // a wrong value makes the Vite client spam GET https://host:<port>/
      // with net::ERR_CONNECTION_REFUSED.
      // @ts-ignore - process.env is provided by Vite/Node during config evaluation
      ...(process.env.HMR_CLIENT_PORT ? { clientPort: Number(process.env.HMR_CLIENT_PORT) } : {}),
      protocol: 'wss',
      timeout: 60000,
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      }
    }
  }
})
