import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';
import { Logo } from '../Logo/Logo';
import css from './TopBar.module.css';

export interface TopBarProps {
  /** Content after the logo: file chips, mode badge. */
  start?: ReactNode | undefined;
  /** Right-hand actions: search, Share, Export. */
  end?: ReactNode | undefined;
  /** Logo link target. When omitted, the logo is not a link. */
  homeHref?: string | undefined;
  className?: string | undefined;
}

/** App top bar (64px): logo, divider, context, actions. */
export function TopBar({ start, end, homeHref, className }: TopBarProps) {
  const logo = <Logo />;
  return (
    <header className={cx(css.bar, className)}>
      <div className={css.inner}>
        <div className={css.start}>
          {homeHref ? (
            <a href={homeHref} className={css.home} aria-label="Specdiff home">
              {logo}
            </a>
          ) : (
            logo
          )}
          {start ? (
            <>
              <span className={css.divider} aria-hidden="true" />
              {start}
            </>
          ) : null}
        </div>
        {end ? <div className={css.end}>{end}</div> : null}
      </div>
    </header>
  );
}
