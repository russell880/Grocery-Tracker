import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // Stamped at build time so the app can tell you which version you are
    // actually running — the thing you cannot otherwise check from a
    // home-screen app with no address bar.
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
})
