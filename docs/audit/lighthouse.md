# Lighthouse (B-21)

Run ad hoc on 2026-11-15 with `npx lighthouse@12.8.2` (not a repo dependency) and Playwright's Chromium, against the production previews (`astro preview` :4321, `vite preview` :4173). Target (docs/04): ≥ 95 in every category.

| Page | Preset | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| Website `/` | mobile | 98 | 96 ¹ | 100 | 100 |
| Website `/docs/` | mobile | 100 | 100 | 100 | 100 |
| Website `/docs/openapi/` | mobile | 99 | 100 | 100 | 100 |
| Website `/rules/` | mobile | 99 | 100 | 100 | 100 |
| Website `/rules/request-property-became-required/` | mobile | 99 | 100 | 100 | 100 |
| Website `/changelog/` | mobile | 99 | 100 | 100 | 100 |
| App `/app/` | desktop | 100 | 100 | 100 | 100 |
| App `/app/` | mobile (simulated) | **92** ² | 100 | 100 | 100 |
| App `/app/` | mobile (real throttling, `--throttling-method=devtools`) | 100 | 100 | 100 | 100 |

**Fixed in this pass:** website pages shifted by 0.27 (CLS) when Geist loaded; `/rules/` and `/docs/` scored 84–85. The layout now preloads the five font files every page uses (`apps/website/src/layouts/Base.astro`), and CLS is 0.

¹ Lighthouse samples the page mid-animation: the hero's cross-fading slides and a terminal line that is still fading in. At rest those texts pass (`--sd-brand` on the terminal background is about 13:1), and axe in the e2e suite, run with reduced motion, is clean.

² **B-53, SSR hydration (owner ruling).** The empty Compare screen is server-rendered at build time (`apps/app/src/prerender.tsx`, `vite build --ssr`), put into `index.html`, and hydrated in place (`main.tsx`), so the painted nodes are kept. The JS is fetched with `fetchpriority="low"`, because the HTML and CSS paint the page on their own. `e2e/hydration.spec.ts` guards it: the painted `<h1>` must be the hydrated one, which fails when `createRoot` replaces it, and there must be no hydration errors.

| App mobile | FCP | LCP | Time to interactive | Score |
|---|---|---|---|---|
| Before (client-rendered) | 3.2 s | 3.2 s | | 87 |
| SSR hydration + low-priority JS, simulated | 1.8 s | 3.2 s | 3.2 s | 92 |
| SSR hydration + low-priority JS, real throttling | 1.4 s | 1.4 s | 3.9 s | 100 |

The simulated LCP stays at 3.2 s because Lighthouse's estimate counts every request that starts before the page's local paint (56 ms), and the JS requests start then. Removing them from the estimate would mean starting the JS only after first paint, which on a real slow phone makes the app interactive about a second later. The 92 is accepted and the real-throttling 100 recorded.
