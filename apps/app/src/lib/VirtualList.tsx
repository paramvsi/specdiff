// X-02: long lists render only the rows in view (TanStack Virtual). Short lists render as they are, so small
// diffs keep plain document flow and find-in-page.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';

/** Props a row spreads on its own root element when the list is virtual. */
export interface RowSlot {
  'data-index': number;
  style: CSSProperties;
  measure: (el: Element | null) => void;
}

export interface VirtualListApi {
  /** Bring row i into view (it is rendered by the next frame). */
  scrollToIndex: (i: number) => void;
}

export interface VirtualListProps {
  count: number;
  /** Estimated row height in px. */
  estimate: number;
  render: (i: number, slot?: RowSlot) => ReactNode;
  /** The container element for the rows ('ul' for lists of <li>). */
  as?: 'div' | 'ul' | 'ol';
  /** Lists longer than this are virtualised. */
  threshold?: number;
  /** Accessible name of the scroll region (virtual lists only). */
  label: string;
  className?: string | undefined;
  listClassName?: string | undefined;
  listLabel?: string | undefined;
  apiRef?: Ref<VirtualListApi>;
  /** Height of the scroll region when virtual. */
  height?: string;
}

export const VIRTUAL_THRESHOLD = 300;

export function VirtualList(p: VirtualListProps) {
  return p.count > (p.threshold ?? VIRTUAL_THRESHOLD) ? <Virtual {...p} /> : <Plain {...p} />;
}

function Plain({ count, render, as: Tag = 'div', listClassName, listLabel, apiRef }: VirtualListProps) {
  useImperativeHandle(apiRef, () => ({ scrollToIndex: () => {} }), []);
  return (
    <Tag className={listClassName} aria-label={listLabel}>
      {Array.from({ length: count }, (_, i) => render(i))}
    </Tag>
  );
}

function Virtual({
  count,
  estimate,
  render,
  as: Tag = 'div',
  label,
  className,
  listClassName,
  listLabel,
  apiRef,
  height = '70vh',
}: VirtualListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual: same use as TextResult.
  const v = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimate,
    overscan: 20,
  });
  useImperativeHandle(apiRef, () => ({ scrollToIndex: (i) => v.scrollToIndex(i, { align: 'center' }) }), [v]);
  return (
    <div
      ref={scroller}
      className={className}
      style={{ height, overflow: 'auto' }}
      role="region"
      // Scrollable content must be reachable by keyboard (axe scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={label}
    >
      <Tag
        className={listClassName}
        aria-label={listLabel}
        style={{ height: v.getTotalSize(), position: 'relative', margin: 0 }}
      >
        {v.getVirtualItems().map((it) =>
          render(it.index, {
            'data-index': it.index,
            style: { position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` },
            measure: v.measureElement,
          }),
        )}
      </Tag>
    </div>
  );
}
