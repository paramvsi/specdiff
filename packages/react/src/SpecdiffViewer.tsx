// <SpecdiffViewer> (PK-03): fetches one or two spec versions and renders the Viewer.
// Core (parser + comparison engine) is imported lazily so the reference renders before it loads.
import { Viewer, type Brand, type CompareFn, type ThemeSetting, type VersionSet, type ViewerVersion } from '@specdiff/viewer';
import { useEffect, useState } from 'react';

export interface SpecdiffViewerProps {
  /** Spec to show (YAML or JSON URL). */
  url: string;
  /** Older version to compare with: turns on badges, history and "What changed". */
  compareWith?: string | undefined;
  theme?: ThemeSetting | undefined;
  brand?: Brand | undefined;
  basePath?: string | undefined;
  tryIt?: boolean | undefined;
  corsProxy?: string | undefined;
  /** Override the comparison (defaults to `compareOpenApi` from @specdiff/core). */
  compare?: CompareFn | undefined;
  className?: string | undefined;
}

type Core = typeof import('@specdiff/core');
let corePromise: Promise<Core> | undefined;
const loadCore = () => (corePromise ??= import('@specdiff/core'));

export function parseWith(core: Pick<Core, 'parseDocument'> & Partial<Pick<Core, 'upgradeSpec'>>, text: string, name: string): object {
  const doc = core.parseDocument(text, name);
  if (doc.errors.length || !doc.value || typeof doc.value !== 'object') {
    const e = doc.errors[0];
    throw new Error(e ? `${name}:${e.line}:${e.column} ${e.message}` : `${name} does not contain an object.`);
  }
  const value = doc.value as { swagger?: unknown };
  // The Viewer renders OpenAPI 3; Swagger 2.0 is upgraded with core's converter.
  return typeof value.swagger === 'string' && value.swagger.startsWith('2') && core.upgradeSpec ? core.upgradeSpec(value) : value;
}

const fileName = (url: string) => {
  try { return decodeURIComponent(new URL(url, 'http://x/').pathname.split('/').pop() || url); } catch { return url; }
};
const hostOf = (url: string) => {
  try { return new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/').host; } catch { return url; }
};

export async function fetchVersion(url: string, core: Pick<Core, 'parseDocument'> & Partial<Pick<Core, 'upgradeSpec'>>, fetchImpl: typeof fetch = fetch): Promise<ViewerVersion> {
  const source = fileName(url);
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    return { label: source, source, error: { kind: 'cors', message: `The browser could not read ${source}.`, host: hostOf(url) } };
  }
  if (!res.ok) return { label: source, source, error: { kind: 'http', message: `${hostOf(url)} answered ${res.status} for ${source}.`, host: hostOf(url) } };
  try {
    const spec = parseWith(core, await res.text(), source) as { info?: { version?: unknown } };
    const v = spec.info?.version;
    return { label: typeof v === 'string' || typeof v === 'number' ? String(v) : source, source, spec };
  } catch (e) {
    return { label: source, source, error: { kind: 'parse', message: e instanceof Error ? e.message : String(e) } };
  }
}

export function SpecdiffViewer({ url, compareWith, compare, className, ...rest }: SpecdiffViewerProps) {
  const [state, setState] = useState<{ set: VersionSet; compare: CompareFn | undefined; note?: string; parse: (t: string, n: string) => object } | { error: string } | undefined>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const core = await loadCore();
        const [cur, old] = await Promise.all([fetchVersion(url, core), compareWith ? fetchVersion(compareWith, core) : Promise.resolve(undefined)]);
        if (old && old.label === cur.label) old.label = `${old.label} (compared)`;
        const versions = old ? [old, cur] : [cur];
        const fn: CompareFn | undefined = compare ?? (typeof core.compareOpenApi === 'function' ? (a, b) => core.compareOpenApi(a, b) : undefined);
        if (live) {
          setState({
            set: { versions, current: cur.label, ...(old ? { compareWith: old.label } : {}) },
            compare: fn,
            ...(fn ? {} : { note: 'This build of @specdiff/core has no compareOpenApi, so only New and Deprecated badges are shown.' }),
            parse: (t, n) => parseWith(core, t, n),
          });
        }
      } catch (e) {
        if (live) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [url, compareWith, compare, attempt]);

  if (!state) return <div className={className} aria-busy="true">Loading API reference…</div>;
  if ('error' in state) return <div className={className} role="alert">Could not load the API reference: {state.error}</div>;
  return (
    <Viewer
      {...rest}
      className={className}
      versions={state.set}
      compare={state.compare}
      compareUnavailableReason={state.note}
      parseSpec={state.parse}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
