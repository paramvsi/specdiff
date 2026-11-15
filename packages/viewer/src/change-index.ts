// Change badges (VW-08), per-endpoint history (VW-09) and the upgrade checklist (VW-10), derived
// from core Reports. Pure functions: the Viewer and its tests share them.
import type { Change, Report, Severity } from '@specdiff/core';
import type { ViewerBadgeKind } from '@specdiff/ui';
import type { Model } from './model';

export type BadgeKind = ViewerBadgeKind;

export interface RemovedField {
  name: string;
  change: Change;
}

export interface ChangeIndex {
  /** Endpoint badge by key, e.g. "POST /v1/payments". */
  ops: Map<string, BadgeKind>;
  /** Every change that affects an endpoint (directly or through a shared schema). */
  opChanges: Map<string, Change[]>;
  /** Field badges: `schema:Card.last4`, `body:POST /v1/payments:currency`, `param:GET /v1/payments:query:limit`. */
  fields: Map<string, BadgeKind>;
  /** Changes per field key (same keys as `fields`). */
  fieldChanges: Map<string, Change[]>;
  /** Removed fields per container: `schema:Card` or `body:POST /v1/payments`. */
  removed: Map<string, RemovedField[]>;
  /** Schema badges by schema name. */
  schemas: Map<string, BadgeKind>;
  /** Endpoints present before but gone now. */
  removedOps: Change[];
  /** `breaking` is the Report's breaking-change count (B-2); the others count endpoints by badge. */
  counts: { breaking: number; changed: number; new: number; deprecated: number };
}

const RANK: Record<BadgeKind, number> = { new: 4, breaking: 3, deprecated: 2, changed: 1 };
const stronger = (a: BadgeKind | undefined, b: BadgeKind) => (!a || RANK[b] > RANK[a] ? b : a);

/** "POST /v1/payments" for a change's operation plus every usage of a shared schema. */
export function opKeysOf(c: Change): string[] {
  const keys = new Set<string>();
  if (c.operation) keys.add(`${c.operation.method.toUpperCase()} ${c.operation.path}`);
  for (const u of c.sharedSchema?.usages ?? []) keys.add(u);
  return [...keys];
}

/** Field key for a change's readable path, or undefined when it is not about a field. */
export function fieldKeyOf(c: Change): { key: string; container: string; name: string } | undefined {
  const segs = c.path.split(' › ');
  const head = segs[0] ?? '';
  if (head.startsWith('components.schemas.')) {
    const schema = head.slice('components.schemas.'.length);
    const name = segs[1];
    return name ? { key: `schema:${schema}.${name}`, container: `schema:${schema}`, name } : undefined;
  }
  if (/^[A-Z]+ \//.test(head)) {
    if (segs[1] === 'requestBody' && segs[2]) return { key: `body:${head}:${segs[2]}`, container: `body:${head}`, name: segs[2] };
    const m = /^(query|path|header|cookie) (.+)$/.exec(segs[1] ?? '');
    if (m) return { key: `param:${head}:${m[1]}:${m[2]}`, container: `param:${head}`, name: m[2]! };
  }
  return undefined;
}

function fieldKind(c: Change): BadgeKind | undefined {
  if (c.kind === 'added') return c.severity === 'docs' ? undefined : 'new';
  if (c.kind === 'removed') return 'breaking';
  if (c.severity === 'docs') return undefined;
  return 'changed';
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);

