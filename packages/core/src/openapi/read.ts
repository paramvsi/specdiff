// M-21: the one way a spec file becomes an object, shared by the app, the Viewer hosts (embed,
// React, Express/Fastify, the Spring Boot starter) and the CLI. Only yaml is imported, so the
// embed can take it without the comparison engine.
import { parseDocument } from './parse';

/** Parse a spec as core does when comparing (JSON or YAML, merge keys, duplicate keys rejected). Throws `name:line:col message`. */
export function readSpec(text: string, name = 'input'): object {
  const doc = parseDocument(text, name);
  const e = doc.errors[0];
  if (e) throw new Error(`${name}:${e.line}:${e.column} ${e.message}${e.hint ? `. ${e.hint}` : ''}`);
  if (!doc.value || typeof doc.value !== 'object' || Array.isArray(doc.value)) throw new Error(`${name} does not contain an object.`);
  return doc.value as object;
}
