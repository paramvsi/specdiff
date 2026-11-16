// Try it (VW-05, VW-11, VW-13): request checks, a small response schema check, auth and the CORS proxy.
import { deref, type Json, type Op } from './model';
import { exampleFor, type SampleInput } from './samples';

export interface Draft {
  server: string;
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** JSON text of the request body. */
  body?: string | undefined;
}

export interface Issue {
  where: 'path' | 'query' | 'header' | 'cookie' | 'body';
  name: string;
  message: string;
  /** One-click fix: the value to put in the field. */
  fix?: { label: string; value: string } | undefined;
}

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const types = (s: Json): string[] => {
  const t = s?.type;
  const out: string[] = Array.isArray(t) ? [...t] : t ? [t] : [];
  if (s?.nullable && out.length) out.push('null');
  return out;
};
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Constraint problems for one value against a schema (top level only). */
function valueProblem(spec: Json, schemaNode: Json, value: unknown, name: string): Omit<Issue, 'where' | 'name'> | undefined {
  const s = deref(spec, schemaNode) ?? {};
  if (typeof value === 'number') {
    if (typeof s.maximum === 'number' && value > s.maximum) return { message: `${name} must be at most ${s.maximum}`, fix: { label: `Set ${name} to ${s.maximum}`, value: String(s.maximum) } };
    if (typeof s.minimum === 'number' && value < s.minimum) return { message: `${name} must be at least ${s.minimum}`, fix: { label: `Set ${name} to ${s.minimum}`, value: String(s.minimum) } };
  }
  if (Array.isArray(s.enum) && s.enum.length && !s.enum.some((e: unknown) => show(e) === show(value))) {
    return { message: `${name} must be one of ${s.enum.map(show).join(', ')}`, fix: { label: `Use ${show(s.enum[0])}`, value: show(s.enum[0]) } };
  }
  if (typeof value === 'string') {
    if (typeof s.maxLength === 'number' && value.length > s.maxLength) return { message: `${name} must be at most ${s.maxLength} characters`, fix: { label: `Shorten ${name}`, value: value.slice(0, s.maxLength) } };
    if (typeof s.pattern === 'string') {
      try { if (!new RegExp(s.pattern, 'u').test(value)) return { message: `${name} must match ${s.pattern}` }; } catch { /* unsupported pattern: skip */ }
    }
  }
  return undefined;
}

