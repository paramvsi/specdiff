// O-02 / X-04 command palette: Files, Changes (every mode), Paths, Actions, Settings.
// Loaded on first open (App.tsx), so cmdk and the result indexes stay out of start-up.
import type { HistoryEntry, Mode } from '@specdiff/core';
import { CommandPalette, type CommandGroup, type CommandItem } from '@specdiff/ui';
import { useEffect, useMemo, useState } from 'react';
import { listHistory, loadPayload, updateEntry } from '../state/persist';
import { useApp } from '../state/store';
import type { CompareResult } from '../worker/protocol';
import { changeTitleText } from '../screens/openapi/titles';
import { run, useOverlays } from './commands';
import { focusChange, useNav } from './nav';

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

const toResult = () => {
  const s = useApp.getState();
  if (s.screen !== 'result') s.setScreen('result');
};

/** The current result's changes, whatever the mode. */
export function changeItems(result: Exclude<CompareResult, { kind: 'parse' }>): CommandItem[] {
  if ('report' in result)
    return result.report.changes.map((c) => ({
      id: c.id,
      label: changeTitleText(c),
      // AComponents: the right-hand meta names the kind of result, not the rule id.
      kind: 'change',
      ...(c.severity ? { severity: c.severity } : {}),
      keywords: [
        c.path,
        c.operation ? `${c.operation.method} ${c.operation.path}` : '',
        c.jsonPath ?? '',
        c.sharedSchema?.name ?? '',
        c.ruleId ?? '',
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
  const { result, before, after, setScreen, setSettings, settings, setSource, setMode, compare, updateConfig } =
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
      // A change opens in the result, from whichever screen the palette was opened on.
      const changes = changeItems(result).map((it) => ({ ...it, onSelect: () => { toResult(); it.onSelect?.(); } }));
      if (changes.length) g.push({ heading: 'Changes', items: changes.slice(0, MAX_CHANGES) });
    }
    if (result && 'report' in result) {
      // Endpoint paths and shared schemas ($.components.schemas.X); each opens its first change.
      const first = new Map<string, string>();
      for (const c of result.report.changes) {
        if (c.operation?.path && !first.has(c.operation.path)) first.set(c.operation.path, c.id);
        const schema = c.sharedSchema?.name ?? /^\$\.components\.schemas\.([^.[]+)/.exec(c.jsonPath ?? '')?.[1];
        if (schema && !first.has(`$.components.schemas.${schema}`)) first.set(`$.components.schemas.${schema}`, c.id);
      }
      g.push({
        heading: 'Paths',
        items: [...first.keys()].sort().map((p) => ({
          id: p,
          label: p,
          kind: 'path',
          onSelect: () => {
            toResult();
            focusChange(first.get(p)!);
          },
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
        {
          label: 'Toggle ignore whitespace',
          kind: 'action',
          keywords: ['spaces', 'indentation', 'formatting'],
          onSelect: () => {
            updateConfig((c) => ({ ...c, text: { ...c.text, ignoreWhitespace: !(c.text?.ignoreWhitespace ?? false) } }));
            if (useApp.getState().screen === 'result') void compare();
          },
        },
        {
          label: 'Toggle hide docs-only changes',
          kind: 'action',
          keywords: ['ignore', 'descriptions', 'documentation'],
          onSelect: () => {
            updateConfig((c) => ({ ...c, openapi: { ...c.openapi, hideDocsOnly: !(c.openapi?.hideDocsOnly ?? false) } }));
            if (useApp.getState().screen === 'result') void compare();
          },
        },
        { label: 'Split / unified', kind: 'action', keywords: ['inline', 'side by side', 'layout'], onSelect: () => run('toggle-unified') },
        { label: 'Word wrap', kind: 'action', keywords: ['lines'], onSelect: () => run('toggle-wrap') },
        { label: 'Show unchanged lines', kind: 'action', keywords: ['context', 'expand'], onSelect: () => run('show-unchanged') },
        { label: 'Go to line', kind: 'action', onSelect: () => run('go-to-line') },
        { label: 'Explain this change', kind: 'action', onSelect: () => run('explain') },
        { label: 'Copy link to change', kind: 'action', onSelect: () => run('copy-link') },
        { label: 'Open file', kind: 'action', onSelect: () => (run('open-file') ? undefined : setScreen('compare')) },
        { label: 'Load from URL', kind: 'action', onSelect: () => (run('load-url') ? undefined : setScreen('compare')) },
        { label: 'Keyboard shortcuts', kind: 'action', onSelect: () => set({ shortcuts: true }) },
      ],
    });
    g.push({
      heading: 'Settings',
      items: [
        {
          label: 'Rules and settings',
          kind: 'setting',
          keywords: ['severity', 'strictness', 'ignore paths', 'ignore keys', 'diff options', '.specdiff.yaml'],
          onSelect: () => setScreen('settings'),
        },
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
  }, [result, before, after, history, setScreen, setSettings, settings, set, setSource, setMode, compare, updateConfig]);
  return (
    <CommandPalette
      open={open}
      onOpenChange={(o) => {
        set({ palette: o });
        // After a pick the target may not be focusable (or render later): never leave focus on <body>.
        if (!o) setTimeout(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          const el = document.querySelector<HTMLElement>('main [aria-current="true"]') ?? document.getElementById('main');
          el?.focus({ preventScroll: true });
        }, 50);
      }}
      groups={groups}
      placeholder="Search files, changes, paths, actions"
      label="Command palette"
    />
  );
}
