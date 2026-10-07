import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  const isBuild = command === 'build'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true
    },
    build: {
      // Production build only (Vercel). `npm run dev` is untouched, so all
      // console.log output still shows when you run locally.
      minify: isBuild ? 'terser' : false,
      terserOptions: {
        compress: {
          // Strip noisy logs, keep console.warn / console.error for real problems
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          drop_debugger: true
        }
      }
    }
  }
})