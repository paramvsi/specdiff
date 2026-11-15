// App start-up JS budget (docs/04: ≤ 200 KB gzip): the entry script plus every chunk index.html preloads.
// size-limit alone measured only the entry file, which hid preloaded chunks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'apps/app/dist';
const limit = 200 * 1000;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/app\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const sizes = files.map((f) => [f, gzipSync(readFileSync(join(dist, f))).length]);
const total = sizes.reduce((n, [, s]) => n + s, 0);
for (const [f, s] of sizes.sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${(s / 1000).toFixed(1).padStart(6)} kB  ${f}`);
console.log(`App start-up JS: ${(total / 1000).toFixed(1)} kB gzip in ${files.length} files (limit ${limit / 1000} kB)`);
if (total > limit) { console.error('Over budget.'); process.exit(1); }
