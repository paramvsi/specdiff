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
