// IndexedDB storage (OUT-07, IN-11, settings). Payloads are stored separately so history rows stay small.
import type { HistoryEntry, Summary } from '@specdiff/core';
import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Source } from '../lib/input';
import type { CompareResult } from '../worker/protocol';
import type { Settings } from './store';

const history = createStore('specdiff-history', 'entries');
const payloads = createStore('specdiff-payloads', 'payloads');
const prefs = createStore('specdiff-settings', 'settings');

export function summarise(r: CompareResult): Summary {
  if ('report' in r) return r.report.summary;
  if ('text' in r) {
    const t = r.text.stats.added + r.text.stats.removed + r.text.stats.changed;
    return { breaking: 0, possibly: 0, safe: 0, docs: 0, total: t, byArea: {} };
  }
  return { breaking: 0, possibly: 0, safe: 0, docs: 0, total: 0, byArea: {} };
}

export async function saveHistory(
  before: Source,
  after: Source,
  r: CompareResult,
): Promise<HistoryEntry> {
  if ('kind' in r) throw new Error('not a result');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const entry: HistoryEntry = {
    id,
    createdAt: now,
    openedAt: now,
    pinned: false,
    mode: r.mode,
    before: { name: before.name, size: before.size },
    after: { name: after.name, size: after.size },
    summary: summarise(r),
    payloadRef: id,
  };
  await set(id, { before, after, mode: r.mode }, payloads);
  await set(id, entry, history);
  return entry;
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = (await entries<string, HistoryEntry>(history)).map(([, v]) => v);
  return all.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.openedAt.localeCompare(a.openedAt),
  );
}
export const loadPayload = (ref: string) =>
  get<{ before: Source; after: Source; mode: string }>(ref, payloads);
export async function updateEntry(id: string, patch: Partial<HistoryEntry>) {
  const e = await get<HistoryEntry>(id, history);
  if (e) await set(id, { ...e, ...patch }, history);
}
export async function deleteEntry(id: string) {
  await del(id, history);
  await del(id, payloads);
}
export async function clearHistory() {
  for (const [k] of await entries(history)) await del(k, history);
  for (const [k] of await entries(payloads)) await del(k, payloads);
}

export const loadSettings = () => get<Settings>('settings', prefs);
export const saveSettings = (s: Settings) => set('settings', s, prefs);
