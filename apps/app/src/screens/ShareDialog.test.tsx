import { decodeShare } from '@specdiff/core/share';
import { Toaster } from '@specdiff/ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useApp } from '../state/store';
import { ShareDialog } from './ShareDialog';

// Testing Library isn't a dependency of the app package; react-dom + act is enough here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let root: Root | null = null;
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

it('builds a share link whose hash decodeShare round-trips', async () => {
  const src = (name: string, content: string) => ({ name, content, size: content.length });
  useApp.setState({
    before: src('a.json', '{"a":1}\n'),
    after: src('b.json', '{"a":2}\n'),
    mode: 'json',
    result: null,
  });
  const div = document.body.appendChild(document.createElement('div'));
  root = createRoot(div);
  await act(async () =>
    root!.render(
      <Toaster>
        <ShareDialog open onOpenChange={() => {}} />
      </Toaster>,
    ),
  );
  const input = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[aria-label="Share link"]');
    return el?.value.includes('#v=1') ? el : null;
  });
  const url = new URL(input.value);
  expect(url.pathname).toBe(location.pathname);
  const payload = await decodeShare(url.hash);
  expect(payload.left).toEqual({ name: 'a.json', content: '{"a":1}\n' });
  expect(payload.right).toEqual({ name: 'b.json', content: '{"a":2}\n' });
  expect(payload.mode).toBe('json');
  expect(payload.options).toEqual({});
  expect(document.body.textContent).toContain('Link size');
});

it('OUT-05: "open on the current change" puts the change id and its tab in the payload', async () => {
  const { sharePayload } = await import('./ShareDialog');
  const src = (name: string, content: string) => ({ name, content, size: content.length });
  const p = sharePayload({
    before: src('a.yaml', 'openapi: 3.1.0\n'),
    after: src('b.yaml', 'openapi: 3.1.0\n'),
    result: null,
    mode: 'openapi',
    settings: useApp.getState().settings,
    decisions: { version: 1, decisions: {} },
    includeRules: false,
    includeDecisions: false,
    changeId: 'c-0003',
    tab: 'workspace',
  });
  expect(p.view).toEqual({ changeId: 'c-0003', tab: 'workspace' });
});
