// Report builder (docs/07 §2): runs the engine, dedups shared-schema findings (OA-14), applies
// presets (OA-19), rule overrides, ignores and noise options (OA-12), and produces a sorted,
// deterministic report with stable ids and fingerprints (X-13).
// '.js': picomatch has no exports map, and plain Node ESM needs the file name.
import picomatch from 'picomatch/posix.js';
import { Config, type Change, type ConfigInput, type Report, type Severity } from '../schemas';
import { Engine, type Finding } from '../openapi/engine';
import { fnv1a64, stableStringify } from '../openapi/hash';
import { type Input, type LoadedSpec, type Loc, chainToArray, loadSpec } from '../openapi/load';
import { compareDocument } from '../rules/operations';
import { fillChangelog, fillTemplate, getRule } from '../rules/catalogue';
import { versionCheck } from './version';

// The report names the package version that produced it (Changesets bumps package.json).
import { version as GENERATOR_VERSION } from '../../package.json';

export type CompareStep = 'parse' | 'resolve' | 'normalise' | 'compare';

export interface CompareOptions {
  /** "Today" for sunset rules (OA-17); defaults to the current date. ISO date string or Date. */
  today?: string | Date;
  /**
   * IN-08: called as each real stage starts. Per side: `parse` (detail: the file name), then
   * `normalise` (version upgrade to 3.1). Then `resolve` once, when the walk over both documents
   * starts (`$ref`s are resolved lazily during that walk, so resolving and rule checks interleave),
   * and `compare` once, when the findings are deduplicated, ranked and sorted into the report.
   */
  onProgress?: (step: CompareStep, detail?: string) => void;
}

const SEVERITY_ORDER: Severity[] = ['breaking', 'possibly', 'safe', 'docs'];

function trim(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 300 ? `${v.slice(0, 300)}…` : v;
  if (v === null || typeof v !== 'object') return v;
  if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) {
    const out = v.slice(0, 20).map((x) => trim(x, depth + 1));
    if (v.length > 20) out.push('…');
    return out;
  }
  const out: Record<string, unknown> = {};
  const keys = Object.keys(v);
  for (const k of keys.slice(0, 30)) Object.defineProperty(out, k, { value: trim((v as Record<string, unknown>)[k], depth + 1), enumerable: true, writable: true, configurable: true });
  if (keys.length > 30) out['…'] = '…';
  return out;
}

/** Short text for templates: "maximum 50", "integer", "query parameter limit". */
export function display(v: unknown): string {
  if (v === undefined || v === null) return 'none';
  if (typeof v === 'string') return v;
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map(display).join(', ');
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    const k = keys[0] as string;
    const x = o[k];
    return `${k} ${Array.isArray(x) ? `[${x.map(display).join(', ')}]` : display(x)}`;
  }
  if (typeof o.in === 'string' && typeof o.name === 'string') return `${o.in} parameter ${o.name}`;
  if (typeof o.operationId === 'string') return o.operationId;
  const s = JSON.stringify(o);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

const locKey = (l: Loc) => `${l.file}#${chainToArray(l.ptr).join('/')}`;

interface Group {
  rep: Finding;
  usages: Set<string>;
}

