/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { compareOpenApi } from '../report/build';
import type { ConfigInput } from '../schemas';
import { OpenApiParseError } from './load';

const SPECS = join(__dirname, '../../../../fixtures/specs');
const spec = (f: string) => ({ name: f, content: readFileSync(join(SPECS, f), 'utf8') });
const summary = (r: ReturnType<typeof compareOpenApi>) => r.changes.map((c) => `${c.severity} ${c.ruleId} ${c.path}`);
const doc = (paths: object, extra: object = {}, openapi = '3.1.0') => stringify({ openapi, info: { title: 'T', version: '1.0.0' }, paths, ...extra });
const cmp = (b: string, a: string, config?: ConfigInput) => compareOpenApi({ name: 'b.yaml', content: b }, { name: 'a.yaml', content: a }, config);
const ok = (schema: object) => ({ '200': { description: 'OK', content: { 'application/json': { schema } } } });

describe('OA-01: versions are normalised to 3.1', () => {
  it('Swagger 2.0 and OpenAPI 3.0 Petstore compare as equal', () => {
    const r = compareOpenApi(spec('petstore-swagger2.json'), spec('petstore-3.0.yaml'));
    expect(r.changes).toEqual([]);
    expect(r.inputs.before).toMatchObject({ format: 'json', specVersion: '2.0', infoVersion: '1.0.0' });
    expect(r.inputs.after).toMatchObject({ format: 'yaml', specVersion: '3.0.3' });
  });

  it('Swagger 2.0 changes point at the lines they were written on', () => {
    const before = spec('petstore-swagger2.json');
    const after = { name: 'b.json', content: before.content.replace('"maximum": 100', '"maximum": 50') };
    const [c] = compareOpenApi(before, after).changes;
    expect(c).toMatchObject({ ruleId: 'request-param-constraint-tightened', path: 'GET /pets › query limit › maximum' });
    const line = before.content.split('\n').findIndex((l) => l.includes('"maximum": 100')) + 1;
    expect(c?.location.before?.line).toBe(line);
    expect(c?.location.after?.line).toBe(line);
  });

  it('OpenAPI 3.2: query method, additionalOperations and itemSchema', () => {
    const paths = (extra: object) => ({ '/a': { query: { operationId: 'q', responses: { '200': { description: 'OK' } } }, additionalOperations: { COPY: { operationId: 'copy', responses: { '200': { description: 'OK' } } } }, ...extra } });
    const r = cmp(doc(paths({}), {}, '3.2.0'), doc({ '/a': { query: { operationId: 'q', responses: { '200': { description: 'OK' } } } } }, {}, '3.2.0'));
    expect(summary(r)).toEqual(['breaking endpoint-removed COPY /a']);
  });

  it('reports parse errors with positions', () => {
    expect(() => cmp('openapi: 3.1.0\npaths: [\n', doc({}))).toThrow(OpenApiParseError);
    try {
      cmp('openapi: 3.1.0\npaths: [\n', doc({}));
    } catch (e) {
      expect((e as OpenApiParseError).errors[0]).toMatchObject({ line: expect.any(Number), hint: expect.any(String) });
    }
    expect(() => cmp('title: not a spec\n', doc({}))).toThrow(/openapi/);
  });
});

