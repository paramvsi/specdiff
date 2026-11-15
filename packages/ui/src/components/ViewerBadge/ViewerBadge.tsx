import { cx } from '../../internal/cx';
import css from './ViewerBadge.module.css';

export type ViewerBadgeKind = 'new' | 'changed' | 'breaking' | 'deprecated';

const LABEL: Record<ViewerBadgeKind, string> = {
  new: 'New',
  changed: 'Changed',
  breaking: 'Breaking',
  deprecated: 'Deprecated',
};

/** Viewer change badge: New (safe), Changed, Breaking, Deprecated (possibly). */
export function ViewerBadge({
  kind,
  className,
}: {
  kind: ViewerBadgeKind;
  className?: string | undefined;
}) {
  return <span className={cx(css.badge, css[kind], className)}>{LABEL[kind]}</span>;
}
