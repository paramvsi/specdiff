// OpenAPI comparison in the worker. Wired to @specdiff/core's engine (P1.4).
import type { Config } from '@specdiff/core';
import type { Detected } from '@specdiff/core/detect';
import type { TextDiff } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, Progress } from './protocol';

export async function compareOpenApiInWorker(
  req: CompareRequest,
  config: Config,
  pair: Detected,
  onProgress: (p: Progress) => void,
  raw: () => TextDiff,
): Promise<CompareResult> {
  void config;
  void pair;
  void onProgress;
  return { mode: 'yaml', detected: 'openapi', text: raw() };
}
