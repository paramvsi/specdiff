// Schema rules: types, nullability (OA-16), enums, constraints, properties, unions, allOf, tuples,
// docs and extensions. Each check is a pure function of the two normalised nodes and the
// direction in the context; findings go to the engine.
import { type Ctx, type Engine, asObj, has, isObj, push } from '../openapi/engine';
import { stableStringify } from '../openapi/hash';
import { type Loc, type LoadedSpec, type Resolved, child } from '../openapi/load';
import type { Severity } from '../schemas';

export interface SNode {
  v: unknown;
  loc: Loc;
  /** After allOf flattening, where each merged property was written. */
  propLocs?: Map<string, Loc>;
}

type Rel = 'same' | 'widened' | 'narrowed' | 'changed';

const DOC_KEYS = new Set(['description', 'title', 'example', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'default', 'externalDocs', '$comment']);
const SEMANTIC_EXTENSIONS = new Set(['x-sunset', 'x-enum-varnames', 'x-enumNames', 'x-enum-descriptions', 'x-nullable']);
const FORMAT_WIDENS: Record<string, string> = { int32: 'int64', float: 'double' };

// ---------------------------------------------------------------- helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const HTTP_DATE = /^[A-Z][a-z]{2}, (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/; // RFC 9110 IMF-fixdate (Sunset header)

/**
 * An `x-sunset` date. Only forms with one meaning are read: an ISO date or date-time (no zone = UTC)
 * and the HTTP date the Sunset header uses. `Date.parse` alone reads "2026-12-01 00:00" and
 * "12/1/2026" in the machine's time zone, so reports would differ between machines (X-13).
 */
