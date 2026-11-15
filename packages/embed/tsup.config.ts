// Embed build (PK-02): `dist/specdiff-embed.js` (IIFE, global `Specdiff`) + `dist/specdiff-embed.css`,
// and the lazy `dist/specdiff-compare.js` (core's comparison engine, loaded only with `compareWith`).
// CSS Modules: tsup's CSS plugin loads every .css file with `loader['.css']`, so it is set to esbuild's
// `local-css`. Class names in *.module.css are scoped; tokens.css and fonts.css only use :root,
// [data-theme] and @font-face, which local-css leaves alone (its `.sd-mono` helper is not used here).
// Geist fonts are emitted as files under `dist/fonts/` and referenced relatively from the CSS.
import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  format: ['iife'],
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  dts: false,
  noExternal: [/.*/],
  env: { NODE_ENV: 'production' },
  outExtension: () => ({ js: '.js' }),
  loader: { '.css': 'local-css', '.woff2': 'file', '.woff': 'file' },
  esbuildOptions(o) {
    o.assetNames = 'fonts/[name]-[hash]';
    o.legalComments = 'none';
  },
};

export default defineConfig([
  { ...shared, entry: { 'specdiff-embed': 'src/index.ts' }, globalName: 'Specdiff', clean: true },
  { ...shared, entry: { 'specdiff-compare': 'src/compare.ts' }, clean: false },
]);
