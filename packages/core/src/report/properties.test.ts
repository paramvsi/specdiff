// Property tests (docs/04 testing layers): determinism, fingerprint stability under reformatting,
// key reordering and JSON↔YAML conversion, and the request/response direction law.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { compareOpenApi } from './build';

type Json = Record<string, unknown>;

const propName = fc.constantFrom('id', 'name', 'note', 'count', 'status', 'kind');
const scalar = fc
  .record({
    type: fc.constantFrom('string', 'integer', 'number', 'boolean'),
    description: fc.option(fc.constantFrom('A value.', 'Another value.', 'Text with: colon'), { nil: undefined }),
    maximum: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    enum: fc.option(fc.uniqueArray(fc.constantFrom('a', 'b', 'c'), { minLength: 1 }), { nil: undefined }),
  })
  .map(clean);
const object = fc.dictionary(propName, scalar, { maxKeys: 4 }).chain((properties) =>
  fc.subarray(Object.keys(properties)).map((required) => clean({ type: 'object', properties, required: required.length ? required : undefined })),
);
const operation = fc
  .record({
    params: fc.dictionary(propName, scalar, { maxKeys: 3 }),
    required: fc.boolean(),
    body: object,
    response: object,
    summary: fc.constantFrom('Get it', 'Fetch it', 'List them'),
  })
  .map(({ params, required, body, response, summary }) => ({
    operationId: 'op',
    summary,
    parameters: Object.entries(params).map(([name, schema]) => ({ name, in: 'query', required, schema })),
    requestBody: { content: { 'application/json': { schema: body } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: response } } } },
  }));
const spec = fc.dictionary(fc.constantFrom('/a', '/b', '/c/{id}'), fc.record({ post: operation }), { minKeys: 1, maxKeys: 3 }).map((paths) => ({
  openapi: '3.1.0',
  info: { title: 'Generated', version: '1.0.0' },
  paths,
}));

function clean<T extends Json>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** Reverse every object's key order and every array of parameters. */
function reorder(v: unknown, key = ''): unknown {
  if (Array.isArray(v)) {
    const items = v.map((x) => reorder(x));
    return key === 'parameters' ? items.reverse() : items;
  }
  if (v === null || typeof v !== 'object') return v;
  const out: Json = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorder((v as Json)[k], k);
  return out;
}

const fingerprints = (b: string, a: string) =>
  compareOpenApi({ name: 'before', content: b }, { name: 'after', content: a })
    .changes.map((c) => `${c.ruleId}|${c.severity}|${c.path}|${c.fingerprint}`)
    .sort();

describe('property: determinism and fingerprint stability', () => {
  it('identical inputs give byte-identical reports', () => {
    fc.assert(
      fc.property(spec, spec, (b, a) => {
        const run = () => JSON.stringify(compareOpenApi({ name: 'b.yaml', content: stringify(b) }, { name: 'a.yaml', content: stringify(a) }));
        expect(run()).toBe(run());
      }),
      { numRuns: 60 },
    );
  });

  it('fingerprints survive YAML reformatting, key reordering and JSON↔YAML conversion', () => {
    fc.assert(
      fc.property(spec, spec, (b, a) => {
        const base = fingerprints(stringify(b), stringify(a));
        expect(fingerprints(stringify(b, { indent: 4, defaultStringType: 'QUOTE_DOUBLE' }), stringify(a, { collectionStyle: 'flow' }))).toEqual(base);
        expect(fingerprints(stringify(reorder(b)), stringify(reorder(a)))).toEqual(base);
        expect(fingerprints(JSON.stringify(b, null, 2), JSON.stringify(reorder(a)))).toEqual(base);
      }),
      { numRuns: 60 },
    );
  });
});

describe('property: direction', () => {
  it('adding an optional request property is safe; swapping the inputs gives the removal rule', () => {
    fc.assert(
      fc.property(propName, scalar, object, (name, schema, base) => {
        const props = { ...(base.properties as Json) };
        delete props[name];
        const required = ((base.required as string[] | undefined) ?? []).filter((r) => r !== name);
        const body = (withProp: boolean) => clean({ type: 'object', properties: withProp ? { ...props, [name]: schema } : props, required: required.length ? required : undefined });
        const doc = (withProp: boolean) =>
          stringify({ openapi: '3.1.0', info: { title: 'T', version: '1.0.0' }, paths: { '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { schema: body(withProp) } } }, responses: { '200': { description: 'OK' } } } } } });
        const forward = compareOpenApi({ name: 'b', content: doc(false) }, { name: 'a', content: doc(true) }).changes;
        const back = compareOpenApi({ name: 'b', content: doc(true) }, { name: 'a', content: doc(false) }).changes;
        const path = `POST /a › requestBody › ${name}`;
        expect(forward.map((c) => [c.ruleId, c.severity, c.path])).toEqual([['request-property-added-optional', 'safe', path]]);
        expect(back.map((c) => [c.ruleId, c.severity, c.path])).toEqual([['request-property-removed', 'possibly', path]]);
      }),
      { numRuns: 100 },
    );
  });
});
