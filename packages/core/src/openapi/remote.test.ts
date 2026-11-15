import { expect, it } from 'vitest';
import { compareOpenApi } from '../report/build';

const spec = (required: string) => `openapi: 3.1.0
info: { title: T, version: 1.0.0 }
paths:
  /x:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: 'https://schemas.example.com/input.yaml#/Input' }
      responses: { '200': { description: ok } }
`.replace('REQ', required);
const remote = (req: string) => `Input:\n  type: object\n  required: [${req}]\n  properties:\n    a: { type: string }\n    b: { $ref: 'common.yaml#/B' }\n`;
const common = 'B:\n  type: string\n';

it('resolves remote $refs only from content passed in files (prefetched by the caller)', () => {
  const url = 'https://schemas.example.com/input.yaml';
  const before = { name: 'a.yaml', content: spec(''), files: { [url]: remote('a'), 'https://schemas.example.com/common.yaml': common } };
  const after = { name: 'b.yaml', content: spec(''), files: { [url]: remote('a, b'), 'https://schemas.example.com/common.yaml': common } };
  const r = compareOpenApi(before, after);
  expect(r.changes.map((c) => c.ruleId)).toContain('request-property-became-required');
  // Without the prefetched content nothing is fetched and the ref stays unresolved: no changes found inside it.
  const none = compareOpenApi({ name: 'a.yaml', content: spec('') }, { name: 'b.yaml', content: spec('') });
  expect(none.changes).toEqual([]);
});
