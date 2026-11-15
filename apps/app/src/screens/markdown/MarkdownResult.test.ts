// Round 4 AMarkdown: a space between a deletion and the insertion after it, short link URLs, outline dots for
// edited sections.
import { diffMarkdown } from '@specdiff/core/markdown';
import { expect, it } from 'vitest';
import { samples } from '../../lib/samples';
import { sectionStatuses, shortUrl, withChangeCues } from './MarkdownResult';

it('a deletion followed by an insertion reads as two words ("cents the…", not "centsthe…")', () => {
  const html = withChangeCues('<p>in <del>cents</del><ins>the smallest unit</ins>, as</p>');
  const text = html.replace(/<span class="sd-visually-hidden">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');
  expect(text).toBe('in cents the smallest unit, as');
});

it('links are shown without their scheme', () => {
  expect(shortUrl('https://docs.example.com/v1')).toBe('docs.example.com/v1');
  expect(shortUrl('docs/setup')).toBe('docs/setup');
});

it("the README sample's outline: sections with an edited block are edited, the rename is edited", () => {
  const s = samples().find((x) => x.id === 'markdown')!;
  const d = diffMarkdown(s.before.content, s.after.content);
  const out = d.outline.map((h, k) => `${h.text}:${sectionStatuses(d.blocks)[k]}`);
  expect(out).toEqual([
    'Payments API:same',
    'Quick start:edited',
    'Running locally:edited',
    'Configuration:edited',
    'Authentication:edited',
    'Rate limits:removed',
    'Migrating to v2:added',
  ]);
});
