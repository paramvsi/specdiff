import { test, expect, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

async function openDs(page: Page, theme: 'light' | 'dark') {
  await page.goto('/app/_ds');
  await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Components', exact: true })).toBeVisible();
  if (theme === 'dark') await page.getByRole('button', { name: /Theme/ }).click();
  await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme', theme);
}

for (const theme of ['light', 'dark'] as const) {
  test(`/_ds tokens and components in ${theme} are axe clean`, async ({ page }) => {
    await openDs(page, theme);
    await expectAxeClean(page);
  });

  test(`/_ds overlays in ${theme} inherit the theme and are axe clean`, async ({ page }) => {
    await openDs(page, theme);
    const trigger = page.getByRole('button', { name: 'Open dialog' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Share comparison' });
    await expect(dialog).toBeVisible();
    // Portalled into the themed wrapper: the dialog surface uses that theme's --sd-surface.
    const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(theme === 'dark' ? 'rgb(19, 22, 20)' : 'rgb(255, 255, 255)');
    await expectAxeClean(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.getByRole('button', { name: 'Show error toast' }).click();
    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(2); // the static sheet toast + the live one
    // Let the entrance animation finish so contrast is measured at full opacity.
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await expectAxeClean(page);
  });
}

test('keyboard: Tab reaches a component button with a visible focus ring', async ({ page }) => {
  await openDs(page, 'light');
  const target = page.getByRole('button', { name: 'Compare', exact: true });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await target.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  const shadow = await target.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe('none');
});

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
