import * as RadixSwitch from '@radix-ui/react-switch';
import { useId } from 'react';
import { cx } from '../../internal/cx';
import css from './Switch.module.css';

export interface SwitchProps {
  label: string;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** On/off switch with a visible label. On = ink track, chartreuse thumb. */
export function Switch({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
}: SwitchProps) {
  const id = useId();
  return (
    <span className={cx(css.row, className)}>
      <RadixSwitch.Root
        id={id}
        className={css.track}
        {...(checked !== undefined ? { checked } : {})}
        {...(defaultChecked !== undefined ? { defaultChecked } : {})}
        {...(onCheckedChange ? { onCheckedChange } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <RadixSwitch.Thumb className={css.thumb} />
      </RadixSwitch.Root>
      <label htmlFor={id} className={css.label}>
        {label}
      </label>
    </span>
  );
}
