import { Button } from '../Button/Button';
import { cx } from '../../internal/cx';
import css from './TooLargeState.module.css';

export interface TooLargeStateProps {
  fileName: string;
  /** Human size, e.g. "31.4 MB". */
  size: string;
  /** Human limit, e.g. "25 MB". */
  limit: string;
  onCompareAsText?: (() => void) | undefined;
  onChooseAnother?: (() => void) | undefined;
  className?: string | undefined;
}

/** Too large: size, limit, "Compare as text". */
export function TooLargeState({
  fileName,
  size,
  limit,
  onCompareAsText,
  onChooseAnother,
  className,
}: TooLargeStateProps) {
  return (
    <div className={cx(css.root, className)}>
      <p className={css.title}>
        {fileName} is {size}
      </p>
      <p className={css.body}>
        Structural JSON comparison works up to {limit} in the browser. Above that, building the tree
        uses more memory than most tabs allow and the page can freeze.
      </p>
      <div className={css.actions}>
        <Button variant="brand" onClick={onCompareAsText}>
          Compare as text
        </Button>
        <Button variant="secondary" onClick={onChooseAnother}>
          Choose another file
        </Button>
      </div>
    </div>
  );
}
