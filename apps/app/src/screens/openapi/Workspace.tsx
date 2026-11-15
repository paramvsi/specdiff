// A-05 OpenAPI workspace and review mode (OA-09, OA-10, OA-12, OA-13, OA-14, OA-15, OA-21, X-11).
// B-30: AWorkspace (stat strip, filter "All", focused hunk) is the default; "To review" switches to A05-Review.
// X-02: the change tree is virtual past VIRTUAL_THRESHOLD rows.
import { bumpLabel, type Change, type Report } from '@specdiff/core';
import { diffText } from '@specdiff/core/text';
import { Button, Checkbox, DecisionButtons, MethodChip, SegmentedControl, SeverityBadge, TextField, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VirtualList, type RowSlot, type VirtualListApi } from '../../lib/VirtualList';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { useExplain } from './explainStore';
import { DecisionsActions } from './DecisionsActions';
import { Md, Title, useSpecContext } from './Title';
import { changeTitleText, fixChangelogLine } from './titles';
import { copy, decisionOf, excerpts, groupKey, matchesSearch, methodOf, needsDecision, reviewCounts, SEV_LABEL, type GroupBy } from './util';
import css from './Workspace.module.css';

type Filter = 'review' | 'breaking' | 'possibly' | 'safe' | 'docs' | 'all';

