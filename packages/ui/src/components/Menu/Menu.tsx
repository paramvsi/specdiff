import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactElement, ReactNode } from 'react';
import { usePortalContainer } from '../../internal/portal';
import css from './Menu.module.css';

export interface MenuItem {
  label: string;
  icon?: ReactNode | undefined;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: string | undefined;
  onSelect?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

export interface MenuProps {
  /** The button that opens the menu. */
  trigger: ReactElement;
  items: ReadonlyArray<MenuItem | 'separator'>;
  align?: 'start' | 'center' | 'end' | undefined;
}

/** Popover menu (Radix dropdown-menu): arrow keys, Enter, Esc, typeahead. */
export function Menu({ trigger, items, align = 'start' }: MenuProps) {
  const container = usePortalContainer();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content className={css.content} align={align} sideOffset={6}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <DropdownMenu.Separator key={i} className={css.separator} />
            ) : (
              <DropdownMenu.Item
                key={i}
                className={css.item}
                {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
                {...(item.onSelect ? { onSelect: item.onSelect } : {})}
              >
                {item.icon ? (
                  <span className={css.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
                {item.hint ? <span className={css.hint}>{item.hint}</span> : null}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
