/// <reference types="node" />
// The payments example used by every design (docs/03 "Example data", B-2). The UI is built against
// these exact numbers, so this test pins them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Report } from '../schemas';
import { compareOpenApi } from './build';

const SAMPLES = join(__dirname, '../../../../fixtures/samples');
const read = (f: string) => ({ name: f, content: readFileSync(join(SAMPLES, f), 'utf8') });
const report = compareOpenApi(read('payments-v1.yaml'), read('payments-v2.yaml'), {}, { today: '2026-11-15' });
const find = (ruleId: string) => report.changes.filter((c) => c.ruleId === ruleId);

describe('payments-v1.yaml → payments-v2.yaml', () => {
  it('has 28 changes: 4 breaking, 1 possibly, 14 safe, 9 docs; suggests 2.0.0', () => {
    expect(report.summary).toMatchObject({ breaking: 4, possibly: 1, safe: 14, docs: 9, total: 28 });
    expect(report.versionCheck).toMatchObject({ from: '1.5.0', to: '2.0.0', suggested: '2.0.0', bump: 'major', verdict: 'ok' });
    expect(Report.parse(report)).toEqual(report);
  });

  it('lists the four breaking changes from the designs', () => {
    expect(report.changes.filter((c) => c.severity === 'breaking').map((c) => `${c.ruleId} | ${c.path}`)).toEqual([
      'request-property-became-required | POST /v1/payments › requestBody › currency',
      'request-param-constraint-tightened | GET /v1/payments › query limit › maximum',
      'endpoint-removed | DELETE /v1/refunds/{id}',
      'response-property-removed | components.schemas.Card › last4',
    ]);
    expect(find('request-param-constraint-tightened')[0]).toMatchObject({ before: { maximum: 100 }, after: { maximum: 50 } });
  });

  it('reports Card.last4 once, at the shared schema used by 3 endpoints', () => {
    const [last4, ...rest] = find('response-property-removed');
    expect(rest).toEqual([]);
    expect(last4).toMatchObject({
      sourceBlock: 'components.schemas.Card',
      jsonPath: '$.components.schemas.Card.properties.last4',
      sharedSchema: { name: 'Card', usages: ['GET /v1/customers/{id}/cards', 'GET /v1/payments', 'GET /v1/payments/{id}'], usageCount: 3 },
      direction: 'response',
    });
    expect(last4?.explanation?.who).toContain('last4');
  });

  it('has the possibly-breaking enum value and the safe additions the designs show', () => {
    expect(report.changes.filter((c) => c.severity === 'possibly').map((c) => [c.ruleId, c.path, c.after])).toEqual([
      ['response-property-enum-value-added', 'components.schemas.PaymentStatus', 'disputed'],
    ]);
    expect(find('endpoint-added').map((c) => c.path)).toEqual(['POST /v1/payouts', 'GET /v1/payouts/{id}']);
    expect(find('response-property-added').map((c) => c.path)).toContain('components.schemas.Payment › metadata');
    expect(find('response-property-added').map((c) => c.path)).toContain('components.schemas.Card › fingerprint');
  });

  it('gives every change positions in both files and a changelog line', () => {
    for (const c of report.changes) {
      expect(c.location.before?.file).toBe('payments-v1.yaml');
      expect(c.location.after?.file).toBe('payments-v2.yaml');
      expect(c.changelogLine).toBeTruthy();
    }
    expect(find('request-property-became-required')[0]?.changelogLine).toBe('`POST /v1/payments` now requires `currency`.');
    expect(report.changes.map((c) => c.id)).toEqual(Array.from({ length: 28 }, (_, i) => `c-${String(i + 1).padStart(4, '0')}`));
  });
});
