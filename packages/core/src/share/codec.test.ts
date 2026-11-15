import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, isLocked, passphraseStrength, SHARE_WARN_BYTES, ShareError } from './codec';
import type { SharePayload } from '../schemas';

const payload: SharePayload = { left: { name: 'a.yaml', content: 'openapi: 3.1.0\n' }, right: { name: 'b.yaml', content: 'openapi: 3.1.1\n' }, mode: 'openapi', view: { tab: 'summary' } };

describe('share codec', () => {
  it('round-trips a plain link', async () => {
    const h = await encodeShare(payload);
    expect(h.startsWith('v=1&c=')).toBe(true);
    expect(isLocked(h)).toBe(false);
    expect(await decodeShare('#' + h)).toEqual(payload);
  });

  it('round-trips a locked link and rejects a wrong passphrase', async () => {
    const h = await encodeShare(payload, 'correct horse battery staple');
    expect(isLocked(h)).toBe(true);
    expect(h).toMatch(/^v=1&e=1&s=[\w-]{22}&i=[\w-]{16}&c=/);
    expect(await decodeShare(h, 'correct horse battery staple')).toEqual(payload);
    await expect(decodeShare(h, 'nope')).rejects.toMatchObject({ code: 'wrong-passphrase' });
    await expect(decodeShare(h)).rejects.toMatchObject({ code: 'locked' });
  });

  it('rejects tampered links', async () => {
    const h = await encodeShare(payload, 'pw-pw-pw-pw');
    const tampered = h.replace(/c=(.)/, (_, ch: string) => `c=${ch === 'A' ? 'B' : 'A'}`);
    await expect(decodeShare(tampered, 'pw-pw-pw-pw')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare('v=1&c=%%%')).rejects.toMatchObject({ code: 'malformed' });
    await expect(decodeShare('v=2&c=abc')).rejects.toMatchObject({ code: 'version' });
  });

  it('large content crosses the warning size', async () => {
    const big = { ...payload, left: { name: 'a', content: Array.from({ length: 4000 }, (_, i) => `line ${i} ${(i * 7919) % 10007}`).join('\n') } };
    expect((await encodeShare(big)).length).toBeGreaterThan(SHARE_WARN_BYTES);
  });

  it('scores passphrases', () => {
    expect(passphraseStrength('abc')).toBe(0);
    expect(passphraseStrength('abcdefgh')).toBe(1);
    expect(passphraseStrength('Abcdefgh1234')).toBe(2);
    expect(passphraseStrength('correct horse battery staple')).toBe(3);
  });
});
