// TX-12: open a pasted unified patch or `git diff` output as a text comparison. Pure: runs in the worker and in Node.
import { parsePatch } from 'diff';
import type { TextDiff } from './diff';

/** One side of a file rebuilt from a patch: the real line number of each rebuilt line, and where each hunk starts. */
export interface PatchSide {
  lines: number[];
  /** `at`: index into the rebuilt lines where the hunk starts; `skipped`: lines before it that the patch leaves out. */
  hunks: Array<{ at: number; skipped: number }>;
}

export interface PatchFile {
  /** Display name: the new path, or the old one for a deleted file (without git's a/ b/ prefixes). */
  name: string;
  oldName: string;
  newName: string;
  hunks: number;
  added: number;
  removed: number;
  before: string;
  after: string;
  beforeSide: PatchSide;
  afterSide: PatchSide;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;
const GIT = /^diff --git \S+ \S+/m;
const HEADERS = /^--- \S.*\n\+\+\+ \S.*\n@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;

/**
 * True when the text is a unified diff: a `diff --git` line followed by a hunk header, or `---`/`+++`
 * file headers directly followed by a hunk header. Markdown rules, YAML document markers or a stray
 * "@@" in prose don't qualify on their own.
 */
export function looksLikePatch(text: string): boolean {
  const head = text.slice(0, 200_000);
  if (!HUNK.test(head)) return false;
  return HEADERS.test(head.replace(/\r\n/g, '\n')) || (GIT.test(head) && HUNK.test(head));
}

const strip = (n: string | undefined) => (n ?? '').replace(/^[ab]\//, '').replace(/\t.*$/, '');

/** Parse every file in a patch. Throws a readable Error when a hunk is malformed. */
export function parseUnifiedPatch(text: string): PatchFile[] {
  let parsed;
  try {
    parsed = parsePatch(text.replace(/\r\n/g, '\n'));
  } catch (e) {
    throw new Error(`This patch can't be read: ${e instanceof Error ? e.message : String(e)}.`, { cause: e });
  }
  const out: PatchFile[] = [];
  for (const f of parsed) {
    if (!f.hunks.length) continue;
    const oldName = strip(f.oldFileName);
    const newName = strip(f.newFileName);
    const before: string[] = [];
    const after: string[] = [];
    const beforeSide: PatchSide = { lines: [], hunks: [] };
    const afterSide: PatchSide = { lines: [], hunks: [] };
    let added = 0;
    let removed = 0;
    let prevOld = 1;
    let prevNew = 1;
    for (const h of f.hunks) {
      // An empty side is written "-0,0"; jsdiff reports it as start 1 with 0 lines, so nothing is skipped.
      const oldStart = h.oldStart;
      const newStart = h.newStart;
      beforeSide.hunks.push({ at: before.length, skipped: Math.max(0, oldStart - prevOld) });
      afterSide.hunks.push({ at: after.length, skipped: Math.max(0, newStart - prevNew) });
      let o = oldStart;
      let n = newStart;
      for (const line of h.lines) {
        const tag = line[0];
        const body = line.slice(1);
        if (tag === '\\') continue; // "\ No newline at end of file"
        if (tag === '-' || tag === ' ') {
          before.push(body);
          beforeSide.lines.push(o++);
        }
        if (tag === '+' || tag === ' ') {
          after.push(body);
          afterSide.lines.push(n++);
        }
        if (tag === '-') removed++;
        if (tag === '+') added++;
      }
      prevOld = o;
      prevNew = n;
    }
    out.push({
      name: newName && newName !== '/dev/null' ? newName : oldName,
      oldName,
      newName,
      hunks: f.hunks.length,
      added,
      removed,
      before: before.length ? before.join('\n') + '\n' : '',
      after: after.length ? after.join('\n') + '\n' : '',
      beforeSide,
      afterSide,
    });
  }
  return out;
}

/**
 * Give a diff of the rebuilt hunks the file's real line numbers, and mark where lines the patch leaves out
 * would be (TX-12 folds labelled with the skipped line counts).
 */
export function layoutPatch(diff: TextDiff, before: PatchSide, after: PatchSide): TextDiff {
  const gaps: NonNullable<TextDiff['gaps']> = [];
  const count = Math.max(before.hunks.length, after.hunks.length);
  for (let h = 0; h < count; h++) {
    const b = before.hunks[h];
    const a = after.hunks[h];
    const skippedB = b?.skipped ?? 0;
    const skippedA = a?.skipped ?? 0;
    if (!skippedB && !skippedA) continue;
    // The first row that belongs to this hunk on either side.
    const row = diff.rows.findIndex(
      (r) => (b !== undefined && r.left !== undefined && r.left.n - 1 >= b.at) || (a !== undefined && r.right !== undefined && r.right.n - 1 >= a.at),
    );
    if (row >= 0 && !gaps.some((g) => g.row === row)) gaps.push({ row, before: skippedB, after: skippedA });
  }
  const real = (side: PatchSide, n: number) => side.lines[n - 1] ?? n;
  const rows = diff.rows.map((r) => ({
    ...r,
    ...(r.left ? { left: { ...r.left, n: real(before, r.left.n) } } : {}),
    ...(r.right ? { right: { ...r.right, n: real(after, r.right.n) } } : {}),
  }));
  const moves = diff.moves?.map((m) => ({
    ...m,
    from: [real(before, m.from[0]), real(before, m.from[1])] as [number, number],
    to: [real(after, m.to[0]), real(after, m.to[1])] as [number, number],
  }));
  return { ...diff, rows, ...(moves ? { moves } : {}), gaps };
}
