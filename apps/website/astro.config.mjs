import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// CSP forbids inline scripts (docs/04): never inline scripts or styles into HTML.
// No `client:*` directives anywhere: Astro inlines its island runtime as a classic <script>.
// React islands are server-rendered here and hydrated by src/scripts/islands.ts instead.
// Site URL stays on the Netlify subdomain until the domain is decided (D-5).
export default defineConfig({
  site: 'https://specdiff.netlify.app',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'never', format: 'directory' },
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    react(),
    mdx(),
    sitemap({ filter: (page) => !page.includes('/404') }),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      defaultColor: false,
      wrap: false,
    },
  },
});
