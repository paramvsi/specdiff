// X-08 identical state, X-11 mark as viewed and X-12 deep links in JSON/YAML, Markdown and Code modes.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

test.use({ baseURL: 'http://localhost:4173' });

async function paste(page: Page, before: string, after: string, mode: string) {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill(before);
  await page.getByRole('textbox', { name: 'After' }).fill(after);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption(mode);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

test('X-08 identical JSON and Markdown show "No differences"', async ({ page }) => {
  await paste(page, '{"a": 1, "b": [1, 2]}', '{"b": [1, 2], "a": 1}', 'yaml');
  await expect(page.getByText('No differences')).toBeVisible();
  await expectAxeClean(page);
  await paste(page, '# Title\n\nSame text.\n', '# Title\n\nSame text.\n', 'markdown');
  await expect(page.getByText('No differences')).toBeVisible();
});

test('X-12 JSON: J writes a deep link that reopens the same change', async ({ page }) => {
  await page.goto('/app/?sample=json');
  await expect(page.getByText(/of \d+ viewed/)).toBeVisible();
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/#change=c-0002$/);
  await page.keyboard.press('v');
  await expect(page.getByText('1 of 3 viewed')).toBeVisible();
  await page.goto('/app/?sample=json#change=c-0002');
  await expect(page.locator('[aria-current="true"]').first()).toBeFocused();
});

test('X-11 / X-12 Markdown: V marks the block viewed, the link is written', async ({ page }) => {
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('heading', { name: 'Outline' })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/#change=m-\d+$/);
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Viewed', pressed: true }).first()).toBeVisible();
  await expectAxeClean(page);
});

test('X-11 / X-12 Code: items can be viewed and linked', async ({ page }) => {
  await page.goto('/app/?sample=code');
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/#change=k-pay$/);
  await page.keyboard.press('v');
  await expect(page.getByText('1 of 1 viewed')).toBeVisible();
  await expectAxeClean(page);
});
