import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Report } from '../schemas';
import { compareOpenApi } from './build';
import { changelogFeed } from './feed';
import { reportJsonSchema } from './schema';

const f = (n: string) => ({ name: n, content: readFileSync(`fixtures/samples/${n}`, 'utf8') });
const report = compareOpenApi(f('payments-v1.yaml'), f('payments-v2.yaml'), {}, { today: '2026-11-15' });

it('builds an Atom feed with escaped content', () => {
  const xml = changelogFeed(report, { title: 'Payments API', feedUrl: 'https://example.com/changelog.xml', date: '2026-11-15T00:00:00Z' });
  expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect(xml).toContain('<title>Payments API 2.0.0</title>');
  expect(xml).toContain('4 breaking');
  expect(xml).not.toMatch(/<content type="text">[^<]*<(?!\/content)/);
});

it('publishes a JSON Schema that the report satisfies structurally', () => {
  const s = reportJsonSchema() as { properties: Record<string, unknown>; required: string[] };
  expect(Object.keys(s.properties)).toEqual(expect.arrayContaining(['version', 'generator', 'inputs', 'summary', 'changes']));
  expect(s.required).toEqual(expect.arrayContaining(['version', 'changes']));
  expect(Report.safeParse(JSON.parse(JSON.stringify(report))).success).toBe(true);
});

describe('OUT-10 append to an existing feed', () => {
  const r15 = compareOpenApi(f('payments-v1.yaml'), f('payments-v1.yaml'), {}, { today: '2026-11-15' });
  const opts = { title: 'Payments API', feedUrl: 'https://docs.acme.dev/changelog.xml' };
  const first = changelogFeed(r15, { ...opts, version: '1.5.0', date: '2026-09-01T00:00:00Z' });
  const entries = (xml: string) => [...xml.matchAll(/<entry>[\s\S]*?<id>([^<]*)<\/id>/g)].map((m) => m[1]);

  it('adds the new release as the first entry and keeps the old ones', () => {
    const xml = changelogFeed(report, { ...opts, version: '2.0.0', date: '2026-11-15T00:00:00Z', existing: first });
    expect(entries(xml)).toEqual(['https://docs.acme.dev/changelog#2.0.0', 'https://docs.acme.dev/changelog#1.5.0']);
    expect(xml.match(/<feed /g)).toHaveLength(1);
    expect(xml).toMatch(/<feed[^>]*>\s*<title>Payments API<\/title>[\s\S]*?<updated>2026-11-15T00:00:00.000Z<\/updated>/);
    expect(xml).toContain('<link rel="self" href="https://docs.acme.dev/changelog.xml"/>');
  });

  it('replaces an entry with the same id instead of duplicating it, newest first', () => {
    const two = changelogFeed(report, { ...opts, version: '2.0.0', date: '2026-11-15T00:00:00Z', existing: first });
    const again = changelogFeed(report, { ...opts, version: '2.0.0', date: '2026-11-16T00:00:00Z', existing: two });
    expect(entries(again)).toEqual(['https://docs.acme.dev/changelog#2.0.0', 'https://docs.acme.dev/changelog#1.5.0']);
    expect(again).toContain('<updated>2026-11-16T00:00:00.000Z</updated>');
    // An older release appended later still sorts below the newer one.
    const old = changelogFeed(r15, { ...opts, version: '1.4.0', date: '2026-06-01T00:00:00Z', existing: two });
    expect(entries(old)).toEqual(['https://docs.acme.dev/changelog#2.0.0', 'https://docs.acme.dev/changelog#1.5.0', 'https://docs.acme.dev/changelog#1.4.0']);
  });

  it('is deterministic, and rejects input that is not an Atom feed', () => {
    const a = changelogFeed(report, { ...opts, version: '2.0.0', date: '2026-11-15T00:00:00Z', existing: first });
    expect(changelogFeed(report, { ...opts, version: '2.0.0', date: '2026-11-15T00:00:00Z', existing: first })).toBe(a);
    expect(() => changelogFeed(report, { ...opts, existing: '<rss version="2.0"></rss>' })).toThrow(/Atom/);
  });
});
