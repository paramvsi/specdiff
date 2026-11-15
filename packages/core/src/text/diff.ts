// Text mode engine (TX-01..TX-10). Pure: runs in the worker and in Node.
import { diffArrays, diffChars, diffWordsWithSpace } from 'diff';
import type { Config, TextFilter } from '../schemas';

export type TextOptions = Config['text'];
export type SegKind = 'same' | 'add' | 'del';
export interface Seg { text: string; kind: SegKind }
export interface Side { n: number; segs: Seg[] }
export type RowType = 'same' | 'add' | 'del' | 'change';
export interface Row { type: RowType; left?: Side; right?: Side }
export interface FilterResult { name: string; hits: number; error?: string }
export interface TextDiff {
  rows: Row[];
  /** Index into rows where each change block starts (next/previous change, overview ruler). */
  blocks: number[];
  stats: { added: number; removed: number; changed: number };
  filters: FilterResult[];
  identical: boolean;
}

export const MASK = /‹[^›\n]{1,40}›/g;

export function applyTransforms(text: string, transforms: TextOptions['transforms']): string {
  let t = text;
  for (const tr of transforms) {
    if (tr === 'normaliseLineBreaks') t = t.replace(/\r\n?/g, '\n');
    else if (tr === 'lowercase') t = t.toLowerCase();
    else if (tr === 'trim') t = t.split('\n').map((l) => l.trim()).join('\n');
    else if (tr === 'sortLines') t = t.split('\n').sort().join('\n');
  }
  return t;
}

/** Replace filter matches with their placeholder on one side; returns new text and hit counts. */
export function applyFilters(text: string, filters: TextFilter[], hits: FilterResult[]): string {
  let t = text;
  filters.forEach((f, i) => {
    const r = hits[i]!;
    if (r.error) return;
    try {
      const re = new RegExp(f.pattern, 'g');
      t = t.replace(re, () => { r.hits++; return f.replace; });
    } catch (e) {
      r.error = e instanceof Error ? e.message : 'Invalid pattern';
    }
  });
  return t;
}

function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function inline(a: string, b: string, precision: TextOptions['precision'], ignoreCase: boolean): [Seg[], Seg[]] {
  const parts = precision === 'char' ? diffChars(a, b, { ignoreCase }) : diffWordsWithSpace(a, b, { ignoreCase });
  const same = parts.filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.length, 0);
  // Smart: if the lines share little, highlighting every word is noise; show the whole line as changed.
  if (precision === 'smart' && same < Math.max(a.length, b.length) * 0.35) {
    return [[{ text: a, kind: 'del' }], [{ text: b, kind: 'add' }]];
  }
  const left: Seg[] = [];
  const right: Seg[] = [];
  for (const p of parts) {
    if (p.added) right.push({ text: p.value, kind: 'add' });
    else if (p.removed) left.push({ text: p.value, kind: 'del' });
    else { left.push({ text: p.value, kind: 'same' }); right.push({ text: p.value, kind: 'same' }); }
  }
  return [left, right];
}

export function diffText(before: string, after: string, opts: TextOptions): TextDiff {
  const filters: FilterResult[] = opts.filters.map((f) => ({ name: f.name, hits: 0 }));
  const prep = (s: string) => {
    let t = opts.ignoreLineEndings ? s.replace(/\r\n?/g, '\n') : s;
    t = applyTransforms(t, opts.transforms);
    return applyFilters(t, opts.filters, filters);
  };
  const a = prep(before);
  const b = prep(after);
  // jsdiff's ignoreWhitespace only trims ends; "ignore whitespace" here means any run of whitespace is equal.
  const norm = (l: string) => {
    let t = opts.ignoreWhitespace ? l.replace(/\s+/g, ' ').trim() : l;
    if (opts.ignoreCase) t = t.toLowerCase();
    return t;
  };
  const parts = diffArrays(splitLines(a), splitLines(b), { comparator: (l: string, r: string) => norm(l) === norm(r) });

  const rows: Row[] = [];
  const blocks: number[] = [];
  const stats = { added: 0, removed: 0, changed: 0 };
  let ln = 1;
  let rn = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (!p.added && !p.removed) {
      for (const line of p.value) rows.push({ type: 'same', left: { n: ln++, segs: [{ text: line, kind: 'same' }] }, right: { n: rn++, segs: [{ text: line, kind: 'same' }] } });
      continue;
    }
    blocks.push(rows.length);
    const next = parts[i + 1];
    const dels = p.removed ? p.value : [];
    const adds = p.added ? p.value : next?.added && p.removed ? next.value : [];
    if (p.removed && next?.added) i++;
    const pairs = Math.min(dels.length, adds.length);
    for (let k = 0; k < pairs; k++) {
      const [l, r] = inline(dels[k]!, adds[k]!, opts.precision, opts.ignoreCase);
      rows.push({ type: 'change', left: { n: ln++, segs: l }, right: { n: rn++, segs: r } });
      stats.changed++;
    }
    for (let k = pairs; k < dels.length; k++) { rows.push({ type: 'del', left: { n: ln++, segs: [{ text: dels[k]!, kind: 'del' }] } }); stats.removed++; }
    for (let k = pairs; k < adds.length; k++) { rows.push({ type: 'add', right: { n: rn++, segs: [{ text: adds[k]!, kind: 'add' }] } }); stats.added++; }
  }
  return { rows, blocks, stats, filters, identical: blocks.length === 0 };
}

/** Collapse runs of unchanged rows longer than 2*context into a fold marker (TX-05). */
export type View = { kind: 'row'; row: Row; index: number } | { kind: 'fold'; from: number; to: number };
export function foldRows(rows: Row[], context = 3, expanded: ReadonlySet<number> = new Set()): View[] {
  const out: View[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.type !== 'same') { out.push({ kind: 'row', row: rows[i]!, index: i }); i++; continue; }
    let j = i;
    while (j < rows.length && rows[j]!.type === 'same') j++;
    const head = i === 0 ? 0 : context;
    const tail = j === rows.length ? 0 : context;
    if (j - i > head + tail + 1 && !expanded.has(i + head)) {
      for (let k = i; k < i + head; k++) out.push({ kind: 'row', row: rows[k]!, index: k });
      out.push({ kind: 'fold', from: i + head, to: j - tail });
      for (let k = j - tail; k < j; k++) out.push({ kind: 'row', row: rows[k]!, index: k });
    } else {
      for (let k = i; k < j; k++) out.push({ kind: 'row', row: rows[k]!, index: k });
    }
    i = j;
  }
  return out;
}
