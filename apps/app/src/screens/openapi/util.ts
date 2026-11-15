import { rules, type Change, type DecisionsFile, type Severity } from '@specdiff/core';
import type { HttpMethod } from '@specdiff/ui';

export const SEVERITIES: Severity[] = ['breaking', 'possibly', 'safe', 'docs'];
export const SEV_LABEL: Record<Severity, string> = { breaking: 'Breaking', possibly: 'Possibly breaking', safe: 'Safe', docs: 'Docs only' };
const RULE = new Map(rules.map((r) => [r.id, r]));
export const ruleOf = (id?: string) => (id ? RULE.get(id) : undefined);

export function target(c: Change): string {
  const last = c.path.split(' › ').at(-1) ?? '';
  return last.replace(/^(query|header|path|cookie) /, '');
}

/** "Request property became required" + currency → "Request property `currency` became required". */
export function headline(c: Change): { before: string; code?: string; after: string } {
  const title = ruleOf(c.ruleId)?.title ?? c.ruleId ?? c.kind;
  const t = target(c);
  if (!t || c.path.split(' › ').length === 1) return { before: title, after: '' };
  const m = /^(.*?\b(?:property|parameter|param|header|field|value|branch|schema|scope|status|webhook))\b(.*)$/i.exec(title);
  if (m) return { before: `${m[1]!.replace(/\bparam\b/i, 'parameter')} `, code: t, after: m[2]! };
  return { before: `${title}: `, code: t, after: '' };
}
export const headlineText = (c: Change) => { const h = headline(c); return `${h.before}${h.code ?? ''}${h.after}`; };

export const methodOf = (c: Change): HttpMethod | undefined => {
  const m = c.operation?.method?.toUpperCase();
  return m && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? (m as HttpMethod) : undefined;
};

export type GroupBy = 'path' | 'tag' | 'schema' | 'severity';
export function groupKey(c: Change, by: GroupBy): string {
  if (by === 'severity') return SEV_LABEL[c.severity ?? 'docs'];
  if (by === 'schema') return c.sharedSchema ? `components.schemas.${c.sharedSchema.name}` : c.sourceBlock?.startsWith('components.') ? c.sourceBlock : 'Operations';
  if (by === 'tag') return c.operation ? (c.operation.path.split('/')[2] ?? c.operation.path) : 'Document';
  return c.sourceBlock?.startsWith('components.') ? c.sourceBlock : c.operation?.path ?? c.sourceBlock ?? 'Document';
}

export function needsDecision(c: Change): boolean {
  return c.severity === 'breaking' || c.severity === 'possibly';
}

export function decisionOf(d: DecisionsFile, c: Change) {
  return d.decisions[c.fingerprint]?.decision ?? null;
}

export function reviewCounts(changes: Change[], d: DecisionsFile) {
  const relevant = changes.filter(needsDecision);
  const accepted = relevant.filter((c) => decisionOf(d, c) === 'accepted').length;
  const rejected = relevant.filter((c) => decisionOf(d, c) === 'rejected').length;
  return { total: relevant.length, accepted, rejected, open: relevant.length - accepted - rejected };
}

/** Lines around a location, 1-based, for the before/after detail panes. */
export function lineWindow(content: string, line: number | undefined, radius = 6): { start: number; lines: string[] } {
  const all = content.split('\n');
  const at = Math.max(1, line ?? 1);
  const start = Math.max(1, at - radius);
  return { start, lines: all.slice(start - 1, Math.min(all.length, at + radius)) };
}

export function copy(text: string) {
  return navigator.clipboard?.writeText(text);
}
