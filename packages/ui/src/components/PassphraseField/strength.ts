export type StrengthLabel = 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface Strength {
  /** 0–4: number of filled meter segments. */
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
}

const LABELS: readonly StrengthLabel[] = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

/**
 * A simple, deterministic strength estimate: length first, character variety second.
 * Under 8 characters is always "Too short".
 */
export function passphraseStrength(value: string): Strength {
  if (value.length < 8) return { score: 0, label: 'Too short' };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
  let score = 1;
  if (value.length >= 12) score++;
  if (value.length >= 16) score++;
  if (classes >= 3) score++;
  const s = Math.min(score, 4) as Strength['score'];
  return { score: s, label: LABELS[s] ?? 'Strong' };
}
