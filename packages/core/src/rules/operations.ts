// Document-level rules: endpoints, parameters, request bodies, responses, headers, security,
// servers, webhooks, callbacks and component renames. Schemas are compared in ./schema.ts.
import { type Ctx, type Engine, type OperationRef, asObj, has, isObj, push } from '../openapi/engine';
import { stableStringify } from '../openapi/hash';
import { type Loc, type LoadedSpec, type Resolved, arrayToChain, child } from '../openapi/load';
import { type SNode, compareDocs, compareExtensions, compareSchema, compareSunset, parseDate, removalSeverity } from './schema';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

const rootLoc = (spec: LoadedSpec, ...segs: string[]): Loc => ({ file: spec.rootFile, ptr: arrayToChain(segs) });

function baseCtx(block: string, label: string, hp: string[], extra: Partial<Ctx> = {}): Ctx {
  let chain: Ctx['hp'];
  for (const k of hp) chain = push(chain, k);
  return {
    op: undefined,
    usage: block,
    block,
    label,
    component: false,
    hp: chain,
    field: undefined,
    what: label,
    dir: 'request',
    docsOnly: false,
    inAllOf: false,
    webhook: false,
    param: false,
    header: false,
    ...extra,
  };
}

/** Enter a referenced component (OA-14/OA-15): changes inside are reported at the component. */
function enterRef(ctx: Ctx, r: Resolved | undefined): Ctx {
  if (!r || r.refId === undefined) return ctx;
  return { ...ctx, component: true, block: r.refId, label: r.refName ?? ctx.label, hp: push(undefined, r.refId) };
}

interface Op {
  method: string;
  node: SNode;
}

function operationsOf(item: Resolved): Op[] {
  const o = asObj(item.value);
  const out: Op[] = [];
  for (const m of METHODS) if (isObj(o[m])) out.push({ method: m.toUpperCase(), node: { v: o[m], loc: child(item.loc, m) } });
  const extra = o.additionalOperations;
  if (isObj(extra)) {
    for (const [k, v] of Object.entries(extra)) {
      if (isObj(v)) out.push({ method: k.toUpperCase(), node: { v, loc: child(child(item.loc, 'additionalOperations'), k) } });
    }
  }
  return out;
}

export function compareDocument(e: Engine): void {
  const info = baseCtx('info', 'info', ['info']);
  compareDocs(e, info, { v: e.b.root.info, loc: rootLoc(e.b, 'info') }, { v: e.a.root.info, loc: rootLoc(e.a, 'info') }, { summary: true });
  compareExtensions(e, baseCtx('document', 'the document', []), { v: e.b.root, loc: rootLoc(e.b) }, { v: e.a.root, loc: rootLoc(e.a) });
  compareServers(e);
  compareTagDefinitions(e);
  compareSchemaRenames(e);
  comparePaths(e);
  compareWebhooks(e);
  compareSecuritySchemes(e);
}

// ---------------------------------------------------------------- paths and operations

function pathKeys(paths: Record<string, unknown>, withNames: boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of Object.keys(paths)) {
    const key = withNames ? t : t.replace(/\{[^}]*\}/g, '{}');
    out.set(out.has(key) ? t : key, t);
  }
  return out;
}

function comparePaths(e: Engine): void {
  const bPaths = asObj(e.b.root.paths);
  const aPaths = asObj(e.a.root.paths);
  const withNames = e.opts.openapi.includePathParamNames;
  const bk = pathKeys(bPaths, withNames);
  const ak = pathKeys(aPaths, withNames);
  const keys = [...bk.keys(), ...[...ak.keys()].filter((k) => !bk.has(k))];
  for (const key of keys) {
    const bt = bk.get(key);
    const at = ak.get(key);
    const bItem = bt !== undefined ? e.b.deref(bPaths[bt], rootLoc(e.b, 'paths', bt)) : undefined;
    const aItem = at !== undefined ? e.a.deref(aPaths[at], rootLoc(e.a, 'paths', at)) : undefined;
    if (bt !== undefined && bItem && (at === undefined || !aItem)) {
      for (const op of operationsOf(bItem)) endpointRemoved(e, bt, op, rootLoc(e.a, 'paths'));
      continue;
    }
    if (at !== undefined && aItem && (bt === undefined || !bItem)) {
      for (const op of operationsOf(aItem)) endpointAdded(e, at, op, rootLoc(e.b, 'paths'));
      continue;
    }
    if (bt !== undefined && at !== undefined && bItem && aItem) comparePathItem(e, bt, at, bItem, aItem);
  }
}

