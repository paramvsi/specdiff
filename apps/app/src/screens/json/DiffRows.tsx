// Split line diff for the JSON side-by-side/raw views and the Markdown source view.
// Same row model and markers as A-03 (core/text), virtualised like A-03 (X-02): only rows in view are in the DOM.
import { foldRows, type Row, type Seg } from '@specdiff/core/text';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as icons from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import css from './DiffRows.module.css';
import { showInvisibles } from '../invisibles';

export function DiffRows({
  rows,
  beforeName,
  afterName,
  label,
}: {
  rows: Row[];
  beforeName: string;
  afterName: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const views = useMemo(() => foldRows(rows, 3, expanded), [rows, expanded]);
  const scroller = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual, as in TextResult.
  const v = useVirtualizer({
    count: views.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 22,
    overscan: 30,
  });
  return (
    <div className={css.wrap}>
      <div className={css.head}>
        <span>{beforeName}</span>
        <span>{afterName}</span>
      </div>
      <div
        ref={scroller}
        className={css.scroller}
        role="region"
        // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={label}
      >
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((it) => {
            const view = views[it.index]!;
            return (
              <div
                key={it.key}
                data-index={it.index}
                ref={v.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` }}
              >
                {view.kind === 'fold' ? (
                  <button
                    type="button"
                    className={css.fold}
                    onClick={() => setExpanded(new Set(expanded).add(view.from))}
                  >
                    <icons.ChevronsUpDown size={14} aria-hidden="true" /> Show {view.to - view.from}{' '}
                    unchanged lines
                  </button>
                ) : (
                  <div className={css.split}>
                    <Cell side={view.row.left} kind={view.row.type === 'same' ? 'same' : 'del'} />
                    <Cell side={view.row.right} kind={view.row.type === 'same' ? 'same' : 'add'} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell({ side, kind }: { side: Row['left']; kind: 'del' | 'add' | 'same' }) {
  return (
    <div className={css.cell} data-kind={side ? kind : 'empty'}>
      <span className={css.num}>{side?.n ?? ''}</span>
      <span className={css.gutter} aria-hidden="true">
        {side ? (kind === 'del' ? '−' : kind === 'add' ? '+' : '') : ''}
      </span>
      <span className={css.code}>
        {side && <Segs segs={side.segs} />}
        {side && kind !== 'same' && (
          <span className="sd-visually-hidden">{kind === 'del' ? ' (removed)' : ' (added)'}</span>
        )}
      </span>
    </div>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'same' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <mark key={i} className={s.kind === 'add' ? css.wordAdd : css.wordDel}>
            {showInvisibles(s.text)}
          </mark>
        ),
      )}
    </>
  );
}
