/// <reference types="node" />
// B-2: the Viewer's numbers for payments v1.5.0 → v2.0.0 must agree with the Report summary
// (4 breaking) the app and CLI show. V-04: "Pick my endpoints" narrows the change list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareOpenApi, parseDocument } from '@specdiff/core';
import { describe, expect, it } from 'vitest';
import { bySeverity, displayKeyOf, filterByEndpoints, indexChanges } from './change-index';
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
