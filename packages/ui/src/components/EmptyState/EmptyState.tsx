import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Decorative icon or the logo mark. */
  icon?: ReactNode | undefined;
  title: string;
  /** Heading level for the title (default 2). */
  level?: 2 | 3 | 4 | undefined;
  children?: ReactNode;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}

/** Centred empty/identical state: icon, title, one line, actions. */
export function EmptyState({
  icon,
  title,
  level = 2,
  children,
  actions,
  className,
}: EmptyStateProps) {
  const H = `h${level}` as const;
  return (
    <div className={cx(css.root, className)}>
      {icon ? (
        <span className={css.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <H className={css.title}>{title}</H>
      {children ? <p className={css.body}>{children}</p> : null}
      {actions ? <div className={css.actions}>{actions}</div> : null}
    </div>
  );
}
