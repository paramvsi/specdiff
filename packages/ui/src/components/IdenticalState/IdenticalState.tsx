import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { LogoMark } from '../Logo/Logo';

export interface IdenticalStateProps {
  /** Formatting-only lines that were ignored. */
  ignoredLines: number;
  onShowFormatting?: (() => void) | undefined;
  className?: string | undefined;
}

/** Identical files: mark, "No differences", ignored-formatting note, "Show formatting changes". */
export function IdenticalState({ ignoredLines, onShowFormatting, className }: IdenticalStateProps) {
  return (
    <EmptyState
      className={className}
      icon={<LogoMark size={40} />}
      title="No differences"
      actions={
        <Button variant="secondary" onClick={onShowFormatting}>
          Show formatting changes
        </Button>
      }
    >
      The two files mean exactly the same. {ignoredLines} formatting-only{' '}
      {ignoredLines === 1 ? 'line was' : 'lines were'} ignored.
    </EmptyState>
  );
}