/** Parameter values are text; read numbers back as numbers for range checks. */
function paramValue(spec: Json, schema: Json, raw: string): unknown {
  const t = types(deref(spec, schema));
  if ((t.includes('integer') || t.includes('number')) && raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** What the server described by `spec` would reject in this request (VW-11). */
export function requestIssues(spec: Json, op: Op, draft: Draft): Issue[] {
  const issues: Issue[] = [];
  const bag = (where: Issue['where']) => (where === 'path' ? draft.path : where === 'query' ? draft.query : draft.headers);
  for (const p of op.params) {
    // Cookies, and an OpenAPI 3.2 `querystring` (the whole query string, one value): Try it does not send them.
    if (p.in === 'cookie' || p.in === 'querystring') continue;
    const raw = bag(p.in)[p.name] ?? '';
    if (raw === '') {
      if (p.required) issues.push({ where: p.in, name: p.name, message: `${p.name} is required`, fix: { label: `Add ${p.name}`, value: show(exampleFor(spec, p.schema) ?? '') } });
      continue;
    }
    const prob = valueProblem(spec, p.schema, paramValue(spec, p.schema, raw), p.name);
    if (prob) issues.push({ where: p.in, name: p.name, ...prob });
  }
  const media = op.requestBody?.content['application/json'] ?? Object.values(op.requestBody?.content ?? {})[0];
  if (op.requestBody && media?.schema) {
    const text = draft.body?.trim() ?? '';
    if (!text) {
      if (op.requestBody.required) issues.push({ where: 'body', name: 'body', message: 'A request body is required' });
      return issues;
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { issues.push({ where: 'body', name: 'body', message: 'The body is not valid JSON' }); return issues; }
    const s = deref(spec, media.schema) ?? {};
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const obj = body as Record<string, unknown>;
      for (const r of s.required ?? []) {
        if (obj[r] === undefined || obj[r] === '') issues.push({ where: 'body', name: r, message: `${r} is required`, fix: { label: `Add ${r}`, value: show(exampleFor(spec, s.properties?.[r]) ?? '') } });
      }
      for (const [k, v] of Object.entries(obj)) {
        const def = s.properties?.[k];
        if (!def) continue;
        const prob = valueProblem(spec, def, v, k);
        if (prob) issues.push({ where: 'body', name: k, ...prob });
      }
    }
  }
  return issues;
}

const sameIssue = (a: Issue, b: Issue) => a.where === b.where && a.name === b.name && a.message === b.message;

/** Issues the newer version has that the older one does not (VW-11). */
export function newerOnlyIssues(newer: Issue[], older: Issue[]): Issue[] {
  return newer.filter((n) => !older.some((o) => sameIssue(n, o)));
}

/** Apply a one-click fix to a draft. Body values are parsed as JSON when they look like JSON. */
export function applyFix(draft: Draft, issue: Issue): Draft {
  if (!issue.fix) return draft;
  const v = issue.fix.value;
  if (issue.where === 'body') {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(draft.body || '{}') as Record<string, unknown>; } catch { /* replace an invalid body */ }
    let value: unknown = v;
    try { value = JSON.parse(v); } catch { /* plain string */ }
    return { ...draft, body: JSON.stringify({ ...body, [issue.name]: value }, null, 2) };
  }
  const key = issue.where === 'path' ? 'path' : issue.where === 'query' ? 'query' : 'headers';
  return { ...draft, [key]: { ...draft[key], [issue.name]: v } };
}

/**
 * A small response check (VW-05): types and required fields, recursively, bounded.
 * Not a full JSON Schema validator; it reports what a reader would notice.
 */
export function checkSchema(spec: Json, schemaNode: Json, value: unknown, path = '$', depth = 0, out: string[] = []): string[] {
  if (out.length >= 20 || depth > 12) return out;
  const s = deref(spec, schemaNode);
  if (!s || typeof s !== 'object') return out;
  if (Array.isArray(s.allOf)) for (const part of s.allOf) checkSchema(spec, part, value, path, depth + 1, out);
  const alts = s.oneOf ?? s.anyOf;
  if (Array.isArray(alts) && alts.length) {
    if (!alts.some((a: Json) => checkSchema(spec, a, value, path, depth + 1, []).length === 0)) out.push(`${path}: does not match any of the allowed shapes`);
    return out;
  }
  const t = types(s);
  const actual = typeOf(value);
  const ok = !t.length || t.includes(actual) || (actual === 'integer' && t.includes('number'));
  if (!ok) { out.push(`${path}: expected ${t.join(' or ')}, got ${actual}`); return out; }
  if (actual === 'object' && value && (s.properties || s.required)) {
    const obj = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (!Object.hasOwn(obj, r)) out.push(`${path}.${r}: missing required field`);
    for (const [k, def] of Object.entries<Json>(s.properties ?? {})) if (Object.hasOwn(obj, k)) checkSchema(spec, def, obj[k], `${path}.${k}`, depth + 1, out);
  }
  if (actual === 'array' && s.items) (value as unknown[]).slice(0, 50).forEach((v, i) => checkSchema(spec, s.items, v, `${path}[${i}]`, depth + 1, out));
  return out;
}

// ---- Auth (VW-05) -----------------------------------------------------------------------------

export type AuthKind = 'apiKey' | 'bearer' | 'basic' | 'oauth2';
export interface AuthState {
  kind: AuthKind;
  apiKey?: { name: string; in: 'header' | 'query' | 'cookie'; value: string };
  bearer?: string;
  basic?: { user: string; pass: string };
  oauth2?: { tokenUrl: string; clientId: string; clientSecret: string; scopes: string[]; token?: string };
}

export const isAuthSet = (a: AuthState | undefined): a is AuthState =>
  !!a && (a.kind === 'apiKey' ? !!a.apiKey?.value : a.kind === 'bearer' ? !!a.bearer : a.kind === 'basic' ? !!a.basic?.user : !!a.oauth2?.token);

export const AUTH_LABEL: Record<AuthKind, string> = { apiKey: 'API key', bearer: 'Bearer token', basic: 'Basic auth', oauth2: 'OAuth2 token' };

export function applyAuth(auth: AuthState | undefined, draft: Draft): Draft {
  if (!isAuthSet(auth)) return draft;
  const headers = { ...draft.headers };
  const query = { ...draft.query };
  if (auth.kind === 'apiKey' && auth.apiKey) {
    if (auth.apiKey.in === 'query') query[auth.apiKey.name] = auth.apiKey.value;
    else if (auth.apiKey.in === 'header') headers[auth.apiKey.name] = auth.apiKey.value;
  } else if (auth.kind === 'bearer') headers.Authorization = `Bearer ${auth.bearer}`;
  else if (auth.kind === 'basic' && auth.basic) headers.Authorization = `Basic ${btoa(`${auth.basic.user}:${auth.basic.pass}`)}`;
  else if (auth.kind === 'oauth2') headers.Authorization = `Bearer ${auth.oauth2?.token}`;
  return { ...draft, headers, query };
}

export const authStorageKey = (apiTitle: string) => `specdiff:viewer:auth:${apiTitle}`;

/** Read remembered credentials. Storage may be blocked: never throws. */
export function loadAuth(key: string): AuthState | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as AuthState) : undefined;
  } catch {
    return undefined;
  }
}

