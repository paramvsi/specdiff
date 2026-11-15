import { Button, FileChip, Kbd, Menu, ModeBadge, TopBar } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useApp } from '../state/store';
import { usePatch } from './chrome';
import { openPalette, run } from './commands';
import { modeLabel } from './labels';
// Loaded on demand so report builders and the schema library stay out of the start-up bundle.
// Export and Copy for LLM mount only once there is a result, so the empty Compare screen never fetches them.
const ShareDialog = lazy(() => import('../screens/ShareDialog').then((m) => ({ default: m.ShareDialog })));
const ExportMenu = lazy(() => import('../screens/ExportMenu').then((m) => ({ default: m.ExportMenu })));
const CopyLlmMenu = lazy(() => import('./CopyLlm').then((m) => ({ default: m.CopyLlmMenu })));
import css from './AppTopBar.module.css';

const DisabledExport = () => (
  <Button variant="brand" icon={<icons.Download size={15} />} disabled>
    Export
  </Button>
);

function SearchButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={css.search}
      onClick={openPalette}
      // The visible label is hidden below 1024 px; keep the name.
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <icons.Search size={15} aria-hidden="true" />
      <span className={css.searchLabel}>{label}</span>
      <Kbd className={css.kbd}>⌘K</Kbd>
    </button>
  );
}

function MoreMenu() {
  const { result, setScreen } = useApp();
  const hasResult = !!result && !('kind' in result);
  return (
    <Menu
      align="end"
      trigger={<Button variant="secondary" iconOnly icon={<icons.Menu size={16} />} aria-label="More" />}
      items={[
        { label: 'New comparison', onSelect: () => setScreen('compare') },
        ...(hasResult && result.mode === 'openapi' ? [{ label: 'Open in Viewer', onSelect: () => setScreen('viewer') }] : []),
        { label: 'History', onSelect: () => setScreen('history') },
        { label: 'Saved sources', onSelect: () => setScreen('saved') },
        { label: 'Rules and settings', onSelect: () => setScreen('settings') },
      ]}
    />
  );
}

/** The two file chips (and the mode once known). */
function Files({ badge }: { badge: boolean }) {
  const { before, after, result } = useApp();
  if (!before || !after) return null;
  const hasResult = !!result && !('kind' in result);
  return (
    <div className={css.files}>
      <FileChip name={before.name} />
      <icons.ArrowRight size={14} aria-label="compared with" className={css.arrow} />
      <FileChip name={after.name} />
      {badge && hasResult && <ModeBadge mode={modeLabel(result)} beta={result.mode === 'code'} />}
    </div>
  );
}

/**
 * Utility screens have their own bar (A-02, A-03 patch, A-11, A-12, A-13): no comparison chrome.
 * More stays as the way between screens; there is no other navigation.
 */
function UtilityActions() {
  const { screen, result, setScreen, compare, cancel } = useApp();
  const { patch, setPatch } = usePatch();
  if (screen === 'parsing')
    return (
      <div className={css.actions}>
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      </div>
    );
  if (screen === 'compare' && patch !== null)
    return (
      <div className={css.actions}>
        <Button variant="secondary" icon={<icons.ChevronLeft size={15} />} onClick={() => setPatch(null)}>
          Back
        </Button>
      </div>
    );
  const hasResult = !!result && !('kind' in result);
  return (
    <div className={css.actions}>
      {screen === 'history' && <SearchButton label="Search" />}
      <MoreMenu />
      {screen === 'history' && (
        <Button variant="brand" icon={<icons.Plus size={15} />} onClick={() => setScreen('compare')}>
          New comparison
        </Button>
      )}
      {screen === 'settings' && (
        // Re-run with the new rules when there is a comparison to go back to.
        <Button
          variant="secondary"
          icon={<icons.ChevronLeft size={15} />}
          onClick={() => (hasResult ? void compare() : setScreen('compare'))}
        >
          {hasResult ? 'Back to comparison' : 'Back'}
        </Button>
      )}
      {screen === 'saved' && (
        <Button variant="brand" icon={<icons.Plus size={15} />} onClick={() => run('add-source')}>
          Add source
        </Button>
      )}
    </div>
  );
}

export function AppTopBar() {
  const { before, after, result, screen } = useApp();
  const patch = usePatch((s) => s.patch);
  const [share, setShare] = useState(false);
  const hasResult = !!result && !('kind' in result);
  const utility =
    screen === 'history' || screen === 'settings' || screen === 'saved' || screen === 'parsing' || (screen === 'compare' && patch !== null);
  if (utility)
    return <TopBar start={screen === 'parsing' ? <Files badge={false} /> : null} end={<UtilityActions />} homeHref="/app/" />;

  const end = (
    <div className={css.actions}>
      <SearchButton label={screen === 'result' ? 'Search changes' : 'Search'} />
      <MoreMenu />
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
      {hasResult ? (
        <Suspense fallback={<DisabledExport />}>
          <ExportMenu disabled={false} />
        </Suspense>
      ) : (
        <DisabledExport />
      )}
      {share && (
        <Suspense fallback={null}>
          <ShareDialog open onOpenChange={setShare} />
        </Suspense>
      )}
    </div>
  );
  return <TopBar start={<Files badge />} end={end} homeHref="/app/" />;
}
