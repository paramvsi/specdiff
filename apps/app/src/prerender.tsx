// B-53: the empty Compare screen rendered to HTML at build time. main.tsx hydrates it in place, so
// phones paint the page before the JS arrives and the painted nodes are kept (no second LCP).
import './prerender-env';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';

export const render = () =>
  renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
