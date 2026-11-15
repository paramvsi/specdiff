/// <reference types="node" />
import { compareOpenApi, parseDocument, type Change } from '@specdiff/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { affectedEndpoints, affects, affectsRows, fromHar, operationsOf, sdkCall, sdkName } from './consumer-logic';

const ch = (p: Partial<Change>): Change => ({ id: 'c', fingerprint: 'f', mode: 'openapi', kind: 'changed', path: '', location: {}, ...p });

it('names SDK calls from operationIds and schemas', () => {
  expect(sdkName({ method: 'POST', path: '/v1/payments', operationId: 'createPayment' })).toEqual({ resource: ['payments'], method: ['create'] });
  const c = ch({ path: 'POST /v1/payments › requestBody › currency', operation: { method: 'POST', path: '/v1/payments', operationId: 'createPayment' } });
  expect(sdkCall(c, 'ts')).toBe('payments.create({ currency })');
  expect(sdkCall(c, 'python')).toBe('client.payments.create(currency=…)');
  expect(sdkCall(c, 'go')).toBe('client.Payments.Create(ctx, currency)');
  const s = ch({ path: 'components.schemas.Card › last4', sourceBlock: 'components.schemas.Card', sharedSchema: { name: 'Card', usages: [], usageCount: 3 } });
  expect(sdkCall(s, 'java')).toBe('card.getLast4()');
});

it('finds calls and failing requests in a HAR', () => {
  const spec = { servers: [{ url: 'https://api.example.com' }], paths: { '/v1/payments': { get: { operationId: 'listPayments' } }, '/v1/refunds/{id}': { delete: {} } } };
  const har = { log: { entries: [
    { request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=80' } },
    { request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=20' } },
    { request: { method: 'DELETE', url: 'https://api.example.com/v1/refunds/re_1' } },
  ] } };
  const limit = ch({ ruleId: 'request-param-constraint-tightened', path: 'GET /v1/payments › query limit › maximum', after: 50, operation: { method: 'GET', path: '/v1/payments' } });
  const removed = ch({ ruleId: 'endpoint-removed', path: 'DELETE /v1/refunds/{id}', operation: { method: 'DELETE', path: '/v1/refunds/{id}' } });
  const r = fromHar('session.har', har, spec, [limit, removed]);
  expect(r.calls).toEqual({ 'GET /v1/payments': 2, 'DELETE /v1/refunds/{id}': 1 });
  expect(r.failing.map((f) => f.reason)).toEqual(['1 calls with limit above 50', '1 calls to DELETE /v1/refunds/{id}, which is removed']);
  expect(affects(limit, r.keys)).toBe(true);
});

// OA-22 on a REAL report (compareOpenApi on fixtures/samples/payments-v*.yaml), not hand-made changes.
describe('changes that affect me on the payments sample', () => {
  const dir = join(__dirname, '../../../../../fixtures/samples');
  const v1 = readFileSync(join(dir, 'payments-v1.yaml'), 'utf8');
  const v2 = readFileSync(join(dir, 'payments-v2.yaml'), 'utf8');
  const report = compareOpenApi({ name: 'payments-v1.yaml', content: v1 }, { name: 'payments-v2.yaml', content: v2 });
  const spec = parseDocument(v1, 'payments-v1.yaml').value;

  it('flags HAR calls over a tightened query bound (request-param-constraint-tightened)', () => {
    const limit = report.changes.find((c) => c.ruleId === 'request-param-constraint-tightened')!;
    expect(limit.after).toEqual({ maximum: 50 }); // the real shape: an object, not a number
    const har = { log: { entries: [
      { request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=80' } },
      { request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=20' } },
      { request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=100' } },
    ] } };
    const r = fromHar('app.har', har, { ...(spec as object), servers: [{ url: 'https://api.example.com' }] }, report.changes);
    expect(r.failing.map((f) => f.reason)).toEqual(['2 calls with limit above 50']);
  });

  it('lists only rows for the endpoints asked for, shared schemas included', () => {
    const keys = ['GET /v1/payments/{id}'];
    const rows = affectsRows(report.changes, keys);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.endpoints).toEqual(['GET /v1/payments/{id}']);
    expect(rows.some((r) => r.change.path === 'components.schemas.Card › last4')).toBe(true);
    expect(rows.some((r) => r.change.severity === 'docs')).toBe(false);
    // Breaking first, then possibly, then safe.
    const order = rows.map((r) => ['breaking', 'possibly', 'safe'].indexOf(r.change.severity!));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // A change on another endpoint does not show up.
    expect(report.changes.filter((c) => affects(c, keys)).every((c) => affectedEndpoints(c, keys).length === 1)).toBe(true);
    expect(affects(report.changes.find((c) => c.ruleId === 'endpoint-removed')!, keys)).toBe(false);
  });
});

describe('OpenAPI 3.2 operations', () => {
  it('includes QUERY and additionalOperations (LINK) when matching calls', () => {
    const spec = { paths: { '/items': { query: { operationId: 'searchItems' }, additionalOperations: { LINK: { operationId: 'linkItem' } } } } };
    expect(operationsOf(spec).ops).toEqual([
      { method: 'QUERY', path: '/items', operationId: 'searchItems' },
      { method: 'LINK', path: '/items', operationId: 'linkItem' },
    ]);
  });
});
