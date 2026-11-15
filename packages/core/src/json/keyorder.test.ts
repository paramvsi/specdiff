// JS-01 key order, keyed array moves by key, JS-04 null vs missing in stats (audit A-07).
import { describe, expect, it } from 'vitest';
import { Config } from '../schemas';
import { diffJson } from './diff';

const o = (x: Partial<Config['json']> = {}) => ({ ...Config.parse({}).json, ...x });

describe('JS-01 key order', () => {
  it('ignores key order by default', () => {
    expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 }, o()).changes).toEqual([]);
  });
  it('reports a key whose position changed when ignoreKeyOrder is off', () => {
    const d = diffJson({ a: 1, b: 2, c: 3 }, { b: 2, c: 3, a: 1 }, o({ ignoreKeyOrder: false }));
    expect(d.changes).toEqual([{ kind: 'moved', jsonPath: '$.a', before: 0, after: 2 }]);
    expect(d.stats.moved).toBe(1);
  });
  it('finds reordered keys nested in array items too', () => {
    const d = diffJson({ t: [{ x: 1, y: 2 }] }, { t: [{ y: 2, x: 1 }] }, o({ ignoreKeyOrder: false, ignoreArrayOrder: true }));
    expect(d.changes.map((c) => [c.kind, c.jsonPath])).toEqual([['moved', '$.t[0].x']]);
  });
});

describe('keyed array moves', () => {
  it('reports the moved item by its key, with indexes before → after', () => {
    const flags = (keys: string[]) => keys.map((key) => ({ key, on: true }));
    const d = diffJson({ flags: flags(['a', 'new_pricing', 'b', 'c']) }, { flags: flags(['a', 'b', 'c', 'new_pricing']) }, o());
    expect(d.changes).toEqual([{ kind: 'moved', jsonPath: '$.flags[?(@.key=="new_pricing")]', from: '$.flags[1]', to: '$.flags[3]', before: 1, after: 3 }]);
  });
});

describe('JS-04 null vs missing', () => {
  it('counts null → missing on its own, not as removed', () => {
    const d = diffJson({ owner: null, gone: 1 }, { added: null }, o());
    expect(d.stats).toMatchObject({ removed: 1, added: 0, nullVsMissing: 2 });
    expect(d.changes.map((c) => c.kind).sort()).toEqual(['added', 'removed', 'removed']);
  });
});
