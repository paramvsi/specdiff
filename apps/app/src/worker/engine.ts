// Runs inside the worker (and directly in unit tests). Pure function of the request.
import { Config, type Mode } from '@specdiff/core';
import { detectMode, detectPair } from '@specdiff/core/detect';
import { diffMarkdown } from '@specdiff/core/markdown';
import { diffText, type TextDiff } from '@specdiff/core/text';
import { layoutPatch } from '@specdiff/core/text/patch';
import type { CompareRequest, CompareResult, Progress } from './protocol';
import { compareCode } from './code';
import { compareStructured } from './structured';

export async function runCompare(
  req: CompareRequest,
  onProgress: (p: Progress) => void = () => {},
): Promise<CompareResult> {
  const config = Config.parse(req.config);
  onProgress({ step: 'detect', state: 'running' });
  const a = detectMode(req.before.name, req.before.content);
  const b = detectMode(req.after.name, req.after.content);
  const pair = detectPair(a, b);
  const mode: Mode = req.mode === 'auto' ? pair.mode : req.mode;
  onProgress({
    step: 'detect',
    state: 'done',
    detail: describe(mode, pair.specVersion, req.before.name),
  });

  if (mode === 'openapi' || mode === 'json' || mode === 'yaml') {
    return compareStructured(mode, req, config, pair, onProgress);
  }
  if (mode === 'markdown') {
    onProgress({ step: 'parse', state: 'done', detail: 'GitHub-flavoured Markdown' });
    onProgress({ step: 'compare', state: 'running' });
    const markdown = diffMarkdown(req.before.content, req.after.content);
    const text = diffText(req.before.content, req.after.content, config.text);
    onProgress({ step: 'compare', state: 'done' });
    return { mode: 'markdown', detected: pair.mode, markdown, text };
  }
  if (mode === 'code') {
    onProgress({ step: 'parse', state: 'running', detail: 'loading the grammar' });
    const code = await compareCode(req.before.name, req.after.name, req.before.content, req.after.content);
    // A-09: the badge and the fallback notice name the language ("Code: Java", "Go is on the list").
    const id = code.language ?? pair.language ?? a.language ?? b.language;
    const language = id ? (LANGUAGE_NAMES[id] ?? id[0]!.toUpperCase() + id.slice(1)) : undefined;
    onProgress({ step: 'parse', state: 'done', ...(language ? { detail: language } : {}) });
    const text = diffText(req.before.content, req.after.content, config.text);
    onProgress({ step: 'compare', state: 'done' });
    return { mode: 'code', detected: pair.mode, code: code.outcome, text, ...(language ? { language } : {}) };
  }
  onProgress({ step: 'parse', state: 'done' });
  onProgress({ step: 'compare', state: 'running' });
  // TX-11: text mode detects moved blocks; TX-12: a side rebuilt from a patch gets its real line numbers back.
  const diff = diffText(req.before.content, req.after.content, config.text, { moves: true });
  const text =
    req.before.patch && req.after.patch ? layoutPatch(diff, req.before.patch, req.after.patch) : diff;
  onProgress({ step: 'compare', state: 'done' });
  return {
    mode: mode as 'text',
    detected: pair.mode,
    text,
    ...(pair.language ? { language: pair.language } : {}),
  };
}

/** Display names for code languages (core ids are lower case). */
export const LANGUAGE_NAMES: Record<string, string> = {
  typescript: 'TypeScript', tsx: 'TypeScript', javascript: 'JavaScript', java: 'Java', python: 'Python',
  go: 'Go', ruby: 'Ruby', rust: 'Rust', kotlin: 'Kotlin', csharp: 'C#', c: 'C', cpp: 'C++', swift: 'Swift',
  php: 'PHP', shell: 'Shell', sql: 'SQL', css: 'CSS', html: 'HTML',
};

/** X-02: a plain line diff off the main thread (the JSON side-by-side view of two canonical documents). */
export function runTextDiff(before: string, after: string): TextDiff['rows'] {
  return diffText(before, after, Config.parse({}).text).rows;
}

function describe(mode: Mode, specVersion: string | undefined, name: string): string {
  const fmt = /\.json$/i.test(name) ? 'JSON' : 'YAML';
  if (mode === 'openapi')
    return `${specVersion?.startsWith('2') ? 'Swagger' : 'OpenAPI'} ${specVersion?.split('.').slice(0, 2).join('.') ?? ''} · ${fmt}`;
  return { json: 'JSON', yaml: 'YAML', markdown: 'Markdown', code: 'Code', text: 'Plain text' }[
    mode
  ];
}
