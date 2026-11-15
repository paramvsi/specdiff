// App state (zustand). Settings and history persist in IndexedDB (idb-keyval); content never leaves the browser.
import { Config, type ConfigInput, type DecisionsFile, type Mode } from '@specdiff/core';
import { create } from 'zustand';
import type { Source } from '../lib/input';
import { startCompare, type Job } from '../worker/client';
import type { CompareResult, Progress, Step } from '../worker/protocol';
import { saveHistory } from './persist';

export type Theme = 'light' | 'dark' | 'system';
export type DiffTheme = 'default' | 'high-contrast';
export type Screen = 'compare' | 'parsing' | 'result' | 'history' | 'settings' | 'saved' | 'unlock';
export type Side = 'before' | 'after';

export interface Settings { theme: Theme; diffTheme: DiffTheme; config: ConfigInput; userName: string }

export const STEPS: Step[] = ['detect', 'parse', 'resolve', 'normalise', 'compare'];

interface State {
  screen: Screen;
  before: Source | null;
  after: Source | null;
  mode: Mode | 'auto';
  settings: Settings;
  progress: Partial<Record<Step, Progress>>;
  job: Job | null;
  result: CompareResult | null;
  error: string | null;
  decisions: DecisionsFile;
  viewed: Record<string, true>;
  setScreen: (s: Screen) => void;
  setSource: (side: Side, s: Source | null) => void;
  setText: (side: Side, content: string) => void;
  swap: () => void;
  setMode: (m: Mode | 'auto') => void;
  updateConfig: (fn: (c: ConfigInput) => ConfigInput) => void;
  setSettings: (s: Partial<Settings>) => void;
  compare: () => Promise<void>;
  cancel: () => void;
  decide: (fingerprint: string, d: { decision: 'accepted' | 'rejected'; path: string; ruleId?: string; note?: string } | null) => void;
  setDecisions: (d: DecisionsFile) => void;
  toggleViewed: (id: string) => void;
}

export const defaultSettings: Settings = { theme: 'system', diffTheme: 'default', config: {}, userName: '' };

export const useApp = create<State>((set, get) => ({
  screen: 'compare',
  before: null,
  after: null,
  mode: 'auto',
  settings: defaultSettings,
  progress: {},
  job: null,
  result: null,
  error: null,
  decisions: { version: 1, decisions: {} },
  viewed: {},
  setScreen: (screen) => set({ screen }),
  setSource: (side, s) => set({ [side]: s } as Pick<State, Side>),
  setText: (side, content) => {
    const prev = get()[side];
    set({ [side]: { name: prev?.name ?? (side === 'before' ? 'Before' : 'After'), content, size: new Blob([content]).size } } as Pick<State, Side>);
  },
  swap: () => set((s) => ({ before: s.after, after: s.before })),
  setMode: (mode) => set({ mode }),
  updateConfig: (fn) => set((s) => ({ settings: { ...s.settings, config: fn(s.settings.config) } })),
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  compare: async () => {
    const { before, after, mode, settings } = get();
    if (!before || !after) return;
    get().job?.cancel();
    const job = startCompare({ before, after, mode, config: Config.parse(settings.config) }, (p) =>
      set((s) => ({ progress: { ...s.progress, [p.step]: p } })),
    );
    set({ job, progress: {}, error: null, screen: 'parsing', viewed: {} });
    try {
      const result = await job.promise;
      set({ result, job: null, screen: 'result' });
      if (!('kind' in result)) void saveHistory(before, after, result).catch(() => {});
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { set({ job: null, screen: 'compare' }); return; }
      set({ job: null, error: e instanceof Error ? e.message : String(e), screen: 'compare' });
    }
  },
  cancel: () => { get().job?.cancel(); set({ job: null, screen: 'compare' }); },
  decide: (fp, d) =>
    set((s) => {
      const decisions = { ...s.decisions.decisions };
      if (d) {
        decisions[fp] = {
          decision: d.decision, path: d.path, at: new Date().toISOString(),
          ...(d.ruleId ? { ruleId: d.ruleId } : {}), ...(d.note ? { note: d.note } : {}),
          ...(s.settings.userName ? { by: s.settings.userName } : {}),
        };
      } else delete decisions[fp];
      return { decisions: { version: 1, decisions } };
    }),
  setDecisions: (decisions) => set({ decisions }),
  toggleViewed: (id) => set((s) => { const v = { ...s.viewed }; if (v[id]) delete v[id]; else v[id] = true; return { viewed: v }; }),
}));
