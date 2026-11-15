// The Viewer inside the app (VW-01..VW-14): the after spec, compared with the before spec.
import { compareOpenApi, parseDocument, upgradeSpec } from '@specdiff/core';
import { Viewer, type CompareFn, type VersionSet } from '@specdiff/viewer';
import '@specdiff/viewer/styles.css';
import { Button } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '../state/store';
import css from './ViewerScreen.module.css';

const toSpec = (content: string, name: string): object => {
  const v = parseDocument(content, name).value as { swagger?: unknown };
  return typeof v?.swagger === 'string' && v.swagger.startsWith('2') ? upgradeSpec(v) : (v ?? {});
};

export default function ViewerScreen() {
  const { before, after, result, settings, setScreen } = useApp();
  const set = useMemo<VersionSet | null>(() => {
    if (!before || !after) return null;
    const label = (spec: object, fallback: string) => String((spec as { info?: { version?: unknown } }).info?.version ?? fallback);
    const a = toSpec(before.content, before.name), b = toSpec(after.content, after.name);
    let la = label(a, before.name), lb = label(b, after.name);
    if (la === lb) { la = `${la} (before)`; lb = `${lb} (after)`; }
    return { versions: [{ label: la, source: before.name, spec: a }, { label: lb, source: after.name, spec: b }], current: lb, compareWith: la };
  }, [before, after]);
  const compare = useMemo<CompareFn>(() => (x, y) => (result && 'report' in result && x.content === before?.content && y.content === after?.content ? result.report : compareOpenApi(x, y, settings.config)), [result, before, after, settings.config]);
  if (!set) return null;
  return (
    <div className={css.page}>
      <div className={css.bar}><Button variant="secondary" icon={<icons.ChevronLeft size={15} />} onClick={() => setScreen('result')}>Back to comparison</Button></div>
      <Viewer versions={set} compare={compare} theme={settings.theme} basePath="viewer" parseSpec={(t, n) => toSpec(t, n)} />
    </div>
  );
}
