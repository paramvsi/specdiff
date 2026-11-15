import { describe, expect, it } from 'vitest';
import { buildModel, search, typeLabel } from './model';
import { exampleFor, sample } from './samples';

const spec = {
  openapi: '3.1.0', info: { title: 'Payments', version: '2.0.0' }, servers: [{ url: 'https://api.example.com' }],
  tags: [{ name: 'Payments' }],
  paths: {
    '/v1/payments': {
      post: { tags: ['Payments'], operationId: 'createPayment', summary: 'Create a payment', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInput' } } } }, responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } } } },
      get: { tags: ['Payments'], operationId: 'listPayments', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50 } }], responses: { '200': { description: 'OK' } } },
    },
    '/v1/payments/{id}': { parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }], get: { tags: ['Payments'], deprecated: true, 'x-sunset': '2027-01-01', responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } } } } },
  },
  components: { schemas: {
    PaymentInput: { type: 'object', required: ['amount', 'currency'], properties: { amount: { type: 'integer', example: 1200 }, currency: { type: 'string', example: 'AED' } } },
    Payment: { type: 'object', properties: { id: { type: 'string', readOnly: true }, card: { $ref: '#/components/schemas/Card' }, status: { type: ['string', 'null'], enum: ['pending', 'paid'] } } },
    Card: { type: 'object', properties: { last4: { type: 'string', description: 'Last four digits' }, self: { $ref: '#/components/schemas/Card' } } },
  } },
};

describe('buildModel', () => {
  const m = buildModel(spec);
  it('groups by tag, merges path parameters, keeps sunset', () => {
    expect(m.tags.map((t) => [t.name, t.ops.map((o) => o.key)])).toEqual([['Payments', ['GET /v1/payments', 'POST /v1/payments', 'GET /v1/payments/{id}']]]);
    const get = m.ops.find((o) => o.key === 'GET /v1/payments/{id}')!;
    expect(get.params).toEqual([{ name: 'id', in: 'path', required: true, deprecated: false, schema: { type: 'string' } }]);
    expect(get.sunset).toBe('2027-01-01');
    expect(get.slug).toBe('get-v1-payments-id');
  });
  it('lists where each schema is used, through nested and recursive refs', () => {
    expect(m.schemas.find((s) => s.name === 'Card')!.usedIn).toEqual(['GET /v1/payments/{id}', 'POST /v1/payments']);
  });
  it('searches fields, params and response codes', () => {
    expect(search(m, spec, 'last4').map((h) => h.label)).toEqual(['Card.last4']);
    expect(search(m, spec, 'limit')[0]).toMatchObject({ kind: 'parameter', label: 'limit' });
    expect(search(m, spec, '201')[0]).toMatchObject({ kind: 'response' });
  });
  it('labels types', () => {
    expect(typeLabel(spec, spec.components.schemas.Payment.properties.status)).toBe('string | null');
    expect(typeLabel(spec, { type: 'array', items: { $ref: '#/components/schemas/Card' } })).toBe('Card[]');
  });
});

describe('OpenAPI 3.2 operations', () => {
  const spec = {
    openapi: '3.2.0', info: { title: 'T', version: '1' },
    paths: {
      '/items': {
        query: { operationId: 'searchItems', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Q' } } } }, responses: { '200': { description: 'ok' } } },
        additionalOperations: { LINK: { operationId: 'linkItem', responses: { '204': { description: 'linked' } } } },
      },
    },
    components: { schemas: { Q: { type: 'object' } } },
  };
  it('lists QUERY and additionalOperations (LINK) as operations', () => {
    const m = buildModel(spec);
    const ops = m.tags.flatMap((t) => t.ops).map((o) => o.key);
    expect(ops).toEqual(['QUERY /items', 'LINK /items']);
    expect(m.schemas.find((x) => x.name === 'Q')?.usedIn).toEqual(['QUERY /items']);
  });
});

describe('samples', () => {
  const op = buildModel(spec).ops.find((o) => o.key === 'POST /v1/payments')!;
  const body = JSON.stringify(exampleFor(spec, spec.components.schemas.PaymentInput));
  const input = { op, server: 'https://api.example.com', path: {}, query: {}, headers: { Authorization: 'Bearer sk_test' }, body };
  it('builds an example body without readOnly fields and survives cycles', () => {
    expect(JSON.parse(body)).toEqual({ amount: 1200, currency: 'AED' });
    expect(exampleFor(spec, spec.components.schemas.Card)).toEqual({ last4: 'string', self: null });
  });
  it('renders curl, fetch, python and java', () => {
    // One short line each (V-02): POST with a body needs no -X; the body is pretty-printed.
    expect(sample('curl', input)).toBe(`curl https://api.example.com/v1/payments \\\n  -H 'Authorization: Bearer sk_test' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n    "amount": 1200,\n    "currency": "AED"\n  }'`);
    expect(sample('curl', { ...input, op: { ...op, method: 'patch' } })).toContain(`curl https://api.example.com/v1/payments \\\n  -X PATCH \\\n`);
    expect(sample('curl', { ...input, query: { limit: '5', status: 'paid' }, body: undefined as never })).toMatch(/^curl 'https:\/\/api\.example\.com\/v1\/payments\?limit=5&status=paid' \\/);
    expect(sample('javascript', input)).toContain('body: JSON.stringify({"amount":1200,"currency":"AED"})');
    expect(sample('python', input)).toContain('json={"amount":1200,"currency":"AED"}');
    expect(sample('java', input)).toContain('HttpRequest.BodyPublishers.ofString(');
  });
  it('escapes shell quotes', () => {
    expect(sample('curl', { ...input, headers: { X: "it's" }, body: undefined as never })).toContain(`'X: it'\\''s'`);
  });
});
