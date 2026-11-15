// IN-09: a parse error on one very long line (minified JSON) shows its excerpt in a region that
// scrolls sideways; it must be reachable from the keyboard (axe scrollable-region-focusable).
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

test('a parse error in minified JSON is axe clean and its excerpt is keyboard-scrollable', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  const minified = JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`key${i}`, i]))).replace('"key399":399}', '"key399":399');
  for (const [name, value] of [['Before', '{"a":1}'], ['After', minified]] as const)
    await page.getByRole('textbox', { name, exact: true }).evaluate((el, v) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('yaml');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByText(/^Couldn't parse After/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Source near the error' })).toHaveAttribute('tabindex', '0');
  await expectAxeClean(page);
});
