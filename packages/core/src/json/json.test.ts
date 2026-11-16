import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import jsonpatch, { type Operation } from 'fast-json-patch';
import { Config } from '../schemas';
import { detectMatchKey, diffJson, humanPath, toChanges } from './diff';
import { applyMergePatch, jsonMarkdown, jsonPatch, jsonPathList, mergePatch } from './export';
import { parseWithPositions, type Parsed } from './parse';

const o = (x: Partial<Config['json']> = {}) => ({ ...Config.parse({}).json, ...x });
const parse = (s: string) => { const r = parseWithPositions(s); if ('error' in r) throw new Error(r.error.message); return r as Parsed; };

describe('diffJson', () => {
  it('ignores key order and reports the design sample', () => {
    const a = { region: 'me-central-1', retries: 3, features: ['refunds', 'payouts'] };
    const b = { retries: 5, region: 'me-central-1', features: ['payouts', 'refunds', 'disputes'] };
    const d = diffJson(a, b, o());
    expect(d.changes.map((c) => [c.kind, c.jsonPath])).toEqual([
      ['moved', '$.features[1]'],
      ['added', '$.features[2]'],
      ['changed', '$.retries'],
    ]);
  });

  it('matches array items by auto-detected key and reports moves', () => {
    const a = { items: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }] };
    const b = { items: [{ id: 2, v: 'b' }, { id: 3, v: 'C' }, { id: 1, v: 'a' }, { id: 4, v: 'd' }] };
    const d = diffJson(a, b, o());
    expect(d.matchKeys).toEqual({ '$.items[*]': 'id' });
    expect(d.changes.map((c) => c.kind).sort()).toEqual(['added', 'changed', 'moved']);
    expect(d.changes.find((c) => c.kind === 'changed')!.jsonPath).toBe('$.items[?(@.id==3)].v');
  });

  it('does not use a key that is not unique', () => {
    expect(detectMatchKey([{ id: 1 }, { id: 1 }], [{ id: 1 }], 'auto')).toBeUndefined();
    expect(detectMatchKey([{ uuid: 'a' }], [{ uuid: 'b' }], 'auto')).toBe('uuid');
  });

  it('keeps null and missing distinct unless told otherwise', () => {
    expect(diffJson({ a: null }, {}, o()).changes).toHaveLength(1);
    expect(diffJson({ a: null }, {}, o({ nullEqualsMissing: true })).changes).toHaveLength(0);
  });

  it('numeric tolerance and type changed', () => {
    expect(diffJson({ p: 100 }, { p: 100.004 }, o({ numberTolerance: 0.01 })).changes).toHaveLength(0);
    expect(diffJson({ p: 100 }, { p: 100.5 }, o({ numberTolerance: 0.01 })).changes).toHaveLength(1);
    const d = diffJson({ p: 1 }, { p: '1' }, o());
    expect(d.changes[0]!.kind).toBe('typeChanged');
    expect(d.stats.typeChanged).toBe(1);
  });

  it('ignores keys and array order when asked', () => {
    expect(diffJson({ updatedAt: 1, a: 1 }, { updatedAt: 2, a: 1 }, o({ ignoreKeys: ['updatedAt'] })).changes).toHaveLength(0);
    expect(diffJson({ t: [{ x: 1 }, { x: 2 }] }, { t: [{ x: 2 }, { x: 1 }] }, o({ ignoreArrayOrder: true, arrayMatchKey: 'none' })).changes).toHaveLength(0);
  });
});

describe('parse', () => {
  it('reports duplicate keys with line and positions', () => {
    const p = parse('a: 1\nb:\n  c: 2\na: 3\n');
    expect(p.duplicates).toEqual([{ path: '$', key: 'a', line: 4, column: 1 }]);
    expect(p.positions.get('$.b.c')).toEqual({ line: 3, column: 3 });
  });
  it('JSON reports line and column like YAML', () => {
    const p = parse('{\n  "a": {\n    "b": 1\n  }\n}');
    expect(p.positions.get('$.a.b')).toEqual({ line: 3, column: 5 });
  });
  it('returns a pinned error with a hint', () => {
    const r = parseWithPositions('a: [1, 2\nb: 3\n');
    expect('error' in r && r.error.line).toBeGreaterThan(0);
    expect('error' in r && r.error.hint).toBeTruthy();
  });
  it('applies YAML merge keys like the OpenAPI parser does', () => {
    expect(parse('base: &b {x: 1}\nd:\n  <<: *b\n  y: 2\n').value).toEqual({ base: { x: 1 }, d: { x: 1, y: 2 } });
  });
  it('keeps a quoted "<<" key in JSON as an ordinary key', () => {
    expect(parse('{"<<": {"x": 1}}').value).toEqual({ '<<': { x: 1 } });
  });
  it('returns an error, not a throw, for an alias bomb', () => {
    const level = (n: string, prev: string) => `${n}: &${n} [${Array(9).fill(`*${prev}`).join(',')}]\n`;
    const bomb = 'a: &a [x,x,x,x,x,x,x,x,x]\n' + level('b', 'a') + level('c', 'b') + level('d', 'c') + level('e', 'd') + 'f: [*e,*e,*e,*e,*e,*e,*e,*e,*e]\n';
    const r = parseWithPositions(bomb);
    expect('error' in r && r.error.message).toMatch(/alias/i);
  });
  it('says a file is nested too deeply instead of blaming its syntax', () => {
    const deep = '['.repeat(5000) + '1' + ']'.repeat(5000);
    const r = parseWithPositions(deep);
    expect('error' in r && r.error.message).toMatch(/nested too deeply/i);
    expect('error' in r && r.error.hint).not.toMatch(/syntax/i);
  });
  it('diffJson reports deep nesting as a plain error, not a RangeError', () => {
    let deep: unknown = 1; let deep2: unknown = 2;
    for (let i = 0; i < 20000; i++) { deep = [deep]; deep2 = [deep2]; }
    expect(() => diffJson(deep, deep2, Config.parse({}).json)).toThrow(/nested too deeply/i);
  });
  it('explains a file with several YAML documents', () => {
    const r = parseWithPositions('a: 1\n---\nb: 2\n');
    expect('error' in r && r.error.hint).toMatch(/one document/i);
  });
});

