// W-04 rule page helpers (WEB-04): the focused before/after excerpt and the "Who it breaks" /
// "How to avoid it" text built from the rule's metadata and its fixture's real explanation.
import { changedLines, type Rule } from './rules';
import { RULE_COPY } from './rule-copy';

export type ExcerptRow = { kind: 'same' | 'rem' | 'add'; n: number; text: string } | { kind: 'gap' };

/** Line indent in spaces (blank lines count as unindented). */
const indent = (s: string) => (s.trim() ? s.length - s.trimStart().length : Infinity);

/**
 * The lines worth showing around a change: each changed line (or anchor) with `context` lines on
 * either side, plus the YAML parent lines above them so the reader knows where they are
 * (`paths:` › `/a:` › `post:` …).
 */
export function excerpt(lines: string[], changed: ReadonlySet<number>, anchors: number[], kind: 'rem' | 'add', context = 3): ExcerptRow[] {
  const keep = new Set<number>();
  const centres = changed.size ? [...changed] : anchors;
  for (const c of centres) for (let i = c - context; i <= c + context; i++) if (i >= 0 && i < lines.length) keep.add(i);
  // Parents of every kept line: the nearest line above with a smaller indent, recursively.
  for (const i of [...keep]) {
    let level = indent(lines[i]!);
    for (let j = i - 1; j >= 0 && level > 0; j--) {
      const d = indent(lines[j]!);
      if (d < level) { keep.add(j); level = d; }
    }
  }
  // As in the design, parent lines run straight into their children (indentation shows the
  // nesting); one gap row at the top and bottom marks the file as an excerpt.
  const rows = [...keep].sort((a, b) => a - b);
  const out: ExcerptRow[] = rows.map((i) => ({ kind: changed.has(i) ? kind : 'same', n: i + 1, text: lines[i]! }));
  if (rows.length && rows[0]! > 0) out.unshift({ kind: 'gap' });
  if (rows.length && rows.at(-1)! < lines.length - 1) out.push({ kind: 'gap' });
  return out;
}

/** Focused before/after excerpts for a fixture pair. */
export function focusedPair(before: string, after: string): { before: ExcerptRow[]; after: ExcerptRow[] } {
  const b = before.replace(/\n$/, '').split('\n');
  const a = after.replace(/\n$/, '').split('\n');
  const { removed, added } = changedLines(b, a);
  // Where a pure addition sits in the before file (and a pure removal in the after file), via the
  // matched prefix: the count of unchanged lines before it maps across both sides.
  const sameBefore = (limit: number, skip: ReadonlySet<number>) => {
    let n = 0;
    for (let i = 0; i < limit; i++) if (!skip.has(i)) n++;
    return n;
  };
  const nth = (count: number, skip: ReadonlySet<number>, len: number) => {
    let seen = 0;
    for (let i = 0; i < len; i++) if (!skip.has(i)) { if (seen === count) return i; seen++; }
    return Math.max(0, len - 1);
  };
  const anchorsInBefore = [...added].map((j) => nth(sameBefore(j, added), removed, b.length));
  const anchorsInAfter = [...removed].map((i) => nth(sameBefore(i, removed), added, a.length));
  return { before: excerpt(b, removed, anchorsInBefore, 'rem'), after: excerpt(a, added, anchorsInAfter, 'add') };
}

export interface Explanation {
  who: string;
  see: string;
  avoid: string;
}

const NOTHING = /^nothing to avoid\.?$/i;

/** "Who it breaks": the fixture's concrete who, then when it bites; `see` is shown on its own line. */
export function whoText(rule: Rule, e: Explanation): string {
  const when =
    rule.severity === 'breaking'
      ? rule.direction === 'request'
        ? 'It fails on the first call after you deploy: clients generated from the old spec keep sending what worked before.'
        : rule.direction === 'response'
          ? 'It fails as soon as the new server answers, even though the client itself did not change.'
          : 'It fails as soon as the new version is live, for every client that has not been updated.'
      : rule.severity === 'possibly'
        ? 'Whether it actually breaks depends on how strictly each client reads the API, so a reviewer decides.'
        : rule.severity === 'docs'
          ? 'Only the documentation changes; requests and responses stay the same.'
          : 'Requests and responses that worked before still work.';
  const sdk = rule.preset === 'K' ? ' Under the SDK preset this rule is breaking: names in generated code change, so client code stops compiling after regeneration.' : '';
  return `${e.who} ${when}${sdk}`;
}

/** "How to avoid it": the rule's own advice first, then the release options for its severity. */
export function avoidSteps(rule: Rule, e: Explanation): string[] {
  if (rule.severity !== 'breaking' && rule.severity !== 'possibly') return NOTHING.test(e.avoid.trim()) ? [] : [e.avoid];
  const steps = [e.avoid];
  steps.push(rule.severity === 'breaking'
    ? 'Or release the change in a new major version, and say so in the changelog.'
    : 'Or announce it in the changelog before you ship, so clients can prepare.');
  steps.push(rule.direction === 'request'
    ? 'Or accept both the old and the new request for a deprecation period, then switch with a dated `x-sunset`.'
    : rule.direction === 'response'
      ? 'Or keep returning the old form for a deprecation period, marked `deprecated` with an `x-sunset` date, then change it.'
      : 'Or keep the old behaviour working for a deprecation period with an `x-sunset` date, then remove it.');
  return steps;
}

export function copyFor(rule: Rule): { headline: string; intro: string } {
  return RULE_COPY[rule.id] ?? { headline: rule.title, intro: rule.change.replace(/\.?$/, '.') };
}
