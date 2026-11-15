import { lazy, Suspense } from 'react';

// ponytail: path switch instead of a router lib; docs/05 lists none.
const DesignSystem = import.meta.env.DEV ? lazy(() => import('./ds/DesignSystem')) : null;

export function App() {
  const path = location.pathname.replace(/^\/app/, '') || '/';
  if (DesignSystem && path.startsWith('/_ds')) {
    return (
      <Suspense fallback={null}>
        <DesignSystem />
      </Suspense>
    );
  }
  return (
    <main>
      <h1>Specdiff</h1>
    </main>
  );
}
