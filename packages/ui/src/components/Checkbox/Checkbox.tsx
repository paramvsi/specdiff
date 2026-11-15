import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cx } from '../../internal/cx';
import css from './Checkbox.module.css';

export interface CheckboxProps {
  label: string;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** Labelled checkbox. The button is the hit area (44 px on phones); `.mark` is the 18 px box. */
export function Checkbox({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
}: CheckboxProps) {
  const id = useId();
  return (
    <span className={cx(css.row, className)}>
      <RadixCheckbox.Root
        id={id}
        className={css.box}
        {...(checked !== undefined ? { checked } : {})}
        {...(defaultChecked !== undefined ? { defaultChecked } : {})}
        {...(onCheckedChange ? { onCheckedChange: (c) => onCheckedChange(c === true) } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <span className={css.mark} data-mark="">
          <RadixCheckbox.Indicator className={css.indicator}>
            <Check aria-hidden="true" />
          </RadixCheckbox.Indicator>
        </span>
      </RadixCheckbox.Root>
      <label htmlFor={id} className={css.label}>
        {label}
      </label>
    </span>
  );
}
