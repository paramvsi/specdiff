import { Config } from '@specdiff/core';
import { diffJson } from '@specdiff/core/json';
import { expect, it } from 'vitest';
import type { JsonResultData } from '../../worker/protocol';
import { applyJsonPatch, jsonExport } from './exports';

const data = (before: unknown, after: unknown): JsonResultData => ({
  diff: diffJson(before, after, Config.parse({}).json),
  changes: [],
  duplicates: { before: [], after: [] },
  before,
  after,
});
const names = { before: 'config.prod.json', after: 'config.next.json' };

it('exports an RFC 6902 patch that turns before into after', () => {
  const before = { region: 'me-central-1', retries: 3, limits: { daily: 50000 }, tags: ['a', 'b'] };
  const after = { region: 'me-central-1', retries: 5, limits: { monthly: 1500000 }, tags: ['a'] };
  const f = jsonExport('patch', data(before, after), names);
  expect(f.name).toBe('config.prod.patch.json');
  expect(JSON.parse(f.content)).toEqual([
    { op: 'remove', path: '/limits/daily' },
    { op: 'add', path: '/limits/monthly', value: 1500000 },
    { op: 'replace', path: '/retries', value: 5 },
    { op: 'remove', path: '/tags/1' },
  ]);
  expect(f.meta).toBe('4 operations');
  expect(f.verified).toBe(true);
  expect(applyJsonPatch(before, JSON.parse(f.content))).toEqual(after);
});

it('flags a lossy merge patch when a value becomes null', () => {
  const f = jsonExport('merge', data({ owner: 'team' }, { owner: null }), names);
  expect(f.lossy).toBe(true);
  expect(JSON.parse(f.content)).toEqual({ owner: null });
});

it('lists JSONPaths and Markdown', () => {
  const d = data({ a: 1 }, { a: 2, b: true });
  expect(jsonExport('paths', d, names).content).toBe('changed\t$.a\nadded\t$.b\n');
  expect(jsonExport('markdown', d, names).content).toContain('# config.prod.json → config.next.json');
});

it('A07-JsonExport: the sample patch follows the keyed diff, with a move, one operation per line', async () => {
  const { samples } = await import('../../lib/samples');
  const s = samples().find((x) => x.id === 'json')!;
  const before = JSON.parse(s.before.content) as unknown, after = JSON.parse(s.after.content) as unknown;
  const f = jsonExport('patch', data(before, after), { before: 'flags.prod.json', after: 'flags.staging.json' });
  const ops = JSON.parse(f.content) as Array<{ op: string; path: string; from?: string }>;
  // 7 structural differences + the ignored `updatedAt`, which a patch must still carry to give the file exactly.
  expect(ops.map((o) => `${o.op} ${o.from ? `${o.from} → ` : ''}${o.path}`)).toEqual([
    'remove /flags/6',
    'move /flags/3 → /flags/11',
    'add /flags/-',
    'replace /flags/1/enabled',
    'replace /limits/maxUpload',
    'replace /limits/timeoutMs',
    'remove /rollout/region',
    'replace /updatedAt',
  ]);
  expect(ops.length).toBeLessThanOrEqual(9);
  expect(ops.some((o) => o.op === 'move')).toBe(true);
  expect(f.meta).toBe(`${ops.length} operations`);
  expect(f.verified).toBe(true);
  expect(f.content.split('\n').filter((l) => l.includes('"op"'))).toHaveLength(ops.length);
  expect(applyJsonPatch(before, ops as never)).toEqual(after);
});

it('A07-JsonExport: the preview shortens a long value ("{ "key": "fraud_rules_v3", … }"); the file stays whole', () => {
  const item = { key: 'fraud_rules_v3', enabled: false, owner: 'payments', percent: 20, description: 'fraud rules v3 rollout', since: '2026-07-01' };
  const f = jsonExport('patch', data({ flags: [] }, { flags: [item] }), names);
  expect(f.preview).toBe('[\n  { "op": "add", "path": "/flags/-", "value": { "key": "fraud_rules_v3", … } }\n]\n');
  expect(JSON.parse(f.content)).toEqual([{ op: 'add', path: '/flags/-', value: item }]);
  // Short values are shown as they are.
  expect(jsonExport('patch', data({ a: 1 }, { a: 2 }), names).preview).toBe(jsonExport('patch', data({ a: 1 }, { a: 2 }), names).content);
});
