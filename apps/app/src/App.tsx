import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from '@specdiff/ui';
import { useApp } from './state/store';
import { AppTopBar } from './shell/AppTopBar';
import { useBoot } from './shell/boot';
import { useGlobalKeys } from './shell/keys';
import { Palette } from './shell/palette';
import { Shortcuts } from './shell/Shortcuts';
import { Compare } from './screens/Compare';
import { Parsing } from './screens/Parsing';
import { Result } from './screens/Result';
import css from './App.module.css';

// ponytail: path switch instead of a router lib; docs/05 lists none.
const DesignSystem = import.meta.env.DEV ? lazy(() => import('./ds/DesignSystem')) : null;
const History = lazy(() => import('./screens/History'));
const Settings = lazy(() => import('./screens/Settings'));
const Unlock = lazy(() => import('./screens/Unlock'));
const SavedSources = lazy(() => import('./screens/SavedSources'));

function useTheme() {
  const { theme, diffTheme } = useApp((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    if (diffTheme === 'default') root.removeAttribute('data-diff-theme');
    else root.setAttribute('data-diff-theme', diffTheme);
  }, [theme, diffTheme]);
}

export function App() {
  const path = location.pathname.replace(/^\/app/, '') || '/';
  if (DesignSystem && path.startsWith('/_ds')) {
    return (
      <Suspense fallback={null}>
        <DesignSystem />
      </Suspense>
    );
  }
  return <Main />;
}

function Main() {
  useTheme();
  useBoot();
  useGlobalKeys();
  const screen = useApp((s) => s.screen);
  return (
    <Toaster>
      <div className={css.app}>
        <a className={css.skip} href="#main">
          Skip to content
        </a>
        <AppTopBar />
        <main id="main" className={css.main} tabIndex={-1}>
          <Suspense fallback={null}>
            {screen === 'compare' && <Compare />}
            {screen === 'parsing' && <Parsing />}
            {screen === 'result' && <Result />}
            {screen === 'history' && <History />}
            {screen === 'settings' && <Settings />}
            {screen === 'unlock' && <Unlock />}
            {screen === 'saved' && <SavedSources />}
          </Suspense>
        </main>
        <Palette />
        <Shortcuts />
      </div>
    </Toaster>
  );
}
