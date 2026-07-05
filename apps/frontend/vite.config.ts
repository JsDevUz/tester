import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { bareCssImportsPlugin } from './vite-plugin-bare-css-imports.js'

export default defineConfig({
  plugins: [bareCssImportsPlugin(), react(), tailwindcss()],
  server: { port: 5173 },
})