describe('X-13 determinism across machines', () => {
  it('orders changes on one line by code point, not by the machine locale', () => {
    const a = parse('{"a": 1, "A": 1, "_a": 1}'), b = parse('{"a": 2, "A": 2, "_a": 2}');
    const d = diffJson(a.value, b.value, Config.parse({}).json);
    const paths = toChanges(d, a, b, { before: 'a.json', after: 'b.json' }, 'json').map((c) => c.jsonPath);
    // Locale collation gives _a, a, A (en) and differs again in lt/et; code points do not.
    expect(paths).toEqual(['$.A', '$._a', '$.a']);
  });
});

describe('exports', () => {
  it('keeps a "__proto__" key in a merge patch as an ordinary key (JS-08)', () => {
    const a = JSON.parse('{"__proto__": {"x": 1}, "y": 1}') as unknown;
    const b = JSON.parse('{"__proto__": {"x": 2}, "y": 1}') as unknown;
    const { patch, lossy } = mergePatch(a, b);
    expect(JSON.stringify(patch)).toBe('{"__proto__":{"x":2}}');
    expect(lossy).toBe(false);
    expect(JSON.stringify(applyMergePatch(a, patch))).toBe(JSON.stringify(b));
  });
  const arb = fc.jsonValue({ maxDepth: 4 });
  it('JSON Patch round-trips (verified with fast-json-patch)', () => {
    fc.assert(fc.property(arb, arb, (a, b) => {
      // fast-json-patch refuses `__proto__` keys by design (prototype-pollution guard), so it can't verify those.
      fc.pre(!JSON.stringify([a, b]).includes('"__proto__"'));
      const ops = jsonPatch(a, b);
      const doc = jsonpatch.deepClone({ root: a });
      // Re-root every pointer, including a move's `from`.
      const rooted = ops.map((op) => ('from' in op ? { ...op, from: '/root' + op.from, path: '/root' + op.path } : { ...op, path: '/root' + op.path }));
      const res = jsonpatch.applyPatch(doc, rooted as Operation[], true).newDocument;
      expect(JSON.stringify(res.root) === JSON.stringify(b) || JSON.stringify(stableSort(res.root)) === JSON.stringify(stableSort(b))).toBe(true);
    }), { numRuns: 300 });
  });
  it('JSON Patch moves apply (fast-check counterexample: [null, "d"] → ["d", null])', () => {
    const ops = jsonPatch([null, 'd'], ['d', null]);
    expect(ops).toEqual([{ op: 'move', from: '/0', path: '/1' }]);
    expect(jsonpatch.applyPatch([null, 'd'], ops as Operation[], true).newDocument).toEqual(['d', null]);
  });
  it('Merge Patch round-trips when lossless', () => {
    fc.assert(fc.property(arb, arb, (a, b) => {
      const { patch, lossy } = mergePatch(a, b);
      if (!lossy) expect(stableSort(applyMergePatch(a, patch))).toEqual(stableSort(b));
    }), { numRuns: 300 });
  });
  it('JSONPath list and Markdown', () => {
    const d = diffJson({ a: 1, b: 2 }, { a: 2, c: 3 }, o());
    expect(jsonPathList(d)).toBe('removed\t$.b\nadded\t$.c\nchanged\t$.a\n'.split('\n').filter(Boolean).sort((x, y) => x.slice(-1).localeCompare(y.slice(-1))).join('\n') + '\n');
    const md = jsonMarkdown(d, { before: 'a.json', after: 'b.json' });
    // A07-JsonExport: "A table of every change".
    expect(md).toContain('| | Path | Change |\n| --- | --- | --- |\n');
    expect(md).toContain('| ~ | a | `1` → `2` |');
    expect(md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| |') && !l.startsWith('| ---'))).toHaveLength(3);
  });
  it('Markdown summary says "1 change", not "1 changes"', () => {
    expect(jsonMarkdown(diffJson({ a: 1 }, { a: 2 }, o()), { before: 'a.json', after: 'b.json' })).toContain('\n1 change: ');
  });
  it('Markdown table cells escape pipes', () => {
    const d = diffJson({ a: 'x|y' }, { a: 'z' }, o());
    expect(jsonMarkdown(d, { before: 'a.json', after: 'b.json' })).toContain('| ~ | a | `"x\\|y"` → `"z"` |');
  });
});

describe('toChanges', () => {
  it('is deterministic with positions and ids', () => {
    const a = parse('{"retries": 3, "region": "x"}'), b = parse('{"retries": 5, "region": "x", "new": true}');
    const c1 = toChanges(diffJson(a.value, b.value, o()), a, b, { before: 'a.json', after: 'b.json' }, 'json');
    const c2 = toChanges(diffJson(a.value, b.value, o()), a, b, { before: 'a.json', after: 'b.json' }, 'json');
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    expect(c1.map((c) => c.id)).toEqual(['c-0001', 'c-0002']);
    expect(humanPath("$.items[?(@.id==3)].v")).toBe('items[id=3] › v');
  });
});

function stableSort(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stableSort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stableSort((v as Record<string, unknown>)[k])]));
  return v;
}
