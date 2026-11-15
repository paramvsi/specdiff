import { Check, X } from 'lucide-react';
import { cx } from '../../internal/cx';
import css from './DecisionButtons.module.css';

export type Decision = 'accepted' | 'rejected' | null;

export interface DecisionButtonsProps {
  value: Decision;
  /** Pressing the active decision again clears it (null). */
  onChange: (value: Decision) => void;
  className?: string | undefined;
}

/** Accept / Reject toggle pair for a change, using aria-pressed. */
export function DecisionButtons({ value, onChange, className }: DecisionButtonsProps) {
  const accepted = value === 'accepted';
  const rejected = value === 'rejected';
  return (
    <div className={cx(css.row, className)}>
      <button
        type="button"
        aria-pressed={accepted}
        className={cx(css.button, css.accept, accepted && css.on)}
        onClick={() => onChange(accepted ? null : 'accepted')}
      >
        <Check aria-hidden="true" />
        {accepted ? 'Accepted' : 'Accept'}
      </button>
      <button
        type="button"
        aria-pressed={rejected}
        className={cx(css.button, css.reject, rejected && css.on)}
        onClick={() => onChange(rejected ? null : 'rejected')}
      >
        <X aria-hidden="true" />
        {rejected ? 'Rejected' : 'Reject'}
      </button>
    </div>
  );
}
