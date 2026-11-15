// Human change titles (A-04, A-05, A-06, O-04): "Request field currency is now required",
// "Query limit maximum lowered from 100 to 50", "Response enum status gained disputed".
// One title per rule family, built from the change's path, before and after. Identifiers are
// `code` segments; they are rendered as <code>, never as literal backticks.
import type { Change } from '@specdiff/core';

export interface Seg {
  text: string;
  code?: boolean;
}

/** Where a shared schema is used: Card → card (Payment.card), PaymentStatus → status. */
export type RefContext = ReadonlyMap<string, string>;

const t = (text: string): Seg => ({ text });
const c = (text: string): Seg => ({ text, code: true });

/** Split Markdown-ish text on backticks: "Make `x` optional" → text, code, text. */
export function codeSegments(s: string): Seg[] {
  const out: Seg[] = [];
  s.split('`').forEach((part, i) => {
    if (!part) return;
    out.push(i % 2 ? c(part) : t(part));
  });
  return out;
}

export const segText = (segs: Seg[]) => segs.map((s) => s.text).join('');

/** Short readable form of a before/after value: {maximum: 50} → 50, ['a','b'] → a, b. */
export function valueText(v: unknown): string {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 1) return valueText(entries[0]![1]);
    const o = v as Record<string, unknown>;
    if (typeof o.type === 'string') return o.type;
    if (typeof o.operationId === 'string') return o.operationId;
    return entries.map(([k, x]) => `${k} ${valueText(x)}`).join(', ');
  }
  return String(v);
}

const BOUNDS = ['maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'maxLength', 'minLength', 'maxItems', 'minItems', 'maxProperties', 'minProperties', 'multipleOf', 'pattern', 'enum', 'format', 'const'];
const BOUND_LABEL: Record<string, string> = {
  maximum: 'maximum', minimum: 'minimum', exclusiveMaximum: 'maximum', exclusiveMinimum: 'minimum',
  maxLength: 'maximum length', minLength: 'minimum length', maxItems: 'maximum items', minItems: 'minimum items',
  maxProperties: 'maximum properties', minProperties: 'minimum properties', multipleOf: 'step', pattern: 'pattern', enum: 'allowed values', format: 'format', const: 'value',
};
const PARAM_IN: Record<string, string> = { query: 'Query', header: 'Header', path: 'Path parameter', cookie: 'Cookie' };
const STRUCTURAL = new Set(['requestBody', 'responses', 'content', 'schema', 'properties', 'items', 'parameters', 'payload', 'itemSchema', 'security']);

function parts(ch: Change) {
  const segs = ch.path.split(' › ');
  const rest = segs.slice(1);
  const paramSeg = rest.find((s) => /^(query|header|path|cookie) /.test(s));
  const param = paramSeg ? { in: paramSeg.split(' ')[0]!, name: paramSeg.slice(paramSeg.indexOf(' ') + 1) } : undefined;
  const last = rest.at(-1);
  const bound = last && BOUNDS.includes(last) ? last : boundOf(ch.before) ?? boundOf(ch.after);
  const statusSeg = rest.find((s) => /^response \S+$/.test(s));
  const status = statusSeg?.slice('response '.length);
  // Field path: the segments after requestBody / the status code / the schema, without media types.
  const fieldSegs = rest.filter((s) => s !== paramSeg && !STRUCTURAL.has(s) && !s.includes('/') && s !== statusSeg && !/^(callback|webhook) /.test(s) && !(s === last && last && BOUNDS.includes(last)));
  const schema = ch.sharedSchema?.name ?? (ch.sourceBlock?.startsWith('components.schemas.') ? ch.sourceBlock.slice('components.schemas.'.length) : undefined);
  return { segs, head: segs[0]!, rest, param, bound, status, fieldSegs, schema, last };
}

function boundOf(v: unknown): string | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const k = Object.keys(v as object).find((x) => BOUNDS.includes(x));
    return k;
  }
  return undefined;
}

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** The field as clients see it: Card › last4 → card.last4; PaymentStatus → status. */
function field(ch: Change, ctx?: RefContext): string {
  const p = parts(ch);
  if (p.schema) {
    // '' marks a schema that is itself a request or response body: its fields need no prefix.
    const prefix = ctx?.get(p.schema) ?? lowerFirst(p.schema);
    return (prefix ? [prefix, ...p.fieldSegs] : p.fieldSegs.length ? p.fieldSegs : [p.schema]).join('.');
  }
  if (p.fieldSegs.length) return p.fieldSegs.join('.');
  if (p.param) return p.param.name;
  return '';
}

