import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
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
