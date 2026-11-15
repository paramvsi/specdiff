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
  const fmt = {
    ts: () => `${camel(resource)}.${camel(method)}(${arg ? `{ ${camel(words(arg))} }` : ''})`,
    python: () => `client.${snake(resource)}.${snake(method)}(${arg ? `${snake(words(arg))}=…` : ''})`,
    java: () => `client.${camel(resource)}().${camel(method)}(${arg ? `${camel(words(arg))}` : ''})`,
    go: () => `client.${pascal(resource)}.${pascal(method)}(ctx${arg ? `, ${camel(words(arg))}` : ''})`,
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
    const bound = /maximum|minimum|maxLength/.exec(c.path)?.[0];
    const param = c.path.split(' › ').find((s) => s.startsWith('query '))?.slice(6);
    if (c.ruleId === 'request-param-constraint-tightened' && param && bound && typeof c.after === 'number') {
      const over = m.requests.filter((q) => {
        const v = new URL(q.url).searchParams.get(param);
        if (v === null) return false;
        const n = bound === 'maxLength' ? v.length : Number(v);
        return bound === 'minimum' ? n < (c.after as number) : n > (c.after as number);
      }).length;
      if (over) failing.push({ change: c, count: over, reason: `${over} calls with ${param} ${bound === 'minimum' ? 'below' : 'above'} ${String(c.after)}` });
    }
  }
  return { source: name, keys: Object.keys(calls).sort(), calls, failing };
}

export function affects(c: Change, keys: string[], usagesToo = true): boolean {
  if (c.operation && keys.includes(opKey(c.operation))) return true;
  return usagesToo && !!c.sharedSchema?.usages.some((u) => keys.includes(u));
}
