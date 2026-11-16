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

it('M-4: "Treat Unicode variants as equal" is on by default and the setting reaches text, Markdown and JSON', async () => {
  const run = async (name: string, a: string, b: string, config: Record<string, unknown>) => {
    const r = await runCompare({ before: { name, content: a, size: a.length }, after: { name, content: b, size: b.length }, mode: 'auto', config }, () => {});
    if ('kind' in r) throw new Error('parse failure');
    return r;
  };
  const off = { unicodeNormalize: false };
  for (const [name, a, b] of [['a.txt', 'café\n', 'café\n'], ['a.md', '# Café\n', '# Café\n']] as const) {
    const on = await run(name, a, b, {}), offR = await run(name, a, b, off);
    const n = (r: Awaited<ReturnType<typeof run>>) => ('markdown' in r ? r.markdown.stats.edited + r.markdown.stats.added : r.text.stats.changed + r.text.stats.added);
    expect([name, n(on), n(offR) > 0]).toEqual([name, 0, true]);
  }
  const j = (r: Awaited<ReturnType<typeof run>>) => ('json' in r ? r.json.changes.length : -1);
  expect([j(await run('a.json', '{"a":"café"}', '{"a":"café"}', {})), j(await run('a.json', '{"a":"café"}', '{"a":"café"}', off))]).toEqual([0, 1]);
});
