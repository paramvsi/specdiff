import * as RadixDialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { cx } from '../../internal/cx';
import { usePortalContainer } from '../../internal/portal';
import type { Severity } from '../../internal/severity';
import { Kbd } from '../Kbd/Kbd';
import { SeverityBadge } from '../SeverityBadge/SeverityBadge';
import css from './CommandPalette.module.css';

export interface CommandItem {
  /** Visible label; also the search value, so keep it unique within the palette. */
  label: string;
  /** Right-hand mono meta: change, path, action, setting. */
  kind?: string | undefined;
  /** Shows a compact severity dot; otherwise a neutral dot. */
  severity?: Severity | undefined;
  keywords?: string[] | undefined;
  onSelect?: (() => void) | undefined;
}

export interface CommandGroup {
  /** Changes, Paths, Actions, Settings. */
  heading: string;
  items: ReadonlyArray<CommandItem>;
}

export interface CommandMenuProps {
  groups: ReadonlyArray<CommandGroup>;
  placeholder?: string | undefined;
  /** Accessible name for the search input. */
  label?: string | undefined;
  className?: string | undefined;
}

/** The palette panel itself (search input + grouped results). Usable inline. */
export function CommandMenu({
  groups,
  placeholder = 'Search changes, paths and actions',
  label = 'Search commands',
  className,
}: CommandMenuProps) {
  return (
    <Command label={label} loop className={cx(css.panel, className)}>
      <div className={css.inputRow}>
        <Search className={css.searchIcon} aria-hidden="true" />
        <Command.Input
          className={css.input}
          placeholder={placeholder}
          aria-label={label}
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={css.list}>
        <Command.Empty className={css.empty}>No results</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g.heading} heading={g.heading} className={css.group}>
            {g.items.map((item) => (
              <Command.Item
                key={item.label}
                value={item.label}
                {...(item.keywords ? { keywords: item.keywords } : {})}
                {...(item.onSelect ? { onSelect: item.onSelect } : {})}
                className={css.item}
              >
                {item.severity ? (
                  <SeverityBadge severity={item.severity} compact />
                ) : (
                  <span className={css.neutralDot} aria-hidden="true" />
                )}
                <span className={css.label}>{item.label}</span>
                {item.kind ? <span className={css.kind}>{item.kind}</span> : null}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}

export interface CommandPaletteProps extends CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Command palette dialog: 560px, 12vh from the top. Arrow keys, Enter, Esc. */
export function CommandPalette({ open, onOpenChange, ...menu }: CommandPaletteProps) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className={css.overlay} />
        <RadixDialog.Content className={css.dialog} aria-describedby={undefined}>
          <RadixDialog.Title className={css.srTitle}>Command palette</RadixDialog.Title>
          <CommandMenu {...menu} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
