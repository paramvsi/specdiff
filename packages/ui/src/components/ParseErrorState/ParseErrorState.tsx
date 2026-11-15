import { cx } from '../../internal/cx';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import css from './ParseErrorState.module.css';

export interface SourceLine {
  number: number;
  text: string;
}

export interface ParseErrorStateProps {
  /** Banner text, e.g. "After isn't valid YAML". */
  title: string;
  /** The failing line with a little context around it. */
  lines: ReadonlyArray<SourceLine>;
  errorLine: number;
  /** 1-based column; draws a ^ pointer under the failing line. */
  column?: number | undefined;
  /** Plain-English hint, e.g. "Line 12 is indented by 5 spaces; YAML expects 6 or 8 here." */
  hint: string;
  className?: string | undefined;
}

/** Parse error pinned to the line: red banner, failing lines with a pointer, hint. */
export function ParseErrorState({ title, lines, errorLine, column, hint, className }: ParseErrorStateProps) {
  return (
    <div className={cx(css.root, className)}>
      <p className={css.banner}>{title}</p>
      <div className={css.code}>
        {lines.map((l) => {
          const failing = l.number === errorLine;
          return (
            <div key={l.number}>
              <div className={cx(css.line, failing && css.failing)}>
                <span className={css.number}>{l.number}</span>
                <span className={css.marker} aria-hidden="true">
                  {failing ? '−' : ' '}
                </span>
                <span className={css.text}>
                  {failing ? <VisuallyHidden>Error here: </VisuallyHidden> : null}
                  {l.text}
                </span>
              </div>
              {failing && column ? (
                <div className={cx(css.line, css.pointer)} aria-hidden="true">
                  <span />
                  <span />
                  <span className={css.text}>{' '.repeat(Math.max(0, column - 1))}^</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className={css.hint}>{hint}</p>
    </div>
  );
}
