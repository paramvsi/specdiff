/// <reference types="node" />
// OA-22 contract: what the app's "requests that will fail" check reads from a constraint change.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { compareOpenApi } from './build';

const SAMPLES = join(__dirname, '../../../../fixtures/samples');
const read = (f: string) => ({ name: f, content: readFileSync(join(SAMPLES, f), 'utf8') });

it('request-param-constraint-tightened carries the keyword, numbers and parameter in machine-readable form', () => {
  const r = compareOpenApi(read('payments-v1.yaml'), read('payments-v2.yaml'), {}, { today: '2026-11-15' });
  const c = r.changes.find((x) => x.ruleId === 'request-param-constraint-tightened')!;
  expect(c).toMatchObject({
    path: 'GET /v1/payments › query limit › maximum',
    before: { maximum: 100 },
    after: { maximum: 50 },
    operation: { method: 'GET', path: '/v1/payments', operationId: 'listPayments' },
  });
  // The parameter is the segment before the keyword: "<in> <name>".
  const segs = c.path.split(' › ');
  expect(/^(query|header|path|cookie) (.+)$/.exec(segs[segs.length - 2]!)?.slice(1)).toEqual(['query', 'limit']);
});
