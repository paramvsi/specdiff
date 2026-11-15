import { Clock, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';

export interface EmptyHistoryStateProps {
  onNewComparison?: (() => void) | undefined;
  onTrySample?: (() => void) | undefined;
  className?: string | undefined;
  /** Shown under the buttons, e.g. the "Save new comparisons to history" checkbox (A-11 empty). */
  footer?: ReactNode | undefined;
}

/** Empty history: one line plus "Try a sample". */
export function EmptyHistoryState({ onNewComparison, onTrySample, className, footer }: EmptyHistoryStateProps) {
  return (
    <EmptyState
      className={className}
      size="lg"
      icon={<Clock size={30} />}
      footer={footer}
      title="No comparisons yet"
      actions={
        <>
          <Button variant="brand" icon={<Plus size={15} />} onClick={onNewComparison}>
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
