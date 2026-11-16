#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { Command, InvalidArgumentError, Option } from 'commander';
import pc from 'picocolors';
import { reportJsonSchema } from '@specdiff/core';
import { buildHistory } from './history';
import { readInput } from './inputs';
import { gitDiffDriver, runChangelog, runCi, type ChangelogCliOptions } from './run';
import { serveLocal } from './serve';

const io = { out: (s: string) => process.stdout.write(s), err: (s: string) => process.stderr.write(s.endsWith('\n') ? s : s + '\n') };
const program = new Command();
/** A whole-number option: a typo is an argument error, not a silent NaN. */
const whole = (v: string) => {
  if (!/^\d+$/.test(v)) throw new InvalidArgumentError('It must be a whole number.');
  return Number(v);
};

program
  // Options after a subcommand name belong to it (`specdiff changelog … --format atom`).
  .enablePositionalOptions()
  .name('specdiff')
  .description('See what changed between two API specs, configs or documents. Nothing is uploaded.')
  .version(process.env.SPECDIFF_VERSION ?? '0.0.0')
  .argument('<before>', 'file, folder entry or git rev:path (e.g. main:openapi.yaml)')
  .argument('[after]', 'file or rev:path. With one argument, compares HEAD:<file> with the working tree (pre-commit hook)')
  .option('--ci', 'print the report and exit non-zero per --fail-on')
  .addOption(new Option('--format <format>', 'report format').choices(['md', 'json', 'html']).default('md'))
  .addOption(new Option('--fail-on <level>', 'when to exit 1 (default from .specdiff.yaml, else breaking)').choices(['breaking', 'possibly', 'missing-version-bump', 'none']))
  .option('--config <file>', 'path to .specdiff.yaml')
  .option('--allow-external-refs', 'fetch remote $ref URLs (off in --ci mode by default)')
  .option('--out <file>', 'write the report to a file')
  .option('--no-open', 'with the local UI: print the URL instead of opening a browser')
  .option('--port <port>', 'with the local UI: port to listen on', whole)
  .action(async (beforeArg: string, afterArg: string | undefined, o: { ci?: boolean; format: 'md' | 'json' | 'html'; failOn?: 'breaking'; config?: string; allowExternalRefs?: boolean; out?: string; open: boolean; port?: number }) => {
    const pair = afterArg ? [beforeArg, afterArg] : [`HEAD:${beforeArg}`, beforeArg];
    try {
      if (o.ci || !afterArg) {
        process.exitCode = await runCi(pair[0]!, pair[1]!, { format: o.format, ...(o.failOn ? { failOn: o.failOn } : {}), ...(o.config ? { config: o.config } : {}), allowExternalRefs: !!o.allowExternalRefs, ...(o.out ? { out: o.out } : {}), quiet: !afterArg }, io);
        return;
      }
      const url = await serveLocal(readInput(pair[0]!), readInput(pair[1]!), { open: o.open, ...(o.port ? { port: o.port } : {}) });
      io.err(`${pc.bold('specdiff')} is running at ${url}\nPress Ctrl+C to stop.`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      // pre-commit on a new file: nothing in HEAD to compare with.
      if (!afterArg && /does not exist in 'HEAD'|exists on disk, but not in 'HEAD'|bad revision|unknown revision/.test(msg)) { io.err(`${beforeArg} is new: nothing to compare with.`); return; }
      io.err(pc.red(msg));
      process.exitCode = 2;
    }
  });

program
  .command('history <file>')
  .description('write a Viewer version set from git tags (or commits) of a spec file')
  .option('--out <file>', 'output file', 'versions.json')
  .option('--max <n>', 'most versions to keep', whole, 20)
  .action((file: string, o: { out: string; max: number }) => {
    try {
      const set = buildHistory(file, o.max);
      writeFileSync(o.out, JSON.stringify(set, null, 2) + '\n');
      io.err(`Wrote ${set.versions.length} ${set.versions.length === 1 ? 'version' : 'versions'} of ${file} to ${o.out} (current ${set.current}).`);
    } catch (e) { io.err(pc.red((e as Error).message)); process.exitCode = 2; }
  });

program
  .command('changelog <before> <after>')
  .description('write the changelog of two OpenAPI specs: release notes, Keep a Changelog, Slack, PR comment, or an Atom feed')
  .addOption(new Option('--format <format>', 'changelog format').choices(['md', 'atom', 'keep-a-changelog', 'slack', 'pr-comment']).default('md'))
  .option('--feed-url <url>', 'with --format atom: the URL the feed is published at (required)')
  .option('--site-url <url>', 'with --format atom: the site the feed links to')
  .option('--title <title>', 'title (Atom: feed title, default "API changelog"; md/slack: heading)')
  .option('--release <version>', 'version for the heading (default: the suggested version)')
  .option('--date <date>', 'release date, ISO 8601 (Keep a Changelog heading; Atom updated time, default now)')
  .option('--config <file>', 'path to .specdiff.yaml')
  .option('--out <file>', 'write to a file instead of stdout')
  .option('--append <feed.xml>', 'with --format atom: add this release to an existing feed (newest first; same release replaces its entry)')
  .action((before: string, after: string, o: ChangelogCliOptions) => {
    try { process.exitCode = runChangelog(before, after, o, io); }
    catch (e) { io.err(pc.red((e as Error).message ?? String(e))); process.exitCode = 2; }
  });

program
  .command('git-diff-driver', { hidden: false })
  .description('external diff for git: shows the semantic changelog of spec files')
  .allowExcessArguments()
  .action((_o: unknown, cmd: Command) => { process.exitCode = gitDiffDriver(cmd.args, io); });

program
  .command('pre-commit <files...>')
  .description('for each spec file, compare HEAD:<file> with the working copy (what pre-commit passes); new files pass')
  .addOption(new Option('--fail-on <level>', 'when to exit 1').choices(['breaking', 'possibly', 'missing-version-bump', 'none']))
  .option('--config <file>', 'path to .specdiff.yaml')
  .action(async (files: string[], o: { failOn?: 'breaking'; config?: string }) => {
    let code = 0;
    for (const file of files) {
      try {
        const r = await runCi(`HEAD:${file}`, file, { format: 'md', ...(o.failOn ? { failOn: o.failOn } : {}), ...(o.config ? { config: o.config } : {}), allowExternalRefs: false, quiet: true }, io);
        code = Math.max(code, r);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (/does not exist in 'HEAD'|exists on disk, but not in 'HEAD'|bad revision|unknown revision/.test(msg)) { io.err(`${file} is new: nothing to compare with.`); continue; }
        io.err(pc.red(`${file}: ${msg}`));
        code = 2;
      }
    }
    process.exitCode = code;
  });

program
  .command('schema')
  .description('print the JSON Schema of the --format json report')
  .action(() => { io.out(JSON.stringify(reportJsonSchema(), null, 2) + '\n'); });

await program.parseAsync();
