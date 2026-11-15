// O-02 / X-04 command palette: Files, Changes (every mode), Paths, Actions, Settings.
import type { HistoryEntry, Mode } from '@specdiff/core';
import { CommandPalette, type CommandGroup, type CommandItem } from '@specdiff/ui';
import { useEffect, useMemo, useState } from 'react';
import { listHistory, loadPayload, updateEntry } from '../state/persist';
import { useApp } from '../state/store';
import type { CompareResult } from '../worker/protocol';
import { run, useOverlays } from './commands';
import { focusChange, useNav } from './nav';

export const openPalette = () => useOverlays.getState().set({ palette: true });

/** cmdk renders every item; past this the palette stays fast and the screens' own lists take over. */
const MAX_CHANGES = 1000;

/** Select a change: deep-link it (#change=<id>), then bring its element into view if it is rendered. */
function goTo(id: string, domId: string = id) {
  focusChange(id, useNav.getState().tab);
  requestAnimationFrame(() => {
    const el = document.getElementById(domId);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  });
}

const SYMBOL = { added: '+', removed: '−', edited: '~', changed: '~', moved: '↕' } as Record<string, string>;
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The current result's changes, whatever the mode. */
export function changeItems(result: Exclude<CompareResult, { kind: 'parse' }>): CommandItem[] {
  if ('report' in result)
    return result.report.changes.map((c) => ({
      id: c.id,
      label: c.path,
      kind: c.ruleId ?? c.kind,
      ...(c.severity ? { severity: c.severity } : {}),
      keywords: [
        c.operation ? `${c.operation.method} ${c.operation.path}` : '',
        c.jsonPath ?? '',
        c.sharedSchema?.name ?? '',
      ],
      onSelect: () => focusChange(c.id),
    }));
  if ('json' in result)
    return result.json.changes.map((c) => ({
      id: c.id,
      label: `${SYMBOL[c.kind] ?? '~'} ${c.jsonPath ?? c.path}`,
      kind: c.kind,
      keywords: [c.path],
      onSelect: () => goTo(c.id),
    }));
  if ('markdown' in result)
    return result.markdown.blocks.flatMap((b, i) => {
      if (b.status === 'same') return [];
      const line = b.lines.after?.[0] ?? b.lines.before?.[0];
      const text = b.heading?.text ?? b.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return [
        {
          id: `m-${i}`,
          label: `${SYMBOL[b.status] ?? '~'} ${clip(text || b.type)}`,
          kind: `${b.status} ${b.type}${line ? ` · line ${line}` : ''}`,
          onSelect: () => goTo(`m-${i}`, `md-block-${i}`),
        },
      ];
    });
  if ('code' in result && 'items' in result.code)
    return result.code.items
      .filter((k) => k.status !== 'same' && k.status !== 'formatting')
      .map((k) => ({
        id: `k-${k.name}`,
        label: `${k.kind} ${k.name}`,
        kind: k.status,
        keywords: k.from ? [k.from] : [],
        onSelect: () => goTo(`k-${k.name}`),
      }));
  const { rows, blocks } = result.text;
  return blocks.map((start, n) => {
    const r = rows[start]!;
    const side = r.right ?? r.left;
    const text = side ? side.segs.map((s) => s.text).join('').trim() : '';
    return {
      id: `t-${n}`,
      label: `${r.right ? '+' : '−'} ${clip(text || '(blank line)')}`,
      kind: `line ${side?.n ?? ''}`.trim(),
      onSelect: () => goTo(`t-${n}`, `sd-t-${n}`),
    };
  });
}

export function Palette() {
  const open = useOverlays((s) => s.palette);
  const set = useOverlays((s) => s.set);
  const { result, before, after, setScreen, setSettings, settings, setSource, setMode, compare } =
    useApp();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    if (open)
      void listHistory()
        .then(setHistory)
        .catch(() => setHistory([]));
  }, [open]);

  const groups = useMemo<CommandGroup[]>(() => {
    const g: CommandGroup[] = [];
    const files: CommandItem[] = [];
    if (before) files.push({ id: 'before', label: before.name, kind: 'before', onSelect: () => setScreen('compare') });
    if (after) files.push({ id: 'after', label: after.name, kind: 'after', onSelect: () => setScreen('compare') });
    for (const e of history.slice(0, 20))
      files.push({
        id: `h-${e.id}`,
        label: `${e.before.name} → ${e.after.name}`,
        kind: `history · ${e.mode}`,
        onSelect: () =>
          void (async () => {
            const p = await loadPayload(e.payloadRef);
            if (!p) return;
            await updateEntry(e.id, { openedAt: new Date().toISOString() });
            setSource('before', p.before);
            setSource('after', p.after);
            setMode(p.mode as Mode);
            await compare();
          })(),
      });
    if (files.length) g.push({ heading: 'Files', items: files });

    if (result && !('kind' in result)) {
      const changes = changeItems(result);
      if (changes.length) g.push({ heading: 'Changes', items: changes.slice(0, MAX_CHANGES) });
    }
    if (result && 'report' in result) {
      const paths = [
        ...new Set(result.report.changes.map((c) => c.operation?.path).filter(Boolean) as string[]),
      ].sort();
      g.push({
        heading: 'Paths',
        items: paths.map((p) => ({
          id: p,
          label: p,
          kind: 'path',
          onSelect: () =>
            focusChange(result.report.changes.find((c) => c.operation?.path === p)!.id),
        })),
      });
    }
    g.push({
      heading: 'Actions',
      items: [
        { label: 'New comparison', kind: 'action', onSelect: () => setScreen('compare') },
        { label: 'Swap before and after', kind: 'action', onSelect: () => run('swap') },
        { label: 'Share', kind: 'action', onSelect: () => run('share') },
        { label: 'History', kind: 'action', onSelect: () => setScreen('history') },
        { label: 'Saved sources', kind: 'action', onSelect: () => setScreen('saved') },
        { label: 'Keyboard shortcuts', kind: 'action', onSelect: () => set({ shortcuts: true }) },
      ],
    });
    g.push({
      heading: 'Settings',
      items: [
        { label: 'Rules and settings', kind: 'setting', onSelect: () => setScreen('settings') },
        {
          label: `Theme: ${settings.theme === 'dark' ? 'light' : 'dark'}`,
          kind: 'setting',
          onSelect: () => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
        },
        {
          label: `Diff colours: ${settings.diffTheme === 'high-contrast' ? 'default' : 'high contrast'}`,
          kind: 'setting',
          onSelect: () =>
            setSettings({
              diffTheme: settings.diffTheme === 'high-contrast' ? 'default' : 'high-contrast',
            }),
        },
      ],
    });
    return g;
  }, [result, before, after, history, setScreen, setSettings, settings, set, setSource, setMode, compare]);
  return (
    <CommandPalette
      open={open}
      onOpenChange={(o) => set({ palette: o })}
      groups={groups}
      placeholder="Search files, changes, paths, actions"
      label="Command palette"
    />
  );
}
