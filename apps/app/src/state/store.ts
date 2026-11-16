// App state (zustand). Settings and history persist in IndexedDB (idb-keyval); content never leaves the browser.
import type { ConfigInput, DecisionsFile, Mode } from '@specdiff/core';
import { create } from 'zustand';
import type { Source } from '../lib/input';
import { startCompare, type Job } from '../worker/client';
import type { CompareResult, Progress, Step } from '../worker/protocol';
import { saveHistory } from './persist';

export type Theme = 'light' | 'dark' | 'system';
export type DiffTheme = 'default' | 'high-contrast';
export type Screen = 'compare' | 'parsing' | 'result' | 'history' | 'settings' | 'saved' | 'unlock' | 'viewer';
export type Side = 'before' | 'after';

export interface Settings {
  theme: Theme;
  diffTheme: DiffTheme;
  config: ConfigInput;
  userName: string;
  /** A-11: record new comparisons in History (this browser only). */
  saveHistory: boolean;
}

export const STEPS: Step[] = ['detect', 'parse', 'resolve', 'normalise', 'compare'];
/** IN-08: comparisons that finish sooner than this never show the Parsing screen (no flash). */
export const PARSING_DELAY_MS = 300;

interface State {
  screen: Screen;
  before: Source | null;
  after: Source | null;
  mode: Mode | 'auto';
  settings: Settings;
  progress: Partial<Record<Step, Progress>>;
  job: Job | null;
  result: CompareResult | null;
  /** The settings.config the current result was made with (screens re-compare only when it differs). */
  comparedConfig: ConfigInput | null;
  /**
   * M-14: my own config while a share link's rules are in use (settings.config then holds the sender's,
   * for this comparison only). Saved settings keep this one; null when no link rules are in use.
   */
  savedConfig: ConfigInput | null;
  error: string | null;
  decisions: DecisionsFile;
  viewed: Record<string, true>;
  setScreen: (s: Screen) => void;
  setSource: (side: Side, s: Source | null) => void;
  setText: (side: Side, content: string) => void;
  swap: () => void;
  setMode: (m: Mode | 'auto') => void;
  updateConfig: (fn: (c: ConfigInput) => ConfigInput) => void;
  /** M-14: compare with a link's rules without saving them. */
  applyLinkConfig: (c: ConfigInput) => void;
  /** M-14 "Use my rules". */
  restoreMyConfig: () => void;
  /** M-14 "Save theirs as mine". */
  keepLinkConfig: () => void;
  setSettings: (s: Partial<Settings>) => void;
  /**
   * Run the comparison. `background` (TX-10 live re-diff): keep the current screen and result visible and swap the
   * result in when it is ready; no Parsing screen and no new history entry.
   */
  compare: (opts?: { background?: boolean }) => Promise<void>;
  cancel: () => void;
  decide: (
    fingerprint: string,
    d: { decision: 'accepted' | 'rejected'; path: string; ruleId?: string; note?: string } | null,
  ) => void;
  setDecisions: (d: DecisionsFile) => void;
  toggleViewed: (id: string) => void;
}

export const defaultSettings: Settings = {
  theme: 'system',
  diffTheme: 'default',
  config: {},
  userName: '',
  saveHistory: true,
};

/** What is written to storage: my own config, never a link's (M-14). */
export const persistedSettings = (s: Pick<State, 'settings' | 'savedConfig'>): Settings => (s.savedConfig ? { ...s.settings, config: s.savedConfig } : s.settings);

export const useApp = create<State>((set, get) => ({
  screen: 'compare',
  before: null,
  after: null,
  mode: 'auto',
  settings: defaultSettings,
  progress: {},
  job: null,
  result: null,
  comparedConfig: null,
  savedConfig: null,
  error: null,
  decisions: { version: 1, decisions: {} },
  viewed: {},
  setScreen: (screen) => set({ screen }),
  // A new file is a new comparison: a link's rules stop applying (M-14).
  setSource: (side, src) =>
    set((s) => ({ [side]: src, ...(s.savedConfig ? { settings: { ...s.settings, config: s.savedConfig }, savedConfig: null } : {}) }) as Partial<State>),
  setText: (side, content) => {
    const prev = get()[side];
    set({
      [side]: {
        name: prev?.name ?? (side === 'before' ? 'Before' : 'After'),
        content,
        size: new Blob([content]).size,
        origin: { kind: 'paste' },
      },
    } as Pick<State, Side>);
  },
  swap: () => set((s) => ({ before: s.after, after: s.before })),
  setMode: (mode) => set({ mode }),
  updateConfig: (fn) =>
    set((s) => ({ settings: { ...s.settings, config: fn(s.settings.config) } })),
  applyLinkConfig: (c) => set((s) => ({ savedConfig: s.savedConfig ?? s.settings.config, settings: { ...s.settings, config: c } })),
  restoreMyConfig: () => set((s) => (s.savedConfig ? { settings: { ...s.settings, config: s.savedConfig }, savedConfig: null } : {})),
  keepLinkConfig: () => set({ savedConfig: null }),
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  compare: async (opts = {}) => {
    const { before, after, mode, settings } = get();
    if (!before || !after) return;
    get().job?.cancel();
    const background = !!opts.background && get().screen === 'result';
    const job = startCompare({ before, after, mode, config: settings.config }, (p) =>
      background ? undefined : set((s) => ({ progress: { ...s.progress, [p.step]: p } })),
    );
    if (background) set({ job, comparedConfig: settings.config });
    else {
      set({ job, progress: {}, error: null, viewed: {}, comparedConfig: settings.config });
      // IN-08: show the Parsing screen only when the work takes long enough to notice.
      setTimeout(() => {
        if (get().job === job) set({ screen: 'parsing' });
      }, PARSING_DELAY_MS);
    }
    try {
      const result = await job.promise;
      if (get().job !== job) return; // superseded by a newer comparison
      if (background) {
        // A failed parse while editing keeps the last good result on screen.
        if (!('kind' in result)) set({ result, job: null });
        else set({ job: null });
        return;
      }
      set({ result, job: null, screen: 'kind' in result ? 'compare' : 'result' });
      if (!('kind' in result) && get().settings.saveHistory !== false) void saveHistory(before, after, result).catch(() => {});
    } catch (e) {
      if (get().job !== job && get().job !== null) return;
      if (e instanceof DOMException && e.name === 'AbortError') {
        if (!background) set({ job: null, screen: 'compare' });
        return;
      }
      if (background) {
        set({ job: null });
        return;
      }
      set({ job: null, error: e instanceof Error ? e.message : String(e), screen: 'compare' });
    }
  },
  cancel: () => {
    get().job?.cancel();
    set({ job: null, screen: 'compare' });
  },
  decide: (fp, d) =>
    set((s) => {
      const decisions = { ...s.decisions.decisions };
      if (d) {
        decisions[fp] = {
          decision: d.decision,
          path: d.path,
          at: new Date().toISOString(),
          ...(d.ruleId ? { ruleId: d.ruleId } : {}),
          ...(d.note ? { note: d.note } : {}),
          ...(s.settings.userName ? { by: s.settings.userName } : {}),
        };
      } else delete decisions[fp];
      return { decisions: { version: 1, decisions } };
    }),
  setDecisions: (decisions) => set({ decisions }),
  toggleViewed: (id) =>
    set((s) => {
      const v = { ...s.viewed };
      if (v[id]) delete v[id];
      else v[id] = true;
      return { viewed: v };
    }),
}));
