// A-09 structural rows: the file is diffed one declaration at a time (so a reformatted method can't be aligned
// with its neighbour's lines), moved declarations render as `↕` rows at their new place, and quiet edits fold
// under a label that names what was hidden (CD-06).
import type { CodeDiff, CodeItem, HiddenEdit } from '@specdiff/core/code';
import { diffText, type Row, type Seg, type TextOptions } from '@specdiff/core/text';

export type CodeRow =
  | { kind: 'row'; row: Row }
  | { kind: 'moved'; n: number; from: number; segs: Seg[]; first: boolean }
  | { kind: 'fold'; rows: Row[]; reason: string; id: number };

const OPTS: TextOptions = { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'smart', filters: [], transforms: [] };

const EDIT_NAMES: Record<HiddenEdit, string> = {
  whitespace: 'whitespace',
  'number-literal': 'number base',
  'trailing-comma': 'trailing comma',
  semicolon: 'semicolons',
  'keyword-argument-order': 'keyword order',
};

const plural = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;

/** The fold label for a formatting item: "14 lines reformatted, …" or the kinds of token edits it hid. */
export function formattingReason(n: number, edits: HiddenEdit[] | undefined): string {
  const kinds = (edits ?? ['whitespace']).filter((e) => e !== 'whitespace');
  return kinds.length ? `${plural(n)}: ${kinds.map((k) => EDIT_NAMES[k]).join(', ')} changed, no logic change` : `${plural(n)} reformatted, no logic change`;
}

const text = (s: Row['left']) => s?.segs.map((x) => x.text).join('') ?? '';
/** Renames identifiers outside string literals; after `.` only declaration renames apply (`req.amount()` is a member). */
const swapWords = (t: string, locals: Map<string, string>, decls: Map<string, string>) =>
  t.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\.\s*)?([A-Za-z_$][\w$]*)/g, (m, str: string | undefined, dot: string | undefined, w: string) =>
    str ? m : (dot ?? '') + ((dot ? undefined : locals.get(w)) ?? decls.get(w) ?? w));
const simple = (name: string) => name.slice(name.lastIndexOf('.') + 1);

