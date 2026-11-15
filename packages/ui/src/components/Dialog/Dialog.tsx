import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cx } from '../../internal/cx';
import { usePortalContainer } from '../../internal/portal';
import { Button } from '../Button/Button';
import css from './Dialog.module.css';

export interface DialogProps {
  title: string;
  description?: ReactNode | undefined;
  /** Body content. */
  children?: ReactNode;
  /** Footer band: action buttons on the right; a note may lead on the left. */
  actions?: ReactNode | undefined;
  /** Element that opens the dialog; focus returns to it on close. */
  trigger?: ReactElement | undefined;
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
  /** Alert layout (O-08): an icon tile above the title, no header divider and no ×; Esc and the footer close it. */
  icon?: ReactNode | undefined;
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
  icon,
}: DialogProps) {
  const container = usePortalContainer();
  // A body that overflows (e.g. a long list on a phone) becomes a named, focusable region so it can
  // be scrolled from the keyboard (WCAG 2.1.1; axe scrollable-region-focusable). Bodies that fit add
  // no tab stop.
  const [scrolls, setScrolls] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const bodyRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    observer.current = new ResizeObserver(check);
    observer.current.observe(el);
  }, []);
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
          className={cx(css.content, icon ? css.alert : null, className)}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {/* Header (title, description, close) over a divider; actions sit in a grey footer band. */}
          <div className={css.head}>
            <div className={css.heading}>
              {icon ? <span className={css.icon}>{icon}</span> : null}
              <RadixDialog.Title className={css.title}>{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className={css.description}>{description}</RadixDialog.Description>
              ) : null}
            </div>
            {icon ? null : (
              <RadixDialog.Close asChild>
                <Button variant="secondary" iconOnly icon={<X />} aria-label="Close" />
              </RadixDialog.Close>
            )}
          </div>
          {children ? (
            <div ref={bodyRef} className={css.body} {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': title } : {})}>
              {children}
            </div>
          ) : null}
          {actions ? <div className={css.actions}>{actions}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Wrap a button in this to close the surrounding Dialog or Drawer when pressed. */
export const DialogClose = RadixDialog.Close;
