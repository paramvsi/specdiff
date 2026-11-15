// Split line diff for the JSON side-by-side/raw views and the Markdown source view.
// Same row model and markers as A-03 (core/text), without virtualisation: capped at MAX rows.
import { foldRows, type Row, type Seg } from '@specdiff/core/text';
import * as icons from 'lucide-react';
import { useMemo, useState } from 'react';
import css from './DiffRows.module.css';

const MAX = 4000;

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
  const shown = views.slice(0, MAX);
  return (
    <div className={css.wrap}>
      <div className={css.head}>
        <span>{beforeName}</span>
        <span>{afterName}</span>
      </div>
      <div
        className={css.scroller}
        role="region"
        // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={label}
      >
        {shown.map((v) =>
          v.kind === 'fold' ? (
            <button
              key={`f${v.from}`}
              type="button"
              className={css.fold}
              onClick={() => setExpanded(new Set(expanded).add(v.from))}
            >
              <icons.ChevronsUpDown size={14} aria-hidden="true" /> Show {v.to - v.from} unchanged
              lines
            </button>
          ) : (
            <div key={v.index} className={css.split}>
              <Cell side={v.row.left} kind={v.row.type === 'same' ? 'same' : 'del'} />
              <Cell side={v.row.right} kind={v.row.type === 'same' ? 'same' : 'add'} />
            </div>
          ),
        )}
        {views.length > MAX && (
          <p className={css.more}>
            Showing the first {MAX} of {views.length} rows. Download a patch from Export for the
            rest.
          </p>
        )}
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
            {s.text}
          </mark>
        ),
      )}
    </>
  );
}
