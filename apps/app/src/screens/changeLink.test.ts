import { decodeShare, SHARE_WARN_BYTES } from '@specdiff/core/share';
import { beforeEach, expect, it, vi } from 'vitest';
import { defaultSettings, useApp } from '../state/store';
import { copyChangeLink } from './changeLink';

let copied = '';
beforeEach(() => {
  copied = '';
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied = t; } } });
  useApp.setState({ before: { name: 'a.yaml', content: 'a: 1\n', size: 5 }, after: { name: 'b.yaml', content: 'a: 2\n', size: 5 }, mode: 'yaml', result: null, settings: defaultSettings, decisions: { version: 1, decisions: {} } });
});

it('M-20: the copied link is a full share link that opens on that change, in any tab', async () => {
  const toast = vi.fn();
  await copyChangeLink('c-0001', toast);
  const hash = copied.slice(copied.indexOf('#') + 1);
  expect(hash).toMatch(/^v=1&/);
  const p = await decodeShare(hash);
  expect([p.left.content, p.right.content, p.view?.changeId]).toEqual(['a: 1\n', 'a: 2\n', 'c-0001']);
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link to this change copied' }));
});

it('M-20: over the size limit it warns and offers the .specdiff.json file', async () => {
  const big = Array.from({ length: 4000 }, (_, i) => `k${i}: ${(i * 7919).toString(36)}${Math.sin(i)}`).join('\n');
  useApp.setState({ after: { name: 'b.yaml', content: big, size: big.length } });
  const toast = vi.fn();
  await copyChangeLink('c-0001', toast);
  expect(new Blob([copied]).size).toBeGreaterThan(SHARE_WARN_BYTES);
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Link is long', tone: 'warning', action: expect.objectContaining({ label: 'Download file' }) }));
});
