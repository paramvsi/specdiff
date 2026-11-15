import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// One entry per subpath export, so the published package matches the workspace one.
const exportsMap = JSON.parse(readFileSync('package.json', 'utf8')).exports as Record<string, string>;
const entry = Object.fromEntries(Object.entries(exportsMap).map(([k, src]) => [k === '.' ? 'index' : k.slice(2).replace(/\//g, '-'), src]));

export default defineConfig({ entry, format: ['esm'], dts: true, clean: true, external: ['web-tree-sitter'] });
