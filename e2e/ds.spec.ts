import { test, expect } from '@playwright/test';
import { expectAxeClean } from './a11y';

for (const theme of ['light', 'dark'] as const) {
  test(`/_ds tokens in ${theme} are axe clean`, async ({ page }) => {
    await page.goto('/app/_ds');
    await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
    if (theme === 'dark') await page.getByRole('button', { name: /Theme/ }).click();
    await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme', theme);
    await expectAxeClean(page);
  });
}

test('fonts load from the app origin', async ({ page }) => {
  await page.goto('/app/_ds');
  await page.waitForFunction(
    () => document.fonts.check('16px Geist') && document.fonts.check('12px "Geist Mono"'),
  );
  const fonts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.endsWith('.woff2')),
  );
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect(new URL(f).origin).toBe(new URL(page.url()).origin);
});
