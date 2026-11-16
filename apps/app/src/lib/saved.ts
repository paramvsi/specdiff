// Saved sources (IN-11): fetch each URL, compare its hash with the snapshot saved in this browser.
// Runs when the app opens (once per page load, after first paint) and when the Saved sources screen opens.
import type { SavedSource } from '@specdiff/core';
import { getSnapshot, listSaved, pushSnapshot, putSaved, sha256 } from '../state/persist';
import { loadUrl, type LoadError } from './input';

/** "Checked 2 hours ago": when the source was last fetched successfully. */
export function checkedLabel(iso?: string, now = Date.now()): string {
  if (!iso) return 'Not checked yet';
  const mins = Math.floor((now - Date.parse(iso)) / 60000);
  if (mins < 2) return 'Checked just now';
  if (mins < 60) return `Checked ${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Checked ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `Checked ${days === 1 ? 'yesterday' : `${days} days ago`}`;
}

export type SavedStatus = 'checking' | 'changed' | 'same' | 'new' | 'error';
export interface SavedRow {
  source: SavedSource;
  status: SavedStatus;
  message?: string;
}

export function explainFetch(e: unknown): { kind: 'cors' | 'network'; message: string } {
  const le = e as LoadError;
  if (le?.kind === 'cors')
    return {
      kind: 'cors',
      message: `${le.message} Download the file and drop it into Compare instead.`,
    };
  return { kind: 'network', message: le?.message ?? 'The file couldn’t be fetched.' };
}

/** Fetch one source and compare its hash with the saved snapshot. */
export async function checkSource(s: SavedSource): Promise<SavedRow> {
  try {
    const src = await loadUrl(s.url);
    const hash = await sha256(src.content);
    const now = new Date().toISOString();
    const first = !s.lastSnapshotHash;
    const changed = !first && hash !== s.lastSnapshotHash;
    if (first || changed) await pushSnapshot(s.id, { content: src.content, hash, fetchedAt: now });
    const { lastError: _e, ...rest } = s;
    void _e;
    const next: SavedSource = { ...rest, lastFetchedAt: now, lastSnapshotHash: hash };
    await putSaved(next);
    return { source: next, status: changed ? 'changed' : first ? 'new' : 'same' };
  } catch (e) {
    const x = explainFetch(e);
    const next: SavedSource = { ...s, lastError: x.kind };
    await putSaved(next);
    return { source: next, status: 'error', message: x.message };
  }
}

/**
 * The results of the check made when the app opened, by source id. The Saved sources screen shows these instead
 * of fetching again (a second fetch would find no change and lose "changed since your last visit").
 */
export const openedChecks = new Map<string, SavedRow>();
let opened: Promise<SavedRow[]> | null = null;

/** IN-11: re-fetch every saved source once per page load. Resolves with the rows that changed. */
export function recheckOnOpen(): Promise<SavedRow[]> {
  opened ??= listSaved()
    .then((list) => Promise.all(list.map(checkSource)))
    .then((rows) => {
      for (const r of rows) openedChecks.set(r.source.id, r);
      return rows.filter((r) => r.status === 'changed');
    })
    .catch(() => []);
  return opened;
}

/** Both snapshots of a source that changed: the copy from the last visit, and the one fetched now. */
export async function lastTwo(s: SavedSource) {
  const [prev, cur] = await Promise.all([getSnapshot(s.id, 'previous'), getSnapshot(s.id, 'current')]);
  return prev && cur ? { prev, cur } : null;
}
