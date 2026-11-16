import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useOverlays } from './commands';
import { Shortcuts } from './Shortcuts';

afterEach(() => { document.body.innerHTML = ''; });

it('O-03 names modifier keys for screen readers (Command, Shift, Option), not by their symbol', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useOverlays.getState().set({ shortcuts: true });
  const host = document.body.appendChild(document.createElement('div'));
  await act(async () => { createRoot(host).render(<Shortcuts />); });
  const keysOf = (label: string) => [...document.querySelectorAll('dt')].find((d) => d.textContent === label)!.nextElementSibling!;
  const spoken = (el: Element) => [...el.querySelectorAll('kbd')].map((k) => [...k.childNodes].filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join('')).join(' ');
  expect(spoken(keysOf('Go to line'))).toBe('Command G');
  expect(spoken(keysOf('Load from URL'))).toBe('Command Shift O');
  expect(spoken(keysOf('Word wrap'))).toBe('Option Z');
  expect(spoken(keysOf('Next change'))).toBe('J');
});
