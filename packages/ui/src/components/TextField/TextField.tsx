import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Hide the label visually (it stays the accessible name). */
  hideLabel?: boolean | undefined;
  hint?: ReactNode | undefined;
  error?: ReactNode | undefined;
  /** Leading Lucide icon, e.g. Search. */
  icon?: ReactNode | undefined;
  /** Use Geist Mono for the value. */
  mono?: boolean | undefined;
}

/** Labelled text input with hint and error text. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, icon, mono, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(css.field, className)}>
      <label htmlFor={id} className={hideLabel ? css.hiddenLabel : css.label}>
        {label}
      </label>
      <span className={cx(css.control, error ? css.invalid : null)}>
        {icon ? (
          <span className={css.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cx(css.input, mono && css.mono)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </span>
      {hint ? (
        <span id={hintId} className={css.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={css.error}>
          <span aria-hidden="true">! </span>
          {error}
        </span>
      ) : null}
    </div>
  );
});