/** Persist only when the user ticked "Remember in this browser"; otherwise remove any earlier copy. */
export function saveAuth(key: string, auth: AuthState | undefined, remember: boolean): void {
  try {
    if (remember && auth) globalThis.localStorage?.setItem(key, JSON.stringify(auth));
    else globalThis.localStorage?.removeItem(key);
  } catch {
    /* storage blocked: credentials stay in memory */
  }
}

/** OAuth2 client credentials grant. */
export async function fetchClientCredentialsToken(o: NonNullable<AuthState['oauth2']>, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'client_credentials', ...(o.scopes.length ? { scope: o.scopes.join(' ') } : {}) });
  const res = await fetchImpl(o.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${o.clientId}:${o.clientSecret}`)}` },
    body,
  });
  if (!res.ok) throw new Error(`The token endpoint answered ${res.status}.`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('The token endpoint did not return an access_token.');
  return json.access_token;
}

// ---- Sending (VW-05, VW-13) -------------------------------------------------------------------

/** Route a URL through a user-supplied CORS proxy. */
export function proxied(url: string, proxy: string | undefined): string {
  const p = proxy?.trim();
  if (!p) return url;
  return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(url)) : p + url;
}

export const toSampleInput = (op: Op, d: Draft): SampleInput => ({ op, server: d.server, path: d.path, query: d.query, headers: d.headers, ...(d.body ? { body: d.body } : {}) });

export interface SendResult {
  status: number;
  statusText: string;
  ms: number;
  size: number;
  headers: Array<[string, string]>;
  text: string;
  json?: unknown;
}

/** `fetch` throws a TypeError when CORS (or the network) blocks the request. */
export class BlockedError extends Error {
  constructor(readonly host: string) {
    super(`The browser blocked the request to ${host}.`);
    this.name = 'BlockedError';
  }
}

export async function send(url: string, method: string, headers: Record<string, string>, body: string | undefined, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetchImpl(url, { method: method.toUpperCase(), headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
  } catch {
    let host = url;
    try { host = new URL(url).host; } catch { /* keep the raw URL */ }
    throw new BlockedError(host);
  }
  const text = await res.text();
  const out: SendResult = { status: res.status, statusText: res.statusText, ms: Math.round(performance.now() - t0), size: new Blob([text]).size, headers: [...res.headers.entries()], text };
  try { out.json = JSON.parse(text); } catch { /* not JSON */ }
  return out;
}
