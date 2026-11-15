import { defineConfig } from 'astro/config';

// CSP forbids inline scripts (docs/04): never inline scripts or styles into HTML.
export default defineConfig({
  site: 'https://specdiff.netlify.app',
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
