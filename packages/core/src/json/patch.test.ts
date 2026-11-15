// A07-JsonExport: the JSON Patch follows the keyed structural diff (moves, removes, adds, replaces),
// not index-by-index replaces, and it still applies exactly (verified with fast-json-patch).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import jsonpatch, { type Operation } from 'fast-json-patch';
import { jsonPatch } from './export';

const apply = (a: unknown, ops: unknown[]) =>
  jsonpatch.applyPatch(jsonpatch.deepClone({ root: a }), (ops as Operation[]).map((op) => ({ ...op, path: '/root' + op.path, ...('from' in op ? { from: '/root' + op.from } : {}) })) as Operation[], true).newDocument.root;

const flag = (key: string, on = true) => ({ key, on, owner: 'payments' });

describe('jsonPatch from the keyed diff', () => {
  it('a keyed item that moved is one move op, not a replace on every shifted item', () => {
    const a = { flags: ['a', 'b', 'c', 'd', 'e'].map((k) => flag(k)) };
    const b = { flags: ['a', 'c', 'd', 'e', 'b'].map((k) => flag(k)) };
    expect(jsonPatch(a, b)).toEqual([{ op: 'move', from: '/flags/1', path: '/flags/4' }]);
  });

  it('removed → remove, added → add, changed field → replace, moved → move', () => {
    const keys = ['search', 'checkout', 'dark', 'pricing', 'cards', 'pay', 'banner', 'refunds', 'payouts', 'disputes', 'invoice', 'fx', 'risk'];
    const a = { flags: keys.map((k) => flag(k, k !== 'checkout')), limits: { maxUpload: '25MB', timeoutMs: 30000 }, rollout: { region: null, stage: 'canary' } };
    const next = keys.filter((k) => k !== 'banner' && k !== 'pricing').map((k) => flag(k));
    next.splice(9, 0, flag('pricing'));
    next.push(flag('fraud'));
    const b = { flags: next, limits: { maxUpload: 26214400, timeoutMs: 45000 }, rollout: { stage: 'canary' } };
    const ops = jsonPatch(a, b);
    expect(ops.map((o) => o.op).sort()).toEqual(['add', 'move', 'remove', 'remove', 'replace', 'replace', 'replace']);
    expect(ops).toContainEqual({ op: 'move', from: '/flags/3', path: '/flags/9' });
    expect(ops).toContainEqual({ op: 'remove', path: '/rollout/region' });
    expect(apply(a, ops)).toEqual(b);
  });

  it('unique scalars that moved are moves too', () => {
    const ops = jsonPatch({ features: ['refunds', 'payouts'] }, { features: ['payouts', 'refunds', 'disputes'] });
    expect(ops).toEqual([
      { op: 'move', from: '/features/0', path: '/features/1' },
      { op: 'add', path: '/features/-', value: 'disputes' },
    ]);
  });

  it('keyed arrays round-trip under random edits (verified with fast-json-patch)', () => {
    const item = fc.record({ id: fc.integer({ min: 0, max: 30 }), v: fc.jsonValue({ maxDepth: 2 }) });
    const arr = fc.uniqueArray(item, { selector: (x) => x.id, maxLength: 12 });
    fc.assert(
      fc.property(arr, arr, fc.jsonValue({ maxDepth: 2 }), (x, y, extra) => {
        fc.pre(!JSON.stringify([x, y, extra]).includes('"__proto__"'));
        const a = { items: x, extra }, b = { items: y, extra: [extra] };
        expect(apply(a, jsonPatch(a, b))).toEqual(b);
      }),
      { numRuns: 400 },
    );
  });

  it('unique scalar arrays round-trip under permutations', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ maxLength: 3 }), { maxLength: 10 }), fc.uniqueArray(fc.string({ maxLength: 3 }), { maxLength: 10 }), (x, y) => {
        expect(apply(x, jsonPatch(x, y))).toEqual(y);
      }),
      { numRuns: 400 },
    );
  });

  it("the app's JSON sample (flags.prod → flags.staging): a move op, and fast-json-patch gives the after file exactly", () => {
    const a = JSON.parse(flagsDoc(false)) as unknown, b = JSON.parse(flagsDoc(true)) as unknown;
    const ops = jsonPatch(a, b);
    expect(ops.filter((o) => o.op === 'move')).toHaveLength(1);
    expect(ops.length).toBeLessThanOrEqual(8);
    expect(apply(a, ops)).toEqual(b);
  });
});

// A copy of the app's flags sample (apps/app/src/lib/samples.ts; apps/app/src/screens/json/exports.test.ts checks
// the real one). Core must not import app files.
const FLAG_KEYS = [
  'search_v2', 'checkout_v2', 'dark_mode', 'new_pricing', 'saved_cards', 'apple_pay', 'beta_banner', 'refunds_ui',
  'payouts_daily', 'disputes_inbox', 'invoice_pdf', 'multi_currency', 'fx_quotes', 'risk_scores', 'card_updater',
  'webhooks_v2', 'audit_log', 'sso_login', 'team_roles', 'api_keys_v2', 'usage_alerts', 'tax_ids', 'receipts_email',
  'onboarding_v3',
];
const sampleFlag = (key: string, i: number) => ({
  key,
  enabled: key === 'checkout_v2' ? false : i % 3 !== 0,
  owner: ['payments', 'growth', 'platform'][i % 3],
  percent: (i * 5) % 100,
  description: `${key.replace(/_/g, ' ')} rollout`,
  since: `2026-0${(i % 9) + 1}-01`,
  ticket: `PAY-${1200 + i}`,
  env: i % 2 ? 'all' : 'prod',
  kind: i % 4 ? 'release' : 'ops',
});
function flagsDoc(staging: boolean): string {
  const flags = FLAG_KEYS.map(sampleFlag);
  const doc: Record<string, unknown> = {
    flags,
    limits: { maxUpload: '25MB', timeoutMs: 30000 },
    rollout: { region: null, percent: 25, stage: 'canary' },
    owners: ['payments', 'growth', 'platform'],
    updatedAt: '2026-11-01T09:00:00Z',
    version: 41,
  };
  if (!staging) return JSON.stringify(doc, null, 2) + '\n';
  const next = flags.filter((f) => f.key !== 'beta_banner' && f.key !== 'new_pricing');
  next.splice(11, 0, flags[3]!); // new_pricing: index 3 → 11
  next.find((f) => f.key === 'checkout_v2')!.enabled = true;
  next.push(sampleFlag('fraud_rules_v3', 24));
  return (
    JSON.stringify(
      {
        ...doc,
        flags: next,
        limits: { maxUpload: 26214400, timeoutMs: 45000 },
        rollout: { percent: 25, stage: 'canary' },
        updatedAt: '2026-11-14T17:30:00Z',
      },
      null,
      2,
    ) + '\n'
  );
}
