import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

// Run against the production build: the dev server can reload mid-test while it optimises dependencies.
test.use({ baseURL: 'http://localhost:4173' });

for (const scheme of ['light', 'dark'] as const) {
  test(`A-01 compare screen is axe clean (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/');
    await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
    await expectAxeClean(page);
  });
}

test('paste two texts and compare', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('alpha\nbeta\ngamma\n');
  await page.getByRole('textbox', { name: 'After' }).fill('alpha\nBETA\ngamma\ndelta\n');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expectAxeClean(page);
});

test('A-03 text sample: filters mask noise, navigation and shortcuts', async ({ page }) => {
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { name: '9 lines differ after filters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Filters', exact: true })).toBeVisible();
  await expect(page.getByText('‹time›').first()).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expectAxeClean(page);
});

test('O-05 load from URL explains GitHub links', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'From URL' }).first().click();
  await page.getByLabel('File URL').fill('https://github.com/acme/payments-api/blob/main/openapi.yaml');
  await expect(page.getByText('raw.githubusercontent.com/acme/payments-api/main/openapi.yaml')).toBeVisible();
  await expectAxeClean(page);
});

test('parse errors are pinned to a line', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('{"a": 1}');
  await page.getByRole('textbox', { name: 'After' }).fill('{"a": [1, 2}');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('yaml');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByText(/Couldn't parse After: line 1/)).toBeVisible();
});

test('A-09 code sample shows a structural diff (Beta)', async ({ page }) => {
  await page.goto('/app/?sample=code');
  await expect(page.getByRole('heading', { name: /1 logic change/ })).toBeVisible();
  await expect(page.getByText('Beta').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible();
  await expectAxeClean(page);
});

test('A-09 fallback: unsupported language shows a text diff with a notice', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('package main\nfunc a() {}\n');
  await page.getByRole('textbox', { name: 'After' }).fill('package main\nfunc a(b int) {}\n');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByText(/Structural diff supports TypeScript, JavaScript, Java and Python/)).toBeVisible();
});

test('X-05 the skip link moves focus to main without a ring around the whole page', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/');
  await page.locator('a[href="#main"]').focus();
  await page.keyboard.press('Enter');
  const main = page.locator('main#main');
  await expect(main).toBeFocused();
  expect(await main.evaluate((m) => [getComputedStyle(m).boxShadow, getComputedStyle(m).outlineStyle])).toEqual(['none', 'none']);
});
