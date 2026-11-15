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
    expect(x.blocks.map((b) => b.html).join('')).toMatch(/<input type="checkbox"[^>]*aria-label="todo"/);
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

describe('MD-03 heading pairing', () => {
  it('an unrelated title over an unchanged body is a rename: one edited heading, old and new title whole, not garbled', () => {
    const x = diffMarkdown('# API\n\n## Rate limits\n\nTen per second.\n', '# API\n\n## Migrating to v2\n\nTen per second.\n');
    expect(x.blocks.map((b) => [b.status, b.heading?.text ?? b.type])).toEqual([
      ['same', 'API'],
      ['edited', 'Migrating to v2'],
      ['same', 'paragraph'],
    ]);
    expect(x.blocks[1]!.html).toBe('<h2><del>Rate limits</del><ins>Migrating to v2</ins></h2>');
  });
  it('a removed section and an unrelated added one (bodies differ) are removed + added', () => {
    const x = diffMarkdown('# API\n\n## Rate limits\n\nTen per second.\n', '# API\n\n## Migrating to v2\n\nSend currency on every call.\n');
    expect(x.blocks.map((b) => [b.status, b.heading?.text ?? b.type])).toEqual([
      ['same', 'API'],
      ['removed', 'Rate limits'],
      ['removed', 'paragraph'],
      ['added', 'Migrating to v2'],
      ['added', 'paragraph'],
    ]);
  });
  it('a renamed heading with a similar title still pairs as edited', () => {
    const x = diffMarkdown('## Errors\n', '## Error codes\n');
    expect(x.blocks.map((b) => b.status)).toEqual(['edited']);
  });
});

describe('MD-07 GitHub callouts', () => {
  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])('renders > [!%s] as a callout block with a title', (k) => {
    const x = diffMarkdown('', `> [!${k}]\n> Read this.\n`);
    const title = k[0] + k.slice(1).toLowerCase();
    expect(x.blocks[0]!.html).toBe(`<div class="markdown-alert markdown-alert-${k.toLowerCase()}">\n<p class="markdown-alert-title">${title}</p>\n<p>Read this.</p>\n</div>`);
    expect(x.blocks[0]!.callout).toBe(k.toLowerCase());
  });
  it('marks words inside an edited callout and keeps plain blockquotes plain', () => {
    const x = diffMarkdown('> [!NOTE]\n> Old note\n', '> [!NOTE]\n> New note\n');
    expect(x.blocks[0]!.html).toContain('class="markdown-alert-title">Note</p>');
    expect(x.blocks[0]!.html).toMatch(/<del>Old<\/del><ins>New<\/ins>/);
    expect(x.blocks[0]!.html).not.toContain('[!NOTE]');
    expect(diffMarkdown('', '> just a quote\n').blocks[0]!.html).toBe('<blockquote>\n<p>just a quote</p>\n</blockquote>');
  });
  it('stays sanitised: other classes on raw HTML are still stripped', () => {
    const x = diffMarkdown('', '<div class="evil markdown-alert" onclick="x()">hi</div>\n');
    expect(x.blocks[0]!.html).not.toMatch(/evil|onclick/);
  });
});

describe('whitespace that renders the same', () => {
  it('a paragraph whose only change is runs of spaces is not reported as edited', () => {
    expect(diffMarkdown('Some   text here.\n', 'Some text here.\n').stats).toEqual(expect.objectContaining({ added: 0, removed: 0, edited: 0 }));
  });
});