function parseToday(t: CompareOptions['today']): Date {
  const d = t === undefined ? new Date() : t instanceof Date ? t : new Date(Date.parse(t));
  // Compare by calendar day (UTC).
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isIgnored(f: Finding, matchers: Array<{ glob: string; test: (s: string) => boolean }>): boolean {
  if (matchers.length === 0) return false;
  const opPaths = new Set<string>();
  if (f.op) opPaths.add(f.op.path);
  const m = /^[A-Z]+ (\/.*)$/.exec(f.usage);
  if (m?.[1]) opPaths.add(m[1]);
  const segs = new Set([...chainToArray(f.bLoc.ptr), ...chainToArray(f.aLoc.ptr), ...f.block.split('.')]);
  for (const { glob, test } of matchers) {
    if (glob.includes('/')) {
      for (const p of opPaths) if (test(p)) return true;
    } else {
      for (const s of segs) if (test(s)) return true;
    }
  }
  return false;
}

export function compareOpenApi(before: Input, after: Input, config?: ConfigInput, opts: CompareOptions = {}): Report {
  const cfg = Config.parse(config ?? {});
  const progress = opts.onProgress;
  const load = (input: Input) => loadSpec(input, { autoUpgrade: cfg.openapi.autoUpgrade, ...(progress ? { onStage: (st: 'parse' | 'normalise') => progress(st, input.name) } : {}) });
  const b = load(before);
  const a = load(after);
  const engine = new Engine(b, a, { openapi: cfg.openapi, ignoreExtensions: cfg.ignore.extensions, today: parseToday(opts.today) });
  progress?.('resolve');
  compareDocument(engine);
  progress?.('compare');

  const matchers = cfg.ignore.paths.map((glob) => ({ glob, test: picomatch(glob, { dot: true }) }));
  const groups = new Map<string, Group>();
  for (const f of engine.sink) {
    if (cfg.rules[f.ruleId]?.enabled === false) continue;
    if (isIgnored(f, matchers)) continue;
    const key = `${f.ruleId}|${locKey(f.bLoc)}|${locKey(f.aLoc)}|${f.target}|${stableStringify(f.before)}|${stableStringify(f.after)}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { rep: f, usages: new Set([f.usage]) });
    else {
      g.usages.add(f.usage);
      if (f.usage < g.rep.usage) g.rep = f;
    }
  }

  const changes: Change[] = [];
  for (const { rep: f, usages } of groups.values()) {
    const rule = getRule(f.ruleId);
    let severity: Severity = f.severity ?? rule.severity ?? 'docs';
    if (cfg.preset === 'sdk' && rule.preset === 'K→B') severity = 'breaking';
    const override = cfg.rules[f.ruleId]?.severity;
    if (override) severity = override;
    if (cfg.openapi.hideDocsOnly && severity === 'docs') continue;
    changes.push(toChange(f, usages, severity, b, a));
  }

  changes.sort((x, y) => {
    const xa = x.location.after;
    const ya = y.location.after;
    return (
      cmp(xa?.file ?? '', ya?.file ?? '') ||
      (xa?.line ?? 0) - (ya?.line ?? 0) ||
      (xa?.column ?? 0) - (ya?.column ?? 0) ||
      cmp(x.ruleId ?? '', y.ruleId ?? '') ||
      cmp(x.fingerprint, y.fingerprint)
    );
  });
  changes.forEach((c, i) => (c.id = `c-${String(i + 1).padStart(4, '0')}`));

  const counts = { breaking: 0, possibly: 0, safe: 0, docs: 0 };
  const byArea: Record<string, number> = {};
  for (const c of changes) {
    counts[c.severity ?? 'docs']++;
    const rule = getRule(c.ruleId ?? '');
    const area = c.sharedSchema && rule.area !== 'Descriptions and examples' ? 'Shared schemas' : rule.area;
    byArea[area] = (byArea[area] ?? 0) + 1;
  }
  const sortedArea: Record<string, number> = {};
  for (const k of Object.keys(byArea).sort()) sortedArea[k] = byArea[k] ?? 0;

  const meta = (s: LoadedSpec, input: Input) => ({
    name: input.name,
    size: s.size,
    format: s.format,
    ...(s.specVersion !== undefined ? { specVersion: s.specVersion } : {}),
    ...(s.infoVersion !== undefined ? { infoVersion: s.infoVersion } : {}),
  });

  // IN-04 / OA-02: an unresolved `$ref` is compared as its string, so changes behind it are not
  // seen. Say so instead of dropping them silently.
  const warnings = [
    ...b.unresolved().map((r) => `Before: could not resolve $ref ${r}. It is compared as written, so changes inside it are not reported.`),
    ...a.unresolved().map((r) => `After: could not resolve $ref ${r}. It is compared as written, so changes inside it are not reported.`),
  ];

  return {
    version: 1,
    generator: { name: 'specdiff', version: GENERATOR_VERSION },
    inputs: { before: meta(b, before), after: meta(a, after) },
    mode: 'openapi',
    options: { preset: cfg.preset, openapi: cfg.openapi, ignore: cfg.ignore, rules: cfg.rules },
    summary: { ...counts, total: changes.length, byArea: sortedArea },
    versionCheck: versionCheck(b.infoVersion, a.infoVersion, counts),
    changes,
    ...(warnings.length ? { warnings } : {}),
  };
}

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

function toChange(f: Finding, usageSet: Set<string>, severity: Severity, b: LoadedSpec, a: LoadedSpec): Change {
  const rule = getRule(f.ruleId);
  const path = f.hp.join(' › ');
  const before = trim(f.before);
  const after = trim(f.after);
  const fingerprint = fnv1a64([f.ruleId, path, stableStringify(before), stableStringify(after)].join('\u0000'));
  const usages = [...usageSet].sort();
  const vars = {
    op: f.label,
    target: f.target,
    before: display(f.before),
    after: display(f.after),
    where: f.target && f.target !== f.label ? `\`${f.target}\` in \`${f.label}\`` : `\`${f.label}\``,
  };
  const see = fillTemplate(rule.explanation.see, vars);
  const change: Change = {
    id: '',
    fingerprint,
    mode: 'openapi',
    kind: f.kind,
    path,
    jsonPath: f.kind === 'removed' ? b.jsonPath(f.bLoc) : a.jsonPath(f.aLoc),
    location: { before: b.position(f.bLoc), after: a.position(f.aLoc) },
    ruleId: f.ruleId,
    severity,
    direction: rule.direction,
    sourceBlock: f.block,
    explanation: {
      who: fillTemplate(rule.explanation.who, vars),
      see: f.note ? `${see} ${f.note}` : see,
      avoid: fillTemplate(rule.explanation.avoid, vars),
    },
    changelogLine: fillChangelog(rule.changelog, vars),
  };
  if (f.before !== undefined) change.before = before;
  if (f.after !== undefined) change.after = after;
  if (f.op) change.operation = { ...f.op };
  if (f.isComponent && usages.length > 1) change.sharedSchema = { name: f.label, usages: usages.slice(0, 3), usageCount: usages.length };
  return change;
}

export { SEVERITY_ORDER };
