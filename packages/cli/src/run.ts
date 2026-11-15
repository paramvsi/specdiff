// The `specdiff` command (PK-04, IN-12, PK-09, PK-10). Exit codes: 0 ok, 1 gate failed, 2 usage or input error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildChangelog, changelogFeed, compareOpenApi, reportToHtml, reportToMarkdown, type ChangelogTemplate, type Report } from '@specdiff/core';
import { detectMode } from '@specdiff/core/detect';
import { diffJson, parseWithPositions } from '@specdiff/core/json';
import { diffText } from '@specdiff/core/text';
import { loadConfig, loadDecisions } from './config';
import { gate, summaryLines, type FailOn } from './gate';
import { describeSide, readInput, type Input } from './inputs';
import { hasRemoteRefs, prefetchRemoteRefs } from './remote';

export interface CiOptions { format: 'md' | 'json' | 'html'; failOn?: FailOn; config?: string; allowExternalRefs: boolean; out?: string; quiet?: boolean }
export interface Io { out: (s: string) => void; err: (s: string) => void }

export async function runCi(beforeArg: string, afterArg: string, o: CiOptions, io: Io): Promise<number> {
  const { config } = loadConfig(o.config);
  const before = readInput(beforeArg);
  const after = readInput(afterArg);
  const mode = detectMode(after.name, after.content).mode;
  if (mode !== 'openapi') return nonOpenApi(before, after, io, o);

  for (const side of [before, after]) {
    if (hasRemoteRefs(side.content) && !o.allowExternalRefs) {
      io.err(`${side.name} has remote $refs. They are not fetched in --ci mode; pass --allow-external-refs to fetch them.`);
    }
  }
  if (o.allowExternalRefs) {
    for (const side of [before, after]) {
      side.files ??= {};
      await prefetchRemoteRefs([side.content, ...Object.values(side.files)], side.files);
    }
  }
  const report = compareOpenApi(before, after, config);
  const decisions = loadDecisions(config.decisions);
  const g = gate(report, o.failOn ?? config.failOn, decisions);
  const output = o.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : o.format === 'html' ? reportToHtml(report) : reportToMarkdown(report);
  if (o.out) writeFileSync(o.out, output);
  else if (o.format !== 'md' || !o.quiet) io.out(output);
  for (const line of summaryLines(report, describeSide(beforeArg), describeSide(afterArg), g)) io.err(line);
  return g.code;
}

export type ChangelogFormat = 'md' | 'atom' | 'keep-a-changelog' | 'slack' | 'pr-comment';
export interface ChangelogCliOptions { format: ChangelogFormat; feedUrl?: string; siteUrl?: string; title?: string; release?: string; date?: string; config?: string; out?: string; append?: string }

/** `specdiff changelog` (OUT-01, OUT-02, OUT-10): the changelog of two OpenAPI specs, or an Atom feed. */
export function runChangelog(beforeArg: string, afterArg: string, o: ChangelogCliOptions, io: Io): number {
  if (o.format === 'atom' && !o.feedUrl) { io.err('--format atom needs --feed-url <url>: the URL the feed will be published at (its Atom id and self link).'); return 2; }
  if (o.append && o.format !== 'atom') { io.err('--append works with --format atom only.'); return 2; }
  if (o.append && !existsSync(o.append)) { io.err(`--append: ${o.append} does not exist.`); return 2; }
  // Changelogs print the date as written (Keep a Changelog requires YYYY-MM-DD) and the feed parses it:
  // refuse anything that is not a real ISO date instead of writing "13/45/2026" or failing obscurely.
  if (o.date !== undefined && !(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(o.date) && !Number.isNaN(Date.parse(o.date)) && new Date(o.date.slice(0, 10)).toISOString().startsWith(o.date.slice(0, 10)))) {
    io.err(`--date must be an ISO date such as 2026-11-16 or 2026-11-16T08:00:00Z (got "${o.date}").`);
    return 2;
  }
  const { config } = loadConfig(o.config);
  const before = readInput(beforeArg);
  const after = readInput(afterArg);
  if (detectMode(after.name, after.content).mode !== 'openapi') { io.err(`${afterArg} is not an OpenAPI spec; changelogs are made from OpenAPI specs.`); return 2; }
  const report = compareOpenApi(before, after, config);
  for (const w of report.warnings ?? []) io.err(`⚠ ${w}`);
  let output: string;
  if (o.format === 'atom') {
    output = changelogFeed(report, { title: o.title ?? 'API changelog', feedUrl: o.feedUrl!, ...(o.siteUrl ? { siteUrl: o.siteUrl } : {}), ...(o.release ? { version: o.release } : {}), ...(o.date ? { date: o.date } : {}), ...(o.append ? { existing: readFileSync(o.append, 'utf8') } : {}) });
  } else {
    const template: ChangelogTemplate = o.format === 'md' ? 'release-notes' : o.format;
    output = buildChangelog(report, template, { ...(o.title ? { title: o.title } : {}), ...(o.release ? { version: o.release } : {}), ...(o.date ? { date: o.date.slice(0, 10) } : {}) });
  }
  if (o.out) writeFileSync(o.out, output);
  else io.out(output);
  return 0;
}

