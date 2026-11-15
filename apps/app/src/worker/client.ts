// One worker per comparison: cancel = terminate (IN-08).
import { proxy, wrap } from 'comlink';
import type { runCompare, runTextDiff } from './engine';
import type { CompareRequest, CompareResult, Progress } from './protocol';

export interface Job {
  promise: Promise<CompareResult>;
  cancel: () => void;
}

export function startCompare(req: CompareRequest, onProgress: (p: Progress) => void): Job {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'specdiff-engine',
  });
  const api = wrap<{ runCompare: typeof runCompare }>(worker);
  let cancel = () => {};
  // A terminated worker never answers, so cancel rejects the promise itself.
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => {
      worker.terminate();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
  });
  const promise = Promise.race([api.runCompare(req, proxy(onProgress)), cancelled]).finally(() =>
    worker.terminate(),
  );
  return { promise, cancel };
}

/** X-02: a line diff in its own worker (cancel = terminate), so large side-by-side views never block the page. */
export function startTextDiff(before: string, after: string): { promise: Promise<ReturnType<typeof runTextDiff>>; cancel: () => void } {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
    name: 'specdiff-engine',
  });
  const api = wrap<{ runTextDiff: typeof runTextDiff }>(worker);
  return {
    promise: api.runTextDiff(before, after).finally(() => worker.terminate()),
    cancel: () => worker.terminate(),
  };
}
