import { expect, it } from 'vitest';
import { detectMode, detectPair } from './detect';

it('detects modes', () => {
  expect(detectMode('a.yaml', 'openapi: 3.1.0\ninfo: {}\n')).toEqual({ mode: 'openapi', specVersion: '3.1.0' });
  expect(detectMode('a.json', '{"swagger": "2.0"}')).toEqual({ mode: 'openapi', specVersion: '2.0' });
  expect(detectMode('a.json', '{"a":1}').mode).toBe('json');
  expect(detectMode('x', '{"a":1}').mode).toBe('json');
  expect(detectMode('a.yml', 'a: 1').mode).toBe('yaml');
  expect(detectMode('README.md', 'hi').mode).toBe('markdown');
  expect(detectMode('a.ts', 'const a = 1;')).toEqual({ mode: 'code', language: 'typescript' });
  expect(detectMode('client.ts (new)', 'const a = 1;')).toEqual({ mode: 'code', language: 'typescript' });
  expect(detectMode('log.txt', 'line one\nline two').mode).toBe('text');
  expect(detectMode('', 'name: x\nage: 2\n').mode).toBe('yaml');
});

it('pairs', () => {
  expect(detectPair({ mode: 'openapi' }, { mode: 'openapi' }).mode).toBe('openapi');
  expect(detectPair({ mode: 'openapi' }, { mode: 'json' }).mode).toBe('yaml');
  expect(detectPair({ mode: 'markdown' }, { mode: 'code', language: 'go' }).mode).toBe('text');
});
