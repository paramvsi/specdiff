import { useSyncExternalStore } from 'react';

/** True while the media query matches (re-renders on change). */
export function useMedia(query: string): boolean {
  const has = typeof window !== 'undefined' && typeof window.matchMedia === 'function'; // jsdom has none
  return useSyncExternalStore(
    (cb) => {
      if (!has) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => has && window.matchMedia(query).matches,
    () => false,
  );
}

/** M-3, M-16: below this width rows become cards and side-by-side views become a toggle. */
export const NARROW = '(max-width: 719px)';
