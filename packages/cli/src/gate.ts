// --fail-on gate (PK-04) with review decisions (OA-21): accepted breaking changes do not fail; rejected ones always do.
import { bumpLabel, type Change, type Config, type DecisionsFile, type Report } from '@specdiff/core';
import pc from 'picocolors';

export type FailOn = Config['failOn'];
export interface Gate { code: 0 | 1; reason: string; stale: string[]; failing: Change[] }

export function gate(report: Report, failOn: FailOn, decisions?: DecisionsFile): Gate {
  const d = decisions?.decisions ?? {};
  const present = new Set(report.changes.map((c) => c.fingerprint));
  const stale = Object.keys(d).filter((fp) => !present.has(fp)).sort();
  const rejected = report.changes.filter((c) => d[c.fingerprint]?.decision === 'rejected');
  const open = (sev: Change['severity'][]) => report.changes.filter((c) => sev.includes(c.severity) && d[c.fingerprint]?.decision !== 'accepted');
  if (rejected.length) return { code: 1, reason: `${rejected.length} rejected change${rejected.length > 1 ? 's' : ''}`, stale, failing: rejected };
  if (failOn === 'none') return { code: 0, reason: 'not gating (--fail-on none)', stale, failing: [] };
  if (failOn === 'missing-version-bump') {
    const v = report.versionCheck;
    return v && v.verdict !== 'ok' ? { code: 1, reason: v.message, stale, failing: [] } : { code: 0, reason: 'version bump is fine', stale, failing: [] };
  }
  const failing = open(failOn === 'possibly' ? ['breaking', 'possibly'] : ['breaking']);
  return failing.length
    ? { code: 1, reason: `${failOn === 'possibly' ? 'breaking or possibly breaking' : 'breaking'} changes found`, stale, failing }
    : { code: 0, reason: 'no unaccepted breaking changes', stale, failing: [] };
}

export function summaryLines(report: Report, from: string, to: string, g: Gate, color = pc.isColorSupported): string[] {
  const c = pc.createColors(color);
  const s = report.summary;
  const out = [
    `Comparing ${from} → ${to}…`,
    `${c.red(`✖ ${s.breaking} breaking`)}  ${c.yellow(`? ${s.possibly} possibly`)}  ${c.green(`+ ${s.safe} safe`)}  ${c.dim(`¶ ${s.docs} docs only`)}`,
  ];
  if (report.versionCheck) out.push(`Suggested version: ${report.versionCheck.suggested} (${bumpLabel(report.versionCheck.bump)})`);
  for (const w of report.warnings ?? []) out.push(c.yellow(`⚠ ${w}`));
  for (const f of g.failing.slice(0, 20)) out.push(`  ${c.red('!')} ${f.path}${f.ruleId ? c.dim(`  ${f.ruleId}`) : ''}`);
  if (g.failing.length > 20) out.push(c.dim(`  … and ${g.failing.length - 20} more`));
  if (g.stale.length) out.push(c.dim(`${g.stale.length} stale decision${g.stale.length > 1 ? 's' : ''} ignored (fingerprint no longer present)`));
  out.push(`Exit code ${g.code} · ${g.reason}`);
  return out;
}
