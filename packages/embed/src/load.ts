// Fetch and parse spec files for the embed (YAML or JSON), and turn failures into the Viewer's
// load-error states (VW-13).
import { keepWrittenVersion, type LoadError, type ViewerVersion } from '@specdiff/viewer';
import { parse } from 'yaml';

const fileName = (url: string) => {
  try { return decodeURIComponent(new URL(url, 'http://x/').pathname.split('/').pop() || url); } catch { return url; }
};
const hostOf = (url: string) => {
  try { return new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/').host; } catch { return url; }
};

/** Parse JSON first (cheap, exact), then YAML. Throws with a readable message. */
export function parseSpecText(text: string): object {
  const t = text.trim();
  if (t.startsWith('{')) {
    try { return keepWrittenVersion(JSON.parse(t) as object, t); } catch {
      // YAML has no // or /* */ comments and would fold one into the next key; say what is wrong instead.
      if (/[{[,]\s*(\/\/|\/\*)/.test(t)) throw new Error('JSON has no comments: remove the // or /* */ comment, or save the spec as YAML and use #.');
      /* otherwise fall through: YAML is a superset */
    }
  }
  // merge: YAML `<<` keys, as core's parser applies them when comparing.
  const doc = parse(text, { maxAliasCount: 100, merge: true }) as unknown;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('The file does not contain an object.');
  return keepWrittenVersion(doc as object, text);
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
    const spec = parseSpecText(await res.text()) as { info?: { version?: unknown } };
    const label = typeof spec.info?.version === 'string' || typeof spec.info?.version === 'number' ? String(spec.info.version) : source;
    return { label, source, spec };
  } catch (e) {
    return { label: source, source, error: { kind: 'parse', message: e instanceof Error ? e.message : String(e) } };
  }
}
