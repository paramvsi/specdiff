import { cx } from '../../internal/cx';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { Skeleton } from '../Skeleton/Skeleton';
import css from './LoadingState.module.css';

export interface LoadingSide {
  /** File name, e.g. "payments-v1.yaml". */
  name: string;
  /** 0–100. */
  progress: number;
  /** e.g. "Parsed", "Resolving references…". */
  status: string;
}

export interface LoadingStateProps {
  before: LoadingSide;
  after: LoadingSide;
  className?: string | undefined;
}

/** Loading: progress per side, then a skeleton of the next view. */
export function LoadingState({ before, after, className }: LoadingStateProps) {
  return (
    <div className={cx(css.root, className)} aria-busy="true">
      <p className={css.title}>Preparing your comparison</p>
      <p className={css.body}>
        Large specs take a few seconds. The page stays responsive while this runs in the background.
      </p>
      <div className={css.sides}>
        <ProgressBar label={before.name} value={before.progress} valueText={before.status} />
        <ProgressBar label={after.name} value={after.progress} valueText={after.status} />
      </div>
      <div className={css.skeleton}>
        <div className={css.stats}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} radius="lg" />
          ))}
        </div>
        <div className={css.panes}>
          <Skeleton height={160} radius="lg" />
          <Skeleton height={160} radius="lg" />
        </div>
      </div>
      <p className={css.note}>Running in this browser. Nothing is uploaded.</p>
    </div>
  );
}