export function indexChanges(report: Report | undefined, current: Model, previous?: Model): ChangeIndex {
  const idx: ChangeIndex = {
    ops: new Map(), opChanges: new Map(), fields: new Map(), fieldChanges: new Map(), removed: new Map(), schemas: new Map(), removedOps: [],
    counts: { breaking: 0, changed: 0, new: 0, deprecated: 0 },
  };
  const currentKeys = new Set(current.ops.map((o) => o.key));
  const prevOps = new Map(previous?.ops.map((o) => [o.key, o]) ?? []);

  for (const c of report?.changes ?? []) {
    for (const k of opKeysOf(c)) push(idx.opChanges, k, c);
    if (c.ruleId === 'endpoint-removed') { idx.removedOps.push(c); continue; }
    const f = fieldKeyOf(c);
    if (f) {
      push(idx.fieldChanges, f.key, c);
      const kind = fieldKind(c);
      if (kind) idx.fields.set(f.key, stronger(idx.fields.get(f.key), kind));
      if (c.kind === 'removed') push(idx.removed, f.container, { name: f.name, change: c });
    }
    const head = c.path.split(' › ')[0] ?? '';
    if (head.startsWith('components.schemas.') && c.severity !== 'docs') {
      const name = head.slice('components.schemas.'.length);
      idx.schemas.set(name, stronger(idx.schemas.get(name), c.severity === 'breaking' ? 'breaking' : 'changed'));
    }
  }

  for (const op of current.ops) {
    let kind: BadgeKind | undefined;
    const changes = idx.opChanges.get(op.key) ?? [];
    if ((previous && !prevOps.has(op.key)) || changes.some((c) => c.ruleId === 'endpoint-added')) kind = 'new';
    else if (changes.some((c) => c.severity === 'breaking')) kind = 'breaking';
    else if (op.deprecated && ((previous && !prevOps.get(op.key)?.deprecated) || changes.some((c) => c.ruleId === 'endpoint-deprecated'))) kind = 'deprecated';
    else if (changes.some((c) => c.severity !== 'docs')) kind = 'changed';
    if (kind) { idx.ops.set(op.key, kind); idx.counts[kind]++; }
  }
  // Endpoints that existed before and are gone are breaking too.
  const removedKeys = new Set(idx.removedOps.flatMap(opKeysOf).filter((k) => !currentKeys.has(k)));
  if (previous) for (const k of prevOps.keys()) if (!currentKeys.has(k)) removedKeys.add(k);
  idx.counts.breaking += removedKeys.size;
  // B-2: "Breaking" is the number of breaking changes, as in the Report summary the app and CLI show.
  // Counting breaking-badged endpoints instead counted a shared-schema change once per endpoint.
  if (report) idx.counts.breaking = report.summary.breaking;
  return idx;
}

