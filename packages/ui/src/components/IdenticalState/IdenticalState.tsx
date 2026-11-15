import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { LogoMark } from '../Logo/Logo';

export interface IdenticalStateProps {
  /** Formatting-only lines that were ignored; 0 says nothing about formatting. */
  ignoredLines: number;
  /** Offers "Show formatting changes" (only when formatting was ignored). */
  onShowFormatting?: (() => void) | undefined;
  className?: string | undefined;
}

/** Identical files: mark, "No differences", and, when formatting was ignored, a note and "Show formatting changes". */
export function IdenticalState({ ignoredLines, onShowFormatting, className }: IdenticalStateProps) {
  const ignored = ignoredLines > 0;
  return (
    <EmptyState
      className={className}
      icon={<LogoMark size={40} />}
      title="No differences"
      actions={
        ignored && onShowFormatting ? (
          <Button variant="secondary" onClick={onShowFormatting}>
            Show formatting changes
          </Button>
        ) : undefined
      }
    >
      The two files mean exactly the same.
      {ignored
        ? ` ${ignoredLines} formatting-only ${ignoredLines === 1 ? 'line was' : 'lines were'} ignored.`
        : null}
    </EmptyState>
  );
}
