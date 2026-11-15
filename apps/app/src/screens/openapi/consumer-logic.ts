// OA-20 SDK impact (Beta) and OA-22 "changes that affect me". Pure helpers.
import type { Change } from '@specdiff/core';
import { matchHar, type Operation } from '@specdiff/core/har';

export type Lang = 'ts' | 'python' | 'java' | 'go';
const VERBS = ['create', 'list', 'get', 'retrieve', 'update', 'delete', 'cancel', 'search', 'replace', 'patch', 'remove', 'add', 'set'];
const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
const camel = (w: string[]) => w.map((x, i) => (i ? x[0]!.toUpperCase() + x.slice(1) : x)).join('');
const pascal = (w: string[]) => w.map((x) => x[0]!.toUpperCase() + x.slice(1)).join('');
const snake = (w: string[]) => w.join('_');

/** Resource and method of an operation, from its operationId (createPayment → payments.create) or its path. */
export function sdkName(op: { method: string; path: string; operationId?: string | undefined }): { resource: string[]; method: string[] } {
  const segs = op.path.split('/').filter((s) => s && !s.startsWith('{') && !/^v\d+$/.test(s));
  const resource = words(segs[0] ?? 'api');
  if (op.operationId) {
    const w = words(op.operationId);
    const verb = VERBS.includes(w[0]!) ? [w[0]!] : w.slice(0, 1);
    return { resource, method: verb };
  }
  const byMethod: Record<string, string> = { GET: op.path.trim().endsWith('}') ? 'get' : 'list', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
  return { resource, method: [byMethod[op.method.toUpperCase()] ?? op.method.toLowerCase()] };
}

const tail = (c: Change) => c.path.split(' › ').slice(1).map((s) => s.replace(/^(query|header|path|cookie) /, '')).filter((s) => s !== 'requestBody' && !/^\d{3}$/.test(s));

export function sdkCall(c: Change, lang: Lang): string {
  if (c.sharedSchema || c.sourceBlock?.startsWith('components.schemas.')) {
    const schema = c.sharedSchema?.name ?? c.sourceBlock!.slice('components.schemas.'.length);
    const props = c.path.split(' › ').slice(1);
    if (!props.length) return lang === 'python' ? schema : schema;
    const obj = words(schema);
    if (lang === 'java') return `${camel(obj)}.${props.map((p) => `get${pascal(words(p))}()`).join('.')}`;
    if (lang === 'go') return `${camel(obj)}.${props.map((p) => pascal(words(p))).join('.')}`;
    if (lang === 'python') return `${snake(obj)}.${props.map((p) => snake(words(p))).join('.')}`;
    return `${camel(obj)}.${props.map((p) => camel(words(p))).join('.')}`;
  }
  if (!c.operation) return c.path;
  const { resource, method } = sdkName(c.operation);
  const arg = tail(c)[0];
  // Endpoint-level changes take the path parameters: refunds.cancel(id) (A05-SdkImpact).
  const params = arg ? [] : [...c.operation.path.matchAll(/\{([^}]+)\}/g)].map((m) => words(m[1]!));
  const plain = (f: (w: string[]) => string) => params.map(f).join(', ');
  const fmt = {
    ts: () => `${camel(resource)}.${camel(method)}(${arg ? `{ ${camel(words(arg))} }` : plain(camel)})`,
    python: () => `client.${snake(resource)}.${snake(method)}(${arg ? `${snake(words(arg))}=…` : plain(snake)})`,
    java: () => `client.${camel(resource)}().${camel(method)}(${arg ? `${camel(words(arg))}` : plain(camel)})`,
    go: () => `client.${pascal(resource)}.${pascal(method)}(ctx${arg ? `, ${camel(words(arg))}` : params.length ? `, ${plain(camel)}` : ''})`,
  };
  return fmt[lang]();
}

export const opKey = (o: { method: string; path: string }) => `${o.method.toUpperCase()} ${o.path}`;

export function operationsOf(spec: unknown): { ops: Operation[]; servers: string[] } {
  const s = spec as { paths?: Record<string, Record<string, { operationId?: string }>>; servers?: Array<{ url: string }>; host?: string; basePath?: string; schemes?: string[] };
  const ops: Operation[] = [];
  for (const [path, item] of Object.entries(s?.paths ?? {})) for (const m of ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace', 'query']) {
    const op = item?.[m];
    if (op) ops.push({ method: m.toUpperCase(), path, ...(op.operationId ? { operationId: op.operationId } : {}) });
  }
  const servers = s?.servers?.map((x) => x.url) ?? (s?.host ? [`${s.schemes?.[0] ?? 'https'}://${s.host}${s.basePath ?? ''}`] : []);
  return { ops, servers };
}

export interface AffectsMe { source: string; keys: string[]; calls: Record<string, number>; failing: Array<{ change: Change; count: number; reason: string }> }

