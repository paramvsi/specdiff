#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { Command, Option } from 'commander';
import pc from 'picocolors';
import { buildHistory } from './history';
import { readInput } from './inputs';
import { gitDiffDriver, runCi } from './run';
import { serveLocal } from './serve';

const io = { out: (s: string) => process.stdout.write(s), err: (s: string) => process.stderr.write(s.endsWith('\n') ? s : s + '\n') };
const program = new Command();

program
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
  .option('--port <port>', 'with the local UI: port to listen on', (v) => Number(v))
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
  .option('--max <n>', 'most versions to keep', (v) => Number(v), 20)
  .action((file: string, o: { out: string; max: number }) => {
    try {
      const set = buildHistory(file, o.max);
      writeFileSync(o.out, JSON.stringify(set, null, 2) + '\n');
      io.err(`Wrote ${set.versions.length} versions of ${file} to ${o.out} (current ${set.current}).`);
    } catch (e) { io.err(pc.red((e as Error).message)); process.exitCode = 2; }
  });

program
  .command('git-diff-driver', { hidden: false })
  .description('external diff for git: shows the semantic changelog of spec files')
  .allowExcessArguments()
  .action((_o: unknown, cmd: Command) => { process.exitCode = gitDiffDriver(cmd.args, io); });

await program.parseAsync();
