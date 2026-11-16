// Structural JSON/YAML diff (JS-01..JS-06, JS-10, JS-11). Deterministic.
import type { Change, Config, Kind } from '../schemas';
import { jsonPathKey, type Parsed } from './parse';
import { byCodePoint } from '../order';
import { ExactNumber } from './numbers';

export type JsonOptions = Config['json'];
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface JsonChange {
  kind: Kind;
  jsonPath: string;
  before?: unknown;
  after?: unknown;
  /** For moves: JSONPath on the Before side (by index for array items). */
  from?: string;
  /** For moves of keyed array items: the item's index JSONPath on the After side (`jsonPath` is by key). */
  to?: string;
}
export interface JsonDiff {
  changes: JsonChange[];
  /**
   * Counts by kind. `nullVsMissing` counts a key that is `null` on one side and absent on the
   * other (JS-04); those are listed with kind `removed`/`added` but not counted there.
   */
  stats: { added: number; removed: number; changed: number; moved: number; typeChanged: number; nullVsMissing: number };
  matchKeys: Record<string, string>; // array JSONPath (with [*]) → key used
}

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof ExactNumber ? 'number' : typeof v);
const isObj = (v: unknown): v is Record<string, Json> => typeOf(v) === 'object';

export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}

const AUTO_KEYS = ['id', 'uuid', 'key', 'name'];

/** A key usable to match array items: present, scalar and unique in every item on both sides (JS-02). */
export function detectMatchKey(a: unknown[], b: unknown[], preferred: string): string | undefined {
  const candidates = preferred === 'auto' ? AUTO_KEYS : [preferred];
  const all = [...a, ...b];
  if (!all.length || !all.every(isObj)) return undefined;
  return candidates.find((k) => [a, b].every((side) => {
    const vals = side.map((it) => (it as Record<string, Json>)[k]);
    return vals.every((v) => typeof v === 'string' || typeof v === 'number') && new Set(vals.map(String)).size === vals.length;
  }));
}

const TOO_DEEP = 'These files are nested too deeply to compare (more levels than the browser allows).';

/** `Parsed.exactNumbers` of each side: those numbers are compared by their source text (M-2). */
export interface ExactNumbers { before?: Map<string, string> | undefined; after?: Map<string, string> | undefined }

/** Stand in an ExactNumber for each number listed at its JSONPath (a copy; only when there are any). */
function withExact(v: unknown, map: Map<string, string> | undefined, path = '$'): unknown {
  if (!map?.size) return v;
  if (typeof v === 'number') { const t = map.get(path); return t === undefined ? v : new ExactNumber(t, v); }
  if (Array.isArray(v)) return v.map((x, i) => withExact(x, map, jsonPathKey(path, i)));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withExact(x, map, jsonPathKey(path, k))]));
  return v;
}
const plain = (v: unknown): unknown =>
  v instanceof ExactNumber ? v.value : Array.isArray(v) ? v.map(plain) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;

/** Compare two parsed JSON/YAML values. Nesting deep enough to overflow the stack throws a plain Error. */
export function diffJson(a: unknown, b: unknown, o: JsonOptions, exact: ExactNumbers = {}): JsonDiff {
  try {
    if (!exact.before?.size && !exact.after?.size) return diffJsonUnchecked(a, b, o);
    const d = diffJsonUnchecked(withExact(a, exact.before), withExact(b, exact.after), o);
    for (const c of d.changes) { if (c.before !== undefined) c.before = plain(c.before); if (c.after !== undefined) c.after = plain(c.after); }
    return d;
  }
  catch (e) { if (e instanceof RangeError) throw new Error(TOO_DEEP); throw e; }
}

