// Fetch and parse spec files for the embed (YAML or JSON), and turn failures into the Viewer's
// load-error states (VW-13).
import { keepWrittenVersion, type LoadError, type ViewerVersion } from '@specdiff/viewer';
import { readSpec } from '@specdiff/core/parse';

const fileName = (url: string) => {
  try { return decodeURIComponent(new URL(url, 'http://x/').pathname.split('/').pop() || url); } catch { return url; }
};
const hostOf = (url: string) => {
  try { return new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/').host; } catch { return url; }
};

/** Core's spec reader (M-21: one loader for the app and every Viewer host). Throws with a readable message. */
export function parseSpecText(text: string, name = 'input'): object {
  return keepWrittenVersion(readSpec(text, name), text);
}

export async function loadVersion(url: string, fetchImpl: typeof fetch = fetch): Promise<ViewerVersion> {
  const source = fileName(url);
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    const error: LoadError = { kind: 'cors', message: `The browser could not read ${source}.`, host: hostOf(url) };
    return { label: source, source, error };
  }
  if (!res.ok) return { label: source, source, error: { kind: 'http', message: `${hostOf(url)} answered ${res.status} for ${source}.`, host: hostOf(url) } };
  try {
    const text = await res.text();
    const spec = parseSpecText(text, source) as { info?: { version?: unknown } };
    const label = typeof spec.info?.version === 'string' || typeof spec.info?.version === 'number' ? String(spec.info.version) : source;
    return { label, source, spec, text };
  } catch (e) {
    return { label: source, source, error: { kind: 'parse', message: e instanceof Error ? e.message : String(e) } };
  }
}
