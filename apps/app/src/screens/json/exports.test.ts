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
