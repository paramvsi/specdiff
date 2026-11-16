import type { Config, Mode } from '@specdiff/core';
import type { Detected } from '@specdiff/core/detect';
import { diffJson, parseWithPositions, toChanges } from '@specdiff/core/json';
import { diffText } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, ParseFailure, Progress } from './protocol';
import { compareOpenApiInWorker } from './openapi';

export function excerpt(content: string, line: number): string[] {
  const lines = content.split('\n');
  return lines.slice(Math.max(0, line - 3), line + 2);
}

export async function compareStructured(
  mode: Mode,
  req: CompareRequest,
  config: Config,
  pair: Detected,
  onProgress: (p: Progress) => void,
): Promise<CompareResult> {
  // Raw line diff for the "Raw" views. X-02: a minified document is one huge line, and a line diff of
  // two of those is a word diff of everything (88 s for a 277 KB pair). Such documents are pretty-printed
  // first, so the diff is line by line and core's approximate fallback can kick in on big rewrites.
  const raw = (values?: { before: unknown; after: unknown }) => {
    const minified = isMinified(req.before.content) || isMinified(req.after.content);
    const side = (content: string, value: unknown) =>
      minified ? (prettyJson(value, content) ?? content) : content;
    return diffText(side(req.before.content, values?.before), side(req.after.content, values?.after), {
      ...config.text,
      unicodeNormalize: config.unicodeNormalize,
      filters: [],
      transforms: [],
    });
  };
  if (mode === 'openapi') return compareOpenApiInWorker(req, config, pair, onProgress, raw);

  onProgress({ step: 'parse', state: 'running', side: 'before' });
  const a = parseWithPositions(req.before.content);
  if ('error' in a) return fail('before', a.error, req.before.content);
  onProgress({ step: 'parse', state: 'running', side: 'after' });
  const b = parseWithPositions(req.after.content);
  if ('error' in b) return fail('after', b.error, req.after.content);
  onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
  onProgress({ step: 'compare', state: 'running' });
  const diff = diffJson(a.value, b.value, { ...config.json, unicodeNormalize: config.unicodeNormalize }, { before: a.exactNumbers, after: b.exactNumbers });
  const changes = toChanges(
    diff,
    a,
    b,
    { before: req.before.name, after: req.after.name },
    mode === 'json' ? 'json' : 'yaml',
  );
  onProgress({ step: 'compare', state: 'done', detail: `${changes.length} change${changes.length === 1 ? '' : 's'}` });
  const strip = (d: typeof a.duplicates) => d.map(({ path, key, line }) => ({ path, key, line }));
  return {
    mode: mode === 'json' ? 'json' : 'yaml',
    detected: pair.mode,
    text: raw({ before: a.value, after: b.value }),
    json: {
      diff,
      changes,
      duplicates: { before: strip(a.duplicates), after: strip(b.duplicates) },
      before: a.value,
      after: b.value,
    },
  };
}

/** A line this long only comes from a minified (or generated) document. */
const LONG_LINE = 2000;
export function isMinified(content: string): boolean {
  let start = 0;
  while (start < content.length) {
    const end = content.indexOf('\n', start);
    const stop = end === -1 ? content.length : end;
    if (stop - start > LONG_LINE) return true;
    start = stop + 1;
  }
  return false;
}

/** The document pretty-printed as JSON (two-space indent), from its parsed value or by parsing it as JSON. */
function prettyJson(value: unknown, content: string): string | undefined {
  let v = value;
  if (v === undefined) {
    try {
      v = JSON.parse(content);
    } catch {
      return undefined;
    }
  }
  return JSON.stringify(v, null, 2) + '\n';
}

function fail(
  side: 'before' | 'after',
  e: { line: number; column: number; message: string; hint: string },
  content: string,
): ParseFailure {
  return { kind: 'parse', side, ...e, excerpt: excerpt(content, e.line) };
}
