import * as RadioGroup from '@radix-ui/react-radio-group';
import { useId } from 'react';
import { cx } from '../../internal/cx';
import css from './RadioCard.module.css';

export interface RadioCardOption<V extends string> {
  value: V;
  title: string;
  description: string;
}

export interface RadioCardGroupProps<V extends string> {
  /** Visible legend, e.g. "Strictness". */
  legend: string;
  options: ReadonlyArray<RadioCardOption<V>>;
  value?: V | undefined;
  defaultValue?: V | undefined;
  onValueChange?: ((value: V) => void) | undefined;
  className?: string | undefined;
}

/** A group of selectable cards (title + description). Arrow keys move the selection. */
export function RadioCardGroup<V extends string>({
  legend,
  options,
  value,
  defaultValue,
  onValueChange,
  className,
}: RadioCardGroupProps<V>) {
  const base = useId();
  const legendId = `${base}-legend`;
  return (
    <div className={cx(css.group, className)}>
      <p id={legendId} className={css.legend}>
        {legend}
      </p>
      <RadioGroup.Root
        aria-labelledby={legendId}
        className={css.cards}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(onValueChange ? { onValueChange: (v: string) => onValueChange(v as V) } : {})}
      >
        {options.map((o) => {
          const id = `${base}-${o.value}`;
          return (
            <label key={o.value} htmlFor={id} className={css.card}>
              <RadioGroup.Item
                id={id}
                value={o.value}
                className={css.radio}
                aria-describedby={`${id}-d`}
              >
                <RadioGroup.Indicator className={css.dot} />
              </RadioGroup.Item>
              <span className={css.text}>
                <span className={css.title}>{o.title}</span>
                <span id={`${id}-d`} className={css.description}>
                  {o.description}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup.Root>
    </div>
  );
}
