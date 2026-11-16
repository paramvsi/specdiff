/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { rules } from '../rules/catalogue';
import type { DecisionsFile } from '../schemas';
import { compareOpenApi } from './build';
import { buildChangelog } from './changelog';
import { applyDecisions } from './decisions';
import { reportToHtml, reportToMarkdown } from './export';
import { suggestVersion, versionCheck } from './version';

const SAMPLES = join(__dirname, '../../../../fixtures/samples');
const read = (f: string) => ({ name: f, content: readFileSync(join(SAMPLES, f), 'utf8') });
const report = compareOpenApi(read('payments-v1.yaml'), read('payments-v2.yaml'), {}, { today: '2026-11-15' });

describe('X-13 determinism', () => {
  it('identical inputs give byte-identical reports', () => {
    const again = compareOpenApi(read('payments-v1.yaml'), read('payments-v2.yaml'), {}, { today: '2026-11-15' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });
  it('identical files give no changes', () => {
    const r = compareOpenApi(read('payments-v1.yaml'), read('payments-v1.yaml'));
    expect(r.summary.total).toBe(0);
    expect(r.versionCheck).toMatchObject({ suggested: '1.5.0', bump: 'none', verdict: 'ok' }); // X-08
  });
  it('names the real package version as the generator', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string };
    expect(report.generator).toEqual({ name: 'specdiff', version: pkg.version });
  });
});

describe('OA-09 unquoted info.version', () => {
  const spec = (v: string, json = false) => ({ name: json ? 'o.json' : 'o.yaml', content: json ? `{"openapi":"3.1.0","info":{"title":"T","version":${v}},"paths":{}}` : `openapi: 3.1.0\ninfo:\n  title: T\n  version: ${v}\npaths: {}\n` });
  it('reads 1.10 as written, so 1.9 → 1.10 is not a decrease (YAML)', () => {
    const r = compareOpenApi(spec('1.9'), spec('1.10'));
    expect(r.versionCheck).toMatchObject({ from: '1.9', to: '1.10' });
    expect(r.versionCheck?.verdict).not.toBe('decreased');
  });
  it('does the same for JSON', () => {
    expect(compareOpenApi(spec('1.9', true), spec('1.10', true)).versionCheck).toMatchObject({ from: '1.9', to: '1.10' });
  });
});

describe('rules catalogue', () => {
  it('has every row of docs/06 (74 rows, 76 rule ids) with templates', () => {
    expect(rules).toHaveLength(76);
    expect(new Set(rules.map((r) => r.id)).size).toBe(76);
    expect(rules.some((r) => r.id === 'request-param-max-decreased')).toBe(false); // B-2
    for (const r of rules) {
      expect(r.title && r.explanation.who && r.explanation.see && r.explanation.avoid && r.changelog, r.id).toBeTruthy();
    }
    expect(rules.filter((r) => r.preset === 'K→B').map((r) => r.id)).toEqual(['operation-id-changed', 'schema-renamed', 'enum-name-changed']);
  });
});

