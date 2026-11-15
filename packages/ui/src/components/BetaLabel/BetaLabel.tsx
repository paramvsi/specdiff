import { cx } from '../../internal/cx';
import css from './BetaLabel.module.css';

/** "Beta" pill. Shown once, next to the mode name. */
export function BetaLabel({ className }: { className?: string | undefined }) {
  return <span className={cx(css.label, className)}>Beta</span>;
}
