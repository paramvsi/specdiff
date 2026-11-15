import { expect, it } from 'vitest';
import { parseRevPath } from './inputs';

it('parses rev:path and refuses option-like revisions', () => {
  expect(parseRevPath('main:openapi.yaml')).toEqual({ rev: 'main', path: 'openapi.yaml' });
  expect(parseRevPath('C:\\x.yaml')).toBeUndefined();
  expect(() => parseRevPath('--output=/tmp/x:openapi.yaml')).toThrow(/must not start/);
});
