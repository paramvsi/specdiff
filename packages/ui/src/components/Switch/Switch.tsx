import * as RadixSwitch from '@radix-ui/react-switch';
import { useId } from 'react';
import { cx } from '../../internal/cx';
import css from './Switch.module.css';

export interface SwitchProps {
  label: string;
  /** Render only the control; `label` stays the accessible name (rule tables, share dialog). */
  hideLabel?: boolean | undefined;
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** On/off switch with a visible label. On = ink track, chartreuse thumb. */
export function Switch({
  label,
  hideLabel,
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
        {...(hideLabel ? { 'aria-label': label } : {})}
        {...(checked !== undefined ? { checked } : {})}
        {...(defaultChecked !== undefined ? { defaultChecked } : {})}
        {...(onCheckedChange ? { onCheckedChange } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <RadixSwitch.Thumb className={css.thumb} />
      </RadixSwitch.Root>
      {hideLabel ? null : (
        <label htmlFor={id} className={css.label}>
          {label}
        </label>
      )}
    </span>
  );
}
