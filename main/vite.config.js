import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  esbuild: {
    // only strips console/debugger during `vite build` (production),
    // `vite dev` (local) is untouched
    drop: command === 'build' ? ['console', 'debugger'] : []
  }
}))