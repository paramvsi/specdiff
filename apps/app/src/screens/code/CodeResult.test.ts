import type { CodeDiff, CodeItem } from '@specdiff/core/code';
import { expect, it } from 'vitest';
import { withoutContainerEcho } from './CodeResult';

const item = (name: string, status: CodeItem['status'], b: string, a: string): CodeItem => ({
  name,
  kind: 'method',
  status,
  lines: { before: [1, 1], after: [1, 1] },
  beforeText: b,
  afterText: a,
});
const diff = (items: CodeItem[]): CodeDiff => {
  const stats = { same: 0, formatting: 0, comments: 0, changed: 0, added: 0, removed: 0, renamed: 0, moved: 0, renamedLocals: 0 };
  for (const i of items) stats[i.status]++;
  return { language: 'java', items, stats, logicChanged: true };
};

it('A-09: a class changed only through its members is not counted as a logic change of its own', () => {
  const m = item('S.pay', 'changed', 'void pay() { a(); }', 'void pay() { b(); }');
  const cls = item('S', 'changed', `class S {\n  ${m.beforeText}\n}`, `class S {\n  ${m.afterText}\n}`);
  const d = withoutContainerEcho(diff([cls, m]));
  expect(d.items.map((i) => i.name)).toEqual(['S.pay']);
  expect(d.stats.changed).toBe(1);
});

it('keeps a class whose own text changed too', () => {
  const m = item('S.pay', 'changed', 'void pay() { a(); }', 'void pay() { b(); }');
  const cls = item('S', 'changed', `class S {\n  ${m.beforeText}\n}`, `final class S {\n  ${m.afterText}\n}`);
  expect(withoutContainerEcho(diff([cls, m])).items).toHaveLength(2);
});
