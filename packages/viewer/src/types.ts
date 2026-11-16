// Public types of the Viewer (docs/07 §8 VersionSet, VW-07, VW-12).
import type { Report } from '@specdiff/core';

/** Why a version could not be loaded (V-01 error state, VW-13). */
export interface LoadError {
  kind: 'cors' | 'network' | 'http' | 'parse';
  message: string;
  /** Host that refused the request, e.g. `specs.acme.dev`. */
  host?: string;
}

export interface ViewerVersion {
  label: string;
  /** Where it came from: a file name, URL, "git tag v1.5.0". */
  source: string;
  date?: string;
  /** Parsed OpenAPI document. Missing when it failed to load (see `error`). */
  spec?: object;
  /** The file as written. When set, comparisons read it under `source`, so reports match the app's (M-21). */
  text?: string;
  error?: LoadError;
}

export interface VersionSet {
  versions: ViewerVersion[];
  current: string;
  compareWith?: string;
}

export interface CompareInput {
  name: string;
  content: string;
}

/** The host passes core's `compareOpenApi` (or anything with the same shape). */
export type CompareFn = (before: CompareInput, after: CompareInput) => Report | Promise<Report>;

export interface Brand {
  /** CSS colour for primary buttons and the selected nav row, e.g. `#1f55c4`. */
  color?: string;
  /** Logo image URL. */
  logo?: string;
  /** Company name shown before the API title. */
  name?: string;
}

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface ViewerProps {
  versions: VersionSet;
  compare?: CompareFn | undefined;
  theme?: ThemeSetting | undefined;
  brand?: Brand | undefined;
  /** Prefix inside the hash, e.g. `docs` gives `#/docs/op/…`. Default: none. */
  basePath?: string | undefined;
  /** Show Try it (VW-05). Default true. */
  tryIt?: boolean | undefined;
  /** User-supplied CORS proxy (VW-13). `{url}` is replaced by the encoded target URL; otherwise the URL is appended. */
  corsProxy?: string | undefined;
  /** Parses a spec file the user picks ("Add a version", "Choose a file instead"). JSON works without it. */
  parseSpec?: ((text: string, name: string) => object) | undefined;
  /** Called by "Try again" on a version that failed to load. */
  onRetry?: ((label: string) => void) | undefined;
  /** A note shown in "What changed" when comparison is unavailable. */
  compareUnavailableReason?: string | undefined;
  className?: string | undefined;
}
