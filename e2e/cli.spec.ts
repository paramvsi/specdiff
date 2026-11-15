// PK-04/PK-10 done-when (docs/08): `specdiff --ci` and the pre-commit form fail on a breaking change
// in a sample repo and pass once it is accepted in .specdiff/decisions.json.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const CLI = resolve('packages/cli/dist/cli.js');
const fx = (n: string) => resolve('fixtures/samples', n);
const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-cli-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  copyFileSync(fx('payments-v1.yaml'), join(dir, 'openapi.yaml'));
  git('add', '.');
  git('commit', '-qm', 'v1');
  copyFileSync(fx('payments-v2.yaml'), join(dir, 'openapi.yaml'));
  return dir;
}

test('--ci fails on breaking changes, passes once they are accepted', () => {
  const dir = repo();
  const r = run(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('Comparing main → working tree…');
  expect(r.stderr).toMatch(/✖ 4 breaking/);
  expect(r.stderr).toContain('Exit code 1 · breaking changes found');

  const report = JSON.parse(run(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci', '--format', 'json').stdout) as { changes: Array<{ fingerprint: string; severity: string; path: string; ruleId: string }> };
  const decisions = Object.fromEntries(report.changes.filter((c) => c.severity === 'breaking').map((c) => [c.fingerprint, { decision: 'accepted', path: c.path, ruleId: c.ruleId, at: '2026-11-15T00:00:00Z' }]));
  mkdirSync(join(dir, '.specdiff'));
  writeFileSync(join(dir, '.specdiff/decisions.json'), JSON.stringify({ version: 1, decisions }));
  const ok = run(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci');
  expect(ok.status, ok.stderr).toBe(0);

  // A rejected change always fails.
  const first = Object.keys(decisions)[0]!;
  writeFileSync(join(dir, '.specdiff/decisions.json'), JSON.stringify({ version: 1, decisions: { ...decisions, [first]: { ...decisions[first], decision: 'rejected' } } }));
  expect(run(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci').status).toBe(1);
});

test('pre-commit form compares HEAD with the working tree; --fail-on none passes', () => {
  const dir = repo();
  expect(run(dir, 'openapi.yaml', '--ci', '--fail-on', 'breaking').status).toBe(1);
  expect(run(dir, 'openapi.yaml', '--ci', '--fail-on', 'none').status).toBe(0);
  writeFileSync(join(dir, 'new.yaml'), 'openapi: 3.1.0\ninfo: { title: x, version: 1.0.0 }\npaths: {}\n');
  const fresh = run(dir, 'new.yaml', '--ci');
  expect(fresh.status).toBe(0);
  expect(fresh.stderr).toContain('is new');
});

test('refuses option-like revisions and reports formats', () => {
  const dir = repo();
  expect(run(dir, '--output=x:openapi.yaml', 'openapi.yaml', '--ci').status).not.toBe(0);
  const html = run(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci', '--format', 'html', '--fail-on', 'none');
  expect(html.status).toBe(0);
  expect(html.stdout).toMatch(/<html/i);
  expect(html.stdout).not.toMatch(/<script/i);
});

test('git diff driver prints the semantic changelog', () => {
  const dir = repo();
  const r = run(dir, 'git-diff-driver', 'openapi.yaml', fx('payments-v1.yaml'), 'a', '100644', fx('payments-v2.yaml'), 'b', '100644');
  expect(r.status).toBe(0);
  expect(r.stdout).toMatch(/! 4 breaking/);
});