function nonOpenApi(before: Input, after: Input, io: Io, o: CiOptions): number {
  const mode = detectMode(after.name, after.content).mode;
  if (mode === 'json' || mode === 'yaml') {
    const a = parseWithPositions(before.content), b = parseWithPositions(after.content);
    if ('error' in a || 'error' in b) { io.err(`Could not parse ${'error' in a ? before.name : after.name}.`); return 2; }
    const d = diffJson(a.value, b.value, { ignoreKeyOrder: true, ignoreArrayOrder: false, arrayMatchKey: 'auto', nullEqualsMissing: false, ignoreKeys: [], numberTolerance: 0 });
    io.out(o.format === 'json' ? JSON.stringify(d.changes, null, 2) + '\n' : d.changes.map((c) => `${c.kind}\t${c.jsonPath}`).join('\n') + '\n');
    io.err(`${d.changes.length} changes (${mode.toUpperCase()}); only OpenAPI changes can fail the check.`);
    return 0;
  }
  const t = diffText(before.content, after.content, { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'smart', filters: [], transforms: [] });
  io.err(`${t.stats.added + t.stats.removed + t.stats.changed} lines differ; only OpenAPI changes can fail the check.`);
  return 0;
}

/** git diff driver: `git config diff.specdiff.command "specdiff git-diff-driver"` + `*.yaml diff=specdiff` in .gitattributes. */
export function gitDiffDriver(args: string[], io: Io): number {
  const [path, oldFile, , , newFile] = args;
  if (!path || !oldFile || !newFile) { io.err('git-diff-driver expects the 7 arguments git passes to an external diff.'); return 2; }
  // Git hands over temp files: read just the content (readInput would also scan the temp folder).
  const read = (f: string) => (f === '/dev/null' || !existsSync(f) ? '' : readFileSync(f, 'utf8'));
  const a = read(oldFile), b = read(newFile);
  io.out(`specdiff ${path}\n`);
  if (detectMode(path, b || a).mode !== 'openapi' || !a || !b) {
    const t = diffText(a, b, { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'smart', filters: [], transforms: [] });
    io.out(`${t.stats.added} added, ${t.stats.removed} removed, ${t.stats.changed} changed lines\n`);
    return 0;
  }
  let report: Report;
  try { report = compareOpenApi({ name: `a/${path}`, content: a }, { name: `b/${path}`, content: b }, loadConfig().config); }
  catch (e) { io.out(`Could not compare: ${(e as Error).message}\n`); return 0; }
  const s = report.summary;
  io.out(`! ${s.breaking} breaking  ? ${s.possibly} possibly  + ${s.safe} safe  ¶ ${s.docs} docs only${report.versionCheck ? `  · suggested ${report.versionCheck.suggested}` : ''}\n`);
  for (const c of report.changes) io.out(`  ${{ breaking: '!', possibly: '?', safe: '+', docs: '¶' }[c.severity ?? 'docs']} ${c.changelogLine ?? c.path}\n`);
  return 0;
}
