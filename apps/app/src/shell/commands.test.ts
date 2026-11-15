import { expect, it } from 'vitest';
import { commandFor } from './commands';

const k = (
  key: string,
  o: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    code: string;
  }> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  code: `Key${key.toUpperCase()}`,
  ...o,
});

it('maps the O-03 sheet', () => {
  expect(commandFor(k('j'), false)).toBe('next-change');
  expect(commandFor(k('k', { metaKey: true }), false)).toBe('palette');
  expect(commandFor(k('k', { ctrlKey: true }), true)).toBe('palette');
  expect(commandFor(k('O', { metaKey: true, shiftKey: true }), false)).toBe('load-url');
  expect(commandFor(k('U', { shiftKey: true }), false)).toBe('toggle-unified');
  expect(commandFor(k('Ω', { altKey: true, code: 'KeyZ' }), false)).toBe('toggle-wrap');
  expect(commandFor(k('?', { shiftKey: true }), false)).toBe('shortcuts');
  expect(commandFor({ ...k('?'), shiftKey: false }, false)).toBe('shortcuts');
  expect(commandFor(k('a'), false)).toBe('accept');
});

it('ignores single keys while typing', () => {
  expect(commandFor(k('j'), true)).toBeUndefined();
  expect(commandFor(k('a'), true)).toBeUndefined();
});
