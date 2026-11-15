import { encodeShare } from '@specdiff/core/share';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { usePending } from '../shell/boot';
import Unlock from './Unlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

async function waitFor<T>(fn: () => T | null | undefined | false, ms = 10000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const r = fn();
    if (r) return r;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await act(() => new Promise((res) => setTimeout(res, 20)));
  }
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount() {
  const div = document.body.appendChild(document.createElement('div'));
  root = createRoot(div);
  await act(async () => root!.render(<Unlock />));
}

const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? '';

it('shows the wrong-passphrase error and keeps the screen', async () => {
  usePending.hash =
    '#' +
    (await encodeShare(
      { left: { name: 'a', content: 'x' }, right: { name: 'b', content: 'y' }, mode: 'text' },
      'correct horse battery',
    ));
  await mount();
  await act(async () => type(document.querySelector('input')!, 'wrong horse'));
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  await waitFor(() => alertText());
  expect(alertText()).toBe('That passphrase didn’t unlock it. Check for extra spaces.');
  expect(document.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
  expect(document.querySelector('h1')!.textContent).toBe('This comparison is locked');
});

it('explains a damaged link', async () => {
  usePending.hash = '#v=1&e=1&c=AAAA';
  await mount();
  await act(async () => type(document.querySelector('input')!, 'anything'));
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  await waitFor(() => alertText());
  expect(alertText()).toMatch(/damaged or incomplete/);
});
