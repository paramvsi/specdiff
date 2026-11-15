import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cx } from '../../internal/cx';
import { usePortalContainer } from '../../internal/portal';
import css from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: ReadonlyArray<SelectOption>;
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
}

/** Labelled select (Radix). */
export function Select({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  className,
}: SelectProps) {
  const container = usePortalContainer();
  const id = useId();
  return (
    <div className={cx(css.field, className)}>
      <label className={css.label} htmlFor={id}>
        {label}
      </label>
      <RadixSelect.Root
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(onValueChange ? { onValueChange } : {})}
      >
        <RadixSelect.Trigger id={id} className={css.trigger}>
          <RadixSelect.Value {...(placeholder ? { placeholder } : {})} />
          <RadixSelect.Icon className={css.chevron}>
            <ChevronDown aria-hidden="true" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal container={container}>
          <RadixSelect.Content className={css.content} position="popper" sideOffset={6}>
            <RadixSelect.Viewport>
              {options.map((o) => (
                <RadixSelect.Item key={o.value} value={o.value} className={css.item}>
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className={css.indicator}>
                    <Check aria-hidden="true" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
