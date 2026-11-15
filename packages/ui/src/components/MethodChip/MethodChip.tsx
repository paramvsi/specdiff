import { cx } from '../../internal/cx';
import css from './MethodChip.module.css';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL';

/** HTTP method badge in Geist Mono. The method name is always shown as text. */
export function MethodChip({
  method,
  className,
}: {
  method: HttpMethod;
  className?: string | undefined;
}) {
  return <span className={cx(css.chip, css[method.toLowerCase()], className)}>{method}</span>;
}
