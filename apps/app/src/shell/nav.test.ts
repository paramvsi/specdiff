import { afterEach, expect, it } from 'vitest';
import { readChangeHash } from './nav';

afterEach(() => { location.hash = ''; });

it('X-12 a mangled #change= link is read as written, not a crash', () => {
  location.hash = '#change=50%';
  expect(readChangeHash()).toBe('50%');
  location.hash = '#change=c-0001';
  expect(readChangeHash()).toBe('c-0001');
});