function paramLabel(ch: Change, ctx?: RefContext): Seg[] {
  const p = parts(ch);
  if (p.param) return [t(`${PARAM_IN[p.param.in] ?? 'Parameter'} `), c(p.param.name)];
  return [t('Parameter '), c(field(ch, ctx) || target(ch))];
}

/** "maximum lowered from 100 to 50" / "maximum raised from 10 to 50" / "pattern changed". */
function constraint(ch: Change, tightened: boolean): Seg[] {
  const { bound } = parts(ch);
  if (!bound) return [t(tightened ? ' constraint tightened' : ' constraint relaxed')];
  const label = BOUND_LABEL[bound] ?? bound;
  const b = boundValue(ch.before, bound);
  const a = boundValue(ch.after, bound);
  const numeric = typeof a === 'number' || typeof b === 'number';
  if (!numeric) {
    if (a === undefined) return [t(` ${label} removed`)];
    if (b === undefined) return [t(` ${label} added: `), c(valueText(a))];
    return [t(` ${label} changed`)];
  }
  if (b === undefined) return [t(` ${label} set to ${valueText(a)}`)];
  if (a === undefined) return [t(` ${label} removed (was ${valueText(b)})`)];
  const up = Number(a) > Number(b);
  return [t(` ${label} ${up ? 'raised' : 'lowered'} from ${valueText(b)} to ${valueText(a)}`)];
}
function boundValue(v: unknown, bound: string): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) return (v as Record<string, unknown>)[bound];
  return v;
}

const vb = (ch: Change) => (ch.before === undefined ? '' : valueText(ch.before));
const va = (ch: Change) => (ch.after === undefined ? '' : valueText(ch.after));
/** " from A to B", " to B" or nothing, for whatever values the change carries. */
const fromTo = (ch: Change, code = false): Seg[] => {
  const b = vb(ch), a = va(ch);
  const v = (x: string) => (code ? c(x) : t(x));
  if (b && a) return [t(' from '), v(b), t(' to '), v(a)];
  if (a) return [t(' to '), v(a)];
  return [];
};
const opt = (lead: string, v: string): Seg[] => (v ? [t(lead), c(v)] : []);
const target = (ch: Change) => {
  const p = parts(ch);
  const l = p.rest.filter((s) => !STRUCTURAL.has(s)).at(-1) ?? p.head;
  const bare = l.replace(/^(query|header|path|cookie|webhook|callback|response) /, '');
  return bare.startsWith('components.') ? bare.split('.').at(-1)! : bare;
};

type TitleFn = (ch: Change, ctx?: RefContext) => Seg[];
const req = (ch: Change, ctx?: RefContext): Seg[] => (field(ch, ctx) ? [t('Request field '), c(field(ch, ctx))] : [t('Request body')]);
const res = (ch: Change, ctx?: RefContext): Seg[] => {
  if (field(ch, ctx)) return [t('Response field '), c(field(ch, ctx))];
  const s = parts(ch).status;
  return s ? [t('Response '), c(s)] : [t('Response body')];
};
const statusOf = (ch: Change) => parts(ch).status ?? target(ch);

