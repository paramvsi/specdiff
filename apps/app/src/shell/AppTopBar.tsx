import { Button, FileChip, Kbd, Menu, ModeBadge, TopBar } from '@specdiff/ui';
import * as icons from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../state/store';
import { modeLabel } from './labels';
import { openPalette } from './palette';
import { ShareDialog } from '../screens/ShareDialog';
import { ExportMenu } from '../screens/ExportMenu';
import { CopyLlmMenu } from './CopyLlm';
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
          <CopyLlmMenu />
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
      <ExportMenu disabled={!hasResult} />
      {share && <ShareDialog open onOpenChange={setShare} />}
    </div>
  );
  return <TopBar start={start} end={end} homeHref="/app/" />;
}
