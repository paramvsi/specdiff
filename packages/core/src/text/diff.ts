// Text mode engine (TX-01..TX-11). Pure: runs in the worker and in Node.
import { diffArrays, diffChars, diffWordsWithSpace } from 'diff';
import type { Config, TextFilter } from '../schemas';

export type TextOptions = Config['text'];
export type SegKind = 'same' | 'add' | 'del';
export interface Seg { text: string; kind: SegKind }
export interface Side { n: number; segs: Seg[] }
export type RowType = 'same' | 'add' | 'del' | 'change';
export interface Row {
  type: RowType;
  left?: Side;
  right?: Side;
  /** TX-11: index into TextDiff.moves when this line was moved (type is 'del' at the source, 'add' at the destination). */
  move?: number;
}
/** TX-11: a block of ≥3 lines removed in one place and added in another. Line numbers are 1-based and inclusive. */
export interface Move {
  from: [number, number];
  to: [number, number];
  /** Row indexes of the first source row and the first destination row. */
  rows: [number, number];
  edited: boolean;
  /** Words changed inside the block (0 when moved unchanged). */
  words: number;
}
/** TX-12: lines a patch does not contain, shown before rows[row]. */
export interface Gap { row: number; before: number; after: number }
export interface FilterResult { name: string; hits: number; error?: string }
export interface TextDiff {
  rows: Row[];
  /** Index into rows where each change block starts (next/previous change, overview ruler). */
  blocks: number[];
  stats: { added: number; removed: number; changed: number };
  filters: FilterResult[];
  identical: boolean;
  /** TX-11: present when diffText was asked to detect moves. */
  moves?: Move[];
  /** TX-12: present for a comparison rebuilt from a patch. */
  gaps?: Gap[];
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

export interface DiffExtras {
  /** TX-11: detect blocks of lines moved elsewhere (opt-in so other modes keep their pairing). */
  moves?: boolean;
}

export function diffText(before: string, after: string, opts: TextOptions, extras: DiffExtras = {}): TextDiff {
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
  const found = extras.moves ? findMoves(parts, opts.ignoreCase) : null;

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
    const delPart = p.removed ? i : -1;
    const addPart = p.added ? i : next?.added && p.removed ? i + 1 : -1;
    const dels = p.removed ? p.value : [];
    const adds = p.added ? p.value : next?.added && p.removed ? next.value : [];
    if (p.removed && next?.added) i++;
    const movedDel = (k: number) => found?.lines.get(`${delPart}:${k}`);
    const movedAdd = (k: number) => found?.lines.get(`${addPart}:${k}`);
    if (found && (dels.some((_, k) => movedDel(k)) || adds.some((_, k) => movedAdd(k)))) {
      // A block that holds moved lines is not paired line by line: sources first, then destinations, in order.
      for (let k = 0; k < dels.length; k++) {
        const m = movedDel(k);
        rows.push(m ? { type: 'del', move: m.move, left: { n: ln++, segs: m.segs } } : { type: 'del', left: { n: ln++, segs: [{ text: dels[k]!, kind: 'del' }] } });
        stats.removed++;
      }
      for (let k = 0; k < adds.length; k++) {
        const m = movedAdd(k);
        rows.push(m ? { type: 'add', move: m.move, right: { n: rn++, segs: m.segs } } : { type: 'add', right: { n: rn++, segs: [{ text: adds[k]!, kind: 'add' }] } });
        stats.added++;
      }
      continue;
    }
    const pairs = Math.min(dels.length, adds.length);
    for (let k = 0; k < pairs; k++) {
      const [l, r] = inline(dels[k]!, adds[k]!, opts.precision, opts.ignoreCase);
      rows.push({ type: 'change', left: { n: ln++, segs: l }, right: { n: rn++, segs: r } });
      stats.changed++;
    }
    for (let k = pairs; k < dels.length; k++) { rows.push({ type: 'del', left: { n: ln++, segs: [{ text: dels[k]!, kind: 'del' }] } }); stats.removed++; }
    for (let k = pairs; k < adds.length; k++) { rows.push({ type: 'add', right: { n: rn++, segs: [{ text: adds[k]!, kind: 'add' }] } }); stats.added++; }
  }
  const out: TextDiff = { rows, blocks, stats, filters, identical: blocks.length === 0 };
  if (found) {
    out.moves = found.moves.map((m, idx) => {
      const fromRow = rows.findIndex((r) => r.move === idx && r.left);
      const toRow = rows.findIndex((r) => r.move === idx && r.right);
      const first = rows[fromRow]!.left!.n;
      const to = rows[toRow]!.right!.n;
      return { from: [first, first + m.length - 1], to: [to, to + m.length - 1], rows: [fromRow, toRow], edited: m.words > 0, words: m.words };
    });
  }
  return out;
}

// ---- TX-11 moved blocks ----

interface Part { value: string[]; added?: boolean; removed?: boolean }
interface MovedLine { move: number; segs: Seg[] }
interface Found { moves: Array<{ length: number; words: number }>; lines: Map<string, MovedLine> }

const MIN_MOVE = 3;
const BLOCK_SIMILARITY = 0.8;
const LINE_SIMILARITY = 0.5;
const MAX_CANDIDATES = 50;

