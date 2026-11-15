import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../../internal/cx';
import { usePortalContainer } from '../../internal/portal';
import { Button } from '../Button/Button';
import css from './Dialog.module.css';

export interface DialogProps {
  title: string;
  description?: ReactNode | undefined;
  /** Body content. */
  children?: ReactNode;
  /** Action buttons, bottom right (brand + ghost). */
  actions?: ReactNode | undefined;
  /** Element that opens the dialog; focus returns to it on close. */
  trigger?: ReactElement | undefined;
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/** Modal dialog: focus trapped, Esc closes, focus returns to the trigger. */
export function Dialog({
  title,
  description,
  children,
  actions,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  className,
}: DialogProps) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className={css.overlay} />
        <RadixDialog.Content
          className={cx(css.content, className)}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className={css.head}>
            <RadixDialog.Title className={css.title}>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <Button variant="ghost" iconOnly icon={<X />} aria-label="Close" />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className={css.description}>{description}</RadixDialog.Description>
          ) : null}
          {children ? <div className={css.body}>{children}</div> : null}
          {actions ? <div className={css.actions}>{actions}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Wrap a button in this to close the surrounding Dialog or Drawer when pressed. */
export const DialogClose = RadixDialog.Close;
