// M-16: below 720 px, Markdown's Side by side is a Before / After toggle; Rendered stays the default.
import { expect, test } from '@playwright/test';

test('Markdown on a phone: Before / After instead of Side by side, one column, nothing scrolls sideways @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=markdown');
  const views = page.getByRole('radiogroup', { name: 'View' }).or(page.getByRole('group', { name: 'View' }));
  await expect(views.getByRole('radio', { name: 'Rendered' }).or(views.getByRole('button', { name: 'Rendered' }))).toBeVisible();
  await expect(views.getByText('Side by side')).toHaveCount(0);
  await views.getByText('Before', { exact: true }).click();
  const list = page.getByRole('list', { name: 'Before, scrollable' }).or(page.getByLabel('Before, scrollable'));
  await expect(list.first()).toBeVisible();
  await views.getByText('After', { exact: true }).click();
  await expect(page.getByLabel('After, scrollable').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('Markdown on a desktop keeps Side by side', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/?sample=markdown');
  await expect(page.getByText('Side by side', { exact: true })).toBeVisible();
});
