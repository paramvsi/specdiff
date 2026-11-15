import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { formatBytes, fromZip, loadUrl, pickEntry, sizeVerdict, toRawUrl, ZIP_MAX_TOTAL_BYTES } from './input';

describe('input', () => {
  it('converts GitHub blob and gist links to raw', () => {
    expect(toRawUrl('https://github.com/acme/api/blob/main/spec/openapi.yaml')).toBe(
      'https://raw.githubusercontent.com/acme/api/main/spec/openapi.yaml',
    );
    expect(toRawUrl('https://gist.github.com/me/abc123')).toBe(
      'https://gist.githubusercontent.com/me/abc123/raw',
    );
    expect(toRawUrl('https://example.com/a.yaml')).toBe('https://example.com/a.yaml');
  });

  it('size guard', () => {
    expect(sizeVerdict(1_000)).toBe('ok');
    expect(sizeVerdict(11 * 1024 * 1024)).toBe('warn');
    expect(sizeVerdict(26 * 1024 * 1024)).toBe('text-only');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB');
  });

  it('picks the spec entry in a folder', () => {
    expect(
      pickEntry({
        'schemas/card.yaml': 'type: object',
        'openapi.yaml': 'openapi: 3.1.0',
        'x/api.yaml': 'openapi: 3.0.0',
      }),
    ).toBe('openapi.yaml');
    expect(pickEntry({ 'a.txt': 'x' })).toBeUndefined();
  });

  it('reads a ZIP of a multi-file spec', () => {
    const zip = zipSync({
      'api/openapi.yaml': strToU8('openapi: 3.1.0\n'),
      'api/schemas/card.yaml': strToU8('type: object\n'),
      '__MACOSX/x': strToU8('junk'),
    });
    const s = fromZip('payments', zip);
    expect(s.name).toBe('payments/api/openapi.yaml');
    expect(Object.keys(s.files!).sort()).toEqual(['api/openapi.yaml', 'api/schemas/card.yaml']);
  });
});

describe('ZIP size limits (IN-04)', () => {
  it('refuses a ZIP whose entries add up past the total limit, though each is under 25 MB', () => {
    const big = new Uint8Array(23 * 1024 * 1024); // zeros compress to almost nothing: a small upload
    const zip = zipSync({ 'openapi.yaml': strToU8('openapi: 3.1.0\n'), 'a.yaml': big, 'b.yaml': big, 'c.yaml': big });
    expect(zip.length).toBeLessThan(1024 * 1024);
    expect(() => fromZip('bomb', zip)).toThrow(expect.objectContaining({ kind: 'invalid', message: expect.stringMatching(/too much|MB/) }));
  });
  it('still opens a normal multi-file ZIP', () => {
    const zip = zipSync({ 'openapi.yaml': strToU8('openapi: 3.1.0\ninfo: {title: T, version: "1"}\npaths: {}\n'), 'schemas/pet.yaml': strToU8('type: object\n') });
    expect(fromZip('ok', zip).name).toBe('ok/openapi.yaml');
  });
});

describe('toRawUrl: code hosts (IN-03)', () => {
  it('keeps GitHub conversion, dropping ?plain=1 and #L anchors', () => {
    expect(toRawUrl('https://github.com/acme/api/blob/main/specs/openapi.yaml?plain=1#L12')).toBe('https://raw.githubusercontent.com/acme/api/main/specs/openapi.yaml');
  });
  it('converts GitLab blob links to raw (groups and subgroups too)', () => {
    expect(toRawUrl('https://gitlab.com/acme/platform/api/-/blob/main/openapi.yaml')).toBe('https://gitlab.com/acme/platform/api/-/raw/main/openapi.yaml');
  });
  it('converts Bitbucket src links to raw', () => {
    expect(toRawUrl('https://bitbucket.org/acme/api/src/main/openapi.yaml')).toBe('https://bitbucket.org/acme/api/raw/main/openapi.yaml');
  });
  it('leaves other URLs alone', () => {
    expect(toRawUrl('https://example.com/openapi.yaml')).toBe('https://example.com/openapi.yaml');
  });
});

describe('loadUrl limits (IN-03)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('stops reading a response past the size limit instead of buffering all of it', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({ pull(c) { sent += chunk.length; c.enqueue(chunk); } }); // endless
    vi.stubGlobal('fetch', async () => new Response(body));
    await expect(loadUrl('https://example.com/huge.yaml')).rejects.toMatchObject({ kind: 'invalid', message: expect.stringMatching(/larger than/) });
    expect(sent).toBeLessThan(ZIP_MAX_TOTAL_BYTES + 4 * chunk.length);
  });
  it('keeps a malformed escape in the file name instead of throwing', async () => {
    vi.stubGlobal('fetch', async () => new Response('openapi: 3.1.0\n'));
    await expect(loadUrl('https://example.com/a%E0%A4%A.yaml')).resolves.toMatchObject({ name: 'a%E0%A4%A.yaml' });
  });
});
