import { describe, expect, it } from 'vitest';
import { Config } from '../schemas';
import { diffText, foldRows } from './diff';

const opts = (o: Partial<Config['text']> = {}) => ({ ...Config.parse({}).text, ...o });

describe('diffText', () => {
  it('pairs removed and added lines into changes with word highlights', () => {
    const d = diffText('a\nrequired: [amount]\nc\n', 'a\nrequired: [amount, currency]\nc\n', opts({ precision: 'word' }));
    expect(d.stats).toEqual({ added: 0, removed: 0, changed: 1 });
    const row = d.rows[1]!;
    expect(row.type).toBe('change');
    expect(row.right!.segs.filter((s) => s.kind === 'add').map((s) => s.text).join('')).toContain('currency');
    expect(d.blocks).toEqual([1]);
  });

  it('identical when only whitespace differs and ignoreWhitespace is on', () => {
    expect(diffText('a  b\n', 'a b\n', opts({ ignoreWhitespace: true })).identical).toBe(true);
    expect(diffText('a  b\n', 'a b\n', opts()).identical).toBe(false);
  });

  it('ignores case and line endings', () => {
    expect(diffText('Hello\r\n', 'hello\n', opts({ ignoreCase: true })).identical).toBe(true);
    expect(diffText('x\r\n', 'x\n', opts({ ignoreLineEndings: false })).identical).toBe(false);
  });

  it('masks filter matches on both sides and counts hits', () => {
    const filters = [{ name: 'Timestamps', pattern: '\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z', replace: '‹time›' }];
    const d = diffText('at 2026-11-14T09:12:00Z ok\n', 'at 2026-11-15T10:00:00Z ok\n', opts({ filters }));
    expect(d.identical).toBe(true);
    expect(d.filters).toEqual([{ name: 'Timestamps', hits: 2 }]);
    expect(d.rows[0]!.left!.segs[0]!.text).toBe('at ‹time› ok');
  });

  it('reports an invalid filter instead of throwing', () => {
    const d = diffText('a\n', 'b\n', opts({ filters: [{ name: 'Bad', pattern: '(', replace: 'x' }] }));
    expect(d.filters[0]!.error).toBeTruthy();
  });

  it('applies transforms before comparing', () => {
    expect(diffText('b\na\n', 'a\nb\n', opts({ transforms: ['sortLines'] })).identical).toBe(true);
  });

  it('smart precision shows the whole line when lines share little', () => {
    const d = diffText('completely different\n', 'xyz 123 qq\n', opts({ precision: 'smart' }));
    expect(d.rows[0]!.left!.segs).toEqual([{ text: 'completely different', kind: 'del' }]);
  });

  it('numbers both sides', () => {
    const d = diffText('a\nb\n', 'a\nx\ny\nb\n', opts());
    expect(d.rows.map((r) => [r.type, r.left?.n, r.right?.n])).toEqual([['same', 1, 1], ['add', undefined, 2], ['add', undefined, 3], ['same', 2, 4]]);
  });
});

describe('foldRows', () => {
  it('folds long unchanged runs and keeps context', () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n';
    const after = before.replace('l15\n', 'L15\n');
    const d = diffText(before, after, opts());
    const v = foldRows(d.rows, 3);
    expect(v.filter((x) => x.kind === 'fold')).toHaveLength(2);
    expect(v.length).toBeLessThan(d.rows.length);
  });
});

describe('diffText moves (TX-11)', () => {
  const tax = ['export function tax(amount, rate) {', '  if (rate < 0) throw new Error("rate")', '  return amount * rate', '}'];
  const total = ['export function total(items) {', '  return items.reduce((s, i) => s + i.price, 0)', '}'];
  const pad = (p: string) => Array.from({ length: 6 }, (_, i) => `// ${p} filler line ${i}`);

  it('finds a block moved unchanged and marks both ends', () => {
    const before = [...tax, ...pad('a'), ...total].join('\n') + '\n';
    const after = [...pad('a'), ...total, ...tax].join('\n') + '\n';
    const d = diffText(before, after, opts(), { moves: true });
    expect(d.moves).toEqual([{ from: [1, 4], to: [10, 13], rows: [0, d.rows.findIndex((r) => r.move === 0 && r.right)], edited: false, words: 0 }]);
    expect(d.rows.filter((r) => r.move === 0 && r.left)).toHaveLength(4);
    expect(d.rows.filter((r) => r.move === 0 && r.right)).toHaveLength(4);
    // An unchanged moved line has no word highlights.
    expect(d.rows.find((r) => r.move === 0 && r.right)!.right!.segs.every((s) => s.kind === 'same')).toBe(true);
  });

  it('highlights a word edited inside a moved block', () => {
    const before = [...tax, ...pad('b'), ...total].join('\n') + '\n';
    const edited = tax.map((l) => l.replace('return amount * rate', 'return Math.round(amount * rate)'));
    const after = [...pad('b'), ...total, ...edited].join('\n') + '\n';
    const d = diffText(before, after, opts(), { moves: true });
    expect(d.moves).toHaveLength(1);
    expect(d.moves![0]!.edited).toBe(true);
    expect(d.moves![0]!.words).toBe(2); // "Math.round(" and ")"
    const row = d.rows.find((r) => r.move === 0 && r.right?.n === 12)!;
    expect(row.right!.segs.filter((s) => s.kind === 'add').map((s) => s.text).join('')).toContain('Math.round');
  });

  it('ignores runs shorter than three lines and edits in place', () => {
    const d1 = diffText('aaaa\nbbbb\nx\ny\nz\n', 'x\ny\nz\naaaa\nbbbb\n', opts(), { moves: true });
    expect(d1.moves).toEqual([]);
    const d2 = diffText('one line\ntwo line\nthree line\n', 'one LINE\ntwo LINE\nthree LINE\n', opts(), { moves: true });
    expect(d2.moves).toEqual([]);
    expect(d2.rows.every((r) => r.type === 'change')).toBe(true);
  });

  it('is off unless asked for, and deterministic', () => {
    const before = [...tax, ...pad('c'), ...total].join('\n') + '\n';
    const after = [...pad('c'), ...total, ...tax].join('\n') + '\n';
    expect(diffText(before, after, opts()).moves).toBeUndefined();
    expect(JSON.stringify(diffText(before, after, opts(), { moves: true }))).toBe(JSON.stringify(diffText(before, after, opts(), { moves: true })));
  });
});

describe('large, mostly different inputs (X-02)', () => {
  it('a 20,000-line diff where every line changed finishes quickly with an approximate alignment', () => {
    const a = Array.from({ length: 20000 }, (_, i) => `line ${i} alpha ${i * 7}`).join('\n') + '\n';
    const b = Array.from({ length: 20000 }, (_, i) => `row ${i} beta ${i * 3}`).join('\n') + '\n';
    const t0 = performance.now();
    const d = diffText(a, b, opts());
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(4000);
    expect(d.approximate).toBe(true);
    expect(d.stats.changed).toBe(20000);
  });
  it('small inputs stay exact', () => {
    expect(diffText('a\nb\n', 'a\nc\n', opts()).approximate).toBeUndefined();
  });
});
