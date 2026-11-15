// Structural JSON/YAML diff (JS-01..JS-06, JS-10, JS-11). Deterministic.
import type { Change, Config, Kind } from '../schemas';
import { jsonPathKey, type Parsed } from './parse';

export type JsonOptions = Config['json'];
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface JsonChange {
  kind: Kind;
  jsonPath: string;
  before?: unknown;
  after?: unknown;
  /** For moves: JSONPath on the other side. */
  from?: string;
}
export interface JsonDiff {
  changes: JsonChange[];
  stats: { added: number; removed: number; changed: number; moved: number; typeChanged: number };
  matchKeys: Record<string, string>; // array JSONPath (with [*]) → key used
}

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
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

export function diffJson(a: unknown, b: unknown, o: JsonOptions): JsonDiff {
  const changes: JsonChange[] = [];
  const matchKeys: Record<string, string> = {};
  const ignore = new Set(o.ignoreKeys);
  const eqNum = (x: number, y: number) => Math.abs(x - y) <= o.numberTolerance;

  const equal = (x: unknown, y: unknown): boolean => {
    if (typeof x === 'number' && typeof y === 'number') return eqNum(x, y);
    if (typeOf(x) !== typeOf(y)) return false;
    if (Array.isArray(x)) return stableIgnoring(x) === stableIgnoring(y);
    if (isObj(x)) return stableIgnoring(x) === stableIgnoring(y);
    return x === y;
  };
  const stableIgnoring = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stableIgnoring).join(',')}]`;
    if (isObj(v)) return `{${Object.keys(v).filter((k) => !ignore.has(k)).sort().map((k) => `${JSON.stringify(k)}:${stableIgnoring(v[k])}`).join(',')}}`;
    return JSON.stringify(v) ?? 'undefined';
  };

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
        if (inX && !inY) { if (!(o.nullEqualsMissing && x[k] === null)) changes.push({ kind: 'removed', jsonPath: p, before: x[k] }); }
        else if (!inX && inY) { if (!(o.nullEqualsMissing && y[k] === null)) changes.push({ kind: 'added', jsonPath: p, after: y[k] }); }
        else walk(x[k], y[k], p, s);
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
        if (!o.ignoreArrayOrder && !lis.has(k)) changes.push({ kind: 'moved', jsonPath: jsonPathKey(path, j), from: jsonPathKey(path, i), before: i, after: j });
        walk(x[i], y[j], p, s);
      }
      for (const [k, j] of iy) if (!ix.has(k)) changes.push({ kind: 'added', jsonPath: `${path}[?(@.${key}==${JSON.stringify((y[j] as Record<string, Json>)[key])})]`, after: y[j] });
      return;
    }
    if (o.ignoreArrayOrder || x.every((v) => typeof v !== 'object' || v === null)) {
      // Multiset match by value; scalars that only moved are moves (or nothing when order is ignored).
      const pool = new Map<string, number[]>();
      y.forEach((v, j) => { const h = stableIgnoring(v); pool.set(h, [...(pool.get(h) ?? []), j]); });
      const usedY = new Set<number>();
      const pairs: Array<[number, number]> = [];
      const removed: number[] = [];
      x.forEach((v, i) => { const js = pool.get(stableIgnoring(v)); const j = js?.shift(); if (j === undefined) removed.push(i); else { usedY.add(j); pairs.push([i, j]); } });
      const added = y.map((_, j) => j).filter((j) => !usedY.has(j));
      // Pair a removed with an added at the same index as a change (e.g. "refunds" → "disputes" in place).
      if (!o.ignoreArrayOrder) {
        const keep = stayed(pairs.map(([i]) => String(i)), [...pairs].sort((p, q) => p[1] - q[1]).map(([i]) => String(i)));
        for (const [i, j] of pairs) if (!keep.has(String(i))) changes.push({ kind: 'moved', jsonPath: jsonPathKey(path, j), from: jsonPathKey(path, i), before: i, after: j });
      }
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
  const stats = { added: 0, removed: 0, changed: 0, moved: 0, typeChanged: 0 };
  for (const c of changes) stats[c.kind === 'renamed' ? 'changed' : c.kind]++;
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
    const ap = after.positions.get(c.jsonPath) ?? nearest(after.positions, c.jsonPath);
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
  out.sort((x, y) => line(x) - line(y) || x.jsonPath!.localeCompare(y.jsonPath!) || x.kind.localeCompare(y.kind));
  out.forEach((c, i) => { c.id = `c-${String(i + 1).padStart(4, '0')}`; });
  return out;
}

const line = (c: Change) => c.location.before?.line ?? c.location.after?.line ?? 0;
function nearest(pos: Map<string, { line: number; column: number }>, p: string) {
  for (let q = p; q.length > 1; q = q.replace(/(\.[^.[\]]+|\[[^\]]*\])$/, '')) { const v = pos.get(q); if (v) return v; if (q === '$') break; }
  return undefined;
}
export function humanPath(jsonPath: string): string {
  return jsonPath.replace(/^\$\.?/, '').replace(/\[\?\(@\.(\w+)==("?)(.*?)\2\)\]/g, '[$1=$3]').replace(/\['(.*?)'\]/g, '.$1').replace(/\./g, ' › ') || '(root)';
}

/** FNV-1a 64-bit as hex: sync, deterministic, no WebCrypto. */
export function fnv(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}
