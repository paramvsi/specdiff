// Startup: settings from IndexedDB, then one of: share link (#v=1…), ?sample=<id>, ?local=<token> (CLI).
import type { Mode, SharePayload } from '@specdiff/core';
import { decodeShare, isLocked } from '@specdiff/core/share';
import { useEffect, useRef } from 'react';
import { isComparisonName, readComparisonFile } from '../lib/comparison';
import { samples, SAMPLE_FILTERS, SAMPLE_JSON_IGNORE_KEYS } from '../lib/samples';
import { lastTwo, recheckOnOpen } from '../lib/saved';
import { loadSettings, saveSettings } from '../state/persist';
import { defaultSettings, persistedSettings, useApp } from '../state/store';
import { useNotices } from '../state/toasts';
import { useNav } from './nav';

export const usePending = { hash: '' };

export async function openPayload(p: SharePayload) {
  const s = useApp.getState();
  const src = (x: { name: string; content: string }) => ({
    name: x.name,
    content: x.content,
    size: new Blob([x.content]).size,
  });
  s.setSource('before', src(p.left));
  s.setSource('after', src(p.right));
  s.setMode(p.mode as Mode);
  // A link's options are checked first: invalid ones would be saved and break every later comparison.
  if (p.options) {
    const { Config } = await import('@specdiff/core');
    // M-14: the sender's rules apply to this comparison only; saved settings are never overwritten.
    if (Config.safeParse(p.options).success) s.applyLinkConfig(p.options as never);
  }
  if (p.decisions) s.setDecisions(p.decisions);
  // OUT-05: a link shared from a change opens on that change, in the Workspace, unless it names a tab.
  if (p.view)
    useNav.getState().set({
      ...(p.view.changeId ? { changeId: p.view.changeId } : {}),
      ...(p.view.tab ? { tab: p.view.tab } : p.view.changeId ? { tab: 'workspace' } : {}),
    });
  // Text, Markdown, JSON and Code screens open the change named in #change=<id> (X-12); the share hash is spent.
  if (p.view?.changeId) history.replaceState(null, '', `#change=${encodeURIComponent(p.view.changeId)}`);
  await s.compare();
}

export function useBoot() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const stored = await loadSettings().catch(() => undefined);
      if (stored) useApp.getState().setSettings({ ...defaultSettings, ...stored });
      useApp.subscribe((s, prev) => {
        if (s.settings !== prev.settings || s.savedConfig !== prev.savedConfig) void saveSettings(persistedSettings(s)).catch(() => {});
      });
      afterFirstPaint(checkSavedSources);
      consumeLaunchedFiles();

      // A second share link opened in this tab only changes the hash: no reload, so follow hashchange.
      window.addEventListener('hashchange', () => void openShareHash(location.hash));
      if (await openShareHash(location.hash)) return;
      const q = new URLSearchParams(location.search);
      const sample = q.get('sample');
      if (sample) {
        await openSample(sample);
        return;
      }
      const token = q.get('local');
      if (token && /^[0-9a-f]{32}$/.test(token)) {
        const res = await fetch(`/__specdiff/${token}.json`, { cache: 'no-store' });
        if (res.ok) {
          const j = (await res.json()) as {
            before: { name: string; content: string; files?: Record<string, string> };
            after: typeof j.before;
          };
          const s = useApp.getState();
          s.setSource('before', { ...j.before, size: j.before.content.length });
          s.setSource('after', { ...j.after, size: j.after.content.length });
          history.replaceState(null, '', location.pathname);
          await s.compare();
        }
      }
    })();
  }, []);
}

/** Open a share link's hash (#v=…): locked links go to Unlock. False when the hash isn't a share link. */
export async function openShareHash(hash: string): Promise<boolean> {
  if (!hash.startsWith('#v=')) return false;
  if (isLocked(hash)) {
    usePending.hash = hash;
    useApp.getState().setScreen('unlock');
    return true;
  }
  try {
    await openPayload(await decodeShare(hash));
  } catch {
    useApp.setState({
      error: 'This share link is damaged or incomplete. Ask for a new link.',
      screen: 'compare',
    });
  }
  return true;
}

export async function openSample(id: string) {
  const sm = samples().find((x) => x.id === id) ?? samples()[0]!;
  const s = useApp.getState();
  s.setSource('before', sm.before);
  s.setSource('after', sm.after);
  s.setMode('auto');
  if (sm.id === 'text')
    s.updateConfig((c) => ({
      ...c,
      text: { ...c.text, filters: SAMPLE_FILTERS, ignoreWhitespace: true, precision: 'word' },
    }));
  if (sm.id === 'json')
    s.updateConfig((c) => ({ ...c, json: { ...c.json, ignoreKeys: SAMPLE_JSON_IGNORE_KEYS } }));
  await s.compare();
}

/** Run once the first frame is on screen (two animation frames), so the check never delays first paint. */
function afterFirstPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 0)));
}

/** IN-11: re-fetch saved sources when the app opens; a toast says which changed (O-13). No timers after this. */
export async function checkSavedSources() {
  const changed = await recheckOnOpen();
  if (!changed.length) return;
  const first = changed[0]!.source;
  useNotices.getState().push({
    title: 'Saved source changed',
    description:
      changed.length === 1
        ? `${first.name} changed since your last visit.`
        : `${changed.length} saved sources changed since your last visit.`,
    tone: 'info',
    action: {
      label: 'Review',
      onClick: () => {
        if (changed.length > 1) {
          useApp.getState().setScreen('saved');
          return;
        }
        void lastTwo(first).then(async (two) => {
          if (!two) return useApp.getState().setScreen('saved');
          const s = useApp.getState();
          const src = (name: string, content: string) => ({ name, content, size: new Blob([content]).size });
          s.setSource('before', src(`${first.name} (last visit)`, two.prev.content));
          s.setSource('after', src(first.name, two.cur.content));
          s.setMode(first.mode);
          await s.compare();
        });
      },
    },
  });
}

/** OUT-06: a comparison file the app was opened with (installed PWA file handler, where the browser has one). */
function consumeLaunchedFiles() {
  const lq = (window as { launchQueue?: { setConsumer: (cb: (p: { files: FileSystemFileHandle[] }) => void) => void } })
    .launchQueue;
  lq?.setConsumer(async ({ files }) => {
    const handle = files.find((f) => isComparisonName(f.name));
    if (!handle) return;
    const payload = await readComparisonFile(await (await handle.getFile()).text());
    if (payload) await openPayload(payload);
    else useApp.setState({ error: `${handle.name} isn’t a Specdiff comparison file.` });
  });
}
