// A-10 changelog text as designed: "## v2.0.0, 15 Nov 2026", "### Worth checking", "### Added", and
// schema-level lines said once ("Payment `status` can now be `disputed`.").
import { buildChangelog, type ChangelogOptions, type ChangelogTemplate, type Report } from '@specdiff/core';
import { mdVersion } from '@specdiff/core/escape';
import { fixChangelogLine } from './titles';

export const HEADING_NAMES: Record<string, string> = { 'Possibly breaking': 'Worth checking', 'New and improved': 'Added' };

export function designChangelog(report: Report, template: ChangelogTemplate, opts: ChangelogOptions & { date?: string }, spec?: unknown): string {
  const fixed: Report = { ...report, changes: report.changes.map((c) => (c.changelogLine ? { ...c, changelogLine: fixChangelogLine(c.changelogLine, c, spec) } : c)) };
  let text = buildChangelog(fixed, template, opts);
  if (template === 'release-notes') {
    text = text.replace(/^### (Possibly breaking|New and improved)$/gm, (_, h: string) => `### ${HEADING_NAMES[h]}`);
    // A-10: items follow their heading directly (no blank line between them).
    text = text.replace(/^(### .*)\n\n(?=- )/gm, '$1\n');
    if (opts.version) {
      const when = opts.date ? `, ${new Date(`${opts.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : '';
      text = text.replace(/^## .*$/m, () => `## ${mdVersion(`v${opts.version!.replace(/^v/, '')}`)}${when}`);
    }
  }
  return text;
}

/** Severity of a Markdown heading line, for colouring the editor (A-10). */
export function headingTone(line: string): 'breaking' | 'possibly' | 'safe' | 'heading' | null {
  if (!/^#{1,6} /.test(line)) return null;
  if (/^### (Breaking changes|Breaking)\b/.test(line)) return 'breaking';
  if (/^### (Worth checking|Possibly breaking|Changed|Deprecated)\b/.test(line)) return 'possibly';
  if (/^### (Added|New and improved|Fixed|Security)\b/.test(line)) return 'safe';
  return 'heading';
}