function diffJsonUnchecked(a: unknown, b: unknown, o: JsonOptions): JsonDiff {
  const changes: JsonChange[] = [];
  const nullMissing = new Set<JsonChange>();
  const push = (c: JsonChange, isNullMissing: boolean) => { changes.push(c); if (isNullMissing) nullMissing.add(c); };
  const matchKeys: Record<string, string> = {};
  const ignore = new Set(o.ignoreKeys);
  // M-2: a number the parser could not hold exactly equals only the same written value; tolerance
  // applies only inside the safe integer range, where a JS number is exact.
  const eqNum = (x: number | ExactNumber, y: number | ExactNumber) => {
    if (x instanceof ExactNumber || y instanceof ExactNumber) return String(x) === String(y) && x instanceof ExactNumber && y instanceof ExactNumber;
    if (Math.abs(x) > Number.MAX_SAFE_INTEGER || Math.abs(y) > Number.MAX_SAFE_INTEGER) return x === y;
    return Math.abs(x - y) <= o.numberTolerance;
  };

  const equal = (x: unknown, y: unknown): boolean => {
    if (typeOf(x) === 'number' && typeOf(y) === 'number') return eqNum(x as number | ExactNumber, y as number | ExactNumber);
    if (typeOf(x) !== typeOf(y)) return false;
    if (Array.isArray(x)) return stableIgnoring(x) === stableIgnoring(y);
    if (isObj(x)) return stableIgnoring(x) === stableIgnoring(y);
    return x === y;
  };
  // `canon` ignores key order (used to pool array items by value); `stableIgnoring` respects key
  // order unless ignoreKeyOrder is on (JS-01), so equality sees reordered keys as different.
  const hashWith = (sortKeys: boolean) => {
    const h = (v: unknown): string => {
      if (Array.isArray(v)) return `[${v.map(h).join(',')}]`;
      if (isObj(v)) {
        const keys = Object.keys(v).filter((k) => !ignore.has(k));
        return `{${(sortKeys ? keys.sort() : keys).map((k) => `${JSON.stringify(k)}:${h(v[k])}`).join(',')}}`;
      }
      if (v instanceof ExactNumber) return `#${v.text}`;
      return JSON.stringify(v) ?? 'undefined';
    };
    return h;
  };
  const canon = hashWith(true);
  const stableIgnoring = hashWith(o.ignoreKeyOrder);

  const walk = (x: unknown, y: unknown, path: string, shape: string) => {
    if (equal(x, y)) return;
    const tx = typeOf(x), ty = typeOf(y);
    if (tx !== ty) {
      if (o.nullEqualsMissing && ((x === null && y === undefined) || (y === null && x === undefined))) return;
      changes.push({ kind: 'typeChanged', jsonPath: path, before: x, after: y });
      return;
    }
    if (isObj(x) && isObj(y)) {
      const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !ignore.has(k)).sort();
      for (const k of keys) {
        const p = jsonPathKey(path, k), s = jsonPathKey(shape, k);
        const inX = Object.hasOwn(x, k), inY = Object.hasOwn(y, k);
        if (inX && !inY) { if (!(o.nullEqualsMissing && x[k] === null)) push({ kind: 'removed', jsonPath: p, before: x[k] }, x[k] === null); }
        else if (!inX && inY) { if (!(o.nullEqualsMissing && y[k] === null)) push({ kind: 'added', jsonPath: p, after: y[k] }, y[k] === null); }
        else walk(x[k], y[k], p, s);
      }
      if (!o.ignoreKeyOrder) {
        // JS-01: keys whose position changed among the keys both sides share (LIS: the fewest moves).
        const common = (obj: Record<string, Json>, other: Record<string, Json>) => Object.keys(obj).filter((k) => !ignore.has(k) && Object.hasOwn(other, k));
        const cx = common(x, y), cy = common(y, x);
        const keep = stayed(cx, cy);
        for (const k of cx) if (!keep.has(k)) changes.push({ kind: 'moved', jsonPath: jsonPathKey(path, k), before: cx.indexOf(k), after: cy.indexOf(k) });
      }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) return walkArray(x, y, path, shape);
    changes.push({ kind: 'changed', jsonPath: path, before: x, after: y });
  };

  const walkArray = (x: unknown[], y: unknown[], path: string, shape: string) => {
    const s = `${shape}[*]`;
    const key = detectMatchKey(x, y, o.arrayMatchKey);
    if (key) {
      matchKeys[s] = key;
      const idx = (arr: unknown[]) => new Map(arr.map((it, i) => [String((it as Record<string, Json>)[key]), i] as const));
      const ix = idx(x), iy = idx(y);
      // Order of the common items on each side, to tell real moves from shifts.
      const commonX = [...ix.keys()].filter((k) => iy.has(k));
      const commonY = [...iy.keys()].filter((k) => ix.has(k));
      const lis = stayed(commonX, commonY);
      for (const [k, i] of ix) {
        const p = `${path}[?(@.${key}==${JSON.stringify((x[i] as Record<string, Json>)[key])})]`;
        const j = iy.get(k);
        if (j === undefined) { changes.push({ kind: 'removed', jsonPath: p, before: x[i] }); continue; }
        // Reported by key (`flags[key=new_pricing]`, index i → j), not by index.
        if (!o.ignoreArrayOrder && !lis.has(k)) changes.push({ kind: 'moved', jsonPath: p, from: jsonPathKey(path, i), to: jsonPathKey(path, j), before: i, after: j });
        walk(x[i], y[j], p, s);
      }
      for (const [k, j] of iy) if (!ix.has(k)) changes.push({ kind: 'added', jsonPath: `${path}[?(@.${key}==${JSON.stringify((y[j] as Record<string, Json>)[key])})]`, after: y[j] });
      return;
    }
    if (o.ignoreArrayOrder || x.every((v) => !isObj(v) && !Array.isArray(v))) {
      // Multiset match by value; scalars that only moved are moves (or nothing when order is ignored).
      const pool = new Map<string, number[]>();
      y.forEach((v, j) => { const h = canon(v); pool.set(h, [...(pool.get(h) ?? []), j]); });
      const usedY = new Set<number>();
      const pairs: Array<[number, number]> = [];
      const removed: number[] = [];
      x.forEach((v, i) => { const js = pool.get(canon(v)); const j = js?.shift(); if (j === undefined) removed.push(i); else { usedY.add(j); pairs.push([i, j]); } });
      const added = y.map((_, j) => j).filter((j) => !usedY.has(j));
      // Pair a removed with an added at the same index as a change (e.g. "refunds" → "disputes" in place).
      if (!o.ignoreArrayOrder) {
        const keep = stayed(pairs.map(([i]) => String(i)), [...pairs].sort((p, q) => p[1] - q[1]).map(([i]) => String(i)));
        for (const [i, j] of pairs) if (!keep.has(String(i))) changes.push({ kind: 'moved', jsonPath: jsonPathKey(path, j), from: jsonPathKey(path, i), before: i, after: j });
      }
      // Same value but keys in another order (only possible with ignoreKeyOrder off).
      for (const [i, j] of pairs) walk(x[i], y[j], jsonPathKey(path, j), s);
      for (const i of removed) changes.push({ kind: 'removed', jsonPath: jsonPathKey(path, i), before: x[i] });
      for (const j of added) changes.push({ kind: 'added', jsonPath: jsonPathKey(path, j), after: y[j] });
      return;
    }
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) {
      const p = jsonPathKey(path, i);
      if (i >= y.length) changes.push({ kind: 'removed', jsonPath: p, before: x[i] });
      else if (i >= x.length) changes.push({ kind: 'added', jsonPath: p, after: y[i] });
      else walk(x[i], y[i], p, s);
    }
  };

  walk(a, b, '$', '$');
  const stats = { added: 0, removed: 0, changed: 0, moved: 0, typeChanged: 0, nullVsMissing: 0 };
  for (const c of changes) {
    if (nullMissing.has(c)) stats.nullVsMissing++;
    else stats[c.kind === 'renamed' ? 'changed' : c.kind]++;
  }
  return { changes, stats, matchKeys };
}

