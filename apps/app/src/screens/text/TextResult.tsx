// A-03 Text diff (TX-01..TX-10): split/unified, precision, ignore options, filters with hit counts,
// transforms, wrap, go to line, next/previous change with an overview ruler, folding, live re-diff.
import { Config, type TextFilter } from '@specdiff/core';
import { foldRows, MASK, type Row, type Seg, type View } from '@specdiff/core/text';
import {
  Button,
  Checkbox,
  Dialog,
  MaskedText,
  Menu,
  SegmentedControl,
  TextField,
} from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from '../../shell/commands';
import { useApp } from '../../state/store';
import css from './TextResult.module.css';

type Layout = 'split' | 'unified';

export function TextResult() {
  const { result, before, after, settings, updateConfig, compare, setText } = useApp();
  const text = result && 'text' in result ? result.text : null;
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

  const setText2 = (patch: Partial<typeof opts>) => {
    updateConfig((c) => ({ ...c, text: { ...c.text, ...patch } }));
  };
  // Re-diff when the options differ from the ones this result was made with (TX-10 covers edits too).
  // Comparing with comparedConfig (not a "first run" ref) keeps StrictMode's double effects from looping.
  const comparedText = useApp((s) => s.comparedConfig?.text);
  useEffect(() => {
    if (settings.config.text === comparedText) return;
    const t = setTimeout(() => void compare(), 250);
    return () => clearTimeout(t);
  }, [settings.config.text, comparedText, compare]);

  const views: View[] = useMemo(
    () => (text ? foldRows(text.rows, 3, expanded) : []),
    [text, expanded],
  );
  const blockView = useMemo(
    () => text?.blocks.map((b) => views.findIndex((v) => v.kind === 'row' && v.index === b)) ?? [],
    [text, views],
  );
  const v = useVirtualizer({
    count: views.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 22,
    overscan: 30,
  });

  const go = useCallback(
    (i: number) => {
      if (!blockView.length) return;
      const n = (i + blockView.length) % blockView.length;
      setCurrent(n);
      v.scrollToIndex(Math.max(0, blockView[n]! - 2), { align: 'start' });
    },
    [blockView, v],
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
  const plus = text.stats.added + text.stats.changed;
  const minus = text.stats.removed + text.stats.changed;
  const masked = text.filters.reduce((n, f) => n + f.hits, 0);

  const renderCell = (side: Row['left'], kind: 'del' | 'add' | 'same') => (
    <div className={css.cell} data-kind={side ? kind : 'empty'}>
      <span className={css.num}>{side?.n ?? ''}</span>
      <span className={css.gutter} aria-hidden="true">
        {side ? (kind === 'del' ? '−' : kind === 'add' ? '+' : '') : ''}
      </span>
      <span className={wrap ? css.codeWrap : css.code}>
        {side && <Segs segs={side.segs} />}
        {side && kind !== 'same' && (
          <span className="sd-visually-hidden">{kind === 'del' ? ' (removed)' : ' (added)'}</span>
        )}
      </span>
    </div>
  );

  return (
    <div className={css.page}>
      <header className={css.head}>
        <h1 className={css.h1}>
          {plus + minus} lines differ{opts.filters.length ? ' after filters' : ''}
        </h1>
        <p className={css.stats}>
          <span className={css.add}>+ {plus}</span> lines <span className={css.del}>− {minus}</span>{' '}
          lines
          {masked ? (
            <>
              {' '}
              <span>{masked} masked</span>
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
                <span>{before?.name}</span>
                <span>{after?.name}</span>
              </>
            ) : (
              <span>
                {before?.name} → {after?.name}
              </span>
            )}
          </div>
          <div
            ref={scroller}
            className={css.scroller}
            role="region"
            // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={`Differences between ${before?.name} and ${after?.name}`}
          >
            <div style={{ height: v.getTotalSize(), position: 'relative' }}>
              {v.getVirtualItems().map((it) => {
                const view = views[it.index]!;
                return (
                  <div
                    key={it.key}
                    data-index={it.index}
                    ref={v.measureElement}
                    className={css.vrow}
                    style={{ transform: `translateY(${it.start}px)` }}
                  >
                    {view.kind === 'fold' ? (
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
                        {renderCell(view.row.left, view.row.type === 'same' ? 'same' : 'del')}
                        {renderCell(view.row.right, view.row.type === 'same' ? 'same' : 'add')}
                      </div>
                    ) : (
                      <div>
                        {view.row.type === 'same' ? (
                          renderCell(view.row.right, 'same')
                        ) : (
                          <>
                            {view.row.left && renderCell(view.row.left, 'del')}
                            {view.row.right && renderCell(view.row.right, 'add')}
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
            const vi = views.findIndex((x) => x.kind === 'row' && (x.row.right?.n ?? 0) >= n);
            if (vi < 0) {
              const fold = views.findIndex((x) => x.kind === 'fold');
              if (fold >= 0)
                setExpanded(
                  new Set(
                    views.filter((x) => x.kind === 'fold').map((x) => (x as { from: number }).from),
                  ),
                );
            }
            v.scrollToIndex(Math.max(0, vi), { align: 'start' });
            setGotoOpen(false);
          }}
        />
      )}
    </div>
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleRediff(compare: () => Promise<void>) {
  clearTimeout(timer);
  timer = setTimeout(() => void compare(), 400);
}

/** Text with word highlights; ‹name› placeholders render as masked pills (TX-08). */
const SPLIT = new RegExp(`(${MASK.source})`);
const WHOLE = new RegExp(`^${MASK.source}$`);

function Segs({ segs }: { segs: Seg[] }) {
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

function Ruler({ rows, onJump }: { rows: Row[]; onJump: (row: number) => void }) {
  const marks = useMemo(() => {
    const out: Array<{ top: number; kind: string; row: number }> = [];
    rows.forEach((r, i) => {
      if (r.type !== 'same' && (i === 0 || rows[i - 1]!.type !== r.type))
        out.push({ top: (i / Math.max(1, rows.length)) * 100, kind: r.type, row: i });
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
