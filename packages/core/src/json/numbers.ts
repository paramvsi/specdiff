// M-2: numbers are compared by their source text, normalised, never by a lossy JS number.

/** One text per decimal value: sign, digits without leading or trailing zeros, exponent (`-12e3`, `0`). Hex and octal (YAML) included. */
export function canonicalNumber(t: string): string | undefined {
  let s = t.trim();
  let sign = '';
  if (s[0] === '-' || s[0] === '+') { if (s[0] === '-') sign = '-'; s = s.slice(1); }
  if (/^0x[0-9a-f]+$/i.test(s) || /^0o[0-7]+$/i.test(s)) s = BigInt(s).toString();
  const m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m || !(m[1] || m[2])) return undefined;
  const frac = m[2] ?? '';
  let digits = `${m[1] ?? ''}${frac}`.replace(/^0+/, '');
  if (!digits) return '0';
  const zeros = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - zeros);
  return `${sign}${digits}e${BigInt(m[3] ?? 0) - BigInt(frac.length) + BigInt(zeros)}`;
}

/** The canonical source text when the JS number does not hold the written value exactly; else undefined. */
export function inexactNumber(source: string, value: number): string | undefined {
  if (String(value) === source || /^-?\d{1,15}$/.test(source)) return undefined; // fast path: most numbers
  const c = canonicalNumber(source);
  return c === undefined || c === canonicalNumber(String(value)) ? undefined : c;
}

/** A number the parser could not hold exactly, standing in for it inside the diff only. */
export class ExactNumber {
  constructor(readonly text: string, readonly value: number) {}
  toString() { return this.text; }
  toJSON() { return this.value; }
}
