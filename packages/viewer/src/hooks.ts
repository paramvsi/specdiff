// Hash routing (VW-12 deep links), media queries, theme and the report cache.
import type { Report } from '@specdiff/core';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CompareFn, CompareInput, ThemeSetting, ViewerVersion } from './types';

export type Route =
  | { page: 'overview' }
  | { page: 'op'; slug: string; tab: 'docs' | 'history' }
  | { page: 'schema'; slug: string }
  | { page: 'changes' }
  | { page: 'auth' }
  | { page: 'search'; q: string };

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

export function parseHash(hash: string, basePath = ''): Route {
  let h = trimSlashes(hash.replace(/^#/, ''));
  const base = trimSlashes(basePath);
  if (base) {
    if (h !== base && !h.startsWith(`${base}/`) && !h.startsWith(`${base}?`)) return { page: 'overview' };
    h = trimSlashes(h.slice(base.length));
  }
  const [path = '', qs = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (parts[0] === 'op' && parts[1]) return { page: 'op', slug: parts[1], tab: parts[2] === 'history' ? 'history' : 'docs' };
  if (parts[0] === 'schema' && parts[1]) return { page: 'schema', slug: parts[1] };
  if (parts[0] === 'changes') return { page: 'changes' };
  if (parts[0] === 'auth') return { page: 'auth' };
  if (parts[0] === 'search') return { page: 'search', q: new URLSearchParams(qs).get('q') ?? '' };
  return { page: 'overview' };
}

export function hrefFor(route: Route, basePath = ''): string {
  const base = trimSlashes(basePath);
  const pre = `#/${base ? `${base}/` : ''}`;
  switch (route.page) {
    case 'op': return `${pre}op/${encodeURIComponent(route.slug)}${route.tab === 'history' ? '/history' : ''}`;
    case 'schema': return `${pre}schema/${encodeURIComponent(route.slug)}`;
    case 'changes': return `${pre}changes`;
    case 'auth': return `${pre}auth`;
    case 'search': return `${pre}search?q=${encodeURIComponent(route.q)}`;
    default: return pre;
  }
}

export function useHashRoute(basePath = ''): [Route, (r: Route) => void] {
  const read = () => parseHash(typeof location === 'undefined' ? '' : location.hash, basePath);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash, basePath));
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [basePath]);
  const go = useCallback((r: Route) => {
    const href = hrefFor(r, basePath);
    if (location.hash !== href) location.hash = href;
    setRoute(r);
  }, [basePath]);
  return [route, go];
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useTheme(setting: ThemeSetting): ['light' | 'dark', (t: 'light' | 'dark') => void] {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [override, setOverride] = useState<'light' | 'dark' | undefined>(undefined);
  // A new theme prop from the host wins over the user's toggle.
  const [lastSetting, setLastSetting] = useState(setting);
  if (lastSetting !== setting) { setLastSetting(setting); setOverride(undefined); }
  const resolved = override ?? (setting === 'system' ? (systemDark ? 'dark' : 'light') : setting);
  return [resolved, setOverride];
}

// ---- Reports ----------------------------------------------------------------------------------

export type ReportState = { status: 'loading' } | { status: 'ready'; report: Report } | { status: 'error'; message: string };

/** Caches one Report per (before, after) pair; components subscribe with `useReport`. */
/** What a comparison reads for a version: the file as written when the host kept it (M-21), else the parsed spec as JSON. */
export const compareInput = (v: ViewerVersion): CompareInput =>
  v.text !== undefined ? { name: v.source, content: v.text } : { name: `${v.label}.json`, content: JSON.stringify(v.spec) };

export class ReportStore {
  private map = new Map<string, ReportState>();
  private listeners = new Set<() => void>();
  private tick = 0;
  constructor(
    private readonly compare: CompareFn | undefined,
    private readonly versionOf: (label: string) => ViewerVersion | undefined,
  ) {}
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  snapshot = () => this.tick;
  private emit() { this.tick++; for (const l of this.listeners) l(); }
  get(before: string, after: string): ReportState | undefined {
    if (!this.compare) return undefined;
    const a = this.versionOf(before);
    const b = this.versionOf(after);
    if (!a?.spec || !b?.spec) return undefined;
    const key = `${before}\u0000${after}`;
    const hit = this.map.get(key);
    if (hit) return hit;
    const state: ReportState = { status: 'loading' };
    this.map.set(key, state);
    const compare = this.compare;
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => compare(compareInput(a), compareInput(b)))
        .then((report) => this.map.set(key, { status: 'ready', report }), (e: unknown) => this.map.set(key, { status: 'error', message: e instanceof Error ? e.message : String(e) }))
        .finally(() => this.emit());
    });
    return state;
  }
}

export function useReport(store: ReportStore, before: string | undefined, after: string | undefined): ReportState | undefined {
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return before && after && before !== after ? store.get(before, after) : undefined;
}

/** Subscribe to the store and read several pairs. */
export function useReports(store: ReportStore, pairs: Array<[string, string]>): Array<ReportState | undefined> {
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  return pairs.map(([a, b]) => store.get(a, b));
}

/** Clipboard with a fallback for pages without the async clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
