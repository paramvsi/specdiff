// OUT-01/OUT-02 changelog templates. Lines come from each change's `changelogLine`; the user can
// edit the result in the app.
import type { Change, Report, Severity } from '../schemas';
import { bumpLabel } from './version';

export type ChangelogTemplate = 'release-notes' | 'keep-a-changelog' | 'slack' | 'pr-comment';

export interface ChangelogOptions {
  /** Group lines under a heading per severity (default true). */
  groupBySeverity?: boolean;
  /** Include docs-only changes (default false). */
  includeDocs?: boolean;
  /** Version for the heading; defaults to the suggested version. */
  version?: string;
  /** Release date for Keep a Changelog, e.g. "2026-11-15". */
  date?: string;
  /** Title for release notes and Slack; defaults to "before → after". */
  title?: string;
}

const ORDER: Severity[] = ['breaking', 'possibly', 'safe', 'docs'];
export const SEVERITY_SYMBOL: Record<Severity, string> = { breaking: '!', possibly: '?', safe: '+', docs: '¶' };
export const SEVERITY_LABEL: Record<Severity, string> = { breaking: 'Breaking', possibly: 'Possibly breaking', safe: 'Safe', docs: 'Docs only' };
const HEADINGS: Record<Severity, string> = { breaking: 'Breaking changes', possibly: 'Possibly breaking', safe: 'New and improved', docs: 'Documentation' };

/**
 * Slack reads `<…>` as control syntax everywhere, code spans included: `<!channel>` pings, `<url|text>`
 * hides a link. Escape what the Markdown escaping left raw; entities already in the line stay as they are.
 */
const slackSafe = (s: string) => s.replace(/&(?!(?:amp|lt|gt);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sev = (c: Change): Severity => c.severity ?? 'docs';
const line = (c: Change) => c.changelogLine ?? c.path;

function bySeverity(changes: Change[]): Map<Severity, Change[]> {
  const m = new Map<Severity, Change[]>();
  for (const s of ORDER) m.set(s, []);
  for (const c of changes) m.get(sev(c))?.push(c);
  return m;
}

function counts(report: Report, includeDocs: boolean): string {
  const s = report.summary;
  const parts = [`${s.breaking} breaking`, `${s.possibly} possibly breaking`, `${s.safe} safe`];
  if (includeDocs) parts.push(`${s.docs} docs only`);
  return parts.join(', ');
}

function kacCategory(c: Change): string {
  if (c.ruleId?.startsWith('security-')) return 'Security';
  if (c.ruleId === 'endpoint-deprecated') return 'Deprecated';
  if (c.kind === 'removed') return 'Removed';
  if (c.kind === 'added' && sev(c) === 'safe') return 'Added';
  return 'Changed';
}

export function buildChangelog(report: Report, template: ChangelogTemplate, opts: ChangelogOptions = {}): string {
  const group = opts.groupBySeverity ?? true;
  const includeDocs = opts.includeDocs ?? false;
  const version = opts.version ?? report.versionCheck?.suggested ?? '';
  const title = opts.title ?? `${report.inputs.before.name} → ${report.inputs.after.name}`;
  const changes = report.changes.filter((c) => includeDocs || sev(c) !== 'docs');
  const prefixed = (c: Change, bold: (s: string) => string) => (sev(c) === 'breaking' || sev(c) === 'possibly' ? `${bold(`${SEVERITY_LABEL[sev(c)]}:`)} ${line(c)}` : line(c));
  const out: string[] = [];

  if (template === 'release-notes') {
    out.push(`## ${version ? `${version}` : title}`, '');
    if (changes.length === 0) out.push('No changes to the API.', '');
    else if (group) {
      for (const [s, list] of bySeverity(changes)) {
        if (!list.length) continue;
        out.push(`### ${HEADINGS[s]}`, '', ...list.map((c) => `- ${line(c)}`), '');
      }
    } else out.push(...changes.map((c) => `- ${prefixed(c, (x) => `**${x}**`)}`), '');
  } else if (template === 'keep-a-changelog') {
    out.push(`## [${version}]${opts.date ? ` - ${opts.date}` : ''}`, '');
    const cats = ['Added', 'Changed', 'Deprecated', 'Removed', 'Security'];
    const m = new Map(cats.map((k) => [k, [] as Change[]]));
    for (const c of changes) m.get(kacCategory(c))?.push(c);
    for (const k of cats) {
      let list = m.get(k) ?? [];
      if (!list.length) continue;
      if (group) list = [...list].sort((x, y) => ORDER.indexOf(sev(x)) - ORDER.indexOf(sev(y)));
      out.push(`### ${k}`, '', ...list.map((c) => `- ${prefixed(c, (x) => `**${x}**`)}`), '');
    }
    if (changes.length === 0) out.push('No changes to the API.', '');
  } else if (template === 'slack') {
    out.push(`*${slackSafe(title)}${version ? ` (${slackSafe(version)})` : ''}*: ${counts(report, includeDocs)}`);
    if (group) {
      for (const [s, list] of bySeverity(changes)) {
        if (!list.length) continue;
        out.push('', `*${SEVERITY_SYMBOL[s]} ${HEADINGS[s]}*`, ...list.map((c) => `• ${slackSafe(line(c)).replace(/\*\*/g, '*')}`));
      }
    } else out.push('', ...changes.map((c) => `• ${slackSafe(prefixed(c, (x) => `*${x}*`)).replace(/\*\*/g, '*')}`));
    out.push('');
  } else {
    out.push(`### Specdiff: ${counts(report, includeDocs)}`, '');
    const vc = report.versionCheck;
    if (vc) out.push(`Suggested version: **${vc.suggested}** (${bumpLabel(vc.bump)}). ${vc.message}`, '');
    if (changes.length) {
      const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const rows = group ? [...bySeverity(changes).values()].flat() : changes;
      out.push('| | Severity | Change | Rule |', '|---|---|---|---|');
      for (const c of rows) out.push(`| ${SEVERITY_SYMBOL[sev(c)]} | ${SEVERITY_LABEL[sev(c)]} | ${cell(line(c))} | \`${c.ruleId ?? ''}\` |`);
      out.push('');
    } else out.push('No changes to the API.', '');
  }
  return out.join('\n');
}
