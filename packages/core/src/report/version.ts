// OA-08 version check and bump suggestion. docs/04: any breaking → major (minor below 1.0.0);
// any safe change → minor; otherwise patch. B-8: possibly-breaking only → minor.
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

const clean = (v: string | undefined): string | undefined => (v === undefined ? undefined : (coerce(v)?.version ?? undefined));

export function suggestVersion(current: string | undefined, counts: SeverityCounts): { suggested: string; bump: 'major' | 'minor' | 'patch' } {
  const base = clean(current) ?? '0.0.0';
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
  out.message = from === to ? `info.version stays at ${to}. Suggested: ${suggested} (${bump}).` : `info.version goes from ${from} to ${to}. Suggested: ${suggested} (${bump}).`;
  return out;
}
