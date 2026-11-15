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
  /** Stable id; defaults to the item's position. Labels may repeat ("Endpoint removed"). */
  id?: string | undefined;
  /** Visible label; searched together with `kind` and `keywords`. */
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
  /** Called after any item is selected (the palette closes itself with this). */
  onItemSelected?: (() => void) | undefined;
}

/**
 * Word filter for cmdk. cmdk's default is a fuzzy subsequence score, so "dcs" matched
 * "Diff colours: high contrast". Here every typed word must appear in the label, kind or keywords;
 * label hits rank first. `keywords[0]` is the label (see CommandMenu).
 */
export function filterCommand(_value: string, search: string, keywords: string[] = []): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const [label = '', ...rest] = keywords.map((k) => k.toLowerCase());
  const words = q.split(/\s+/);
  const all = `${label} ${rest.join(' ')}`;
  if (!words.every((w) => all.includes(w))) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q)) return 0.9;
  if (words.every((w) => label.includes(w))) return 0.7;
  return 0.4;
}

/** The palette panel itself (search input + grouped results). Usable inline. */
export function CommandMenu({
  groups,
  placeholder = 'Search changes, paths and actions',
  label = 'Search commands',
  className,
  onItemSelected,
}: CommandMenuProps) {
  return (
    <Command label={label} loop filter={filterCommand} className={cx(css.panel, className)}>
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
            {g.items.map((item, i) => (
              <Command.Item
                key={item.id ?? i}
                value={`${g.heading}:${item.id ?? i}`}
                keywords={[item.label, item.kind ?? '', ...(item.keywords ?? [])]}
                onSelect={() => {
                  onItemSelected?.();
                  item.onSelect?.();
                }}
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

/** Command palette dialog: 560px, 12vh from the top. Arrow keys, Enter, Esc. Selecting an item closes it. */
export function CommandPalette({ open, onOpenChange, ...menu }: CommandPaletteProps) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className={css.overlay} />
        <RadixDialog.Content className={css.dialog} aria-describedby={undefined}>
          <RadixDialog.Title className={css.srTitle}>Command palette</RadixDialog.Title>
          <CommandMenu {...menu} onItemSelected={() => onOpenChange(false)} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
