import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// decode-named-character-reference's "browser" build uses `document`, which workers don't have.
// Its exports map has no subpaths, so point at the plain build by absolute path.
const store = join(import.meta.dirname, '../../node_modules/.pnpm');
const pkg = readdirSync(store).find((d) => d.startsWith('decode-named-character-reference@'));
if (!pkg) throw new Error('decode-named-character-reference not found in the pnpm store');
const decodeEntities = join(store, pkg, 'node_modules/decode-named-character-reference/index.js');

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  resolve: { alias: [{ find: /^decode-named-character-reference$/, replacement: decodeEntities }] },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { assetsInlineLimit: 0 },
});
