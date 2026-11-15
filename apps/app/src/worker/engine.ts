// Runs inside the worker (and directly in unit tests). Pure function of the request.
import { Config, type Mode } from '@specdiff/core';
import { detectMode, detectPair } from '@specdiff/core/detect';
import { diffText } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, Progress } from './protocol';
import { compareStructured } from './structured';

export async function runCompare(req: CompareRequest, onProgress: (p: Progress) => void = () => {}): Promise<CompareResult> {
  const config = Config.parse(req.config);
  onProgress({ step: 'detect', state: 'running' });
  const a = detectMode(req.before.name, req.before.content);
  const b = detectMode(req.after.name, req.after.content);
  const pair = detectPair(a, b);
  const mode: Mode = req.mode === 'auto' ? pair.mode : req.mode;
  onProgress({ step: 'detect', state: 'done', detail: describe(mode, pair.specVersion, req.before.name) });

  if (mode === 'openapi' || mode === 'json' || mode === 'yaml') {
    return compareStructured(mode, req, config, pair, onProgress);
  }
  // Text, Markdown and Code fall back to the text engine until their engines land (P2, P3).
  onProgress({ step: 'parse', state: 'done' });
  onProgress({ step: 'compare', state: 'running' });
  const text = diffText(req.before.content, req.after.content, config.text);
  onProgress({ step: 'compare', state: 'done' });
  return { mode: mode as 'text', detected: pair.mode, text, ...(pair.language ? { language: pair.language } : {}) };
}

function describe(mode: Mode, specVersion: string | undefined, name: string): string {
  const fmt = /\.json$/i.test(name) ? 'JSON' : 'YAML';
  if (mode === 'openapi') return `${specVersion?.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${specVersion?.split('.').slice(0, 2).join('.') ?? ''} · ${fmt}`;
  return { json: 'JSON', yaml: 'YAML', markdown: 'Markdown', code: 'Code', text: 'Plain text' }[mode];
}
