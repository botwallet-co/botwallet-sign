import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
  },
  // The API's default CORS list (supabase/functions/_shared/cors.ts) allows this port, so a
  // busy port fails instead of moving the dev server to one the API refuses.
  server: {
    port: 5175,
    strictPort: true,
  },
})
