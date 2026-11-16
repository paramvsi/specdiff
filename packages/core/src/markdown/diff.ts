// Markdown mode (MD-01..MD-07): block alignment, word-level marks in the rendered tree, outline,
// changed links, code-block diffs, broken anchors. Output HTML is sanitised (GitHub schema).
import { diffArrays, diffWordsWithSpace } from 'diff';
import GithubSlugger from 'github-slugger';
import type { ElementContent, Root as HastRoot } from 'hast';
import type { Blockquote, Link, Nodes, Paragraph, Parent, Root, RootContent, Table, TableCell, TableRow, Text } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

export type BlockStatus = 'same' | 'added' | 'removed' | 'edited';
export interface MdLink { text: string; url: string }
export interface MdBlock {
  status: BlockStatus;
  type: string;
  html: string;
  /** For edited blocks, the before rendering (side-by-side view). */
  beforeHtml?: string;
  lines: { before?: [number, number]; after?: [number, number] };
  heading?: { depth: number; text: string; slug: string; beforeText?: string };
  code?: { lang?: string; before: string; after: string };
  links?: Array<{ text: string; before: string; after: string }>;
  /** MD-07: a GitHub alert blockquote (`> [!NOTE]`), rendered as `div.markdown-alert.markdown-alert-<kind>`. */
  callout?: CalloutKind;
}
export interface MdDiff {
  blocks: MdBlock[];
  outline: Array<{ depth: number; text: string; slug: string; status: BlockStatus }>;
  brokenAnchors: Array<{ anchor: string; line: number; renamedFrom?: string; renamedTo?: string }>;
  /** Changed blocks by status. */
  stats: { added: number; removed: number; edited: number };
  /**
   * Sections (a heading and the blocks up to the next heading; text before the first heading is one too):
   * added or removed with their heading, edited when the heading was renamed or any block in it changed.
   */
  sections: { added: number; removed: number; edited: number };
}

const parser = unified().use(remarkParse).use(remarkGfm);

// MD-07: GitHub alerts. `> [!NOTE]` … become
// `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p>…</div>`.
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';
const CALLOUTS: Record<CalloutKind, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;

const co = (n: RootContent): { callout?: CalloutKind } => { const k = calloutOf(n); return k ? { callout: k } : {}; };

function calloutOf(n: RootContent): CalloutKind | undefined {
  if (n.type !== 'blockquote') return undefined;
  const first = n.children[0];
  const t = first?.type === 'paragraph' ? first.children[0] : undefined;
  const m = t?.type === 'text' ? CALLOUT_RE.exec(t.value) : null;
  return m ? (m[1]!.toLowerCase() as CalloutKind) : undefined;
}

/** A copy of the block with alert blockquotes turned into callout elements (for rendering only). */
function withCallouts(n: RootContent): RootContent {
  const kind = calloutOf(n);
  if (!kind) return n;
  const q = structuredClone(n) as Blockquote;
  const first = q.children[0] as Paragraph;
  const t = first.children[0] as Text;
  t.value = t.value.replace(CALLOUT_RE, '');
  if (t.value === '') first.children.shift();
  if (first.children.length === 0) q.children.shift();
  const title: Paragraph = { type: 'paragraph', children: [{ type: 'text', value: CALLOUTS[kind] }], data: { hProperties: { className: ['markdown-alert-title'] } } };
  q.children.unshift(title);
  q.data = { hName: 'div', hProperties: { className: ['markdown-alert', `markdown-alert-${kind}`] } };
  return q;
}

const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'ins', 'del'],
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), ['className', 'markdown-alert', ...Object.keys(CALLOUTS).map((k) => `markdown-alert-${k}`)]],
    p: [...(defaultSchema.attributes?.p ?? []), ['className', 'markdown-alert-title']],
  },
};
type HastNode = HastRoot | ElementContent;
const textOf = (n: HastNode): string => (n.type === 'text' ? n.value : 'children' in n ? n.children.map((c) => textOf(c as HastNode)).join('') : '');
/** GFM task checkboxes have no label; name each one after its item's text (MD-07, axe "label"). */
function labelTaskBoxes(n: HastNode): void {
  if (!('children' in n)) return;
  if (n.type === 'element' && n.tagName === 'li') {
    const box = n.children.find((c) => c.type === 'element' && c.tagName === 'input' && c.properties.type === 'checkbox');
    if (box && box.type === 'element') box.properties.ariaLabel = textOf(n).trim() || 'Task';
  }
  for (const c of n.children) labelTaskBoxes(c as HastNode);
}
const toHtml = unified()
  .use(remarkRehype, {
    handlers: {
      // Custom mark nodes from the word diff.
      ins: (state: { all: (n: Parent) => ElementContent[] }, node: Parent) => ({ type: 'element', tagName: 'ins', properties: {}, children: state.all(node) }),
      del: (state: { all: (n: Parent) => ElementContent[] }, node: Parent) => ({ type: 'element', tagName: 'del', properties: {}, children: state.all(node) }),
    } as never,
  })
  .use(rehypeSanitize, schema)
  .use(() => labelTaskBoxes)
  .use(rehypeStringify);