export function Workspace() {
  const { result, decisions, decide, viewed, toggleViewed, before, after } = useApp();
  const { changeId, set } = useNav();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const review = filter === 'review';
  const listApi = useRef<VirtualListApi>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('path');
  const [query, setQuery] = useState('');
  const changes = useMemo(() => (result && 'report' in result ? result.report.changes : []), [result]);
  const counts = reviewCounts(changes, decisions);
  const { ctx, spec } = useSpecContext();

  const shownBy = useCallback((c: Change, f: Filter) => (f === 'all' ? true : f === 'review' ? needsDecision(c) : c.severity === f) && matchesSearch(c, query, changeTitleText(c, ctx)), [query, ctx]);
  const visible = useMemo(() => changes.filter((c) => shownBy(c, filter)), [changes, filter, shownBy]);
  const groups = useMemo(() => groupsOf(visible, groupBy), [visible, groupBy]);
  const flat = groups.flatMap(([, cs]) => cs);
  // One row per group heading and per change, for the (virtual) tree.
  const rows = useMemo(() => groups.flatMap(([g, cs]) => [{ group: g } as const, ...cs.map((c) => ({ c }) as const)]), [groups]);
  const current = changes.find((c) => c.id === changeId) ?? flat[0] ?? changes[0];

  useEffect(() => { if (current && current.id !== changeId) set({ changeId: current.id }); }, [current, changeId, set]);
  // Keep the current change in view when it moves with J / K / N or a deep link (virtual trees only render what's in view).
  useEffect(() => {
    const i = rows.findIndex((r) => 'c' in r && r.c.id === current?.id);
    if (i >= 0) listApi.current?.scrollToIndex(i);
  }, [rows, current?.id]);
  const at = current ? flat.indexOf(current) : -1;
  const go = useCallback((d: number) => { const n = flat[(at + d + flat.length) % flat.length]; if (n) focusChange(n.id); }, [flat, at]);
  const nextToReview = useCallback(() => {
    const open = changes.filter((c) => needsDecision(c) && !decisionOf(decisions, c));
    const n = open.find((c) => changes.indexOf(c) > changes.indexOf(current!)) ?? open[0];
    if (n) focusChange(n.id);
  }, [changes, decisions, current]);
  const setDecision = useCallback((d: 'accepted' | 'rejected' | null) => {
    if (!current) return;
    decide(current.fingerprint, d ? { decision: d, path: current.path, ...(current.ruleId ? { ruleId: current.ruleId } : {}), ...(decisions.decisions[current.fingerprint]?.note ? { note: decisions.decisions[current.fingerprint]!.note! } : {}) } : null);
  }, [current, decide, decisions]);
  useCommand('next-change', useCallback(() => go(1), [go]));
  useCommand('prev-change', useCallback(() => go(-1), [go]));
  useCommand('next-to-review', nextToReview);
  useCommand('accept', useCallback(() => current && needsDecision(current) && setDecision(decisionOf(decisions, current) === 'accepted' ? null : 'accepted'), [current, decisions, setDecision]));
  useCommand('reject', useCallback(() => current && needsDecision(current) && setDecision(decisionOf(decisions, current) === 'rejected' ? null : 'rejected'), [current, decisions, setDecision]));
  useCommand('mark-viewed', useCallback(() => current && toggleViewed(current.id), [current, toggleViewed]));
  useCommand('explain', useCallback(() => current && useExplain.getState().open(current.id), [current]));
  useCommand('copy-link', useCallback(() => { if (current) { void copy(changeLink(current.id)); toast({ title: 'Link to this change copied' }); } }, [current, toast]));

  if (!result || !('report' in result) || !current) return <p>No changes.</p>;
  const sev = (s: Filter) => changes.filter((c) => (s === 'review' ? needsDecision(c) && !decisionOf(decisions, c) : c.severity === s)).length;
  // One stable order for both views, so the chips don't move under the pointer when the view switches.
  const chips: Array<[Filter, string]> = [['all', `All ${changes.length}`], ['breaking', `Breaking ${sev('breaking')}`], ['possibly', `Possibly ${sev('possibly')}`], ['safe', `Safe ${sev('safe')}`], ['review', `To review ${sev('review')}`]];
  const d = decisionOf(decisions, current);
  // A filter that hides the current change moves to its first change (A / R act on what is shown).
  const pickFilter = (f: Filter) => {
    setFilter(f);
    const first = groupsOf(changes.filter((c) => shownBy(c, f)), groupBy)[0]?.[1][0];
    if (!shownBy(current, f) && first) focusChange(first.id);
  };

  const item = (c: Change, slot?: RowSlot) => {
    const dc = decisionOf(decisions, c);
    return (
      <li key={c.id} {...slotProps(slot)}>
        <button type="button" className={css.item} aria-current={c.id === current.id ? 'true' : undefined} onClick={() => focusChange(c.id)}>
          {review && <span className={css.state} data-d={dc ?? (needsDecision(c) ? 'open' : 'none')} aria-label={dc ? dc : needsDecision(c) ? 'to review' : undefined}>{dc === 'accepted' ? <icons.Check size={11} /> : dc === 'rejected' ? <icons.X size={11} /> : null}</span>}
          <SeverityBadge severity={c.severity ?? 'docs'} compact />
          {methodOf(c) ? <MethodChip method={methodOf(c)!} /> : <span className={css.all}>ALL</span>}
          <span className={css.itemText}><Title c={c} codeClass={css.plainCode} /></span>
          {viewed[c.id] && <icons.Eye size={13} aria-label="viewed" className={css.viewed} />}
        </button>
      </li>
    );
  };

  return (
    <div className={css.workspace}>
      {!review && <StatStrip report={result.report} />}
    <div className={css.layout} data-view={review ? 'review' : 'workspace'}>
      <nav className={css.tree} aria-label="Changes">
        {review && <div className={css.review}>
          <div className={css.reviewHead}><span>Review</span><span className={css.mono}>{counts.accepted + counts.rejected} of {counts.total} decided</span></div>
          <div className={css.bar} aria-hidden="true"><span className={css.acc} style={{ width: `${(counts.accepted / Math.max(1, counts.total)) * 100}%` }} /><span className={css.rej} style={{ width: `${(counts.rejected / Math.max(1, counts.total)) * 100}%` }} /></div>
          <p className={css.muted}>{counts.accepted} accepted · {counts.rejected} rejected · {counts.open} open</p>
        </div>}
        <div className={css.chips} role="group" aria-label="Filter changes">
          {chips.map(([f, label]) => <button key={f} type="button" className={css.chip} aria-pressed={filter === f} onClick={() => pickFilter(f)}>{label}</button>)}
        </div>
        <div className={css.treeTools}>
          <TextField label="Search changes or JSONPath" hideLabel value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search or $.paths['/v1/…'].." />
          <label className={css.group}>Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="path">Path</option><option value="tag">Tag</option><option value="schema">Schema</option><option value="severity">Severity</option>
            </select>
          </label>
        </div>
        <VirtualList
          count={rows.length}
          estimate={44}
          as="ul"
          label="Change list"
          listClassName={css.list}
          className={css.scroller}
          height="max(240px, calc(100vh - 340px))"
          apiRef={listApi}
          render={(i, slot) => {
            const r = rows[i]!;
            return 'group' in r ? <li key={`g:${r.group}`} {...slotProps(slot)} className={css.groupName}>{r.group}</li> : item(r.c, slot);
          }}
        />
        {filter === 'review' && <p className={css.muted}>Safe and docs-only changes don’t need a decision. Show them with All.</p>}
      </nav>

      <section className={css.detail} aria-labelledby="change-title">
        <header className={css.detailHead}>
          <div className={css.detailMeta}>
            {methodOf(current) && <MethodChip method={methodOf(current)!} />}
            <code className={css.where}>{current.sharedSchema ? `components.schemas.${current.sharedSchema.name}` : current.operation?.path ?? current.sourceBlock}</code>
            <SeverityBadge severity={current.severity ?? 'docs'} />
            {current.sharedSchema && <span className={css.shared}>Shared · {current.sharedSchema.usageCount} endpoint{current.sharedSchema.usageCount === 1 ? '' : 's'}</span>}
          </div>
          <h2 id="change-title" className={css.title}><Title c={current} /></h2>
          <p className={css.jsonPath}>{current.location.after ? `${current.location.after.file}:${current.location.after.line}:${current.location.after.column} · ` : ''}{current.jsonPath}</p>
        </header>
        <Snippet c={current} before={before?.content ?? ''} after={after?.content ?? ''} layoutSwitch={review} />
        {current.sharedSchema && (
          <div className={css.usages}>
            <h3 className={css.h3}>Endpoints that {current.direction === 'response' ? 'return' : current.direction === 'request' ? 'accept' : 'use'} {current.sharedSchema.name}</h3>
            <ul className={css.usageList}>
              {current.sharedSchema.usages.map((u) => { const [m, p] = u.split(' '); return <li key={u}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m!) ? <MethodChip method={m as 'GET'} /> : null}<code>{p ?? u}</code></li>; })}
              {current.sharedSchema.usageCount > current.sharedSchema.usages.length && <li className={css.muted}>and {current.sharedSchema.usageCount - current.sharedSchema.usages.length} more</li>}
            </ul>
          </div>
        )}
        {review && <footer className={css.detailFoot}>
          <Button variant="secondary" icon={<icons.ChevronLeft size={15} />} onClick={() => go(-1)} aria-keyshortcuts="K">Previous</Button>
          <Button variant="secondary" icon={<icons.ChevronRight size={15} />} onClick={nextToReview} aria-keyshortcuts="N">Next to review</Button>
          <span className={css.spacer} />
          <Checkbox label="Mark as viewed" checked={!!viewed[current.id]} onCheckedChange={() => toggleViewed(current.id)} />
        </footer>}
      </section>

      <aside className={css.inspector}>
        {review && needsDecision(current) && (
          <section className={css.card} aria-labelledby="decision-h">
            <h2 id="decision-h" className={css.cardTitle}>Your decision</h2>
            <DecisionButtons value={d} onChange={setDecision} />
            <NoteField c={current} />
            <p className={css.small}>Recorded as <code>{current.fingerprint.slice(0, 4)}…{current.fingerprint.slice(-4)}</code>. Download <code>decisions.json</code>, put it in <code>.specdiff/</code> and commit it so the CLI and pre-commit hook honour it.</p>
            <DecisionsActions className={css.fileActions} />
          </section>
        )}
        {current.explanation && (
          <section className={css.card} aria-labelledby="why-h">
            <h2 id="why-h" className={css.eyebrow}>{current.severity === 'breaking' || current.severity === 'possibly' ? 'Why it breaks' : 'What it means'}</h2>
            <p className={css.body}><Md text={`${current.explanation.who} ${current.explanation.see}`} /></p>
            <h3 className={css.eyebrow}>How to avoid it</h3>
            <p className={css.body}><Md text={current.explanation.avoid} /></p>
            <code className={css.small}>rule: {current.ruleId}</code>
            <button type="button" className={css.link} onClick={() => useExplain.getState().open(current.id)} aria-keyshortcuts="E">Explain in detail</button>
          </section>
        )}
        {current.changelogLine && (
          <section className={css.card} aria-labelledby="cl-h">
            <h2 id="cl-h" className={css.eyebrow}>Changelog line</h2>
            <p className={css.clLine}>{current.severity === 'breaking' ? <strong>Breaking: </strong> : null}<Md text={fixChangelogLine(current.changelogLine, current, spec)} /></p>
            <Button variant="secondary" onClick={() => { void copy(`${current.severity === 'breaking' ? '**Breaking:** ' : ''}${fixChangelogLine(current.changelogLine!, current, spec)}`); toast({ title: 'Changelog line copied' }); }}>Copy line</Button>
          </section>
        )}
      </aside>
    </div>
    </div>
  );
}

