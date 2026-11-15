/// <reference types="node" />
import { compareOpenApi, parseDocument } from '@specdiff/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fixOptions } from './fixes';

const dir = join(__dirname, '../../../../../fixtures/samples');
const v2 = readFileSync(join(dir, 'payments-v2.yaml'), 'utf8');
const report = compareOpenApi({ name: 'payments-v1.yaml', content: readFileSync(join(dir, 'payments-v1.yaml'), 'utf8') }, { name: 'payments-v2.yaml', content: v2 });
const spec = parseDocument(v2, 'payments-v2.yaml').value;

it('O-04 gives two fix options for currency becoming required, from the real spec', () => {
  const c = report.changes.find((x) => x.ruleId === 'request-property-became-required')!;
  const o = fixOptions(c, spec, '2.0.0');
  expect(o.map((x) => x.title)).toEqual(['keep it optional, with a default', 'ship it in 2.0.0 and say so']);
  expect(o[0]!.code).toBe('currency:\n  type: string\n  default: USD\nrequired: [amount]');
  expect(o[1]!.code).toBe('info:\n  version: 2.0.0');
});

it('gives 1–2 options for every breaking or possibly-breaking change on the sample', () => {
  for (const c of report.changes.filter((x) => x.severity === 'breaking' || x.severity === 'possibly')) {
    const o = fixOptions(c, spec, '2.0.0');
    expect(o.length, c.ruleId).toBeGreaterThanOrEqual(1);
    expect(o.length).toBeLessThanOrEqual(2);
  }
  const limit = fixOptions(report.changes.find((x) => x.ruleId === 'request-param-constraint-tightened')!, spec, '2.0.0');
  expect(limit[0]!.code).toBe('- name: limit\n  in: query\n  schema:\n    maximum: 100');
});
