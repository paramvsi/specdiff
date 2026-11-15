// Website copy buttons: the label comes back after quick repeated clicks, and the copy is announced.
import { expect, test } from '@playwright/test';

test('copy button keeps its name after a double click and announces the copy', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('http://localhost:4321/');
  const btn = page.getByRole('button', { name: 'Copy command' });
  await btn.click();
  await btn.or(page.getByRole('button', { name: 'Copied' })).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(1);
  await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: 'Copy command' })).toBeVisible();
});