/** Every rule id in the catalogue (packages/core/src/rules/catalogue.ts) has a title here. */
export const TITLES: Record<string, TitleFn> = {
  // Endpoints
  'endpoint-removed': () => [t('Endpoint removed without deprecation')],
  'endpoint-removed-after-deprecation': () => [t('Deprecated endpoint removed')],
  'endpoint-added': () => [t('Endpoint added')],
  'endpoint-deprecated': () => [t('Endpoint deprecated')],
  'operation-id-changed': (ch) => (vb(ch) ? [t('operationId '), c(vb(ch)), t(' renamed'), ...opt(' to ', va(ch))] : [t('operationId renamed'), ...opt(' to ', va(ch))]),
  'path-param-renamed': (ch) => [t('Path parameter renamed'), ...fromTo(ch, true)],
  'tag-changed': (ch) => [t('Tags changed'), ...opt(' to ', va(ch))],
  // Parameters
  'request-param-removed': (ch, x) => [...paramLabel(ch, x), t(' removed')],
  'request-param-added-required': (ch, x) => [t('Required '), ...lowerLead(paramLabel(ch, x)), t(' added')],
  'request-param-added-optional': (ch, x) => [t('Optional '), ...lowerLead(paramLabel(ch, x)), t(' added')],
  'request-param-became-required': (ch, x) => [...paramLabel(ch, x), t(' is now required')],
  'request-param-became-optional': (ch, x) => [...paramLabel(ch, x), t(' is now optional')],
  'request-param-type-changed': (ch, x) => [...paramLabel(ch, x), t(' type changed'), ...fromTo(ch)],
  'request-param-type-widened': (ch, x) => [...paramLabel(ch, x), t(' type widened'), ...opt(' to ', va(ch))],
  'request-param-location-changed': (ch, x) => [t('Parameter '), c(parts(ch).param?.name ?? (field(ch, x) || target(ch))), t(' moved'), ...fromTo(ch)],
  'request-param-enum-value-removed': (ch, x) => [...paramLabel(ch, x), t(' no longer accepts'), ...(vb(ch) ? [t(' '), c(vb(ch))] : [t(' a value')])],
  'request-param-enum-value-added': (ch, x) => [...paramLabel(ch, x), t(' accepts'), ...(va(ch) ? [t(' '), c(va(ch))] : [t(' a new value')])],
  'request-param-constraint-tightened': (ch, x) => [...paramLabel(ch, x), ...constraint(ch, true)],
  'request-param-constraint-relaxed': (ch, x) => [...paramLabel(ch, x), ...constraint(ch, false)],
  'request-param-pattern-changed': (ch, x) => [...paramLabel(ch, x), t(' pattern changed')],
  'request-param-default-changed': (ch, x) => [...paramLabel(ch, x), t(' default changed'), ...fromTo(ch, true)],
  'request-param-nullable-removed': (ch, x) => [...paramLabel(ch, x), t(' no longer accepts null')],
  // Request bodies
  'request-body-became-required': () => [t('Request body is now required')],
  'request-body-content-type-removed': (ch) => [t('Request content type '), c(target(ch)), t(' removed')],
  'request-property-removed': (ch, x) => [...req(ch, x), t(' removed')],
  'request-property-added-required': (ch, x) => [t('Required request field '), c(field(ch, x) || target(ch)), t(' added')],
  'request-property-became-required': (ch, x) => [...req(ch, x), t(' is now required')],
  'request-property-added-optional': (ch, x) => [t('Optional request field '), c(field(ch, x) || target(ch)), t(' added')],
  'request-property-type-changed': (ch, x) => [...req(ch, x), t(' type changed'), ...fromTo(ch)],
  'request-property-enum-value-removed': (ch, x) => [...req(ch, x), t(' no longer accepts'), ...(vb(ch) ? [t(' '), c(vb(ch))] : [t(' a value')])],
  'request-property-nullable-removed': (ch, x) => [...req(ch, x), t(' no longer accepts null')],
  'request-property-constraint-tightened': (ch, x) => [...req(ch, x), ...constraint(ch, true)],
  'request-property-read-only-added': (ch, x) => [...req(ch, x), t(' is now read-only')],
  'request-union-branch-removed': (ch, x) => [...req(ch, x), t(' lost a oneOf/anyOf option')],
  'request-allof-branch-added': (ch, x) => [...req(ch, x), t(' must also match a new allOf part')],
  'request-schema-became-false': (ch, x) => [...req(ch, x), t(' now rejects every value')],
  // Responses
  'response-success-status-removed': (ch) => [t('Response '), c(statusOf(ch)), t(' removed')],
  'response-status-added': (ch) => [t('Response '), c(statusOf(ch)), t(' added')],
  'response-body-schema-removed': (ch) => [t('Response '), c(statusOf(ch)), t(' body removed')],
  'response-property-removed': (ch, x) => [...res(ch, x), t(' removed')],
  'response-optional-property-removed': (ch, x) => [t('Optional response field '), c(field(ch, x) || target(ch)), t(' removed')],
  'response-property-became-optional': (ch, x) => [...res(ch, x), t(' may now be missing')],
  'response-property-type-changed': (ch, x) => [...res(ch, x), t(' type changed'), ...fromTo(ch)],
  'response-property-type-narrowed': (ch, x) => [...res(ch, x), t(' type narrowed'), ...opt(' to ', va(ch))],
  'response-property-nullable-added': (ch, x) => [...res(ch, x), t(' can now be null')],
  'response-property-enum-value-added': (ch, x) => [t('Response enum '), c(field(ch, x) || target(ch)), t(' gained'), ...(va(ch) ? [t(' '), c(va(ch))] : [t(' a value')])],
  'response-union-branch-added': (ch, x) => [...res(ch, x), t(' gained a oneOf/anyOf option')],
  'response-property-added': (ch, x) => [...res(ch, x), t(' added')],
  'response-constraint-removed': (ch, x) => [...res(ch, x), ...constraint(ch, false)],
  'response-content-type-removed': (ch) => [t('Response content type '), c(target(ch)), t(' removed')],
  'response-header-removed': (ch) => [t('Response header '), c(target(ch)), t(' removed')],
  'response-header-schema-changed': (ch) => [t('Response header '), c(target(ch)), t(' type changed')],
  'response-required-became-write-only': (ch, x) => [...res(ch, x), t(' is no longer returned')],
  'response-tuple-changed': (ch, x) => [...res(ch, x), t(' tuple items changed')],
  'response-item-schema-changed': () => [t('Streamed item schema changed')],
  // Shared schemas
  'schema-renamed': (ch) => (vb(ch) ? [t('Schema '), c(vb(ch)), t(' renamed'), ...opt(' to ', va(ch))] : [t('Schema renamed'), ...opt(' to ', va(ch))]),
  'enum-name-changed': (ch, x) => [t('Enum names of '), c(field(ch, x) || target(ch)), t(' changed')],
  'inline-ref-equivalent': (ch, x) => [c(field(ch, x) || target(ch)), t(' now uses a shared schema')],
  // Security
  'security-added-to-open-operation': () => [t('Authentication now required')],
  'security-scheme-added-to-operation': (ch) => (va(ch) ? [t('Security scheme '), c(va(ch)), t(' now required')] : [t('Security scheme added')]),
  'security-scope-added': (ch) => (va(ch) ? [t('OAuth scope '), c(va(ch)), t(' now required')] : [t('OAuth scope added')]),
  'security-requirement-removed': () => [t('Authentication option removed')],
  'security-scheme-transport-changed': (ch) => [t('Security scheme '), c(target(ch)), t(' changed')],
  'security-flow-url-changed': (ch) => [t('OAuth URL of '), c(target(ch)), t(' changed')],
  // Deprecation and versioning
  'sunset-date-moved-earlier': (ch) => [t('Sunset date moved earlier'), ...fromTo(ch)],
  'sunset-date-removed': () => [t('Sunset date removed')],
  'sunset-inside-grace-period': (ch) => [t('Sunset date'), ...(va(ch) ? [t(` ${va(ch)}`)] : []), t(' is inside the grace period')],
  'version-bump-missing': (ch) => [t('Version bump missing'), ...opt(': expected ', va(ch))],
  // Servers, webhooks, other
  'server-url-changed': () => [t('Server URL changed')],
  'webhook-removed': (ch) => [t('Webhook '), c(target(ch)), t(' removed')],
  'webhook-payload-property-removed': (ch, x) => [t('Webhook payload field '), c(field(ch, x) || target(ch)), t(' removed')],
  'callback-changed': (ch) => [t('Callback '), c(target(ch)), t(' changed')],
  'extension-changed': (ch) => [t('Extension '), c(target(ch)), t(' changed')],
  // Descriptions and examples
  'description-changed': (ch, x) => docTitle(ch, x, 'Description'),
  'summary-changed': () => [t('Summary updated')],
  'example-changed': (ch, x) => docTitle(ch, x, 'Example'),
};

