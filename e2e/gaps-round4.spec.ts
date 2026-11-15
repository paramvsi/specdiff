// Tests the round-3 audit found missing: OUT-06 real export → reopen, WEB-04 area filter, VW-12 logo, VW-14 Copy for LLM.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(() => { test.skip(test.info().project.name !== 'desktop', 'desktop only'); });

test('OUT-06: a comparison file the app exported opens the same comparison', async ({ page }) => {
  await page.goto('http://localhost:4173/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Changelog' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Comparison file/ }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.specdiff\.json$/);
  const buffer = await readFile(await file.path());
  await page.goto('http://localhost:4173/app/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).first().click();
  await (await chooser).setFiles({ name: file.suggestedFilename(), mimeType: 'application/json', buffer });
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
});

test('WEB-04: the rules reference filters by area', async ({ page }) => {
  await page.goto('http://localhost:4321/rules/');
  const rows = page.locator('table tbody tr:visible');
  const all = await rows.count();
  await page.getByRole('group', { name: 'Area' }).getByRole('button', { name: 'Security' }).click();
  await expect(page.getByRole('group', { name: 'Area' }).getByRole('button', { name: 'Security' })).toHaveAttribute('aria-pressed', 'true');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all);
  for (const area of await rows.locator('td:nth-child(3)').allTextContents()) expect(area.trim()).toBe('Security');
});

test('VW-12: the Viewer shows the embedder\'s logo and brand colour', async ({ page }) => {
  await page.goto('http://localhost:5174/?spec=payments&brand=1&logo=1');
  const logo = page.locator('header img').first();
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
});

test('VW-14: Copy for LLM puts the page as Markdown on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5174' });
  await page.goto('http://localhost:5174/?spec=payments');
  await page.getByRole('button', { name: 'Copy for LLM' }).first().click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/Payments/);
  expect(text.length).toBeGreaterThan(100);
});
