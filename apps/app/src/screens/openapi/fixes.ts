// O-04 "How to avoid it": one or two YAML snippets per rule family, built from the change and the new spec.
import type { Change } from '@specdiff/core';
import { stringify } from 'yaml';
import { resolveJsonPath } from './util';

export interface FixOption { title: string; code: string }

const yaml = (v: unknown) => stringify(v, { lineWidth: 0 }).trimEnd();
const lastSeg = (c: Change) => c.path.split(' › ').at(-1)!.replace(/^(query|header|path|cookie) /, '');
const param = (c: Change) => {
  const seg = c.path.split(' › ').find((s) => /^(query|header|path|cookie) /.test(s));
  return seg ? { in: seg.split(' ')[0]!, name: seg.slice(seg.indexOf(' ') + 1) } : undefined;
};
/** The JSONPath of the schema that holds a `required` list entry: …schema.required[1] → …schema. */
const parentOf = (jp: string | undefined, tail: RegExp) => jp?.replace(tail, '');

function defaultFor(schema: Record<string, unknown> | undefined): unknown {
  if (!schema) return 'value';
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  switch (schema.type) {
    case 'integer': case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'string': return /currency/i.test(String(schema.description ?? '')) ? 'USD' : '';
    default: return null;
  }
}

/** "Ship it in 2.0.0 and say so": the major version, when the comparison suggests one. */
function majorOption(version: string | undefined): FixOption | null {
  if (!version) return null;
  return { title: `ship it in ${version} and say so`, code: yaml({ info: { version } }) };
}

/** 1–2 fix options for a breaking or possibly-breaking change. `spec` is the new (after) document. */
export function fixOptions(c: Change, spec: unknown, suggested?: string): FixOption[] {
  const out: Array<FixOption | null> = [];
  const id = c.ruleId ?? '';
  const sixMonths = new Date(Date.now() + 182 * 864e5).toISOString().slice(0, 10);

  if (id === 'request-property-became-required' || id === 'request-property-added-required') {
    const obj = resolveJsonPath(spec, parentOf(c.jsonPath, /\.required\[\d+\]$|\.properties\.[^.]+$|\.properties\['[^']+'\]$/)) as { required?: string[]; properties?: Record<string, Record<string, unknown>> } | undefined;
    const name = lastSeg(c);
    const prop = obj?.properties?.[name];
    const rest = (obj?.required ?? []).filter((r) => r !== name);
    const keep = { ...(prop ? { type: prop.type ?? 'string' } : { type: 'string' }), default: defaultFor(prop) };
    out.push({ title: 'keep it optional, with a default', code: `${yaml({ [name]: keep })}\nrequired: [${rest.join(', ')}]` });
  } else if (id.startsWith('request-param-constraint-tightened') || id === 'request-property-constraint-tightened') {
    const p = param(c);
    const bound = c.before && typeof c.before === 'object' ? (c.before as Record<string, unknown>) : undefined;
    out.push({ title: 'keep the old bound', code: p ? yaml([{ name: p.name, in: p.in, schema: { ...bound } }]) : yaml({ [lastSeg(c)]: { ...bound } }) });
  } else if (id === 'request-param-became-required' || id === 'request-param-added-required') {
    const p = param(c);
    out.push({ title: 'keep it optional, with a default', code: yaml([{ name: p?.name ?? lastSeg(c), in: p?.in ?? 'query', required: false, schema: { default: 'value' } }]) });
  } else if (id === 'response-property-removed' || id === 'response-property-became-optional' || id === 'response-required-became-write-only') {
    const name = lastSeg(c);
    const old = c.before && typeof c.before === 'object' ? (c.before as Record<string, unknown>) : { type: 'string' };
    out.push({ title: 'keep it, deprecated, for a release', code: yaml({ [name]: { ...old, deprecated: true } }) });
  } else if (id === 'endpoint-removed') {
    const op = c.operation;
    if (op) out.push({ title: 'deprecate it first, remove it later', code: yaml({ [op.path]: { [op.method.toLowerCase()]: { deprecated: true, 'x-sunset': sixMonths } } }) });
  } else if (id === 'response-property-enum-value-added') {
    const name = c.path.split(' › ').length > 1 ? lastSeg(c) : 'status';
    out.push({ title: 'tell clients to expect new values', code: yaml({ [name]: { description: 'New values may be added. Treat unknown values as a generic state.' } }) });
  } else if (id.startsWith('request-param-enum-value-removed') || id === 'request-property-enum-value-removed') {
    out.push({ title: 'keep accepting the old value', code: yaml({ enum: [c.before] }) });
  } else if (id === 'security-added-to-open-operation' || id === 'security-scheme-added-to-operation') {
    out.push({ title: 'keep anonymous access for a release', code: yaml({ security: [{}] }) });
  }
  if (c.severity === 'breaking' || c.severity === 'possibly') out.push(majorOption(suggested));
  return out.filter((x): x is FixOption => !!x).slice(0, 2);
}