function docTitle(ch: Change, ctx: RefContext | undefined, what: string): Seg[] {
  const p = parts(ch);
  if (!p.rest.length && !p.schema) return [t(`${what} updated`)];
  if (p.schema && !p.fieldSegs.length) return [t(`${what} of `), c(p.schema), t(' updated')];
  const f = field(ch, ctx);
  if (!f && p.status) return [t(`${what} of response `), c(p.status), t(' updated')];
  return [t(`${what} of `), c(f || target(ch)), t(' updated')];
}

function lowerLead(segs: Seg[]): Seg[] {
  const [first, ...rest] = segs;
  if (!first || first.code) return segs;
  return [{ ...first, text: lowerFirst(first.text) }, ...rest];
}

/** The designed title of a change, as segments. */
export function changeTitle(ch: Change, ctx?: RefContext): Seg[] {
  const fn = ch.ruleId ? TITLES[ch.ruleId] : undefined;
  if (fn) return merge(fn(ch, ctx));
  const what = ch.kind === 'added' ? 'added' : ch.kind === 'removed' ? 'removed' : 'changed';
  return [c(target(ch)), t(` ${what}`)];
}
export const changeTitleText = (ch: Change, ctx?: RefContext) => segText(changeTitle(ch, ctx));

function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const prev = out.at(-1);
    if (prev && !prev.code && !s.code) prev.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Where each shared schema is used, by property or parameter name: Card → card, PaymentStatus → status. */
