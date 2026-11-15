import { Upload } from 'lucide-react';
import { cx } from '../../internal/cx';
import css from './DropZone.module.css';

export interface DropZoneProps {
  /** Dragging-over state (dashed ink border, brand tint). */
  dragging?: boolean | undefined;
  title?: string | undefined;
  /** e.g. "payments-v2.yaml · 48 KB". */
  detail?: string | undefined;
  className?: string | undefined;
}

/** Drop target shown while a file is dragged over the page. */
export function DropZone({ dragging, title = 'Drop to compare', detail, className }: DropZoneProps) {
  return (
    <div className={cx(css.zone, dragging && css.dragging, className)}>
      <Upload className={css.icon} aria-hidden="true" />
      <span className={css.title}>{title}</span>
      {detail ? <span className={css.detail}>{detail}</span> : null}
    </div>
  );
}
