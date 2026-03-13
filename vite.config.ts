import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [
    pages({
      entry: './src/index.ts',
      outputDir: './dist',
    })
  ],
  build: {
    outDir: 'dist',
  }
})
