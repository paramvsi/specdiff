// Prints gzip sizes of the embed build. Budget (CLAUDE.md §6): specdiff-embed.js ≤ 250 KB gzip.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dir = new URL('../dist/', import.meta.url);
let failed = false;
for (const f of readdirSync(dir).filter((x) => /\.(js|css)$/.test(x))) {
  const kb = gzipSync(readFileSync(new URL(f, dir)), { level: 9 }).length / 1024;
  const budget = f === 'specdiff-embed.js' ? 250 : undefined;
  if (budget && kb > budget) failed = true;
  console.log(`${f.padEnd(24)} ${kb.toFixed(1).padStart(7)} KB gzip${budget ? ` (budget ${budget} KB)` : ''}`);
}
process.exit(failed ? 1 : 0);
