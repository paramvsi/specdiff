// Viewer data model (VW-01..VW-04): navigation, operations, schemas and a search index from an OpenAPI 3.x document.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;

export const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'] as const;

export interface Param { name: string; in: 'path' | 'query' | 'querystring' | 'header' | 'cookie'; required: boolean; deprecated: boolean; description?: string; schema: Json }
export interface Op {
  key: string; // "POST /v1/payments"
  slug: string; // "post-v1-payments" (route)
  method: string; path: string; operationId?: string; summary?: string; description?: string;
  tags: string[]; deprecated: boolean; sunset?: string;
  params: Param[];
  requestBody?: { required: boolean; content: Record<string, { schema?: Json; example?: Json }> };
  responses: Array<{ status: string; description?: string; content: Record<string, { schema?: Json; example?: Json }>; headers: Record<string, Json> }>;
  security: Array<Record<string, string[]>>;
}
export interface SchemaEntry { name: string; slug: string; schema: Json; usedIn: string[] }
export interface Model {
  title: string; version: string; description?: string;
  servers: Array<{ url: string; description?: string }>;
  securitySchemes: Record<string, Json>;
  /** `title` is what the reader sees: `x-displayName`, else the name with a capital first letter. */
  tags: Array<{ name: string; title: string; description?: string; ops: Op[] }>;
  ops: Op[];
  schemas: SchemaEntry[];
}

