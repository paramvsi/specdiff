import { useEffect } from 'react';
import { commandFor, run, useOverlays } from './commands';

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const name = commandFor(e, isField(e.target));
      if (!name) return;
      if (name === 'palette') {
        e.preventDefault();
        useOverlays.getState().set({ palette: true });
        return;
      }
      if (name === 'shortcuts') {
        e.preventDefault();
        useOverlays.getState().set({ shortcuts: true });
        return;
      }
      if (run(name)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