function opCtx(path: string, method: string, op: SNode, other?: SNode): Ctx {
  const key = `${method} ${path}`;
  const id = asObj(op.v).operationId ?? asObj(other?.v).operationId;
  const ref: OperationRef = { method, path };
  if (typeof id === 'string') ref.operationId = id;
  // OA-09: group by the operation's own OpenAPI tags (After's, else Before's).
  const tagsOf = (n?: SNode) => { const t = asObj(n?.v).tags; return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []; };
  const tags = tagsOf(op).length ? tagsOf(op) : tagsOf(other);
  if (tags.length) ref.tags = tags;
  return baseCtx(key, key, [key], { op: ref });
}

function endpointRemoved(e: Engine, path: string, op: Op, aLoc: Loc): void {
  const o = asObj(op.node.v);
  const ctx = opCtx(path, op.method, op.node);
  const before = { ...(typeof o.operationId === 'string' ? { operationId: o.operationId } : {}), ...(typeof o.summary === 'string' ? { summary: o.summary } : {}) };
  if (o.deprecated === true) {
    const sunset = parseDate(o['x-sunset']);
    const severity = !sunset ? 'possibly' : e.opts.today.getTime() < sunset.getTime() ? 'breaking' : null;
    e.emit(ctx, 'endpoint-removed-after-deprecation', { bLoc: op.node.loc, aLoc, before, severity });
  } else e.emit(ctx, 'endpoint-removed', { bLoc: op.node.loc, aLoc, before });
}

function endpointAdded(e: Engine, path: string, op: Op, bLoc: Loc): void {
  const o = asObj(op.node.v);
  const after = { ...(typeof o.operationId === 'string' ? { operationId: o.operationId } : {}), ...(typeof o.summary === 'string' ? { summary: o.summary } : {}) };
  e.emit(opCtx(path, op.method, op.node), 'endpoint-added', { bLoc, aLoc: op.node.loc, after });
}

function comparePathItem(e: Engine, bt: string, at: string, bItem: Resolved, aItem: Resolved): void {
  const pctx = baseCtx(at, at, [at]);
  if (bt !== at) e.emit(pctx, 'path-param-renamed', { bLoc: bItem.loc, aLoc: aItem.loc, before: bt, after: at });
  compareDocs(e, pctx, { v: bItem.value, loc: bItem.loc }, { v: aItem.value, loc: aItem.loc }, { summary: true });
  const merge = e.opts.openapi.mergePathParams;
  if (!merge) {
    compareParams(e, pctx, paramsOf(e.b, bItem, undefined, true), paramsOf(e.a, aItem, undefined, true), bt, at, bItem.loc, aItem.loc);
  }
  const bOps = operationsOf(bItem);
  const aOps = operationsOf(aItem);
  for (const op of bOps) {
    const other = aOps.find((x) => x.method === op.method);
    if (!other) endpointRemoved(e, bt, op, aItem.loc);
    else compareOperation(e, bt, at, op, other, bItem, aItem);
  }
  for (const op of aOps) if (!bOps.some((x) => x.method === op.method)) endpointAdded(e, at, op, bItem.loc);
}

function compareOperation(e: Engine, bt: string, at: string, bOp: Op, aOp: Op, bItem: Resolved, aItem: Resolved): void {
  const ctx = opCtx(at, aOp.method, aOp.node, bOp.node);
  const b = bOp.node;
  const a = aOp.node;
  const bo = asObj(b.v);
  const ao = asObj(a.v);
  if (bo.deprecated !== true && ao.deprecated === true) e.emit(ctx, 'endpoint-deprecated', { bLoc: b.loc, aLoc: child(a.loc, 'deprecated'), after: { deprecated: true } });
  compareSunset(e, ctx, b, a);
  if (typeof bo.operationId === 'string' && bo.operationId !== ao.operationId) {
    e.emit(ctx, 'operation-id-changed', { bLoc: child(b.loc, 'operationId'), aLoc: child(a.loc, 'operationId'), before: bo.operationId, after: ao.operationId });
  }
  if (stableStringify(bo.tags ?? []) !== stableStringify(ao.tags ?? [])) {
    e.emit(ctx, 'tag-changed', { bLoc: child(b.loc, 'tags'), aLoc: child(a.loc, 'tags'), before: bo.tags, after: ao.tags });
  }
  compareDocs(e, ctx, b, a, { summary: true });
  const merge = e.opts.openapi.mergePathParams;
  compareParams(e, ctx, paramsOf(e.b, bItem, b, merge), paramsOf(e.a, aItem, a, merge), bt, at, b.loc, a.loc);
  compareRequestBody(e, ctx, b, a);
  compareResponses(e, ctx, b, a);
  compareSecurity(e, ctx, b, a);
  compareCallbacks(e, ctx, b, a);
}

