// PK-08: the built app installs a service worker and opens offline.
import { expect, test } from '@playwright/test';

test('the app works offline after the first visit', async ({ page, context }) => {
  await page.goto('http://localhost:4173/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
  expect(manifest).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.getByRole('button', { name: 'Log file' }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await context.setOffline(false);
});
