import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { bareCssImportsPlugin } from './vite-plugin-bare-css-imports.js'

export default defineConfig({
  plugins: [bareCssImportsPlugin(), react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@blocknote') || id.includes('prosemirror') || id.includes('@tiptap')) {
              return 'vendor-blocknote'
            }
            if (id.includes('katex')) {
              return 'vendor-katex'
            }
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg')) {
              return 'vendor-pdf-export'
            }
            if (id.includes('pdfjs-dist') || id.includes('react-pdf')) {
              return 'vendor-pdf-viewer'
            }
            if (id.includes('livekit-client')) {
              return 'vendor-livekit'
            }
            if (id.includes('hls.js')) {
              return 'vendor-hls'
            }
            if (id.includes('@mantine')) {
              return 'vendor-mantine'
            }
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router-dom') ||
              id.includes('zustand') ||
              id.includes('axios') ||
              id.includes('socket.io-client')
            ) {
              return 'vendor-core'
            }
          }
        },
      },
    },
  },
})

