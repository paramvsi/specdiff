// Deep links to a change (OA-13, X-12): #change=<id>. Share links use #v=1… and are handled by boot.
import { create } from 'zustand';

interface Nav {
  changeId: string | null;
  tab: string;
  set: (p: Partial<Pick<Nav, 'changeId' | 'tab'>>) => void;
}
export const useNav = create<Nav>((set) => ({
  changeId: null,
  tab: 'summary',
  set: (p) => set(p),
}));

export function focusChange(id: string, tab = 'workspace') {
  useNav.getState().set({ changeId: id, tab });
  history.replaceState(null, '', `#change=${encodeURIComponent(id)}`);
}

export function readChangeHash(): string | null {
  const m = /^#change=([^&]+)/.exec(location.hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]!); } catch { return m[1]!; } // a mangled link: read as written
}

export function changeLink(id: string): string {
  return `${location.origin}${location.pathname}#change=${encodeURIComponent(id)}`;
}
