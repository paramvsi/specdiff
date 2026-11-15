import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCompare, startTextDiff } from './client';

// A Worker whose script fails to load (e.g. an old chunk gone after a redeploy) fires `error`
// and never answers. The job must fail, not leave the Parsing screen up forever.
class DeadWorker extends EventTarget {
  terminated = false;
  constructor() {
    super();
    setTimeout(() => this.dispatchEvent(new Event('error')), 0);
  }
  postMessage() {}
  terminate() { this.terminated = true; }
}

afterEach(() => vi.unstubAllGlobals());

describe('worker client', () => {
  it('rejects a comparison when the worker fails to start', async () => {
    vi.stubGlobal('Worker', DeadWorker);
    const job = startCompare({} as never, () => {});
    await expect(job.promise).rejects.toThrow(/could not start/i);
  });
  it('rejects a text diff when the worker fails to start', async () => {
    vi.stubGlobal('Worker', DeadWorker);
    await expect(startTextDiff('a', 'b').promise).rejects.toThrow(/could not start/i);
  });
});