/** Items in the longest common subsequence of two orderings stayed; the rest moved. */
function stayed(xs: string[], ys: string[]): Set<string> {
  const pos = new Map(ys.map((k, i) => [k, i]));
  const seq = xs.map((k) => pos.get(k)!).filter((v) => v !== undefined);
  // Patience LIS, O(n log n).
  const tails: number[] = [], prev: number[] = new Array(seq.length).fill(-1), tailIdx: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m]! < v) lo = m + 1; else hi = m; }
    tails[lo] = v; tailIdx[lo] = i; prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  });
  const keep = new Set<string>();
  for (let i = tailIdx[tails.length - 1] ?? -1; i >= 0; i = prev[i]!) keep.add(ys[seq[i]!]!);
  return keep;
}

export function toChanges(d: JsonDiff, before: Parsed, after: Parsed, files: { before: string; after: string }, mode: 'json' | 'yaml'): Change[] {
  const out: Change[] = d.changes.map((c) => {
    const bp = before.positions.get(c.from ?? c.jsonPath) ?? nearest(before.positions, c.jsonPath);
    const ap = after.positions.get(c.to ?? c.jsonPath) ?? nearest(after.positions, c.jsonPath);
    return {
      id: '', fingerprint: fnv(`${c.kind}|${c.jsonPath}|${stable(c.before)}|${stable(c.after)}`), mode, kind: c.kind,
      path: humanPath(c.jsonPath), jsonPath: c.jsonPath,
      location: {
        ...(bp && c.kind !== 'added' ? { before: { file: files.before, ...bp } } : {}),
        ...(ap && c.kind !== 'removed' ? { after: { file: files.after, ...ap } } : {}),
      },
      ...(c.before !== undefined ? { before: c.before } : {}),
      ...(c.after !== undefined ? { after: c.after } : {}),
    };
  });
  out.sort((x, y) => line(x) - line(y) || byCodePoint(x.jsonPath!, y.jsonPath!) || byCodePoint(x.kind, y.kind));
  out.forEach((c, i) => { c.id = `c-${String(i + 1).padStart(4, '0')}`; });
  return out;
}

const line = (c: Change) => c.location.before?.line ?? c.location.after?.line ?? 0;
function nearest(pos: Map<string, { line: number; column: number }>, p: string) {
  for (let q = p; q.length > 1; q = q.replace(/(\.[^.[\]]+|\[[^\]]*\])$/, '')) { const v = pos.get(q); if (v) return v; if (q === '$') break; }
  return undefined;
}
export function humanPath(jsonPath: string): string {
  return jsonPath.replace(/^\$\.?/, '').replace(/\[\?\(@\.(\w+)==("?)(.*?)\2\)\]/g, '[$1=$3]').replace(/\['(.*?)'\]/g, '.$1').replace(/^\./, '').replace(/\./g, ' › ') || '(root)';
}

/** FNV-1a 64-bit as hex: sync, deterministic, no WebCrypto. */
export function fnv(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}
