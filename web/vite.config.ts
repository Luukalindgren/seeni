import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { MODEL_VERSION } from './src/modelFiles.ts'

// GitHub Pages serves the app from https://luukalindgren.github.io/seeni/.
// Change base to '/' when moving to seeni.fi.
const base = '/seeni/'

// What the first visit downloads before it can identify: the model and the WebAssembly
// runtime, uncompressed. The loading status shows progress against it (the server may send
// them compressed, so Content-Length does not tell).
// Computed when the config loads: restart the dev server after exporting a new model.
const loadBytes =
  statSync(fileURLToPath(new URL(`public/models/${MODEL_VERSION}/model.onnx`, import.meta.url))).size +
  statSync(createRequire(import.meta.url).resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm')).size

export default defineConfig({
  base,
  define: { __LOAD_BYTES__: JSON.stringify(loadBytes) },
  // species.json lives in ../species, outside the web root.
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Seeni – sienten tunnistus',
        short_name: 'Seeni',
        description: 'Sienten tunnistuksen apuväline, joka toimii ilman verkkoa.',
        lang: 'fi',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f5f0e6',
        theme_color: '#7a4b1f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The model, its JSON files, the species photos and the onnxruntime WebAssembly go into the precache,
        // so the app works offline after the first load.
        globPatterns: ['**/*.{js,mjs,css,html,png,jpg,json,onnx,wasm}'],
        // The default 2 MiB would silently leave the model and the runtime out.
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // The species gallery is extra: cached when first seen, not on install.
        globIgnores: ['**/species/gallery/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}species/gallery/`),
            handler: 'CacheFirst',
            options: { cacheName: 'species-gallery', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
})
