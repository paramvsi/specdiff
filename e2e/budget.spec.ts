// docs/04 budget: app start-up JS ≤ 200 KB gzip, measured as what a real page load fetches
// (entry, preloads, and lazy chunks that load anyway), on the production build.
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

test('app start-up JS fetched on /app/ is at most 200 KB gzip', async ({ page }) => {
  const sizes = new Map<string, number>();
  page.on('response', async (r) => {
    if (r.request().resourceType() !== 'script' || !r.ok()) return;
    try { sizes.set(new URL(r.url()).pathname, gzipSync(await r.body()).length); } catch { /* aborted */ }
  });
  await page.goto('http://localhost:4173/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  const top = [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, s]) => `${(s / 1000).toFixed(1)} kB ${p}`).join('\n');
  expect(total, `fetched ${sizes.size} scripts, ${(total / 1000).toFixed(1)} kB gzip:\n${top}`).toBeLessThanOrEqual(200_000);
});
