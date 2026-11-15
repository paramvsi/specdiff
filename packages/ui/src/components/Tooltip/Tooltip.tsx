import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';
import { usePortalContainer } from '../../internal/portal';
import css from './Tooltip.module.css';

export interface TooltipProps {
  content: ReactNode;
  /** A focusable element (usually a Button). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined;
}

/** Tooltip on hover and keyboard focus. Supplementary only; never the sole label. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const container = usePortalContainer();
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal container={container}>
          <RadixTooltip.Content className={css.content} side={side} sideOffset={6}>
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
