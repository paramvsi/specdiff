import { rules, type Change, type Config, type DecisionsFile, type Severity } from '@specdiff/core';
import type { HttpMethod } from '@specdiff/ui';

export const SEVERITIES: Severity[] = ['breaking', 'possibly', 'safe', 'docs'];
export const SEV_LABEL: Record<Severity, string> = { breaking: 'Breaking', possibly: 'Possibly breaking', safe: 'Safe', docs: 'Docs only' };
const RULE = new Map(rules.map((r) => [r.id, r]));
export const ruleOf = (id?: string) => (id ? RULE.get(id) : undefined);

export const methodOf = (c: Change): HttpMethod | undefined => {
  const m = c.operation?.method?.toUpperCase();
  return m && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m) ? (m as HttpMethod) : undefined;
};

export type GroupBy = 'path' | 'tag' | 'schema' | 'severity';
export function groupKey(c: Change, by: GroupBy): string {
  if (by === 'severity') return SEV_LABEL[c.severity ?? 'docs'];
  if (by === 'schema') return c.sharedSchema ? `components.schemas.${c.sharedSchema.name}` : c.sourceBlock?.startsWith('components.') ? c.sourceBlock : 'Operations';
  if (by === 'tag') {
    // OA-09: the operation's OpenAPI tags when the report carries them; older reports fall back to the path's resource.
    const tags = c.operation?.tags;
    if (tags?.length) return tags[0]!;
    return c.operation ? (c.operation.path.split('/').filter((x) => x && !/^v\d+$/.test(x))[0] ?? c.operation.path) : 'Document';
  }
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

/** "Rules on N of M" on the Summary and "N on" in Settings: one count, from the rule switches. */
export function rulesOn(config: Pick<Config, 'rules'>): { on: number; total: number } {
  const reported = rules.filter((r) => r.reportedAs === 'change' && r.severity);
  return { on: reported.filter((r) => config.rules[r.id]?.enabled !== false).length, total: reported.length };
}

// ---- OA-09 JSONPath search: `$.paths['/v1/payments']..`, `$.paths.*.get`, `$..maximum` ----
type Tok = { rec: true } | { name: string };
function tokens(path: string): Tok[] | null {
  if (!path.startsWith('$')) return null;
  const out: Tok[] = [];
  let i = 1;
  while (i < path.length) {
    if (path.startsWith('..', i)) { out.push({ rec: true }); i += 2; if (path[i] === '[' || i >= path.length) continue; }
    else if (path[i] === '.') i += 1;
    if (i >= path.length) break;
    if (path[i] === '[') {
      const q = path[i + 1];
      if (q === "'" || q === '"') {
        const close = path.indexOf(q + ']', i + 2);
        if (close < 0) return null;
        out.push({ name: path.slice(i + 2, close) });
        i = close + 2;
      } else {
        const close = path.indexOf(']', i);
        if (close < 0) return null;
        out.push({ name: path.slice(i + 1, close) });
        i = close + 1;
      }
    } else {
      const m = /^[^.[]+/.exec(path.slice(i));
      if (!m) return null;
      out.push({ name: m[0] });
      i += m[0].length;
    }
  }
  return out;
}
function matchToks(q: Tok[], t: Tok[], qi: number, ti: number): boolean {
  if (qi === q.length) return true; // a query matches every path below it
  const tok = q[qi]!;
  if ('rec' in tok) {
    for (let k = ti; k <= t.length; k++) if (matchToks(q, t, qi + 1, k)) return true;
    return false;
  }
  const at = t[ti];
  if (!at || 'rec' in at) return false;
  return (tok.name === '*' || tok.name === at.name) && matchToks(q, t, qi + 1, ti + 1);
}
/** True if `jsonPath` is at or below the JSONPath `query` (wildcards `*` and recursive `..`). */
export function matchJsonPath(query: string, jsonPath: string | undefined): boolean {
  if (!jsonPath) return false;
  const q = tokens(query.trim());
  const t = tokens(jsonPath);
  if (!q || !t) return jsonPath.toLowerCase().includes(query.trim().toLowerCase());
  return matchToks(q, t, 0, 0);
}
/** Search box: a query starting with `$` is JSONPath; anything else matches path, JSONPath, rule or title text. */
export function matchesSearch(c: Change, query: string, title = ''): boolean {
  const q = query.trim();
  if (!q) return true;
  if (q.startsWith('$')) return matchJsonPath(q, c.jsonPath);
  const l = q.toLowerCase();
  return c.path.toLowerCase().includes(l) || !!c.jsonPath?.toLowerCase().includes(l) || !!c.ruleId?.includes(l) || title.toLowerCase().includes(l);
}

// ---- OA-10 change detail: the edited block on each side, aligned on the change ----
const METHOD = /^(GET|PUT|POST|DELETE|PATCH|OPTIONS|HEAD|TRACE|QUERY) /;
/** The YAML/JSON key that starts the block a change lives in: `post`, `Card`, `info`. */
export function blockKey(c: Change): string | undefined {
  const sb = c.sourceBlock ?? (c.sharedSchema ? `components.schemas.${c.sharedSchema.name}` : undefined);
  if (!sb) return undefined;
  const m = METHOD.exec(sb);
  if (m) return m[1]!.toLowerCase();
  if (sb.startsWith('webhook ')) return sb.slice('webhook '.length);
  return sb.split('.').at(-1);
}
const indentOf = (l: string) => l.length - l.trimStart().length;
const keyRe = (key: string) => new RegExp(`^\\s*(?:-\\s+)?["']?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:`);

/**
 * The block whose key is `key` and that contains `line` (1-based), found by walking up the ancestors
 * (lines with less indentation). Undefined if the line is not inside such a block on this side.
 */
export function blockAt(content: string, line: number | undefined, key: string): { start: number; lines: string[] } | undefined {
  if (!line) return undefined;
  const all = content.split('\n');
  const re = keyRe(key);
  let i = Math.min(all.length, Math.max(1, line)) - 1;
  // Skip blank lines at the location.
  while (i > 0 && !all[i]!.trim()) i--;
  let limit = indentOf(all[i]!);
  let startIdx = re.test(all[i]!) ? i : -1;
  for (let k = i - 1; startIdx < 0 && k >= 0; k--) {
    const l = all[k]!;
    if (!l.trim() || l.trimStart().startsWith('#')) continue;
    const ind = indentOf(l);
    if (ind >= limit) continue;
    if (re.test(l)) startIdx = k;
    limit = ind;
    if (ind === 0 && startIdx < 0) return undefined;
  }
  if (startIdx < 0) return undefined;
  const base = indentOf(all[startIdx]!);
  let end = startIdx + 1;
  while (end < all.length) {
    const l = all[end]!;
    if (l.trim() && indentOf(l) <= base && !/^\s*[}\]]/.test(l)) break;
    if (l.trim() && indentOf(l) <= base) { end++; break; }
    end++;
  }
  while (end > startIdx + 1 && !all[end - 1]!.trim()) end--;
  return { start: startIdx + 1, lines: all.slice(startIdx, end) };
}

