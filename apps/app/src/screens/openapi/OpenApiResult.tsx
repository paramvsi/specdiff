// OpenAPI result: Summary · Workspace · Raw diff · Changelog (A-04, A-05, A-06, A-10).
import { ReviewProgress } from '@specdiff/ui';
import { useCallback, useEffect } from 'react';
import { useCommand } from '../../shell/commands';
import { readChangeHash, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { Changelog } from './Changelog';
import { AffectsMeDialog, AffectsMeView, ConsumerControls, SdkView, useConsumer } from './Consumer';
import { Explain } from './Explain';
import { RawDiff } from './RawDiff';
import { Summary } from './Summary';
import { reviewCounts } from './util';
import { Workspace } from './Workspace';
import css from './OpenApiResult.module.css';

const TABS = [
  { value: 'summary', label: 'Summary' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'raw', label: 'Raw diff' },
  { value: 'changelog', label: 'Changelog' },
] as const;

export default function OpenApiResult() {
  const { result, decisions } = useApp();
  const { tab, set } = useNav();
  useEffect(() => {
    const id = readChangeHash();
    if (id) set({ changeId: id, tab: 'workspace' });
  }, [set]);
  useCommand('tab-1', useCallback(() => set({ tab: 'summary' }), [set]));
  useCommand('tab-2', useCallback(() => set({ tab: 'workspace' }), [set]));
  useCommand('tab-3', useCallback(() => set({ tab: 'raw' }), [set]));
  useCommand('tab-4', useCallback(() => set({ tab: 'changelog' }), [set]));
  const consumer = useConsumer();
  if (!result || !('report' in result)) return null;
  const r = reviewCounts(result.report.changes, decisions);
  return (
    <div className={css.page}>
      <div className={css.bar}>
        <div role="tablist" aria-label="OpenAPI views" className={css.tabs}>
          {TABS.map((t, i) => (
            <button key={t.value} id={`tab-${t.value}`} role="tab" type="button" aria-selected={tab === t.value} aria-controls={`panel-${t.value}`} tabIndex={tab === t.value ? 0 : -1} className={css.tab} aria-keyshortcuts={String(i + 1)}
              onClick={() => set({ tab: t.value })}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!d) return;
                const next = TABS[(i + d + TABS.length) % TABS.length]!;
                set({ tab: next.value });
                document.getElementById(`tab-${next.value}`)?.focus();
              }}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'workspace' && <ConsumerControls />}
        {r.total > 0 && <ReviewProgress accepted={r.accepted} rejected={r.rejected} total={r.total} className={css.progress} />}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={css.panel}>
        {tab === 'summary' && <Summary />}
        {tab === 'workspace' && (consumer.filter ? <AffectsMeView changes={result.report.changes} /> : consumer.view === 'sdk' ? <SdkView changes={result.report.changes} /> : <Workspace />)}
        {tab === 'raw' && <RawDiff />}
        {tab === 'changelog' && <Changelog />}
      </div>
      <Explain />
      <AffectsMeDialog />
    </div>
  );
}
