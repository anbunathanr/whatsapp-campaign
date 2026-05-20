import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Explicit build output directory (important for CI/CD pipelines and Docker)
  build: {
    outDir: 'dist',
    // Emit a sourcemap in production for CloudWatch / error tracking
    sourcemap: false,
    // Raise the chunk-size warning threshold (React + chart.js are large)
    chunkSizeWarningLimit: 1000,
  },

  // Allow Vite dev server to be reached from inside a Docker container
  server: {
    host: true,
    port: 5173,
  },
})
