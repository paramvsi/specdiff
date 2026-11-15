// OpenAPI comparison in the worker (P1.4 engine from @specdiff/core).
import { compareOpenApi, OpenApiParseError, type Config } from '@specdiff/core';
import type { Detected } from '@specdiff/core/detect';
import type { TextDiff } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, Progress } from './protocol';
import { excerpt } from './structured';

export async function compareOpenApiInWorker(req: CompareRequest, config: Config, pair: Detected, onProgress: (p: Progress) => void, raw: () => TextDiff): Promise<CompareResult> {
  const files = (s: CompareRequest['before']) => (s.files ? { files: s.files } : {});
  onProgress({ step: 'parse', state: 'running', side: 'before' });
  try {
    // IN-08: core reports each real stage as it starts; mark the one before it done.
    const refFiles = Object.keys(req.after.files ?? {}).length;
    const resolveDetail = refFiles ? `${refFiles} files` : 'internal $refs';
    // Core parses (then normalises) Before first, then After; the stage callbacks come in that order.
    let parses = 0;
    let normalised = 0;
    const t0 = performance.now();
    const report = compareOpenApi(
      { name: req.before.name, content: req.before.content, ...files(req.before) },
      { name: req.after.name, content: req.after.content, ...files(req.after) },
      config,
      {
        onProgress: (step) => {
          if (step === 'parse') {
            const side = parses++ === 0 ? 'before' : 'after';
            onProgress({ step: 'parse', state: 'running', side });
          } else if (step === 'normalise') {
            // Normalising runs once per side, right after that side is parsed.
            if (normalised++ === 0) return;
            onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
            onProgress({ step: 'normalise', state: 'running', detail: config.openapi.autoUpgrade ? 'upgrading to 3.1' : 'as written' });
          } else if (step === 'resolve') {
            onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
            onProgress({ step: 'normalise', state: 'done', detail: config.openapi.autoUpgrade ? 'upgraded to 3.1' : 'as written' });
            onProgress({ step: 'resolve', state: 'running', detail: resolveDetail });
          } else {
            onProgress({ step: 'resolve', state: 'done', detail: resolveDetail });
            onProgress({ step: 'compare', state: 'running' });
          }
        },
      },
    );
    const ms = Math.round(performance.now() - t0);
    onProgress({ step: 'parse', state: 'done', detail: 'both files, positions kept' });
    onProgress({ step: 'normalise', state: 'done', detail: config.openapi.autoUpgrade ? 'upgraded to 3.1' : 'as written' });
    onProgress({ step: 'resolve', state: 'done', detail: resolveDetail });
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
