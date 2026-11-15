import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// decode-named-character-reference's "browser" build uses `document`, which workers don't have.
// Its exports map has no subpaths, so point at the plain build by absolute path.
const store = join(import.meta.dirname, '../../node_modules/.pnpm');
const pkg = readdirSync(store).find((d) => d.startsWith('decode-named-character-reference@'));
if (!pkg) throw new Error('decode-named-character-reference not found in the pnpm store');
const decodeEntities = join(store, pkg, 'node_modules/decode-named-character-reference/index.js');

const ssrOut = join(import.meta.dirname, 'node_modules/.cache/prerender');

/** B-53: puts the Compare screen, server-rendered by `vite build --ssr src/prerender.tsx`, into #root for main.tsx to hydrate. */
const prerender = (): Plugin => ({
  name: 'specdiff-prerender',
  apply: 'build',
  async transformIndexHtml(html) {
    const entry = join(ssrOut, 'prerender.js');
    if (!existsSync(entry)) throw new Error('Run the SSR build first: pnpm --filter @specdiff/app build');
    const { render } = (await import(`${pathToFileURL(entry).href}?t=${Date.now()}`)) as { render: () => string };
    return html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`);
  },
});

/**
 * B-53: the prerendered HTML and CSS paint the page on their own, so the JS (which only makes it
 * interactive) is fetched at low priority and doesn't compete with them on slow connections.
 */
const lowPriorityJs = (): Plugin => ({
  name: 'specdiff-low-priority-js',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<(script type="module"|link rel="modulepreload")/g, '<$1 fetchpriority="low"'),
  },
});

export default defineConfig(({ isSsrBuild }) => ({
  base: '/app/',
  plugins: [
    react(),
    ...(isSsrBuild ? [] : [prerender(), lowPriorityJs()]),
    // PK-08: installable and offline. Registration is an external script (no inline script, CSP).
    ...(isSsrBuild ? [] : [VitePWA({
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
        // Syntax grammars (70 lazy chunks) are cached when first used, not at install.
        globIgnores: ['**/assets/lang-*.js'],
        navigateFallback: '/app/index.html',
        // Grammars are large; cache each the first time its language is used.
        runtimeCaching: [
          { urlPattern: /\.wasm$/, handler: 'CacheFirst', options: { cacheName: 'specdiff-wasm', expiration: { maxEntries: 10 } } },
          { urlPattern: /\/assets\/lang-[^/]+\.js$/, handler: 'CacheFirst', options: { cacheName: 'specdiff-grammars', expiration: { maxEntries: 80 } } },
        ],
      },
    })]),
  ],
  resolve: { alias: [{ find: /^decode-named-character-reference$/, replacement: decodeEntities }] },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Name Shiki grammar chunks so the service worker can leave them out of the precache.
        chunkFileNames: (c) => (c.moduleIds.some((id) => /@shikijs[+/]langs|[\\/]langs[\\/][^\\/]+\.mjs$/.test(id)) ? 'assets/lang-[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
}));
