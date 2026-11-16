import { expect, it } from 'vitest';
import { claudeUrl } from './CopyLlm';

it('OUT-12 Open in Claude: a long text cut at the cap never splits an emoji (encodeURIComponent would throw)', () => {
  const url = claudeUrl('x'.repeat(5940) + '😀'.repeat(40));
  expect(url.startsWith('https://claude.ai/new?q=')).toBe(true);
  const q = decodeURIComponent(url.slice('https://claude.ai/new?q='.length));
  expect(q.startsWith('Explain these API changes and how to migrate:\n\n')).toBe(true);
  expect([...q].length).toBeLessThanOrEqual(6000);
});
