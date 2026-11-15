import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cx } from '../../internal/cx';
import css from './SegmentedControl.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name for the group, e.g. "Layout". */
  label: string;
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onValueChange: (value: V) => void;
  /** `sm` is the compact preset style (Strictness: Wire / SDK). */
  size?: 'md' | 'sm' | undefined;
  className?: string | undefined;
}

/** Single-choice segmented control. One option is always selected. */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  className,
}: SegmentedControlProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as V);
      }}
      className={cx(css.root, size === 'sm' && css.sm, className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={css.item}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
