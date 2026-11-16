import { expect, it } from 'vitest';
import { searchLabel } from './labels';

it('the top-bar search names what it searches, per mode, as the frames do (A03 text, A09 code, A09-Fallback)', () => {
  const r = (x: object) => x as never;
  expect(searchLabel(r({ mode: 'text' }))).toBe('Search text');
  expect(searchLabel(r({ mode: 'code', code: { fallback: 'unsupported' } }))).toBe('Search text');
  expect(searchLabel(r({ mode: 'code', code: { changes: [] } }))).toBe('Search code');
  for (const mode of ['openapi', 'json', 'yaml', 'markdown']) expect(searchLabel(r({ mode }))).toBe('Search changes');
});