describe('OA-08 version check (B-8)', () => {
  const n = (breaking: number, possibly = 0, safe = 0, docs = 0) => ({ breaking, possibly, safe, docs });
  it('suggests the bump', () => {
    expect(suggestVersion('1.5.0', n(1))).toEqual({ suggested: '2.0.0', bump: 'major' });
    expect(suggestVersion('0.4.2', n(1))).toEqual({ suggested: '0.5.0', bump: 'minor' });
    expect(suggestVersion('1.5.0', n(0, 1))).toEqual({ suggested: '1.6.0', bump: 'minor' });
    expect(suggestVersion('1.5.0', n(0, 0, 3))).toEqual({ suggested: '1.6.0', bump: 'minor' });
    expect(suggestVersion('1.5.0', n(0, 0, 0, 2))).toEqual({ suggested: '1.5.1', bump: 'patch' });
    expect(suggestVersion('v2', n(1))).toEqual({ suggested: '3.0.0', bump: 'major' });
    expect(suggestVersion(undefined, n(0, 0, 1))).toEqual({ suggested: '0.1.0', bump: 'minor' });
  });
  it('gives a verdict', () => {
    expect(versionCheck('1.5.0', '1.6.0', n(1)).verdict).toBe('missing-major');
    expect(versionCheck('1.5.0', '1.4.0', n(0)).verdict).toBe('decreased');
    expect(versionCheck('1.5.0', 'latest', n(0)).verdict).toBe('unparseable');
    expect(versionCheck('0.4.0', '0.5.0', n(1)).verdict).toBe('ok');
  });
  it('OUT-01 Slack text escapes <, > and & so spec values cannot ping a channel or hide a link', () => {
    const doc = (e: string[]) => stringify({ openapi: '3.1.0', info: { title: 'T', version: '1.0.0' }, paths: { '/a': { get: { responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'string', enum: e } } } } } } } } });
    const r = compareOpenApi({ name: 'a<b>.yaml', content: doc(['x']) }, { name: 'b.yaml', content: doc(['x', '<!channel>', '<https://evil.example|docs>', 'a & b', '&lt;']) });
    const slack = buildChangelog(r, 'slack', { includeDocs: true });
    expect(slack).not.toMatch(/<[^\n]*>/);
    expect(slack).toContain('`&lt;!channel&gt;`');
    expect(slack).toContain('`a &amp; b`');
    expect(slack).toContain('a&lt;b&gt;.yaml');
  });
  it('a 1-day sunset grace period reads "1 day", not "1 days"', () => {
    const dir = 'fixtures/rules/sunset-inside-grace-period';
    const read = (f: string) => readFileSync(join(__dirname, '../../../..', dir, f), 'utf8');
    const r = compareOpenApi({ name: 'b.yaml', content: read('before.yaml') }, { name: 'a.yaml', content: read('after.yaml') }, { openapi: { sunsetGracePeriodDays: 1 } }, { today: '2026-12-01' });
    const graces = r.changes.filter((c) => c.ruleId === 'sunset-inside-grace-period');
    expect(graces.map((c) => c.before)).toEqual(['1 day']);
  });
  it('a breaking change into a pre-release (2.0.0-beta.1 → 2.0.0-beta.2) needs no major bump (semver §9)', () => {
    expect(versionCheck('2.0.0-beta.1', '2.0.0-beta.2', n(1)).verdict).toBe('ok');
    expect(versionCheck('1.4.0', '1.5.0-rc.1', n(1)).verdict).toBe('missing-major'); // a 1.x pre-release still promises 1.x
    expect(versionCheck('1.5.0', '1.6.0', n(1)).verdict).toBe('missing-major');
  });
  it('treats a date version (2024-06-20, as Stripe and GitHub use) as not semver, not as 2024.0.0', () => {
    const v = versionCheck('2024-01-15', '2024-06-20', n(1));
    expect(v.verdict).toBe('unparseable');
    expect(v.message).not.toMatch(/2025\.0\.0/);
  });
});

describe('OA-21 decisions', () => {
  it('counts accepted, rejected and open, and lists stale decisions', () => {
    const last4 = report.changes.find((c) => c.ruleId === 'response-property-removed');
    const removed = report.changes.find((c) => c.ruleId === 'endpoint-removed');
    const file: DecisionsFile = {
      version: 1,
      decisions: {
        [last4?.fingerprint ?? '']: { decision: 'accepted', ruleId: 'response-property-removed', path: last4?.path ?? '', note: 'Removed in 2.0.0', at: '2026-11-14T09:12:00Z' },
        [removed?.fingerprint ?? '']: { decision: 'rejected', path: removed?.path ?? '', at: '2026-11-14T09:13:00Z' },
        '0000000000000000': { decision: 'accepted', path: 'gone', at: '2026-11-01T00:00:00Z' },
      },
    };
    const res = applyDecisions(report, file);
    expect(res.decisions).toEqual({ accepted: 1, rejected: 1, open: 3 });
    expect(res.report.decisions).toEqual(res.decisions);
    expect(res.stale.map((s) => s.fingerprint)).toEqual(['0000000000000000']);
    expect(res.status[last4?.fingerprint ?? '']).toBe('accepted');
  });
});

