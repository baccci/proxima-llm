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
      '@components': path.resolve(__dirname, 'src/mainview/components'),
      '@features': path.resolve(__dirname, 'src/mainview/features'),
      '@lib': path.resolve(__dirname, 'src/mainview/lib'),
      '@hooks': path.resolve(__dirname, 'src/mainview/hooks'),
      '@store': path.resolve(__dirname, 'src/mainview/store'),
      '@entities': path.resolve(__dirname, 'src/mainview/entities'),
      '@': path.resolve(__dirname, 'src/mainview'),
    },
  },
  server: {
    port: 5173,
  },
})
