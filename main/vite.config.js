import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    // Vite 8 defaults to the Oxc minifier, which doesn't support drop_console
    // yet — switch to terser explicitly so we can strip console/debugger.
    minify: command === 'build' ? 'terser' : false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
}))