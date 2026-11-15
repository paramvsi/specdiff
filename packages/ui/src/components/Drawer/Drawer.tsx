import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../../internal/cx';
import { usePortalContainer } from '../../internal/portal';
import { Button } from '../Button/Button';
import css from './Drawer.module.css';

export interface DrawerProps {
  title: string;
  /** Optional line above the title in the header (e.g. method, path and severity). */
  eyebrow?: ReactNode | undefined;
  children?: ReactNode;
  side?: 'left' | 'right' | undefined;
  trigger?: ReactElement | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/** Side sheet (modal). Used for the change tree on tablet widths. */
export function Drawer({
  title,
  eyebrow,
  children,
  side = 'left',
  trigger,
  open,
  onOpenChange,
  className,
}: DrawerProps) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className={css.overlay} />
        <RadixDialog.Content
          className={cx(css.content, css[side], className)}
          aria-describedby={undefined}
        >
          <div className={css.head}>
            {eyebrow ? (
              <div className={css.titles}>
                <div className={css.eyebrow}>{eyebrow}</div>
                <RadixDialog.Title className={css.title}>{title}</RadixDialog.Title>
              </div>
            ) : (
              <RadixDialog.Title className={css.title}>{title}</RadixDialog.Title>
            )}
            <RadixDialog.Close asChild>
              <Button variant="ghost" iconOnly icon={<X />} aria-label="Close" />
            </RadixDialog.Close>
          </div>
          <div className={css.body}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