/** Inline-code-aware plain text: strips Markdown backticks. */
export const plain = (s: string) => s.replace(/`/g, '');

/** Headline for a change: its changelog line, or a readable fallback. */
export function changeTitle(c: Change): string {
  return plain(c.changelogLine ?? `${c.path} ${c.kind}`);
}

/** What the reader should do. */
export function changeAdvice(c: Change): string {
  if (c.severity === 'docs') return 'No action needed.';
  return c.explanation?.avoid ?? c.explanation?.who ?? '';
}

/** Where shared schemas are used, as clients see them: Card → card (Payment.card), PaymentStatus → status. */
export type FieldNames = ReadonlyMap<string, string>;

/** Property names that point at each component schema (first one wins), from a parsed spec. */
export function fieldNames(spec: unknown): FieldNames {
  const m = new Map<string, string>();
  const schemas = (spec as { components?: { schemas?: Record<string, unknown> } } | null)?.components?.schemas ?? {};
  const refName = (x: unknown): string | undefined => {
    if (!x || typeof x !== 'object') return undefined;
    const o = x as { $ref?: unknown };
    // Direct references only: an array of Payment (PaymentList.data) does not name a Payment.
    return typeof o.$ref === 'string' ? /#\/components\/schemas\/(.+)$/.exec(o.$ref)?.[1] : undefined;
  };
  for (const schema of Object.values(schemas)) {
    for (const [name, p] of Object.entries((schema as { properties?: Record<string, unknown> } | null)?.properties ?? {})) {
      const r = refName(p);
      if (r && !m.has(r)) m.set(r, name);
    }
  }
  return m;
}

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
const BOUNDS = ['maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'maxLength', 'minLength', 'maxItems', 'minItems', 'pattern'];

/** The field a change is about, as client code names it: currency, limit, card.last4, status. */
export function fieldName(c: Change, names?: FieldNames): string {
  const segs = c.path.split(' › ');
  const head = segs[0] ?? '';
  if (head.startsWith('components.schemas.')) {
    const schema = head.slice('components.schemas.'.length);
    const prefix = names?.get(schema) ?? lowerFirst(schema);
    const rest = segs.slice(1).filter((s) => !BOUNDS.includes(s));
    return rest.length ? [prefix, ...rest].join('.') : prefix;
  }
  const rest = segs.slice(1).filter((s) => s !== 'requestBody' && !BOUNDS.includes(s) && !/^response \S+$/.test(s) && !s.includes('/'));
  const last = rest.at(-1);
  return last ? last.replace(/^(query|path|header|cookie) /, '') : '';
}

/** A bound and its value on one side: `{maximum: 50}`, or `50` when the path ends at `› maximum`. */
const boundOn = (c: Change, side: 'before' | 'after'): [string, unknown] | undefined => {
  const v = c[side];
  const last = c.path.split(' › ').at(-1) ?? '';
  if (BOUNDS.includes(last) && v !== undefined && (typeof v !== 'object' || v === null)) return [last, v];
  return bound(v);
};
const bound = (v: unknown): [string, unknown] | undefined => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const k = Object.keys(v).find((x) => BOUNDS.includes(x));
    return k ? [k, (v as Record<string, unknown>)[k]] : undefined;
  }
  return undefined;
};
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/**
 * Short headline for a change in a list that already shows its endpoint (V-04):
 * "currency is now required", "card.last4 removed", "status can be disputed", "Description rewritten".
 * Falls back to the changelog line.
 */
export function shortTitle(c: Change, names?: FieldNames): string {
  const f = fieldName(c, names);
  const r = c.ruleId ?? '';
  const after = text(c.after);
  if (r === 'endpoint-removed' || r === 'endpoint-removed-after-deprecation') return 'Endpoint removed';
  if (r === 'endpoint-added') return 'Endpoint added';
  if (r === 'endpoint-deprecated') return 'Endpoint deprecated';
  if (r === 'description-changed') return 'Description rewritten';
  if (r === 'summary-changed') return 'Summary rewritten';
  if (r === 'example-changed') return 'Example updated';
  if (r === 'tag-changed') return 'Tags changed';
  if (f) {
    if (/became-required|added-required/.test(r)) return `${f} is now required`;
    if (/became-optional/.test(r)) return `${f} is now optional`;
    if (/enum-value-added/.test(r) && after) return r.startsWith('response-') ? `${f} can be ${after}` : `${f} accepts ${after}`;
    if (/enum-value-removed/.test(r)) return `${f} no longer accepts ${text(c.before) || 'a value'}`;
    if (/constraint-(tightened|relaxed)/.test(r)) {
      const [k, a] = boundOn(c, 'after') ?? boundOn(c, 'before') ?? [];
      const b = k ? boundOn(c, 'before')?.[1] : undefined;
      if (k && a !== undefined && b !== undefined) return `${f} ${k} ${text(b)} → ${text(a)}`;
      return `${f} limits ${r.endsWith('tightened') ? 'tightened' : 'relaxed'}`;
    }
    if (c.kind === 'typeChanged' && after) return `${f} is now ${after}`;
    if (c.kind === 'removed') return `${f} removed`;
    if (c.kind === 'added') return `${f} added`;
  }
  return changeTitle(c);
}

/**
 * One short checklist line for a change, written for the client's developer:
 * "Send currency on POST /v1/payments", "Stop reading card.last4", "Handle status = disputed".
 */
export function checklistLine(c: Change, names?: FieldNames, key?: string): string {
  const f = fieldName(c, names);
  const r = c.ruleId ?? '';
  const op = key ?? opKeysOf(c)[0] ?? '';
  const on = op ? ` on ${op}` : '';
  if (r.startsWith('endpoint-removed')) return `Stop calling ${op}`;
  if (f) {
    if (/became-required|added-required/.test(r)) return `Send ${f}${on}`;
    if (r.startsWith('response-') && (c.kind === 'removed' || r === 'response-required-became-write-only')) return `Stop reading ${f}`;
    if (r === 'response-property-became-optional') return `Handle a missing ${f}`;
    if (r === 'response-property-nullable-added') return `Handle ${f} = null`;
    if (/enum-value-added/.test(r) && text(c.after)) return `Handle ${f} = ${text(c.after)}`;
    if (/enum-value-removed/.test(r)) return `Stop sending ${f} = ${text(c.before)}`;
    if (/constraint-tightened/.test(r)) {
      const a = boundOn(c, 'after');
      return a ? `Keep ${f} within ${a[0]} ${text(a[1])}` : `Check what ${f} accepts${on}`;
    }
    if (/nullable-removed/.test(r)) return `Stop sending ${f} = null`;
    if (c.kind === 'typeChanged') return `Handle ${f} as ${text(c.after) || 'its new type'}`;
    if (c.kind === 'removed') return `Stop sending ${f}${on}`;
  }
  return `Check: ${shortTitle(c, names)}${on}`;
}

export interface Checklist {
  required: Change[];
  check: Change[];
  optional: Change[];
  text: string;
}

/**
 * Upgrade checklist (VW-10): breaking = required fix, possibly = to check, safe = optional.
 * The copied list holds one short line per required fix and per thing to check (V-04 design);
 * optional and docs-only changes are counted, not listed. `picked` names the endpoint shown.
 */
export function checklist(changes: Change[], names?: FieldNames, picked?: ReadonlySet<string>): Checklist {
  const by = (s: Severity) => changes.filter((c) => c.severity === s);
  const required = by('breaking');
  const check = by('possibly');
  const optional = by('safe');
  const lines = [...new Set([...required, ...check].map((c) => `- [ ] ${checklistLine(c, names, displayKeyOf(c, picked))}`))];
  return { required, check, optional, text: lines.join('\n') };
}

const SEV_ORDER: Record<Severity, number> = { breaking: 0, possibly: 1, safe: 2, docs: 3 };
/** Breaking → Possibly → Safe → Docs only; stable within a severity (V-04). */
export function bySeverity(changes: Change[]): Change[] {
  return changes.map((c, i) => [c, i] as const).sort(([a, i], [b, j]) => (SEV_ORDER[a.severity ?? 'docs'] - SEV_ORDER[b.severity ?? 'docs']) || i - j).map(([c]) => c);
}

/** The endpoint a change is shown under: the first one the reader picked, else its own. */
export function displayKeyOf(c: Change, picked?: ReadonlySet<string>): string | undefined {
  const keys = opKeysOf(c);
  return (picked && keys.find((k) => picked.has(k))) ?? keys[0];
}

/** Keep the changes that touch one of the chosen endpoints (or are not tied to any endpoint). */
export function filterByEndpoints(changes: Change[], keys: ReadonlySet<string> | undefined): Change[] {
  if (!keys) return changes;
  return changes.filter((c) => {
    const ks = opKeysOf(c);
    return ks.length > 0 && ks.some((k) => keys.has(k));
  });
}

/** Order versions oldest first: numerically when every label is a dotted number, else as given. */
export function chronological<T extends { label: string }>(versions: readonly T[]): T[] {
  const parse = (l: string) => /^v?\d+(\.\d+)*([-+].*)?$/.test(l) ? l.replace(/^v/, '').split(/[-+]/)[0]!.split('.').map(Number) : undefined;
  const parsed = versions.map((v) => parse(v.label));
  if (parsed.some((p) => !p)) return [...versions];
  return versions
    .map((v, i) => ({ v, p: parsed[i]! }))
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.p.length, b.p.length); i++) {
        const d = (a.p[i] ?? 0) - (b.p[i] ?? 0);
        if (d) return d;
      }
      return 0;
    })
    .map((x) => x.v);
}
