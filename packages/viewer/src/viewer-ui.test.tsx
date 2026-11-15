import type { Change, Report } from '@specdiff/core';
import { matchHar } from '@specdiff/core/har';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checklist, filterByEndpoints, indexChanges } from './change-index';
import { buildModel } from './model';
import { authStorageKey, checkSchema, newerOnlyIssues, requestIssues, saveAuth } from './request';
import type { VersionSet } from './types';
import { Viewer } from './Viewer';

const base = {
  openapi: '3.1.0',
  info: { title: 'Payments API', version: '1.5.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  security: [{ bearer: [] }],
  tags: [{ name: 'Payments' }],
  paths: {
    '/payments': {
      post: {
        tags: ['Payments'], operationId: 'createPayment', summary: 'Create a payment',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInput' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } } },
      },
      get: {
        tags: ['Payments'], operationId: 'listPayments', summary: 'List payments',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    schemas: {
      PaymentInput: { type: 'object', required: ['amount'], properties: { amount: { type: 'integer', example: 1050 }, currency: { type: 'string', example: 'EUR' } } },
      Payment: { type: 'object', required: ['id', 'card'], properties: { id: { type: 'string' }, card: { $ref: '#/components/schemas/Card' } } },
      Card: { type: 'object', properties: { brand: { type: 'string' }, last4: { type: 'string', description: 'Last four digits' } } },
    },
  },
};

const next = structuredClone(base) as typeof base & { paths: Record<string, unknown> };
next.info.version = '2.0.0';
(next.components.schemas.PaymentInput as { required: string[] }).required = ['amount', 'currency'];
(next.paths['/payments'] as { get: { parameters: Array<{ schema: { maximum: number } }> } }).get.parameters[0]!.schema.maximum = 50;
delete (next.components.schemas.Card.properties as Record<string, unknown>).last4;
next.paths['/payouts'] = { post: { tags: ['Payments'], summary: 'Create a payout', responses: { '201': { description: 'Created' } } } };

const change = (c: Partial<Change> & Pick<Change, 'path' | 'kind'>): Change => ({ id: c.path + c.kind, fingerprint: 'f', mode: 'openapi', location: {}, ...c });
const report: Report = {
  changes: [
    change({ kind: 'changed', severity: 'breaking', ruleId: 'request-property-became-required', path: 'POST /payments › requestBody › currency', operation: { method: 'POST', path: '/payments' }, changelogLine: '`POST /payments` now requires `currency`.', explanation: { who: 'Callers', see: '400', avoid: 'Send currency.' } }),
    change({ kind: 'changed', severity: 'breaking', ruleId: 'request-param-constraint-tightened', path: 'GET /payments › query limit › maximum', operation: { method: 'GET', path: '/payments' }, changelogLine: '`limit` is now at most 50.' }),
    change({ kind: 'removed', severity: 'breaking', ruleId: 'response-property-removed', path: 'components.schemas.Card › last4', operation: { method: 'POST', path: '/payments' }, sharedSchema: { name: 'Card', usages: ['POST /payments'], usageCount: 1 }, changelogLine: 'Removed `last4` from `Card` responses.', before: { type: 'string' } }),
    change({ kind: 'added', severity: 'safe', ruleId: 'endpoint-added', path: 'POST /payouts', operation: { method: 'POST', path: '/payouts' }, changelogLine: 'Added `POST /payouts`.' }),
    change({ kind: 'changed', severity: 'docs', ruleId: 'description-changed', path: 'info', changelogLine: 'Updated the description.' }),
  ],
  summary: { breaking: 3, possibly: 0, safe: 1, docs: 1, total: 5, byArea: {} },
} as unknown as Report;

const set: VersionSet = {
  versions: [
    { label: '1.5.0', source: 'git tag v1.5.0', spec: base },
    { label: '2.0.0', source: 'openapi.yaml', spec: next },
  ],
  current: '2.0.0',
  compareWith: '1.5.0',
};

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('badges (VW-08)', () => {
  const idx = indexChanges(report, buildModel(next), buildModel(base));
  it('derives endpoint badges with New over Breaking over Changed', () => {
    expect(Object.fromEntries(idx.ops)).toEqual({ 'POST /payments': 'breaking', 'GET /payments': 'breaking', 'POST /payouts': 'new' });
    // B-2: Breaking counts breaking changes (summary.breaking = 3), not the 2 breaking-badged endpoints.
    expect(idx.counts).toEqual({ breaking: 3, changed: 0, new: 1, deprecated: 0 });
  });
  it('derives field badges and removed fields; docs-only changes get no badge', () => {
    expect(idx.fields.get('body:POST /payments:currency')).toBe('changed');
    expect(idx.fields.get('schema:Card.last4')).toBe('breaking');
    expect(idx.removed.get('schema:Card')?.map((r) => r.name)).toEqual(['last4']);
    expect(idx.schemas.get('Card')).toBe('breaking');
  });
  it('without a report still marks new endpoints from the models', () => {
    const plain = indexChanges(undefined, buildModel(next), buildModel(base));
    expect(Object.fromEntries(plain.ops)).toEqual({ 'POST /payouts': 'new' });
  });
});

describe('response schema check (VW-05)', () => {
  const schema = { $ref: '#/components/schemas/Payment' };
  it('passes a matching body', () => {
    expect(checkSchema(next, schema, { id: 'pay_1', card: { brand: 'visa' } })).toEqual([]);
  });
  it('reports missing required fields and wrong types, nested', () => {
    expect(checkSchema(next, schema, { id: 7, card: { brand: 1 } })).toEqual(['$.id: expected string, got integer', '$.card.brand: expected string, got integer']);
    expect(checkSchema(next, schema, { id: 'x' })).toEqual(['$.card: missing required field']);
  });
});

describe('fails on newer (VW-11)', () => {
  const opNew = buildModel(next).ops.find((o) => o.key === 'GET /payments')!;
  const opOld = buildModel(base).ops.find((o) => o.key === 'GET /payments')!;
  it('flags limit above the new maximum, with a one-click fix', () => {
    const draft = { server: 'https://api.example.com/v1', path: {}, query: { limit: '80' }, headers: {} };
    const only = newerOnlyIssues(requestIssues(next, opNew, draft), requestIssues(base, opOld, draft));
    expect(only).toEqual([{ where: 'query', name: 'limit', message: 'limit must be at most 50', fix: { label: 'Set limit to 50', value: '50' } }]);
  });
});

describe('HAR filter and checklist (VW-10)', () => {
  it('keeps only changes for endpoints seen in the HAR', () => {
    const har = { log: { entries: [{ request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=80' } }, { request: { method: 'GET', url: 'https://other.example.com/x' } }] } };
    const ops = buildModel(next).ops.map((o) => ({ method: o.method, path: o.path }));
    const res = matchHar(har, ops, ['https://api.example.com/v1']);
    expect(res.matches.map((m) => m.operationKey)).toEqual(['GET /payments']);
    const shown = filterByEndpoints(report.changes, new Set(res.matches.map((m) => m.operationKey)));
    expect(shown.map((c) => c.path)).toEqual(['GET /payments › query limit › maximum']);
    expect(checklist(shown).text).toBe('- [ ] limit is now at most 50.');
  });
});

describe('<Viewer>', () => {
  const compare = vi.fn(() => report);

  it('routes to an endpoint from the hash and from the nav', async () => {
    window.location.hash = '#/op/post-payments';
    render(<Viewer versions={set} compare={compare} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Create a payment' })).toBeTruthy();
    await screen.findByText('Changed since 1.5.0');
    const nav = screen.getByRole('navigation', { name: 'API reference' });
    fireEvent.click(within(nav).getByRole('link', { name: /List payments/ }));
    window.location.hash = '#/op/get-payments';
    expect(await screen.findByRole('heading', { level: 1, name: 'List payments' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /List payments/ }).getAttribute('aria-current')).toBe('page');
  });

  it('shows badges on the overview and search results', async () => {
    window.location.hash = '#/search?q=brand';
    render(<Viewer versions={set} compare={compare} />);
    const options = await screen.findAllByRole('option');
    expect(options[0]!.textContent).toContain('brand');
    expect(screen.getByText(/1 result in endpoints/)).toBeTruthy();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#/schema/card'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Card' })).toBeTruthy();
    // Removed field, struck through, with its breaking badge.
    expect(screen.getByText('last4', { selector: 'del' })).toBeTruthy();
  });

  it('keeps the Try it token in memory unless "Remember in this browser" is ticked', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/op/post-payments';
    render(<Viewer versions={set} compare={compare} />);
    await user.click(await screen.findByRole('button', { name: 'Try it' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Authentication' });
    await user.type(within(dialog).getByLabelText('Token'), 'sk_secret');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText(/Bearer token set · kept in this tab only/);
    expect(localStorage.length).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Change' }));
    const again = await screen.findByRole('dialog', { name: 'Authentication' });
    await user.click(within(again).getByRole('checkbox', { name: 'Remember in this browser' }));
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    await screen.findByText(/remembered in this browser/);
    expect(localStorage.getItem(authStorageKey('Payments API'))).toContain('sk_secret');

    // Unticking removes the stored copy.
    saveAuth(authStorageKey('Payments API'), { kind: 'bearer', bearer: 'x' }, false);
    expect(localStorage.length).toBe(0);
  });

  it('sends the request and checks the response schema', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'pay_1' }), { status: 201, statusText: 'Created' }));
    window.location.hash = '#/op/post-payments';
    render(<Viewer versions={{ versions: set.versions, current: '2.0.0' }} compare={compare} />);
    await user.click(await screen.findByRole('button', { name: 'Try it' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/1 difference from the 201 schema in 2.0.0/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/payments', expect.objectContaining({ method: 'POST' }));
  });

  it('warns when the request fails on the newer version and fixes it in one click (VW-11)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    window.location.hash = '#/op/get-payments';
    render(<Viewer versions={set} compare={compare} />);
    await user.click(await screen.findByRole('button', { name: 'Try it' }));
    const limit = screen.getByLabelText('limit');
    await user.clear(limit);
    await user.type(limit, '80');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('This request works on 1.5.0 but fails on 2.0.0')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Set limit to 50' }));
    expect((screen.getByLabelText('limit') as HTMLInputElement).value).toBe('50');
  });

  it('shows CORS guidance when the browser blocks the request (VW-13)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    window.location.hash = '#/op/get-payments';
    render(<Viewer versions={{ versions: set.versions, current: '2.0.0' }} compare={compare} />);
    await user.click(await screen.findByRole('button', { name: 'Try it' }));
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send request' })); });
    expect(await screen.findByText('The browser blocked this request')).toBeTruthy();
    expect(screen.getByText('api.example.com')).toBeTruthy();
  });

  it('renders a clear state for Swagger 2.0', async () => {
    render(<Viewer versions={{ versions: [{ label: '1', source: 'petstore.json', spec: { swagger: '2.0', info: {}, paths: {} } }], current: '1' }} />);
    expect(await screen.findByText(/Swagger 2.0 isn’t supported in the Viewer yet/)).toBeTruthy();
  });
});
