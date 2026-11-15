import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadConfig } from './config';

it('names the config file when its YAML does not parse', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sd-cfg-')), '.specdiff.yaml');
  writeFileSync(file, 'text:\n  filters: [\n');
  expect(() => loadConfig(file)).toThrow(/^.*\.specdiff\.yaml: .*line 3/s);
});
