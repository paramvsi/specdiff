import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { formatBytes, fromZip, pickEntry, sizeVerdict, toRawUrl } from './input';

describe('input', () => {
  it('converts GitHub blob and gist links to raw', () => {
    expect(toRawUrl('https://github.com/acme/api/blob/main/spec/openapi.yaml')).toBe('https://raw.githubusercontent.com/acme/api/main/spec/openapi.yaml');
    expect(toRawUrl('https://gist.github.com/me/abc123')).toBe('https://gist.githubusercontent.com/me/abc123/raw');
    expect(toRawUrl('https://example.com/a.yaml')).toBe('https://example.com/a.yaml');
  });

  it('size guard', () => {
    expect(sizeVerdict(1_000)).toBe('ok');
    expect(sizeVerdict(11 * 1024 * 1024)).toBe('warn');
    expect(sizeVerdict(26 * 1024 * 1024)).toBe('text-only');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB');
  });

  it('picks the spec entry in a folder', () => {
    expect(pickEntry({ 'schemas/card.yaml': 'type: object', 'openapi.yaml': 'openapi: 3.1.0', 'x/api.yaml': 'openapi: 3.0.0' })).toBe('openapi.yaml');
    expect(pickEntry({ 'a.txt': 'x' })).toBeUndefined();
  });

  it('reads a ZIP of a multi-file spec', () => {
    const zip = zipSync({ 'api/openapi.yaml': strToU8('openapi: 3.1.0\n'), 'api/schemas/card.yaml': strToU8('type: object\n'), '__MACOSX/x': strToU8('junk') });
    const s = fromZip('payments', zip);
    expect(s.name).toBe('payments/api/openapi.yaml');
    expect(Object.keys(s.files!).sort()).toEqual(['api/openapi.yaml', 'api/schemas/card.yaml']);
  });
});
