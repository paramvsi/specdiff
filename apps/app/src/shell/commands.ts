// Named commands: keyboard shortcuts (O-03), the palette and screens all go through here.
import { useEffect } from 'react';
import { create } from 'zustand';

export type CommandName =
  | 'next-change'
  | 'prev-change'
  | 'next-to-review'
  | 'go-to-line'
  | 'palette'
  | 'accept'
  | 'reject'
  | 'mark-viewed'
  | 'explain'
  | 'copy-link'
  | 'toggle-unified'
  | 'toggle-wrap'
  | 'show-unchanged'
  | 'tab-1'
  | 'tab-2'
  | 'tab-3'
  | 'tab-4'
  | 'toggle-filters'
  | 'swap'
  | 'open-file'
  | 'load-url'
  | 'share'
  | 'shortcuts'
  | 'add-source';

type Handler = () => void;
const handlers = new Map<CommandName, Handler[]>();

export function run(name: CommandName): boolean {
  const list = handlers.get(name);
  const h = list?.[list.length - 1]; // the most recently mounted screen wins
  if (!h) return false;
  h();
  return true;
}

export function useCommand(name: CommandName, fn: Handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const list = handlers.get(name) ?? [];
    handlers.set(name, [...list, fn]);
    return () => {
      handlers.set(
        name,
        (handlers.get(name) ?? []).filter((h) => h !== fn),
      );
    };
  }, [name, fn, enabled]);
}

interface Overlays {
  palette: boolean;
  shortcuts: boolean;
  set: (p: Partial<Omit<Overlays, 'set'>>) => void;
}
export const useOverlays = create<Overlays>((set) => ({
  palette: false,
  shortcuts: false,
  set: (p) => set(p),
}));
export const openPalette = () => useOverlays.getState().set({ palette: true });

/** Key → command, exactly as the O-03 sheet. Mod = ⌘ on Mac, Ctrl elsewhere. */
export function commandFor(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'code'>,
  inField: boolean,
): CommandName | undefined {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && !e.shiftKey && k === 'k') return 'palette';
  if (mod && !e.shiftKey && k === 'g') return 'go-to-line';
  if (mod && !e.shiftKey && k === 'o') return 'open-file';
  if (mod && e.shiftKey && k === 'o') return 'load-url';
  if (mod && e.shiftKey && k === 's') return 'share';
  if (mod || inField) return undefined;
  if (e.altKey && e.code === 'KeyZ') return 'toggle-wrap';
  if (e.altKey) return undefined;
  if (e.key === '?') return 'shortcuts'; // Shift is part of typing "?"
  if (e.shiftKey)
    return ({ c: 'copy-link', u: 'toggle-unified', e: 'show-unchanged', s: 'swap' } as const)[
      k as 'c'
    ];
  return (
    {
      j: 'next-change',
      k: 'prev-change',
      n: 'next-to-review',
      a: 'accept',
      r: 'reject',
      v: 'mark-viewed',
      e: 'explain',
      f: 'toggle-filters',
      '1': 'tab-1',
      '2': 'tab-2',
      '3': 'tab-3',
      '4': 'tab-4',
    } as const
  )[k as 'j'];
}