export function parseDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  const iso = ISO.exec(s);
  if (iso) {
    const [, y, mo, d, h = '00', mi = '00', sec = '00', zone] = iso;
    const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${sec}${zone ?? 'Z'}`);
    return Number.isNaN(t) ? undefined : new Date(t);
  }
  const http = HTTP_DATE.exec(s);
  const month = http ? MONTHS.indexOf(http[2]!) : -1;
  if (http && month >= 0) return new Date(Date.UTC(+http[3]!, month, +http[1]!, +http[4]!, +http[5]!, +http[6]!));
  return undefined;
}
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Rule 6 of the severity law, for removing something marked deprecated. */
export function removalSeverity(e: Engine, node: unknown, rule: Severity): Severity | null | undefined {
  const o = asObj(node);
  if (o.deprecated !== true) return undefined;
  const sunset = parseDate(o['x-sunset']);
  if (!sunset) return rule === 'breaking' ? 'possibly' : rule;
  return e.opts.today.getTime() < sunset.getTime() ? undefined : null;
}

function isNullSchema(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.type === 'null') return true;
  if (Array.isArray(v.type) && v.type.length === 1 && v.type[0] === 'null') return true;
  return Array.isArray(v.enum) && v.enum.length === 1 && v.enum[0] === null;
}

function branches(spec: LoadedSpec, node: SNode, kw: string): Resolved[] {
  const list = asObj(node.v)[kw];
  if (!Array.isArray(list)) return [];
  return list.map((x, i) => spec.deref(x, child(child(node.loc, kw), String(i))));
}

/** `oneOf: [{type: 'null'}, X]` (with nothing else that matters) is X, nullable. */
function collapseNullable(spec: LoadedSpec, r: Resolved): { v: unknown; loc: Loc } | undefined {
  const s = r.value;
  if (!isObj(s)) return undefined;
  for (const kw of ['oneOf', 'anyOf']) {
    const list = s[kw];
    if (!Array.isArray(list) || list.length < 2) continue;
    const resolved = list.map((x, i) => spec.deref(x, child(child(r.loc, kw), String(i))));
    const rest = resolved.map((x, i) => ({ x, i })).filter(({ x }) => !isNullSchema(x.value));
    if (rest.length !== 1 || rest.length === list.length) continue;
    const others = Object.keys(s).filter((k) => k !== kw && !DOC_KEYS.has(k) && !k.startsWith('x-'));
    if (others.length > 0) continue;
    const idx = rest[0]?.i ?? 0;
    return { v: list[idx], loc: child(child(r.loc, kw), String(idx)) };
  }
  return undefined;
}

function resolveSchema(spec: LoadedSpec, v: unknown, loc: Loc): Resolved & { nullable: boolean } {
  let r = spec.deref(v, loc);
  let nullable = false;
  for (let i = 0; i < 4; i++) {
    const c = collapseNullable(spec, r);
    if (!c) break;
    nullable = true;
    const next = spec.deref(c.v, c.loc);
    r = next.refId !== undefined || r.refId === undefined ? next : { ...next, refId: r.refId, ...(r.refName !== undefined ? { refName: r.refName } : {}) };
  }
  return { ...r, nullable };
}

function isNullable(spec: LoadedSpec, node: SNode): boolean {
  const s = asObj(node.v);
  if (s.nullable === true || s['x-nullable'] === true || s.type === 'null') return true;
  if (Array.isArray(s.type) && s.type.includes('null')) return true;
  if (Array.isArray(s.enum) && s.enum.includes(null)) return true;
  return ['oneOf', 'anyOf'].some((kw) => branches(spec, node, kw).some((b) => isNullSchema(b.value)));
}

function typesOf(s: Record<string, unknown>): string[] {
  const t = s.type;
  let types = typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : [];
  types = types.filter((x) => x !== 'null');
  if (types.length === 0) {
    if (has(s, 'properties') || has(s, 'additionalProperties') || has(s, 'required')) types = ['object'];
    else if (has(s, 'items') || has(s, 'prefixItems')) types = ['array'];
  }
  return [...new Set(types)].sort();
}

function typeRel(bt: string[], at: string[]): Rel {
  if (bt.length === 0 && at.length === 0) return 'same';
  if (at.length === 0) return 'widened';
  if (bt.length === 0) return 'narrowed';
  const covers = (x: string[], y: string[]) => y.every((t) => x.includes(t) || (t === 'integer' && x.includes('number')));
  const ab = covers(at, bt);
  const ba = covers(bt, at);
  if (ab && ba) return 'same';
  if (ab) return 'widened';
  if (ba) return 'narrowed';
  return 'changed';
}

function formatRel(fb: unknown, fa: unknown): Rel {
  if (fb === fa) return 'same';
  if (fa === undefined) return 'widened';
  if (fb === undefined) return 'narrowed';
  if (typeof fb === 'string' && FORMAT_WIDENS[fb] === fa) return 'widened';
  if (typeof fa === 'string' && FORMAT_WIDENS[fa] === fb) return 'narrowed';
  return 'changed';
}

export function typeLabel(s: Record<string, unknown>, nullable = false): string {
  const types = typesOf(s);
  let label = types.length ? types.join(' | ') : 'any';
  if (typeof s.format === 'string') label += ` (${s.format})`;
  if (nullable) label += ' | null';
  return label;
}

function shape(v: unknown): string {
  return stableStringify(v);
}

function appendBrackets(ctx: Ctx): Ctx {
  const hp = ctx.field && ctx.hp ? { up: ctx.hp.up, key: `${ctx.hp.key}[]` } : push(ctx.hp, '[]');
  return { ...ctx, hp, field: push(ctx.field, '[]') };
}

// ---------------------------------------------------------------- docs and extensions

export function compareDocs(e: Engine, ctx: Ctx, b: SNode, a: SNode, opts: { summary?: boolean } = {}): void {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  const text = (k: string, rule: string) => {
    const bv = bs[k];
    const av = as[k];
    if (bv === av || (bv === undefined && av === undefined)) return;
    if (typeof bv === 'string' && typeof av === 'string' && bv.trim() === av.trim()) return;
    const kind = bv === undefined ? 'added' : av === undefined ? 'removed' : 'changed';
    e.emit(ctx, rule, { bLoc: child(b.loc, k), aLoc: child(a.loc, k), before: bv, after: av, kind });
  };
  text('description', 'description-changed');
  if (opts.summary) text('summary', 'summary-changed');
  if (!e.opts.openapi.ignoreExamples) {
    for (const k of ['example', 'examples']) {
      const bv = bs[k];
      const av = as[k];
      if (bv === undefined && av === undefined) continue;
      if (shape(bv) === shape(av)) continue;
      const kind = bv === undefined ? 'added' : av === undefined ? 'removed' : 'changed';
      e.emit(ctx, 'example-changed', { bLoc: child(b.loc, k), aLoc: child(a.loc, k), before: bv, after: av, kind });
    }
  }
  compareExtensions(e, ctx, b, a);
}

export function compareExtensions(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  if (e.opts.ignoreExtensions) return;
  const bs = asObj(b.v);
  const as = asObj(a.v);
  const keys = [...Object.keys(bs), ...Object.keys(as).filter((k) => !has(bs, k))];
  for (const k of keys) {
    if (!k.startsWith('x-') || SEMANTIC_EXTENSIONS.has(k)) continue;
    if (shape(bs[k]) === shape(as[k])) continue;
    const kind = !has(bs, k) ? 'added' : !has(as, k) ? 'removed' : 'changed';
    e.emit(ctx, 'extension-changed', { bLoc: child(b.loc, k), aLoc: child(a.loc, k), before: bs[k], after: as[k], target: k, kind });
  }
}

/** OA-17: `x-sunset` dates on operations, parameters and properties. */
export function compareSunset(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bo = asObj(b.v);
  const ao = asObj(a.v);
  const bs = parseDate(bo['x-sunset']);
  const as = parseDate(ao['x-sunset']);
  const bLoc = child(b.loc, 'x-sunset');
  const aLoc = child(a.loc, 'x-sunset');
  if (bs && as && as.getTime() < bs.getTime()) e.emit(ctx, 'sunset-date-moved-earlier', { bLoc, aLoc, before: isoDate(bs), after: isoDate(as) });
  if (bs && !as && bo.deprecated === true && ao.deprecated === true) e.emit(ctx, 'sunset-date-removed', { bLoc, aLoc, before: isoDate(bs) });
  if (as && (!bs || as.getTime() !== bs.getTime())) {
    const grace = e.opts.openapi.sunsetGracePeriodDays;
    const days = (as.getTime() - e.opts.today.getTime()) / 86_400_000;
    if (days < grace) e.emit(ctx, 'sunset-inside-grace-period', { bLoc, aLoc, before: `${grace} ${grace === 1 ? 'day' : 'days'}`, after: isoDate(as) });
  }
}

// ---------------------------------------------------------------- entry point

export function compareSchema(e: Engine, ctx: Ctx, bv: unknown, bl: Loc, av: unknown, al: Loc): void {
  const b = resolveSchema(e.b, bv, bl);
  const a = resolveSchema(e.a, av, al);
  if (!e.opts.openapi.matchInlineRefs && (b.refId === undefined) !== (a.refId === undefined)) {
    e.emit(ctx, 'inline-ref-equivalent', { bLoc: bl, aLoc: al, before: b.refName ?? 'inline schema', after: a.refName ?? 'inline schema' });
  }
  const run = (c: Ctx) => schemaBody(e, c, { v: b.value, loc: b.loc }, { v: a.value, loc: a.loc }, b.nullable, a.nullable);
  if (b.refId !== undefined || a.refId !== undefined) e.viaRef(ctx, b, a, run);
  else run(ctx);
}

function flatten(spec: LoadedSpec, node: SNode, depth = 0): SNode {
  const s = node.v;
  if (!isObj(s) || !Array.isArray(s.allOf) || depth > 8) return node;
  const merged: Record<string, unknown> = {};
  const props: Record<string, unknown> = {};
  const required = new Set<string>();
  const propLocs = new Map<string, Loc>();
  const take = (src: Record<string, unknown>, loc: Loc, pl?: Map<string, Loc>) => {
    for (const [k, v] of Object.entries(src)) {
      if (k === 'allOf') continue;
      if (k === 'properties' && isObj(v)) {
        for (const [pn, pv] of Object.entries(v)) {
          if (has(props, pn)) continue;
          props[pn] = pv;
          propLocs.set(pn, pl?.get(pn) ?? child(child(loc, 'properties'), pn));
        }
      } else if (k === 'required' && Array.isArray(v)) {
        for (const r of v) if (typeof r === 'string') required.add(r);
      } else if (!has(merged, k)) merged[k] = v;
    }
  };
  take(s, node.loc, node.propLocs);
  s.allOf.forEach((br, i) => {
    const r = spec.deref(br, child(child(node.loc, 'allOf'), String(i)));
    const f = flatten(spec, { v: r.value, loc: r.loc }, depth + 1);
    if (isObj(f.v)) take(f.v, f.loc, f.propLocs);
  });
  if (Object.keys(props).length) merged.properties = props;
  if (required.size) merged.required = [...required];
  return { v: merged, loc: node.loc, propLocs };
}

function schemaBody(e: Engine, ctx: Ctx, b0: SNode, a0: SNode, bNull: boolean, aNull: boolean): void {
  if (a0.v === false && b0.v !== false) {
    if (ctx.dir === 'request' && !ctx.header) e.emit(ctx, 'request-schema-became-false', { bLoc: b0.loc, aLoc: a0.loc, after: false });
    return;
  }
  if (!isObj(b0.v) || !isObj(a0.v)) return;
  compareDocs(e, { ...ctx }, b0, a0);
  if (ctx.header) {
    compareTypes(e, ctx, b0, a0, bNull || isNullable(e.b, b0), aNull || isNullable(e.a, a0));
    return;
  }
  for (const k of ['x-enum-varnames', 'x-enumNames']) {
    const bv = b0.v[k];
    const av = a0.v[k];
    if ((bv !== undefined || av !== undefined) && shape(bv) !== shape(av)) {
      e.emit(ctx, 'enum-name-changed', { bLoc: child(b0.loc, k), aLoc: child(a0.loc, k), before: bv, after: av });
    }
  }
  const flat = e.opts.openapi.flattenAllOf;
  const b = flat ? flatten(e.b, b0) : b0;
  const a = flat ? flatten(e.a, a0) : a0;
  const bn = bNull || isNullable(e.b, b);
  const an = aNull || isNullable(e.a, a);
  const rel = compareTypes(e, ctx, b, a, bn, an);
  compareNullable(e, ctx, b, a, bn, an);
  if (rel === 'changed') return;
  if (ctx.param) compareDefault(e, ctx, b, a);
  compareEnum(e, ctx, b, a);
  compareConstraints(e, ctx, b, a);
  comparePattern(e, ctx, b, a);
  compareProperties(e, ctx, b, a);
  compareItems(e, ctx, b, a);
  compareTuple(e, ctx, b, a);
  for (const kw of ['oneOf', 'anyOf']) compareUnion(e, ctx, b, a, kw);
  if (!flat) compareAllOf(e, ctx, b, a);
}

// ---------------------------------------------------------------- types and nullability

function compareTypes(e: Engine, ctx: Ctx, b: SNode, a: SNode, bn: boolean, an: boolean): Rel {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  let rel = typeRel(typesOf(bs), typesOf(as));
  let key = 'type';
  if (rel === 'same' && typesOf(bs).length <= 1) {
    rel = formatRel(bs.format, as.format);
    key = 'format';
  }
  if (rel === 'same') return rel;
  let rule: string | undefined;
  if (ctx.header) rule = rel === 'narrowed' ? undefined : 'response-header-schema-changed';
  else if (ctx.param) rule = rel === 'widened' ? 'request-param-type-widened' : 'request-param-type-changed';
  else if (ctx.dir === 'request') rule = rel === 'widened' ? undefined : 'request-property-type-changed';
  else rule = rel === 'narrowed' ? 'response-property-type-narrowed' : 'response-property-type-changed';
  if (rule) e.emit(ctx, rule, { bLoc: child(b.loc, key), aLoc: child(a.loc, key), before: typeLabel(bs, bn), after: typeLabel(as, an) });
  return rel;
}

function compareNullable(e: Engine, ctx: Ctx, b: SNode, a: SNode, bn: boolean, an: boolean): void {
  if (bn === an || ctx.header) return;
  const bs = asObj(b.v);
  const as = asObj(a.v);
  const args = { bLoc: b.loc, aLoc: a.loc, before: typeLabel(bs, bn), after: typeLabel(as, an) };
  if (bn && !an) {
    if (ctx.param) e.emit(ctx, 'request-param-nullable-removed', args);
    else if (ctx.dir === 'request') e.emit(ctx, 'request-property-nullable-removed', args);
    else e.emit(ctx, 'response-property-type-narrowed', args);
  } else {
    if (ctx.param) e.emit(ctx, 'request-param-type-widened', args);
    else if (ctx.dir === 'response') e.emit(ctx, 'response-property-nullable-added', args);
  }
}

function compareDefault(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bv = asObj(b.v).default;
  const av = asObj(a.v).default;
  if (shape(bv) === shape(av)) return;
  e.emit(ctx, 'request-param-default-changed', { bLoc: child(b.loc, 'default'), aLoc: child(a.loc, 'default'), before: bv, after: av });
}

// ---------------------------------------------------------------- enums and constraints

function enumOf(s: Record<string, unknown>): { values: unknown[]; key: string } | undefined {
  if (Array.isArray(s.enum)) return { values: s.enum, key: 'enum' };
  if (has(s, 'const')) return { values: [s.const], key: 'const' };
  return undefined;
}

function compareEnum(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const be = enumOf(asObj(b.v));
  const ae = enumOf(asObj(a.v));
  if (!be && !ae) return;
  const req = ctx.dir === 'request';
  if (be && ae) {
    const bKeys = new Map(be.values.map((v, i) => [shape(v), i]));
    const aKeys = new Map(ae.values.map((v, i) => [shape(v), i]));
    be.values.forEach((v, i) => {
      if (v === null || aKeys.has(shape(v))) return;
      const rule = ctx.param ? 'request-param-enum-value-removed' : req ? 'request-property-enum-value-removed' : undefined;
      if (rule) e.emit(ctx, rule, { bLoc: child(child(b.loc, be.key), String(i)), aLoc: child(a.loc, ae.key), before: v });
    });
    ae.values.forEach((v, i) => {
      if (v === null || bKeys.has(shape(v))) return;
      const rule = ctx.param ? 'request-param-enum-value-added' : req ? undefined : 'response-property-enum-value-added';
      if (rule) e.emit(ctx, rule, { bLoc: child(b.loc, be.key), aLoc: child(child(a.loc, ae.key), String(i)), after: v });
    });
    return;
  }
  const args = { bLoc: child(b.loc, be?.key ?? 'enum'), aLoc: child(a.loc, ae?.key ?? 'enum'), before: be ? { enum: be.values } : undefined, after: ae ? { enum: ae.values } : undefined };
  if (!be && ae) {
    // A value list where any value was allowed.
    if (ctx.param) e.emit(ctx, 'request-param-constraint-tightened', args);
    else if (req) e.emit(ctx, 'request-property-constraint-tightened', args);
  } else if (be && !ae) {
    if (ctx.param) e.emit(ctx, 'request-param-constraint-relaxed', args);
    else if (!req) e.emit(ctx, 'response-constraint-removed', args);
  }
}

const UPPER = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties', 'maxContains'];
const LOWER = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties', 'minContains'];

function boundChange(kw: string, bv: unknown, av: unknown): 'tightened' | 'relaxed' | undefined {
  if (bv === undefined && av === undefined) return undefined;
  if (typeof bv === 'boolean' || typeof av === 'boolean') {
    // OpenAPI 3.0 boolean exclusiveMinimum/exclusiveMaximum, or uniqueItems.
    const b = bv === true;
    const a = av === true;
    return b === a ? undefined : a ? 'tightened' : 'relaxed';
  }
  if (bv !== undefined && typeof bv !== 'number') return undefined;
  if (av !== undefined && typeof av !== 'number') return undefined;
  if (bv === undefined) return 'tightened';
  if (av === undefined) return 'relaxed';
  if (bv === av) return undefined;
  if (kw === 'multipleOf') return av % bv === 0 ? 'tightened' : bv % av === 0 ? 'relaxed' : 'tightened';
  const upper = UPPER.includes(kw);
  return (upper ? av < bv : av > bv) ? 'tightened' : 'relaxed';
}

function compareConstraints(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  for (const kw of [...UPPER, ...LOWER, 'multipleOf', 'uniqueItems']) {
    const change = boundChange(kw, bs[kw], as[kw]);
    if (!change) continue;
    const args = {
      bLoc: child(b.loc, kw),
      aLoc: child(a.loc, kw),
      before: bs[kw] === undefined ? undefined : { [kw]: bs[kw] },
      after: as[kw] === undefined ? undefined : { [kw]: as[kw] },
      hp: [kw],
    };
    emitConstraint(e, ctx, change, args);
  }
}

function emitConstraint(e: Engine, ctx: Ctx, change: 'tightened' | 'relaxed', args: Parameters<Engine['emit']>[2], note?: string): void {
  const withNote = note ? { ...args, note } : args;
  if (change === 'tightened') {
    if (ctx.param) e.emit(ctx, 'request-param-constraint-tightened', withNote);
    else if (ctx.dir === 'request') e.emit(ctx, 'request-property-constraint-tightened', withNote);
  } else {
    if (ctx.param) e.emit(ctx, 'request-param-constraint-relaxed', withNote);
    else if (ctx.dir === 'response') e.emit(ctx, 'response-constraint-removed', withNote);
  }
}

function comparePattern(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bp = asObj(b.v).pattern;
  const ap = asObj(a.v).pattern;
  if (bp === ap || (typeof bp !== 'string' && typeof ap !== 'string')) return;
  const args = { bLoc: child(b.loc, 'pattern'), aLoc: child(a.loc, 'pattern'), before: bp === undefined ? undefined : { pattern: bp }, after: ap === undefined ? undefined : { pattern: ap }, hp: ['pattern'] };
  if (bp !== undefined && ap !== undefined) {
    if (ctx.param) e.emit(ctx, 'request-param-pattern-changed', args);
    else if (ctx.dir === 'request') emitConstraint(e, ctx, 'tightened', args, 'The pattern changed; the spec alone cannot prove which one is stricter.');
    return;
  }
  emitConstraint(e, ctx, ap !== undefined ? 'tightened' : 'relaxed', args);
}

// ---------------------------------------------------------------- objects and arrays

function propLoc(node: SNode, name: string): Loc {
  return node.propLocs?.get(name) ?? child(child(node.loc, 'properties'), name);
}
function propsLoc(node: SNode): Loc {
  return has(asObj(node.v), 'properties') ? child(node.loc, 'properties') : node.loc;
}
/** The entry for `name` in the schema's `required` list. */
function requiredLoc(node: SNode, name: string): Loc {
  const list = asObj(node.v).required;
  const i = Array.isArray(list) ? list.indexOf(name) : -1;
  return i >= 0 ? child(child(node.loc, 'required'), String(i)) : child(node.loc, 'required');
}
const requiredSet = (s: Record<string, unknown>) => new Set(Array.isArray(s.required) ? s.required.filter((x): x is string => typeof x === 'string') : []);

function compareProperties(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  const bp = asObj(bs.properties);
  const ap = asObj(as.properties);
  const bReq = requiredSet(bs);
  const aReq = requiredSet(as);
  const req = ctx.dir === 'request';
  const names = [...Object.keys(bp), ...Object.keys(ap).filter((k) => !has(bp, k))];
  for (const name of names) {
    const bl = propLoc(b, name);
    const al = propLoc(a, name);
    const pctx: Ctx = { ...ctx, param: false, hp: push(ctx.hp, name), field: push(ctx.field, name) };
    const docsCtx = (flags: Record<string, unknown>): Ctx => ((req ? flags.readOnly : flags.writeOnly) === true ? { ...pctx, docsOnly: true } : pctx);
    if (!has(ap, name)) {
      const flags = asObj(e.b.deref(bp[name], bl).value);
      const required = bReq.has(name);
      let rule: string;
      if (req) rule = 'request-property-removed';
      else if (ctx.webhook) rule = 'webhook-payload-property-removed';
      else rule = required ? 'response-property-removed' : 'response-optional-property-removed';
      const base: Severity = rule === 'request-property-removed' ? 'possibly' : rule === 'response-optional-property-removed' ? 'docs' : 'breaking';
      const severity = removalSeverity(e, flags, base);
      e.emit(docsCtx(flags), rule, { bLoc: bl, aLoc: propsLoc(a), before: bp[name], ...(severity !== undefined ? { severity } : {}) });
      continue;
    }
    if (!has(bp, name)) {
      const flags = asObj(e.a.deref(ap[name], al).value);
      const rule = req ? (aReq.has(name) ? 'request-property-added-required' : 'request-property-added-optional') : 'response-property-added';
      e.emit(docsCtx(flags), rule, { bLoc: propsLoc(b), aLoc: al, after: ap[name] });
      continue;
    }
    const bf = asObj(e.b.deref(bp[name], bl).value);
    const af = asObj(e.a.deref(ap[name], al).value);
    if (req) {
      if (!bReq.has(name) && aReq.has(name)) {
        e.emit(docsCtx(af), 'request-property-became-required', { bLoc: child(b.loc, 'required'), aLoc: requiredLoc(a, name), before: 'optional', after: 'required' });
      }
      if (bf.readOnly !== true && af.readOnly === true) e.emit(pctx, 'request-property-read-only-added', { bLoc: bl, aLoc: child(al, 'readOnly'), after: { readOnly: true } });
    } else {
      if (bReq.has(name) && !aReq.has(name)) {
        e.emit(docsCtx(af), 'response-property-became-optional', { bLoc: requiredLoc(b, name), aLoc: child(a.loc, 'required'), before: 'required', after: 'optional' });
      }
      if (bReq.has(name) && bf.writeOnly !== true && af.writeOnly === true) {
        e.emit(pctx, 'response-required-became-write-only', { bLoc: bl, aLoc: child(al, 'writeOnly'), after: { writeOnly: true } });
      }
    }
    compareSunset(e, pctx, { v: bf, loc: bl }, { v: af, loc: al });
    const hidden = req ? bf.readOnly === true || af.readOnly === true : bf.writeOnly === true || af.writeOnly === true;
    compareSchema(e, hidden ? { ...pctx, docsOnly: true } : pctx, bp[name], bl, ap[name], al);
  }
}

function compareItems(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  if (!has(bs, 'items') || !has(as, 'items')) return;
  if (as.items === false || bs.items === false) return; // tuples: see compareTuple
  compareSchema(e, appendBrackets(ctx), bs.items, child(b.loc, 'items'), as.items, child(a.loc, 'items'));
}

function compareTuple(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bs = asObj(b.v);
  const as = asObj(a.v);
  const bt = Array.isArray(bs.prefixItems) ? bs.prefixItems : undefined;
  const at = Array.isArray(as.prefixItems) ? as.prefixItems : undefined;
  if (!bt && !at) return;
  const closed = as.items === false && bs.items !== false;
  if (ctx.dir === 'response') {
    const changed = !bt || !at || bt.length !== at.length || bt.some((x, i) => shape(x) !== shape(at[i])) || closed;
    if (!changed) return;
    const label = (list: unknown[] | undefined, s: Record<string, unknown>) => {
      const items = (list ?? []).map((x) => (isObj(x) && typeof x.$ref === 'string' ? x.$ref.split('/').pop() : typeLabel(asObj(x))));
      return `[${items.join(', ')}]${s.items === false ? ' (closed)' : ''}`;
    };
    e.emit(ctx, 'response-tuple-changed', { bLoc: child(b.loc, 'prefixItems'), aLoc: child(a.loc, 'prefixItems'), before: label(bt, bs), after: label(at, as) });
    return;
  }
  if (!bt || !at) return;
  for (let i = 0; i < Math.min(bt.length, at.length); i++) {
    const ictx: Ctx = { ...ctx, hp: push(ctx.hp, `[${i}]`), field: push(ctx.field, `${i}`) };
    compareSchema(e, ictx, bt[i], child(child(b.loc, 'prefixItems'), String(i)), at[i], child(child(a.loc, 'prefixItems'), String(i)));
  }
}

// ---------------------------------------------------------------- oneOf / anyOf / allOf

function branchLabel(r: Resolved): string {
  return r.refName ?? typeLabel(asObj(r.value));
}

interface Matched {
  pairs: Array<[Resolved, Resolved]>;
  onlyB: Resolved[];
  onlyA: Resolved[];
}

/** Match subschemas by `$ref` name, then by shape. */
function matchBranches(bb: Resolved[], ab: Resolved[]): Matched {
  const usedA = new Set<number>();
  const pairs: Array<[Resolved, Resolved]> = [];
  const onlyB: Resolved[] = [];
  const restB: Resolved[] = [];
  for (const x of bb) {
    const j = x.refName !== undefined ? ab.findIndex((y, k) => !usedA.has(k) && y.refName === x.refName) : -1;
    if (j >= 0) {
      usedA.add(j);
      pairs.push([x, ab[j] as Resolved]);
    } else restB.push(x);
  }
  for (const x of restB) {
    const s = shape(x.value);
    const j = ab.findIndex((y, k) => !usedA.has(k) && shape(y.value) === s);
    if (j >= 0) {
      usedA.add(j);
      pairs.push([x, ab[j] as Resolved]);
    } else onlyB.push(x);
  }
  return { pairs, onlyB, onlyA: ab.filter((_, k) => !usedA.has(k)) };
}

function compareUnion(e: Engine, ctx: Ctx, b: SNode, a: SNode, kw: string): void {
  const bb = branches(e.b, b, kw).filter((r) => !isNullSchema(r.value));
  const ab = branches(e.a, a, kw).filter((r) => !isNullSchema(r.value));
  if (bb.length === 0 || ab.length === 0) return; // a union appearing or disappearing is judged by its type
  const m = matchBranches(bb, ab);
  const c: Ctx = { ...ctx, param: false };
  // Pairs matched by shape are identical; pairs matched by $ref name may differ inside.
  for (const [x, y] of m.pairs) if (x.refId !== undefined || y.refId !== undefined) compareResolved(e, c, x, y);
  const unsure = 'Another option changed too, so this may be an edited option rather than a removed one.';
  if (ctx.dir === 'request') {
    for (const x of m.onlyB) {
      e.emit(c, 'request-union-branch-removed', { bLoc: x.loc, aLoc: child(a.loc, kw), before: branchLabel(x), ...(m.onlyA.length ? { severity: 'possibly' as const, note: unsure } : {}) });
    }
  } else {
    for (const y of m.onlyA) {
      e.emit(c, 'response-union-branch-added', { bLoc: child(b.loc, kw), aLoc: y.loc, after: branchLabel(y), ...(m.onlyB.length ? { severity: 'possibly' as const, note: unsure.replace('removed', 'added') } : {}) });
    }
  }
}

function compareAllOf(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bb = branches(e.b, b, 'allOf');
  const ab = branches(e.a, a, 'allOf');
  if (bb.length === 0 && ab.length === 0) return;
  const m = matchBranches(bb, ab);
  const c: Ctx = { ...ctx, param: false, inAllOf: true };
  const rest = Math.min(m.onlyB.length, m.onlyA.length);
  const pairs = [...m.pairs, ...m.onlyB.slice(0, rest).map((x, i) => [x, m.onlyA[i] as Resolved] as [Resolved, Resolved])];
  for (const [x, y] of pairs) compareResolved(e, c, x, y);
  if (ctx.dir === 'request') {
    for (const y of m.onlyA.slice(rest)) e.emit(ctx, 'request-allof-branch-added', { bLoc: child(b.loc, 'allOf'), aLoc: y.loc, after: branchLabel(y) });
  }
}

/** Compare two already-resolved subschemas (entering their component when they were `$ref`s). */
function compareResolved(e: Engine, ctx: Ctx, x: Resolved, y: Resolved): void {
  const run = (c: Ctx) => schemaBody(e, c, { v: x.value, loc: x.loc }, { v: y.value, loc: y.loc }, false, false);
  if (x.refId !== undefined || y.refId !== undefined) e.viaRef(ctx, x, y, run);
  else run(ctx);
}
