import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/mainview',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    // keep in sync with tsconfig.json compilerOptions.paths
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared-contracts'),
      '@utils': path.resolve(__dirname, 'src/mainview/utils'),
      '@': path.resolve(__dirname, 'src/mainview'),
    },
  },
  server: {
    port: 5173,
  },
})
