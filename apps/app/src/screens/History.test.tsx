import { Toaster } from '@specdiff/ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { clearHistory, listHistory, saveHistory } from '../state/persist';
import type { CompareResult } from '../worker/protocol';
import History from './History';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
beforeEach(() => clearHistory());
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

async function waitFor<T>(fn: () => T | null | undefined | false, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const r = fn();
    if (r) return r;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await act(() => new Promise((res) => setTimeout(res, 20)));
  }
}
const btn = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const src = (name: string) => ({ name, content: name, size: name.length });
const text = (n: number): CompareResult => ({
  mode: 'text',
  detected: 'text',
  text: { rows: [], blocks: [], stats: { added: n, removed: 0, changed: 0 }, filters: [], identical: false },
});

it('lists, pins and deletes history entries', async () => {
  await saveHistory(src('a.log'), src('b.log'), text(3));
  await saveHistory(src('c.log'), src('d.log'), text(1));
  const div = document.body.appendChild(document.createElement('div'));
  root = createRoot(div);
  await act(async () =>
    root!.render(
      <Toaster>
        <History />
      </Toaster>,
    ),
  );
  await waitFor(() => btn('Pin a.log → b.log'));
  expect(document.body.textContent).toContain('2 comparisons');

  await act(async () => btn('Pin a.log → b.log')!.click());
  const unpin = await waitFor(() => btn('Unpin a.log → b.log'));
  expect(unpin.getAttribute('aria-pressed')).toBe('true');
  expect((await listHistory())[0]!.pinned).toBe(true);
  // The pinned row sits in the "Pinned" group, before "Earlier".
  const groups = [...document.querySelectorAll('tbody')].map((t) => t.querySelector('th')!.textContent);
  expect(groups).toEqual(['Pinned', 'Earlier']);

  await act(async () => btn('Delete c.log → d.log')!.click());
  await waitFor(() => !btn('Delete c.log → d.log'));
  expect((await listHistory()).map((e) => e.before.name)).toEqual(['a.log']);
});

it('shows the empty state', async () => {
  const div = document.body.appendChild(document.createElement('div'));
  root = createRoot(div);
  await act(async () => root!.render(<History />));
  await waitFor(() => document.body.textContent?.includes('No comparisons yet'));
  expect(document.body.textContent).toContain('Try a sample');
});