/** A footnote definition rendered on its own (remark-rehype only renders them in a document-end section). */
function footnoteAsBlock(n: RootContent): RootContent {
  // A link reference definition renders as nothing; show it as text so a changed target is visible (MD-02).
  if (n.type === 'definition') return { type: 'paragraph', children: [{ type: 'text', value: `[${n.label ?? n.identifier}]: ${n.url}${n.title ? ` "${n.title}"` : ''}` }] };
  if (n.type !== 'footnoteDefinition') return n;
  const label: Text = { type: 'text', value: `[^${n.label ?? n.identifier}]: ` };
  const [first, ...rest] = n.children;
  if (first?.type === 'paragraph' && rest.length === 0) return { type: 'paragraph', children: [label, ...first.children] };
  return { type: 'blockquote', children: [{ type: 'paragraph', children: [label] }, ...n.children], data: { hName: 'div' } };
}

function render(nodes: RootContent[]): string {
  const root: Root = { type: 'root', children: nodes.map((n) => withCallouts(footnoteAsBlock(n))) };
  const hast = toHtml.runSync(root) as HastRoot;
  return String(toHtml.stringify(hast));
}

const plain = (n: Nodes): string => ('value' in n && (n.type === 'text' || n.type === 'inlineCode') ? n.value : 'children' in n ? n.children.map((c) => plain(c as Nodes)).join('') : '');
const checks = (n: RootContent): string => (n.type === 'list' ? n.children.map((li) => (li.checked == null ? '-' : li.checked ? 'x' : 'o')).join('') : '');
const signature = (n: RootContent): string => `${n.type}:${n.type === 'heading' ? n.depth : ''}:${checks(n)}:${n.type === 'code' ? `${n.lang ?? ''}\n${n.value}` : plain(n).replace(/\s+/g, ' ').trim()}:${links(n).map((l) => `${l.url}|${l.text}`).join(' ')}:${n.type === 'definition' ? `${n.identifier} ${n.url} ${n.title ?? ''}` : ''}`;
const lines = (n: RootContent): [number, number] => [n.position?.start.line ?? 0, n.position?.end.line ?? 0];

function links(n: Nodes): MdLink[] {
  const out: MdLink[] = [];
  const walk = (x: Nodes) => {
    if (x.type === 'link' || x.type === 'image') out.push({ text: x.type === 'image' ? (x.alt ?? '') : plain(x as Link), url: x.url });
    if ('children' in x) x.children.forEach((c) => walk(c as Nodes));
  };
  walk(n);
  return out;
}

/** Mark word-level changes inside the after block's text leaves. */
function markWords<T extends Nodes>(before: Nodes, after: T): T {
  const parts = diffWordsWithSpace(plain(before), plain(after));
  const clone = structuredClone(after);
  // Ranges in the after text to wrap in <ins>, and deletions to insert at an offset.
  const ins: Array<[number, number]> = [];
  const dels: Array<[number, string]> = [];
  let o = 0;
  for (const p of parts) {
    if (p.added) { ins.push([o, o + p.value.length]); o += p.value.length; }
    else if (p.removed) dels.push([o, p.value]);
    else o += p.value.length;
  }
  let pos = 0;
  const visit = (parent: Parent) => {
    const next: Nodes[] = [];
    for (const child of parent.children as Nodes[]) {
      if (child.type === 'text') {
        const start = pos, end = pos + child.value.length;
        const cuts = new Set([start, end]);
        for (const [a, b] of ins) { if (a > start && a < end) cuts.add(a); if (b > start && b < end) cuts.add(b); }
        for (const [a] of dels) if (a > start && a < end) cuts.add(a);
        const pts = [...cuts].sort((x, y) => x - y);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i]!, b = pts[i + 1]!;
          for (const [d, text] of dels) if (d === a) next.push({ type: 'del', children: [{ type: 'text', value: text }] } as never);
          const t: Text = { type: 'text', value: child.value.slice(a - start, b - start) };
          next.push(ins.some(([x, y]) => a >= x && b <= y) ? ({ type: 'ins', children: [t] } as never) : t);
        }
        pos = end;
      } else if (child.type === 'inlineCode') {
        const start = pos, end = pos + child.value.length;
        pos = end;
        next.push(ins.some(([x, y]) => x < end && y > start) ? ({ type: 'ins', children: [child] } as never) : child);
      } else {
        if ('children' in child) visit(child as Parent);
        next.push(child);
      }
    }
    // Deletions at the very end of this parent's text.
    for (const [d, text] of dels) if (d === pos && parent === clone && !next.some((n) => n.type === ('del' as never))) next.push({ type: 'del', children: [{ type: 'text', value: text }] } as never);
    (parent as { children: Nodes[] }).children = next;
  };
  if ('children' in clone) visit(clone as Parent);
  return clone;
}

