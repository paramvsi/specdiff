// IndexedDB storage (OUT-07, IN-11, settings). Payloads are stored separately so history rows stay small.
import type { HistoryEntry, SavedSource, Summary } from '@specdiff/core';
import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Source } from '../lib/input';
import type { CompareResult } from '../worker/protocol';
import type { Settings } from './store';

const history = createStore('specdiff-history', 'entries');
const payloads = createStore('specdiff-payloads', 'payloads');
const prefs = createStore('specdiff-settings', 'settings');

/** What the History "Result" column counts, per mode (A-11): the same number the result screen shows. */
export interface ResultCount {
  unit: 'changes' | 'blocks' | 'sections' | 'lines';
  n: number;
}
/** History rows written since per-mode counts; older rows have no `count` and stay readable. */
export type StoredHistoryEntry = HistoryEntry & { count?: ResultCount };

export function countOf(r: CompareResult): ResultCount | undefined {
  if ('kind' in r) return undefined;
  if ('report' in r) return { unit: 'changes', n: r.report.summary.total };
  if ('json' in r) return { unit: 'changes', n: r.json.changes.length };
  if ('markdown' in r) {
    // A-11 counts Markdown by section ("6 sections edited"); results without section counts fall back to blocks.
    const sec = (r.markdown as { sections?: { added: number; removed: number; edited: number } }).sections;
    if (sec) return { unit: 'sections', n: sec.added + sec.removed + sec.edited };
    const s = r.markdown.stats;
    return { unit: 'blocks', n: s.added + s.removed + s.edited };
  }
  // Text and code: lines differ, counted as the text screen counts them (moved lines are not differences).
  const t = r.text;
  const moved = (t.moves ?? []).reduce((n, m) => n + m.to[1] - m.to[0] + 1, 0);
  return { unit: 'lines', n: t.stats.added + t.stats.removed + 2 * t.stats.changed - 2 * moved };
}

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
): Promise<StoredHistoryEntry> {
  if ('kind' in r) throw new Error('not a result');
  const count = countOf(r);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const entry: StoredHistoryEntry = {
    id,
    createdAt: now,
    openedAt: now,
    pinned: false,
    mode: r.mode,
    before: { name: before.name, size: before.size },
    after: { name: after.name, size: after.size },
    summary: summarise(r),
    payloadRef: id,
    ...(count ? { count } : {}),
  };
  await set(id, { before, after, mode: r.mode }, payloads);
  await set(id, entry, history);
  return entry;
}

export async function listHistory(): Promise<StoredHistoryEntry[]> {
  const all = (await entries<string, StoredHistoryEntry>(history)).map(([, v]) => v);
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

// Saved sources (IN-11, docs/07 §6). One store: source rows under their id, snapshots under `snap:<id>:<which>`.
// The snapshot content is kept so "Compare with last visit" has both sides without refetching.
const saved = createStore('specdiff-saved', 'sources');
export interface Snapshot {
  content: string;
  hash: string;
  fetchedAt: string;
}
const snapKey = (id: string, which: 'current' | 'previous') => `snap:${id}:${which}`;

export async function listSaved(): Promise<SavedSource[]> {
  return (await entries<string, SavedSource>(saved))
    .filter(([k]) => !k.startsWith('snap:'))
    .map(([, v]) => v)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export const putSaved = (s: SavedSource) => set(s.id, s, saved);
export const getSnapshot = (id: string, which: 'current' | 'previous') =>
  get<Snapshot>(snapKey(id, which), saved);
/** Store a new current snapshot; the old current becomes the previous one. */
export async function pushSnapshot(id: string, snap: Snapshot) {
  const cur = await getSnapshot(id, 'current');
  if (cur) await set(snapKey(id, 'previous'), cur, saved);
  await set(snapKey(id, 'current'), snap, saved);
}
export async function deleteSaved(id: string) {
  await del(id, saved);
  await del(snapKey(id, 'current'), saved);
  await del(snapKey(id, 'previous'), saved);
}

/** SHA-256 of the text as hex (WebCrypto). */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
