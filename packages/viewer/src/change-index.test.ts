/// <reference types="node" />
// B-2: the Viewer's numbers for payments v1.5.0 → v2.0.0 must agree with the Report summary
// (4 breaking) the app and CLI show. V-04: "Pick my endpoints" narrows the change list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareOpenApi, parseDocument } from '@specdiff/core';
import { describe, expect, it } from 'vitest';
import { bySeverity, changeLine, plain, checklist, displayKeyOf, fieldNames, filterByEndpoints, indexChanges, shortTitle, summarySentence } from './change-index';
import { buildModel } from './model';

const dir = join(__dirname, '../../../fixtures/samples');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const before = read('payments-v1.yaml');
const after = read('payments-v2.yaml');
const report = compareOpenApi({ name: 'payments-v1.yaml', content: before }, { name: 'payments-v2.yaml', content: after });
const prev = buildModel(parseDocument(before, 'payments-v1.yaml').value);
const cur = buildModel(parseDocument(after, 'payments-v2.yaml').value);

describe('Viewer counts agree with the Report (B-2)', () => {
  it('payments v1.5.0 → v2.0.0: 4 breaking, as in the Report summary', () => {
    expect(report.summary.breaking).toBe(4);
    expect(indexChanges(report, cur, prev).counts.breaking).toBe(report.summary.breaking);
  });
});

describe('filterByEndpoints (V-04)', () => {
  it('keeps only the changes that touch the picked endpoints', () => {
    const picked = new Set(['POST /v1/payments']);
    const got = filterByEndpoints(report.changes, picked);
    expect(got.length).toBeGreaterThan(0);
    expect(got.length).toBeLessThan(report.changes.length);
    for (const c of got) {
      const keys = [c.operation ? `${c.operation.method.toUpperCase()} ${c.operation.path}` : '', ...(c.sharedSchema?.usages ?? [])];
      expect(keys).toContain('POST /v1/payments');
    }
  });
});

describe('V-04 ordering and display', () => {
  it('orders Breaking → Possibly → Safe → Docs only', () => {
    const order = ['breaking', 'possibly', 'safe', 'docs'];
    const sevs = bySeverity(report.changes).map((c) => order.indexOf(c.severity ?? 'docs'));
    expect(sevs).toEqual([...sevs].sort((a, b) => a - b));
    expect(sevs[0]).toBe(0);
  });
  it('shows a shared-schema change under the endpoint the reader picked', () => {
    const last4 = report.changes.find((c) => c.path === 'components.schemas.Card › last4')!;
    expect(displayKeyOf(last4)).toBe('GET /v1/customers/{id}/cards');
    expect(displayKeyOf(last4, new Set(['GET /v1/payments/{id}']))).toBe('GET /v1/payments/{id}');
  });
});

describe('V-04 short titles and the checklist for picked endpoints', () => {
  const names = fieldNames(parseDocument(after, 'payments-v2.yaml').value);
  const picked = new Set(['POST /v1/payments', 'GET /v1/payments', 'GET /v1/payments/{id}', 'POST /v1/refunds', 'GET /v1/refunds/{id}']);
  const shown = filterByEndpoints(report.changes, picked);
  it('titles are short, as in the design', () => {
    const t = (path: string, rule?: string) => shortTitle(report.changes.find((c) => c.path === path && (!rule || c.ruleId === rule))!, names);
    expect(t('POST /v1/payments › requestBody › currency', 'request-property-became-required')).toBe('currency is now required');
    expect(t('components.schemas.Card › last4')).toBe('card.last4 removed');
    expect(t('components.schemas.PaymentStatus', 'response-property-enum-value-added')).toBe('status can be disputed');
    expect(t('components.schemas.Card › fingerprint')).toBe('card.fingerprint added');
    expect(t('GET /v1/payments › query limit › maximum')).toBe('limit maximum 100 → 50');
    expect(t('DELETE /v1/refunds/{id}')).toBe('Endpoint removed');
  });
  it('lists one line per required fix and per check, for the picked endpoints only; counts match', () => {
    const list = checklist(shown, names, picked);
    expect(list.required).toHaveLength(shown.filter((c) => c.severity === 'breaking').length);
    expect(list.text.split('\n')).toEqual([
      '- [ ] Send currency on POST /v1/payments',
      '- [ ] Keep limit within maximum 50',
      '- [ ] Stop reading card.last4',
      '- [ ] Handle status = disputed',
    ]);
  });
});

describe('round 3 copy (V-01, V-02)', () => {
  const names = fieldNames(parseDocument(after, 'payments-v2.yaml').value);
  it('summarises the breaking changes as one prose sentence, then what is new', () => {
    expect(summarySentence(report.changes, cur, names)).toBe(
      'Currency is now required on POST /v1/payments, limit on GET /v1/payments now allows at most 50, DELETE /v1/refunds/{id} was removed, and card.last4 is gone. Payouts are new.',
    );
    expect(summarySentence(report.changes, cur, names, 2)).toMatch(/, and 2 more breaking changes\. Payouts are new\.$/);
    expect(summarySentence([], cur, names)).toBe('');
  });
  it('drops the shared-schema echo: "`PaymentStatus` in `PaymentStatus` responses" names the field once', () => {
    const lines = report.changes.filter((c) => c.path === 'components.schemas.PaymentStatus').map((c) => changeLine(c, names));
    expect(lines).toEqual(['`status` accepts `disputed`.', '`status` in responses can now be `disputed`.']);
    for (const c of report.changes) expect(changeLine(c, names)).not.toMatch(/`([^`]+)` (in|on) `\1`/);
  });
  it('lists each operation once, under its first tag, with a capitalised title', () => {
    expect(cur.tags.map((t) => t.title)).toEqual(['Payments', 'Refunds', 'Customers', 'Payouts']);
    const keys = cur.tags.flatMap((t) => t.ops.map((o) => o.key));
    expect(keys).toHaveLength(new Set(keys).size);
    expect(keys.sort()).toEqual(cur.ops.map((o) => o.key).sort());
  });
});

describe('plain changelog headlines (VW-08, after OUT-01 fencing)', () => {
  it('unwraps code spans of any fence length and decodes escaped text', () => {
    expect(plain('`` GET /p/{id}|x`y `` now requires `q<a>`.')).toBe('GET /p/{id}|x`y now requires q<a>.');
    expect(plain('`limit` maximum lowered from 100 to &lt;5 &amp; more')).toBe('limit maximum lowered from 100 to <5 & more');
    expect(plain('Removed `GET /v1/refunds/{id}`.')).toBe('Removed GET /v1/refunds/{id}.');
  });
});