function groupsOf(cs: Change[], by: GroupBy): Array<[string, Change[]]> {
  const m = new Map<string, Change[]>();
  for (const c of cs) { const k = groupKey(c, by); m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m.entries()];
}

/** Props a tree row spreads when the list is virtual (position and measuring). */
function slotProps(slot?: RowSlot) {
  return slot ? { 'data-index': slot['data-index'], style: slot.style, ref: slot.measure } : {};
}

/** AWorkspace stat strip: four severity counts and the suggested version. */
function StatStrip({ report }: { report: Report }) {
  const s = report.summary;
  const vc = report.versionCheck;
  return (
    <div className={css.stats}>
      {(['breaking', 'possibly', 'safe', 'docs'] as const).map((k) => (
        <section key={k} className={css.stat} aria-label={`${SEV_LABEL[k]}: ${s[k]}`}>
          <SeverityBadge severity={k} />
          <p className={css.statN}>{s[k]}</p>
        </section>
      ))}
      {vc && (
        <section className={css.version} aria-label="Suggested version">
          <p className={css.versionLabel}>Suggested version</p>
          <p className={css.versionValue}>{vc.suggested} <span className={css.bump}>{bumpLabel(vc.bump)}</span></p>
        </section>
      )}
    </div>
  );
}

function NoteField({ c }: { c: Change }) {
  const { decisions, decide } = useApp();
  const existing = decisions.decisions[c.fingerprint];
  const [note, setNote] = useState(existing?.note ?? '');
  const last = useRef(c.fingerprint);
  useEffect(() => { if (last.current !== c.fingerprint) { last.current = c.fingerprint; setNote(decisions.decisions[c.fingerprint]?.note ?? ''); } }, [c.fingerprint, decisions]);
  return (
    <label className={css.note}>
      <span>Note (optional)</span>
      <textarea value={note} placeholder="Why is this change OK, or what has to change?" onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (existing && note !== (existing.note ?? '')) decide(c.fingerprint, { decision: existing.decision, path: c.path, ...(c.ruleId ? { ruleId: c.ruleId } : {}), ...(note ? { note } : {}) }); }} />
    </label>
  );
}

