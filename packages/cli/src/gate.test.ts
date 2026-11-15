import { describe, expect, it } from 'vitest';
import type { Change, Report } from '@specdiff/core';
import { gate, summaryLines } from './gate';

const ch = (fingerprint: string, severity: Change['severity']): Change => ({ id: fingerprint, fingerprint, mode: 'openapi', kind: 'removed', path: `p ${fingerprint}`, location: {}, severity, ruleId: 'endpoint-removed' });
const report = (changes: Change[], verdict: 'ok' | 'missing-major' = 'ok'): Report => ({
  version: 1, generator: { name: 'specdiff', version: '0.0.0' },
  inputs: { before: { name: 'a', size: 1, format: 'yaml' }, after: { name: 'b', size: 1, format: 'yaml' } },
  mode: 'openapi', options: {},
  summary: { breaking: changes.filter((c) => c.severity === 'breaking').length, possibly: changes.filter((c) => c.severity === 'possibly').length, safe: 0, docs: 0, total: changes.length, byArea: {} },
  versionCheck: { suggested: '2.0.0', bump: 'major', verdict, message: verdict === 'ok' ? 'ok' : 'Breaking changes need a major version: 1.5.0 → 1.6.0' },
  changes,
});
const dec = (fp: string, decision: 'accepted' | 'rejected') => ({ version: 1 as const, decisions: { [fp]: { decision, path: 'p', at: '2026-11-15T00:00:00Z' } } });

describe('gate', () => {
  it('fails on breaking and passes once accepted', () => {
    const r = report([ch('a', 'breaking'), ch('b', 'safe')]);
    expect(gate(r, 'breaking').code).toBe(1);
    expect(gate(r, 'breaking', dec('a', 'accepted')).code).toBe(0);
  });
  it('rejected always fails, even with --fail-on none', () => {
    expect(gate(report([ch('b', 'safe')]), 'none', dec('b', 'rejected')).code).toBe(1);
  });
  it('possibly includes possibly breaking', () => {
    const r = report([ch('a', 'possibly')]);
    expect(gate(r, 'breaking').code).toBe(0);
    expect(gate(r, 'possibly').code).toBe(1);
  });
  it('missing version bump and stale decisions', () => {
    const g = gate(report([ch('a', 'breaking')], 'missing-major'), 'missing-version-bump', dec('zzz', 'accepted'));
    expect(g.code).toBe(1);
    expect(g.stale).toEqual(['zzz']);
  });
  it('prints the summary from the design', () => {
    const r = report([ch('a', 'breaking')]);
    const lines = summaryLines(r, 'main', 'working tree', gate(r, 'breaking'), false);
    expect(lines[0]).toBe('Comparing main → working tree…');
    expect(lines[1]).toBe('✖ 1 breaking  ? 0 possibly  + 0 safe  ¶ 0 docs only');
    expect(lines.at(-1)).toBe('Exit code 1 · breaking changes found');
  });
  it('X-08: no changes prints "no change", not a patch bump; warnings are shown', () => {
    const r: Report = { ...report([]), versionCheck: { suggested: '1.5.0', bump: 'none', verdict: 'ok', from: '1.5.0', to: '1.5.0', message: '' }, warnings: ['After: could not resolve $ref x.yaml (from b).'] };
    const lines = summaryLines(r, 'main', 'working tree', gate(r, 'breaking'), false);
    expect(lines).toContain('Suggested version: 1.5.0 (no change)');
    expect(lines).toContain('⚠ After: could not resolve $ref x.yaml (from b).');
  });
});

it('an accepted change does not cover a different change at the same place (OA-21)', async () => {
  const { compareOpenApi } = await import('@specdiff/core');
  const spec = (max: number) => ({ name: 'o.yaml', content: `openapi: 3.1.0\ninfo: {title: T, version: '1'}\npaths:\n  /p:\n    get:\n      parameters:\n        - {name: limit, in: query, schema: {type: integer, maximum: ${max}}}\n      responses: {'200': {description: ok}}\n` });
  const reviewed = compareOpenApi(spec(100), spec(50));
  const fp = reviewed.changes.find((c) => c.severity === 'breaking')!.fingerprint;
  const decisions = { version: 1 as const, decisions: { [fp]: { decision: 'accepted' as const, path: 'limit', at: '2026-11-16T00:00:00Z' } } };
  expect(gate(reviewed, 'breaking', decisions).code).toBe(0);
  // Same parameter, a tighter limit that nobody reviewed: the gate must fail and the old decision is stale.
  const later = compareOpenApi(spec(100), spec(10));
  const g = gate(later, 'breaking', decisions);
  expect(g.code).toBe(1);
  expect(g.stale).toEqual([fp]);
});
