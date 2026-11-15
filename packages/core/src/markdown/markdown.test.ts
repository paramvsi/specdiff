import { describe, expect, it } from 'vitest';
import { diffMarkdown } from './diff';

const before = '# Payments API\n\nCreate a payment with `POST /v1/payments`.\n\nSee the [guide](https://docs.example.com/v1).\n\n## Errors\n\nRead [errors](#errors).\n';
const after = '# Payments API\n\nCreate a payment with `POST /v1/payments`.\nThe `currency` field is required.\n\nSee the [guide](https://docs.example.com/v2).\n\n## Error codes\n\nRead [errors](#errors).\n';

describe('diffMarkdown', () => {
  const d = diffMarkdown(before, after);
  it('marks word-level insertions in the rendered block', () => {
    const edited = d.blocks.find((b) => b.status === 'edited' && b.type === 'paragraph' && b.html.includes('currency'))!;
    expect(edited.html).toContain('<ins>');
    expect(edited.html).toContain('<code>POST /v1/payments</code>');
  });
  it('reports changed links with before/after', () => {
    expect(d.blocks.flatMap((b) => b.links ?? [])).toEqual([{ text: 'guide', before: 'https://docs.example.com/v1', after: 'https://docs.example.com/v2' }]);
  });
  it('outline marks the renamed heading as edited', () => {
    expect(d.outline.map((o) => [o.text, o.status])).toEqual([['Payments API', 'same'], ['Error codes', 'edited']]);
  });
  it('finds the anchor broken by the rename', () => {
    expect(d.brokenAnchors).toEqual([{ anchor: 'errors', line: 10, renamedFrom: 'errors', renamedTo: 'error-codes' }]);
  });
  it('handles GFM tables, task lists and code blocks', () => {
    const x = diffMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] todo\n\n```js\nconst a = 1;\n```\n', '| a | b |\n|---|---|\n| 1 | 3 |\n\n- [x] todo\n\n```js\nconst a = 2;\n```\n');
    expect(x.stats.edited).toBe(3);
    expect(x.blocks[0]!.html).toContain('<table>');
    expect(x.blocks.find((b) => b.code)!.code).toEqual({ lang: 'js', before: 'const a = 1;', after: 'const a = 2;' });
  });
  it('sanitises HTML', () => {
    const x = diffMarkdown('', '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n');
    const html = x.blocks.map((b) => b.html).join('');
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });
  it('identical documents produce only same blocks', () => {
    expect(diffMarkdown(before, before).stats).toEqual({ added: 0, removed: 0, edited: 0 });
  });
});
