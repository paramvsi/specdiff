/// <reference types="node" />
import { compareOpenApi, parseDocument } from '@specdiff/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { designChangelog, headingTone } from './changelogText';

const dir = join(__dirname, '../../../../../fixtures/samples');
const v2 = readFileSync(join(dir, 'payments-v2.yaml'), 'utf8');
const report = compareOpenApi({ name: 'payments-v1.yaml', content: readFileSync(join(dir, 'payments-v1.yaml'), 'utf8') }, { name: 'payments-v2.yaml', content: v2 });

it('A-10 release notes use the designed heading names, version and date, with no garbled lines', () => {
  const t = designChangelog(report, 'release-notes', { groupBySeverity: true, includeDocs: false, version: '2.0.0', date: '2026-11-15' }, parseDocument(v2, 'v2.yaml').value);
  expect(t.split('\n')[0]).toBe('## v2.0.0, 15 Nov 2026');
  expect(t).toMatch(/^### Breaking changes$/m);
  expect(t).toMatch(/^### Worth checking$/m);
  expect(t).toMatch(/^### Added$/m);
  expect(t).not.toMatch(/Possibly breaking|New and improved/);
  expect(t).toMatch(/^- .*`status` can now be `disputed`.$/m);
  expect(t).not.toMatch(/`(\w+)` (in|on) `\1`/);
  // Items follow their heading with no blank line (A-10).
  expect(t).toMatch(/^### Breaking changes\n- /m);
  expect(t).not.toMatch(/^### .*\n\n/m);
  expect(headingTone('### Worth checking')).toBe('possibly');
  expect(headingTone('- item')).toBe(null);
});
