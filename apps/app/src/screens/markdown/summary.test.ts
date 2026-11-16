import { diffMarkdown } from '@specdiff/core/markdown';
import { expect, it } from 'vitest';
import { samples } from '../../lib/samples';
import { mdSummary } from './summary';

it('AMarkdown: the export counts sections and blocks separately, each labelled', () => {
  const s = samples().find((x) => x.id === 'markdown')!;
  const d = diffMarkdown(s.before.content, s.after.content);
  const out = mdSummary(d, { before: 'README.md', after: 'README.md (edited)' });
  expect(out).toContain('Sections: 1 added, 1 removed, 4 edited.');
  expect(out).toMatch(/Blocks: \d+ added, \d+ removed, \d+ edited\./);
});

it('M-13: headings, link text, URLs and anchors from the documents cannot mention, link or reference', () => {
  const d = diffMarkdown('# Old\n\n[a](https://a.example)\n', '# @team #12 [x](https://evil.example)\n\n[@here](https://b.example)\n\nSee [up](#123).\n');
  const out = mdSummary(d, { before: '@ops.md', after: 'b.md' });
  const outsideCode = out.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '');
  expect(outsideCode).not.toMatch(/@[\p{L}\p{N}_]/u);
  expect(outsideCode).not.toMatch(/#[\p{N}]/u);
  expect(outsideCode).not.toMatch(/https?:\/\/|\]\(/);
});
