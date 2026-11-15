import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional eyebrow title (Geist Mono 12px, muted), e.g. "Why it breaks". */
  title?: ReactNode | undefined;
  /** `panel` uses the larger radius (xl) for workspace panes. */
  tone?: 'card' | 'panel' | undefined;
  /** Remove inner padding (for code panes, lists). */
  flush?: boolean | undefined;
  children?: ReactNode;
}

/** Surface card with a line border. Groups with borders, not shadows. */
export function Card({ title, tone = 'card', flush, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(css.card, tone === 'panel' && css.panel, flush && css.flush, className)}
      {...rest}
    >
      {title ? <p className={css.title}>{title}</p> : null}
      {children}
    </div>
  );
}