/** Similarity of two lines: 1 when equal after whitespace normalisation, else the share of characters in common. */
function similarity(a: string, b: string, ignoreCase: boolean): { score: number; common: number; total: number } {
  const total = a.length + b.length;
  if (key(a, ignoreCase) === key(b, ignoreCase)) return { score: 1, common: total, total };
  if (!total) return { score: 1, common: 0, total: 0 };
  const common = diffChars(a, b, { ignoreCase }).filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.length, 0) * 2;
  return { score: common / total, common, total };
}
const key = (l: string, ignoreCase: boolean) => {
  const t = l.replace(/\s+/g, ' ').trim();
  return ignoreCase ? t.toLowerCase() : t;
};

/**
 * Find blocks of ≥3 consecutive lines removed in one place and added somewhere else: anchored on a line that is
 * equal after whitespace normalisation, extended both ways while lines stay similar, kept when the whole block
 * is ≥80% similar. A removed run directly followed by an added run is an edit, not a move.
 */
function findMoves(parts: Part[], ignoreCase: boolean): Found {
  const removed: Array<{ part: number; lines: string[] }> = [];
  const added: Array<{ part: number; lines: string[] }> = [];
  parts.forEach((p, i) => {
    if (p.removed) removed.push({ part: i, lines: p.value });
    else if (p.added) added.push({ part: i, lines: p.value });
  });
  const index = new Map<string, Array<{ c: number; k: number }>>();
  added.forEach((ch, c) =>
    ch.lines.forEach((l, k) => {
      const t = key(l, ignoreCase);
      if (t.length < 4) return; // "}", blank lines and the like are too common to anchor on
      const list = index.get(t) ?? [];
      list.push({ c, k });
      index.set(t, list);
    }),
  );
  const used = new Set<string>();
  const found: Found = { moves: [], lines: new Map() };
  const free = (part: number, k: number) => !used.has(`${part}:${k}`);

  for (const rc of removed) {
    for (let k = 0; k < rc.lines.length; k++) {
      if (!free(rc.part, k)) continue;
      const cands = index.get(key(rc.lines[k]!, ignoreCase));
      if (!cands || cands.length > MAX_CANDIDATES) continue;
      let best: { ac: number; i0: number; j0: number; len: number; common: number; total: number } | null = null;
      for (const { c, k: j } of cands) {
        const ac = added[c]!;
        if (ac.part === rc.part + 1 || !free(ac.part, j)) continue;
        let i0 = k;
        let j0 = j;
        let common = 0;
        let total = 0;
        const ok = (i: number, jj: number) => {
          if (i < 0 || jj < 0 || i >= rc.lines.length || jj >= ac.lines.length) return false;
          if (!free(rc.part, i) || !free(ac.part, jj)) return false;
          const s = similarity(rc.lines[i]!, ac.lines[jj]!, ignoreCase);
          if (s.score < LINE_SIMILARITY) return false;
          common += s.common;
          total += s.total;
          return true;
        };
        ok(k, j);
        while (ok(i0 - 1, j0 - 1)) { i0--; j0--; }
        let len = k - i0 + 1;
        while (ok(i0 + len, j0 + len)) len++;
        if (len < MIN_MOVE || (total && common / total < BLOCK_SIMILARITY)) continue;
        const meaningful = rc.lines.slice(i0, i0 + len).filter((l) => key(l, ignoreCase).length >= 3).length;
        if (meaningful < 2) continue;
        if (!best || len > best.len) best = { ac: c, i0, j0, len, common, total };
      }
      if (!best) continue;
      const ac = added[best.ac]!;
      const move = found.moves.length;
      let words = 0;
      for (let d = 0; d < best.len; d++) {
        const [l, r] = inline(rc.lines[best.i0 + d]!, ac.lines[best.j0 + d]!, 'word', ignoreCase);
        const changed = (segs: Seg[], kind: SegKind) => segs.filter((s) => s.kind === kind && s.text.trim()).length;
        words += Math.max(changed(l, 'del'), changed(r, 'add'));
        used.add(`${rc.part}:${best.i0 + d}`);
        used.add(`${ac.part}:${best.j0 + d}`);
        found.lines.set(`${rc.part}:${best.i0 + d}`, { move, segs: l });
        found.lines.set(`${ac.part}:${best.j0 + d}`, { move, segs: r });
      }
      found.moves.push({ length: best.len, words });
    }
  }
  // Number moves in the order their destinations appear, so "move 1" is the first one on screen.
  return renumber(found, parts);
}

function renumber(found: Found, parts: Part[]): Found {
  if (found.moves.length < 2) return found;
  const order: number[] = [];
  parts.forEach((p, i) => {
    if (!p.added) return;
    p.value.forEach((_, k) => {
      const m = found.lines.get(`${i}:${k}`)?.move;
      if (m !== undefined && !order.includes(m)) order.push(m);
    });
  });
  const map = new Map(order.map((old, idx) => [old, idx]));
  const lines = new Map([...found.lines].map(([k, v]) => [k, { ...v, move: map.get(v.move)! }]));
  return { moves: order.map((old) => found.moves[old]!), lines };
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
