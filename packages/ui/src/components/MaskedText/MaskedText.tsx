import { cx } from '../../internal/cx';
import css from './MaskedText.module.css';

/** A masked value rendered as ‹name› in a muted pill (TX-08). */
export function MaskedText({ name, className }: { name: string; className?: string | undefined }) {
  return <span className={cx(css.mask, className)}>‹{name}›</span>;
}
