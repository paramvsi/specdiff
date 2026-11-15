// Markdown mode (MD-01..MD-07): block alignment, word-level marks in the rendered tree, outline,
// changed links, code-block diffs, broken anchors. Output HTML is sanitised (GitHub schema).
import { diffArrays, diffWordsWithSpace } from 'diff';
import GithubSlugger from 'github-slugger';
import type { ElementContent, Root as HastRoot } from 'hast';
import type { Link, Nodes, Parent, Root, RootContent, Text } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
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
}
export interface MdDiff {
  blocks: MdBlock[];
  outline: Array<{ depth: number; text: string; slug: string; status: BlockStatus }>;
  brokenAnchors: Array<{ anchor: string; line: number; renamedFrom?: string; renamedTo?: string }>;
  stats: { added: number; removed: number; edited: number };
}

const parser = unified().use(remarkParse).use(remarkGfm);
const schema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames ?? []), 'ins', 'del'] };
const toHtml = unified()
  .use(remarkRehype, {
    handlers: {
      // Custom mark nodes from the word diff.
      ins: (state: { all: (n: Parent) => ElementContent[] }, node: Parent) => ({ type: 'element', tagName: 'ins', properties: {}, children: state.all(node) }),
      del: (state: { all: (n: Parent) => ElementContent[] }, node: Parent) => ({ type: 'element', tagName: 'del', properties: {}, children: state.all(node) }),
    } as never,
  })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

function render(nodes: RootContent[]): string {
  const root: Root = { type: 'root', children: nodes };
  const hast = toHtml.runSync(root) as HastRoot;
  return String(toHtml.stringify(hast));
}

const plain = (n: Nodes): string => ('value' in n && (n.type === 'text' || n.type === 'inlineCode') ? n.value : 'children' in n ? n.children.map((c) => plain(c as Nodes)).join('') : '');
const checks = (n: RootContent): string => (n.type === 'list' ? n.children.map((li) => (li.checked == null ? '-' : li.checked ? 'x' : 'o')).join('') : '');
const signature = (n: RootContent): string => `${n.type}:${n.type === 'heading' ? n.depth : ''}:${checks(n)}:${n.type === 'code' ? `${n.lang ?? ''}\n${n.value}` : plain(n)}:${links(n).map((l) => l.url).join(' ')}`;
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
function markWords(before: RootContent, after: RootContent): RootContent {
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

function similar(a: RootContent, b: RootContent): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'heading' || a.type === 'code' || a.type === 'table' || a.type === 'list') return true;
  const parts = diffWordsWithSpace(plain(a), plain(b));
  const same = parts.filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.length, 0);
  return same >= Math.max(plain(a).length, plain(b).length) * 0.4;
}

export function diffMarkdown(before: string, after: string): MdDiff {
  const a = parser.parse(before).children;
  const b = parser.parse(after).children;
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
        blocks.push({ status: 'same', type: y.type, html: render([y]), lines: { before: lines(x), after: lines(y) }, ...(h ? { heading: h } : {}) });
      }
      continue;
    }
    const removed = p.removed ? a.slice(i, i + p.count!) : [];
    const nextP = parts[k + 1];
    const added = p.removed && nextP?.added ? b.slice(j, j + nextP.count!) : p.added ? b.slice(j, j + p.count!) : [];
    if (p.removed && nextP?.added) k++;
    // Pair removed/added blocks of the same kind, in order, as edits.
    let r = 0, s = 0;
    while (r < removed.length || s < added.length) {
      const x = removed[r], y = added[s];
      if (x && y && similar(x, y)) {
        const hb = headingOf(x, sa), h = headingOf(y, sb);
        if (hb) beforeSlugs.push(hb.slug);
        if (h) afterSlugs.push(h.slug);
        if (hb && h && hb.slug !== h.slug) renamed.set(hb.slug, h.slug);
        const la = links(x), lb = links(y);
        const changedLinks = lb.map((l, idx) => ({ text: l.text, before: la[idx]?.url ?? '', after: l.url })).filter((l) => l.before !== l.after);
        blocks.push({
          status: 'edited', type: y.type,
          html: x.type === 'code' ? render([y]) : render([markWords(x, y)]),
          beforeHtml: render([x]),
          lines: { before: lines(x), after: lines(y) },
          ...(h ? { heading: { ...h, beforeText: hb?.text ?? '' } } : {}),
          ...(x.type === 'code' && y.type === 'code' ? { code: { ...(y.lang ? { lang: y.lang } : {}), before: x.value, after: y.value } } : {}),
          ...(changedLinks.length ? { links: changedLinks } : {}),
        });
        stats.edited++; r++; s++; i++; j++;
      } else if (x && (!y || removed.length - r >= added.length - s)) {
        const hb = headingOf(x, sa);
        if (hb) beforeSlugs.push(hb.slug);
        blocks.push({ status: 'removed', type: x.type, html: render([x]), lines: { before: lines(x) }, ...(hb ? { heading: hb } : {}) });
        stats.removed++; r++; i++;
      } else if (y) {
        const h = headingOf(y, sb);
        if (h) afterSlugs.push(h.slug);
        blocks.push({ status: 'added', type: y.type, html: render([y]), lines: { after: lines(y) }, ...(h ? { heading: h } : {}) });
        stats.added++; s++; j++;
      }
    }
  }

  const outline = blocks.filter((bl) => bl.heading).map((bl) => ({ depth: bl.heading!.depth, text: bl.heading!.text, slug: bl.heading!.slug, status: bl.status }));
  const known = new Set(afterSlugs);
  const brokenAnchors: MdDiff['brokenAnchors'] = [];
  const walk = (n: Nodes) => {
    if (n.type === 'link' && n.url.startsWith('#')) {
      const anchor = decodeURIComponent(n.url.slice(1));
      if (!known.has(anchor)) {
        const to = renamed.get(anchor);
        brokenAnchors.push({ anchor, line: n.position?.start.line ?? 0, ...(beforeSlugs.includes(anchor) ? { renamedFrom: anchor } : {}), ...(to ? { renamedTo: to } : {}) });
      }
    }
    if ('children' in n) n.children.forEach((c) => walk(c as Nodes));
  };
  b.forEach((n) => walk(n));
  return { blocks, outline, brokenAnchors, stats };
}
