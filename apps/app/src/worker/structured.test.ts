// X-02: a minified JSON pair is one line per file; a line diff of that is a word diff of the whole
// document (88 s in the round-2 audit). The raw view pretty-prints minified documents first.
import { Config } from '@specdiff/core';
import { detectMode, detectPair } from '@specdiff/core/detect';
import { expect, it } from 'vitest';
import { compareStructured } from './structured';

function doc(v: number) {
  const items = Array.from({ length: 700 }, (_, i) => ({
    id: `item_${i}`,
    name: v && i % 2 ? `Renamed ${i * 3}` : `Item number ${i}`,
    price: ((i * 37) % 1000) + (v ? (i % 13) + 1 : 0),
    tags: ['alpha', 'beta', i % 3 ? 'gamma' : 'delta'],
    meta: { created: `2026-0${(i % 9) + 1}-01`, owner: `team-${i % 11}` },
  }));
  // The after side also reorders the array, so almost every word of the one-line files differs.
  return JSON.stringify({ version: v, items: v ? items.filter((_, i) => i % 3).concat(items.filter((_, i) => !(i % 3))) : items });
}

it('a minified JSON pair: the raw diff is line-by-line over pretty-printed documents, and fast', async () => {
  const before = doc(0), after = doc(1);
  const req = { before: { name: 'a.json', content: before, size: before.length }, after: { name: 'b.json', content: after, size: after.length }, mode: 'json' as const, config: {} };
  const pair = detectPair(detectMode('a.json', before), detectMode('b.json', after));
  const t0 = performance.now();
  const r = await compareStructured('json', req, Config.parse({}), pair, () => {});
  const ms = performance.now() - t0;
  if ('kind' in r) throw new Error('parse failure');
  expect(r.text.rows.length).toBeGreaterThan(1000);
  expect(r.text.rows[0]!.left!.segs[0]!.text).toBe('{');
  expect(ms).toBeLessThan(2000);
}, 60_000);

it('a formatted pair keeps its own lines in the raw diff', async () => {
  const before = '{\n  "a": 1,\n    "b": 2\n}\n', after = '{\n  "a": 1,\n  "b": 3\n}\n';
  const req = { before: { name: 'a.json', content: before, size: before.length }, after: { name: 'b.json', content: after, size: after.length }, mode: 'json' as const, config: {} };
  const r = await compareStructured('json', req, Config.parse({}), detectPair(detectMode('a.json', before), detectMode('b.json', after)), () => {});
  if ('kind' in r) throw new Error('parse failure');
  expect(r.text.rows.map((x) => x.left?.segs.map((s) => s.text).join(''))).toContain('    "b": 2');
});
