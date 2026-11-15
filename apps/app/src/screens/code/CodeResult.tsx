// A-09 Code diff (Beta; CD-01..CD-06) and A-09 fallback to text (CD-04).
import type { CodeDiff, CodeItem, CodeStatus } from '@specdiff/core/code';
import type { Row, Seg } from '@specdiff/core/text';
import { BetaLabel, Button, Checkbox, IdenticalState, SegmentedControl, useToast } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, readChangeHash, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { TextResult } from '../text/TextResult';
import { VirtualList } from '../../lib/VirtualList';
import css from './CodeResult.module.css';
import { structuralRows } from './rows';

/** A name the user gave (a file), not the "Before"/"After" placeholder of pasted text. */
const realName = (n: string | undefined) => (n && n !== 'Before' && n !== 'After' ? n : undefined);

export default function CodeResult() {
  const { result, before, after } = useApp();
  const [dismissed, setDismissed] = useState(false);
  if (!result || !('code' in result)) return null;
  const outcome = result.code;
  if ('fallback' in outcome) {
    const name = realName(after?.name) ?? realName(before?.name);
    // The worker names the language from the extension or the content ("Go"); never the file name.
    const language = 'language' in result && result.language ? result.language : undefined;
    return (
      <div className={css.page}>
        {!dismissed && (
          <div className={css.notice} role="status">
            <icons.TriangleAlert size={16} aria-hidden="true" className={css.warnIcon} />
            <div>
              <p className={css.noticeTitle}>Showing a text diff{name ? ` for ${name}` : ''}</p>
              <p className={css.noticeBody}>
                {outcome.fallback === 'unsupported'
                  ? `Structural diff supports TypeScript, JavaScript, Java and Python for now.${language ? ` ${language} is on the list.` : ''}`
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
  return <Structural diff={withoutContainerEcho(outcome)} />;
}

/**
 * A-09: a class whose only edits are inside its members is not a change of its own: its members are listed
 * ("1 logic change", not 2). Core marks such a parent "changed"; compare its text with the members cut out.
 */
export function withoutContainerEcho(d: CodeDiff): CodeDiff {
  const echo = (item: CodeItem) => {
    if (item.status !== 'changed' || !item.beforeText || !item.afterText) return false;
    const kids = d.items.filter((i) => i !== item && i.name.startsWith(`${item.name}.`));
    if (!kids.length) return false;
    const strip = (text: string, side: 'beforeText' | 'afterText') =>
      kids
        .map((k) => k[side])
        .filter((t): t is string => !!t)
        .sort((a, b) => b.length - a.length)
        .reduce((t, k) => t.split(k).join(''), text)
        .replace(/\s+/g, '');
    return strip(item.beforeText, 'beforeText') === strip(item.afterText, 'afterText');
  };
  const items = d.items.filter((i) => !echo(i));
  if (items.length === d.items.length) return d;
  const stats = Object.fromEntries(Object.keys(d.stats).map((k) => [k, 0])) as CodeDiff['stats'];
  for (const i of items) stats[i.status]++;
  return { ...d, items, stats, logicChanged: stats.changed + stats.added + stats.removed > 0 };
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

const itemId = (i: CodeItem) => `k-${i.name}`;

function Structural({ diff }: { diff: CodeDiff }) {
  const { before, after, viewed, toggleViewed } = useApp();
  const { toast } = useToast();
  // X-12: start on the change named in the URL hash, if any.
  const [cur, setCur] = useState(() => {
    const id = readChangeHash();
    const k = id ? diff.items.filter((i) => i.status !== 'same' && i.status !== 'formatting').findIndex((i) => itemId(i) === id) : -1;
    return Math.max(0, k);
  });
  const [view, setView] = useState<'structural' | 'text'>('structural');
  const [hideRenames, setHideRenames] = useState(true);
  const [hideComments, setHideComments] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  // A-09: per-declaration rows; moved methods as ↕ rows; formatting, hidden comments and hidden renames fold (CD-06).
  const views = useMemo(
    () => structuralRows(diff, before?.content ?? '', after?.content ?? '', { hideRenames, hideComments }),
    [diff, before?.content, after?.content, hideRenames, hideComments],
  );

  const formattingLines = diff.items.filter((i) => i.status === 'formatting').reduce((n, i) => n + ((i.lines.after?.[1] ?? 0) - (i.lines.after?.[0] ?? 0) + 1), 0);
  const listed = diff.items.filter((i) => i.status !== 'same' && i.status !== 'formatting' && !(hideComments && i.status === 'comments'));
  // X-11 / X-12: navigate, mark viewed and link to the listed items.
  // The change id this screen last navigated to; others come from outside (the command palette).
  const handled = useRef<string | null>(useNav.getState().changeId);
  const goTo = useCallback((k: number) => {
    if (!listed.length) return;
    const n = (k + listed.length) % listed.length;
    setCur(n);
    handled.current = itemId(listed[n]!);
    focusChange(itemId(listed[n]!));
    requestAnimationFrame(() => document.getElementById(itemId(listed[n]!))?.focus());
  }, [listed]);
  // The palette (and other screens) call focusChange(id): follow it here too.
  useEffect(
    () =>
      useNav.subscribe((st) => {
        const id = st.changeId;
        if (!id || id === handled.current) return;
        const k = listed.findIndex((i) => itemId(i) === id);
        if (k >= 0) goTo(k);
      }),
    [listed, goTo],
  );
  useCommand('next-change', useCallback(() => goTo(cur + 1), [goTo, cur]));
  useCommand('prev-change', useCallback(() => goTo(cur - 1), [goTo, cur]));
  useCommand('mark-viewed', useCallback(() => { const i = listed[cur]; if (i) toggleViewed(itemId(i)); }, [listed, cur, toggleViewed]));
  useCommand('copy-link', useCallback(() => { const i = listed[cur]; if (i) void navigator.clipboard?.writeText(changeLink(itemId(i))).then(() => toast({ title: 'Link to this change copied' })); }, [listed, cur, toast]));
  useEffect(() => {
    const id = readChangeHash();
    if (id) document.getElementById(id)?.focus();
  }, []);
  const items = useMemo(() => views.flatMap((v) => (v.kind === 'fold' && open.has(v.id) ? v.rows.map((row) => ({ kind: 'row' as const, row })) : [v])), [views, open]);
  const seen = listed.filter((i) => viewed[itemId(i)]).length;

  return (
    <div className={css.page}>
      <h1 className={css.h1}>{title(diff)} <BetaLabel /></h1>
      <div className={css.layout}>
        <section className={css.pane} aria-label="Code diff">
          <header className={css.paneHead}>
            <span className={css.file}>{after?.name}</span>
 <SegmentedControl className={css.viewSwitch} label="View" size="sm" value={view} onValueChange={setView} options={[{ value: 'structural', label: 'Structural' }, { value: 'text', label: 'Text' }]} />
          </header>
          {view === 'text' ? <TextResult /> : (
            // X-02: one item per visible line (opened folds expand), windowed above VIRTUAL_THRESHOLD rows.
            <VirtualList
              count={items.length}
              estimate={22}
              // Always the windowed form: it is the focusable "Code" region at every size.
              threshold={0}
              label="Code"
              className={css.code}
              height="min(70vh, 720px)"
              render={(i, slot) => {
                const v = items[i]!;
                const body =
                  v.kind === 'row' ? <Line row={v.row} /> : v.kind === 'moved' ? <MovedLine n={v.n} from={v.from} segs={v.segs} first={v.first} /> : (
                    <div className={css.fold}>
                      <icons.Check size={14} aria-hidden="true" className={css.ok} /> {v.reason}
                      <button type="button" className={css.show} onClick={() => setOpen(new Set(open).add(v.id))}>Show</button>
                    </div>
                  );
                return slot ? <div key={i} data-index={slot['data-index']} style={slot.style} ref={slot.measure}>{body}</div> : <div key={i}>{body}</div>;
              }}
            />
          )}
        </section>
        <aside className={css.panel} aria-labelledby="what-changed">
          <h2 id="what-changed" className={css.panelTitle}>What changed</h2>
          <ul className={css.items}>
            {listed.map((i) => (
              <li key={`${i.status}-${i.name}`} id={itemId(i)} tabIndex={-1} className={css.item} data-current={listed[cur] === i || undefined}>
                <span className={css.badge} data-status={i.status}>{BADGE[i.status]}</span>
                <span className={css.desc}>{i.status === 'renamedLocals' ? <>{i.renames!.map((r, k) => <span key={r.from}>{k ? ', ' : ''}<code>{r.from}</code> → <code>{r.to}</code>, {r.uses} use{r.uses === 1 ? '' : 's'}</span>)} <span className={css.muted2}>in {i.name}</span></> : i.status === 'renamed' ? <><code>{i.from}</code> → <code>{i.name}</code></> : i.status === 'moved' ? <><code>{i.name}</code>, line {i.lines.before?.[0]} → {i.lines.after?.[0]}</> : <><code>{i.name}</code> {i.status === 'added' ? 'added' : i.status === 'removed' ? 'removed' : i.status === 'comments' ? 'comments changed' : 'changed'}</>}</span>
                <button type="button" className={css.viewed} aria-pressed={!!viewed[itemId(i)]} aria-label={`Mark ${i.name} as viewed`} onClick={() => toggleViewed(itemId(i))}>
                  {viewed[itemId(i)] ? <icons.CheckSquare size={14} aria-hidden="true" /> : <icons.Square size={14} aria-hidden="true" />}
                </button>
              </li>
            ))}
            {listed.length > 0 && <li className={css.item}><span className={css.muted2}>{seen} of {listed.length} viewed</span></li>}
            {formattingLines > 0 && <li className={css.item}><span className={css.badge} data-status="formatting">Format</span><span>{formattingLines} lines, hidden</span></li>}
          </ul>
          <Checkbox label="Hide renames" checked={hideRenames} onCheckedChange={(c) => { setHideRenames(c); setOpen(new Set()); }} />
          <Checkbox label="Hide comment-only changes" checked={hideComments} onCheckedChange={(c) => { setHideComments(c); setOpen(new Set()); }} />
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

/** A line of a moved declaration at its new place: `↕`, the changed colours, "moved from line N" on the first line. */
function MovedLine({ n, from, segs, first }: { n: number; from: number; segs: Seg[]; first: boolean }) {
  return (
    <div className={css.line} data-kind="moved">
      <span className={css.num} />
      <span className={css.num}>{n}</span>
      <span className={css.gutter} aria-hidden="true">↕</span>
      <span className={css.text}>
        {segs.map((s) => s.text).join('')}
        {first ? <span className={css.movedNote}>   moved from line {from}</span> : <span className="sd-visually-hidden"> (moved from line {from})</span>}
      </span>
    </div>
  );
}
