// V-04 What changed for me (VW-07, VW-09, VW-10): version timeline, endpoint filter, changes
// and the upgrade checklist.
import type { Change } from '@specdiff/core';
import { Button, SeverityBadge } from '@specdiff/ui';
import { ChevronRight, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bySeverity, changeAdvice, checklist, displayKeyOf, fieldNames, filterByEndpoints, shortTitle } from './change-index';
import { useViewer } from './context';
import { useReports } from './hooks';
import { CodePanel, InlineText, Method, cx } from './parts';
import css from './Viewer.module.css';

/** Field names as clients see them (Card → card), from the current spec. */
export function useFieldNames() {
  const v = useViewer();
  return useMemo(() => fieldNames(v.cur.spec), [v.cur.spec]);
}

export function useFilteredChanges(): { all: Change[]; shown: Change[] } {
  const v = useViewer();
  return useMemo(() => ({ all: v.changes, shown: bySeverity(filterByEndpoints(v.changes, v.myEndpoints)) }), [v.changes, v.myEndpoints]);
}

function Timeline() {
  const v = useViewer();
  const pairs = useMemo(() => v.loaded.slice(1).map((l, i) => [v.loaded[i]!.label, l.label] as [string, string]), [v.loaded]);
  const states = useReports(v.store, pairs);
  const [picked, setPicked] = useState<string[]>([]);
  const selected = picked.length ? picked : [v.prev?.label, v.cur.label].filter(Boolean) as string[];
  const toggle = (label: string) => {
    const base = picked.length === 1 ? picked : [];
    const next = base.includes(label) ? base.filter((x) => x !== label) : [...base, label];
    if (next.length === 2) {
      const order = v.loaded.map((l) => l.label);
      const [a, b] = next.sort((x, y) => order.indexOf(x) - order.indexOf(y)) as [string, string];
      v.setPair(b, a);
      setPicked([]);
    } else setPicked(next);
  };
  return (
    <section className={css.card} aria-labelledby="sd-versions">
      <div className={css.cardHead}>
        <h2 id="sd-versions" className={css.h3}>Versions</h2>
        <span className={css.muted} role="status">{picked.length === 1 ? `${picked[0]} picked. Pick one more.` : 'Select two to compare'}</span>
      </div>
      <ol className={css.timelineH}>
        {v.loaded.map((l, i) => {
          const st = i > 0 ? states[i - 1] : undefined;
          const total = i === 0 ? l.model.ops.length : st?.status === 'ready' ? st.report.summary.total : undefined;
          const breaking = st?.status === 'ready' ? st.report.summary.breaking : 0;
          const on = selected.includes(l.label);
          return (
            <li key={l.label} className={css.timelinePoint}>
              <button type="button" className={cx(css.pointBtn, on && css.pointOn)} aria-pressed={on} onClick={() => toggle(l.label)}>
                <span className={cx(css.dot, on && css.dotOn)} aria-hidden="true" />
                <span className={css.versionLabel}>{l.label}</span>
              </button>
              {l.version.date ? <span className={css.small}>{l.version.date}</span> : null}
              <span className={css.small}>
                {i === 0 ? `${total} operation${total === 1 ? '' : 's'}` : total === undefined ? (v.compareAvailable ? '…' : '') : `${total} change${total === 1 ? '' : 's'}`}
                {breaking ? <> · <strong className={css.breakingText}>{breaking} breaking</strong></> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Changes() {
  const v = useViewer();
  const { all, shown } = useFilteredChanges();
  const names = useFieldNames();
  const ops = new Map([...v.cur.model.ops, ...(v.prev?.model.ops ?? [])].map((o) => [o.key, o]));
  const row = (c: Change) => {
    const key = displayKeyOf(c, v.myEndpoints);
    const op = key ? ops.get(key) : undefined;
    const [method, path] = key ? [key.split(' ')[0]!, key.slice(key.indexOf(' ') + 1)] : ['', ''];
    return (
      <li key={c.id} className={css.changeRow}>
        <span>{c.severity ? <SeverityBadge severity={c.severity} /> : null}</span>
        <div>
          {key ? (
            <p className={css.changeOp}>
              <Method method={method} />
              {op && v.cur.model.ops.includes(op) ? <a className={css.usedLink} href={v.href({ page: 'op', slug: op.slug, tab: 'docs' })}>{path}</a> : <span className={css.mono}>{path}</span>}
            </p>
          ) : null}
          <p className={css.changeTitle}>{shortTitle(c, names)}</p>
          <p className={css.small}><InlineText text={changeAdvice(c)} /></p>
        </div>
      </li>
    );
  };
  return (
    <div className={css.page}>
      <h1 className={css.h1}>What changed</h1>
      {v.loaded.length > 1 ? <Timeline /> : null}
      {!v.prev ? (
        <p className={css.lead}>Load a second version to see what changed.</p>
      ) : !v.compareAvailable ? (
        <section className={css.card}><p className={css.noMargin}>{v.compareNote ?? 'Comparison is not available in this build, so only New and Deprecated badges are shown.'}</p></section>
      ) : v.report?.status === 'loading' ? (
        <p className={css.muted} role="status">Comparing {v.prev.label} with {v.cur.label}…</p>
      ) : v.report?.status === 'error' ? (
        <p className={css.errorSmall} role="alert">Could not compare: {v.report.message}</p>
      ) : (
        <>
          {v.myEndpoints ? (
            <section className={css.filterCard} aria-labelledby="sd-filter">
              <h2 id="sd-filter" className={css.h4}>Showing changes for the {v.myEndpoints.size === 1 ? 'endpoint' : `${v.myEndpoints.size} endpoints`} you use</h2>
              <p className={css.small}>{all.length - shown.length} of {all.length} change{all.length === 1 ? '' : 's'} hidden. Saved in this browser.</p>
              <div className={css.row}>
                <Button onClick={v.openMyEndpoints}>Edit my endpoints</Button>
                <Button variant="ghost" onClick={() => v.setMyEndpoints(undefined)}>Show everything</Button>
              </div>
            </section>
          ) : (
            <section className={css.filterCard} aria-labelledby="sd-filter">
              <h2 id="sd-filter" className={css.h4}>Only care about some endpoints?</h2>
              <p className={css.small}>Pick the endpoints your app uses, or drop a HAR file. Nothing leaves this browser.</p>
              <div className={css.row}><Button onClick={v.openMyEndpoints}>Pick my endpoints</Button></div>
            </section>
          )}
          <section className={css.card} aria-labelledby="sd-change-list">
            <h2 id="sd-change-list" className={css.h3}>{v.prev.label} → {v.cur.label} · {v.myEndpoints ? 'affects you' : 'all changes'}</h2>
            {shown.length ? (
              <ul className={css.changeRows}>
                {shown.filter((c) => c.severity === 'breaking' || c.severity === 'possibly').map(row)}
                {/* V-04: safe and docs-only changes fold into one row each; a single one shows as is. */}
                {(['safe', 'docs'] as const).map((sev) => {
                  const group = shown.filter((c) => (c.severity ?? 'docs') === sev);
                  if (group.length < 2) return group.map(row);
                  const titles = [...new Set(group.map((c) => shortTitle(c, names)))].map((t, i) => (i && /^(Description|Summary|Example|Tags|Endpoint) /.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t));
                  return (
                    <li key={sev} className={css.changeGroup}>
                      <details>
                        <summary className={css.changeGroupHead}>
                          <span><SeverityBadge severity={sev} /></span>
                          <div>
                            <p className={css.changeTitle}>{group.length} {sev === 'safe' ? 'safe changes' : 'docs-only changes'}</p>
                            <p className={css.small}>{titles.slice(0, 3).join(', ')}{titles.length > 3 ? `, and ${titles.length - 3} more` : ''}. {sev === 'safe' ? 'Nothing to avoid.' : 'No action needed.'}</p>
                          </div>
                          <ChevronRight aria-hidden="true" size={16} className={css.chev} />
                        </summary>
                        <ul className={css.changeRows}>{group.map(row)}</ul>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={css.muted}>No changes affect the endpoints you picked.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function ChangesAside() {
  const v = useViewer();
  const { shown } = useFilteredChanges();
  const names = useFieldNames();
  if (!v.prev || v.report?.status !== 'ready') return null;
  const list = checklist(shown, names, v.myEndpoints);
  const n = list.required.length;
  return (
    <div className={css.aside}>
      <section className={css.effortCard} aria-labelledby="sd-effort">
        <p className={css.effortEyebrow}>Upgrade effort{v.myEndpoints ? ' for you' : ''}</p>
        <h2 id="sd-effort" className={css.effortTitle}>{n} required {n === 1 ? 'fix' : 'fixes'}</h2>
        <p className={css.effortText}>{list.check.length} to check, {list.optional.length} optional. Copy the list into your ticket.</p>
        <Button variant="brand" icon={<Copy />} onClick={() => v.copyMarkdown(list.text || '- [ ] Nothing to do', 'Checklist copied')}>Copy as checklist</Button>
      </section>
      {list.text ? <CodePanel title="Checklist" code={list.text} wrap /> : null}
    </div>
  );
}
