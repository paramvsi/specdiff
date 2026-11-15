import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../internal/cx';
import css from './Button.module.css';

export type ButtonVariant = 'brand' | 'secondary' | 'ghost' | 'inverse' | 'danger';

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  variant?: ButtonVariant | undefined;
  /** Lucide icon (15px) shown before the label. */
  icon?: ReactNode | undefined;
};

type LabelledProps = BaseProps & {
  iconOnly?: false | undefined;
  children: ReactNode;
  'aria-label'?: string | undefined;
};

/** Icon-only buttons must carry an accessible name. */
type IconOnlyProps = BaseProps & {
  iconOnly: true;
  icon: ReactNode;
  'aria-label': string;
  children?: never;
};

export type ButtonProps = LabelledProps | IconOnlyProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, iconOnly, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(css.button, css[variant], iconOnly && css.iconOnly, className)}
      {...rest}
    >
      {icon ? (
        <span className={css.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : children}
    </button>
  );
});