describe('OUT-01/02 changelog', () => {
  it('builds release notes grouped by severity without docs-only changes', () => {
    const md = buildChangelog(report, 'release-notes');
    expect(md).toMatch(/^## 2\.0\.0\n\n### Breaking changes\n\n- `POST \/v1\/payments` now requires `currency`\./);
    expect(md).toContain('- Removed `DELETE /v1/refunds/{id}`.');
    expect(md).not.toContain('Updated the description');
    expect(buildChangelog(report, 'release-notes', { includeDocs: true })).toContain('### Documentation');
  });
  it('builds Keep a Changelog, Slack and PR comment templates', () => {
    const kac = buildChangelog(report, 'keep-a-changelog', { date: '2026-11-15' });
    expect(kac).toMatch(/^## \[2\.0\.0\] - 2026-11-15/);
    expect(kac).toContain('### Removed');
    expect(kac).toContain('- **Breaking:** Removed `DELETE /v1/refunds/{id}`.');
    const slack = buildChangelog(report, 'slack');
    expect(slack).toContain('payments-v1.yaml → payments-v2.yaml (2.0.0)*: 4 breaking, 1 possibly breaking, 14 safe');
    expect(slack).not.toContain('**');
    const pr = buildChangelog(report, 'pr-comment');
    expect(pr).toContain('| ! | Breaking | `POST /v1/payments` now requires `currency`. | `request-property-became-required` |');
    expect(buildChangelog(report, 'release-notes', { groupBySeverity: false })).toContain('- **Breaking:** `POST /v1/payments` now requires `currency`.');
  });
});

describe('OUT-03 exports', () => {
  const evil = '<script>alert(1)</script>';
  const doc = (desc: string) => stringify({ openapi: '3.1.0', info: { title: 'T', version: '1.0.0' }, paths: { [`/a${evil}`]: { get: { operationId: 'a', description: desc, responses: { '200': { description: 'OK' } } } } } });
  const xss = compareOpenApi({ name: `b${evil}.yaml`, content: doc('one') }, { name: 'a.yaml', content: doc(`two ${evil} "q" 'q'`) });

  it('Markdown lists every change with its explanation', () => {
    const md = reportToMarkdown(report);
    expect(md).toContain('# Specdiff report: payments-v1.yaml → payments-v2.yaml');
    expect(md).toContain('| 4 | 1 | 14 | 9 | 28 |');
    expect(md).toContain('### `components.schemas.Card › last4`');
    expect(md).toContain('Shared schema `Card`, used by 3');
    // Values inside code spans render as text; outside them, HTML is escaped.
    expect(reportToMarkdown(xss).replace(/`[^`]*`/g, '')).not.toContain('<script>');
  });

  it('HTML is standalone, escaped and has no scripts', () => {
    const html = reportToHtml(report);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<code>POST /v1/payments</code> now requires <code>currency</code>.');
    const bad = reportToHtml(xss);
    expect(bad).not.toMatch(/<script/i);
    expect(bad).toContain('&lt;script&gt;');
    expect(bad).not.toMatch(/ on\w+=/i);
  });
});

describe('OUT-01 spec values outside code spans', () => {
  const doc = (d: string) => stringify({ openapi: '3.1.0', info: { title: 'T', version: '1.0.0' }, paths: { '/a': { get: { parameters: [{ name: 'q', in: 'query', schema: { type: 'string', default: d } }], responses: { '200': { description: 'OK' } } } } } });
  const lineFor = (from: string, to: string) => compareOpenApi({ name: 'a.yaml', content: doc(from) }, { name: 'b.yaml', content: doc(to) }).changes.find((c) => c.ruleId === 'request-param-default-changed')!.changelogLine;
  it('cannot mention, link or format in a PR comment: anything but plain words goes in code', () => {
    expect(lineFor('x', '@acme/admins [link](https://evil) *b*')).toBe('The default for `q` on `GET /a` is now `@acme/admins [link](https://evil) *b*` (was x).');
  });
  it('keeps plain values bare, as the design shows ("maxes out at 50")', () => {
    expect(lineFor('20', '50')).toBe('The default for `q` on `GET /a` is now 50 (was 20).');
  });
});

describe('OUT-01 hostile spec text in Markdown outputs', () => {
  const X = '<img src=x onerror=alert(1)>';
  const spec = (after: boolean) => ({ name: 'a.yaml', content: stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {
    ['/p/{id}|x`y']: { get: { parameters: [{ name: `q${X}`, in: 'query', required: after, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } } },
  } }) });
  const r = compareOpenApi(spec(false), spec(true));
  // Strip code spans the CommonMark way (a run of N backticks closes only on N), then look for raw HTML.
  const outsideCode = (md: string) => md.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '');
  it('keeps spec values inside their code spans in every changelog format and the report', () => {
    const outputs = [reportToMarkdown(r), ...(['release-notes', 'keep-a-changelog', 'slack', 'pr-comment'] as const).map((t) => buildChangelog(r, t, {}))];
    for (const md of outputs) expect(outsideCode(md)).not.toMatch(/<img/i);
  });
  it("shows a changelog line's value literally inside code (no &lt; entities inside the span)", () => {
    const line = r.changes.find((c) => c.ruleId === 'request-param-became-required')!.changelogLine!;
    expect(line).toContain('`q<img src=x onerror=alert(1)>`');
    expect(line).toContain('`` GET /p/{id}|x`y ``');
    expect(reportToMarkdown(r)).toContain(`- ${line}`);
  });
});
