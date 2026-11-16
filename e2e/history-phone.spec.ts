// M-3: no page scrolls sideways on a phone (code panes excepted). History rows become stacked cards
// below 720 px, with pin and delete in an overflow menu.
import { expect, test, type Page } from '@playwright/test';

/** Elements that scroll sideways, other than code panes (pre, [data-code-pane]). */
const sideways = (page: Page) =>
  page.evaluate(() =>
    [document.documentElement, ...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest('pre, code, [data-code-pane]'))
      .map((e) => e.className || e.tagName),
  );

test('History on a phone: stacked cards, an overflow menu with pin and delete, nothing scrolls sideways @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  // Wait for each result (the Compare heading is server-rendered before the app is ready).
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('radiogroup', { name: 'View' })).toBeVisible();
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('Suggested version')).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  const cards = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Open / }) });
  await expect(cards).toHaveCount(2);
  expect(await sideways(page)).toEqual([]);
  await cards.first().getByRole('button', { name: /^More for / }).click();
  await expect(page.getByRole('menuitem', { name: 'Pin' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(cards).toHaveCount(1);
});
