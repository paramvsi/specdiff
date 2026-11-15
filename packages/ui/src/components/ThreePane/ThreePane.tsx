import { ListTree } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from '../../internal/cx';
import { useMediaQuery } from '../../internal/useMediaQuery';
import { Button } from '../Button/Button';
import { Drawer } from '../Drawer/Drawer';
import css from './ThreePane.module.css';

export interface ThreePaneProps {
  tree: ReactNode;
  content: ReactNode;
  inspector?: ReactNode | undefined;
  /** Accessible names for the three regions. */
  treeLabel?: string | undefined;
  contentLabel?: string | undefined;
  inspectorLabel?: string | undefined;
  className?: string | undefined;
}

/**
 * Workspace layout. ≥1024px: tree (240–300px) · content · inspector (240–300px).
 * 640–1023px: the tree moves into a drawer. <640px: one column.
 */
export function ThreePane({
  tree,
  content,
  inspector,
  treeLabel = 'Changes',
  contentLabel = 'Change detail',
  inspectorLabel = 'Inspector',
  className,
}: ThreePaneProps) {
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className={cx(css.layout, wide ? css.wide : css.narrow, !inspector && css.noInspector, className)}>
      {wide ? (
        <section aria-label={treeLabel} className={css.tree}>
          {tree}
        </section>
      ) : (
        <div className={css.treeToggle}>
          <Drawer
            title={treeLabel}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            trigger={
              <Button variant="secondary" icon={<ListTree />}>
                {treeLabel}
              </Button>
            }
          >
            {tree}
          </Drawer>
        </div>
      )}
      <section aria-label={contentLabel} className={css.content}>
        {content}
      </section>
      {inspector ? (
        <section aria-label={inspectorLabel} className={css.inspector}>
          {inspector}
        </section>
      ) : null}
    </div>
  );
}
