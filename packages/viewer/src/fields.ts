// Field lists and constraint text for parameters, bodies and schemas (VW-02, VW-03), plus
// the "Copy for LLM" Markdown of each page (VW-14).
import type { Change } from '@specdiff/core';
import { changeTitle } from './change-index';
import { deref, typeLabel, type Json, type Model, type Op, type SchemaEntry } from './model';

export interface Field {
  name: string;
  schema: Json;
  required: boolean;
  description?: string | undefined;
  deprecated: boolean;
}

/** Top-level fields of an object schema, following `$ref` and merging `allOf`. */
export function fieldsOf(spec: Json, node: Json, seen = new Set<Json>()): Field[] {
  const s = deref(spec, node);
  if (!s || typeof s !== 'object' || seen.has(s)) return [];
  seen.add(s);
  const out = new Map<string, Field>();
  for (const part of s.allOf ?? []) for (const f of fieldsOf(spec, part, seen)) out.set(f.name, f);
  const req = new Set<string>(s.required ?? []);
  for (const [name, def] of Object.entries<Json>(s.properties ?? {})) {
    const d = deref(spec, def) ?? {};
    out.set(name, { name, schema: def, required: req.has(name) || !!out.get(name)?.required, description: d.description, deprecated: !!d.deprecated });
  }
  for (const r of req) { const f = out.get(r); if (f) f.required = true; }
  return [...out.values()];
}

/** "Pattern ^[A-Z]{3}$ · Minimum 1 · Maximum 50" pieces. Code values are marked with `code`. */
export function constraints(spec: Json, node: Json): Array<{ label: string; value: string; code?: boolean }> {
  const s = deref(spec, node) ?? {};
  const out: Array<{ label: string; value: string; code?: boolean }> = [];
  if (s.pattern) out.push({ label: 'Pattern', value: String(s.pattern), code: true });
  if (s.minimum !== undefined) out.push({ label: 'Minimum', value: String(s.minimum) });
  if (s.maximum !== undefined) out.push({ label: 'Maximum', value: String(s.maximum) });
  if (s.minLength !== undefined) out.push({ label: 'Min length', value: String(s.minLength) });
  if (s.maxLength !== undefined) out.push({ label: 'Max length', value: String(s.maxLength) });
  if (s.minItems !== undefined) out.push({ label: 'Min items', value: String(s.minItems) });
  if (s.maxItems !== undefined) out.push({ label: 'Max items', value: String(s.maxItems) });
  if (s.default !== undefined) out.push({ label: 'Default', value: JSON.stringify(s.default), code: true });
  return out;
}

export const enumOf = (spec: Json, node: Json): string[] | undefined => {
  const e = deref(spec, node)?.enum;
  return Array.isArray(e) ? e.map((v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))) : undefined;
};

export function mediaOf(content: Record<string, { schema?: Json; example?: Json }>): [string, { schema?: Json; example?: Json }] | undefined {
  return Object.entries(content).find(([t]) => t.includes('json')) ?? Object.entries(content)[0];
}

export const PARAM_SECTIONS = [
  ['path', 'Path parameters'],
  ['query', 'Query parameters'],
  ['header', 'Headers'],
  ['cookie', 'Cookies'],
] as const;

// ---- Copy for LLM (VW-14) ---------------------------------------------------------------------

const line = (f: { name: string; required: boolean; description?: string | undefined }, type: string) =>
  `- \`${f.name}\` (${type}, ${f.required ? 'required' : 'optional'})${f.description ? `: ${f.description}` : ''}`;

export function overviewMarkdown(m: Model, version: string): string {
  const out = [`# ${m.title} ${version}`, '', ...(m.description ? [m.description, ''] : [])];
  if (m.servers.length) out.push('## Servers', '', ...m.servers.map((s) => `- ${s.url}${s.description ? ` (${s.description})` : ''}`), '');
  for (const t of m.tags) {
    out.push(`## ${t.name}`, '', ...t.ops.map((o) => `- \`${o.key}\`${o.summary ? `: ${o.summary}` : ''}${o.deprecated ? ' (deprecated)' : ''}`), '');
  }
  return out.join('\n').trim() + '\n';
}

export function opMarkdown(spec: Json, m: Model, op: Op, changes: Change[]): string {
  const out = [`# ${op.key}`, '', `API: ${m.title} ${m.version}`, ''];
  if (op.summary) out.push(`**${op.summary}**`, '');
  if (op.description) out.push(op.description, '');
  if (op.deprecated) out.push(`Deprecated${op.sunset ? `; stops working on ${op.sunset}` : ''}.`, '');
  for (const [where, title] of PARAM_SECTIONS) {
    const ps = op.params.filter((p) => p.in === where);
    if (ps.length) out.push(`## ${title}`, '', ...ps.map((p) => line(p, typeLabel(spec, p.schema))), '');
  }
  const body = op.requestBody && mediaOf(op.requestBody.content);
  if (body) {
    out.push(`## Request body (${body[0]})`, '', ...fieldsOf(spec, body[1].schema).map((f) => line(f, typeLabel(spec, f.schema))), '');
  }
  if (op.responses.length) out.push('## Responses', '', ...op.responses.map((r) => `- ${r.status}${r.description ? `: ${r.description}` : ''}`), '');
  if (changes.length) out.push('## Changes', '', ...changes.map((c) => `- ${c.severity ?? 'change'}: ${changeTitle(c)}`), '');
  return out.join('\n').trim() + '\n';
}

export function schemaMarkdown(spec: Json, s: SchemaEntry): string {
  const d = deref(spec, s.schema) ?? {};
  const out = [`# Schema ${s.name}`, '', ...(d.description ? [d.description, ''] : []), '## Fields', ''];
  out.push(...fieldsOf(spec, s.schema).map((f) => line(f, typeLabel(spec, f.schema))), '');
  if (s.usedIn.length) out.push('## Used in', '', ...s.usedIn.map((u) => `- \`${u}\``), '');
  return out.join('\n').trim() + '\n';
}

export function changesMarkdown(from: string, to: string, changes: Change[]): string {
  return [`# Changes from ${from} to ${to}`, '', ...changes.map((c) => `- ${c.severity ?? 'change'}: ${changeTitle(c)}${c.explanation?.who ? ` (affects: ${c.explanation.who})` : ''}`)].join('\n') + '\n';
}

export function schemeSummary(s: Record<string, unknown>): string {
  const t = s.type;
  if (t === 'http') return s.scheme === 'bearer' ? 'Bearer token' : s.scheme === 'basic' ? 'Basic auth' : `HTTP ${String(s.scheme ?? '')}`;
  if (t === 'apiKey') return `API key (${String(s.in)} ${String(s.name)})`;
  if (t === 'oauth2') return 'OAuth2';
  if (t === 'openIdConnect') return 'OpenID Connect';
  return String(t ?? 'Custom');
}

export function authMarkdown(m: Model): string {
  const s = Object.entries(m.securitySchemes);
  const out = [`# Authentication`, '', `API: ${m.title} ${m.version}`, ''];
  if (!s.length) out.push('This API does not declare any authentication.');
  for (const [name, x] of s) out.push(`- \`${name}\`: ${schemeSummary(x)}${x.description ? ` (${String(x.description)})` : ''}`);
  return out.join('\n').trim() + '\n';
}
