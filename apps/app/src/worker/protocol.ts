import type { Change, ConfigInput, Mode, Report } from '@specdiff/core';
import type { CodeOutcome } from '@specdiff/core/code';
import type { JsonDiff } from '@specdiff/core/json';
import type { MdDiff } from '@specdiff/core/markdown';
import type { TextDiff } from '@specdiff/core/text';
import type { Source } from '../lib/input';

export type Step = 'detect' | 'parse' | 'resolve' | 'normalise' | 'compare';
export type StepState = 'pending' | 'running' | 'done';
export interface Progress {
  step: Step;
  state: StepState;
  detail?: string;
  side?: 'before' | 'after';
}

export interface CompareRequest {
  before: Source;
  after: Source;
  mode: Mode | 'auto';
  config: ConfigInput;
}

export interface ParseFailure {
  kind: 'parse';
  side: 'before' | 'after';
  line: number;
  column: number;
  message: string;
  hint: string;
  excerpt: string[];
}

export interface JsonResultData {
  diff: JsonDiff;
  changes: Change[];
  duplicates: {
    before: Array<{ path: string; key: string; line: number }>;
    after: Array<{ path: string; key: string; line: number }>;
  };
  /** Both documents, for tree and side-by-side views and the patch exports. */
  before: unknown;
  after: unknown;
}

export type CompareResult =
  | {
      mode: 'text' | 'code' | 'markdown' | 'json' | 'yaml';
      detected: Mode;
      text: TextDiff;
      language?: string;
    }
  | { mode: 'json' | 'yaml'; detected: Mode; json: JsonResultData; text: TextDiff }
  | { mode: 'markdown'; detected: Mode; markdown: MdDiff; text: TextDiff }
  | { mode: 'code'; detected: Mode; code: CodeOutcome; language?: string; text: TextDiff }
  | { mode: 'openapi'; detected: Mode; report: Report; text: TextDiff }
  | ParseFailure;
