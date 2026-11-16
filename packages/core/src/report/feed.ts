// OUT-10: the changelog as an Atom feed for static hosting. One entry per comparison; pass the
// feed you already publish as `existing` to append the new release to it (newest first, one entry
// per id: re-running a release replaces its entry).
import type { Report } from '../schemas';
import { buildChangelog } from './changelog';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export interface FeedOptions {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  version?: string;
  date?: string;
  /** An Atom feed published earlier (for example by this function). Its entries are kept after the new one. */
  existing?: string;
}

interface Entry { id: string; updated: string; xml: string }

/** The `<entry>` blocks of an Atom feed, as written, with their id and updated time. */
function entriesOf(feed: string): Entry[] {
  if (!/<feed\b[^>]*xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/.test(feed)) throw new Error('The existing feed is not an Atom feed (no <feed xmlns="http://www.w3.org/2005/Atom">).');
  return [...feed.matchAll(/^[ \t]*<entry\b[^>]*>[\s\S]*?<\/entry>/gm)].map((m) => {
    const xml = m[0].replace(/^[ \t]*/, '  ');
    return { xml, id: /<id>([\s\S]*?)<\/id>/.exec(xml)?.[1]?.trim() ?? '', updated: /<updated>([\s\S]*?)<\/updated>/.exec(xml)?.[1]?.trim() ?? '' };
  });
}

export function changelogFeed(report: Report, o: FeedOptions): string {
  const version = o.version ?? report.versionCheck?.suggested ?? report.inputs.after.infoVersion ?? 'next';
  const updated = new Date(o.date ?? Date.now()).toISOString();
  const md = buildChangelog(report, 'release-notes', { groupBySeverity: true, includeDocs: false, version, ...(o.date ? { date: o.date.slice(0, 10) } : {}) });
  // A lone surrogate (e.g. from a JSON `\ud800` escape) would make encodeURIComponent throw: write U+FFFD instead.
  const wellFormed = version.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
  const id = esc(`${o.feedUrl.replace(/\.xml$/, '')}#${encodeURIComponent(wellFormed)}`);
  const entry = `  <entry>
    <title>${esc(`${o.title} ${version}`)}</title>
    <id>${id}</id>
    <updated>${updated}</updated>
    <summary>${esc(`${report.summary.breaking} breaking, ${report.summary.possibly} possibly breaking, ${report.summary.safe} safe changes.`)}</summary>
    <content type="text">${esc(md)}</content>
  </entry>`;
  // Newest first by <updated>; the new entry wins ties and replaces an old entry with its id.
  const kept = o.existing ? entriesOf(o.existing).filter((e) => e.id !== id) : [];
  const all = [{ id, updated, xml: entry }, ...kept].map((e, i) => ({ ...e, i })).sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.i - b.i));
  const feedUpdated = all[0]!.updated > updated ? all[0]!.updated : updated;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(o.title)}</title>
  <id>${esc(o.feedUrl)}</id>
  <link rel="self" href="${esc(o.feedUrl)}"/>
${o.siteUrl ? `  <link href="${esc(o.siteUrl)}"/>\n` : ''}  <updated>${feedUpdated}</updated>
  <generator uri="https://github.com/paramvsi/specdiff">specdiff</generator>
${all.map((e) => e.xml).join('\n')}
</feed>
`;
}
