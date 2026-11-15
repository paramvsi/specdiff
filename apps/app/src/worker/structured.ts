import type { Config, Mode } from '@specdiff/core';
import type { Detected } from '@specdiff/core/detect';
import { diffText } from '@specdiff/core/text';
import type { CompareRequest, CompareResult, Progress } from './protocol';

// Replaced in P1.4 integration (OpenAPI) and P2.1 (JSON/YAML).
export async function compareStructured(mode: Mode, req: CompareRequest, config: Config, pair: Detected, onProgress: (p: Progress) => void): Promise<CompareResult> {
  void pair;
  onProgress({ step: 'compare', state: 'running' });
  const text = diffText(req.before.content, req.after.content, config.text);
  onProgress({ step: 'compare', state: 'done' });
  return { mode: mode === 'openapi' ? 'yaml' : (mode as 'json'), detected: mode, text };
}
