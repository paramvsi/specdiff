// OA-08 version check and bump suggestion. docs/04: any breaking → major (minor below 1.0.0);
// any safe change → minor; docs-only changes → patch; no changes at all → none (X-08: the same
// version). B-8: possibly-breaking only → minor.
import coerce from 'semver/functions/coerce.js';
import inc from 'semver/functions/inc.js';
import lt from 'semver/functions/lt.js';
import major from 'semver/functions/major.js';
import minor from 'semver/functions/minor.js';
import type { VersionCheck } from '../schemas';

export interface SeverityCounts {
  breaking: number;
  possibly: number;
  safe: number;
  docs: number;
}

// A date version (2024-06-20) is not semver: coerce would read it as 2024.0.0 and call every release equal.
const DATE = /^\d{4}-\d{2}-\d{2}/;
const clean = (v: string | undefined): string | undefined => (v === undefined || DATE.test(v.trim()) ? undefined : (coerce(v)?.version ?? undefined));

export type Bump = VersionCheck['bump'];

/** How a bump reads in text: `major`, `minor`, `patch`, or `no change`. */
export const bumpLabel = (b: Bump): string => (b === 'none' ? 'no change' : b);

export function suggestVersion(current: string | undefined, counts: SeverityCounts): { suggested: string; bump: Bump } {
  const base = clean(current) ?? '0.0.0';
  if (counts.breaking + counts.possibly + counts.safe + counts.docs === 0) return { suggested: clean(current) ?? current ?? base, bump: 'none' };
  let bump: 'major' | 'minor' | 'patch' = 'patch';
  if (counts.breaking > 0) bump = major(base) === 0 ? 'minor' : 'major';
  else if (counts.possibly > 0 || counts.safe > 0) bump = 'minor';
  return { suggested: inc(base, bump) ?? base, bump };
}

export function versionCheck(from: string | undefined, to: string | undefined, counts: SeverityCounts): VersionCheck {
  const { suggested, bump } = suggestVersion(from, counts);
  const out: VersionCheck = { suggested, bump, verdict: 'ok', message: '' };
  if (from !== undefined) out.from = from;
  if (to !== undefined) out.to = to;
  const vf = clean(from);
  const vt = clean(to);
  if (!vf || !vt) {
    out.verdict = 'unparseable';
    out.message = `info.version is not a semantic version (${JSON.stringify(vf ? to : from) ?? 'missing'}), so the bump cannot be checked. Suggested: ${suggested}.`;
    return out;
  }
  if (lt(vt, vf)) {
    out.verdict = 'decreased';
    out.message = `info.version went down from ${from} to ${to}. Suggested: ${suggested}.`;
    return out;
  }
  if (counts.breaking > 0) {
    const ok = major(vf) === 0 ? major(vt) > 0 || minor(vt) > minor(vf) : major(vt) > major(vf);
    if (!ok) {
      out.verdict = 'missing-major';
      const need = major(vf) === 0 ? 'a minor bump (below 1.0.0)' : 'a major bump';
      out.message = `info.version says ${to}. Breaking changes need ${need}: use ${suggested}.`;
      return out;
    }
    out.message = `info.version goes from ${from} to ${to}. Breaking changes need ${major(vf) === 0 ? 'a minor bump below 1.0.0' : 'a major bump'}, and this is one.`;
    return out;
  }
  if (bump === 'none') {
    out.message = from === to ? `info.version stays at ${to}. No changes, so no bump is needed.` : `info.version goes from ${from} to ${to}. There are no changes, so ${from} could stay.`;
    return out;
  }
  out.message = from === to ? `info.version stays at ${to}. Suggested: ${suggested} (${bump}).` : `info.version goes from ${from} to ${to}. Suggested: ${suggested} (${bump}).`;
  return out;
}
