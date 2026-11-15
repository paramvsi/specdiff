import { useRef, useState } from 'react';
import { cx } from '../../internal/cx';
import { CodeLine, type CodeLineData } from '../CodeLine/CodeLine';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import css from './CodePane.module.css';

export interface CollapsedRows {
  kind: 'collapsed';
  /** The hidden unchanged lines, revealed when the row is pressed. */
  lines: ReadonlyArray<CodeLineData>;
}

export type CodePaneRow = CodeLineData | CollapsedRows;

export interface CodePaneProps {
  fileName: string;
  rows: ReadonlyArray<CodePaneRow>;
  /** Hide the +n / −n counts in the header. */
  hideCounts?: boolean | undefined;
  className?: string | undefined;
}

function countKinds(rows: ReadonlyArray<CodePaneRow>) {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    const lines = r.kind === 'collapsed' ? r.lines : [r];
    for (const l of lines) {
      if (l.kind === 'added') added++;
      else if (l.kind === 'removed') removed++;
    }
  }
  return { added, removed };
}

/** A code pane: header (file name, +n / −n), diff rows and collapsible unchanged context. */
export function CodePane({ fileName, rows, hideCounts, className }: CodePaneProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const revealRefs = useRef(new Map<number, HTMLDivElement>());
  const { added, removed } = countKinds(rows);

  const expand = (i: number) => {
    setExpanded((prev) => new Set(prev).add(i));
    // Keep keyboard focus in place: the revealed block takes focus once rendered.
    requestAnimationFrame(() => revealRefs.current.get(i)?.focus());
  };

  return (
    <div className={cx(css.pane, className)}>
      <div className={css.header}>
        <span className={css.file}>{fileName}</span>
        {hideCounts ? null : (
          <span className={css.counts}>
            <span className={css.added} aria-hidden="true">
              +{added}
            </span>
            <span className={css.removed} aria-hidden="true">
              −{removed}
            </span>
            <VisuallyHidden>
              {added} added, {removed} removed
            </VisuallyHidden>
          </span>
        )}
      </div>
      {/* Code does not wrap; the body scrolls horizontally and is keyboard-focusable. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={css.body} tabIndex={0} role="group" aria-label={`${fileName} diff`}>
        {rows.map((r, i) => {
          if (r.kind !== 'collapsed') return <CodeLine key={i} {...r} />;
          if (expanded.has(i)) {
            return (
              <div
                key={i}
                tabIndex={-1}
                className={css.revealed}
                ref={(el) => {
                  if (el) revealRefs.current.set(i, el);
                  else revealRefs.current.delete(i);
                }}
              >
                {r.lines.map((l, j) => (
                  <CodeLine key={j} {...l} />
                ))}
              </div>
            );
          }
          return (
            <button key={i} type="button" className={css.collapsed} onClick={() => expand(i)}>
              <span aria-hidden="true">↕ </span>
              {r.lines.length} unchanged lines
            </button>
          );
        })}
      </div>
    </div>
  );
}
