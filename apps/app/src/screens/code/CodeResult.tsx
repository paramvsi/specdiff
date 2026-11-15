// A-09 Code diff (Beta; CD-01..CD-06) and A-09 fallback to text (CD-04).
import type { CodeDiff, CodeItem, CodeStatus } from '@specdiff/core/code';
import type { Row } from '@specdiff/core/text';
import { BetaLabel, Button, Checkbox, IdenticalState, SegmentedControl, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, readChangeHash } from '../../shell/nav';
import { useApp } from '../../state/store';
import { TextResult } from '../text/TextResult';
import css from './CodeResult.module.css';

const LANG_NAME: Record<string, string> = { typescript: 'TypeScript', tsx: 'TypeScript', javascript: 'JavaScript', java: 'Java', python: 'Python', go: 'Go', ruby: 'Ruby', rust: 'Rust', kotlin: 'Kotlin', csharp: 'C#' };
const extLang = (name: string) => LANG_NAME[({ go: 'go', rb: 'ruby', rs: 'rust', kt: 'kotlin', cs: 'csharp' } as Record<string, string>)[name.split('.').pop() ?? ''] ?? ''] ?? name.split('.').pop()?.toUpperCase() ?? 'this language';

export default function CodeResult() {
  const { result, before, after } = useApp();
  const [dismissed, setDismissed] = useState(false);
  if (!result || !('code' in result)) return null;
  const outcome = result.code;
  if ('fallback' in outcome) {
    const name = after?.name ?? before?.name ?? 'this file';
    return (
      <div className={css.page}>
        {!dismissed && (
          <div className={css.notice} role="status">
            <div>
              <p className={css.noticeTitle}>Showing a text diff for {name}</p>
              <p className={css.noticeBody}>
                {outcome.fallback === 'unsupported'
                  ? `Structural diff supports TypeScript, JavaScript, Java and Python for now. ${extLang(name)} is on the list.`
                  : `${outcome.side === 'before' ? before?.name : after?.name} has a syntax error${outcome.line ? ` near line ${outcome.line}` : ''}, so the structure can't be read. Fix it to see a structural diff.`}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setDismissed(true)}>Dismiss</Button>
          </div>
        )}
        <TextResult />
      </div>
    );
  }
  if (outcome.items.every((i) => i.status === 'same')) return <IdenticalState ignoredLines={0} />;
  return <Structural diff={outcome} rows={result.text.rows} />;
}

const BADGE: Partial<Record<CodeStatus, string>> = { renamed: 'Renamed', renamedLocals: 'Renamed', moved: 'Moved', changed: 'Logic', added: 'Added', removed: 'Removed', formatting: 'Format', comments: 'Comments' };

