import type { ReactNode } from 'react';
import css from './VisuallyHidden.module.css';

/** Text for screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={css.hidden}>{children}</span>;
}
