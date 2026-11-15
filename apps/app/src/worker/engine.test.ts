import { expect, it } from 'vitest';
import { runCompare } from './engine';
import type { Progress } from './protocol';

it('compares text and reports progress', async () => {
  const steps: Progress[] = [];
  const r = await runCompare({ before: { name: 'a.log', content: 'a\nb\n', size: 4 }, after: { name: 'b.log', content: 'a\nc\n', size: 4 }, mode: 'auto', config: {} }, (p) => steps.push(p));
  expect(r.mode).toBe('text');
  if (r.mode === 'text') expect(r.text.stats.changed).toBe(1);
  expect(steps.map((s) => `${s.step}:${s.state}`)).toEqual(['detect:running', 'detect:done', 'parse:done', 'compare:running', 'compare:done']);
});
