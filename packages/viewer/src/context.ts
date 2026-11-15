import type { Change } from '@specdiff/core';
import { createContext, useContext } from 'react';
import type { ChangeIndex } from './change-index';
import type { ReportState, ReportStore, Route } from './hooks';
import type { Json, Model, Op, SchemaEntry } from './model';
import type { AuthState } from './request';
import type { ViewerVersion } from './types';

export interface Loaded {
  label: string;
  spec: Json;
  model: Model;
  version: ViewerVersion;
}

export interface ViewerCtx {
  cur: Loaded;
  prev?: Loaded | undefined;
  /** Every version, oldest first. */
  versions: ViewerVersion[];
  /** Loaded versions (spec parsed), oldest first. */
  loaded: Loaded[];
  store: ReportStore;
  /** compareWith → current. */
  report: ReportState | undefined;
  index: ChangeIndex;
  changes: Change[];
  compareAvailable: boolean;
  compareNote?: string | undefined;
  go: (r: Route) => void;
  href: (r: Route) => string;
  copyMarkdown: (md: string, title?: string) => void;
  notify: (title: string, description?: string) => void;
  opBySlug: Map<string, Op>;
  schemaBySlug: Map<string, SchemaEntry>;
  schemaByName: Map<string, SchemaEntry>;
  isPhone: boolean;
  tryItEnabled: boolean;
  corsProxy: string;
  setCorsProxy: (p: string) => void;
  auth: AuthState | undefined;
  setAuth: (a: AuthState | undefined, remember: boolean) => void;
  remembered: boolean;
  myEndpoints: ReadonlySet<string> | undefined;
  setMyEndpoints: (keys: ReadonlySet<string> | undefined) => void;
  openMyEndpoints: () => void;
  setPair: (current: string, compareWith: string | undefined) => void;
  /** The version picked to compare with, even when it failed to load (V-01 error keeps it selected). */
  compareWith: string | undefined;
}

export const Ctx = createContext<ViewerCtx | null>(null);

export function useViewer(): ViewerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewer outside <Viewer>');
  return v;
}