/** Before and after excerpts for a change: the same block on both sides, or a window when no block is found. */
export function excerpts(c: Change, before: string, after: string): { before: { start: number; lines: string[] }; after: { start: number; lines: string[] } } {
  const key = blockKey(c);
  const b = key ? blockAt(before, c.location.before?.line, key) : undefined;
  const a = key ? blockAt(after, c.location.after?.line, key) : undefined;
  if (b || a) return { before: b ?? { start: 1, lines: [] }, after: a ?? { start: 1, lines: [] } };
  return { before: lineWindow(before, c.location.before?.line ?? c.location.after?.line, 6), after: lineWindow(after, c.location.after?.line ?? c.location.before?.line, 6) };
}

export function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The value at a plain JSONPath (no wildcards) in a parsed document; `$ref`s are not followed. */
export function resolveJsonPath(doc: unknown, path: string | undefined): unknown {
  const t = path ? tokens(path) : null;
  if (!t) return undefined;
  let at: unknown = doc;
  for (const tok of t) {
    if ('rec' in tok || at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[tok.name];
  }
  return at;
}

/**
 * A-05 "Endpoints that return Card": where the shared schema sits in an endpoint's body ("card", "data[].card",
 * "data[]"), found by walking the operation's response (then request) schemas through local `$ref`s. Empty when
 * the schema is the whole body or can't be found.
 */
export function schemaLocation(spec: unknown, usage: string, schema: string): string {
  const [method, path] = usage.split(' ');
  const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
  const root = obj(spec);
  const op = obj(obj(obj(root?.paths)?.[path ?? ''])?.[(method ?? '').toLowerCase()]);
  if (!op) return '';
  const target = `#/components/schemas/${schema}`;
  const deref = (ref: string) => {
    const name = ref.startsWith('#/components/schemas/') ? ref.slice('#/components/schemas/'.length) : null;
    return name ? obj(obj(obj(root?.components)?.schemas)?.[name]) : undefined;
  };
  const walk = (s: Record<string, unknown> | undefined, at: string, seen: Set<string>, depth: number): string | null => {
    if (!s || depth > 10) return null;
    if (typeof s.$ref === 'string') {
      if (s.$ref === target) return at;
      if (seen.has(s.$ref)) return null;
      return walk(deref(s.$ref), at, new Set([...seen, s.$ref]), depth + 1);
    }
    for (const k of ['allOf', 'oneOf', 'anyOf'] as const)
      for (const sub of Array.isArray(s[k]) ? (s[k] as unknown[]) : []) {
        const r = walk(obj(sub), at, seen, depth + 1);
        if (r !== null) return r;
      }
    for (const [k, v] of Object.entries(obj(s.properties) ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const r = walk(obj(v), at ? `${at}.${k}` : k, seen, depth + 1);
      if (r !== null) return r;
    }
    const items = obj(s.items);
    return items ? walk(items, `${at}[]`, seen, depth + 1) : null;
  };
  const bodies = (container: unknown) => Object.values(obj(obj(container)?.content) ?? {}).map((m) => obj(obj(m)?.schema));
  const responses = Object.entries(obj(op.responses) ?? {}).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, r]) => bodies(r));
  for (const s of [...responses, ...bodies(op.requestBody)]) {
    const r = walk(s, '', new Set(), 0);
    if (r !== null) return r;
  }
  return '';
}

/** M-02 phone list: the one row that stands for every safe change. */
export const safeRowLabel = (n: number) => `${n} safe change${n === 1 ? '' : 's'}`;
