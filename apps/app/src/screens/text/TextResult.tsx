// A-03 Text diff (TX-01..TX-12): split/unified, precision, ignore options, filters with hit counts,
// transforms, wrap, go to line, next/previous change with an overview ruler, folding, live re-diff,
// syntax highlighting (TX-03), moved blocks (TX-11, A03-MovedBlock), patches (TX-12), reload a side (IN-06),
// mark as viewed (X-11) and deep links #change=t-<n> (X-12).
import { Config, type TextFilter } from '@specdiff/core';
import { foldRows, MASK, type Move, type Row, type Seg, type View } from '@specdiff/core/text';
import {
  Button,
  Checkbox,
  Dialog,
  MaskedText,
  Menu,
  SegmentedControl,
  TextField,
  useToast,
} from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCommand } from '../../shell/commands';
import { changeLink, focusChange, readChangeHash, useNav } from '../../shell/nav';
import { useApp } from '../../state/store';
import { languageFor, MAX_BYTES, MAX_ROWS, tokenize, type Token } from './highlight';
import { ReloadButton } from './ReloadButton';
import css from './TextResult.module.css';

type Layout = 'split' | 'unified';
/** Core's views plus TX-12 gaps (lines a patch leaves out) and TX-11 move banners. */
type TView =
  | View
  | { kind: 'gap'; before: number; after: number }
  | { kind: 'move'; move: number; end: 'from' | 'to' };
type Tokens = { text: unknown; left: Map<number, Token[]>; right: Map<number, Token[]> };

