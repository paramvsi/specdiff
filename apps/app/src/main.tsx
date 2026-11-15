import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@specdiff/ui/styles.css';
import { App } from './App';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// B-53: production builds ship the Compare screen prerendered (vite.config.ts); hydrate it in place.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
