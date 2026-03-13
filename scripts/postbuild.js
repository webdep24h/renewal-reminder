#!/usr/bin/env node
/**
 * Post-build script:
 * 1. Copy public/ files to dist/
 * 2. Write _routes.json to only route /api/* to the worker
 */
import { cpSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const publicDir = new URL('../public', import.meta.url).pathname
const distDir = new URL('../dist', import.meta.url).pathname

// Ensure dist exists
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

// Copy public files to dist
const filesToCopy = ['index.html', 'sw.js', 'manifest.json', 'favicon.png']
for (const file of filesToCopy) {
  const src = join(publicDir, file)
  if (existsSync(src)) {
    cpSync(src, join(distDir, file))
    console.log(`[postbuild] Copied ${file}`)
  }
}

// Copy directories
const dirsToCopy = ['icons', 'static', 'docs']
for (const dir of dirsToCopy) {
  const src = join(publicDir, dir)
  if (existsSync(src)) {
    cpSync(src, join(distDir, dir), { recursive: true })
    console.log(`[postbuild] Copied ${dir}/`)
  }
}

// Write _routes.json — only /api/* goes through the Worker
// All other paths are served as static files by Cloudflare Pages
const routes = {
  version: 1,
  include: ['/api/*'],
  exclude: []
}
writeFileSync(join(distDir, '_routes.json'), JSON.stringify(routes, null, 2))
console.log('[postbuild] Written _routes.json')
console.log('[postbuild] Build complete!')