export function refContext(spec: unknown): RefContext {
  const m = new Map<string, string>();
  const s = spec as { components?: { schemas?: Record<string, unknown>; parameters?: Record<string, unknown> }; paths?: Record<string, unknown> };
  const refName = (x: unknown): string | undefined => {
    if (!x || typeof x !== 'object') return undefined;
    const o = x as { $ref?: unknown; items?: unknown };
    if (typeof o.$ref === 'string') return /#\/components\/schemas\/(.+)$/.exec(o.$ref)?.[1];
    return o.items ? refName(o.items) : undefined;
  };
  for (const schema of Object.values(s?.components?.schemas ?? {})) {
    const props = (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {};
    for (const [name, p] of Object.entries(props)) {
      const r = refName(p);
      if (r && !m.has(r)) m.set(r, name);
    }
  }
  const params: unknown[] = [...Object.values(s?.components?.parameters ?? {})];
  for (const item of Object.values(s?.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const op of Object.values(item as Record<string, unknown>)) {
      const ps = (op as { parameters?: unknown[] } | null)?.parameters;
      if (Array.isArray(ps)) params.push(...ps);
    }
  }
  for (const p of params) {
    const o = p as { name?: string; schema?: unknown } | null;
    const r = refName(o?.schema);
    if (r && o?.name && !m.has(r)) m.set(r, o.name);
  }
  // Schemas sent or returned as a whole body (Payment for GET /v1/payments/{id}) keep their own field names.
  for (const item of Object.values(s?.paths ?? {})) {
    if (!item || typeof item !== 'object') continue;
    for (const op of Object.values(item as Record<string, unknown>)) {
      const o = op as { requestBody?: { content?: Record<string, { schema?: unknown }> }; responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> } | null;
      const bodies = [o?.requestBody, ...Object.values(o?.responses ?? {})];
      for (const b of bodies) for (const media of Object.values(b?.content ?? {})) {
        const sch = media?.schema as { $ref?: unknown } | undefined;
        const r = typeof sch?.$ref === 'string' ? /#\/components\/schemas\/(.+)$/.exec(sch.$ref)?.[1] : undefined;
        if (r) m.set(r, '');
      }
    }
  }
  return m;
}

/** The owner schema of a shared schema's use: PaymentStatus → Payment (Payment.status). */
export function refOwner(spec: unknown, schemaName: string): string | undefined {
  const schemas = (spec as { components?: { schemas?: Record<string, { properties?: Record<string, { $ref?: string }> }> } })?.components?.schemas ?? {};
  for (const [owner, sch] of Object.entries(schemas)) {
    for (const p of Object.values(sch?.properties ?? {})) if (p?.$ref === `#/components/schemas/${schemaName}`) return owner;
  }
  return undefined;
}

/**
 * Changelog lines whose operation is the schema itself read twice ("`PaymentStatus` in `PaymentStatus`
 * responses"). Say it once, as clients see it: "Payment `status` can now be `disputed`."
 */
export function fixChangelogLine(line: string, ch: Change, spec?: unknown): string {
  const p = parts(ch);
  if (!p.schema) return line;
  const dup = new RegExp('`' + p.schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '` (?:in|on) `' + p.schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`(?: responses)?');
  if (!dup.test(line)) return line;
  const ctx = spec ? refContext(spec) : undefined;
  const prop = ctx?.get(p.schema);
  const owner = spec ? refOwner(spec, p.schema) : undefined;
  return line.replace(dup, prop && owner ? `${owner} \`${prop}\`` : `\`${p.schema}\``);
}
