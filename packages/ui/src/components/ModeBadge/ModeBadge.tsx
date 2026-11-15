import { cx } from '../../internal/cx';
import css from './ModeBadge.module.css';

export interface ModeBadgeProps {
  /** e.g. "OpenAPI 3.1", "JSON", "Markdown", "Code". */
  mode: string;
  /** Appends " · Beta" once, next to the mode name. */
  beta?: boolean | undefined;
  className?: string | undefined;
}

/** Detected mode pill (brand tint, Geist Mono). */
export function ModeBadge({ mode, beta, className }: ModeBadgeProps) {
  return (
    <span className={cx(css.badge, className)}>
      {mode}
      {beta ? ' · Beta' : null}
    </span>
  );
}
