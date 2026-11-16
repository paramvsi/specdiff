/// <reference types="node" />
import { compareOpenApi, parseDocument, rules, type Change, type ConfigInput } from '@specdiff/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeTitleText, codeSegments, fixChangelogLine, refContext, TITLES } from './titles';

const ROOT = join(__dirname, '../../../../../fixtures');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every change the fixtures produce, plus the expected-file rows (rules that only show up there). */
function fixtureChanges(): Change[] {
  const out: Change[] = [];
  for (const id of readdirSync(join(ROOT, 'rules')).sort()) {
    for (const f of readdirSync(join(ROOT, 'rules', id)).filter((x) => /^expected(\.\d+)?\.json$/.test(x))) {
      const sfx = f.slice('expected'.length, -'.json'.length);
      const exp = JSON.parse(read(`rules/${id}/${f}`)) as { config?: ConfigInput; today?: string; changes: Array<Pick<Change, 'ruleId' | 'path' | 'kind'>> };
      const b = `rules/${id}/before${sfx}.yaml`;
      const a = `rules/${id}/after${sfx}.yaml`;
      if (existsSync(join(ROOT, b)) && existsSync(join(ROOT, a))) {
        const r = compareOpenApi({ name: 'before.yaml', content: read(b) }, { name: 'after.yaml', content: read(a) }, exp.config, exp.today ? { today: exp.today } : {});
        out.push(...r.changes);
      }
      for (const e of exp.changes) out.push({ id: 'x', fingerprint: 'x', mode: 'openapi', location: {}, ...e } as Change);
    }
  }
  return out;
}

describe('change titles', () => {
  const all = fixtureChanges();

  it('has a title function for every rule id in the catalogue', () => {
    expect(rules.length).toBe(92);
    expect(rules.map((r) => r.id).filter((id) => !TITLES[id])).toEqual([]);
  });

  it.each(rules.map((r) => r.id))('%s → a title without backticks or ‹', (id) => {
    const own = all.filter((c) => c.ruleId === id);
    // Rules reported only inside other rules (contained, version-check) still get a title.
    const cases = own.length ? own : [{ id: 'x', fingerprint: 'x', mode: 'openapi', kind: 'changed', path: 'GET /a', location: {}, ruleId: id } as Change];
    for (const c of cases) {
      const title = changeTitleText(c);
      expect(title.length).toBeGreaterThan(3);
      expect(title).not.toMatch(/[`‹›]/);
      expect(title).not.toMatch(/undefined|\[object/);
    }
  });

  it('matches the designed copy on the payments sample', () => {
    const before = read('samples/payments-v1.yaml');
    const after = read('samples/payments-v2.yaml');
    const r = compareOpenApi({ name: 'payments-v1.yaml', content: before }, { name: 'payments-v2.yaml', content: after });
    const ctx = refContext(parseDocument(after, 'payments-v2.yaml').value);
    const titles = r.changes.filter((c) => c.severity === 'breaking' || c.severity === 'possibly').map((c) => changeTitleText(c, ctx));
    expect(titles.sort()).toEqual([
      'Endpoint removed without deprecation',
      'Query limit maximum lowered from 100 to 50',
      'Request field currency is now required',
      'Response enum status gained disputed',
      'Response field card.last4 removed',
    ]);
  });

  it('turns backticks into code segments', () => {
    expect(codeSegments('Make `x` optional')).toEqual([{ text: 'Make ' }, { text: 'x', code: true }, { text: ' optional' }]);
  });

  it('says a schema-level changelog line once', () => {
    const after = read('samples/payments-v2.yaml');
    const r = compareOpenApi({ name: 'v1.yaml', content: read('samples/payments-v1.yaml') }, { name: 'v2.yaml', content: after });
    const c = r.changes.find((x) => x.ruleId === 'response-property-enum-value-added')!;
    // The line core wrote for this schema-level change at the time of the fix (it may improve; the fix still holds).
    const garbled = '`PaymentStatus` in `PaymentStatus` responses can now be `disputed`.';
    expect(fixChangelogLine(garbled, c, parseDocument(after, 'v2.yaml').value)).toBe('Payment `status` can now be `disputed`.');
    expect(fixChangelogLine('Added `x`.', c, parseDocument(after, 'v2.yaml').value)).toBe('Added `x`.');
  });
});

it('a body schema keeps its own field names; a nested one gets its property prefix', () => {
  const after = read('samples/payments-v2.yaml');
  const r = compareOpenApi({ name: 'v1.yaml', content: read('samples/payments-v1.yaml') }, { name: 'v2.yaml', content: after });
  const ctx = refContext(parseDocument(after, 'v2.yaml').value);
  const t = (path: string) => changeTitleText(r.changes.find((c) => c.path === path && c.ruleId === 'response-property-added')!, ctx);
  expect(t('components.schemas.Payment › metadata')).toBe('Response field metadata added');
  expect(t('components.schemas.Card › fingerprint')).toBe('Response field card.fingerprint added');
});
