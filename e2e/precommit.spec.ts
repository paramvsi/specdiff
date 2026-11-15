// PK-10: simulate pre-commit running the hook from .pre-commit-hooks.yaml: the `entry` split on
// spaces, `specdiff` resolved to the built CLI, and the staged files that match `files` appended
// (one filename here), run in a temp git repo. The pre-commit framework itself is not installed.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const CLI = resolve('packages/cli/dist/cli.js');
const fx = (n: string) => resolve('fixtures/samples', n);
const manifest = readFileSync(resolve('.pre-commit-hooks.yaml'), 'utf8');
const field = (k: string) => new RegExp(`^\\s*-?\\s*${k}:\\s*(.+)$`, 'm').exec(manifest)?.[1]?.trim() ?? '';

test('the manifest declares the specdiff hook', () => {
  expect(field('id')).toBe('specdiff');
  expect(field('entry')).toBe('specdiff --ci --fail-on breaking');
  expect(field('language')).toBe('node');
  expect(field('additional_dependencies')).toBe('[specdiff-cli]');
  expect(field('files')).toBe("'(openapi|swagger).*\\.(ya?ml|json)$'");
});

function repo(): { dir: string; git: (...a: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-precommit-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  copyFileSync(fx('payments-v1.yaml'), join(dir, 'openapi.yaml'));
  writeFileSync(join(dir, 'README.md'), '# api\n');
  git('add', '.');
  git('commit', '-qm', 'v1');
  return { dir, git };
}

/** What pre-commit does: filter staged files by `files`, then run `entry` + filenames. */
function hook(dir: string, git: (...a: string[]) => string) {
  const files = new RegExp(field('files').slice(1, -1));
  const staged = git('diff', '--cached', '--name-only').split('\n').filter((f) => f && files.test(f));
  const [bin, ...args] = field('entry').split(' ');
  expect(bin).toBe('specdiff');
  return { staged, r: staged.length ? spawnSync(process.execPath, [CLI, ...args, ...staged], { cwd: dir, encoding: 'utf8' }) : undefined };
}

test('fails the commit on a staged breaking change, passes a safe one and ignores other files', () => {
  const { dir, git } = repo();
  copyFileSync(fx('payments-v2.yaml'), join(dir, 'openapi.yaml'));
  writeFileSync(join(dir, 'README.md'), '# api v2\n');
  git('add', '.');
  const bad = hook(dir, git);
  expect(bad.staged).toEqual(['openapi.yaml']);
  expect(bad.r!.status, bad.r!.stderr).toBe(1);
  expect(bad.r!.stderr).toContain('Comparing HEAD → working tree…');
  expect(bad.r!.stderr).toContain('Exit code 1 · breaking changes found');

  // Only a docs change: passes.
  git('checkout', '--', '.');
  git('reset', '-q');
  writeFileSync(join(dir, 'openapi.yaml'), readFileSync(fx('payments-v1.yaml'), 'utf8').replace(/^(\s*title:.*)$/m, '$1 (edited)'));
  git('add', 'openapi.yaml');
  const ok = hook(dir, git);
  expect(ok.staged).toEqual(['openapi.yaml']);
  expect(ok.r!.status, ok.r!.stderr).toBe(0);
});

test('a new spec file passes', () => {
  const { dir, git } = repo();
  writeFileSync(join(dir, 'swagger.json'), JSON.stringify({ openapi: '3.1.0', info: { title: 'x', version: '1.0.0' }, paths: {} }));
  git('add', 'swagger.json');
  const r = hook(dir, git);
  expect(r.staged).toEqual(['swagger.json']);
  expect(r.r!.status, r.r!.stderr).toBe(0);
  expect(r.r!.stderr).toContain('is new');
});
