import { useId, useState } from 'react';
import { cx } from '../../internal/cx';
import { Button } from '../Button/Button';
import { passphraseStrength } from './strength';
import css from './PassphraseField.module.css';

export interface PassphraseFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string | undefined;
  className?: string | undefined;
}

const TONE = ['', css.weak, css.fair, css.good, css.good] as const;

/** Passphrase input with Show/Hide and a strength meter that always states its level in text. */
export function PassphraseField({
  value,
  onValueChange,
  label = 'Passphrase',
  className,
}: PassphraseFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passphraseStrength(value);
  return (
    <div className={cx(css.field, className)}>
      <label htmlFor={id} className={css.label}>
        {label}
      </label>
      <span className={css.row}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          aria-describedby={`${id}-strength`}
          className={css.input}
        />
        <Button variant="secondary" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Hide' : 'Show'}
        </Button>
      </span>
      <span className={css.meter} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={cx(css.segment, n <= strength.score && TONE[strength.score])}
          />
        ))}
      </span>
      <span id={`${id}-strength`} className={css.strength} aria-live="polite">
        Strength: {strength.label}
      </span>
    </div>
  );
}
