// OUT-10: the changelog as an Atom feed for static hosting. One entry per comparison; append entries over releases.
import type { Report } from '../schemas';
import { buildChangelog } from './changelog';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export interface FeedOptions { title: string; feedUrl: string; siteUrl?: string; version?: string; date?: string }

export function changelogFeed(report: Report, o: FeedOptions): string {
  const version = o.version ?? report.versionCheck?.suggested ?? report.inputs.after.infoVersion ?? 'next';
  const updated = new Date(o.date ?? Date.now()).toISOString();
  const md = buildChangelog(report, 'release-notes', { groupBySeverity: true, includeDocs: false, version, ...(o.date ? { date: o.date.slice(0, 10) } : {}) });
  const id = `${o.feedUrl.replace(/\.xml$/, '')}#${encodeURIComponent(version)}`;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(o.title)}</title>
  <id>${esc(o.feedUrl)}</id>
  <link rel="self" href="${esc(o.feedUrl)}"/>
${o.siteUrl ? `  <link href="${esc(o.siteUrl)}"/>\n` : ''}  <updated>${updated}</updated>
  <generator uri="https://github.com/paramvsi/specdiff">specdiff</generator>
  <entry>
    <title>${esc(`${o.title} ${version}`)}</title>
    <id>${esc(id)}</id>
    <updated>${updated}</updated>
    <summary>${esc(`${report.summary.breaking} breaking, ${report.summary.possibly} possibly breaking, ${report.summary.safe} safe changes.`)}</summary>
    <content type="text">${esc(md)}</content>
  </entry>
</feed>
`;
}
