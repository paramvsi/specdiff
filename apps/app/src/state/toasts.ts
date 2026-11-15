// O-13 action toasts. Work that starts outside a screen (boot's saved-source check) queues a toast here; the
// screens inside <Toaster> show it. useDecisionToast confirms each accept / reject with an Undo.
import type { DecisionsFile } from '@specdiff/core';
import { useToast, type ToastOptions } from '@specdiff/ui';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useApp } from './store';

export const useNotices = create<{ queue: ToastOptions[]; push: (t: ToastOptions) => void }>((set) => ({
  queue: [],
  push: (t) => set((s) => ({ queue: [...s.queue, t] })),
}));

/** Show queued toasts (call from a screen inside <Toaster>). */
export function useQueuedToasts() {
  const { toast } = useToast();
  const queue = useNotices((s) => s.queue);
  useEffect(() => {
    if (!queue.length) return;
    useNotices.setState({ queue: [] });
    for (const t of queue) toast(t);
  }, [queue, toast]);
}

/** The single fingerprint whose decision changed between two decision files, if exactly one did. */
export function decisionChange(prev: DecisionsFile, next: DecisionsFile) {
  const keys = new Set([...Object.keys(prev.decisions), ...Object.keys(next.decisions)]);
  const changed = [...keys].filter(
    (k) => prev.decisions[k]?.decision !== next.decisions[k]?.decision,
  );
  if (changed.length !== 1) return null;
  const fp = changed[0]!;
  const d = next.decisions[fp]?.decision;
  return d ? { fingerprint: fp, decision: d } : null;
}

let undoing = false;

/** "Change accepted · Saved to .specdiff/decisions.json · Undo" after each accept or reject (O-13). */
export function useDecisionToast() {
  const { toast } = useToast();
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.decisions === prev.decisions) return;
        if (undoing) {
          undoing = false;
          return;
        }
        const c = decisionChange(prev.decisions, s.decisions);
        if (!c) return;
        const before = prev.decisions;
        toast({
          title: c.decision === 'accepted' ? 'Change accepted' : 'Change rejected',
          description: 'Saved to .specdiff/decisions.json.',
          tone: 'success',
          action: {
            label: 'Undo',
            onClick: () => {
              undoing = true;
              useApp.getState().setDecisions(before);
            },
          },
        });
      }),
    [toast],
  );
}