/** A heading renamed to an unrelated title: the old title struck whole, then the new one, never word-merged. */
function renamedWhole(before: RootContent, after: RootContent): RootContent | undefined {
  if (before.type !== 'heading' || after.type !== 'heading' || bigramSimilarity(plain(before), plain(after)) >= 0.4) return undefined;
  return { ...structuredClone(after), children: [{ type: 'del', children: structuredClone(before.children) } as never, { type: 'ins', children: structuredClone(after.children) } as never] };
}

/**
 * GFM tables cell by cell: rows are matched by their first cell (or by position when that cell was edited),
 * each matched cell gets its own word marks, and new or dropped rows are whole <ins>/<del> rows.
 */
function markTable(before: Table, after: Table): Table {
  const clone = structuredClone(after);
  const rows = before.children;
  const keyOf = (r: TableRow) => (r.children[0] ? plain(r.children[0]) : '');
  const afterKeys = new Set(after.children.map(keyOf));
  const wrap = (cell: TableCell, tag: 'ins' | 'del'): TableCell => ({ ...cell, children: cell.children.length ? [{ type: tag, children: cell.children } as never] : [] });
  const used = new Set<number>();
  const out: TableRow[] = [];
  const dropUpTo = (end: number) => {
    for (let k = 0; k < end; k++) {
      if (used.has(k) || afterKeys.has(keyOf(rows[k]!))) continue;
      used.add(k);
      out.push({ ...structuredClone(rows[k]!), children: rows[k]!.children.map((c) => wrap(structuredClone(c), 'del')) });
    }
  };
  clone.children.forEach((row, ri) => {
    let m = rows.findIndex((r, k) => !used.has(k) && keyOf(r) === keyOf(row));
    // Same position and a similar first cell: that cell was edited.
    if (m < 0 && ri < rows.length && !used.has(ri) && !afterKeys.has(keyOf(rows[ri]!)) && bigramSimilarity(keyOf(rows[ri]!), keyOf(row)) >= 0.5) m = ri;
    if (m < 0) {
      out.push({ ...row, children: row.children.map((c) => wrap(c, 'ins')) });
      return;
    }
    dropUpTo(m);
    used.add(m);
    const br = rows[m]!;
    out.push({ ...row, children: row.children.map((c, k) => (br.children[k] ? markWords(br.children[k], c) : wrap(c, 'ins'))) });
  });
  dropUpTo(rows.length);
  clone.children = out;
  return clone;
}

/**
 * Which removed and added blocks of one hunk are edits of each other. Headings pair first (in order); blocks
 * under a heading that did not pair belong to a removed or added section and never pair. Other blocks pair
 * with the next similar block on the other side, without crossing a paired heading.
 */
function pairHunk(removed: RootContent[], added: RootContent[]): Array<[number, number]> {
  const heads = new Map<number, number>();
  let t0 = 0;
  // A heading that ends the hunk on both sides, at the same depth, is a rename however different the titles
  // are ("Environment variables" → "Configuration"): the section body after it is unchanged.
  const lastR = removed.length - 1, lastA = added.length - 1;
  removed.forEach((x, r) => {
    if (x.type !== 'heading') return;
    for (let t = t0; t < added.length; t++) {
      const y = added[t]!;
      if (y.type === 'heading' && (similar(x, y) || (r === lastR && t === lastA && y.depth === x.depth))) { heads.set(r, t); t0 = t + 1; return; }
    }
  });
  const pairedAdded = new Set(heads.values());
  const locked = (list: RootContent[], paired: (i: number) => boolean) => {
    const out = new Set<number>();
    let on = false;
    list.forEach((n, i) => { if (n.type === 'heading') on = !paired(i); else if (on) out.add(i); });
    return out;
  };
  const lockedR = locked(removed, (i) => heads.has(i)), lockedA = locked(added, (i) => pairedAdded.has(i));
  const pairs: Array<[number, number]> = [];
  let s = 0;
  removed.forEach((x, r) => {
    const h = heads.get(r);
    if (h !== undefined) { pairs.push([r, h]); s = h + 1; return; }
    if (x.type === 'heading' || lockedR.has(r)) return;
    for (let t = s; t < added.length && !pairedAdded.has(t); t++) {
      if (!lockedA.has(t) && added[t]!.type !== 'heading' && similar(x, added[t]!)) { pairs.push([r, t]); s = t + 1; return; }
    }
  });
  return pairs;
}

