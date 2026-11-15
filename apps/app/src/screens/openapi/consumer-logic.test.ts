import type { Change } from '@specdiff/core';
import { expect, it } from 'vitest';
import { affects, fromHar, sdkCall, sdkName } from './consumer-logic';

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
