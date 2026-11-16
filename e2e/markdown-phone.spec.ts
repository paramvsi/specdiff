// M-16: below 720 px, Markdown's Side by side is a Before / After toggle; Rendered stays the default.
import { expect, test } from '@playwright/test';

test('Markdown on a phone: Before / After instead of Side by side, one column, nothing scrolls sideways @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=markdown');
  const views = page.getByRole('radiogroup', { name: 'View' });
  await expect(views.getByRole('radio', { name: 'Rendered' })).toBeChecked();
  await expect(views.getByRole('radio', { name: 'Side by side' })).toHaveCount(0);
  await views.getByRole('radio', { name: 'Before' }).click();
  await expect(page.locator('[data-only="before"]').first()).toBeVisible();
  await expect(page.locator('[data-side="after"]:visible')).toHaveCount(0);
  await views.getByRole('radio', { name: 'After' }).click();
  await expect(page.locator('[data-only="after"]').first()).toBeVisible();
  await expect(page.locator('[data-side="before"]:visible')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('Markdown on a desktop keeps Side by side', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Side by side' })).toBeVisible();
});
