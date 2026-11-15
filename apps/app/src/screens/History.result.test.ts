import type { Summary } from '@specdiff/core';
import { expect, it } from 'vitest';
import { countOf, type StoredHistoryEntry } from '../state/persist';
import type { CompareResult } from '../worker/protocol';
import { resultLabel } from './History';

const sum = (p: Partial<Summary>): Summary => ({ breaking: 0, possibly: 0, safe: 0, docs: 0, total: 0, byArea: {}, ...p });
const entry = (mode: StoredHistoryEntry['mode'], summary: Summary, count?: StoredHistoryEntry['count']): StoredHistoryEntry => ({
  id: 'a', createdAt: '', openedAt: '', pinned: false, mode, before: { name: 'a', size: 1 }, after: { name: 'b', size: 1 }, summary, payloadRef: 'a', ...(count ? { count } : {}),
});
const text = (stats: { added: number; removed: number; changed: number }) => ({ rows: [], blocks: [], stats, filters: [], identical: false });

it('A-11 says what each mode counts', () => {
  expect(resultLabel(entry('openapi', sum({ breaking: 4, total: 28 })))).toBe('4 breaking · 28 changes');
  expect(resultLabel(entry('json', sum({ total: 3 }), { unit: 'changes', n: 17 }))).toBe('17 changes');
  expect(resultLabel(entry('markdown', sum({ total: 2 }), { unit: 'blocks', n: 6 }))).toBe('6 blocks changed');
  expect(resultLabel(entry('text', sum({ total: 5 }), { unit: 'lines', n: 9 }))).toBe('9 lines differ');
  // Rows saved before per-mode counts stay readable.
  expect(resultLabel(entry('text', sum({ total: 5 })))).toBe('5 lines differ');
});

it('counts text lines the way the text screen does (a changed line is one − and one +)', () => {
  const r = { mode: 'text', detected: 'text', text: text({ added: 1, removed: 2, changed: 3 }) } as CompareResult;
  expect(countOf(r)).toEqual({ unit: 'lines', n: 9 });
  const md = { mode: 'markdown', detected: 'markdown', markdown: { blocks: [], outline: [], brokenAnchors: [], stats: { added: 1, removed: 2, edited: 3 } }, text: text({ added: 0, removed: 0, changed: 0 }) } as unknown as CompareResult;
  expect(countOf(md)).toEqual({ unit: 'blocks', n: 6 });
});
