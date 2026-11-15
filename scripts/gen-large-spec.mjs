// Generates a large (~10 MB) OpenAPI 3.1 spec for performance tests (D-3 spike, docs/04 budgets).
// Output goes to fixtures/specs/large/ which is git-ignored.
// Usage: node scripts/gen-large-spec.mjs [targetMegabytes=10] [--yaml]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targetMb = Number(process.argv[2] ?? 10);
const asYaml = process.argv.includes('--yaml');

// Deterministic pseudo-random numbers so the output is the same on every run.
let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

const types = ['string', 'integer', 'number', 'boolean'];
const words = ['account', 'order', 'invoice', 'customer', 'payment', 'shipment', 'product', 'review', 'ticket', 'event'];

function makeSchema(i, schemaCount) {
  const properties = {};
  const required = [];
  const propCount = 8 + Math.floor(rand() * 8);
  for (let p = 0; p < propCount; p++) {
    const name = `${pick(words)}_${p}`;
    const t = pick(types);
    const prop = { type: t, description: `The ${name} field of schema ${i}. Lorem ipsum dolor sit amet.` };
    if (t === 'string' && rand() < 0.3) prop.enum = ['a', 'b', 'c', 'd'];
    if (t === 'integer') prop.maximum = 1000 + p;
    if (t === 'string' && rand() < 0.3) prop.maxLength = 64;
    properties[name] = prop;
    if (rand() < 0.4) required.push(name);
  }
  if (i > 0) properties.related = { $ref: `#/components/schemas/Schema${Math.floor(rand() * schemaCount)}` };
  properties.items = { type: 'array', items: { $ref: `#/components/schemas/Schema${Math.floor(rand() * schemaCount)}` } };
  return { type: 'object', required, properties };
}

function makeOperation(path, method, i, schemaCount) {
  const ref = { $ref: `#/components/schemas/Schema${i % schemaCount}` };
  const op = {
    operationId: `${method}${i}`,
    summary: `Operation ${i} on ${path}`,
    description: `Does ${method} on resource ${i}. `.repeat(3),
    tags: [pick(words)],
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'X-Request-Id', in: 'header', schema: { type: 'string' } },
    ],
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: ref } } },
      404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  };
  if (method === 'post' || method === 'put') {
    op.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/Schema${(i + 1) % schemaCount}` } } } };
  }
  return op;
}

const spec = {
  openapi: '3.1.0',
  info: { title: 'Large generated API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {},
  components: { schemas: { Error: { type: 'object', properties: { code: { type: 'integer' }, message: { type: 'string' } } } } },
};

const schemaCount = 2000;
for (let i = 0; i < schemaCount; i++) spec.components.schemas[`Schema${i}`] = makeSchema(i, schemaCount);
let i = 0;
const targetBytes = targetMb * 1024 * 1024;
let text = '';
while (true) {
  for (let k = 0; k < 200; k++, i++) {
    const path = `/v1/${pick(words)}s/${i}/{id}`;
    spec.paths[path] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: makeOperation(path, 'get', i, schemaCount),
      post: makeOperation(path, 'post', i, schemaCount),
    };
  }
  text = JSON.stringify(spec, null, 2);
  if (text.length >= targetBytes) break;
}

const outDir = join(root, 'fixtures/specs/large');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, asYaml ? 'large.yaml' : 'large.json');
if (asYaml) {
  // yaml is a dependency of @specdiff/core, so resolve it from there.
  const yamlPath = createRequire(join(root, 'packages/core/package.json')).resolve('yaml');
  const { stringify } = await import(pathToFileURL(yamlPath).href);
  writeFileSync(out, stringify(spec, { aliasDuplicateObjects: false }));
} else {
  writeFileSync(out, text);
}
console.log(`wrote ${out}: ${(text.length / 1024 / 1024).toFixed(1)} MB JSON, ${Object.keys(spec.paths).length} paths`);
