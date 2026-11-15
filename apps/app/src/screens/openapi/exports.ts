// OpenAPI exports for the top-bar Export menu (OUT-03). The OpenAPI result screen fills these in;
// until then every kind returns null and the menu says the export isn't available.
import { buildChangelog, changelogFeed, reportToHtml } from '@specdiff/core';
import { useApp } from '../../state/store';

export type OpenApiExportKind = 'markdown' | 'json' | 'html' | 'atom';

export const OPENAPI_EXPORTS: ReadonlyArray<{ kind: OpenApiExportKind; label: string }> = [
  { kind: 'markdown', label: 'Changelog (.md)' },
  { kind: 'json', label: 'JSON report (.json)' },
  { kind: 'html', label: 'HTML report (.html)' },
  { kind: 'atom', label: 'Changelog feed (.xml)' },
];

export interface OpenApiExportFile {
  name: string;
  content: string;
  type: string;
}

export function exportOpenApi(kind: OpenApiExportKind): OpenApiExportFile | null {
  const { result, after } = useApp.getState();
  if (!result || !('report' in result)) return null;
  const r = result.report;
  const base = (after?.name ?? 'spec').replace(/\.[^.]+$/, '');
  const version = r.versionCheck?.suggested ?? r.inputs.after.infoVersion ?? '';
  if (kind === 'markdown') return { name: `${base}-changelog.md`, type: 'text/markdown', content: buildChangelog(r, 'release-notes', { groupBySeverity: true, includeDocs: false, version, date: new Date().toISOString().slice(0, 10) }) };
  if (kind === 'json') return { name: `${base}-report.json`, type: 'application/json', content: JSON.stringify(r, null, 2) + '\n' };
  if (kind === 'html') return { name: `${base}-report.html`, type: 'text/html', content: reportToHtml(r) };
  // OUT-10: host this file next to your docs and point feed readers at it.
  return { name: 'changelog.xml', type: 'application/atom+xml', content: changelogFeed(r, { title: `${base} changelog`, feedUrl: 'https://example.com/changelog.xml', version }) };
}

/** OUT-08: print-friendly report in a new tab (the HTML report has print styles). */
export function printReport() {
  const f = exportOpenApi('html');
  if (!f) return;
  const url = URL.createObjectURL(new Blob([f.content], { type: 'text/html' }));
  const w = window.open(url, '_blank', 'noopener');
  if (!w) location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
