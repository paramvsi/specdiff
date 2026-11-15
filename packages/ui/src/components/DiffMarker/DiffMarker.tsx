import { cx } from '../../internal/cx';
import css from './DiffMarker.module.css';

export type DiffKind = 'added' | 'removed' | 'changed' | 'moved' | 'type-changed';

const TEXT: Record<DiffKind, string> = {
  added: '+ added',
  removed: '− removed',
  changed: '~ changed',
  moved: '↕ moved',
  'type-changed': 'type changed',
};

/** Diff marker pill: symbol and word, never colour alone. */
export function DiffMarker({ kind, className }: { kind: DiffKind; className?: string | undefined }) {
  return <span className={cx(css.marker, css[kind], className)}>{TEXT[kind]}</span>;
}
