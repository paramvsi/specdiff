import type { ConfigInput, Mode, Report } from '@specdiff/core';
import type { TextDiff } from '@specdiff/core/text';
import type { Source } from '../lib/input';

export type Step = 'detect' | 'parse' | 'resolve' | 'normalise' | 'compare';
export type StepState = 'pending' | 'running' | 'done';
export interface Progress { step: Step; state: StepState; detail?: string; side?: 'before' | 'after' }

export interface CompareRequest { before: Source; after: Source; mode: Mode | 'auto'; config: ConfigInput }

export interface ParseFailure { kind: 'parse'; side: 'before' | 'after'; line: number; column: number; message: string; hint: string; excerpt: string[] }

export type CompareResult =
  | { mode: 'text' | 'code' | 'markdown' | 'json' | 'yaml'; detected: Mode; text: TextDiff; language?: string }
  | { mode: 'openapi'; detected: Mode; report: Report }
  | ParseFailure;
