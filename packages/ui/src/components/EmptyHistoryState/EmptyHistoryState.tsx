import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';

export interface EmptyHistoryStateProps {
  onNewComparison?: (() => void) | undefined;
  onTrySample?: (() => void) | undefined;
  className?: string | undefined;
}

/** Empty history: one line plus "Try a sample". */
export function EmptyHistoryState({ onNewComparison, onTrySample, className }: EmptyHistoryStateProps) {
  return (
    <EmptyState
      className={className}
      title="No comparisons yet"
      actions={
        <>
          <Button variant="brand" onClick={onNewComparison}>
            New comparison
          </Button>
          <Button variant="secondary" onClick={onTrySample}>
            Try a sample
          </Button>
        </>
      }
    >
      Comparisons you run appear here, kept only in this browser. Pin the ones you come back to.
    </EmptyState>
  );
}
