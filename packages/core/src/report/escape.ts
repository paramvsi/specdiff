// M-13: the one escaper for text taken from a spec (or an input's file name) on its way into a
// Markdown, PR-comment or Slack export. Identifiers, paths and versions go in code spans; free text
// is Markdown-escaped and defused so it cannot mention, reference, link or format when posted.
const ZWJ = '\u200D';
const oneLine = (s: string) => s.replace(/\s*\r?\n\s*/g, ' ');

/** Inline code that survives backticks in the value (CommonMark: fence longer than any run inside). */
export function mdCode(s: string): string {
  s = oneLine(s);
  const longest = Math.max(0, ...[...s.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return longest || s.startsWith(' ') || s.endsWith(' ') ? `${fence} ${s} ${fence}` : `${fence}${s}${fence}`;
}

/**
 * A zero-width joiner after `@` and `#` stops GitHub/Slack mentions (`@team`, `@here`) and issue
 * references (`#123`); one after `scheme:` and `www` stops autolinks, so a URL stays plain text.
 */
const defuse = (s: string) =>
  s
    .replace(/([@#])(?=[\p{L}\p{N}_])/gu, `$1${ZWJ}`)
    .replace(/\b([a-z][a-z0-9+.-]*:)(?=\/\/)/gi, `$1${ZWJ}`)
    .replace(/\bwww\./gi, `www${ZWJ}.`);

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/** Free text for Markdown (GitHub, release notes): no formatting, HTML, links, mentions or references. */
export const mdText = (s: string) => defuse(oneLine(s).replace(/[\\`*_[\]|~]/g, '\\$&').replace(/[&<>]/g, (c) => ENT[c]!));

/** Free text for Slack mrkdwn: `<…>` is control syntax there (`<!channel>`, `<url|text>`), and no mentions or links. */
export const slackText = (s: string) => defuse(oneLine(s).replace(/[&<>]/g, (c) => ENT[c]!));

/** A version in a heading stays bare when it can only be a version (the designs show `## v2.0.0`); else a code span. */
export const mdVersion = (v: string) => (/^v?[0-9A-Za-z.+-]+$/.test(v) ? v : mdCode(v));

/** Free text that quotes values (a version-check message): each quoted value becomes a code span, the rest is mdText. */
export function mdTextWithCode(s: string, values: Array<string | undefined>): string {
  const list = [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => b.length - a.length);
  if (!list.length) return mdText(s);
  const re = new RegExp(list.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  let out = '';
  let at = 0;
  for (const m of s.matchAll(re)) {
    out += mdText(s.slice(at, m.index)) + mdCode(m[0]);
    at = m.index + m[0].length;
  }
  return out + mdText(s.slice(at));
}
