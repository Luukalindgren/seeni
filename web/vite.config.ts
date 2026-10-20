import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from https://luukalindgren.github.io/seeni/.
// Change base to '/' when moving to seeni.fi.
const base = '/seeni/'

export default defineConfig({
  base,
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
        background_color: '#f7f4ee',
        theme_color: '#7a4b1f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The model, its JSON files and the onnxruntime WebAssembly go into the precache,
        // so the app works offline after the first load.
        globPatterns: ['**/*.{js,mjs,css,html,png,json,onnx,wasm}'],
        // The default 2 MiB would silently leave the model and the runtime out.
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
    }),
  ],
})
