// .specdiff.yaml search order (docs/07 §3): --config, ./.specdiff.yaml, repo root.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Config, DecisionsFile, type Config as ConfigT } from '@specdiff/core';
import { parse } from 'yaml';
import { git } from './inputs';

export function findConfig(explicit?: string): string | undefined {
  if (explicit) { if (!existsSync(explicit)) throw new Error(`Config not found: ${explicit}`); return explicit; }
  if (existsSync('.specdiff.yaml')) return '.specdiff.yaml';
  try {
    const root = git(['rev-parse', '--show-toplevel']).trim();
    const p = join(root, '.specdiff.yaml');
    if (existsSync(p)) return p;
  } catch { /* not a git repo */ }
  return undefined;
}

export function loadConfig(explicit?: string): { config: ConfigT; path?: string } {
  const path = findConfig(explicit);
  if (!path) return { config: Config.parse({}) };
  const r = Config.safeParse(parse(readFileSync(path, 'utf8')) ?? {});
  if (!r.success) throw new Error(`${path} is not valid:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return { config: r.data, path };
}

export function loadDecisions(path: string): DecisionsFile | undefined {
  if (!existsSync(path)) return undefined;
  const r = DecisionsFile.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!r.success) throw new Error(`${path} is not a valid decisions file.`);
  return r.data;
}
