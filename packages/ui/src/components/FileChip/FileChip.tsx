import { cx } from '../../internal/cx';
import css from './FileChip.module.css';

/** File name chip used in the top bar (payments-v1.yaml → payments-v2.yaml). */
export function FileChip({ name, className }: { name: string; className?: string | undefined }) {
  return <span className={cx(css.chip, className)}>{name}</span>;
}
