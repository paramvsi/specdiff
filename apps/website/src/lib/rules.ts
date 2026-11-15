// Rules reference data (WEB-04), read at build time.
// Source order: `rules` exported from @specdiff/core when present; otherwise the tables in
// docs/06-openapi-rules.md (always present). docs/06 also supplies the one-line "what changed" text.
// Before/after YAML and the example changelog line come from fixtures/rules/<id>/ when they exist.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as core from '@specdiff/core';

export type Sev = 'breaking' | 'possibly' | 'safe' | 'docs';
export type Direction = 'request' | 'response' | 'both';

export interface Rule {
  id: string;
  title: string;
  /** One line from docs/06: what the change is. */
  change: string;
  severity: Sev | null;
  direction: Direction;
  /** W: same severity in both presets. K: raised to breaking under the SDK preset. */
  preset: 'W' | 'K';
  area: string;
  explanation?: { who: string; see: string; avoid: string };
  changelog?: string;
  /** Where the data came from, shown nowhere but useful in tests and the build log. */
  source: 'core' | 'docs';
}

export interface Fixture {
  dir: string;
  before?: string;
  after?: string;
  changelogLine?: string;
}

export const sevLabel: Record<Sev, string> = {
  breaking: 'Breaking',
  possibly: 'Possibly breaking',
  safe: 'Safe',
  docs: 'Docs only',
};
export const sevSymbol: Record<Sev, string> = { breaking: '!', possibly: '?', safe: '+', docs: '¶' };
export const sevOrder: Sev[] = ['breaking', 'possibly', 'safe', 'docs'];

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(process.cwd(), '../..');
}
export const ROOT = repoRoot();

// ---------------------------------------------------------------- docs/06 tables
const sectionArea: Record<string, string> = {
  'Endpoints and operations': 'Endpoints',
  Parameters: 'Parameters',
  'Request bodies': 'Request bodies',
  Responses: 'Responses',
  'Shared schemas and structure': 'Shared schemas',
  Security: 'Security',
  'Deprecation, sunset and versioning': 'Deprecation and versioning',
  'Servers, webhooks, other': 'Servers, webhooks, other',
};
const sevCode: Record<string, Sev> = { B: 'breaking', P: 'possibly', S: 'safe', D: 'docs' };

function directionOf(id: string): Direction {
  if (id.startsWith('request-')) return 'request';
  if (id.startsWith('response-')) return 'response';
  return 'both';
}

export function parseDocsTables(markdown: string): Rule[] {
  const out: Rule[] = [];
  let area: string | undefined;
  for (const line of markdown.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      area = sectionArea[h[1]!.trim()];
      continue;
    }
    if (!area || !line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || cells[0] === 'ID' || /^-+$/.test(cells[0]!)) continue;
    const [idCell, change, sev, preset = 'W'] = cells as [string, string, string, string?];
    for (const id of idCell.split('/').map((s) => s.trim())) {
      if (!/^[a-z0-9-]+$/.test(id)) continue;
      const docs = /^(description|summary|example)-changed$/.test(id);
      out.push({
        id,
        title: docs ? `${id.split('-')[0]![0]!.toUpperCase()}${id.split('-')[0]!.slice(1)} changed` : change.replace(/`/g, ''),
        change,
        severity: sevCode[sev] ?? null,
        direction: directionOf(id),
        preset: preset.startsWith('K') ? 'K' : 'W',
        area: docs ? 'Descriptions and examples' : area,
        source: 'docs',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- core
interface CoreRule {
  id: string;
  title: string;
  severity: Sev | null;
  direction: Direction;
  preset: string;
  area: string;
  explanation?: { who: string; see: string; avoid: string };
  changelog?: string;
}

function isCoreRule(r: unknown): r is CoreRule {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.area === 'string';
}

function fromCore(docsRules: Map<string, Rule>): Rule[] | undefined {
  const exported = (core as unknown as Record<string, unknown>).rules;
  if (!Array.isArray(exported) || !exported.every(isCoreRule) || exported.length === 0) return undefined;
  return exported.map((r) => ({
    id: r.id,
    title: r.title,
    change: docsRules.get(r.id)?.change ?? r.title,
    severity: r.severity,
    direction: r.direction,
    preset: r.preset.startsWith('K') ? 'K' : 'W',
    area: r.area,
    ...(r.explanation ? { explanation: r.explanation } : {}),
    ...(r.changelog ? { changelog: r.changelog } : {}),
    source: 'core' as const,
  }));
}

let cache: Rule[] | undefined;
export function loadRules(): Rule[] {
  if (cache) return cache;
  const docs = parseDocsTables(readFileSync(join(ROOT, 'docs/06-openapi-rules.md'), 'utf8'));
  cache = fromCore(new Map(docs.map((r) => [r.id, r]))) ?? docs;
  return cache;
}

export function areasOf(rules: Rule[]): string[] {
  return [...new Set(rules.map((r) => r.area))];
}

// ---------------------------------------------------------------- fixtures
function findChangelogLine(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const hit = findChangelogLine(x);
      if (hit) return hit;
    }
    return undefined;
  }
  const o = v as Record<string, unknown>;
  if (typeof o.changelogLine === 'string') return o.changelogLine;
  for (const x of Object.values(o)) {
    const hit = findChangelogLine(x);
    if (hit) return hit;
  }
  return undefined;
}

export function loadFixture(id: string): Fixture {
  const dir = `fixtures/rules/${id}`;
  const abs = join(ROOT, dir);
  const read = (f: string) => (existsSync(join(abs, f)) ? readFileSync(join(abs, f), 'utf8') : undefined);
  const before = read('before.yaml');
  const after = read('after.yaml');
  let changelogLine: string | undefined;
  const expected = read('expected.json');
  if (expected) {
    try {
      changelogLine = findChangelogLine(JSON.parse(expected));
    } catch {
      /* malformed fixture: leave the line out */
    }
  }
  return { dir, ...(before ? { before } : {}), ...(after ? { after } : {}), ...(changelogLine ? { changelogLine } : {}) };
}

// ---------------------------------------------------------------- text helpers
/** Fill core's {op}/{target}/{before}/{after} placeholders for prose. */
export function prose(template: string): string {
  const words: Record<string, string> = { op: 'the operation', target: 'the changed item', before: 'the old value', after: 'the new value' };
  // A placeholder written as code (`{target}`) becomes plain words, not code.
  return template.replace(/`\{(\w+)\}`/g, (m, k: string) => words[k] ?? m).replace(/\{(\w+)\}/g, (m, k: string) => words[k] ?? m);
}
/** Fill placeholders visibly, for the example changelog line. */
export function exampleLine(template: string): string {
  const words: Record<string, string> = { op: '‹operation›', target: '‹target›', before: '‹before›', after: '‹after›' };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => words[k] ?? m);
}
/** Split `inline code` out of a sentence. */
export function codeSegments(text: string): Array<{ code: boolean; text: string }> {
  return text.split('`').map((t, i) => ({ code: i % 2 === 1, text: t }));
}

export const directionLabel: Record<Direction, string> = {
  request: 'Request',
  response: 'Response',
  both: 'Request and response',
};

/** Changed lines between two small YAML files (for highlighting before/after). Plain LCS. */
export function changedLines(a: string[], b: string[]): { removed: Set<number>; added: Set<number> } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const removed = new Set<number>();
  const added = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) removed.add(i++);
    else added.add(j++);
  }
  while (i < n) removed.add(i++);
  while (j < m) added.add(j++);
  return { removed, added };
}
