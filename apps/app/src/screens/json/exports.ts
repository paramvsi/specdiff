// JS-08 exports: JSON Patch (RFC 6902), Merge Patch (RFC 7386), JSONPath list, Markdown.
// Patches are verified by applying them to the before document (round trip).
import {
  applyMergePatch,
  jsonMarkdown,
  jsonPatch,
  jsonPathList,
  mergePatch,
  stable,
  type PatchOp,
} from '@specdiff/core/json';
import type { JsonResultData } from '../../worker/protocol';

export type JsonExportKind = 'patch' | 'merge' | 'paths' | 'markdown';

export interface ExportFile {
  name: string;
  content: string;
  type: string;
  /** e.g. "7 operations". */
  meta: string;
  /** Round-trip result for patches; undefined for lists. */
  verified?: boolean;
  /** Merge Patch can't express a null value (null deletes). */
  lossy?: boolean;
}

export const JSON_EXPORTS: ReadonlyArray<{ value: JsonExportKind; title: string; description: string }> = [
  {
    value: 'patch',
    title: 'JSON Patch',
    description: 'RFC 6902. Operations an API can apply with application/json-patch+json.',
  },
  {
    value: 'merge',
    title: 'Merge Patch',
    description: 'RFC 7386. A partial document; null deletes a key. Can’t remove one array item.',
  },
  { value: 'paths', title: 'JSONPath list', description: 'One line per change, for tickets and reviews.' },
  { value: 'markdown', title: 'Markdown', description: 'A table of every change.' },
];

const base = (name: string) => name.replace(/\s*\(.*\)$/, '').replace(/\.(json|ya?ml)$/i, '') || 'comparison';
const unptr = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** Apply an RFC 6902 patch (add/remove/replace only — what jsonPatch emits). Returns a new value. */
export function applyJsonPatch(doc: unknown, ops: PatchOp[]): unknown {
  let root: unknown = structuredClone(doc);
  for (const op of ops) {
    const parts = op.path.split('/').slice(1).map(unptr);
    if (!parts.length) {
      root = op.op === 'remove' ? undefined : structuredClone(op.value);
      continue;
    }
    let parent = root as Record<string, unknown> | unknown[];
    for (const p of parts.slice(0, -1)) parent = (parent as Record<string, unknown>)[p] as typeof parent;
    const last = parts[parts.length - 1]!;
    if (Array.isArray(parent)) {
      const i = last === '-' ? parent.length : Number(last);
      if (op.op === 'add') parent.splice(i, 0, structuredClone(op.value));
      else if (op.op === 'remove') parent.splice(i, 1);
      else parent[i] = structuredClone(op.value);
    } else if (op.op === 'remove') delete parent[last];
    else parent[last] = structuredClone(op.value);
  }
  return root;
}

export function jsonExport(
  kind: JsonExportKind,
  data: JsonResultData,
  names: { before: string; after: string },
): ExportFile {
  const stem = base(names.before);
  if (kind === 'patch') {
    const ops = jsonPatch(data.before, data.after);
    return {
      name: `${stem}.patch.json`,
      content: JSON.stringify(ops, null, 2) + '\n',
      type: 'application/json-patch+json',
      meta: `${ops.length} operation${ops.length === 1 ? '' : 's'}`,
      verified: stable(applyJsonPatch(data.before, ops)) === stable(data.after),
    };
  }
  if (kind === 'merge') {
    const { patch, lossy } = mergePatch(data.before, data.after);
    return {
      name: `${stem}.merge-patch.json`,
      content: JSON.stringify(patch, null, 2) + '\n',
      type: 'application/merge-patch+json',
      meta: lossy ? 'lossy' : 'partial document',
      verified: stable(applyMergePatch(data.before, patch)) === stable(data.after),
      lossy,
    };
  }
  if (kind === 'paths') {
    const n = data.diff.changes.length;
    return {
      name: `${stem}.jsonpaths.txt`,
      content: jsonPathList(data.diff),
      type: 'text/plain',
      meta: `${n} path${n === 1 ? '' : 's'}`,
    };
  }
  return {
    name: `${stem}.changes.md`,
    content: jsonMarkdown(data.diff, names),
    type: 'text/markdown',
    meta: `${data.diff.changes.length} changes`,
  };
}