describe('OA-16: nullability forms are one concept', () => {
  const forms = [
    { openapi: '3.0.3', schema: { type: 'string', nullable: true } },
    { openapi: '3.1.0', schema: { type: ['string', 'null'] } },
    { openapi: '3.1.0', schema: { oneOf: [{ type: 'null' }, { type: 'string' }] } },
    { openapi: '3.1.0', schema: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
  ];
  const make = (f: (typeof forms)[number]) => doc({ '/a': { get: { operationId: 'a', responses: ok({ type: 'object', properties: { note: f.schema } }) } } }, {}, f.openapi);
  it.each(forms.flatMap((x, i) => forms.map((y, j) => [i, j, x, y] as const)))('form %i vs form %i: no changes', (_i, _j, x, y) => {
    expect(cmp(make(x), make(y)).changes).toEqual([]);
  });
  it('without auto-upgrade, 3.0 nullable still matches 3.1 null types', () => {
    expect(cmp(make(forms[0] as (typeof forms)[number]), make(forms[1] as (typeof forms)[number]), { openapi: { autoUpgrade: false } }).changes).toEqual([]);
  });
});

describe('OA-02: $ref resolution', () => {
  const circ = readFileSync(join(SPECS, 'circular-3.1.yaml'), 'utf8');
  const people = readFileSync(join(SPECS, 'people.yaml'), 'utf8');

  it('compares circular schemas and reports a change inside the cycle once', () => {
    const after = circ.replace('        name:\n          type: string\n        nodes', '        name:\n          type: integer\n        nodes');
    const r = compareOpenApi({ name: 'openapi.yaml', content: circ, files: { 'people.yaml': people } }, { name: 'openapi.yaml', content: after, files: { 'people.yaml': people } });
    expect(summary(r)).toEqual(['breaking response-property-type-changed components.schemas.Owner › name']);
  });

  it('resolves external refs from the in-memory file map, with positions in that file', () => {
    const r = compareOpenApi(
      { name: 'openapi.yaml', content: circ, files: { 'people.yaml': people } },
      { name: 'openapi.yaml', content: circ, files: { 'people.yaml': people.replace('    name:\n      type: string', '    name:\n      type: integer') } },
    );
    expect(summary(r)).toEqual(['breaking response-property-type-changed people.yaml#Person › name']);
    expect(r.changes[0]?.location.after).toEqual({ file: 'people.yaml', line: 5, column: 7 });
    expect(r.changes[0]?.sourceBlock).toBe('people.yaml#Person');
  });

  it('leaves unresolvable refs alone instead of failing', () => {
    const d = doc({ '/a': { get: { operationId: 'a', responses: ok({ $ref: 'https://example.com/schema.json' }) } } });
    expect(cmp(d, d).changes).toEqual([]);
  });

  it('a self-referencing $ref chain does not hang', () => {
    const d = doc({ '/a': { get: { operationId: 'a', responses: ok({ $ref: '#/components/schemas/A' }) } } }, { components: { schemas: { A: { $ref: '#/components/schemas/B' }, B: { $ref: '#/components/schemas/A' } } } });
    expect(cmp(d, d).changes).toEqual([]);
  });
});

describe('dedup keeps distinct changes apart', () => {
  it('two properties that become required in one schema are two changes', () => {
    const body = (required?: string[]) => doc({ '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { schema: { type: 'object', ...(required ? { required } : {}), properties: { a: { type: 'string' }, b: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' } } } } });
    expect(summary(cmp(body(), body(['a', 'b'])))).toEqual(['breaking request-property-became-required POST /a › requestBody › a', 'breaking request-property-became-required POST /a › requestBody › b']);
  });
});

describe('OA-14: shared-schema dedup', () => {
  const card = (props: object) => ({ type: 'object', properties: props });
  const make = (props: object) =>
    doc(
      Object.fromEntries(['/a', '/b', '/c', '/d'].map((p) => [p, { get: { operationId: p.slice(1), responses: ok({ $ref: '#/components/schemas/Card' }) } }])),
      { components: { schemas: { Card: card(props) } } },
    );
  it('reports a change once at the component with the first three usages and a count', () => {
    const r = cmp(make({ id: { type: 'string' } }), make({ id: { type: 'string' }, extra: { type: 'string' } }));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      path: 'components.schemas.Card › extra',
      sourceBlock: 'components.schemas.Card',
      sharedSchema: { name: 'Card', usages: ['GET /a', 'GET /b', 'GET /c'], usageCount: 4 },
      operation: { method: 'GET', path: '/a', operationId: 'a' },
    });
  });
});

