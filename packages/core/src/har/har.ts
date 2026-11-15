// HAR matching (OA-22, VW-10; docs/07 §7). Nothing leaves the browser.
import { byCodePoint } from '../order';
export interface Operation { method: string; path: string; operationId?: string }
export interface Match { operationKey: string; calls: number; requests: Array<{ method: string; url: string }> }
export interface HarResult { matches: Match[]; unmatched: number; ignoredOrigin: number }

interface HarFile { log?: { entries?: Array<{ request?: { method?: string; url?: string } }> } }

const key = (o: Operation) => `${o.method.toUpperCase()} ${o.path}`;

/** Templates sorted most specific first: more literal segments, then fewer params. */
function compile(ops: Operation[]) {
  return ops
    .map((o) => {
      const segs = o.path.split('/').filter(Boolean);
      const re = new RegExp('^/' + segs.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+?\\\}/g, '[^/]+')).join('/') + '/?$');
      // A segment with any literal text ({id}.json) is more specific than a bare {param}.
      const literal = segs.filter((s) => !/^\{[^}]+\}$/.test(s)).length;
      return { op: o, re, literal, len: segs.length };
    })
    .sort((a, b) => b.literal - a.literal || b.len - a.len || byCodePoint(key(a.op), key(b.op)));
}

/** Server base paths, e.g. https://api.example.com/v1 → origin + "/v1". */
function bases(servers: string[]): Array<{ origin?: string; prefix: string }> {
  if (!servers.length) return [{ prefix: '' }];
  return servers.map((s) => {
    if (!s.includes('{')) {
      try { const u = new URL(s); return { origin: u.origin, prefix: u.pathname.replace(/\/$/, '') }; }
      catch { /* relative: below */ }
    }
    // Relative server URL, or a host with {variables}: any origin, keep the base path.
    return { prefix: s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/\/$/, '') };
  });
}

export function matchHar(har: unknown, ops: Operation[], servers: string[]): HarResult {
  const entries = (har as HarFile)?.log?.entries;
  if (!Array.isArray(entries)) throw new Error('This is not a HAR file: there is no log.entries list.');
  const compiled = compile(ops);
  const bs = bases(servers);
  const by = new Map<string, Match>();
  let unmatched = 0, ignoredOrigin = 0;
  for (const e of entries) {
    const method = e.request?.method?.toUpperCase();
    const raw = e.request?.url;
    if (!method || !raw) continue;
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    const base = bs.find((b) => (!b.origin || b.origin === u.origin) && (u.pathname === b.prefix || u.pathname.startsWith(b.prefix + '/') || !b.prefix));
    if (!base) { ignoredOrigin++; continue; }
    const path = u.pathname.slice(base.prefix.length) || '/';
    const hit = compiled.find((c) => c.op.method.toUpperCase() === method && c.re.test(path));
    if (!hit) { unmatched++; continue; }
    const k = key(hit.op);
    const m = by.get(k) ?? { operationKey: k, calls: 0, requests: [] };
    m.calls++;
    if (m.requests.length < 20) m.requests.push({ method, url: raw });
    by.set(k, m);
  }
  return { matches: [...by.values()].sort((a, b) => b.calls - a.calls || byCodePoint(a.operationKey, b.operationKey)), unmatched, ignoredOrigin };
}

/** Parse operationIds or "METHOD /path" lines pasted by the user. */
export function parseOperationList(text: string, ops: Operation[]): string[] {
  const out = new Set<string>();
  for (const line of text.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean)) {
    const byId = ops.find((o) => o.operationId === line);
    if (byId) { out.add(key(byId)); continue; }
    const m = /^([A-Za-z]+)\s+(\/\S*)$/.exec(line);
    if (m) { const op = ops.find((o) => o.method.toUpperCase() === m[1]!.toUpperCase() && o.path === m[2]); if (op) out.add(key(op)); }
  }
  return [...out].sort();
}
