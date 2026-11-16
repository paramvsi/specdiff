/// <reference types="node" />
import { compareOpenApi, Config, type Change } from '@specdiff/core';
import { diffText } from '@specdiff/core/text';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { excerpts, groupKey, matchJsonPath, matchesSearch, rulesOn } from './util';

const dir = join(__dirname, '../../../../../fixtures/samples');
const v1 = readFileSync(join(dir, 'payments-v1.yaml'), 'utf8');
const v2 = readFileSync(join(dir, 'payments-v2.yaml'), 'utf8');
const report = compareOpenApi({ name: 'payments-v1.yaml', content: v1 }, { name: 'payments-v2.yaml', content: v2 });
const byRule = (id: string, path?: string) => report.changes.find((c) => c.ruleId === id && (!path || c.path === path))!;

describe('OA-09 JSONPath search', () => {
  it('matches prefixes, wildcards and recursive descent, not substrings', () => {
    expect(matchJsonPath("$.paths['/v1/payments']..", "$.paths['/v1/payments'].post.summary")).toBe(true);
    expect(matchJsonPath("$.paths['/v1/payments']", "$.paths['/v1/payments/{id}'].get")).toBe(false);
    expect(matchJsonPath('$.paths.*.get', "$.paths['/v1/payments'].get.summary")).toBe(true);
    expect(matchJsonPath('$.paths.*.get', "$.paths['/v1/payments'].post.summary")).toBe(false);
    expect(matchJsonPath('$..maximum', "$.paths['/v1/payments'].get.parameters[0].schema.maximum")).toBe(true);
    expect(matchJsonPath('$.components.schemas.Card', '$.components.schemas.Card.properties.last4')).toBe(true);
    expect(matchJsonPath('$.components.schemas.Car', '$.components.schemas.Card.properties.last4')).toBe(false);
  });
  it('filters the payments report', () => {
    const hits = report.changes.filter((c) => matchesSearch(c, "$.paths['/v1/payments']..")).map((c) => c.path);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((p) => p.startsWith('POST /v1/payments') || p.startsWith('GET /v1/payments'))).toBe(true);
    expect(hits.some((p) => p.includes('{id}'))).toBe(false);
  });
});

describe('OA-09 group by tag', () => {
  it('uses operation.tags when the report has them, else the resource segment', () => {
    const c = { ...byRule('endpoint-removed'), operation: { method: 'DELETE', path: '/v1/refunds/{id}', tags: ['Refunds'] } } as Change;
    expect(groupKey(c, 'tag')).toBe('Refunds');
    expect(groupKey({ ...c, operation: { method: 'GET', path: '/users/{id}' } }, 'tag')).toBe('users');
  });
});

describe('OA-10 before/after excerpts', () => {
  const rowsFor = (c: Change) => {
    const e = excerpts(c, v1, v2);
    const d = diffText(e.before.lines.join('\n') + '\n', e.after.lines.join('\n') + '\n', { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word', filters: [], transforms: [] });
    return { e, d };
  };
  it('shows only the shared schema, aligned on the changed node (Card.last4)', () => {
    const { e, d } = rowsFor(byRule('response-property-removed'));
    expect(e.before.lines[0]!.trim()).toBe('Card:');
    expect(e.after.lines[0]!.trim()).toBe('Card:');
    expect([...e.before.lines, ...e.after.lines].join('\n')).not.toMatch(/PaymentStatus|disputed/);
    // Same rows carry the same text on both sides.
    for (const r of d.rows) if (r.type === 'same') expect(r.left!.segs.map((s) => s.text).join('')).toBe(r.right!.segs.map((s) => s.text).join(''));
    const removed = d.rows.filter((r) => r.left && r.type !== 'same').map((r) => r.left!.segs.map((s) => s.text).join(''));
    expect(removed.join('\n')).toMatch(/last4/);
  });
  it('an added property shows no unrelated removed lines (metadata on Payment)', () => {
    const { d } = rowsFor(byRule('response-property-added', 'components.schemas.Payment › metadata'));
    const removed = d.rows.filter((r) => r.left && !r.right && r.type !== 'same');
    expect(removed).toEqual([]);
  });
  it('an endpoint removal shows the removed operation and nothing on the after side', () => {
    const { e } = rowsFor(byRule('endpoint-removed'));
    expect(e.before.lines[0]!.trim()).toBe('delete:');
    expect(e.after.lines).toEqual([]);
  });
});

it('Summary and Settings count rules the same way', () => {
  const cfg = Config.parse({ rules: { 'endpoint-added': { enabled: false } } });
  expect(rulesOn(cfg)).toEqual({ on: 71, total: 72 });
  expect(rulesOn(Config.parse({}))).toEqual({ on: 72, total: 72 });
});

describe('M-02 phone list: the collapsed safe row', () => {
  it('says "1 safe change", not "1 safe changes"', async () => {
    const { safeRowLabel } = await import('./util');
    expect(safeRowLabel(1)).toBe('1 safe change');
    expect(safeRowLabel(14)).toBe('14 safe changes');
  });
});
