// OUT-03 exports: a Markdown report and a standalone HTML report. The HTML escapes every value
// from the specs and contains no scripts. Severity is always shown as a symbol and a word, never
// by colour alone.
import type { Change, Report, Severity } from '../schemas';
import { SEVERITY_LABEL, SEVERITY_SYMBOL } from './changelog';

const ORDER: Severity[] = ['breaking', 'possibly', 'safe', 'docs'];
const sev = (c: Change): Severity => c.severity ?? 'docs';

const where = (c: Change) => {
  const p = c.location.after ?? c.location.before;
  return p ? `${p.file}:${p.line}:${p.column}` : '';
};

/** Inline code that survives backticks in the value. */
function code(s: string): string {
  const longest = Math.max(0, ...[...s.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return longest ? `${fence} ${s} ${fence}` : `${fence}${s}${fence}`;
}
const mdText = (s: string) => s.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));

export function reportToMarkdown(report: Report): string {
  const s = report.summary;
  const out: string[] = [
    `# Specdiff report: ${mdText(report.inputs.before.name)} → ${mdText(report.inputs.after.name)}`,
    '',
    '| ! Breaking | ? Possibly breaking | + Safe | ¶ Docs only | Total |',
    '|---|---|---|---|---|',
    `| ${s.breaking} | ${s.possibly} | ${s.safe} | ${s.docs} | ${s.total} |`,
    '',
  ];
  const vc = report.versionCheck;
  if (vc) out.push(`**Suggested version:** ${mdText(vc.suggested)} (${vc.bump}). ${mdText(vc.message)}`, '');
  if (report.decisions) out.push(`**Review:** ${report.decisions.accepted} accepted, ${report.decisions.rejected} rejected, ${report.decisions.open} open.`, '');
  for (const level of ORDER) {
    const list = report.changes.filter((c) => sev(c) === level);
    if (!list.length) continue;
    out.push(`## ${SEVERITY_SYMBOL[level]} ${SEVERITY_LABEL[level]} (${list.length})`, '');
    for (const c of list) {
      out.push(`### ${code(c.path)}`, '');
      out.push(`- ${mdText(c.changelogLine ?? '')}`);
      out.push(`- Rule: ${code(c.ruleId ?? '')} · ${c.direction ?? 'both'} · ${code(c.id)} · fingerprint ${code(c.fingerprint)}`);
      out.push(`- Where: ${code(where(c))}${c.jsonPath ? ` · ${code(c.jsonPath)}` : ''}`);
      if (c.sharedSchema) {
        const more = c.sharedSchema.usageCount - c.sharedSchema.usages.length;
        out.push(`- Shared schema ${code(c.sharedSchema.name)}, used by ${c.sharedSchema.usageCount}: ${c.sharedSchema.usages.map(code).join(', ')}${more > 0 ? ` and ${more} more` : ''}`);
      }
      if (c.explanation) {
        out.push(`- Who it breaks: ${mdText(c.explanation.who)}`, `- What they will see: ${mdText(c.explanation.see)}`, `- How to avoid it: ${mdText(c.explanation.avoid)}`);
      }
      out.push('');
    }
  }
  if (report.changes.length === 0) out.push('The two specs are equivalent: no changes.', '');
  return out.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** Escape, then allow only `code` and **bold** from the changelog templates. */
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const STYLE = `
:root{--bg:#f6f7f4;--fg:#15171a;--muted:#565c63;--line:#d9dcd5;--card:#ffffff;--b:#b42318;--p:#9a6700;--s:#1a7f37;--d:#57606a}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#eceee9;--muted:#a3a9b0;--line:#2c3036;--card:#1a1d21;--b:#ff7b72;--p:#e3b341;--s:#56d364;--d:#a3a9b0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px}h1{font-size:22px;margin:0 0 16px}h2{font-size:17px;margin:32px 0 12px}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-ligatures:none;overflow-wrap:anywhere}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 16px;padding:0;list-style:none}
.summary li,.change{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.summary b{display:block;font-size:24px}.muted{color:var(--muted)}
.change{margin:0 0 8px}.change h3{font-size:15px;margin:0 0 6px}.change dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:8px 0 0}
.change dt{color:var(--muted)}.change dd{margin:0}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sev{display:inline-block;min-width:1.5em;font-weight:700}.breaking .sev{color:var(--b)}.possibly .sev{color:var(--p)}.safe .sev{color:var(--s)}.docs .sev{color:var(--d)}
`;

export function reportToHtml(report: Report): string {
  const s = report.summary;
  const title = `Specdiff report: ${report.inputs.before.name} → ${report.inputs.after.name}`;
  const parts: string[] = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${esc(title)}</h1>`,
    '<ul class="summary">',
    ...ORDER.map((k) => `<li class="${k}"><span class="sev" aria-hidden="true">${esc(SEVERITY_SYMBOL[k])}</span>${esc(SEVERITY_LABEL[k])}<b>${s[k]}</b></li>`),
    `<li>Total<b>${s.total}</b></li>`,
    '</ul>',
  ];
  const vc = report.versionCheck;
  if (vc) parts.push(`<p><strong>Suggested version: ${esc(vc.suggested)}</strong> (${esc(vc.bump)}). ${esc(vc.message)}</p>`);
  for (const level of ORDER) {
    const list = report.changes.filter((c) => sev(c) === level);
    if (!list.length) continue;
    parts.push(`<h2>${esc(SEVERITY_SYMBOL[level])} ${esc(SEVERITY_LABEL[level])} (${list.length})</h2>`);
    for (const c of list) {
      const rows: Array<[string, string]> = [
        ['Rule', `<code>${esc(c.ruleId ?? '')}</code> · ${esc(c.direction ?? 'both')}`],
        ['Where', `<code>${esc(where(c))}</code>${c.jsonPath ? ` · <code>${esc(c.jsonPath)}</code>` : ''}`],
      ];
      if (c.sharedSchema) rows.push(['Shared schema', `<code>${esc(c.sharedSchema.name)}</code>, used by ${c.sharedSchema.usageCount}: ${c.sharedSchema.usages.map((u) => `<code>${esc(u)}</code>`).join(', ')}`]);
      if (c.explanation) rows.push(['Who it breaks', esc(c.explanation.who)], ['What they will see', esc(c.explanation.see)], ['How to avoid it', esc(c.explanation.avoid)]);
      rows.push(['Fingerprint', `<code>${esc(c.fingerprint)}</code>`]);
      parts.push(
        `<article class="change ${level}" id="${esc(c.id)}">`,
        `<h3><span class="sev" aria-hidden="true">${esc(SEVERITY_SYMBOL[level])}</span><span class="visually-hidden">${esc(SEVERITY_LABEL[level])}: </span><code>${esc(c.path)}</code></h3>`,
        `<div>${inline(c.changelogLine ?? '')}</div>`,
        `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`,
        '</article>',
      );
    }
  }
  if (report.changes.length === 0) parts.push('<p>The two specs are equivalent: no changes.</p>');
  parts.push(`<p class="muted">Generated by Specdiff ${esc(report.generator.version)}. Compared locally; nothing was uploaded.</p>`, '</main>', '</body>', '</html>', '');
  return parts.join('\n');
}
