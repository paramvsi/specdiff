import { expect, it } from 'vitest';
import {
  clearHistory,
  deleteEntry,
  listHistory,
  loadPayload,
  saveHistory,
  updateEntry,
} from './persist';
import type { CompareResult } from '../worker/protocol';

const r: CompareResult = {
  mode: 'text',
  detected: 'text',
  text: {
    rows: [],
    blocks: [0],
    stats: { added: 1, removed: 0, changed: 2 },
    filters: [],
    identical: false,
  },
};
const src = (name: string) => ({ name, content: 'x', size: 1 });

it('saves, pins, lists, deletes and clears history', async () => {
  const a = await saveHistory(src('a.log'), src('b.log'), r);
  const b = await saveHistory(src('c.log'), src('d.log'), r);
  expect(a.summary.total).toBe(3);
  await updateEntry(a.id, { pinned: true });
  expect((await listHistory()).map((e) => e.id)).toEqual([a.id, b.id]);
  expect((await loadPayload(a.payloadRef))!.before.name).toBe('a.log');
  await deleteEntry(a.id);
  expect(await loadPayload(a.payloadRef)).toBeUndefined();
  await clearHistory();
  expect(await listHistory()).toEqual([]);
});
