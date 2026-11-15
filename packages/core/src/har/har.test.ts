import { describe, expect, it } from 'vitest';
import { matchHar, parseOperationList } from './har';

const ops = [
  { method: 'get', path: '/v1/payments', operationId: 'listPayments' },
  { method: 'get', path: '/v1/payments/{id}', operationId: 'getPayment' },
  { method: 'get', path: '/v1/payments/search' },
  { method: 'post', path: '/v1/payments', operationId: 'createPayment' },
];
const har = (urls: Array<[string, string]>) => ({ log: { entries: urls.map(([method, url]) => ({ request: { method, url } })) } });

describe('matchHar', () => {
  it('matches the most specific template and counts calls', () => {
    const r = matchHar(har([
      ['GET', 'https://api.example.com/v1/payments/search?q=x'],
      ['GET', 'https://api.example.com/v1/payments/pay_123'],
      ['GET', 'https://api.example.com/v1/payments/pay_456'],
      ['POST', 'https://api.example.com/v1/payments'],
      ['GET', 'https://other.example.com/v1/payments'],
      ['DELETE', 'https://api.example.com/v1/payments/pay_1'],
    ]), ops, ['https://api.example.com']);
    expect(r.matches.map((m) => [m.operationKey, m.calls])).toEqual([['GET /v1/payments/{id}', 2], ['GET /v1/payments/search', 1], ['POST /v1/payments', 1]]);
    expect(r.ignoredOrigin).toBe(1);
    expect(r.unmatched).toBe(1);
  });
  it('strips the server base path', () => {
    const r = matchHar(har([['GET', 'https://api.example.com/base/v1/payments']]), ops, ['https://api.example.com/base']);
    expect(r.matches[0]!.operationKey).toBe('GET /v1/payments');
  });
  it('rejects non-HAR input', () => {
    expect(() => matchHar({}, ops, [])).toThrow(/not a HAR/);
  });
});

it('parses operationIds and method paths', () => {
  expect(parseOperationList('createPayment\nGET /v1/payments/{id}, nope', ops)).toEqual(['GET /v1/payments/{id}', 'POST /v1/payments']);
});

describe('OA-22 HAR matching edge cases', () => {
  const har = (...urls: string[]) => ({ log: { entries: urls.map((url) => ({ request: { method: 'GET', url } })) } });
  it('a server prefix /v1 does not claim /v10', () => {
    const r = matchHar(har('https://api.x.com/v10/users'), [{ method: 'get', path: '/users' }], ['https://api.x.com/v1']);
    expect(r).toMatchObject({ matches: [], ignoredOrigin: 1 });
  });
  it('matches a parameter inside a segment ({id}.json, {year}-{month})', () => {
    const ops = [{ method: 'get', path: '/files/{id}.json' }, { method: 'get', path: '/reports/{year}-{month}' }];
    const r = matchHar(har('https://a.io/files/7.json', 'https://a.io/reports/2026-11'), ops, []);
    expect(r.matches.map((m) => m.operationKey)).toEqual(['GET /files/{id}.json', 'GET /reports/{year}-{month}']);
  });
  it('prefers /files/{name}.json over /files/{name} for 7.json, whatever the names', () => {
    const r = matchHar(har('https://a.io/files/7.json'), [{ method: 'get', path: '/files/{a}' }, { method: 'get', path: '/files/{z}.json' }], []);
    expect(r.matches.map((m) => m.operationKey)).toEqual(['GET /files/{z}.json']);
  });
  it('a server URL with variables still strips its base path', () => {
    const r = matchHar(har('https://eu.api.x.com/v1/users'), [{ method: 'get', path: '/users' }], ['https://{region}.api.x.com/v1']);
    expect(r.matches.map((m) => m.operationKey)).toEqual(['GET /users']);
  });
});
