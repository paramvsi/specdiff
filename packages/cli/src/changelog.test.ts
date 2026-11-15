/// <reference types="node" />
// OUT-10 from the CLI: `specdiff changelog … --format atom --feed-url <url>`; IN-04/OA-02 through the CLI's inputs.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runChangelog } from './run';

const SAMPLES = join(__dirname, '../../../fixtures/samples');
const v1 = join(SAMPLES, 'payments-v1.yaml'), v2 = join(SAMPLES, 'payments-v2.yaml');
const capture = () => { const o = { out: '', err: '' }; return { o, io: { out: (s: string) => (o.out += s), err: (s: string) => (o.err += s + '\n') } }; };

describe('specdiff changelog', () => {
  it('writes an Atom feed at the given feed URL', () => {
    const { o, io } = capture();
    expect(runChangelog(v1, v2, { format: 'atom', feedUrl: 'https://api.example.org/changelog.xml', title: 'Payments API', date: '2026-11-15T00:00:00Z' }, io)).toBe(0);
    expect(o.out).toContain('<link rel="self" href="https://api.example.org/changelog.xml"/>');
    expect(o.out).toContain('<id>https://api.example.org/changelog.xml</id>');
    expect(o.out).toContain('<title>Payments API 2.0.0</title>');
    expect(o.out).toContain('<updated>2026-11-15T00:00:00.000Z</updated>');
    expect(o.out).not.toContain('example.com');
  });
  it('refuses atom without --feed-url', () => {
    const { o, io } = capture();
    expect(runChangelog(v1, v2, { format: 'atom' }, io)).toBe(2);
    expect(o.err).toContain('--feed-url');
  });
  it.each([
    ['md', '## 2.0.0'],
    ['keep-a-changelog', '## [2.0.0] - 2026-11-15'],
    ['slack', 'payments-v1.yaml → '],
    ['pr-comment', '### Specdiff:'],
  ] as const)('writes %s', (format, head) => {
    const { o, io } = capture();
    expect(runChangelog(v1, v2, { format, date: '2026-11-15' }, io)).toBe(0);
    expect(o.out).toContain(head);
  });
});

describe('--date', () => {
  for (const format of ['atom', 'keep-a-changelog', 'md'] as const)
    it(`refuses a date that is not a real ISO date (${format})`, () => {
      const { o, io } = capture();
      expect(runChangelog(v1, v2, { format, feedUrl: 'https://x.example/feed.xml', date: '13/45/2026' }, io)).toBe(2);
      expect(o.err).toMatch(/--date/);
      expect(o.out).toBe('');
    });
  it('accepts YYYY-MM-DD and a full ISO time', () => {
    for (const date of ['2026-11-16', '2026-11-16T08:00:00Z']) expect(runChangelog(v1, v2, { format: 'keep-a-changelog', date }, capture().io)).toBe(0);
  });
});
