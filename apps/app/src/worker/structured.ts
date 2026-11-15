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
  // Raw line diff is always available for the "Raw diff" views.
  const raw = () =>
    diffText(req.before.content, req.after.content, {
      ...config.text,
      filters: [],
      transforms: [],
    });
  if (mode === 'openapi') return compareOpenApiInWorker(req, config, pair, onProgress, raw);

  onProgress({ step: 'parse', state: 'running', side: 'before' });
  const a = parseWithPositions(req.before.content);
  if ('error' in a) return fail('before', a.error, req.before.content);
  onProgress({ step: 'parse', state: 'running', side: 'after' });
  const b = parseWithPositions(req.after.content);
  if ('error' in b) return fail('after', b.error, req.after.content);
  onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
  onProgress({ step: 'compare', state: 'running' });
  const diff = diffJson(a.value, b.value, config.json);
  const changes = toChanges(
    diff,
    a,
    b,
    { before: req.before.name, after: req.after.name },
    mode === 'json' ? 'json' : 'yaml',
  );
  onProgress({ step: 'compare', state: 'done', detail: `${changes.length} changes` });
  const strip = (d: typeof a.duplicates) => d.map(({ path, key, line }) => ({ path, key, line }));
  return {
    mode: mode === 'json' ? 'json' : 'yaml',
    detected: pair.mode,
    text: raw(),
    json: {
      diff,
      changes,
      duplicates: { before: strip(a.duplicates), after: strip(b.duplicates) },
      before: a.value,
      after: b.value,
    },
  };
}

function fail(
  side: 'before' | 'after',
  e: { line: number; column: number; message: string; hint: string },
  content: string,
): ParseFailure {
  return { kind: 'parse', side, ...e, excerpt: excerpt(content, e.line) };
}
