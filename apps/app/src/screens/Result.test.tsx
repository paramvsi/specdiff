// X-08: "Show formatting changes" works in the identical states of the structured modes, and the copy
// never claims "0 formatting-only lines were ignored".
import { Toaster } from '@specdiff/ui';
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useApp } from '../state/store';
import type { CompareResult } from '../worker/protocol';
import { Result } from './Result';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  useApp.setState({ result: null });
});

const text = (changed: number) => ({
  rows: [],
  blocks: changed ? [0] : [],
  stats: { added: 0, removed: 0, changed },
  filters: [],
  identical: !changed,
});
const json = (changed: number): CompareResult => ({
  mode: 'json',
  detected: 'json',
  text: text(changed),
  json: {
    diff: { changes: [], stats: { added: 0, removed: 0, changed: 0, moved: 0, typeChanged: 0, nullVsMissing: 0 }, matchKeys: {} },
    changes: [],
    duplicates: { before: [], after: [] },
    before: { a: 1, b: 2 },
    after: { b: 2, a: 1 },
  },
});
const markdown = (changed: number): CompareResult => ({
  mode: 'markdown',
  detected: 'markdown',
  text: text(changed),
  markdown: { blocks: [], outline: [], brokenAnchors: [], stats: { added: 0, removed: 0, edited: 0 }, sections: { added: 0, removed: 0, edited: 0 } },
});

async function render(result: CompareResult) {
  useApp.setState({ result });
  const div = document.body.appendChild(document.createElement('div'));
  root = createRoot(div);
  await act(async () => root!.render(<Toaster><Suspense fallback={null}><Result /></Suspense></Toaster>));
}
const button = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

it.each([
  ['JSON', json],
  ['Markdown', markdown],
] as const)('%s: formatting-only differences can be shown, with the real count', async (_, make) => {
  await render(make(2));
  expect(document.body.textContent).toContain('No differences');
  expect(document.body.textContent).toContain('2 formatting-only lines were ignored');
  const show = button('Show formatting changes');
  expect(show).toBeTruthy();
  await act(async () => show!.click());
  // The raw line diff (lazy TextResult) replaces the identical state.
  for (let i = 0; i < 100 && !button('Hide formatting changes'); i++)
    await act(() => new Promise((r) => setTimeout(r, 20)));
  expect(button('Hide formatting changes')).toBeTruthy();
  expect(document.body.textContent).not.toContain('No differences');
});

it('no formatting difference: no button, and no "0 lines" claim', async () => {
  await render(json(0));
  expect(document.body.textContent).toContain('No differences');
  expect(document.body.textContent).not.toMatch(/0 formatting-only/);
  expect(button('Show formatting changes')).toBeUndefined();
});