type Layout = 'split' | 'inline';
type Rows = ReturnType<typeof diffText>['rows'];

/** The focused hunk (AWorkspace, A05-Review): about 11 rows around the changed row nearest the change's line. */
const HUNK = 11;
function windowRows(rows: Rows, starts: { b: number; a: number }, c: Change): Array<{ r: Rows[number]; i: number }> {
  const all = rows.map((r, i) => ({ r, i }));
  if (rows.length <= HUNK + 1) return all;
  const lineOf = (x: Rows[number]) => ({ b: x.left ? starts.b + x.left.n - 1 : -1, a: x.right ? starts.a + x.right.n - 1 : -1 });
  const want = { b: c.location.before?.line ?? -1, a: c.location.after?.line ?? -1 };
  const changed = all.filter((x) => x.r.type !== 'same');
  const hit = changed.find((x) => lineOf(x.r).b === want.b || lineOf(x.r).a === want.a) ?? changed[0] ?? all[0]!;
  const end = Math.min(all.length, Math.max(0, hit.i - 3) + HUNK);
  return all.slice(Math.max(0, end - HUNK), end);
}

/** Before/after of the block the change lives in (operation or schema), aligned row by row (OA-10). Side by side or inline. */
function Snippet({ c, before, after, layoutSwitch }: { c: Change; before: string; after: string; layoutSwitch: boolean }) {
  const [chosen, setLayout] = useState<Layout>('split');
  // AWorkspace shows the hunk side by side; the Inline switch belongs to the review view.
  const layout = layoutSwitch ? chosen : 'split';
  const ex = useMemo(() => excerpts(c, before, after), [c, before, after]);
  const d = useMemo(() => diffText(ex.before.lines.join('\n') + '\n', ex.after.lines.join('\n') + '\n', { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word', filters: [], transforms: [] }), [ex]);
  const shown = useMemo(() => windowRows(d.rows, { b: ex.before.start, a: ex.after.start }, c).filter(({ r }) => r.left || r.right), [d, ex, c]);
  const files = useApp();
  const line = (side: 'left' | 'right', r: Rows[number], key: string | number, inline = false) => {
    const s = r[side];
    const kind = !s ? 'empty' : r.type === 'same' ? 'same' : side === 'left' ? 'del' : 'add';
    const n = s ? (side === 'left' ? ex.before.start : ex.after.start) + s.n - 1 : '';
    return (
      <div key={key} className={inline ? css.iline : css.line} data-kind={kind}>
        {inline ? (
          <>
            <span className={css.num}>{r.left && (side === 'left' || r.type === 'same') ? ex.before.start + r.left.n - 1 : ''}</span>
            <span className={css.num}>{r.right && (side === 'right' || r.type === 'same') ? ex.after.start + r.right.n - 1 : ''}</span>
          </>
        ) : (
          <span className={css.num}>{n}</span>
        )}
        <span className={css.gut} aria-hidden="true">{kind === 'del' ? '−' : kind === 'add' ? '+' : ''}</span>
        <span className={css.code}>{s?.segs.map((g, j) => (g.kind === 'same' ? g.text : <mark key={j} className={g.kind === 'add' ? css.wAdd : css.wDel}>{g.text}</mark>))}{kind === 'del' || kind === 'add' ? <span className="sd-visually-hidden">{kind === 'del' ? ' (removed)' : ' (added)'}</span> : null}</span>
      </div>
    );
  };
  const empty = (side: 'left' | 'right') => (side === 'left' ? !ex.before.lines.length : !ex.after.lines.length);
  return (
    <div className={css.snippet}>
      {layoutSwitch && (
        <div className={css.snippetBar}>
          <SegmentedControl label="Diff layout" size="sm" value={layout} onValueChange={setLayout} options={[{ value: 'split', label: 'Side by side' }, { value: 'inline', label: 'Inline' }]} />
        </div>
      )}
      {layout === 'split' ? (
        <div className={css.split}>
          {/* Panes scroll sideways on long lines, so they take keyboard focus (axe scrollable-region-focusable). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={css.pane} role="region" aria-label={`Before: ${files.before?.name ?? ''}`} tabIndex={0}>
            <div className={css.paneHead}>{files.before?.name}</div>
            {empty('left') ? <p className={css.paneEmpty}>Not in this version.</p> : shown.map(({ r, i }) => line('left', r, i))}
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={css.pane} role="region" aria-label={`After: ${files.after?.name ?? ''}`} tabIndex={0}>
            <div className={css.paneHead}>{files.after?.name}</div>
            {empty('right') ? <p className={css.paneEmpty}>Not in this version.</p> : shown.map(({ r, i }) => line('right', r, i))}
          </div>
        </div>
      ) : (
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
        <div className={css.inline} role="region" aria-label={`Inline: ${files.before?.name ?? ''} to ${files.after?.name ?? ''}`} tabIndex={0}>
          <div className={css.paneHead}>{files.before?.name} → {files.after?.name}</div>
          {shown.flatMap(({ r, i }) => (r.type === 'same' ? [line('left', r, i, true)] : [r.left ? line('left', r, `${i}-l`, true) : null, r.right ? line('right', r, `${i}-r`, true) : null]))}
        </div>
      )}
    </div>
  );
}
