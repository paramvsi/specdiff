// Build-time only (prerender.tsx): the browser globals the first render reads. Everything else
// (settings, samples, share links) is applied in effects after hydration, so it can't mismatch.
const g = globalThis as Record<string, unknown>;
g.window = g;
g.location = new URL('http://localhost/app/');