export function structuralRows(diff: CodeDiff, before: string, after: string, opts: { hideRenames: boolean; hideComments: boolean }): CodeRow[] {
  const la = before.replace(/\r\n?/g, '\n').split('\n');
  const lb = after.replace(/\r\n?/g, '\n').split('\n');
  const inRange = (n: number, r?: [number, number]) => !!r && n >= r[0] && n <= r[1];
  const nests = (outer?: [number, number], inner?: [number, number]) => !!outer && !!inner && inner[0] >= outer[0] && inner[1] <= outer[1];
  const withLines = diff.items.filter((i) => i.lines.before || i.lines.after);
  // Leaves own their lines; a container's own lines (header, fields, braces) go with the top level.
  const blank = (ls: string[], n: number) => n >= 1 && (ls[n - 1] ?? '').trim() === '';
  // A moved declaration takes the blank line before it on both sides, so the blank lines left behind don't
  // pair up one place off (which made the left line numbers jump back).
  const leaves = withLines
    .filter((x) => !withLines.some((y) => y !== x && (nests(x.lines.after, y.lines.after) || nests(x.lines.before, y.lines.before))))
    .map((x) => {
      const a = x.lines.before, b = x.lines.after;
      return x.status === 'moved' && a && b && blank(la, a[0] - 1) && blank(lb, b[0] - 1)
        ? { ...x, lines: { before: [a[0] - 1, a[1]] as [number, number], after: [b[0] - 1, b[1]] as [number, number] } }
        : x;
    });
  const ownerA = (n: number) => leaves.find((i) => inRange(n, i.lines.before));
  const ownerB = (n: number) => leaves.find((i) => inRange(n, i.lines.after));

  // Every declaration rename applies everywhere (CD-03: its call sites follow it).
  const declRenames = new Map<string, string>();
  for (const i of diff.items) if (i.status === 'renamed' && i.from) declRenames.set(simple(i.from), simple(i.name));

  type Tagged = { row: Row; owner: CodeItem | undefined };
  const all: Tagged[] = [];
  const diffSlices = (a: number[], b: number[], owner: CodeItem | undefined) => {
    if (!a.length && !b.length) return;
    const join = (ls: string[], ns: number[]) => (ns.length ? ns.map((n) => ls[n - 1] ?? '').join('\n') + '\n' : '');
    const rows = diffText(join(la, a), join(lb, b), OPTS).rows;
    for (const r of rows) {
      const row: Row = { type: r.type, ...(r.left ? { left: { ...r.left, n: a[r.left.n - 1]! } } : {}), ...(r.right ? { right: { ...r.right, n: b[r.right.n - 1]! } } : {}) };
      all.push({ row, owner });
    }
  };
  const range = (r?: [number, number]) => (r ? Array.from({ length: r[1] - r[0] + 1 }, (_, k) => r[0] + k) : []);
  for (const leaf of leaves) diffSlices(range(leaf.lines.before), range(leaf.lines.after), leaf);
  const lastA = la.at(-1) === '' ? la.length - 1 : la.length, lastB = lb.at(-1) === '' ? lb.length - 1 : lb.length;
  diffSlices(range([1, lastA]).filter((n) => !ownerA(n)), range([1, lastB]).filter((n) => !ownerB(n)), undefined);

  // Order by the after file; a line that only exists before sits after the line it followed.
  const map = new Map<number, number>();
  for (const t of all) if (t.row.left && t.row.right && t.owner?.status !== 'moved') map.set(t.row.left.n, t.row.right.n);
  const known = [...map.keys()].sort((x, y) => x - y);
  const key = (r: Row) => {
    if (r.right) return r.right.n;
    let k = 0;
    for (const m of known) if (m < r.left!.n) k = map.get(m)!; else break;
    return k + 0.5;
  };
  all.sort((x, y) => key(x.row) - key(y.row) || (x.row.left?.n ?? 0) - (y.row.left?.n ?? 0));

  // Classify, then merge runs with the same fold reason.
  const isRenameOnly = (r: Row, owner: CodeItem | undefined) => {
    if (r.type !== 'change' || !owner || !['same', 'renamed', 'renamedLocals'].includes(owner.status)) return false;
    const locals = new Map((owner.renames ?? []).map((x) => [x.from, x.to] as [string, string]));
    return locals.size + declRenames.size > 0 && swapWords(text(r.left), locals, declRenames) === text(r.right);
  };
  const reasonOf = ({ row, owner }: Tagged): string | undefined => {
    if (owner?.status === 'formatting') return `fmt:${(owner.hiddenEdits ?? ['whitespace']).join(',')}`;
    if (owner?.status === 'comments' && opts.hideComments && row.type !== 'same') return 'comments';
    if (opts.hideRenames && isRenameOnly(row, owner)) return 'renames';
    return undefined;
  };
  const out: CodeRow[] = [];
  let id = 0;
  let noted: CodeItem | undefined;
  for (const t of all) {
    const reason = reasonOf(t);
    const last = out.at(-1);
    if (reason) {
      if (last?.kind === 'fold' && last.reason === reason) last.rows.push(t.row);
      else out.push({ kind: 'fold', rows: [t.row], reason, id: id++ });
      continue;
    }
    if (t.owner?.status === 'moved' && t.row.type === 'same' && t.row.left && t.row.right) {
      // "moved from line N" goes on the declaration's first line, not on the blank line it took along.
      const first = noted !== t.owner && text(t.row.right).trim() !== '';
      if (first) noted = t.owner;
      out.push({ kind: 'moved', n: t.row.right.n, from: t.row.left.n, segs: t.row.right.segs, first });
      continue;
    }
    out.push({ kind: 'row', row: t.row });
  }
  // Labels count the lines of the new file in the fold (the old ones when only those remain).
  for (const v of out) {
    if (v.kind !== 'fold') continue;
    const n = v.rows.filter((r) => r.right).length || v.rows.length;
    if (v.reason.startsWith('fmt:')) v.reason = formattingReason(n, v.reason.slice(4).split(',') as HiddenEdit[]);
    else if (v.reason === 'comments') v.reason = `${plural(n)}, only comments changed`;
    else v.reason = `${plural(n)} with renamed names, no logic change`;
  }
  // A fold of unchanged lines only (a formatting item whose rows happen to line up) shows as plain rows.
  const flat = out.flatMap((v) => (v.kind === 'fold' && v.rows.every((r) => r.type === 'same') ? v.rows.map((row) => ({ kind: 'row' as const, row })) : [v]));
  return foldContext(flat, id);
}

/** Lines of unchanged context kept next to each change (A-09); longer unchanged runs fold. */
export const CONTEXT = 3;

/** A-09: runs of unchanged rows longer than the context fold to "N unchanged lines" (Show opens them). */
function foldContext(rows: CodeRow[], firstId: number): CodeRow[] {
  const out: CodeRow[] = [];
  let id = firstId;
  const isSame = (v: CodeRow | undefined) => v?.kind === 'row' && v.row.type === 'same';
  for (let i = 0; i < rows.length; ) {
    if (!isSame(rows[i])) { out.push(rows[i]!); i++; continue; }
    let j = i;
    while (isSame(rows[j])) j++;
    const run = rows.slice(i, j) as Array<Extract<CodeRow, { kind: 'row' }>>;
    const head = i === 0 ? 0 : CONTEXT, tail = j === rows.length ? 0 : CONTEXT;
    // Fold only when it hides at least two lines; one hidden line is shown as itself.
    if (run.length - head - tail >= 2) {
      const hidden = run.slice(head, run.length - tail);
      out.push(...run.slice(0, head), { kind: 'fold', rows: hidden.map((r) => r.row), reason: `${plural(hidden.length).replace('line', 'unchanged line')}`, id: id++ }, ...run.slice(run.length - tail));
    } else out.push(...run);
    i = j;
  }
  return out;
}
