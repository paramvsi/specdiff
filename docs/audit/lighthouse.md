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
| App `/app/` | mobile | **87** ² | 100 | 100 | 100 |

**Fixed in this pass:** website pages shifted by 0.27 (CLS) when Geist loaded; `/rules/` and `/docs/` scored 84–85. The layout now preloads the five font files every page uses (`apps/website/src/layouts/Base.astro`), and CLS is 0.

¹ Lighthouse samples the page mid-animation: the hero's cross-fading slides and a terminal line that is still fading in. At rest those texts pass (`--sd-brand` on the terminal background is about 13:1), and axe in the e2e suite, run with reduced motion, is clean.

² **Open, below target.** The app is a client-rendered SPA: on simulated slow 4G nothing paints until the start-up JS (174 KB gzip, under its 200 KB budget) has loaded. FCP and LCP are 3.2 s; locally the page paints at 69 ms. A prerendered, inert Compare screen was tried. It brought first paint forward (3.3 s → 1.9 s, real throttling) but pushed LCP back (3.3 s → 3.8 s), because React replaces the nodes, so the score didn't move and the change was reverted. Reaching 95 needs server-rendered HTML that React hydrates, or a much smaller start-up bundle. That is recorded as B-53.
