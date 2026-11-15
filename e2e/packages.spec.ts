// Published packages load in plain Node ESM (no bundler): every publishConfig export of core and express.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

for (const pkg of ['core', 'express']) {
  const dir = resolve('packages', pkg);
  const exports = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).publishConfig.exports as Record<string, { import: string }>;
  for (const [sub, target] of Object.entries(exports)) {
    test(`@specdiff/${pkg}${sub === '.' ? '' : sub.slice(1)} imports in plain Node`, () => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(resolve(dir, target.import))}); if (!Object.keys(m).length) throw new Error('no exports');`], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    });
  }
}
