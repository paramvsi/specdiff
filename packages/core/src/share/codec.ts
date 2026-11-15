// Share links (OUT-05, OUT-09; docs/07 §5). The hash never reaches a server; passphrases never leave the browser.
// fflate's deflateSync/inflateSync are raw DEFLATE (RFC 1951), i.e. deflateRaw.
import { deflateSync, Inflate, strFromU8, strToU8 } from 'fflate';
import { SharePayload } from '../schemas';

export const SHARE_WARN_BYTES = 8 * 1024; // D-10: warn, don't block
/** Most a link may inflate to. DEFLATE reaches ~1000:1, so without a cap a short link could expand to gigabytes. */
export const SHARE_MAX_BYTES = 64 * 1024 * 1024;
export const PBKDF2_ITERATIONS = 310_000;

const b64u = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Inflate in 1 KB input slices, so output arrives in bounded chunks and a bomb stops at `limit`. */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > limit) throw new ShareError('malformed');
    chunks.push(chunk);
  });
  for (let i = 0; i < data.length; i += 1024) inf.push(data.subarray(i, i + 1024), i + 1024 >= data.length);
  if (data.length === 0) inf.push(data, true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

async function key(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', strToU8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export class ShareError extends Error {
  constructor(public code: 'malformed' | 'version' | 'locked' | 'wrong-passphrase' | 'invalid') { super(code); }
}

/** Returns the hash fragment without the leading '#'. */
export async function encodeShare(payload: SharePayload, passphrase?: string): Promise<string> {
  const packed = deflateSync(strToU8(JSON.stringify(SharePayload.parse(payload))), { level: 9 });
  if (!passphrase) return `v=1&c=${b64u(packed)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(passphrase, salt), packed));
  return `v=1&e=1&s=${b64u(salt)}&i=${b64u(iv)}&c=${b64u(ct)}`;
}

export function isLocked(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, '')).get('e') === '1';
}

export async function decodeShare(hash: string, passphrase?: string): Promise<SharePayload> {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (p.get('v') !== '1') throw new ShareError('version');
  const c = p.get('c');
  if (!c) throw new ShareError('malformed');
  let packed: Uint8Array;
  try { packed = unb64u(c); } catch { throw new ShareError('malformed'); }
  if (p.get('e') === '1') {
    if (!passphrase) throw new ShareError('locked');
    const s = p.get('s');
    const i = p.get('i');
    if (!s || !i) throw new ShareError('malformed');
    try {
      packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(i) as Uint8Array<ArrayBuffer> }, await key(passphrase, unb64u(s) as Uint8Array<ArrayBuffer>), packed as Uint8Array<ArrayBuffer>));
    } catch { throw new ShareError('wrong-passphrase'); }
  }
  let json: unknown;
  try { json = JSON.parse(strFromU8(inflateLimited(packed, SHARE_MAX_BYTES))); } catch { throw new ShareError('malformed'); }
  const r = SharePayload.safeParse(json);
  if (!r.success) throw new ShareError('invalid');
  return r.data;
}

/** Passphrase strength for the PassphraseField meter: 0 weak … 3 strong. */
export function passphraseStrength(p: string): 0 | 1 | 2 | 3 {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((r) => r.test(p)).length;
  const words = p.trim().split(/\s+/).length;
  if (p.length >= 20 || (words >= 4 && p.length >= 16)) return 3;
  if (p.length >= 12 && classes >= 2) return 2;
  if (p.length >= 8) return 1;
  return 0;
}
