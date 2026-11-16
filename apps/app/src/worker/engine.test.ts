import { expect, it } from 'vitest';
import { runCompare } from './engine';
import type { Progress } from './protocol';

it('compares text and reports progress', async () => {
  const steps: Progress[] = [];
  const r = await runCompare(
    {
      before: { name: 'a.log', content: 'a\nb\n', size: 4 },
      after: { name: 'b.log', content: 'a\nc\n', size: 4 },
      mode: 'auto',
      config: {},
    },
    (p) => steps.push(p),
  );
  if ('kind' in r || !('text' in r)) throw new Error('expected a text result');
  expect(r.mode).toBe('text');
  expect(r.text.stats.changed).toBe(1);
  expect(steps.map((s) => `${s.step}:${s.state}`)).toEqual([
    'detect:running',
    'detect:done',
    'parse:done',
    'compare:running',
    'compare:done',
  ]);
});

it('IN-08 forcing OpenAPI on a file without a version labels it "OpenAPI · JSON", no double space', async () => {
  const steps: Progress[] = [];
  await runCompare({ before: { name: 'a.json', content: '{"a":1}', size: 7 }, after: { name: 'b.json', content: '{"a":2}', size: 7 }, mode: 'openapi', config: {} }, (p) => steps.push(p)).catch(() => undefined);
  expect(steps.find((s) => s.step === 'detect' && s.state === 'done')?.detail).toBe('OpenAPI · JSON');
});
