// @specdiff/embed (PK-02): `Specdiff.mount(el, { url, compareWith, mode, theme, brand })`.
// Built as an IIFE global `Specdiff` plus one CSS file; see tsup.config.ts.
import '@specdiff/viewer/styles.css';
import { Viewer, type Brand, type CompareFn, type ThemeSetting, type VersionSet, type ViewerVersion } from '@specdiff/viewer';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { loadVersion, parseSpecText } from './load';

export { parseSpecText, loadVersion };

export interface MountOptions {
  /** URL of the spec to show (YAML or JSON). */
  url: string;
  /** URL of an older version to compare with: turns on badges, history and "What changed". */
  compareWith?: string;
  /** `reference` (default) opens the overview; `changes` opens "What changed". */
  mode?: 'reference' | 'changes';
  theme?: ThemeSetting;
  brand?: Brand;
  /** Prefix inside the URL hash, for pages that use the hash themselves. */
  basePath?: string;
  tryIt?: boolean;
  corsProxy?: string;
}

export interface Mounted {
  unmount(): void;
}

type CompareGlobal = { SpecdiffCompare?: { compareOpenApi: CompareFn } };

// Where this script was loaded from, so the comparison chunk can be found next to it.
const scriptSrc = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null)?.src : undefined;

let comparePromise: Promise<CompareFn | undefined> | undefined;
/** Load `specdiff-compare.js` from the same folder as this script, once. */
export function loadCompare(): Promise<CompareFn | undefined> {
  const g = globalThis as CompareGlobal;
  if (g.SpecdiffCompare) return Promise.resolve(g.SpecdiffCompare.compareOpenApi);
  if (comparePromise) return comparePromise;
  comparePromise = new Promise((resolve) => {
    const src = scriptSrc ? new URL('specdiff-compare.js', scriptSrc).toString() : undefined;
    if (!src) { resolve(undefined); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve((globalThis as CompareGlobal).SpecdiffCompare?.compareOpenApi);
    s.onerror = () => resolve(undefined);
    document.head.appendChild(s);
  });
  return comparePromise;
}

export function mount(el: HTMLElement, options: MountOptions): Mounted {
  if (!el) throw new Error('Specdiff.mount: the element is missing.');
  if (!options?.url) throw new Error('Specdiff.mount: `url` is required.');
  const root = createRoot(el);
  let versions: ViewerVersion[] = [];
  let compare: CompareFn | undefined;
  let compareNote: string | undefined;
  let gone = false;

  const set = (): VersionSet => {
    const current = versions[0]!;
    const older = versions[1];
    return { versions, current: current.label, ...(older ? { compareWith: older.label } : {}) };
  };
  const render = () => {
    if (gone) return;
    if (!versions.length) {
      root.render(createElement('div', { 'aria-busy': true, className: 'specdiff-loading' }, 'Loading API reference…'));
      return;
    }
    root.render(
      createElement(Viewer, {
        versions: set(),
        compare,
        theme: options.theme ?? 'system',
        brand: options.brand,
        basePath: options.basePath,
        tryIt: options.tryIt ?? true,
        corsProxy: options.corsProxy,
        parseSpec: (text: string) => parseSpecText(text),
        compareUnavailableReason: compareNote,
        onRetry: (label: string) => void retry(label),
      }),
    );
  };

  const load = async (url: string, slot: 0 | 1) => {
    let v = await loadVersion(url);
    const other = versions[slot === 0 ? 1 : 0];
    if (other && other.label === v.label) v = { ...v, label: `${v.label} (${slot === 0 ? 'current' : 'compared'})` };
    versions[slot] = v;
  };
  const retry = async (label: string) => {
    const slot = versions.findIndex((v) => v.label === label);
    if (slot < 0) return;
    await load(slot === 0 ? options.url : options.compareWith!, slot as 0 | 1);
    render();
  };

  render();
  void (async () => {
    await Promise.all([load(options.url, 0), options.compareWith ? load(options.compareWith, 1) : Promise.resolve()]);
    versions = versions.filter(Boolean);
    if (options.compareWith) {
      compare = await loadCompare();
      if (!compare) compareNote = 'Change badges are off: specdiff-compare.js could not be loaded next to specdiff-embed.js.';
    }
    if (options.mode === 'changes' && !location.hash) location.hash = `#/${options.basePath ? `${options.basePath.replace(/^\/|\/$/g, '')}/` : ''}changes`;
    render();
  })();

  return {
    unmount() {
      gone = true;
      root.unmount();
    },
  };
}
