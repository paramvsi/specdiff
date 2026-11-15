import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../internal/cx';
import type { Severity } from '../../internal/severity';
import { MethodChip, type HttpMethod } from '../MethodChip/MethodChip';
import { SeverityBadge } from '../SeverityBadge/SeverityBadge';
import css from './TreeItem.module.css';

export interface TreeItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  severity: Severity;
  method?: HttpMethod | undefined;
  /** Change title, e.g. "currency now required". */
  children: ReactNode;
  /** Right-aligned mono meta. */
  meta?: ReactNode | undefined;
  selected?: boolean | undefined;
}

/** Change tree item: compact severity dot, method, title. Selected = brand tint + 3px bar. */
export function TreeItem({
  severity,
  method,
  children,
  meta,
  selected,
  className,
  type = 'button',
  ...rest
}: TreeItemProps) {
  return (
    <button
      type={type}
      aria-current={selected ? 'true' : undefined}
      className={cx(css.item, selected && css.selected, className)}
      {...rest}
    >
      <SeverityBadge severity={severity} compact />
      {method ? <MethodChip method={method} /> : null}
      <span className={css.title}>{children}</span>
      {meta ? <span className={css.meta}>{meta}</span> : null}
    </button>
  );
}
