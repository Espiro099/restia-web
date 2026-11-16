import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// El panel consume restia-api. En desarrollo, /api y /sanctum se envían al backend local para que la
// cookie de sesión y el token CSRF sean del mismo origen (D-36, sección 6).
const API_URL = process.env.RESTIA_API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/sanctum': { target: API_URL, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
})
