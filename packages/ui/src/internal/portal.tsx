import { createContext, useContext, type ReactNode } from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Portalled overlays (Dialog, Drawer, Menu, Select, Tooltip, CommandPalette) render into this
 * element instead of document.body, so they inherit `data-theme` from a themed wrapper.
 */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

/** Returns the container to portal into, or undefined (document.body). */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
