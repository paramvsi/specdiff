import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './Kbd.module.css';

/** Keyboard key hint, e.g. ⌘K or Esc. */
export function Kbd({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <kbd className={cx(css.kbd, className)}>{children}</kbd>;
}
