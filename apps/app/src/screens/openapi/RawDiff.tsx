// A-06 Raw YAML/JSON diff (OA-11, OA-13): severity markers in the gutter, linked both ways to changes.
import type { Change } from '@specdiff/core';
import { foldRows, type Row } from '@specdiff/core/text';
import { Button, SegmentedControl, SeverityBadge, TextField } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { focusChange, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { useExplain } from './explainStore';
import { Title } from './Title';
import { SEVERITIES } from './util';
import css from './RawDiff.module.css';

const SYM = { breaking: '!', possibly: '?', safe: '+', docs: '¶' } as const;

export function RawDiff() {
  const { result, before, after } = useApp();
  const { changeId, set } = useNav();
  const [layout, setLayout] = useState<'split' | 'unified'>('unified');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const report = result && 'report' in result ? result.report : null;
  const rows = result && 'text' in result ? result.text.rows : [];
  const changes = report?.changes ?? [];

  // Which change sits on which after-line (or before-line for removals).
  const byLine = useMemo(() => {
    const after = new Map<number, Change>(), before = new Map<number, Change>();
    const rank = (c: Change) => SEVERITIES.indexOf(c.severity ?? 'docs');
    for (const c of changes) {
      const put = (m: Map<number, Change>, l?: number) => { if (!l) return; const e = m.get(l); if (!e || rank(c) < rank(e)) m.set(l, c); };
      if (c.kind === 'removed') put(before, c.location.before?.line); else put(after, c.location.after?.line);
    }
    return { after, before };
  }, [changes]);
  const marked = useMemo(() => new Set(rows.flatMap((r, i) => ((r.right && byLine.after.has(r.right.n)) || (r.left && byLine.before.has(r.left.n)) ? [i] : []))), [rows, byLine]);
  const views = useMemo(() => foldRows(rows.map((r, i) => (marked.has(i) && r.type === 'same' ? { ...r, type: 'change' as const } : r)), 4, expanded), [rows, marked, expanded]);
  const current = changes.find((c) => c.id === changeId);
  const list = changes.filter((c) => !query || `${c.path} ${c.jsonPath}`.toLowerCase().includes(query.toLowerCase()));

  const scrollTo = useCallback((c: Change) => {
    const el = rowRefs.current.get(c.id);
    if (el) { el.scrollIntoView({ block: 'center' }); return; }
    // In a fold: expand everything, then scroll on next paint.
    setExpanded(new Set(views.filter((v) => v.kind === 'fold').map((v) => (v as { from: number }).from)));
    requestAnimationFrame(() => rowRefs.current.get(c.id)?.scrollIntoView({ block: 'center' }));
  }, [views]);
  useEffect(() => { if (current) scrollTo(current); }, [current, scrollTo]);
  const idx = current ? changes.indexOf(current) : -1;
  const go = useCallback((d: number) => { const n = changes[(idx + d + changes.length) % changes.length]; if (n) focusChange(n.id, 'raw'); }, [changes, idx]);
  useCommand('next-change', useCallback(() => go(1), [go]));
  useCommand('prev-change', useCallback(() => go(-1), [go]));
  useCommand('toggle-unified', useCallback(() => setLayout((l) => (l === 'split' ? 'unified' : 'split')), []));
  if (!report) return null;

  const changeFor = (r: Row) => (r.right && byLine.after.get(r.right.n)) || (r.left && byLine.before.get(r.left.n)) || undefined;
  const lineEl = (r: Row, side: 'left' | 'right' | 'both', key: string | number) => {
    const c = changeFor(r);
    const kind = r.type === 'same' || r.type === 'change' && side === 'both' && false ? 'same' : side === 'left' ? 'del' : side === 'right' ? 'add' : r.type === 'del' ? 'del' : r.type === 'add' ? 'add' : 'same';
    const s = side === 'left' ? r.left : side === 'right' ? r.right : r.right ?? r.left;
    return (
      <div key={key} className={css.line} data-kind={r.type === 'same' ? 'same' : kind} ref={c && (side !== 'left' || !r.right) ? (el) => { if (el) rowRefs.current.set(c.id, el); } : undefined}>
        {/* Mouse shortcut; the "Changes in this file" list is the keyboard and screen-reader way to the same jump. */}
        <span className={css.marker}>{c && (side !== 'left' || !r.right) ? <button type="button" tabIndex={-1} aria-hidden="true" title={`${c.severity}: ${c.path}`} className={css.sev} data-sev={c.severity} onClick={() => focusChange(c.id, 'raw')}>{SYM[c.severity ?? 'docs']}</button> : null}</span>
        <span className={css.num}>{side !== 'right' ? r.left?.n ?? '' : ''}</span>
        <span className={css.num}>{side !== 'left' ? r.right?.n ?? '' : ''}</span>
        <span className={css.gut} aria-hidden="true">{r.type === 'same' ? '' : kind === 'del' ? '−' : kind === 'add' ? '+' : ''}</span>
        <span className={css.code}>{s?.segs.map((g, i) => (g.kind === 'same' ? g.text : <mark key={i} className={g.kind === 'add' ? css.wAdd : css.wDel}>{g.text}</mark>))}</span>
      </div>
    );
  };

  return (
    <div className={css.layout}>
      <aside className={css.side} aria-labelledby="raw-changes">
        <h2 id="raw-changes" className={css.h2}>Changes in this file</h2>
        <TextField label="Find by path or JSONPath" hideLabel placeholder="Find by path or JSONPath" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className={css.list}>
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className={css.item} aria-current={c.id === changeId ? 'true' : undefined} onClick={() => focusChange(c.id, 'raw')}>
                <SeverityBadge severity={c.severity ?? 'docs'} compact />
                <span className={css.itemText}><Title c={c} short /></span>
                <span className={css.lineNo}>L{c.location.after?.line ?? c.location.before?.line}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className={css.muted}>Every marker links both ways: from a line to its change, and from a change back to its line.</p>
      </aside>
      <section className={css.pane} aria-label="Raw diff">
        <header className={css.head}>
          <span className={css.files}>{before?.name} → {after?.name}</span>
          <div className={css.legend} aria-hidden="true">{(['breaking', 'possibly', 'safe'] as const).map((s) => <span key={s}><span className={css.sev} data-sev={s}>{SYM[s]}</span> {s === 'possibly' ? 'Possibly' : s[0]!.toUpperCase() + s.slice(1)}</span>)}</div>
          <SegmentedControl label="Layout" size="sm" value={layout} onValueChange={setLayout} options={[{ value: 'split', label: 'Split' }, { value: 'unified', label: 'Unified' }]} />
          <Button variant="secondary" iconOnly icon={<icons.ChevronUp size={16} />} aria-label="Previous change" onClick={() => go(-1)} />
          <Button variant="secondary" iconOnly icon={<icons.ChevronDown size={16} />} aria-label="Next change" onClick={() => go(1)} />
        </header>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrolls sideways, needs keyboard access */}
        <div className={css.code0} role="region" aria-label={`Diff of ${before?.name} and ${after?.name}`} tabIndex={0}>
          {views.map((v, i) => {
            if (v.kind === 'fold') return <button key={i} type="button" className={css.fold} onClick={() => setExpanded(new Set(expanded).add(v.from))}><icons.ChevronsUpDown size={14} aria-hidden="true" /> Show {v.to - v.from} unchanged lines</button>;
            const r = rows[v.index]!;
            const c = changeFor(r);
            const out = layout === 'split'
              ? <div key={i} className={css.splitRow}>{lineEl({ ...r, ...(r.right ? {} : {}) }, 'left', 'l')}{lineEl(r, 'right', 'r')}</div>
              : r.type === 'change' ? <div key={i}>{lineEl(r, 'left', 'l')}{lineEl(r, 'right', 'r')}</div> : lineEl(r, r.type === 'del' ? 'left' : r.type === 'add' ? 'right' : 'both', i);
            return (
              <div key={i}>
                {out}
                {c && current?.id === c.id && (
                  <div className={css.callout} role="note">
                    <SeverityBadge severity={c.severity ?? 'docs'} />
                    <strong className={css.calloutTitle}><Title c={c} /></strong>
                    <code className={css.rule}>{c.ruleId}</code>
                    <span className={css.spacer} />
                    <Button variant="secondary" onClick={() => useExplain.getState().open(c.id)}>Explain</Button>
                    <Button variant="inverse" onClick={() => set({ tab: 'workspace', changeId: c.id })}>Open in workspace</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
