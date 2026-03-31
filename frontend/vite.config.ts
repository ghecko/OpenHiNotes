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
      clientPort: 8443,
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