/** Dice coefficient of character bigrams, case-insensitive: 1 = same, 0 = nothing shared. */
function bigramSimilarity(x: string, y: string): number {
  const grams = (s: string) => { const m = new Map<string, number>(); const t = s.toLowerCase().replace(/\s+/g, ' ').trim(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let nx = 0, ny = 0, both = 0;
  for (const v of gx.values()) nx += v;
  for (const [g, v] of gy) { ny += v; both += Math.min(v, gx.get(g) ?? 0); }
  if (nx + ny === 0) return x.trim().toLowerCase() === y.trim().toLowerCase() ? 1 : 0;
  return (2 * both) / (nx + ny);
}

function similar(a: RootContent, b: RootContent): boolean {
  if (a.type !== b.type) return false;
  // A heading pairs as "edited" (renamed) only when the titles are alike ("Errors" → "Error codes");
  // an unrelated heading is a removed section plus an added one, never one merged heading.
  if (a.type === 'heading') return bigramSimilarity(plain(a), plain(b)) >= 0.4;
  if (a.type === 'code' || a.type === 'table' || a.type === 'list') return true;
  const parts = diffWordsWithSpace(plain(a), plain(b));
  const same = parts.filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.length, 0);
  const la = plain(a).length, lb = plain(b).length;
  // Mostly shared, or a short block kept almost whole inside a longer one (a sentence appended to it).
  return same >= Math.max(la, lb) * 0.4 || (Math.min(la, lb) >= 12 && same >= Math.min(la, lb) * 0.9);
}

/**
 * Leading YAML front matter (Jekyll, Hugo, Astro, Docusaurus) as a fenced YAML block on the same
 * lines, so it is compared as YAML instead of being read as a setext heading. No new dependency.
 */
const FRONT_MATTER = /^---[ \t]*(\r?\n)([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/;
const frontMatterAsCode = (s: string): string =>
  // Only when it reads as YAML (a `key:` line): a document may also open with a thematic break.
  s.replace(FRONT_MATTER, (m: string, nl: string, body: string) => (/^[\w"'-][^\n]*:(\s|$)/m.test(body) ? `~~~~yaml${nl}${body}${nl}~~~~` : m));

export function diffMarkdown(before: string, after: string): MdDiff {
  const a = parser.parse(frontMatterAsCode(before)).children;
  const b = parser.parse(frontMatterAsCode(after)).children;
  const parts = diffArrays(a.map(signature), b.map(signature));
  const blocks: MdBlock[] = [];
  const stats = { added: 0, removed: 0, edited: 0 };
  let i = 0, j = 0;
  const sa = new GithubSlugger(), sb = new GithubSlugger();
  const headingOf = (n: RootContent, slugger: GithubSlugger) => (n.type === 'heading' ? { depth: n.depth, text: plain(n), slug: slugger.slug(plain(n)) } : undefined);
  const beforeSlugs: string[] = [], afterSlugs: string[] = [];
  const renamed = new Map<string, string>(); // before slug → after slug

  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    if (!p.added && !p.removed) {
      for (let c = 0; c < p.count!; c++) {
        const x = a[i++]!, y = b[j++]!;
        const hb = headingOf(x, sa), h = headingOf(y, sb);
        if (hb) beforeSlugs.push(hb.slug);
        if (h) afterSlugs.push(h.slug);
        blocks.push({ status: 'same', type: y.type, html: render([y]), lines: { before: lines(x), after: lines(y) }, ...(h ? { heading: h } : {}), ...co(y) });
      }
      continue;
    }
    const removed = p.removed ? a.slice(i, i + p.count!) : [];
    const nextP = parts[k + 1];
    const added = p.removed && nextP?.added ? b.slice(j, j + nextP.count!) : p.added ? b.slice(j, j + p.count!) : [];
    if (p.removed && nextP?.added) k++;
    // Pair edits; the unpaired removed blocks before each edit come as one run, then the unpaired added ones,
    // so a removed section and an added section show as two groups, not interleaved block by block.
    const emitRemoved = (x: RootContent) => {
      const hb = headingOf(x, sa);
      if (hb) beforeSlugs.push(hb.slug);
      blocks.push({ status: 'removed', type: x.type, html: render([x]), lines: { before: lines(x) }, ...(hb ? { heading: hb } : {}), ...co(x) });
      stats.removed++;
    };
    const emitAdded = (y: RootContent) => {
      const h = headingOf(y, sb);
      if (h) afterSlugs.push(h.slug);
      blocks.push({ status: 'added', type: y.type, html: render([y]), lines: { after: lines(y) }, ...(h ? { heading: h } : {}), ...co(y) });
      stats.added++;
    };
    const emitEdited = (x: RootContent, y: RootContent) => {
      const hb = headingOf(x, sa), h = headingOf(y, sb);
      if (hb) beforeSlugs.push(hb.slug);
      if (h) afterSlugs.push(h.slug);
      if (hb && h && hb.slug !== h.slug) renamed.set(hb.slug, h.slug);
      const la = links(x), lb = links(y);
      const changedLinks = lb.map((l, idx) => ({ text: l.text, before: la[idx]?.url ?? '', after: l.url })).filter((l) => l.before !== l.after);
      const marked = x.type === 'code' ? y : x.type === 'table' && y.type === 'table' ? markTable(x, y) : renamedWhole(x, y) ?? markWords(x, y);
      blocks.push({
        status: 'edited', type: y.type,
        html: render([marked]),
        beforeHtml: render([x]),
        lines: { before: lines(x), after: lines(y) },
        ...(h ? { heading: { ...h, beforeText: hb?.text ?? '' } } : {}),
        ...(x.type === 'code' && y.type === 'code' ? { code: { ...(y.lang ? { lang: y.lang } : {}), before: x.value, after: y.value } } : {}),
        ...(changedLinks.length ? { links: changedLinks } : {}),
        ...co(y),
      });
      stats.edited++;
    };
    let r = 0, s = 0;
    for (const [pr, pa] of pairHunk(removed, added)) {
      for (; r < pr; r++) emitRemoved(removed[r]!);
      for (; s < pa; s++) emitAdded(added[s]!);
      emitEdited(removed[r++]!, added[s++]!);
    }
    for (; r < removed.length; r++) emitRemoved(removed[r]!);
    for (; s < added.length; s++) emitAdded(added[s]!);
    i += removed.length;
    j += added.length;
  }

  const outline = blocks.filter((bl) => bl.heading).map((bl) => ({ depth: bl.heading!.depth, text: bl.heading!.text, slug: bl.heading!.slug, status: bl.status }));
  const known = new Set(afterSlugs);
  const brokenAnchors: MdDiff['brokenAnchors'] = [];
  const walk = (n: Nodes) => {
    if (n.type === 'link' && n.url.startsWith('#')) {
      // A stray % (#save-50%) is not valid percent-encoding; read such an anchor as written.
      const raw = n.url.slice(1);
      let anchor = raw;
      try { anchor = decodeURIComponent(raw); } catch { /* keep raw */ }
      if (!known.has(anchor)) {
        const to = renamed.get(anchor);
        brokenAnchors.push({ anchor, line: n.position?.start.line ?? 0, ...(beforeSlugs.includes(anchor) ? { renamedFrom: anchor } : {}), ...(to ? { renamedTo: to } : {}) });
      }
    }
    if ('children' in n) n.children.forEach((c) => walk(c as Nodes));
  };
  b.forEach((n) => walk(n));
  return { blocks, outline, brokenAnchors, stats, sections: sectionStats(blocks) };
}

function sectionStats(blocks: MdBlock[]): MdDiff['sections'] {
  const out = { added: 0, removed: 0, edited: 0 };
  let status: BlockStatus = 'same', changed = false;
  const close = () => {
    if (status === 'added') out.added++;
    else if (status === 'removed') out.removed++;
    else if (changed) out.edited++;
  };
  for (const bl of blocks) {
    if (bl.heading) {
      close();
      status = bl.status;
      changed = bl.status !== 'same';
    } else if (bl.status !== 'same') changed = true;
  }
  close();
  return out;
}
