// Rendering for change titles and explanation text: identifiers in <code>, never literal backticks.
import { parseDocument, type Change } from '@specdiff/core';
import { Fragment } from 'react';
import { useApp } from '../../state/store';
import { changeTitle, codeSegments, refContext, type RefContext, type Seg } from './titles';

let cache: { content: string; ctx: RefContext; spec: unknown } | null = null;
/** Parsed after-spec (falls back to before) and where its shared schemas are used. Parsed once per content. */
export function specContext(content: string | undefined, name = 'spec.yaml'): { ctx: RefContext; spec: unknown } {
  if (!content) return { ctx: new Map(), spec: undefined };
  if (cache?.content !== content) {
    let spec: unknown;
    try { spec = parseDocument(content, name).value; } catch { spec = undefined; }
    cache = { content, ctx: refContext(spec), spec };
  }
  return { ctx: cache.ctx, spec: cache.spec };
}
export function useSpecContext() {
  const after = useApp((s) => s.after);
  const before = useApp((s) => s.before);
  const src = after ?? before;
  return specContext(src?.content, src?.name);
}

/** "Request field currency is now required" → "currency is now required" (lists with an endpoint column). */
export function shortSegs(segs: Seg[]): Seg[] {
  if (segs.length > 1 && !segs[0]!.code && segs[1]!.code && /^(Request field|Response field|Response enum|Query|Header|Cookie|Path parameter|Parameter|Optional request field|Required request field|Optional response field) $/.test(segs[0]!.text)) return segs.slice(1);
  return segs;
}

export function Segs({ segs, codeClass }: { segs: Seg[]; codeClass?: string | undefined }) {
  return <>{segs.map((s, i) => (s.code ? <code key={i} className={codeClass}>{s.text}</code> : <Fragment key={i}>{s.text}</Fragment>))}</>;
}

/** A change's designed title. `plain` keeps identifiers in the surrounding font (lists); `short` drops the family word. */
export function Title({ c, short, codeClass }: { c: Change; short?: boolean; codeClass?: string | undefined }) {
  const { ctx } = useSpecContext();
  const segs = changeTitle(c, ctx);
  return <Segs segs={short ? shortSegs(segs) : segs} codeClass={codeClass} />;
}

/** Text with `backticks` rendered as <code>. */
export function Md({ text, codeClass }: { text: string; codeClass?: string | undefined }) {
  return <Segs segs={codeSegments(text)} codeClass={codeClass} />;
}
