// OA-21 review decisions: match `.specdiff/decisions.json` to a report by fingerprint.
import { type Decision, DecisionsFile, type Report } from '../schemas';

export interface DecisionsResult {
  /** The report with `decisions` counts filled in. */
  report: Report;
  decisions: { accepted: number; rejected: number; open: number };
  /** Decision per fingerprint present in the report. */
  status: Record<string, 'accepted' | 'rejected'>;
  /** Decisions whose fingerprint no longer appears: reported and ignored (docs/07 §4). */
  stale: Array<Decision & { fingerprint: string }>;
}

/** Breaking and possibly-breaking changes need a decision; safe and docs-only ones do not. */
const needsDecision = (s: string | undefined) => s === 'breaking' || s === 'possibly';

export function applyDecisions(report: Report, decisionsFile: unknown): DecisionsResult {
  const file = DecisionsFile.parse(decisionsFile);
  const present = new Set(report.changes.map((c) => c.fingerprint));
  const status: Record<string, 'accepted' | 'rejected'> = {};
  const stale: DecisionsResult['stale'] = [];
  for (const fp of Object.keys(file.decisions).sort()) {
    const d = file.decisions[fp] as Decision;
    if (present.has(fp)) status[fp] = d.decision;
    else stale.push({ fingerprint: fp, ...d });
  }
  let accepted = 0;
  let rejected = 0;
  let open = 0;
  for (const c of report.changes) {
    const s = status[c.fingerprint];
    if (s === 'accepted') accepted++;
    else if (s === 'rejected') rejected++;
    else if (needsDecision(c.severity)) open++;
  }
  const decisions = { accepted, rejected, open };
  return { report: { ...report, decisions }, decisions, status, stale };
}