// ---------------------------------------------------------------- parameters

/** Path-level parameters merged into the operation's (OA-18 "merge path-level parameters"). */
function paramsOf(spec: LoadedSpec, item: Resolved, op: SNode | undefined, includePathLevel: boolean): Resolved[] {
  const list = new Map<string, Resolved>();
  const add = (holder: unknown, loc: Loc) => {
    const arr = asObj(holder).parameters;
    if (!Array.isArray(arr)) return;
    arr.forEach((p, i) => {
      const r = spec.deref(p, child(child(loc, 'parameters'), String(i)));
      const o = asObj(r.value);
      if (typeof o.name === 'string' && typeof o.in === 'string') list.set(`${o.in}:${o.name}`, r);
    });
  };
  if (includePathLevel) add(item.value, item.loc);
  if (op) add(op.v, op.loc);
  return [...list.values()];
}

function compareParams(e: Engine, ctx: Ctx, bList: Resolved[], aList: Resolved[], bt: string, at: string, bParent: Loc, aParent: Loc): void {
  const ci = e.opts.openapi.caseInsensitiveHeaders;
  const names = (t: string) => [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const keyOf = (p: Resolved, t: string) => {
    const o = asObj(p.value);
    const where = String(o.in);
    let name = String(o.name);
    if (where === 'path') {
      const i = names(t).indexOf(name);
      if (i >= 0) return `path:#${i}`;
    }
    if (where === 'header' && ci) name = name.toLowerCase();
    return `${where}:${name}`;
  };
  const bm = new Map(bList.map((p) => [keyOf(p, bt), p]));
  const am = new Map(aList.map((p) => [keyOf(p, at), p]));
  const removed = [...bm.entries()].filter(([k]) => !am.has(k));
  const added = [...am.entries()].filter(([k]) => !bm.has(k));
  const moved = new Set<string>();
  const sameName = (x: Resolved, y: Resolved) => String(asObj(x.value).name).toLowerCase() === String(asObj(y.value).name).toLowerCase();
  for (const [rk, r] of removed) {
    const hit = added.find(([nk, n]) => !moved.has(nk) && sameName(r, n));
    if (!hit) continue;
    const [nk, n] = hit;
    moved.add(rk);
    moved.add(nk);
    e.emit(paramCtx(ctx, n), 'request-param-location-changed', { bLoc: r.loc, aLoc: n.loc, before: asObj(r.value).in, after: asObj(n.value).in });
  }
  for (const [rk, r] of removed) {
    const o = asObj(r.value);
    if (moved.has(rk) || o.in === 'path') continue;
    const severity = removalSeverity(e, o, 'possibly');
    e.emit(paramCtx(ctx, r), 'request-param-removed', { bLoc: r.loc, aLoc: aParent, before: { in: o.in, name: o.name }, ...(severity !== undefined ? { severity } : {}) });
  }
  for (const [nk, n] of added) {
    const o = asObj(n.value);
    if (moved.has(nk) || o.in === 'path') continue;
    const rule = o.required === true ? 'request-param-added-required' : 'request-param-added-optional';
    e.emit(paramCtx(ctx, n), rule, { bLoc: bParent, aLoc: n.loc, after: { in: o.in, name: o.name } });
  }
  for (const [k, br] of bm) {
    const ar = am.get(k);
    if (ar) compareParam(e, ctx, br, ar);
  }
}

function paramCtx(ctx: Ctx, r: Resolved): Ctx {
  const o = asObj(r.value);
  const name = String(o.name);
  const base: Ctx = { ...ctx, dir: 'request', param: true, hp: push(ctx.hp, `${String(o.in)} ${name}`), field: push(undefined, name), what: name };
  return enterRef(base, r);
}

function paramSchema(r: Resolved): SNode | undefined {
  const o = asObj(r.value);
  if (o.schema !== undefined) return { v: o.schema, loc: child(r.loc, 'schema') };
  const content = asObj(o.content);
  const mt = Object.keys(content)[0];
  if (mt === undefined) return undefined;
  const s = asObj(content[mt]).schema;
  return s === undefined ? undefined : { v: s, loc: child(child(child(r.loc, 'content'), mt), 'schema') };
}

function compareParam(e: Engine, ctx: Ctx, br: Resolved, ar: Resolved): void {
  const pctx = paramCtx(ctx, ar.refId !== undefined ? ar : br.refId !== undefined ? { ...ar, refId: br.refId, ...(br.refName ? { refName: br.refName } : {}) } : ar);
  const bo = asObj(br.value);
  const ao = asObj(ar.value);
  if (bo.required !== true && ao.required === true) {
    e.emit(pctx, 'request-param-became-required', { bLoc: child(br.loc, 'required'), aLoc: child(ar.loc, 'required'), before: 'optional', after: 'required' });
  }
  if (bo.required === true && ao.required !== true && ao.in !== 'path') {
    e.emit(pctx, 'request-param-became-optional', { bLoc: child(br.loc, 'required'), aLoc: child(ar.loc, 'required'), before: 'required', after: 'optional' });
  }
  const b: SNode = { v: br.value, loc: br.loc };
  const a: SNode = { v: ar.value, loc: ar.loc };
  compareSunset(e, pctx, b, a);
  compareDocs(e, { ...pctx, param: false }, b, a);
  const bs = paramSchema(br);
  const as = paramSchema(ar);
  if (bs && as) compareSchema(e, pctx, bs.v, bs.loc, as.v, as.loc);
}

// ---------------------------------------------------------------- request bodies and content

function compareRequestBody(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bRaw = asObj(b.v).requestBody;
  const aRaw = asObj(a.v).requestBody;
  if (bRaw === undefined && aRaw === undefined) return;
  const bR = bRaw !== undefined ? e.b.deref(bRaw, child(b.loc, 'requestBody')) : undefined;
  const aR = aRaw !== undefined ? e.a.deref(aRaw, child(a.loc, 'requestBody')) : undefined;
  const rctx = enterRef({ ...ctx, dir: 'request', hp: push(ctx.hp, 'requestBody'), what: 'request body', field: undefined }, aR);
  if (!bR && aR) {
    if (asObj(aR.value).required === true) e.emit(rctx, 'request-body-became-required', { bLoc: b.loc, aLoc: aR.loc, after: 'required' });
    return;
  }
  if (!bR || !aR) return;
  const bo = asObj(bR.value);
  const ao = asObj(aR.value);
  if (bo.required !== true && ao.required === true) {
    e.emit(rctx, 'request-body-became-required', { bLoc: child(bR.loc, 'required'), aLoc: child(aR.loc, 'required'), before: 'optional', after: 'required' });
  }
  const bn: SNode = { v: bR.value, loc: bR.loc };
  const an: SNode = { v: aR.value, loc: aR.loc };
  compareDocs(e, rctx, bn, an);
  compareContent(e, rctx, bn, an, 'request');
}

const normMediaType = (k: string) => k.toLowerCase().replace(/\s+/g, '');

function compareContent(e: Engine, ctx: Ctx, b: SNode, a: SNode, side: 'request' | 'response'): void {
  const bc = asObj(asObj(b.v).content);
  const ac = asObj(asObj(a.v).content);
  const bm = new Map(Object.keys(bc).map((k) => [normMediaType(k), k]));
  const am = new Map(Object.keys(ac).map((k) => [normMediaType(k), k]));
  const multi = bm.size > 1 || am.size > 1;
  const aContentLoc = has(asObj(a.v), 'content') ? child(a.loc, 'content') : a.loc;
  for (const [nk, k] of bm) {
    if (am.has(nk)) continue;
    const rule = side === 'request' ? 'request-body-content-type-removed' : 'response-content-type-removed';
    e.emit(multi ? { ...ctx, hp: push(ctx.hp, k) } : ctx, rule, { bLoc: child(child(b.loc, 'content'), k), aLoc: aContentLoc, target: k, before: k });
  }
  for (const [nk, bk] of bm) {
    const ak = am.get(nk);
    if (ak === undefined) continue;
    const bmt: SNode = { v: bc[bk], loc: child(child(b.loc, 'content'), bk) };
    const amt: SNode = { v: ac[ak], loc: child(child(a.loc, 'content'), ak) };
    const mctx = multi ? { ...ctx, hp: push(ctx.hp, ak) } : ctx;
    compareDocs(e, mctx, bmt, amt);
    for (const kw of ['schema', 'itemSchema']) {
      const bs = asObj(bmt.v)[kw];
      const as = asObj(amt.v)[kw];
      const kctx: Ctx = kw === 'itemSchema' ? { ...mctx, hp: push(mctx.hp, 'itemSchema'), what: 'streamed item' } : mctx;
      if (bs !== undefined && as !== undefined) compareSchema(e, kctx, bs, child(bmt.loc, kw), as, child(amt.loc, kw));
      else if (bs !== undefined && side === 'response') e.emit(kctx, 'response-body-schema-removed', { bLoc: child(bmt.loc, kw), aLoc: amt.loc, target: ctx.what });
    }
  }
}

// ---------------------------------------------------------------- responses and headers

const normStatus = (k: string) => (k.toLowerCase() === 'default' ? 'default' : k.toUpperCase());

function compareResponses(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const br = asObj(asObj(b.v).responses);
  const ar = asObj(asObj(a.v).responses);
  const bm = new Map(Object.keys(br).map((k) => [normStatus(k), k]));
  const am = new Map(Object.keys(ar).map((k) => [normStatus(k), k]));
  const rctx = (code: string): Ctx => ({ ...ctx, dir: 'response', hp: push(ctx.hp, `response ${code}`), what: `response ${code}`, field: undefined });
  for (const [nk, k] of bm) {
    if (am.has(nk)) continue;
    if (nk.startsWith('2')) e.emit(rctx(k), 'response-success-status-removed', { bLoc: child(child(b.loc, 'responses'), k), aLoc: child(a.loc, 'responses'), target: k, before: k });
  }
  for (const [nk, k] of am) {
    if (bm.has(nk)) continue;
    e.emit(rctx(k), 'response-status-added', { bLoc: child(b.loc, 'responses'), aLoc: child(child(a.loc, 'responses'), k), target: k, after: k });
  }
  for (const [nk, bk] of bm) {
    const ak = am.get(nk);
    if (ak === undefined) continue;
    const bR = e.b.deref(br[bk], child(child(b.loc, 'responses'), bk));
    const aR = e.a.deref(ar[ak], child(child(a.loc, 'responses'), ak));
    compareResponse(e, enterRef(rctx(ak), aR), bR, aR);
  }
}

function compareResponse(e: Engine, ctx: Ctx, bR: Resolved, aR: Resolved): void {
  const b: SNode = { v: bR.value, loc: bR.loc };
  const a: SNode = { v: aR.value, loc: aR.loc };
  compareDocs(e, ctx, b, a);
  compareHeaders(e, ctx, b, a);
  const bHas = Object.keys(asObj(asObj(b.v).content)).length > 0;
  const aHas = Object.keys(asObj(asObj(a.v).content)).length > 0;
  if (bHas && !aHas) e.emit(ctx, 'response-body-schema-removed', { bLoc: child(b.loc, 'content'), aLoc: a.loc, target: ctx.what });
  else compareContent(e, ctx, b, a, 'response');
}

function compareHeaders(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const ci = e.opts.openapi.caseInsensitiveHeaders;
  const norm = (k: string) => (ci ? k.toLowerCase() : k);
  const bh = asObj(asObj(b.v).headers);
  const ah = asObj(asObj(a.v).headers);
  const am = new Map(Object.keys(ah).map((k) => [norm(k), k]));
  for (const bk of Object.keys(bh)) {
    const ak = am.get(norm(bk));
    const hctx: Ctx = { ...ctx, hp: push(ctx.hp, `header ${ak ?? bk}`), field: push(undefined, ak ?? bk), what: ak ?? bk };
    if (ak === undefined) {
      const aLoc = has(asObj(a.v), 'headers') ? child(a.loc, 'headers') : a.loc;
      e.emit(hctx, 'response-header-removed', { bLoc: child(child(b.loc, 'headers'), bk), aLoc, before: bk });
      continue;
    }
    const hb = e.b.deref(bh[bk], child(child(b.loc, 'headers'), bk));
    const ha = e.a.deref(ah[ak], child(child(a.loc, 'headers'), ak));
    const c = enterRef(hctx, ha);
    compareDocs(e, c, { v: hb.value, loc: hb.loc }, { v: ha.value, loc: ha.loc });
    const bs = asObj(hb.value).schema;
    const as = asObj(ha.value).schema;
    if (bs !== undefined && as !== undefined) compareSchema(e, { ...c, header: true }, bs, child(hb.loc, 'schema'), as, child(ha.loc, 'schema'));
  }
}

// ---------------------------------------------------------------- security

type Requirement = Record<string, unknown>;

function effectiveSecurity(spec: LoadedSpec, op: SNode): { reqs: Requirement[]; loc: Loc } {
  const o = asObj(op.v);
  if (Array.isArray(o.security)) return { reqs: o.security.filter(isObj), loc: child(op.loc, 'security') };
  const r = spec.root.security;
  return { reqs: Array.isArray(r) ? r.filter(isObj) : [], loc: rootLoc(spec, 'security') };
}

const scopesOf = (r: Requirement, k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : []);
const reqLabel = (r: Requirement) => Object.keys(r).sort().join(' + ') || 'no authentication';

function compareSecurity(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bs = effectiveSecurity(e.b, b);
  const as = effectiveSecurity(e.a, a);
  for (const r of [...bs.reqs, ...as.reqs]) for (const k of Object.keys(r)) e.useScheme(k, ctx.usage);
  const open = (reqs: Requirement[]) => reqs.length === 0 || reqs.some((r) => Object.keys(r).length === 0);
  const sctx: Ctx = { ...ctx, hp: push(ctx.hp, 'security'), what: 'security' };
  if (open(bs.reqs)) {
    if (!open(as.reqs)) e.emit(sctx, 'security-added-to-open-operation', { bLoc: bs.loc, aLoc: as.loc, after: as.reqs.map(reqLabel).join(' or ') });
    return;
  }
  if (open(as.reqs)) return; // anonymous access added: nothing breaks
  bs.reqs.forEach((R, i) => {
    const keys = Object.keys(R).sort();
    const bLoc = child(bs.loc, String(i));
    const sameIdx = as.reqs.findIndex((A) => stableStringify(Object.keys(A).sort()) === stableStringify(keys));
    if (sameIdx >= 0) {
      const A = as.reqs[sameIdx] as Requirement;
      for (const k of keys) {
        const had = new Set(scopesOf(R, k));
        for (const s of scopesOf(A, k)) {
          if (!had.has(s)) e.emit(sctx, 'security-scope-added', { bLoc, aLoc: child(child(as.loc, String(sameIdx)), k), target: k, after: s });
        }
      }
      return;
    }
    const supIdx = as.reqs.findIndex((A) => keys.every((k) => has(A, k)) && Object.keys(A).length > keys.length);
    if (supIdx >= 0) {
      const A = as.reqs[supIdx] as Requirement;
      const extra = Object.keys(A).filter((k) => !keys.includes(k)).sort();
      e.emit(sctx, 'security-scheme-added-to-operation', { bLoc, aLoc: child(as.loc, String(supIdx)), target: extra.join(' + '), before: reqLabel(R), after: reqLabel(A) });
    } else e.emit(sctx, 'security-requirement-removed', { bLoc, aLoc: as.loc, before: reqLabel(R) });
  });
}

function normUrl(u: unknown): string {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  try {
    const url = new URL(s);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

function describeScheme(o: Record<string, unknown>): string {
  const type = String(o.type ?? 'unknown');
  if (type === 'apiKey') return `apiKey in ${String(o.in)} ${String(o.name)}`;
  if (type === 'http') return `http ${String(o.scheme ?? '').toLowerCase()}`;
  if (type === 'openIdConnect') return `openIdConnect ${String(o.openIdConnectUrl ?? '')}`;
  return type;
}

function compareSecuritySchemes(e: Engine): void {
  const bS = asObj(asObj(e.b.root.components).securitySchemes);
  const aS = asObj(asObj(e.a.root.components).securitySchemes);
  for (const name of Object.keys(bS)) {
    if (!has(aS, name)) continue;
    const b = e.b.deref(bS[name], rootLoc(e.b, 'components', 'securitySchemes', name));
    const a = e.a.deref(aS[name], rootLoc(e.a, 'components', 'securitySchemes', name));
    const bo = asObj(b.value);
    const ao = asObj(a.value);
    const block = `components.securitySchemes.${name}`;
    const usages = e.schemeUsages(name);
    const emitAll = (rule: string, args: Parameters<Engine['emit']>[2]) => {
      for (const usage of usages.length ? usages : [block]) {
        e.emit(baseCtx(block, name, [block], { usage, component: true, what: name }), rule, args);
      }
    };
    if (describeScheme(bo) !== describeScheme(ao)) {
      emitAll('security-scheme-transport-changed', { bLoc: b.loc, aLoc: a.loc, target: name, before: describeScheme(bo), after: describeScheme(ao) });
    }
    const bf = asObj(bo.flows);
    const af = asObj(ao.flows);
    for (const flow of Object.keys(bf)) {
      if (!has(af, flow)) continue;
      for (const k of ['authorizationUrl', 'tokenUrl', 'refreshUrl']) {
        const bu = asObj(bf[flow])[k];
        const au = asObj(af[flow])[k];
        if (normUrl(bu) === normUrl(au)) continue;
        const loc = (r: Resolved) => child(child(child(r.loc, 'flows'), flow), k);
        emitAll('security-flow-url-changed', { bLoc: loc(b), aLoc: loc(a), target: `${name} ${flow} ${k}`, before: bu, after: au });
      }
    }
  }
}

// ---------------------------------------------------------------- servers, tags, renames, webhooks, callbacks

function compareServers(e: Engine): void {
  // A server's effective URL: {variables} filled with their defaults, so a changed default is a changed base URL.
  const resolved = (s: unknown) => {
    const vars = asObj(asObj(s).variables);
    return String(asObj(s).url ?? '').replace(/\{([^}]+)\}/g, (m, k: string) => { const d = asObj(vars[k]).default; return typeof d === 'string' ? d : m; });
  };
  const list = (spec: LoadedSpec) => (Array.isArray(spec.root.servers) ? spec.root.servers : []).map((s, i) => ({ url: resolved(s), i }));
  const bs = list(e.b);
  const as = list(e.a);
  const aSet = new Set(as.map((s) => normUrl(s.url)));
  const bSet = new Set(bs.map((s) => normUrl(s.url)));
  const removed = bs.filter((s) => !aSet.has(normUrl(s.url)));
  const added = as.filter((s) => !bSet.has(normUrl(s.url)));
  const ctx = baseCtx('servers', 'servers', ['servers']);
  removed.forEach((r, i) => {
    const n = added[i];
    e.emit(ctx, 'server-url-changed', {
      bLoc: rootLoc(e.b, 'servers', String(r.i)),
      aLoc: n ? rootLoc(e.a, 'servers', String(n.i)) : rootLoc(e.a, 'servers'),
      before: r.url,
      ...(n ? { after: n.url } : { kind: 'removed' as const }),
    });
  });
}

function compareTagDefinitions(e: Engine): void {
  const tags = (spec: LoadedSpec) => new Map((Array.isArray(spec.root.tags) ? spec.root.tags : []).map((t, i) => [String(asObj(t).name), { v: t, loc: rootLoc(spec, 'tags', String(i)) }]));
  const bt = tags(e.b);
  const at = tags(e.a);
  for (const [name, b] of bt) {
    const a = at.get(name);
    if (a) compareDocs(e, baseCtx(`tag ${name}`, `tag ${name}`, ['tags', name]), b, a);
  }
}

function compareSchemaRenames(e: Engine): void {
  const bS = asObj(asObj(e.b.root.components).schemas);
  const aS = asObj(asObj(e.a.root.components).schemas);
  const added = Object.keys(aS).filter((k) => !has(bS, k));
  const used = new Set<string>();
  for (const name of Object.keys(bS)) {
    if (has(aS, name)) continue;
    const s = stableStringify(bS[name]);
    const match = added.find((k) => !used.has(k) && stableStringify(aS[k]) === s);
    if (!match) continue;
    used.add(match);
    const ctx = baseCtx('components.schemas', name, [`components.schemas.${name}`], { component: true });
    e.emit(ctx, 'schema-renamed', { bLoc: rootLoc(e.b, 'components', 'schemas', name), aLoc: rootLoc(e.a, 'components', 'schemas', match), target: name, before: name, after: match });
  }
}

/** Webhooks and callbacks: what the API sends is judged like a response, what it receives like a request. */
function compareReversedOp(e: Engine, ctx: Ctx, b: SNode, a: SNode, webhook: boolean): void {
  compareDocs(e, ctx, b, a, { summary: true });
  const bo = asObj(b.v);
  const ao = asObj(a.v);
  if (bo.requestBody !== undefined && ao.requestBody !== undefined) {
    const bR = e.b.deref(bo.requestBody, child(b.loc, 'requestBody'));
    const aR = e.a.deref(ao.requestBody, child(a.loc, 'requestBody'));
    const rctx = enterRef({ ...ctx, dir: 'response', webhook, hp: push(ctx.hp, 'payload'), what: 'payload', field: undefined }, aR);
    const bn: SNode = { v: bR.value, loc: bR.loc };
    const an: SNode = { v: aR.value, loc: aR.loc };
    compareDocs(e, rctx, bn, an);
    compareContent(e, rctx, bn, an, 'response');
  }
  const br = asObj(bo.responses);
  const ar = asObj(ao.responses);
  for (const code of Object.keys(br)) {
    if (!has(ar, code)) continue;
    const bR = e.b.deref(br[code], child(child(b.loc, 'responses'), code));
    const aR = e.a.deref(ar[code], child(child(a.loc, 'responses'), code));
    const rctx = enterRef({ ...ctx, dir: 'request', hp: push(ctx.hp, `response ${code}`), what: `response ${code}`, field: undefined }, aR);
    compareContent(e, rctx, { v: bR.value, loc: bR.loc }, { v: aR.value, loc: aR.loc }, 'request');
  }
}

function compareWebhooks(e: Engine): void {
  const bW = asObj(e.b.root.webhooks);
  const aW = asObj(e.a.root.webhooks);
  for (const name of Object.keys(bW)) {
    const label = `webhook ${name}`;
    const ctx = baseCtx(label, label, [label]);
    if (!has(aW, name)) {
      e.emit(ctx, 'webhook-removed', { bLoc: rootLoc(e.b, 'webhooks', name), aLoc: has(e.a.root, 'webhooks') ? rootLoc(e.a, 'webhooks') : rootLoc(e.a), target: name });
      continue;
    }
    const bI = e.b.deref(bW[name], rootLoc(e.b, 'webhooks', name));
    const aI = e.a.deref(aW[name], rootLoc(e.a, 'webhooks', name));
    const aOps = operationsOf(aI);
    const bOps = operationsOf(bI);
    for (const op of bOps) {
      const other = aOps.find((x) => x.method === op.method);
      if (!other) continue;
      const octx = bOps.length > 1 ? { ...ctx, hp: push(ctx.hp, op.method) } : ctx;
      compareReversedOp(e, octx, op.node, other.node, true);
    }
  }
}

function compareCallbacks(e: Engine, ctx: Ctx, b: SNode, a: SNode): void {
  const bc = asObj(asObj(b.v).callbacks);
  const ac = asObj(asObj(a.v).callbacks);
  for (const name of Object.keys(bc)) {
    if (!has(ac, name)) continue;
    const bC = e.b.deref(bc[name], child(child(b.loc, 'callbacks'), name));
    const aC = e.a.deref(ac[name], child(child(a.loc, 'callbacks'), name));
    const bo = asObj(bC.value);
    const ao = asObj(aC.value);
    for (const expr of Object.keys(bo)) {
      if (!has(ao, expr) || expr.startsWith('x-')) continue;
      const bI = e.b.deref(bo[expr], child(bC.loc, expr));
      const aI = e.a.deref(ao[expr], child(aC.loc, expr));
      const aOps = operationsOf(aI);
      for (const op of operationsOf(bI)) {
        const other = aOps.find((x) => x.method === op.method);
        if (!other) continue;
        const cctx: Ctx = { ...ctx, hp: push(push(ctx.hp, `callback ${name}`), `${op.method} ${expr}`), what: name };
        compareReversedOp(e, cctx, op.node, other.node, false);
      }
    }
  }
}
