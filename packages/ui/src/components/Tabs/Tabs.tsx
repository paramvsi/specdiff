import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './Tabs.module.css';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name for the tab list. */
  label: string;
  items: ReadonlyArray<TabItem>;
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  className?: string | undefined;
}

/** Tabs with arrow-key navigation (Radix). */
export function Tabs({ label, items, value, defaultValue, onValueChange, className }: TabsProps) {
  const rootProps = {
    ...(value !== undefined ? { value } : {}),
    ...(onValueChange ? { onValueChange } : {}),
    defaultValue: defaultValue ?? items[0]?.value ?? '',
  };
  return (
    <RadixTabs.Root {...rootProps} className={cx(css.root, className)}>
      <RadixTabs.List aria-label={label} className={css.list}>
        {items.map((t) => (
          <RadixTabs.Trigger key={t.value} value={t.value} className={css.trigger}>
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className={css.content}>
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