/** HAR → used operations, call counts, and requests that would fail on the new version. */
export function fromHar(name: string, har: unknown, beforeSpec: unknown, changes: Change[]): AffectsMe {
  const { ops, servers } = operationsOf(beforeSpec);
  const r = matchHar(har, ops, servers);
  const calls = Object.fromEntries(r.matches.map((m) => [m.operationKey, m.calls]));
  const failing: AffectsMe['failing'] = [];
  for (const c of changes) {
    if (!c.operation) continue;
    const m = r.matches.find((x) => x.operationKey === opKey(c.operation!));
    if (!m) continue;
    if (c.ruleId === 'endpoint-removed') failing.push({ change: c, count: m.calls, reason: `${m.calls} calls to ${m.operationKey}, which is removed` });
    const over = overBound(c, m.requests);
    if (over) failing.push({ change: c, count: over.count, reason: `${over.count} calls with ${over.param} ${over.dir} ${over.limit}` });
  }
  return { source: name, keys: Object.keys(calls).sort(), calls, failing };
}

const NUMERIC_BOUNDS = ['maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'maxLength', 'minLength'] as const;
type Bound = (typeof NUMERIC_BOUNDS)[number];

/**
 * Recorded calls that break a tightened query bound. The param name comes from the change's path
 * ("GET /v1/payments › query limit › maximum"); the bound and its new value from `after`
 * (`{ maximum: 50 }` in real reports; a bare number is accepted too).
 */
export function overBound(c: Change, requests: Array<{ url: string }>): { count: number; param: string; dir: 'above' | 'below'; limit: number } | null {
  if (c.ruleId !== 'request-param-constraint-tightened') return null;
  const segs = c.path.split(' › ');
  const param = segs.find((s) => s.startsWith('query '))?.slice('query '.length);
  if (!param) return null;
  const after = c.after;
  const bound = (NUMERIC_BOUNDS as readonly string[]).includes(segs.at(-1)!)
    ? (segs.at(-1) as Bound)
    : after && typeof after === 'object' ? (Object.keys(after).find((k) => (NUMERIC_BOUNDS as readonly string[]).includes(k)) as Bound | undefined) : undefined;
  if (!bound) return null;
  const raw = typeof after === 'number' ? after : after && typeof after === 'object' ? (after as Record<string, unknown>)[bound] : undefined;
  if (typeof raw !== 'number') return null;
  const lower = bound === 'minimum' || bound === 'exclusiveMinimum' || bound === 'minLength';
  const count = requests.filter((q) => {
    let v: string | null;
    try { v = new URL(q.url).searchParams.get(param); } catch { return false; }
    if (v === null) return false;
    const n = bound === 'maxLength' || bound === 'minLength' ? v.length : Number(v);
    if (Number.isNaN(n)) return false;
    if (bound === 'exclusiveMaximum') return n >= raw;
    if (bound === 'exclusiveMinimum') return n <= raw;
    return lower ? n < raw : n > raw;
  }).length;
  return count ? { count, param, dir: lower ? 'below' : 'above', limit: raw } : null;
}

/**
 * The endpoints in `keys` that a change touches. A shared-schema change touches every endpoint that
 * uses the schema; its `operation` is only the first of them, so it must not decide the row's path.
 */
export function affectedEndpoints(c: Change, keys: string[], usagesToo = true): string[] {
  const own = c.operation ? [opKey(c.operation)] : [];
  const all = c.sharedSchema && usagesToo ? [...new Set([...c.sharedSchema.usages, ...own])] : own;
  return all.filter((k) => keys.includes(k)).sort();
}

export function affects(c: Change, keys: string[], usagesToo = true): boolean {
  return affectedEndpoints(c, keys, usagesToo).length > 0;
}

const SEV_ORDER = ['breaking', 'possibly', 'safe', 'docs'];
export interface AffectsRow { change: Change; endpoint: string; endpoints: string[]; calls: number | undefined }

/** Rows of the "Changes that affect me" table (A05-ConsumerFilter): one per change and matched endpoint, no docs-only, breaking first. */
export function affectsRows(changes: Change[], keys: string[], calls: Record<string, number> = {}): AffectsRow[] {
  const rows: AffectsRow[] = [];
  for (const c of changes) {
    if ((c.severity ?? 'docs') === 'docs') continue;
    const eps = affectedEndpoints(c, keys);
    if (!eps.length) continue;
    const n = eps.reduce<number | undefined>((sum, k) => (calls[k] === undefined ? sum : (sum ?? 0) + calls[k]), undefined);
    rows.push({ change: c, endpoint: eps[0]!, endpoints: eps, calls: n });
  }
  return rows.sort((a, b) => SEV_ORDER.indexOf(a.change.severity ?? 'docs') - SEV_ORDER.indexOf(b.change.severity ?? 'docs'));
}
