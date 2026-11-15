/// <reference types="node" />
import { compareOpenApi } from '@specdiff/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { decisionsJson, readDecisions } from './decisions';

const dir = join(__dirname, '../../../../../fixtures/samples');
const report = compareOpenApi(
  { name: 'payments-v1.yaml', content: readFileSync(join(dir, 'payments-v1.yaml'), 'utf8') },
  { name: 'payments-v2.yaml', content: readFileSync(join(dir, 'payments-v2.yaml'), 'utf8') },
);

it('round-trips decisions.json and reports stale fingerprints', () => {
  const c = report.changes.find((x) => x.ruleId === 'endpoint-removed')!;
  const file = { version: 1 as const, decisions: {
    [c.fingerprint]: { decision: 'accepted' as const, path: c.path, ruleId: c.ruleId!, at: '2026-11-15T10:00:00.000Z' },
    'sha256:gone': { decision: 'rejected' as const, path: 'GET /old', at: '2026-11-15T10:00:00.000Z' },
  } };
  const text = decisionsJson(file);
  expect(text.endsWith('\n')).toBe(true);
  expect(decisionsJson(JSON.parse(text))).toBe(text);
  const r = readDecisions(text, report.changes);
  expect('error' in r).toBe(false);
  if ('error' in r) return;
  expect(r.matched).toBe(1);
  expect(r.stale).toEqual(['sha256:gone']);
  expect(r.file.decisions[c.fingerprint]!.decision).toBe('accepted');
});

it('rejects files that are not decisions files', () => {
  expect(readDecisions('{', report.changes)).toEqual({ error: 'That file is not valid JSON.' });
  const r = readDecisions('{"version":2,"decisions":{}}', report.changes);
  expect('error' in r && r.error).toMatch(/^That is not a decisions file/);
});