const slugify = (s: string) => s.toLowerCase().replace(/[{}]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolve a local $ref (one level, with a cycle guard). External refs are left as-is. */
export function deref(spec: Json, node: Json, seen = new Set<string>()): Json {
  let n = node;
  while (n && typeof n === 'object' && typeof n.$ref === 'string' && n.$ref.startsWith('#/') && !seen.has(n.$ref)) {
    seen.add(n.$ref);
    n = n.$ref.slice(2).split('/').map((p: string) => p.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((o: Json, k: string) => o?.[k], spec) ?? n;
  }
  return n;
}

export function refName(node: Json): string | undefined {
  const r = node?.$ref;
  return typeof r === 'string' && r.startsWith('#/components/schemas/') ? decodeURIComponent(r.slice('#/components/schemas/'.length)) : undefined;
}

function contentMap(spec: Json, content: Json) {
  const out: Record<string, { schema?: Json; example?: Json }> = {};
  for (const [type, media] of Object.entries<Json>(content ?? {})) {
    const m = deref(spec, media);
    out[type] = { ...(m?.schema ? { schema: m.schema } : {}), ...(m?.example !== undefined ? { example: m.example } : m?.examples ? { example: deref(spec, Object.values<Json>(m.examples)[0])?.value } : {}) };
  }
  return out;
}

export function buildModel(spec: Json): Model {
  const ops: Op[] = [];
  const rawOps = new Map<string, Json>();
  const globalSecurity = spec.security ?? [];
  for (const path of Object.keys(spec.paths ?? {}).sort()) {
    const item = deref(spec, spec.paths[path]);
    const shared: Json[] = item.parameters ?? [];
    // Fixed methods, then OpenAPI 3.2 `additionalOperations` (LINK, PURGE…), as core diffs them.
    const extra = item.additionalOperations && typeof item.additionalOperations === 'object' ? Object.entries<Json>(item.additionalOperations).map(([k, v]) => [k.toLowerCase(), v] as const) : [];
    for (const [method, op] of [...METHODS.map((m) => [m, item[m]] as const), ...extra]) {
      if (!op || typeof op !== 'object') continue;
      rawOps.set(`${method.toUpperCase()} ${path}`, op);
      const params = new Map<string, Param>();
      for (const p of [...shared, ...(op.parameters ?? [])].map((x) => deref(spec, x))) {
        if (!p?.name) continue;
        params.set(`${p.in}:${p.name}`, { name: p.name, in: p.in, required: p.in === 'path' || !!p.required, deprecated: !!p.deprecated, ...(p.description ? { description: p.description } : {}), schema: p.schema ?? (Object.values<Json>(p.content ?? {})[0]?.schema as Json | undefined) ?? {} });
      }
      const body = op.requestBody ? deref(spec, op.requestBody) : undefined;
      const key = `${method.toUpperCase()} ${path}`;
      ops.push({
        key, slug: slugify(`${method} ${path}`), method, path,
        ...(op.operationId ? { operationId: op.operationId } : {}), ...(op.summary ? { summary: op.summary } : {}), ...(op.description ? { description: op.description } : {}),
        tags: op.tags?.length ? op.tags : ['default'],
        deprecated: !!op.deprecated, ...(op['x-sunset'] ? { sunset: String(op['x-sunset']) } : {}),
        params: [...params.values()],
        ...(body ? { requestBody: { required: !!body.required, content: contentMap(spec, body.content) } } : {}),
        responses: Object.keys(op.responses ?? {}).sort().map((status) => {
          const r = deref(spec, op.responses[status]);
          return { status, ...(r?.description ? { description: r.description } : {}), content: contentMap(spec, r?.content), headers: r?.headers ?? {} };
        }),
        security: op.security ?? globalSecurity,
      });
    }
  }
  const tagOrder: string[] = (spec.tags ?? []).map((t: Json) => t.name);
  const tagNames = [...new Set([...tagOrder, ...ops.flatMap((o) => o.tags)])];
  // Each operation is listed once, under its first tag: GET /v1/customers/{id}/cards tagged
  // [customers, cards] no longer repeats in a one-row "cards" group (V-01 round 3).
  const tags = tagNames.map((name) => {
    const def = spec.tags?.find((t: Json) => t.name === name);
    const shown = typeof def?.['x-displayName'] === 'string' && def['x-displayName'].trim() ? def['x-displayName'].trim() : name.charAt(0).toUpperCase() + name.slice(1);
    return { name, title: shown, ...(def?.description ? { description: def.description } : {}), ops: ops.filter((o) => o.tags[0] === name) };
  }).filter((t) => t.ops.length);

  // "Used in": which operations reference each component schema, directly or through other schemas.
  const schemaDefs = spec.components?.schemas ?? {};
  const refsOf = (node: Json, out = new Set<string>(), seen = new Set<Json>()): Set<string> => {
    if (!node || typeof node !== 'object' || seen.has(node)) return out;
    seen.add(node);
    const n = refName(node);
    if (n && !out.has(n)) { out.add(n); refsOf(schemaDefs[n], out, seen); }
    for (const v of Object.values(node)) refsOf(v, out, seen);
    return out;
  };
  const usedIn = new Map<string, Set<string>>();
  for (const o of ops) {
    const raw = rawOps.get(o.key);
    for (const n of refsOf({ p: raw.parameters, b: raw.requestBody, r: raw.responses, s: deref(spec, spec.paths[o.path]).parameters })) {
      (usedIn.get(n) ?? usedIn.set(n, new Set()).get(n)!).add(o.key);
    }
  }
  const schemas = Object.keys(schemaDefs).sort().map((name) => ({ name, slug: slugify(name), schema: schemaDefs[name], usedIn: [...(usedIn.get(name) ?? [])].sort() }));

  return {
    title: spec.info?.title ?? 'API', version: spec.info?.version ?? '', ...(spec.info?.description ? { description: spec.info.description } : {}),
    servers: (spec.servers ?? []).map((s: Json) => ({ url: s.url, ...(s.description ? { description: s.description } : {}) })),
    securitySchemes: spec.components?.securitySchemes ?? {},
    tags, ops, schemas,
  };
}

export interface SearchHit { kind: 'operation' | 'schema' | 'field' | 'parameter' | 'response'; label: string; detail: string; target: string }

/** Search across endpoints, fields, parameters, response codes and descriptions (VW-04). */
export function search(model: Model, spec: Json, query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const has = (s?: string) => !!s && s.toLowerCase().includes(q);
  for (const o of model.ops) {
    if (has(o.key) || has(o.summary) || has(o.operationId) || has(o.description)) hits.push({ kind: 'operation', label: o.key, detail: o.summary ?? o.operationId ?? '', target: `op/${o.slug}` });
    for (const p of o.params) if (has(p.name) || has(p.description)) hits.push({ kind: 'parameter', label: p.name, detail: `${p.in} parameter · ${o.key}`, target: `op/${o.slug}` });
    for (const r of o.responses) if (q === r.status || has(r.description)) hits.push({ kind: 'response', label: r.status, detail: `${r.description ?? 'Response'} · ${o.key}`, target: `op/${o.slug}` });
  }
  for (const s of model.schemas) {
    if (has(s.name) || has(deref(spec, s.schema)?.description)) hits.push({ kind: 'schema', label: s.name, detail: `Schema · used in ${s.usedIn.length}`, target: `schema/${s.slug}` });
    const props = deref(spec, s.schema)?.properties ?? {};
    for (const [name, def] of Object.entries<Json>(props)) if (has(name) || has(deref(spec, def)?.description)) hits.push({ kind: 'field', label: `${s.name}.${name}`, detail: deref(spec, def)?.description ?? typeLabel(spec, def), target: `schema/${s.slug}` });
  }
  const rank = (h: SearchHit) => (h.label.toLowerCase() === q ? 0 : h.label.toLowerCase().startsWith(q) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, limit);
}

export function typeLabel(spec: Json, node: Json): string {
  const name = refName(node);
  if (name) return name;
  const s = deref(spec, node) ?? {};
  const t = Array.isArray(s.type) ? s.type.filter((x: string) => x !== 'null').join(' | ') + (s.type.includes('null') ? ' | null' : '') : s.type;
  if (t === 'array') return `${typeLabel(spec, s.items)}[]`;
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map((x: Json) => typeLabel(spec, x)).join(' | ');
  if (s.allOf) return s.allOf.map((x: Json) => typeLabel(spec, x)).join(' & ');
  return (t ?? (s.properties ? 'object' : 'any')) + (s.format ? ` (${s.format})` : '') + (s.nullable ? ' | null' : '');
}
