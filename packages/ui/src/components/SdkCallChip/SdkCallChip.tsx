import { cx } from '../../internal/cx';
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import css from './SdkCallChip.module.css';

/** SDK method chip; removed calls are struck through and announced as removed. */
export function SdkCallChip({
  call,
  removed,
  className,
}: {
  call: string;
  removed?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <code className={cx(css.chip, removed && css.removed, className)}>
      {removed ? <del>{call}</del> : call}
      {removed ? <VisuallyHidden> (removed)</VisuallyHidden> : null}
    </code>
  );
}
