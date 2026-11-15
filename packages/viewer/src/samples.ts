// Code samples (VW-06): curl, JavaScript (fetch), Python (requests), Java (HttpClient).
import { deref, type Json, type Op } from './model';

export type Lang = 'curl' | 'javascript' | 'python' | 'java';
export interface SampleInput { op: Op; server: string; path: Record<string, string>; query: Record<string, string>; headers: Record<string, string>; body?: string }

/** Build an example body from schema examples/defaults/types (bounded depth). */
export function exampleFor(spec: Json, schema: Json, depth = 0, seen = new Set<Json>()): Json {
  const s = deref(spec, schema);
  if (!s || typeof s !== 'object' || depth > 6 || seen.has(s)) return null;
  if (s.example !== undefined) return s.example;
  if (s.examples?.length) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  const next = new Set(seen).add(s);
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x: Json) => exampleFor(spec, x, depth + 1, next)));
  if (s.oneOf || s.anyOf) return exampleFor(spec, (s.oneOf ?? s.anyOf)[0], depth + 1, next);
  const t = Array.isArray(s.type) ? s.type.find((x: string) => x !== 'null') : s.type;
  if (t === 'object' || s.properties) {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries<Json>(s.properties ?? {})) if (!deref(spec, v)?.readOnly) out[k] = exampleFor(spec, v, depth + 1, next);
    return out;
  }
  if (t === 'array') return [exampleFor(spec, s.items, depth + 1, next)];
  if (t === 'integer' || t === 'number') return s.minimum ?? 0;
  if (t === 'boolean') return true;
  if (t === 'string') return s.format === 'date-time' ? '2026-11-15T09:00:00Z' : s.format === 'date' ? '2026-11-15' : s.format === 'uuid' ? '00000000-0000-0000-0000-000000000000' : 'string';
  return null;
}

export function buildUrl(i: SampleInput): string {
  const path = i.op.path.replace(/\{([^}]+)\}/g, (_, n: string) => encodeURIComponent(i.path[n] ?? `{${n}}`));
  const qs = new URLSearchParams(Object.entries(i.query).filter(([, v]) => v !== '')).toString();
  return i.server.replace(/\/$/, '') + path + (qs ? `?${qs}` : '');
}

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const js = (s: string) => JSON.stringify(s);

export function sample(lang: Lang, i: SampleInput): string {
  const url = buildUrl(i);
  const m = i.op.method.toUpperCase();
  const headers = { ...i.headers, ...(i.body ? { 'Content-Type': 'application/json' } : {}) };
  const hs = Object.entries(headers);
  if (lang === 'curl') {
    // V-02: one short line each, so nothing is cut at the panel edge. curl sends GET, or POST
    // when there is a body, without -X; the JSON body is pretty-printed over several lines.
    const implied = m === 'GET' || (m === 'POST' && !!i.body);
    // The URL is quoted only when the shell needs it (?, &, spaces…), as in the design.
    return [`curl ${/^[\w.:/@%+=,~-]+$/.test(url) ? url : sh(url)}`, ...(implied ? [] : [`  -X ${m}`]), ...hs.map(([k, v]) => `  -H ${sh(`${k}: ${v}`)}`), ...(i.body ? [`  -d ${sh(pretty(i.body).replace(/\n/g, '\n  '))}`] : [])].join(' \\\n');
  }
  if (lang === 'javascript') {
    const opts = [`  method: ${js(m)},`, ...(hs.length ? [`  headers: {\n${hs.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n')}\n  },`] : []), ...(i.body ? [`  body: JSON.stringify(${i.body}),`] : [])];
    return `const res = await fetch(${js(url)}, {\n${opts.join('\n')}\n});\nconst data = await res.json();`;
  }
  if (lang === 'python') {
    const args = [js(url), ...(hs.length ? [`headers={${hs.map(([k, v]) => `${js(k)}: ${js(v)}`).join(', ')}}`] : []), ...(i.body ? [`json=${toPython(i.body)}`] : [])];
    return `import requests\n\nres = requests.request(${js(m)}, ${args.join(', ')})\nprint(res.json())`;
  }
  const builder = [`HttpRequest request = HttpRequest.newBuilder()`, `    .uri(URI.create(${js(url)}))`, ...hs.map(([k, v]) => `    .header(${js(k)}, ${js(v)})`),
    `    .method(${js(m)}, ${i.body ? `HttpRequest.BodyPublishers.ofString(${js(i.body)})` : 'HttpRequest.BodyPublishers.noBody()'})`, `    .build();`];
  return `HttpClient client = HttpClient.newHttpClient();\n${builder.join('\n')}\nHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`;
}

function pretty(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; }
}

function toPython(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 0).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None'); }
  catch { return js(json); }
}
