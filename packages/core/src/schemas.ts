// Data formats from docs/07. Zod schemas are the source of truth; types are inferred.
import { z } from 'zod';

export const Severity = z.enum(['breaking', 'possibly', 'safe', 'docs']);
export type Severity = z.infer<typeof Severity>;
export const Kind = z.enum(['added', 'removed', 'changed', 'moved', 'typeChanged', 'renamed']);
export type Kind = z.infer<typeof Kind>;
export const Mode = z.enum(['openapi', 'json', 'yaml', 'markdown', 'code', 'text']);
export type Mode = z.infer<typeof Mode>;
export const Direction = z.enum(['request', 'response', 'both']);
export type Direction = z.infer<typeof Direction>;

export const SourcePos = z.object({ file: z.string(), line: z.number().int(), column: z.number().int() });
export type SourcePos = z.infer<typeof SourcePos>;

export const Change = z.object({
  id: z.string(),
  fingerprint: z.string(),
  mode: Mode,
  kind: Kind,
  path: z.string(),
  jsonPath: z.string().optional(),
  location: z.object({ before: SourcePos.optional(), after: SourcePos.optional() }),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  ruleId: z.string().optional(),
  severity: Severity.optional(),
  direction: Direction.optional(),
  operation: z.object({ method: z.string(), path: z.string(), operationId: z.string().optional(), tags: z.array(z.string()).optional() }).optional(),
  sharedSchema: z.object({ name: z.string(), usages: z.array(z.string()), usageCount: z.number().int() }).optional(),
  sourceBlock: z.string().optional(),
  explanation: z.object({ who: z.string(), see: z.string(), avoid: z.string() }).optional(),
  changelogLine: z.string().optional(),
  sdk: z.object({ call: z.string(), language: z.enum(['ts', 'python', 'java', 'go']) }).optional(),
});
export type Change = z.infer<typeof Change>;

export const InputMeta = z.object({
  name: z.string(),
  size: z.number().int(),
  format: z.enum(['yaml', 'json', 'markdown', 'text', 'code']),
  specVersion: z.string().optional(),
  infoVersion: z.string().optional(),
});
export type InputMeta = z.infer<typeof InputMeta>;

export const Summary = z.object({
  breaking: z.number().int(),
  possibly: z.number().int(),
  safe: z.number().int(),
  docs: z.number().int(),
  total: z.number().int(),
  byArea: z.record(z.string(), z.number().int()),
});
export type Summary = z.infer<typeof Summary>;

export const VersionCheck = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  suggested: z.string(),
  bump: z.enum(['major', 'minor', 'patch', 'none']),
  verdict: z.enum(['ok', 'missing-major', 'decreased', 'unparseable']),
  message: z.string(),
});
export type VersionCheck = z.infer<typeof VersionCheck>;

export const Report = z.object({
  version: z.literal(1),
  generator: z.object({ name: z.literal('specdiff'), version: z.string() }),
  inputs: z.object({ before: InputMeta, after: InputMeta }),
  mode: Mode,
  options: z.record(z.string(), z.unknown()),
  summary: Summary,
  versionCheck: VersionCheck.optional(),
  changes: z.array(Change),
  /** Problems that may hide changes, e.g. a `$ref` that could not be resolved (IN-04, OA-02). */
  warnings: z.array(z.string()).optional(),
  decisions: z.object({ accepted: z.number().int(), rejected: z.number().int(), open: z.number().int() }).optional(),
});
export type Report = z.infer<typeof Report>;

// .specdiff.yaml (docs/07 §3)
const validRegex = (p: string) => { try { new RegExp(p, 'g'); return true; } catch { return false; } };
// An invalid pattern is refused here, so a .specdiff.yaml with one fails on import (app) or load (CLI)
// with this message, instead of every later text comparison failing.
export const TextFilter = z.object({ name: z.string(), pattern: z.string().refine(validRegex, 'Not a valid regular expression'), replace: z.string() });
export type TextFilter = z.infer<typeof TextFilter>;

export const Config = z.object({
  version: z.literal(1).default(1),
  preset: z.enum(['wire', 'sdk']).default('wire'),
  failOn: z.enum(['breaking', 'possibly', 'missing-version-bump', 'none']).default('breaking'),
  rules: z.record(z.string(), z.object({ severity: Severity.optional(), enabled: z.boolean().optional() })).default({}),
  ignore: z.object({ paths: z.array(z.string()).default([]), extensions: z.boolean().default(true) }).default({ paths: [], extensions: true }),
  openapi: z.object({
    matchInlineRefs: z.boolean().default(true),
    caseInsensitiveHeaders: z.boolean().default(true),
    flattenAllOf: z.boolean().default(false),
    mergePathParams: z.boolean().default(true),
    autoUpgrade: z.boolean().default(true),
    includePathParamNames: z.boolean().default(false),
    sunsetGracePeriodDays: z.number().int().default(90),
    hideDocsOnly: z.boolean().default(false),
    ignoreExamples: z.boolean().default(false),
  }).prefault({}),
  json: z.object({
    ignoreKeyOrder: z.boolean().default(true),
    ignoreArrayOrder: z.boolean().default(false),
    arrayMatchKey: z.string().default('auto'),
    nullEqualsMissing: z.boolean().default(false),
    ignoreKeys: z.array(z.string()).default([]),
    numberTolerance: z.number().default(0),
  }).prefault({}),
  text: z.object({
    ignoreWhitespace: z.boolean().default(true),
    ignoreCase: z.boolean().default(false),
    ignoreLineEndings: z.boolean().default(true),
    precision: z.enum(['smart', 'word', 'char']).default('smart'),
    filters: z.array(TextFilter).default([]),
    transforms: z.array(z.enum(['sortLines', 'lowercase', 'trim', 'normaliseLineBreaks'])).default([]),
  }).prefault({}),
  decisions: z.string().default('.specdiff/decisions.json'),
});
export type Config = z.infer<typeof Config>;
export type ConfigInput = z.input<typeof Config>;

// .specdiff/decisions.json (docs/07 §4)
export const Decision = z.object({
  decision: z.enum(['accepted', 'rejected']),
  ruleId: z.string().optional(),
  path: z.string(),
  note: z.string().optional(),
  by: z.string().optional(),
  at: z.string(),
});
export type Decision = z.infer<typeof Decision>;
export const DecisionsFile = z.object({ version: z.literal(1), decisions: z.record(z.string(), Decision) });
export type DecisionsFile = z.infer<typeof DecisionsFile>;

// Share payload (docs/07 §5)
export const SharePayload = z.object({
  left: z.object({ name: z.string(), content: z.string() }),
  right: z.object({ name: z.string(), content: z.string() }),
  mode: Mode,
  options: z.record(z.string(), z.unknown()).optional(),
  view: z.object({ changeId: z.string().optional(), tab: z.string().optional() }).optional(),
  decisions: DecisionsFile.optional(),
});
export type SharePayload = z.infer<typeof SharePayload>;

// History and saved sources (docs/07 §6)
export interface HistoryEntry {
  id: string; createdAt: string; openedAt: string; pinned: boolean; mode: Mode;
  before: { name: string; size: number }; after: { name: string; size: number };
  summary: Summary; payloadRef: string;
}
export interface SavedSource {
  id: string; name: string; url: string; mode: Mode;
  lastFetchedAt?: string; lastSnapshotHash?: string; lastError?: 'cors' | 'network' | 'parse';
  lastResult?: { breaking: number; total: number };
}
