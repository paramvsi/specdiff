import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { reportJsonSchema } from './schema';

// OUT-11: the website serves a checked-in copy; regenerate with `node packages/cli/dist/cli.js schema > apps/website/public/schema/report-v1.json`.
it('the published report schema matches the Zod schema', () => {
  const file = fileURLToPath(new URL('../../../../apps/website/public/schema/report-v1.json', import.meta.url));
  expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(reportJsonSchema(), null, 2) + '\n');
});
