// RSS 2.0 feed for Specdiff's own changelog (WEB-06). Items without a real date omit <pubDate>
// (optional in RSS 2.0) until the owner replaces the [Launch date] / [Beta date] placeholders (D-13).
import type { APIRoute } from 'astro';
import { hasDate, releases } from '../lib/changelog';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://specdiff.netlify.app')).href.replace(/\/$/, '');
  const items = releases
    .map((r) => {
      const html = r.sections.map((s) => `<h3>${esc(s.title)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('');
      const link = `${base}/changelog/#v-${r.version}`;
      return [
        '    <item>',
        `      <title>Specdiff ${esc(r.version)}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="false">specdiff-${esc(r.version)}</guid>`,
        hasDate(r) ? `      <pubDate>${new Date(`${r.date}T00:00:00Z`).toUTCString()}</pubDate>` : '',
        `      <description>${esc(html)}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Specdiff changelog</title>
    <link>${base}/changelog/</link>
    <atom:link href="${base}/changelog.xml" rel="self" type="application/rss+xml"/>
    <description>What’s new in Specdiff. Written by Specdiff, from its own spec.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
