import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// decode-named-character-reference's "browser" build uses `document`, which workers don't have.
// Its exports map has no subpaths, so point at the plain build by absolute path.
const store = join(import.meta.dirname, '../../node_modules/.pnpm');
const pkg = readdirSync(store).find((d) => d.startsWith('decode-named-character-reference@'));
if (!pkg) throw new Error('decode-named-character-reference not found in the pnpm store');
const decodeEntities = join(store, pkg, 'node_modules/decode-named-character-reference/index.js');

export default defineConfig({
  base: '/app/',
  plugins: [
    react(),
    // PK-08: installable and offline. Registration is an external script (no inline script, CSP).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Specdiff',
        short_name: 'Specdiff',
        description: 'Compare OpenAPI specs, JSON, YAML, Markdown, code and text in your browser. Nothing is uploaded.',
        start_url: '/app/',
        scope: '/app/',
        display: 'standalone',
        background_color: '#ECEEE9',
        theme_color: '#15171A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/app/index.html',
        // Grammars are large; cache each the first time its language is used.
        runtimeCaching: [{ urlPattern: /\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'specdiff-wasm', expiration: { maxEntries: 10 } } }],
      },
    }),
  ],
  resolve: { alias: [{ find: /^decode-named-character-reference$/, replacement: decodeEntities }] },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { assetsInlineLimit: 0 },
});
