import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRevPath, readInput } from './inputs';

it('parses rev:path and refuses option-like revisions', () => {
  expect(parseRevPath('main:openapi.yaml')).toEqual({ rev: 'main', path: 'openapi.yaml' });
  expect(parseRevPath('C:\\x.yaml')).toBeUndefined();
  expect(() => parseRevPath('--output=/tmp/x:openapi.yaml')).toThrow(/must not start/);
});

describe('readInput sibling files', () => {
  const setup = (spec: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-in-'));
    writeFileSync(join(dir, 'openapi.yaml'), spec);
    writeFileSync(join(dir, 'unrelated.json'), '{"secret": 1}');
    mkdirSync(join(dir, 'common'));
    writeFileSync(join(dir, 'common', 'pet.yaml'), 'type: object\n');
    mkdirSync(join(dir, 'locked'));
    chmodSync(join(dir, 'locked'), 0o000);
    symlinkSync(join(dir, 'missing-target'), join(dir, 'dangling.yaml'));
    return dir;
  };
  it('reads no other files when the spec has no external $ref', () => {
    const dir = setup('openapi: 3.1.0\ninfo: {title: t, version: "1"}\npaths: {}\n');
    expect(readInput(join(dir, 'openapi.yaml')).files).toEqual({});
  });
  it('collects siblings for an external $ref and skips folders it cannot read', () => {
    const dir = setup('openapi: 3.1.0\ninfo: {title: t, version: "1"}\npaths: {}\ncomponents: {schemas: {Pet: {$ref: "./common/pet.yaml"}}}\n');
    expect(Object.keys(readInput(join(dir, 'openapi.yaml')).files ?? {})).toContain('common/pet.yaml');
  });
});
