// Dialogs on a phone: a body that scrolls can be reached and scrolled from the keyboard
// (axe scrollable-region-focusable), and the palette's input is a 44 px target.
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

test('Keyboard shortcuts dialog scrolls from the keyboard on a phone @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  const body = dialog.getByRole('region', { name: 'Keyboard shortcuts' });
  await expect(body).toHaveAttribute('tabindex', '0');
  await expectAxeClean(page);
});

test('Command palette input is 44 px tall on a phone @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('Suggested version')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox');
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
