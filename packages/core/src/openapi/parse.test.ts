import { describe, expect, it } from 'vitest';
import { detectOpenApi } from './detect';
import { fnv1a64, stableStringify } from './hash';
import { parseDocument } from './parse';

/** 1-based line and column of the first occurrence of `needle`. */
function where(text: string, needle: string) {
  const i = text.indexOf(needle);
  const before = text.slice(0, i).split('\n');
  return { line: before.length, column: (before[before.length - 1] ?? '').length + 1 };
}

describe('parseDocument', () => {
  const yaml = 'openapi: 3.1.0\ninfo:\n  title: T\n  version: "1"\npaths:\n  /a:\n    get:\n      parameters:\n        - name: limit\n          in: query\n';
  const json = '{\n  "openapi": "3.1.0",\n  "paths": {\n    "/a": {\n      "get": { "parameters": [ { "name": "limit", "in": "query" } ] }\n    }\n  }\n}\n';

  it('parses YAML with key and item positions', () => {
    const d = parseDocument(yaml, 'a.yaml');
    expect(d.errors).toEqual([]);
    expect(d.format).toBe('yaml');
    expect(d.value).toMatchObject({ openapi: '3.1.0', info: { version: '1' } });
    expect(d.positionOf(['paths', '/a', 'get'])).toEqual({ ...where(yaml, 'get:'), exact: true });
    expect(d.positionOf(['paths', '/a', 'get', 'parameters', '0'])).toEqual({ ...where(yaml, 'name: limit'), exact: true });
    expect(d.positionOf(['paths', '/a', 'get', 'parameters', '0', 'in'])).toEqual({ ...where(yaml, 'in: query'), exact: true });
  });

  it('reports JSON positions the same way', () => {
    const d = parseDocument(json, 'a.json');
    expect(d.errors).toEqual([]);
    expect(d.format).toBe('json');
    expect(d.value).toEqual(JSON.parse(json));
    expect(d.positionOf(['paths', '/a', 'get'])).toEqual({ ...where(json, '"get"'), exact: true });
    expect(d.positionOf(['paths', '/a', 'get', 'parameters', '0'])).toEqual({ ...where(json, '{ "name"'), exact: true });
    expect(d.positionOf(['paths', '/a', 'get', 'parameters', '0', 'in'])).toEqual({ ...where(json, '"in"'), exact: true });
  });

  it('falls back to the nearest ancestor for a missing pointer', () => {
    const d = parseDocument(yaml);
    expect(d.positionOf(['paths', '/a', 'post', 'x'])).toEqual({ ...where(yaml, '/a:'), exact: false });
  });

  it('parses JSON escapes and numbers like JSON.parse', () => {
    const text = '{"a":"x\\ny\\u00e9","b":[1,-2.5e3,0,true,false,null],"c":{}}';
    expect(parseDocument(text).value).toEqual(JSON.parse(text));
  });

  it('never lets __proto__ change the prototype', () => {
    for (const text of ['{"__proto__": {"polluted": true}}', '__proto__:\n  polluted: true\n']) {
      const v = parseDocument(text).value as Record<string, unknown>;
      expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
      expect(Object.keys(v)).toEqual(['__proto__']);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it('returns JSON errors with a line, column and plain-English hint', () => {
    const d = parseDocument('{\n  "a": 1,\n  "b": 2,\n}\n', 'bad.json');
    expect(d.value).toBeUndefined();
    expect(d.errors).toEqual([{ line: 4, column: 1, message: 'Expected a quoted key', hint: expect.stringContaining('trailing comma') }]);
  });

  it('returns YAML errors with a hint', () => {
    const d = parseDocument('a: 1\na: 2\n', 'dup.yaml');
    expect(d.errors[0]).toMatchObject({ line: 2, column: 1, hint: expect.stringContaining('appears twice') });
    const tab = parseDocument('a:\n\tb: 1\n');
    expect(tab.errors.length).toBeGreaterThan(0);
    expect(tab.errors[0]?.hint).toMatch(/tabs|indentation/i);
  });

  it('refuses YAML alias bombs', () => {
    const lines = ['a0: &a0 [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 9; i++) lines.push(`a${i}: &a${i} [${Array(10).fill(`*a${i - 1}`).join(', ')}]`);
    const d = parseDocument(lines.join('\n'));
    expect(d.errors[0]?.message).toMatch(/aliases/);
  });

  it('keeps shared values for ordinary anchors', () => {
    const d = parseDocument('base: &b {type: string}\nuse: *b\n');
    const v = d.value as Record<string, unknown>;
    expect(v.use).toBe(v.base);
  });
});

describe('detectOpenApi', () => {
  it('detects versions in YAML and JSON', () => {
    expect(detectOpenApi('openapi: 3.1.0\ninfo: {}')).toEqual({ isOpenApi: true, specVersion: '3.1.0' });
    expect(detectOpenApi("openapi: '3.2.0'")).toEqual({ isOpenApi: true, specVersion: '3.2.0' });
    expect(detectOpenApi('{"info": {}, "swagger": "2.0"}')).toEqual({ isOpenApi: true, specVersion: '2.0' });
    expect(detectOpenApi('name: package\nversion: 1.0.0')).toEqual({ isOpenApi: false });
    expect(detectOpenApi('# Title\n\nopenapi is great')).toEqual({ isOpenApi: false });
  });
});

describe('hash helpers', () => {
  it('stableStringify sorts keys and survives cycles', () => {
    const a: Record<string, unknown> = { b: 1, a: [2, { d: 1, c: 2 }] };
    a.self = a;
    expect(stableStringify(a)).toBe('{"a":[2,{"c":2,"d":1}],"b":1,"self":"…"}');
  });

  it('fnv1a64 matches the published test vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
});

describe('OA-01 duplicate keys in an OpenAPI JSON file', () => {
  it('are an error at the second key, as in YAML, not a silent last-one-wins', async () => {
    const { parseDocument } = await import('./parse');
    const text = '{\n  "paths": {\n    "/a": { "get": {} },\n    "/a": { "post": {} }\n  }\n}';
    const r = parseDocument(text, 'b.json');
    expect(r.errors.map((e) => [e.line, e.message])).toEqual([[4, 'Map keys must be unique: "/a" appears twice in this object']]);
  });
});

describe('X-13 utf8Length matches TextEncoder, malformed text included', () => {
  it('counts each string exactly as TextEncoder encodes it', async () => {
    const { utf8Length } = await import('./hash');
    for (const s of ['abc', 'é', '€', '😀', '\ud800é', '\ud800', 'a\udc00b', '😀\ud800x']) expect(utf8Length(s), JSON.stringify(s)).toBe(new TextEncoder().encode(s).length);
  });
});

describe('IN-09 a JSON spec with comments gets a hint about comments', () => {
  it('names the comment as the problem, not the quotes', async () => {
    const { parseDocument } = await import('./parse');
    const r = parseDocument('{\n  // spec\n  "openapi": "3.1.0"\n}', 'a.json');
    expect(r.errors[0]).toMatchObject({ line: 2, column: 3 });
    expect(r.errors[0]!.hint).toMatch(/JSON has no comments/);
  });
});
