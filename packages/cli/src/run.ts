// The `specdiff` command (PK-04, IN-12, PK-09, PK-10). Exit codes: 0 ok, 1 gate failed, 2 usage or input error.
import { existsSync, writeFileSync } from 'node:fs';
import { compareOpenApi, reportToHtml, reportToMarkdown, type Report } from '@specdiff/core';
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
  const read = (f: string) => (f === '/dev/null' || !existsSync(f) ? '' : readInput(f).content);
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
