import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// CSP forbids inline scripts (docs/04): never inline scripts or styles into HTML.
// No `client:*` directives anywhere: Astro inlines its island runtime as a classic <script>.
// React islands are server-rendered here and hydrated by src/scripts/islands.ts instead.
// Fenced code with title="…" (```json title=".specdiff/decisions.json") renders as the W-02 code card:
// a file-name header with a copy button above the block.
const el = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const copyIcon = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' }, [
  el('rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }),
  el('path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }),
]);
const titledCode = {
  name: 'specdiff-code-title',
  root(root) {
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1];
    if (!title) return;
    root.children = [
      el('div', { className: ['codecard'] }, [
        el('div', { className: ['codecard-head'] }, [
          el('span', {}, [{ type: 'text', value: title }]),
          el('button', { type: 'button', className: ['copy-btn'], ariaLabel: `Copy ${title}`, dataCopy: this.source.replace(/\n$/, '') }, [copyIcon]),
        ]),
        ...root.children,
      ]),
    ];
  },
};

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
      transformers: [titledCode],
    },
  },
});
