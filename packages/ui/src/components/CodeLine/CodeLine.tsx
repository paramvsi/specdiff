import { cx } from '../../internal/cx';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import css from './CodeLine.module.css';

export type CodeLineKind = 'context' | 'added' | 'removed' | 'changed' | 'moved';

export interface CodeSegment {
  text: string;
  /** Word-level highlight (added-word / removed-word background, strong text). */
  highlight?: boolean | undefined;
}

export interface CodeLineData {
  kind: CodeLineKind;
  /** Line number; omit for rows without one. */
  number?: number | undefined;
  content: string | ReadonlyArray<CodeSegment>;
}

export interface CodeLineProps extends CodeLineData {
  className?: string | undefined;
}

const MARKER: Record<CodeLineKind, string> = {
  context: ' ',
  added: '+',
  removed: '−',
  changed: '~',
  moved: '↕',
};

const SR_LABEL: Record<CodeLineKind, string | null> = {
  context: null,
  added: 'Added: ',
  removed: 'Removed: ',
  changed: 'Changed: ',
  moved: 'Moved: ',
};

/** One diff row: 28px line number, 14px gutter marker (+ − ~ ↕), Geist Mono 12.5/22. */
export function CodeLine({ kind, number, content, className }: CodeLineProps) {
  const label = SR_LABEL[kind];
  return (
    <div className={cx(css.line, css[kind], className)}>
      <span className={css.number}>{number ?? ''}</span>
      <span className={css.marker} aria-hidden="true">
        {MARKER[kind]}
      </span>
      <span className={css.text}>
        {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
        {typeof content === 'string'
          ? content
          : content.map((s, i) =>
              s.highlight ? (
                <mark key={i} className={css.word}>
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
      </span>
    </div>
  );
}