function title(d: CodeDiff): string {
  const s = d.stats;
  const parts = [
    s.changed + s.added + s.removed && `${s.changed + s.added + s.removed} logic change${s.changed + s.added + s.removed > 1 ? 's' : ''}`,
    s.moved && `${s.moved} move${s.moved > 1 ? 's' : ''}`,
    s.renamed + s.renamedLocals && `${s.renamed + s.renamedLocals} rename${s.renamed + s.renamedLocals > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : s.formatting || s.comments ? 'No logic change' : 'No changes';
}

type V = { kind: 'row'; row: Row } | { kind: 'fold'; rows: Row[]; reason: string; id: number };

const itemId = (i: CodeItem) => `k-${i.name}`;

function Structural({ diff, rows }: { diff: CodeDiff; rows: Row[] }) {
  const { before, after, viewed, toggleViewed } = useApp();
  const { toast } = useToast();
  const [cur, setCur] = useState(0);
  const [view, setView] = useState<'structural' | 'text'>('structural');
  const [hideRenames, setHideRenames] = useState(true);
  const [hideComments, setHideComments] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const quiet = useMemo(() => {
    const statuses = new Set<CodeStatus>(['formatting', ...(hideRenames ? (['renamed', 'renamedLocals'] as const) : []), ...(hideComments ? (['comments'] as const) : [])]);
    return diff.items.filter((i) => statuses.has(i.status));
  }, [diff, hideRenames, hideComments]);

  const views = useMemo<V[]>(() => {
    const inside = (r: Row, i: CodeItem) => (r.right && i.lines.after && r.right.n >= i.lines.after[0] && r.right.n <= i.lines.after[1]) || (r.left && i.lines.before && r.left.n >= i.lines.before[0] && r.left.n <= i.lines.before[1]);
    const out: V[] = [];
    let buf: Row[] = [];
    let id = 0;
    const flush = () => {
      if (!buf.length) return;
      const changed = buf.filter((r) => r.type !== 'same').length;
      if (changed) out.push({ kind: 'fold', rows: buf, reason: `${buf.length} lines reformatted, no logic change`, id: id++ });
      else out.push(...buf.map((row) => ({ kind: 'row' as const, row })));
      buf = [];
    };
    for (const r of rows) {
      if (quiet.some((i) => inside(r, i))) buf.push(r);
      else { flush(); out.push({ kind: 'row', row: r }); }
    }
    flush();
    return out;
  }, [rows, quiet]);

  const formattingLines = diff.items.filter((i) => i.status === 'formatting').reduce((n, i) => n + ((i.lines.after?.[1] ?? 0) - (i.lines.after?.[0] ?? 0) + 1), 0);
  const listed = diff.items.filter((i) => i.status !== 'same' && i.status !== 'formatting' && !(hideComments && i.status === 'comments'));
  // X-11 / X-12: navigate, mark viewed and link to the listed items.
  const goTo = useCallback((k: number) => {
    if (!listed.length) return;
    const n = (k + listed.length) % listed.length;
    setCur(n);
    focusChange(itemId(listed[n]!));
    requestAnimationFrame(() => document.getElementById(itemId(listed[n]!))?.focus());
  }, [listed]);
  useCommand('next-change', useCallback(() => goTo(cur + 1), [goTo, cur]));
  useCommand('prev-change', useCallback(() => goTo(cur - 1), [goTo, cur]));
  useCommand('mark-viewed', useCallback(() => { const i = listed[cur]; if (i) toggleViewed(itemId(i)); }, [listed, cur, toggleViewed]));
  useCommand('copy-link', useCallback(() => { const i = listed[cur]; if (i) void navigator.clipboard?.writeText(changeLink(itemId(i))).then(() => toast({ title: 'Link to this change copied' })); }, [listed, cur, toast]));
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    const id = readChangeHash();
    const k = id ? listed.findIndex((i) => itemId(i) === id) : -1;
    if (k >= 0) goTo(k);
  }, [listed, goTo]);
  const seen = listed.filter((i) => viewed[itemId(i)]).length;

  return (
    <div className={css.page}>
      <h1 className={css.h1}>{title(diff)} <BetaLabel /></h1>
      <div className={css.layout}>
        <section className={css.pane} aria-label="Code diff">
          <header className={css.paneHead}>
            <span className={css.file}>{after?.name}</span>
            <SegmentedControl label="View" size="sm" value={view} onValueChange={setView} options={[{ value: 'structural', label: 'Structural' }, { value: 'text', label: 'Text' }]} />
          </header>
          {view === 'text' ? <TextResult /> : (
            <div className={css.code}>
              {views.map((v, i) =>
                v.kind === 'row' ? <Line key={i} row={v.row} /> : open.has(v.id) ? v.rows.map((r, j) => <Line key={`${i}-${j}`} row={r} />) : (
                  <div key={i} className={css.fold}>
                    <icons.Check size={14} aria-hidden="true" className={css.ok} /> {v.reason}
                    <button type="button" className={css.show} onClick={() => setOpen(new Set(open).add(v.id))}>Show</button>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
        <aside className={css.panel} aria-labelledby="what-changed">
          <h2 id="what-changed" className={css.panelTitle}>What changed</h2>
          <ul className={css.items}>
            {listed.map((i) => (
              <li key={`${i.status}-${i.name}`} id={itemId(i)} tabIndex={-1} className={css.item} data-current={listed[cur] === i || undefined}>
                <span className={css.badge} data-status={i.status}>{BADGE[i.status]}</span>
                <span>{i.status === 'renamedLocals' ? <>{i.renames!.map((r, k) => <span key={r.from}>{k ? ', ' : ''}<code>{r.from}</code> → <code>{r.to}</code>, {r.uses} use{r.uses === 1 ? '' : 's'}</span>)} <span className={css.muted2}>in {i.name}</span></> : i.status === 'renamed' ? <><code>{i.from}</code> → <code>{i.name}</code></> : i.status === 'moved' ? <><code>{i.name}</code>, line {i.lines.before?.[0]} → {i.lines.after?.[0]}</> : <><code>{i.name}</code> {i.status === 'added' ? 'added' : i.status === 'removed' ? 'removed' : i.status === 'comments' ? 'comments changed' : 'changed'}</>}</span>
                <button type="button" className={css.viewed} aria-pressed={!!viewed[itemId(i)]} aria-label={`Mark ${i.name} as viewed`} onClick={() => toggleViewed(itemId(i))}>
                  {viewed[itemId(i)] ? <icons.CheckSquare size={14} aria-hidden="true" /> : <icons.Square size={14} aria-hidden="true" />}
                </button>
              </li>
            ))}
            {listed.length > 0 && <li className={css.item}><span className={css.muted2}>{seen} of {listed.length} viewed</span></li>}
            {formattingLines > 0 && <li className={css.item}><span className={css.badge} data-status="formatting">Format</span><span>{formattingLines} lines, hidden</span></li>}
          </ul>
          <Checkbox label="Hide renames" checked={hideRenames} onCheckedChange={setHideRenames} />
          <Checkbox label="Hide comment-only changes" checked={hideComments} onCheckedChange={setHideComments} />
          <p className={css.note}>{before?.name} → {after?.name}</p>
        </aside>
      </div>
    </div>
  );
}

function Line({ row }: { row: Row }) {
  const kind = row.type === 'same' ? 'same' : row.type === 'del' ? 'del' : row.type === 'add' ? 'add' : 'change';
  if (kind === 'change') return <><Line row={{ type: 'del', ...(row.left ? { left: row.left } : {}) }} /><Line row={{ type: 'add', ...(row.right ? { right: row.right } : {}) }} /></>;
  const segs = (kind === 'del' ? row.left : row.right)?.segs ?? [];
  return (
    <div className={css.line} data-kind={kind}>
      <span className={css.num}>{row.left?.n ?? ''}</span>
      <span className={css.num}>{row.right?.n ?? ''}</span>
      <span className={css.gutter} aria-hidden="true">{kind === 'del' ? '−' : kind === 'add' ? '+' : ''}</span>
      <span className={css.text}>{segs.map((s, i) => (s.kind === 'same' ? <span key={i}>{s.text}</span> : <mark key={i} className={s.kind === 'add' ? css.wAdd : css.wDel}>{s.text}</mark>))}{kind !== 'same' && <span className="sd-visually-hidden">{kind === 'del' ? ' (removed)' : ' (added)'}</span>}</span>
    </div>
  );
}
