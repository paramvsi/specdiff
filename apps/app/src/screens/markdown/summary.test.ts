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
