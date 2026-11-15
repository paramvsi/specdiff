import type { CSSProperties } from 'react';
import { cx } from '../../internal/cx';
import css from './Skeleton.module.css';

export interface SkeletonProps {
  width?: CSSProperties['width'] | undefined;
  height?: CSSProperties['height'] | undefined;
  radius?: 'xs' | 'sm' | 'md' | 'lg' | 'pill' | undefined;
  className?: string | undefined;
}

/** Placeholder block for the next view while it loads. Static: no shimmer loop. */
export function Skeleton({ width = '100%', height = 12, radius = 'sm', className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(css.skeleton, className)}
      style={{ width, height, borderRadius: `var(--sd-radius-${radius})` }}
    />
  );
}
