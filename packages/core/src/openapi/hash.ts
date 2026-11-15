// Small synchronous helpers for deterministic output (X-13): canonical JSON and FNV-1a 64.

/** JSON with sorted object keys. Cycles and very deep values are cut with "…". */
export function stableStringify(value: unknown, maxDepth = 64): string {
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): string => {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (depth > maxDepth || seen.has(v)) return '"…"';
    seen.add(v);
    let out: string;
    if (Array.isArray(v)) out = `[${v.map((x) => walk(x, depth + 1)).join(',')}]`;
    else {
      const keys = Object.keys(v).sort();
      out = `{${keys.map((k) => `${JSON.stringify(k)}:${walk((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`;
    }
    seen.delete(v);
    return out;
  };
  return walk(value, 0);
}

const MASK = (1n << 64n) - 1n;
const PRIME = 0x100000001b3n;

/** FNV-1a 64-bit over the UTF-8 bytes of `text`, as 16 hex digits. */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const step = (byte: number) => {
    h ^= BigInt(byte);
    h = (h * PRIME) & MASK;
  };
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) step(c);
    else if (c < 0x800) {
      step(0xc0 | (c >> 6));
      step(0x80 | (c & 63));
    } else if (c < 0x10000) {
      step(0xe0 | (c >> 12));
      step(0x80 | ((c >> 6) & 63));
      step(0x80 | (c & 63));
    } else {
      step(0xf0 | (c >> 18));
      step(0x80 | ((c >> 12) & 63));
      step(0x80 | ((c >> 6) & 63));
      step(0x80 | (c & 63));
    }
  }
  return h.toString(16).padStart(16, '0');
}

/** UTF-8 byte length without allocating. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
