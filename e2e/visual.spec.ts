// Visual baselines (B-3, B-21): main screens at 1440 and 390 px, light and dark. Each baseline was
// locked after the round-4 fixes and the screen audit against design/screens (docs/audit/screens.md).
// Regenerate deliberately with `pnpm exec playwright test e2e/visual.spec.ts --update-snapshots`.
import { expect, test, type Page } from '@playwright/test';

const APP = 'http://localhost:4173/app/';
const VIEWER = 'http://localhost:5174/';
const SITE = 'http://localhost:4321/';

type Shot = { name: string; url: string; ready: (p: Page) => Promise<unknown>; then?: (p: Page) => Promise<unknown> };
const h1 = (p: Page) => expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible();
/** A sample result: the Compare screen has gone and the result's heading is up. */
const result = async (p: Page) => {
  await expect(p.getByRole('heading', { name: 'Compare two files' })).toHaveCount(0);
  await h1(p);
};
const tab = (name: string) => async (p: Page) => {
  await p.getByRole('tab', { name }).click();
  await expect(p.getByRole('tab', { name, selected: true })).toBeVisible();
};

const shots: Shot[] = [
  { name: 'app-compare', url: APP, ready: (p) => expect(p.getByRole('heading', { name: 'Compare two files' })).toBeVisible() },
  { name: 'app-openapi-summary', url: `${APP}?sample=openapi`, ready: (p) => expect(p.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible() },
  { name: 'app-openapi-workspace', url: `${APP}?sample=openapi`, ready: (p) => expect(p.getByRole('tab', { name: 'Summary' })).toBeVisible(), then: tab('Workspace') },
  { name: 'app-openapi-rawdiff', url: `${APP}?sample=openapi`, ready: (p) => expect(p.getByRole('tab', { name: 'Summary' })).toBeVisible(), then: tab('Raw diff') },
  { name: 'app-openapi-changelog', url: `${APP}?sample=openapi`, ready: (p) => expect(p.getByRole('tab', { name: 'Summary' })).toBeVisible(), then: tab('Changelog') },
  { name: 'app-json', url: `${APP}?sample=json`, ready: result },
  { name: 'app-markdown', url: `${APP}?sample=markdown`, ready: result },
  { name: 'app-code', url: `${APP}?sample=code`, ready: result },
  { name: 'app-text', url: `${APP}?sample=text`, ready: result },
  { name: 'viewer-overview', url: VIEWER, ready: h1 },
  { name: 'viewer-endpoint', url: `${VIEWER}#/op/post-v1-payments`, ready: h1 },
  { name: 'viewer-schema', url: `${VIEWER}#/schema/card`, ready: h1 },
  { name: 'site-home', url: SITE, ready: h1 },
  { name: 'site-docs', url: `${SITE}docs/`, ready: h1 },
  { name: 'site-rules', url: `${SITE}rules/`, ready: h1 },
  { name: 'site-rule-detail', url: `${SITE}rules/request-property-became-required/`, ready: h1 },
  { name: 'site-changelog', url: `${SITE}changelog/`, ready: h1 },
  { name: 'site-404', url: `${SITE}no-such-page/`, ready: h1 },
];

// The phone OpenAPI result is read-only with no tabs (M-01), so tab shots are desktop-only.
const phoneSkip = new Set(['app-openapi-workspace', 'app-openapi-rawdiff', 'app-openapi-changelog']);

for (const width of [1440, 390] as const)
  for (const scheme of ['light', 'dark'] as const)
    for (const s of shots) {
      if (width === 390 && phoneSkip.has(s.name)) continue;
      test(`visual ${s.name} ${width} ${scheme}`, async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'sizes are set per test');
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        // The Viewer harness takes its theme from ?theme= rather than the colour scheme.
        await page.goto(s.url.startsWith(VIEWER) ? s.url.replace(VIEWER, `${VIEWER}?theme=${scheme}`) : s.url);
        // The phone result has no tabs (M-01): wait for its content instead.
        await (width === 390 && s.name === 'app-openapi-summary' ? result(page).then(() => expect(page.getByText('Suggested version')).toBeVisible()) : s.ready(page));
        await s.then?.(page);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${s.name}-${width}-${scheme}.png`, { animations: 'disabled', caret: 'hide', fullPage: false });
      });
    }
