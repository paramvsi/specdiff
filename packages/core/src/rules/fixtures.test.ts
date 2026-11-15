/// <reference types="node" />
// Rule 5 of CLAUDE.md: every OpenAPI rule ships with fixtures. This one table-driven test runs
// every fixtures/rules/<rule-id>/ pair (before[.N].yaml, after[.N].yaml, expected[.N].json).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareOpenApi } from '../report/build';
import type { ConfigInput } from '../schemas';
import { rules } from './catalogue';

const ROOT = join(__dirname, '../../../../fixtures/rules');

interface Expected {
  config?: ConfigInput;
  today?: string;
  changes: Array<{ ruleId: string; severity: string; direction: string; path: string; kind: string }>;
  versionCheck?: Record<string, string>;
  modelRefs: string[];
}

const dirs = readdirSync(ROOT).sort();
const cases = dirs.flatMap((id) =>
  readdirSync(join(ROOT, id))
    .filter((f) => /^expected(\.\d+)?\.json$/.test(f))
    .sort()
    .map((f) => {
      const suffix = f.slice('expected'.length, -'.json'.length);
      return [`${id}${suffix}`, { id, suffix }] as const;
    }),
);

describe('rule fixtures', () => {
  it('every rule in the catalogue has a fixture directory, and every directory is a rule', () => {
    expect(dirs).toEqual(rules.map((r) => r.id).sort());
  });

  it.each(cases)('%s', (_name, { id, suffix }) => {
    const dir = join(ROOT, id);
    const read = (f: string) => readFileSync(join(dir, f), 'utf8');
    const expected = JSON.parse(read(`expected${suffix}.json`)) as Expected;
    expect(expected.modelRefs).toEqual(expect.any(Array));
    const report = compareOpenApi(
      { name: `before${suffix}.yaml`, content: read(`before${suffix}.yaml`) },
      { name: `after${suffix}.yaml`, content: read(`after${suffix}.yaml`) },
      expected.config,
      expected.today ? { today: expected.today } : {},
    );
    const got = report.changes.map((c) => ({ ruleId: c.ruleId, severity: c.severity, direction: c.direction, path: c.path, kind: c.kind }));
    expect(got).toEqual(expected.changes);
    if (expected.versionCheck) expect(report.versionCheck).toMatchObject(expected.versionCheck);
    // Every change carries positions on both sides.
    for (const c of report.changes) {
      expect(c.location.before?.line).toBeGreaterThan(0);
      expect(c.location.after?.line).toBeGreaterThan(0);
    }
  });

  it('the first pair of every reported rule produces that rule', () => {
    for (const r of rules) {
      const file = join(ROOT, r.id, r.reportedAs === 'not-reported' ? 'expected.2.json' : 'expected.json');
      expect(existsSync(file), file).toBe(true);
      const expected = JSON.parse(readFileSync(file, 'utf8')) as Expected;
      if (r.reportedAs === 'change' || r.reportedAs === 'not-reported') expect(expected.changes.map((c) => c.ruleId), r.id).toContain(r.id);
      else if (r.reportedAs === 'version-check') expect(expected.versionCheck?.verdict).toBe('missing-major');
      else expect(expected.changes.length, r.id).toBeGreaterThan(0);
    }
  });
});
