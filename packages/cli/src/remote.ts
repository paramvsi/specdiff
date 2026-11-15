// --allow-external-refs: fetch remote $ref targets up front, so the engine itself never touches the network.
const REF = /\$ref["']?\s*:\s*["']?(https?:\/\/[^"'#\s]+)/g;

export async function prefetchRemoteRefs(contents: string[], files: Record<string, string>, limit = 50): Promise<string[]> {
  const queue = contents.flatMap((c) => [...c.matchAll(REF)].map((m) => m[1]!));
  const fetched: string[] = [];
  while (queue.length && fetched.length < limit) {
    const url = queue.shift()!;
    if (files[url] !== undefined) continue;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status} ${res.statusText}`);
    const body = await res.text();
    files[url] = body;
    fetched.push(url);
    for (const m of body.matchAll(REF)) queue.push(new URL(m[1]!, url).toString());
  }
  return fetched;
}

export function hasRemoteRefs(content: string): boolean {
  return new RegExp(REF.source).test(content);
}
