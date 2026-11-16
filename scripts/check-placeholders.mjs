// M-19: the website build fails if a design placeholder ships: "[Launch date]", "[date]" (any bracketed
// "… date", e.g. "[Beta date]") or any "[UPPER CASE]" bracket (two or more capitals, spaces allowed).
// Usage: node scripts/check-placeholders.mjs <dist dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERN = /\[(?:(?:[A-Za-z]+ )*[Dd]ate|[A-Z][A-Z ]*[A-Z])\]/g;

/** Placeholders in the text, in order. */
export function findPlaceholders(text) {
  return [...text.matchAll(PATTERN)].map((m) => m[0]);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(html|xml|txt|json)$/.test(name)) yield p;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dir = process.argv[2] ?? 'dist';
  const hits = [];
  for (const f of files(dir)) for (const p of findPlaceholders(readFileSync(f, 'utf8'))) hits.push(`${f}: ${p}`);
  if (hits.length) {
    console.error(`Placeholders in the website build (M-19):\n${hits.join('\n')}`);
    process.exit(1);
  }
  console.log(`No placeholders in ${dir}.`);
}
