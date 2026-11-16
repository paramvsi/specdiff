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
  it('python keeps "true"/"null" inside strings and maps the literals (VW-06)', () => {
    const py = sample('python', { ...input, body: JSON.stringify({ note: 'true story, not null', ok: true, gone: null, n: [false] }) });
    expect(py).toContain('"note":"true story, not null"');
    expect(py).toContain('"ok":True');
    expect(py).toContain('"gone":None');
    expect(py).toContain('"n":[False]');
  });
  it('javascript never pastes a non-JSON body as code (VW-06)', () => {
    const js = sample('javascript', { ...input, body: '1); alert(1); (' });
    expect(js).toContain('body: "1); alert(1); ("');
    expect(js).not.toContain('JSON.stringify(1); alert');
  });
  it('escapes shell quotes', () => {
    expect(sample('curl', { ...input, headers: { X: "it's" }, body: undefined as never })).toContain(`'X: it'\\''s'`);
  });
});

describe('unquoted info.version (VW-03)', () => {
  it('puts back the written literal when YAML or JSON read it as a number', async () => {
    const { keepWrittenVersion } = await import('./version');
    expect(keepWrittenVersion({ info: { version: 1.1 } }, 'openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.10\n')).toEqual({ info: { version: '1.10' } });
    expect(keepWrittenVersion({ info: { version: 2 } }, '{"openapi":"3.1.0","info":{"title":"T","version":2.0}}')).toEqual({ info: { version: '2.0' } });
    expect(keepWrittenVersion({ info: { version: '1.10' } }, 'info:\n  version: "1.10"\n')).toEqual({ info: { version: '1.10' } });
  });
});

describe('VW-05 response check', () => {
  it('treats "constructor" and "__proto__" as ordinary field names', async () => {
    const { checkSchema } = await import('./request');
    const schema = { type: 'object', required: ['constructor', '__proto__'], properties: { constructor: { type: 'string' } } };
    expect(checkSchema({}, schema, {})).toEqual(['$.constructor: missing required field', '$.__proto__: missing required field']);
    expect(checkSchema({}, schema, JSON.parse('{"constructor": "x", "__proto__": 1}'))).toEqual([]);
  });
});

describe('VW-01 OpenAPI 3.2 querystring parameters and content-typed parameters', () => {
  const spec = { openapi: '3.2.0', info: { title: 'T', version: '1' }, paths: { '/search': { get: { parameters: [
    { name: 'filter', in: 'querystring', required: true, content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { q: { type: 'string' } } } } } },
    { name: 'sort', in: 'query', content: { 'application/json': { schema: { type: 'string' } } } },
  ], responses: { '200': { description: 'OK' } } } } } };
  it('reads the schema from content, and Try it raises no false issue for the query string', async () => {
    const { requestIssues } = await import('./request');
    const op = buildModel(spec).ops[0]!;
    expect(op.params.map((p) => [p.in, p.name, (p.schema as { type?: string }).type])).toEqual([['querystring', 'filter', 'object'], ['query', 'sort', 'string']]);
    expect(requestIssues(spec, op, { server: '', path: {}, query: {}, headers: {} })).toEqual([]);
    const { opMarkdown } = await import('./fields');
    expect(opMarkdown(spec, buildModel(spec), op, [])).toMatch(/Query parameters[\s\S]*`filter` \(object, required\)/);
  });
});

describe('VW-11 request checks read well at 1', () => {
  it('says "at most 1 character"', async () => {
    const { requestIssues } = await import('./request');
    const spec = { openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: { '/a': { get: { parameters: [{ name: 'c', in: 'query', schema: { type: 'string', maxLength: 1 } }], responses: { '200': { description: 'OK' } } } } } };
    const op = buildModel(spec).ops[0]!;
    expect(requestIssues(spec, op, { server: '', path: {}, query: { c: 'ab' }, headers: {} })[0]?.message).toBe('c must be at most 1 character');
  });
});

describe('VW-01 malformed $ref escapes', () => {
  it('a $ref with a stray % does not stop the model being built', async () => {
    const { refName } = await import('./model');
    expect(refName({ $ref: '#/components/schemas/Price%' })).toBe('Price%');
    expect(refName({ $ref: '#/components/schemas/A%20B' })).toBe('A B');
  });
});