export const blockId = (i: number) => `t-${i}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function TextResult() {
  const { result, before, after, settings, updateConfig, compare, setText, viewed, toggleViewed } =
    useApp();
  const { toast } = useToast();
  const text = result && 'text' in result ? result.text : null;
  const detectedLanguage = result && 'language' in result ? result.language : undefined;
  const opts = Config.parse(settings.config).text;
  const [layout, setLayout] = useState<Layout>(() =>
    window.matchMedia?.('(max-width: 1023px)').matches ? 'unified' : 'split',
  );
  const [wrap, setWrap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(opts.filters.length > 0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState(0);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // TX-07: the row Go to line asked for; scrolled to once the views include it (after a fold expands).
  const pendingRow = useRef<number | null>(null);
  const [gotoTick, setGotoTick] = useState(0);

  const setText2 = (patch: Partial<typeof opts>) => {
    updateConfig((c) => ({ ...c, text: { ...c.text, ...patch } }));
  };
  // Re-diff when the options differ from the ones this result was made with (TX-10 covers edits too).
  // Comparing with comparedConfig (not a "first run" ref) keeps StrictMode's double effects from looping.
  const comparedText = useApp((s) => s.comparedConfig?.text);
  useEffect(() => {
    if (settings.config.text === comparedText) return;
    // TX-10: re-diff in the background; the current result stays on screen until the new one is ready.
    const t = setTimeout(() => void compare({ background: true }), 250);
    return () => clearTimeout(t);
  }, [settings.config.text, comparedText, compare]);

  const views: TView[] = useMemo(() => (text ? withExtras(foldRows(text.rows, 3, expanded), text) : []), [text, expanded]);
  const blockView = useMemo(
    () => text?.blocks.map((b) => views.findIndex((v) => v.kind === 'row' && v.index === b)) ?? [],
    [text, views],
  );
  // Row index → block index, for the viewed marker and focus target on the first row of each block.
  const blockAt = useMemo(() => new Map(text?.blocks.map((b, i) => [b, i]) ?? []), [text]);

  // TX-03: highlight lazily; off for plain text, logs and very large comparisons.
  // Code mode reports display names ("TypeScript"); Shiki ids are lower case.
  const detectedId = detectedLanguage?.toLowerCase();
  const lang = languageFor(after?.name, detectedId) ?? languageFor(before?.name, detectedId);
  const tooBig =
    !!text && (text.rows.length > MAX_ROWS || (before?.size ?? 0) + (after?.size ?? 0) > MAX_BYTES);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  useEffect(() => {
    if (!text || !lang || tooBig) return;
    let live = true;
    const side = (pick: 'left' | 'right') => {
      const idx: number[] = [];
      const lines: string[] = [];
      text.rows.forEach((r, i) => {
        const s = r[pick];
        if (!s) return;
        idx.push(i);
        lines.push(s.segs.map((x) => x.text).join(''));
      });
      return { idx, lines };
    };
    const L = side('left');
    const R = side('right');
    const toMap = (s: { idx: number[]; lines: string[] }, toks: Token[][]) => {
      const m = new Map<number, Token[]>();
      s.idx.forEach((ri, k) => {
        const t = toks[k];
        // Only use tokens that cover the line exactly; masked lines (‹name›) stay plain.
        if (t && !s.lines[k]!.includes('‹') && t.map((x) => x.content).join('') === s.lines[k]) m.set(ri, t);
      });
      return m;
    };
    void Promise.all([tokenize(lang, L.lines.join('\n')), tokenize(lang, R.lines.join('\n'))])
      .then(([lt, rt]) => {
        if (live) setTokens({ text, left: toMap(L, lt), right: toMap(R, rt) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [text, lang, tooBig]);
  const hl = tokens && tokens.text === text && !tooBig ? tokens : null;
  const v = useVirtualizer({
    count: views.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 22,
    overscan: 30,
  });

  /** Scroll to a view and move focus to the element with that id once the virtualiser has rendered it. */
  const reveal = useCallback(
    (viewIndex: number, focusId?: string) => {
      v.scrollToIndex(Math.max(0, viewIndex - 2), { align: 'start' });
      if (!focusId) return;
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(focusId);
        if (el) el.focus({ preventScroll: true });
        else if (tries++ < 10) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [v],
  );
  // The change id this screen last navigated to; others come from outside (the command palette).
  const handled = useRef<string | null>(useNav.getState().changeId);
  const go = useCallback(
    (i: number, focus = false) => {
      if (!blockView.length) return;
      const n = (i + blockView.length) % blockView.length;
      setCurrent(n);
      handled.current = blockId(n);
      focusChange(blockId(n)); // X-12: #change=t-<n>
      reveal(blockView[n]!, focus ? `sd-${blockId(n)}` : undefined);
    },
    [blockView, reveal],
  );
  useEffect(() => {
    const ri = pendingRow.current;
    if (ri === null) return;
    const vi = views.findIndex((x) => x.kind === 'row' && x.index === ri);
    if (vi < 0) return;
    pendingRow.current = null;
    v.scrollToIndex(vi, { align: 'start' });
  }, [views, gotoTick, v]);
  // The palette (and other screens) call focusChange(id): follow it here too.
  const navChange = useNav((s) => s.changeId);
  useEffect(() => {
    if (!navChange || navChange === handled.current) return;
    const m = /^t-(\d+)$/.exec(navChange);
    if (m && Number(m[1]) < blockView.length) go(Number(m[1]), true);
  }, [navChange, blockView, go]);
  // X-12: open the block in the URL hash once, on first render.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !blockView.length) return;
    linked.current = true;
    const m = /^t-(\d+)$/.exec(readChangeHash() ?? '');
    if (m && Number(m[1]) < blockView.length) go(Number(m[1]), true);
  }, [blockView, go]);
  const currentId = blockId(current);
  useCommand(
    'mark-viewed',
    useCallback(() => {
      if (blockView.length) toggleViewed(currentId);
    }, [blockView, currentId, toggleViewed]),
  );
  useCommand(
    'copy-link',
    useCallback(() => {
      if (!blockView.length) return;
      void navigator.clipboard
        ?.writeText(changeLink(currentId))
        .then(() => toast({ title: 'Link to this change copied' }))
        .catch(() => toast({ title: "Couldn't copy the link", tone: 'error' }));
    }, [blockView, currentId, toast]),
  );
  useCommand(
    'next-change',
    useCallback(() => go(current + 1), [go, current]),
  );
  useCommand(
    'prev-change',
    useCallback(() => go(current - 1), [go, current]),
  );
  useCommand(
    'toggle-unified',
    useCallback(() => setLayout((l) => (l === 'split' ? 'unified' : 'split')), []),
  );
  useCommand(
    'toggle-wrap',
    useCallback(() => setWrap((w) => !w), []),
  );
  useCommand(
    'toggle-filters',
    useCallback(() => setFiltersOpen((f) => !f), []),
  );
  useCommand(
    'go-to-line',
    useCallback(() => setGotoOpen(true), []),
  );
  useCommand(
    'show-unchanged',
    useCallback(
      () =>
        setExpanded(
          new Set(views.filter((x) => x.kind === 'fold').map((x) => (x as { from: number }).from)),
        ),
      [views],
    ),
  );

  if (!text) return null;
  const moves = text.moves ?? [];
  const movedLines = moves.reduce((n, m) => n + m.to[1] - m.to[0] + 1, 0);
  const plus = text.stats.added + text.stats.changed - movedLines;
  const minus = text.stats.removed + text.stats.changed - movedLines;
  const masked = text.filters.reduce((n, f) => n + f.hits, 0);
  const total = text.blocks.length;
  const seen = text.blocks.filter((_, i) => viewed[blockId(i)]).length;
  // "1 move, 1 edit" (A03-MovedBlock): edits are blocks that aren't only moved lines, plus moves edited inside.
  const editBlocks = text.blocks.filter((b, i) => {
    const end = text.blocks[i + 1] ?? text.rows.length;
    return text.rows.slice(b, end).some((r) => r.type !== 'same' && r.move === undefined);
  }).length;
  const edits = editBlocks + moves.filter((m) => m.edited).length;

  const renderCell = (
    side: Row['left'],
    kind: 'del' | 'add' | 'same',
    toks?: Token[],
    moved?: boolean,
  ) => (
    <div className={css.cell} data-kind={side ? (moved ? 'moved' : kind) : 'empty'}>
      <span className={css.num}>{side?.n ?? ''}</span>
      <span className={css.gutter} aria-hidden="true">
        {side ? (moved ? '↕' : kind === 'del' ? '−' : kind === 'add' ? '+' : '') : ''}
      </span>
      <span className={wrap ? css.codeWrap : css.code}>
        {side && <Segs segs={side.segs} tokens={toks} />}
        {side && kind !== 'same' && (
          <span className="sd-visually-hidden">
            {moved
              ? kind === 'del'
                ? ' (moved away)'
                : ' (moved here)'
              : kind === 'del'
                ? ' (removed)'
                : ' (added)'}
          </span>
        )}
      </span>
    </div>
  );
  const jumpTo = (m: number, end: 'from' | 'to') => {
    const vi = views.findIndex((x) => x.kind === 'move' && x.move === m && x.end === end);
    if (vi >= 0) reveal(vi, `sd-move-${m}-${end}`);
  };

  return (
    <div className={css.page}>
      <header className={css.head}>
        <h1 className={css.h1}>
          {moves.length
            ? `${plural(moves.length, 'move')}, ${plural(edits, 'edit')}`
            : `${plus + minus} lines differ${opts.filters.length ? ' after filters' : ''}`}
        </h1>
        <p className={css.stats}>
          <span className={css.add}>+ {plus}</span> lines <span className={css.del}>− {minus}</span>{' '}
          lines
          {moves.length ? (
            <span className={css.moved}>
              <span aria-hidden="true">↕</span> {movedLines} moved
            </span>
          ) : null}
          {masked ? (
            <>
              {' '}
              <span>{masked} masked</span>
            </>
          ) : null}
          {text.approximate ? (
            <span> · The files differ almost everywhere, so lines are paired by position.</span>
          ) : null}
          {total ? (
            <>
              <span className={css.progress} data-testid="viewed-progress">
                {seen} of {total} viewed
              </span>
              <span className={css.viewedToggle}>
                <Checkbox
                  label="Viewed"
                  checked={!!viewed[currentId]}
                  onCheckedChange={() => toggleViewed(currentId)}
                />
              </span>
            </>
          ) : null}
        </p>
      </header>

      <div className={css.toolbar} role="toolbar" aria-label="Diff options">
        <SegmentedControl
          label="Layout"
          value={layout}
          onValueChange={setLayout}
          options={[
            { value: 'split', label: 'Split' },
            { value: 'unified', label: 'Unified' },
          ]}
        />
        <SegmentedControl
          label="Precision"
          value={opts.precision}
          onValueChange={(p) => setText2({ precision: p })}
          options={[
            { value: 'smart', label: 'Smart' },
            { value: 'word', label: 'Word' },
            { value: 'char', label: 'Char' },
          ]}
        />
        <span className={css.sep} aria-hidden="true" />
        <Checkbox
          label="Ignore whitespace"
          checked={opts.ignoreWhitespace}
          onCheckedChange={(c) => setText2({ ignoreWhitespace: c })}
        />
        <Checkbox
          label="Ignore case"
          checked={opts.ignoreCase}
          onCheckedChange={(c) => setText2({ ignoreCase: c })}
        />
        <Checkbox
          label="Ignore line endings"
          checked={opts.ignoreLineEndings}
          onCheckedChange={(c) => setText2({ ignoreLineEndings: c })}
        />
        <span className={css.sep} aria-hidden="true" />
        <button
          type="button"
          className={css.filtersBtn}
          aria-pressed={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <icons.Filter size={15} aria-hidden="true" /> Filters{' '}
          {opts.filters.length > 0 && <span className={css.count}>{opts.filters.length}</span>}
        </button>
        <Menu
          trigger={
            <Button variant="secondary">
              Transform <icons.ChevronDown size={15} aria-hidden="true" />
            </Button>
          }
          items={(['sortLines', 'lowercase', 'trim', 'normaliseLineBreaks'] as const).map((t) => ({
            label: `${opts.transforms.includes(t) ? '✓ ' : ''}${{ sortLines: 'Sort lines', lowercase: 'Lowercase', trim: 'Trim lines', normaliseLineBreaks: 'Normalise line breaks' }[t]}`,
            onSelect: () =>
              setText2({
                transforms: opts.transforms.includes(t)
                  ? opts.transforms.filter((x) => x !== t)
                  : [...opts.transforms, t],
              }),
          }))}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<icons.WrapText size={16} />}
          aria-label={wrap ? 'Turn word wrap off' : 'Turn word wrap on'}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<icons.Pencil size={15} />}
          aria-label={editing ? 'Stop editing' : 'Edit both sides'}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        />
        <div className={css.nav}>
          <Button
            variant="secondary"
            iconOnly
            icon={<icons.ChevronUp size={16} />}
            aria-label="Previous change"
            aria-keyshortcuts="K"
            onClick={() => go(current - 1)}
            disabled={!blockView.length}
          />
          <span className={css.pos} aria-live="polite">
            {blockView.length ? current + 1 : 0} / {blockView.length}
          </span>
          <Button
            variant="secondary"
            iconOnly
            icon={<icons.ChevronDown size={16} />}
            aria-label="Next change"
            aria-keyshortcuts="J"
            onClick={() => go(current + 1)}
            disabled={!blockView.length}
          />
        </div>
      </div>

      {editing && before && after && (
        <div className={css.edit}>
          {(['before', 'after'] as const).map((s) => (
            <label key={s} className={css.editSide}>
              <span>{(s === 'before' ? before : after).name}</span>
              <textarea
                className={css.editArea}
                spellCheck={false}
                value={(s === 'before' ? before : after).content}
                onChange={(e) => {
                  setText(s, e.target.value);
                  scheduleRediff(compare);
                }}
              />
            </label>
          ))}
        </div>
      )}

      <div className={filtersOpen ? css.bodyWithPanel : css.body}>
        <div className={css.diff}>
          <div className={css.paneHead} data-layout={layout}>
            {layout === 'split' ? (
              <>
                <span className={css.paneName}>
                  {before?.name}
                  <ReloadButton side="before" className={css.reload} onReloaded={() => void compare()} />
                </span>
                <span className={css.paneName}>
                  {after?.name}
                  <ReloadButton side="after" className={css.reload} onReloaded={() => void compare()} />
                </span>
              </>
            ) : (
              <span className={css.paneName}>
                {before?.name} → {after?.name}
                <ReloadButton side="before" className={css.reload} onReloaded={() => void compare()} />
                <ReloadButton side="after" className={css.reload} onReloaded={() => void compare()} />
              </span>
            )}
          </div>
          {lang && tooBig && (
            <p className={css.note} role="note">
              Syntax highlighting is off for comparisons this large, to keep scrolling smooth.
            </p>
          )}
          <div
            ref={scroller}
            className={css.scroller}
            role="region"
            // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={`Differences between ${before?.name} and ${after?.name}`}
            data-lang={hl ? lang : undefined}
          >
            <div style={{ height: v.getTotalSize(), position: 'relative' }}>
              {v.getVirtualItems().map((it) => {
                const view = views[it.index]!;
                const block = view.kind === 'row' ? blockAt.get(view.index) : undefined;
                const moved = view.kind === 'row' && view.row.move !== undefined;
                const lt = view.kind === 'row' ? hl?.left.get(view.index) : undefined;
                const rt = view.kind === 'row' ? hl?.right.get(view.index) : undefined;
                return (
                  <div
                    key={it.key}
                    data-index={it.index}
                    ref={v.measureElement}
                    className={css.vrow}
                    style={{ transform: `translateY(${it.start}px)` }}
                    {...(block !== undefined
                      ? {
                          id: `sd-${blockId(block)}`,
                          tabIndex: -1,
                          'data-block': block,
                          'data-viewed': viewed[blockId(block)] ? true : undefined,
                          'data-current': block === current ? true : undefined,
                        }
                      : {})}
                  >
                    {block !== undefined && viewed[blockId(block)] && (
                      <span className="sd-visually-hidden">Viewed. </span>
                    )}
                    {view.kind === 'gap' ? (
                      <div className={css.gap}>
                        <icons.Ellipsis size={14} aria-hidden="true" />{' '}
                        {view.before === view.after
                          ? `${plural(view.before, 'line')} not in the patch`
                          : `${plural(view.before, 'line')} before and ${plural(view.after, 'line')} after not in the patch`}
                      </div>
                    ) : view.kind === 'move' ? (
                      <MoveBanner
                        id={`sd-move-${view.move}-${view.end}`}
                        m={text.moves![view.move]!}
                        end={view.end}
                        onJump={() => jumpTo(view.move, view.end === 'to' ? 'from' : 'to')}
                      />
                    ) : view.kind === 'fold' ? (
                      <button
                        type="button"
                        className={css.fold}
                        onClick={() => setExpanded(new Set(expanded).add(view.from))}
                      >
                        <icons.ChevronsUpDown size={14} aria-hidden="true" /> Show{' '}
                        {view.to - view.from} unchanged lines
                      </button>
                    ) : layout === 'split' ? (
                      <div className={css.split}>
                        {renderCell(view.row.left, view.row.type === 'same' ? 'same' : 'del', lt, moved)}
                        {renderCell(view.row.right, view.row.type === 'same' ? 'same' : 'add', rt, moved)}
                      </div>
                    ) : (
                      <div>
                        {view.row.type === 'same' ? (
                          renderCell(view.row.right, 'same', rt)
                        ) : (
                          <>
                            {view.row.left && renderCell(view.row.left, 'del', lt, moved)}
                            {view.row.right && renderCell(view.row.right, 'add', rt, moved)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <Ruler
            rows={text.rows}
            onJump={(i) => {
              const vi = views.findIndex((x) => x.kind === 'row' && x.index >= i);
              v.scrollToIndex(Math.max(0, vi - 2), { align: 'start' });
            }}
          />
        </div>
        {filtersOpen && (
          <FiltersPanel
            filters={opts.filters}
            hits={text.filters}
            onChange={(filters) => setText2({ filters })}
            onClose={() => setFiltersOpen(false)}
          />
        )}
      </div>

      {gotoOpen && (
        <GoToLine
          max={Math.max(...text.rows.map((r) => r.right?.n ?? 0))}
          onClose={() => setGotoOpen(false)}
          onGo={(n) => {
            // TX-07: the first row at or after line n of the after file; expand the fold that hides it.
            const ri = text.rows.findIndex((r) => (r.right?.n ?? 0) >= n);
            if (ri < 0) {
              setGotoOpen(false);
              return;
            }
            const fold = views.find(
              (x): x is Extract<TView, { kind: 'fold' }> => x.kind === 'fold' && ri >= x.from && ri < x.to,
            );
            if (fold) setExpanded(new Set(expanded).add(fold.from));
            pendingRow.current = ri;
            setGotoTick((t) => t + 1);
            setGotoOpen(false);
          }}
        />
      )}
    </div>
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleRediff(compare: (o?: { background?: boolean }) => Promise<void>) {
  clearTimeout(timer);
  // TX-10: live re-diff keeps this screen (and the editor) open.
  timer = setTimeout(() => void compare({ background: true }), 400);
}

/** Text with word highlights; ‹name› placeholders render as masked pills (TX-08). */
const SPLIT = new RegExp(`(${MASK.source})`);
const WHOLE = new RegExp(`^${MASK.source}$`);

function Segs({ segs, tokens }: { segs: Seg[]; tokens?: Token[] | undefined }) {
  if (tokens) return <HighlightedSegs segs={segs} tokens={tokens} />;
  return (
    <>
      {segs.map((s, i) => {
        const inner = s.text.split(SPLIT).map((p, j) => (WHOLE.test(p) ? <MaskedText key={j} name={p.slice(1, -1)} /> : p));
        return s.kind === 'same' ? (
          <span key={i}>{inner}</span>
        ) : (
          <mark key={i} className={s.kind === 'add' ? css.wordAdd : css.wordDel}>
            {inner}
          </mark>
        );
      })}
    </>
  );
}

/** Cut syntax tokens along word-diff segments, so add/remove highlights still show (TX-03). */
function splitByTokens(segs: Seg[], tokens: Token[]): Array<{ kind: Seg['kind']; pieces: Token[] }> {
  let ti = 0;
  let off = 0;
  return segs.map((s) => {
    const pieces: Token[] = [];
    let rest = s.text;
    while (rest.length) {
      const tok = tokens[ti];
      if (!tok) {
        pieces.push({ content: rest });
        break;
      }
      const take = Math.min(tok.content.length - off, rest.length);
      pieces.push(tok.color ? { content: rest.slice(0, take), color: tok.color } : { content: rest.slice(0, take) });
      rest = rest.slice(take);
      off += take;
      if (off >= tok.content.length) {
        ti++;
        off = 0;
      }
    }
    return { kind: s.kind, pieces };
  });
}

function HighlightedSegs({ segs, tokens }: { segs: Seg[]; tokens: Token[] }) {
  return (
    <>
      {splitByTokens(segs, tokens).map((s, i) => {
        const pieces: ReactNode[] = s.pieces.map((p, j) =>
          p.color ? (
            <span key={j} style={{ color: p.color }}>
              {p.content}
            </span>
          ) : (
            p.content
          ),
        );
        return s.kind === 'same' ? (
          <span key={i}>{pieces}</span>
        ) : (
          <mark key={i} className={s.kind === 'add' ? css.wordAdd : css.wordDel}>
            {pieces}
          </mark>
        );
      })}
    </>
  );
}

/** Insert TX-12 gap rows and TX-11 move banners into the folded views. */
function withExtras(views: View[], text: { gaps?: Array<{ row: number; before: number; after: number }>; moves?: Move[] }): TView[] {
  const gaps = new Map((text.gaps ?? []).map((g) => [g.row, g]));
  const banners = new Map<number, Array<{ move: number; end: 'from' | 'to' }>>();
  (text.moves ?? []).forEach((m, i) => {
    banners.set(m.rows[0], [...(banners.get(m.rows[0]) ?? []), { move: i, end: 'from' }]);
    banners.set(m.rows[1], [...(banners.get(m.rows[1]) ?? []), { move: i, end: 'to' }]);
  });
  if (!gaps.size && !banners.size) return views;
  const out: TView[] = [];
  for (const view of views) {
    if (view.kind === 'fold') {
      // A gap inside a folded run is shown before the fold.
      for (const [row, g] of gaps) if (row >= view.from && row < view.to) out.push({ kind: 'gap', before: g.before, after: g.after });
    } else {
      const g = gaps.get(view.index);
      if (g) out.push({ kind: 'gap', before: g.before, after: g.after });
      for (const b of banners.get(view.index) ?? []) out.push({ kind: 'move', ...b });
    }
    out.push(view);
  }
  return out;
}

/** A03-MovedBlock: "↕ 6 lines moved from line 42 to line 21 · 1 word changed inside · Jump to old position". */
function MoveBanner({ id, m, end, onJump }: { id: string; m: Move; end: 'from' | 'to'; onJump: () => void }) {
  const lines = m.to[1] - m.to[0] + 1;
  return (
    // Focus target for the jump links; not in the tab order.
    <div id={id} className={css.moveBanner} tabIndex={-1}>
      <span aria-hidden="true" className={css.moveIcon}>
        ↕
      </span>
      <span>
        {end === 'to'
          ? `${plural(lines, 'line')} moved from line ${m.from[0]} to line ${m.to[0]}`
          : `${plural(lines, 'line')} moved to line ${m.to[0]} (from line ${m.from[0]})`}
        {' · '}
        {m.edited ? `${plural(m.words, 'word')} changed inside` : 'unchanged'}
      </span>
      <button type="button" className={css.jump} onClick={onJump}>
        {end === 'to' ? 'Jump to old position' : 'Jump to new position'}
      </button>
    </div>
  );
}

function Ruler({ rows, onJump }: { rows: Row[]; onJump: (row: number) => void }) {
  const marks = useMemo(() => {
    const out: Array<{ top: number; kind: string; row: number }> = [];
    rows.forEach((r, i) => {
      const kind = r.move !== undefined ? 'moved' : r.type;
      const prev = rows[i - 1];
      if (r.type !== 'same' && (!prev || (prev.move !== undefined ? 'moved' : prev.type) !== kind))
        out.push({ top: (i / Math.max(1, rows.length)) * 100, kind, row: i });
    });
    return out.slice(0, 400);
  }, [rows]);
  return (
    <div className={css.ruler} aria-hidden="true">
      {marks.map((m, i) => (
        // Mouse shortcut only: the same jumps are on the Next/Previous change buttons and J/K.
        <button
          key={i}
          type="button"
          tabIndex={-1}
          className={css.tick}
          data-kind={m.kind}
          style={{ top: `${m.top}%` }}
          onClick={() => onJump(m.row)}
        />
      ))}
    </div>
  );
}

function FiltersPanel({
  filters,
  hits,
  onChange,
  onClose,
}: {
  filters: TextFilter[];
  hits: Array<{ name: string; hits: number; error?: string }>;
  onChange: (f: TextFilter[]) => void;
  onClose: () => void;
}) {
  const presets: TextFilter[] = [
    { name: 'Timestamps', pattern: '\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z', replace: '‹time›' },
    { name: 'Request IDs', pattern: 'req_[a-z0-9]{8,}', replace: '‹req-id›' },
    {
      name: 'UUIDs',
      pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      replace: '‹uuid›',
    },
  ];
  const all = [...filters, ...presets.filter((p) => !filters.some((f) => f.name === p.name))];
  const [pattern, setPattern] = useState('');
  const [shown, setShown] = useState('');
  const patternError = (() => {
    try {
      if (pattern) new RegExp(pattern);
      return undefined;
    } catch {
      return 'This is not a valid regular expression.';
    }
  })();
  return (
    <aside className={css.panel} aria-labelledby="filters-title">
      <div className={css.panelHead}>
        <h2 id="filters-title" className={css.panelTitle}>
          Filters
        </h2>
        <Button
          variant="secondary"
          iconOnly
          icon={<icons.X size={16} />}
          aria-label="Close filters"
          onClick={onClose}
        />
      </div>
      <p className={css.panelLead}>
        Matches are masked on both sides before comparing, so noise like timestamps never shows up
        as a change.
      </p>
      <ul className={css.filterList}>
        {all.map((f) => {
          const on = filters.some((x) => x.name === f.name);
          const h = hits.find((x) => x.name === f.name);
          return (
            <li key={f.name} className={css.filter}>
              <Checkbox
                label={f.name}
                checked={on}
                onCheckedChange={(c) =>
                  onChange(c ? [...filters, f] : filters.filter((x) => x.name !== f.name))
                }
              />
              <code className={css.pattern} title={f.pattern}>
                {f.pattern}
              </code>
              <span className={css.hits}>
                {h?.error ? 'invalid' : `${on ? (h?.hits ?? 0) : 0} hits`}
              </span>
              <span className={css.shownAs}>
                Shown as <MaskedText name={f.replace.replace(/^‹|›$/g, '')} />
              </span>
            </li>
          );
        })}
      </ul>
      <form
        className={css.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!pattern || patternError) return;
          const name = shown.replace(/^‹|›$/g, '') || `Filter ${filters.length + 1}`;
          onChange([...filters, { name, pattern, replace: `‹${name}›` }]);
          setPattern('');
          setShown('');
        }}
      >
        <TextField
          label="Pattern (regular expression)"
          mono
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="pid=\d+"
          error={patternError}
        />
        <TextField
          label="Show as"
          mono
          value={shown}
          onChange={(e) => setShown(e.target.value)}
          placeholder="‹pid›"
        />
        <Button
          variant="secondary"
          type="submit"
          icon={<icons.Plus size={15} />}
          disabled={!pattern || !!patternError}
        >
          Add filter
        </Button>
      </form>
      <p className={css.panelNote}>
        Filters are saved with your text settings and in rule-set files.
      </p>
    </aside>
  );
}

function GoToLine({
  max,
  onGo,
  onClose,
}: {
  max: number;
  onGo: (n: number) => void;
  onClose: () => void;
}) {
  const [n, setN] = useState('');
  return (
    <Dialog
      open
      title="Go to line"
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => onGo(Number(n))} disabled={!n}>
            Go
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (n) onGo(Number(n));
        }}
      >
        <TextField
          label={`Line in the after file (1–${max})`}
          inputMode="numeric"
          value={n}
          onChange={(e) => setN(e.target.value.replace(/\D/g, ''))}
        />
      </form>
    </Dialog>
  );
}
