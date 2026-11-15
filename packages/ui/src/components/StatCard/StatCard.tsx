import { cx } from '../../internal/cx';
import type { Severity } from '../../internal/severity';
import { SeverityBadge } from '../SeverityBadge/SeverityBadge';
import css from './StatCard.module.css';

export interface StatCardProps {
  severity: Severity;
  count: number;
  className?: string | undefined;
}

/** Severity count card for the summary row. */
export function StatCard({ severity, count, className }: StatCardProps) {
  return (
    <div className={cx(css.card, className)}>
      <span className={css.badge}>
        <SeverityBadge severity={severity} />
      </span>
      <span className={css.value}>{count}</span>
    </div>
  );
}

export interface SuggestedVersionCardProps {
  version: string;
  bump: 'major' | 'minor' | 'patch' | 'none';
  className?: string | undefined;
}

/** The inverse emphasis block: suggested next version and bump. */
export function SuggestedVersionCard({ version, bump, className }: SuggestedVersionCardProps) {
  return (
    <div className={cx(css.card, css.inverse, className)}>
      <span className={css.eyebrow}>Suggested version</span>
      <span className={css.row}>
        <span className={css.value}>{version}</span>
        <span className={css.bump}>{bump === 'none' ? 'no change' : bump}</span>
      </span>
    </div>
  );
}
