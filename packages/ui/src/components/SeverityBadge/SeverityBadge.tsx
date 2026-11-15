import { cx } from '../../internal/cx';
import { SEVERITY_LABEL, SEVERITY_SYMBOL, type Severity } from '../../internal/severity';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import css from './SeverityBadge.module.css';

export interface SeverityBadgeProps {
  severity: Severity;
  /** Compact chip for tree items: a small disc with the symbol (never colour alone, X-06); label for screen readers. */
  compact?: boolean | undefined;
  className?: string | undefined;
}

/** Severity pill: symbol disc (! ? + ¶) plus label. Never colour alone. */
export function SeverityBadge({ severity, compact, className }: SeverityBadgeProps) {
  if (compact) {
    return (
      <span className={cx(css.dot, css[severity], className)}>
        <span aria-hidden="true">{SEVERITY_SYMBOL[severity]}</span>
        <VisuallyHidden>{SEVERITY_LABEL[severity]}</VisuallyHidden>
      </span>
    );
  }
  return (
    <span className={cx(css.pill, css[severity], className)}>
      <span className={css.symbol} aria-hidden="true">
        {SEVERITY_SYMBOL[severity]}
      </span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
