// Remote $ref targets are fetched up front, so the engine itself never touches the network (M-1):
// - local UI: the spec's remote $refs, and relative $refs inside a fetched file (resolved against its
//   URL), same host only; another host needs --allow-external-refs.
// - --ci: nothing unless --allow-external-refs, then every host.
// At most 50 files and 25 MB in all; what is left out is reported.
const ABSOLUTE = /\$ref["']?\s*:\s*["']?(https?:\/\/[^"'#\s]+)/g;
/** Any $ref with a file part (internal `#/…` refs have none). */
const ANY = /\$ref["']?\s*:\s*["']?([^"'#\s,}]+)/g;

export const MAX_FILES = 50;
export const MAX_BYTES = 25 * 1024 * 1024;

export interface PrefetchOptions {
  /** --allow-external-refs: follow refs to hosts other than the file that names them. */
  allowCrossHost: boolean;
  fetchImpl?: typeof fetch;
}

export async function prefetchRemoteRefs(contents: string[], files: Record<string, string>, o: PrefetchOptions): Promise<{ fetched: string[]; skipped: string[] }> {
  const fetchImpl = o.fetchImpl ?? fetch;
  // Seeds: absolute URLs in the local files (no host to compare with).
  const queue: Array<{ url: string; from?: string }> = contents.flatMap((c) => [...c.matchAll(ABSOLUTE)].map((m) => ({ url: m[1]! })));
  const fetched: string[] = [];
  const skipped: string[] = [];
  let bytes = 0;
  const seen = new Set<string>();
  while (queue.length) {
    const { url, from } = queue.shift()!;
    if (seen.has(url) || files[url] !== undefined) continue;
    seen.add(url);
    if (from && !o.allowCrossHost && new URL(url).host !== new URL(from).host) {
      skipped.push(`${url} (another host; pass --allow-external-refs)`);
      continue;
    }
    if (fetched.length >= MAX_FILES) { skipped.push(`${url} (over ${MAX_FILES} files)`); continue; }
    const res = await fetchImpl(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status} ${res.statusText}`);
    const body = await res.text();
    const size = new TextEncoder().encode(body).length;
    if (bytes + size > MAX_BYTES) { skipped.push(`${url} (over 25 MB in all)`); continue; }
    bytes += size;
    files[url] = body;
    fetched.push(url);
    for (const m of body.matchAll(ANY)) {
      let next: string;
      try { next = new URL(m[1]!, url).toString(); } catch { continue; }
      if (/^https?:/.test(next)) queue.push({ url: next, from: url });
    }
  }
  return { fetched, skipped };
}

export function hasRemoteRefs(content: string): boolean {
  return new RegExp(ABSOLUTE.source).test(content);
}
