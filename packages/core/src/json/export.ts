// Exports for JSON/YAML mode (JS-08). Patches are generated from the documents, so they always apply.
import type { JsonDiff } from './diff';
import { humanPath, stable } from './diff';

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown };

const ptr = (parts: Array<string | number>) => parts.map((p) => '/' + String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** RFC 6902 JSON Patch that turns `a` into `b`. */
export function jsonPatch(a: unknown, b: unknown, at: Array<string | number> = []): PatchOp[] {
  if (stable(a) === stable(b)) return [];
  if (isObj(a) && isObj(b)) {
    const ops: PatchOp[] = [];
    for (const k of Object.keys(a).sort()) if (!Object.hasOwn(b, k)) ops.push({ op: 'remove', path: ptr([...at, k]) });
    for (const k of Object.keys(b).sort()) ops.push(...(Object.hasOwn(a, k) ? jsonPatch(a[k], b[k], [...at, k]) : [{ op: 'add' as const, path: ptr([...at, k]), value: b[k] }]));
    return ops;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const ops: PatchOp[] = [];
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) ops.push(...jsonPatch(a[i], b[i], [...at, i]));
    for (let i = a.length - 1; i >= n; i--) ops.push({ op: 'remove', path: ptr([...at, i]) });
    for (let i = n; i < b.length; i++) ops.push({ op: 'add', path: ptr([...at, '-']), value: b[i] });
    return ops;
  }
  return [{ op: 'replace', path: ptr(at), value: b }];
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
