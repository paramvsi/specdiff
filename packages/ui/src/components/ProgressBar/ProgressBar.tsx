import { cx } from '../../internal/cx';
import css from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** Accessible name, also shown above the bar. */
  label: string;
  /** 0–max. */
  value: number;
  max?: number | undefined;
  /** Text shown on the right, e.g. "41 of 66". Defaults to a percentage. */
  valueText?: string | undefined;
  className?: string | undefined;
}

/** Determinate progress bar (used for parsing only). */
export function ProgressBar({ label, value, max = 100, valueText, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const text = valueText ?? `${Math.round((clamped / max) * 100)}%`;
  return (
    <div className={cx(css.root, className)}>
      <span className={css.head} aria-hidden="true">
        <span>{label}</span>
        <span className={css.value}>{text}</span>
      </span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
        className={css.track}
      >
        <span className={css.fill} style={{ width: `${(clamped / max) * 100}%` }} />
      </span>
    </div>
  );
}
