import { cx } from '../../internal/cx';
import css from './ReviewProgress.module.css';

export interface ReviewProgressProps {
  accepted: number;
  rejected: number;
  total: number;
  className?: string | undefined;
}

/** "Review 2 of 5" with a two-tone bar (accepted, rejected). Has a text alternative. */
export function ReviewProgress({ accepted, rejected, total, className }: ReviewProgressProps) {
  const done = accepted + rejected;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : '0%');
  return (
    <div className={cx(css.root, className)}>
      <span className={css.head}>
        <span>Review</span>
        <span className={css.count}>
          {done} of {total}
        </span>
      </span>
      <span
        role="progressbar"
        aria-label="Review progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} reviewed: ${accepted} accepted, ${rejected} rejected`}
        className={css.bar}
      >
        <span className={css.accepted} style={{ width: pct(accepted) }} />
        <span className={css.rejected} style={{ width: pct(rejected) }} />
      </span>
    </div>
  );
}