describe('OA-18: comparison options', () => {
  const withHeader = (name: string) => doc({ '/a': { get: { operationId: 'a', responses: { '200': { description: 'OK', headers: { [name]: { schema: { type: 'string' } } } } } } } });
  it('case-insensitive headers can be switched off', () => {
    expect(cmp(withHeader('X-Id'), withHeader('x-id')).changes).toEqual([]);
    expect(summary(cmp(withHeader('X-Id'), withHeader('x-id'), { openapi: { caseInsensitiveHeaders: false } }))).toEqual(['possibly response-header-removed GET /a › response 200 › header X-Id']);
  });

  const pathParam = (where: 'path' | 'op') => {
    const p = { name: 'q', in: 'query', schema: { type: 'string', maxLength: where === 'path' ? 10 : 5 } };
    return doc({ '/a': { parameters: [p], get: { operationId: 'a', responses: { '200': { description: 'OK' } } } } });
  };
  it('path-level parameters are merged into each operation', () => {
    expect(summary(cmp(pathParam('path'), pathParam('op')))).toEqual(['breaking request-param-constraint-tightened GET /a › query q › maxLength']);
    expect(summary(cmp(pathParam('path'), pathParam('op'), { openapi: { mergePathParams: false } }))).toEqual(['breaking request-param-constraint-tightened /a › query q › maxLength']);
  });

  const allOf = (required: string[]) =>
    doc({ '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', properties: { b: { type: 'string' } } }] } } } }, responses: { '200': { description: 'OK' } } } } }, { components: { schemas: { Base: { type: 'object', required, properties: { a: { type: 'string' } } } } } });
  it('a change inside one allOf branch is possibly breaking unless allOf is flattened', () => {
    expect(summary(cmp(allOf([]), allOf(['a'])))).toEqual(['possibly request-property-became-required components.schemas.Base › a']);
    expect(summary(cmp(allOf([]), allOf(['a']), { openapi: { flattenAllOf: true } }))).toEqual(['breaking request-property-became-required POST /a › requestBody › a']);
  });
});

describe('config: rules, ignores, presets', () => {
  const before = doc({ '/v1/admin/users': { get: { operationId: 'admin', responses: { '200': { description: 'OK' } } } }, '/v1/users': { get: { operationId: 'users', 'x-internal-note': 'a', responses: { '200': { description: 'OK' } } } } });
  const after = doc({ '/v1/users': { get: { operationId: 'listUsers', 'x-internal-note': 'b', responses: { '200': { description: 'OK' } } } } });
  it('applies severity overrides, disabled rules and ignore.paths', () => {
    expect(summary(cmp(before, after))).toEqual(['breaking endpoint-removed GET /v1/admin/users', 'possibly operation-id-changed GET /v1/users']);
    expect(summary(cmp(before, after, { ignore: { paths: ['/v1/admin/**'] }, rules: { 'operation-id-changed': { severity: 'docs' } } }))).toEqual(['docs operation-id-changed GET /v1/users']);
    expect(summary(cmp(before, after, { rules: { 'endpoint-removed': { enabled: false } } }))).toEqual(['possibly operation-id-changed GET /v1/users']);
  });
  it('ignore.paths matches extension keys, and extensions are off by default', () => {
    const r = cmp(before, after, { ignore: { extensions: false, paths: [] } });
    expect(summary(r)).toContain('docs extension-changed GET /v1/users');
    expect(summary(cmp(before, after, { ignore: { extensions: false, paths: ['x-internal-*'] } }))).not.toContain('docs extension-changed GET /v1/users');
  });
  it('the SDK preset raises K→B rules only', () => {
    expect(summary(cmp(before, after, { preset: 'sdk' }))).toEqual(['breaking endpoint-removed GET /v1/admin/users', 'breaking operation-id-changed GET /v1/users']);
  });
});
