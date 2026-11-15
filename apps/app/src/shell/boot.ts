// Startup: settings from IndexedDB, then one of: share link (#v=1…), ?sample=<id>, ?local=<token> (CLI).
import type { Mode, SharePayload } from '@specdiff/core';
import { decodeShare, isLocked } from '@specdiff/core/share';
import { useEffect, useRef } from 'react';
import { samples, SAMPLE_FILTERS } from '../lib/samples';
import { loadSettings, saveSettings } from '../state/persist';
import { defaultSettings, useApp } from '../state/store';
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
  if (p.options) s.updateConfig(() => p.options as never);
  if (p.decisions) s.setDecisions(p.decisions);
  if (p.view)
    useNav
      .getState()
      .set({
        ...(p.view.changeId ? { changeId: p.view.changeId } : {}),
        ...(p.view.tab ? { tab: p.view.tab } : {}),
      });
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
        if (s.settings !== prev.settings) void saveSettings(s.settings).catch(() => {});
      });

      const hash = location.hash;
      if (hash.startsWith('#v=')) {
        if (isLocked(hash)) {
          usePending.hash = hash;
          useApp.getState().setScreen('unlock');
          return;
        }
        try {
          await openPayload(await decodeShare(hash));
        } catch {
          useApp.setState({
            error: 'This share link is damaged or incomplete. Ask for a new link.',
          });
        }
        return;
      }
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

export async function openSample(id: string) {
  const sm = samples().find((x) => x.id === id) ?? samples()[0]!;
  const s = useApp.getState();
  s.setSource('before', sm.before);
  s.setSource('after', sm.after);
  s.setMode('auto');
  if (sm.id === 'text')
    s.updateConfig((c) => ({
      ...c,
      text: { ...c.text, filters: SAMPLE_FILTERS, ignoreWhitespace: true },
    }));
  await s.compare();
}
