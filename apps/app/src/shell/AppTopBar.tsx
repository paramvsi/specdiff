import { Button, FileChip, Kbd, Menu, ModeBadge, TopBar } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useApp } from '../state/store';
import { modeLabel } from './labels';
import { openPalette } from './palette';
// Loaded on demand so report builders and the schema library stay out of the start-up bundle.
const ShareDialog = lazy(() => import('../screens/ShareDialog').then((m) => ({ default: m.ShareDialog })));
const ExportMenu = lazy(() => import('../screens/ExportMenu').then((m) => ({ default: m.ExportMenu })));
const CopyLlmMenu = lazy(() => import('./CopyLlm').then((m) => ({ default: m.CopyLlmMenu })));
import css from './AppTopBar.module.css';

export function AppTopBar() {
  const { before, after, result, screen, setScreen } = useApp();
  const [share, setShare] = useState(false);
  const hasResult = !!result && !('kind' in result);
  const start =
    before && after ? (
      <div className={css.files}>
        <FileChip name={before.name} />
        <icons.ArrowRight size={14} aria-label="compared with" className={css.arrow} />
        <FileChip name={after.name} />
        {hasResult && <ModeBadge mode={modeLabel(result)} beta={result.mode === 'code'} />}
      </div>
    ) : null;
  const end = (
    <div className={css.actions}>
      <button
        type="button"
        className={css.search}
        onClick={openPalette}
        // The visible label is hidden below 1024 px; keep the name.
        aria-label={screen === 'result' ? 'Search changes' : 'Search'}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <icons.Search size={15} aria-hidden="true" />
        <span className={css.searchLabel}>{screen === 'result' ? 'Search changes' : 'Search'}</span>
        <Kbd className={css.kbd}>⌘K</Kbd>
      </button>
      <Menu
        align="end"
        trigger={
          <Button variant="secondary" iconOnly icon={<icons.Menu size={16} />} aria-label="More" />
        }
        items={[
          { label: 'New comparison', onSelect: () => setScreen('compare') },
          ...(hasResult && result.mode === 'openapi' ? [{ label: 'Open in Viewer', onSelect: () => setScreen('viewer') }] : []),
          { label: 'History', onSelect: () => setScreen('history') },
          { label: 'Saved sources', onSelect: () => setScreen('saved') },
          { label: 'Rules and settings', onSelect: () => setScreen('settings') },
        ]}
      />
      {hasResult && result.mode === 'openapi' && (
        // Phones are read-only (M-01): Copy for LLM is a review tool and doesn't fit the compact bar.
        <span className={css.llm}>
          <Suspense fallback={null}>
            <CopyLlmMenu />
          </Suspense>
        </span>
      )}
      <Button
        variant="secondary"
        icon={<icons.Share size={15} />}
        disabled={!before || !after}
        onClick={() => setShare(true)}
      >
        Share
      </Button>
      <Suspense fallback={<Button variant="brand" icon={<icons.Download size={15} />} disabled>Export</Button>}>
        <ExportMenu disabled={!hasResult} />
      </Suspense>
      {share && (
        <Suspense fallback={null}>
          <ShareDialog open onOpenChange={setShare} />
        </Suspense>
      )}
    </div>
  );
  return <TopBar start={start} end={end} homeHref="/app/" />;
}
