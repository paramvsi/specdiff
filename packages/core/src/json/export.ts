// Exports for JSON/YAML mode (JS-08). Patches are generated from the documents, so they always apply.
import type { JsonDiff } from './diff';
import { detectMatchKey, humanPath, stable } from './diff';

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string };

const ptr = (parts: Array<string | number>) => parts.map((p) => '/' + String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface PatchOptions {
  /** As `Config['json'].arrayMatchKey`: the key that identifies array items ('auto' tries id, uuid, key, name). */
  arrayMatchKey?: string;
}

/**
 * RFC 6902 JSON Patch that turns `a` into `b`, following the keyed structural diff (A07-JsonExport):
 * array items are matched by their key (or, for arrays of unique scalars, by value), so a removed item
 * is one `remove`, a new one one `add`, an item that moved one `move`, and a changed field one `replace`
 * at the item's final index. Arrays without a usable key fall back to index-by-index.
 */
export function jsonPatch(a: unknown, b: unknown, opts: PatchOptions = {}, at: Array<string | number> = []): PatchOp[] {
  if (stable(a) === stable(b)) return [];
  if (isObj(a) && isObj(b)) {
    const ops: PatchOp[] = [];
    for (const k of Object.keys(a).sort()) if (!Object.hasOwn(b, k)) ops.push({ op: 'remove', path: ptr([...at, k]) });
    for (const k of Object.keys(b).sort()) ops.push(...(Object.hasOwn(a, k) ? jsonPatch(a[k], b[k], opts, [...at, k]) : [{ op: 'add' as const, path: ptr([...at, k]), value: b[k] }]));
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyOf = itemKey(a, b, opts.arrayMatchKey ?? 'auto');
    return keyOf ? keyedArrayPatch(a, b, keyOf, opts, at) : positionalArrayPatch(a, b, opts, at);
  }
  return [{ op: 'replace', path: ptr(at), value: b }];
}

/** How array items are identified: by the detected match key, or by value when every item is a unique scalar. */
function itemKey(a: unknown[], b: unknown[], preferred: string): ((v: unknown) => string) | undefined {
  const key = detectMatchKey(a, b, preferred);
  if (key) return (v) => String((v as Record<string, unknown>)[key]);
  const scalar = (v: unknown) => v === null || typeof v !== 'object';
  const unique = (xs: unknown[]) => new Set(xs.map(stable)).size === xs.length;
  if ([...a, ...b].every(scalar) && unique(a) && unique(b)) return stable;
  return undefined;
}

function positionalArrayPatch(a: unknown[], b: unknown[], opts: PatchOptions, at: Array<string | number>): PatchOp[] {
  const ops: PatchOp[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) ops.push(...jsonPatch(a[i], b[i], opts, [...at, i]));
  for (let i = a.length - 1; i >= n; i--) ops.push({ op: 'remove', path: ptr([...at, i]) });
  for (let i = n; i < b.length; i++) ops.push({ op: 'add', path: ptr([...at, '-']), value: b[i] });
  return ops;
}

/**
 * Removes first, then moves (only items outside the longest run that kept its order), then adds at their
 * final index, then changes inside matched items at their final index. Every index is the one the array
 * has at that point of the patch, so the operations apply in order.
 */
function keyedArrayPatch(a: unknown[], b: unknown[], keyOf: (v: unknown) => string, opts: PatchOptions, at: Array<string | number>): PatchOp[] {
  const ops: PatchOp[] = [];
  const ka = a.map(keyOf), kb = b.map(keyOf);
  const inB = new Set(kb), inA = new Map(ka.map((k, i) => [k, i]));
  const cur = [...ka];
  for (let i = cur.length - 1; i >= 0; i--) {
    if (inB.has(cur[i]!)) continue;
    ops.push({ op: 'remove', path: ptr([...at, i]) });
    cur.splice(i, 1);
  }
  const target = kb.filter((k) => inA.has(k));
  const keep = longestKept(cur, target);
  target.forEach((k, t) => {
    if (keep.has(k)) return;
    const from = cur.indexOf(k);
    cur.splice(from, 1);
    const to = t === 0 ? 0 : cur.indexOf(target[t - 1]!) + 1;
    cur.splice(to, 0, k);
    if (from !== to) ops.push({ op: 'move', from: ptr([...at, from]), path: ptr([...at, to]) });
  });
  kb.forEach((k, j) => {
    if (inA.has(k)) return;
    ops.push({ op: 'add', path: ptr([...at, j === cur.length ? '-' : j]), value: b[j] });
    cur.splice(j, 0, k);
  });
  kb.forEach((k, j) => {
    const i = inA.get(k);
    if (i !== undefined) ops.push(...jsonPatch(a[i], b[j], opts, [...at, j]));
  });
  return ops;
}

/** Keys in the longest subsequence that has the same order on both sides (they stay; the rest move). */
function longestKept(xs: string[], ys: string[]): Set<string> {
  const pos = new Map(ys.map((k, i) => [k, i]));
  const seq = xs.map((k) => pos.get(k)!);
  const tails: number[] = [], tailIdx: number[] = [], prev: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m]! < v) lo = m + 1; else hi = m; }
    tails[lo] = v; tailIdx[lo] = i; prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  });
  const keep = new Set<string>();
  for (let i = tailIdx[tails.length - 1] ?? -1; i >= 0; i = prev[i]!) keep.add(xs[i]!);
  return keep;
}

