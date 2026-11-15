/// <reference types="node" />
// IN-04 / OA-02: external $refs in folder / ZIP / CLI inputs resolve however the entry is named;
// unresolved ones are reported as warnings. IN-08 progress, OA-09 tags, X-08 no-change bump.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareOpenApi, type CompareStep } from '../report/build';
import type { Input } from './load';

const MULTI = join(__dirname, '../../../../fixtures/specs/multi');
const side = (v: 'v1' | 'v2') => ({
  'openapi.yaml': readFileSync(join(MULTI, v, 'openapi.yaml'), 'utf8'),
  'schemas/card.yaml': readFileSync(join(MULTI, v, 'schemas/card.yaml'), 'utf8'),
});
const input = (v: 'v1' | 'v2', name: string): Input => ({ name, content: side(v)['openapi.yaml'], files: side(v) });
const rules = (r: ReturnType<typeof compareOpenApi>) => r.changes.map((c) => `${c.ruleId} ${c.path}`).sort();
const EXPECTED = [
  'response-optional-property-removed schemas/card.yaml#Card › holder',
  'response-property-type-changed schemas/card.yaml#Card › last4',
];

describe('IN-04 / OA-02 multi-file $refs', () => {
  it.each([
    ['app folder / ZIP (name "<folder>/<entry>", keys relative to the folder)', 'pay/openapi.yaml', 'pay/openapi.yaml'],
    ['CLI from the repo root (name as typed, keys relative to the spec dir)', 'fixtures/specs/multi/v1/openapi.yaml', 'fixtures/specs/multi/v2/openapi.yaml'],
    ['CLI from inside v1 (../ in the After name)', 'openapi.yaml', '../v2/openapi.yaml'],
    ['git rev:path names', 'main:api/openapi.yaml', 'HEAD:api/openapi.yaml'],
  ])('resolves for %s', (_label, bName, aName) => {
    const r = compareOpenApi(input('v1', bName), input('v2', aName));
    expect(rules(r)).toEqual(EXPECTED);
    expect(r.warnings).toBeUndefined();
  });

  it('resolves refs back into the entry file from an external file', () => {
    const files = {
      'openapi.yaml': side('v1')['openapi.yaml'].replace("'./schemas/card.yaml#/Card'", "'./schemas/card.yaml#/Wrapper'") + 'components:\n  schemas:\n    Id: { type: string }\n',
      'schemas/card.yaml': 'Wrapper:\n  type: object\n  properties:\n    id: { $ref: "../openapi.yaml#/components/schemas/Id" }\n',
    };
    const after = { ...files, 'openapi.yaml': files['openapi.yaml'].replace('Id: { type: string }', 'Id: { type: integer }') };
    const r = compareOpenApi({ name: 'x/openapi.yaml', content: files['openapi.yaml'], files }, { name: 'y/openapi.yaml', content: after['openapi.yaml'], files: after });
    expect(rules(r)).toEqual(['response-property-type-changed components.schemas.Id']);
    expect(r.warnings).toBeUndefined();
  });

  it('warns about a $ref it cannot resolve instead of dropping changes silently', () => {
    const r = compareOpenApi({ name: 'pay/openapi.yaml', content: side('v1')['openapi.yaml'] }, { name: 'pay/openapi.yaml', content: side('v2')['openapi.yaml'] });
    expect(r.warnings).toEqual([
      'Before: could not resolve $ref ./schemas/card.yaml#/Card (from pay/openapi.yaml). It is compared as written, so changes inside it are not reported.',
      'After: could not resolve $ref ./schemas/card.yaml#/Card (from pay/openapi.yaml). It is compared as written, so changes inside it are not reported.',
    ]);
  });
});

describe('IN-08 progress', () => {
  it('reports each real stage in order', () => {
    const steps: string[] = [];
    compareOpenApi(input('v1', 'a/openapi.yaml'), input('v2', 'b/openapi.yaml'), {}, { onProgress: (s: CompareStep, d?: string) => steps.push(d ? `${s}:${d}` : s) });
    expect(steps).toEqual(['parse:a/openapi.yaml', 'normalise:a/openapi.yaml', 'parse:b/openapi.yaml', 'normalise:b/openapi.yaml', 'resolve', 'compare']);
  });
});

describe('OA-09 tags', () => {
  it('carries the operation tags on each change', () => {
    const r = compareOpenApi(input('v1', 'openapi.yaml'), input('v2', 'openapi.yaml'));
    expect(r.changes.length).toBe(2);
    for (const c of r.changes) expect(c.operation).toEqual({ method: 'GET', path: '/cards/{id}', operationId: 'getCard', tags: ['cards'] });
  });
});

describe('X-08 identical specs', () => {
  it('suggests the same version, bump none', () => {
    const r = compareOpenApi(input('v1', 'a/openapi.yaml'), input('v1', 'b/openapi.yaml'));
    expect(r.changes).toEqual([]);
    expect(r.versionCheck).toMatchObject({ suggested: '1.0.0', bump: 'none', verdict: 'ok' });
  });
});
