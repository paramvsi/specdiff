// OpenAPI comparison in the worker (P1.4 engine from @specdiff/core).
import { compareOpenApi, OpenApiParseError, type Config } from '@specdiff/core';
import type { Detected } from '@specdiff/core/detect';
import type { TextDiff } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, Progress } from './protocol';
import { excerpt } from './structured';

export async function compareOpenApiInWorker(req: CompareRequest, config: Config, pair: Detected, onProgress: (p: Progress) => void, raw: () => TextDiff): Promise<CompareResult> {
  const files = (s: CompareRequest['before']) => (s.files ? { files: s.files } : {});
  onProgress({ step: 'parse', state: 'running' });
  onProgress({ step: 'resolve', state: 'pending' });
  try {
    // The engine parses, resolves, normalises and compares in one pass; report its steps around it.
    const t0 = performance.now();
    const report = compareOpenApi({ name: req.before.name, content: req.before.content, ...files(req.before) }, { name: req.after.name, content: req.after.content, ...files(req.after) }, config);
    const ms = Math.round(performance.now() - t0);
    onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
    const refFiles = Object.keys(req.after.files ?? {}).length;
    onProgress({ step: 'resolve', state: 'done', detail: refFiles ? `${refFiles} files` : 'internal $refs' });
    onProgress({ step: 'normalise', state: 'done', detail: config.openapi.autoUpgrade ? 'upgraded to 3.1' : 'as written' });
    onProgress({ step: 'compare', state: 'done', detail: `${report.summary.total} changes · ${ms} ms` });
    return { mode: 'openapi', detected: pair.mode, report, text: raw() };
  } catch (e) {
    if (e instanceof OpenApiParseError) {
      const side = e.file === req.before.name ? 'before' : 'after';
      const first = e.errors[0];
      const content = side === 'before' ? req.before.content : req.after.content;
      return { kind: 'parse', side, line: first?.line ?? 1, column: first?.column ?? 1, message: first?.message ?? e.message, hint: first?.hint ?? 'Fix the syntax and compare again.', excerpt: excerpt(content, first?.line ?? 1) };
    }
    throw e;
  }
}