/** RFC 7386 Merge Patch. Arrays are replaced whole; `null` deletes (so a null value in `b` cannot be expressed — reported). */
export function mergePatch(a: unknown, b: unknown): { patch: unknown; lossy: boolean } {
  let lossy = false;
  const go = (x: unknown, y: unknown): unknown => {
    if (!isObj(x) || !isObj(y)) { if (containsNull(y)) lossy = true; return y; }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x).sort()) if (!Object.hasOwn(y, k)) out[k] = null;
    for (const k of Object.keys(y).sort()) {
      if (!Object.hasOwn(x, k)) { if (containsNull(y[k])) lossy = true; out[k] = y[k]; }
      else if (stable(x[k]) !== stable(y[k])) { if (y[k] === null) lossy = true; out[k] = go(x[k], y[k]); }
    }
    return out;
  };
  return { patch: go(a, b), lossy };
}
const containsNull = (v: unknown): boolean => v === null || (isObj(v) && Object.values(v).some(containsNull));

export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isObj(patch)) return patch;
  const out: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, isObj(target) ? target : {});
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete out[k]; else out[k] = applyMergePatch(out[k], v); }
  return out;
}

export function jsonPathList(d: JsonDiff): string {
  return d.changes.map((c) => `${c.kind}\t${c.jsonPath}`).join('\n') + (d.changes.length ? '\n' : '');
}

const SYM: Record<string, string> = { added: '+', removed: '−', changed: '~', moved: '↕', typeChanged: '~', renamed: '~' };
const show = (v: unknown) => '`' + (JSON.stringify(v) ?? 'undefined').slice(0, 120) + '`';
export function jsonMarkdown(d: JsonDiff, names: { before: string; after: string }): string {
  const s = d.stats;
  const lines = [`# ${names.before} → ${names.after}`, '', `${d.changes.length} changes: ${s.added} added, ${s.removed} removed, ${s.changed} changed, ${s.typeChanged} type changed, ${s.moved} moved.`, ''];
  for (const c of d.changes) {
    const detail = c.kind === 'changed' || c.kind === 'typeChanged' ? `${show(c.before)} → ${show(c.after)}` : c.kind === 'added' ? show(c.after) : c.kind === 'removed' ? show(c.before) : `from ${c.from}`;
    lines.push(`- ${SYM[c.kind]} **${humanPath(c.jsonPath)}**${c.kind === 'typeChanged' ? ' (type changed)' : ''}: ${detail}`);
  }
  return lines.join('\n') + '\n';
}
