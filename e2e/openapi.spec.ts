import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

for (const scheme of ['light', 'dark'] as const) {
  test(`A-04 summary shows the payments numbers (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=openapi');
    await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Possibly breaking: 1' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Safe: 14' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Docs only: 9' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Suggested version' })).toContainText('2.0.0');
    await expect(page.getByRole('heading', { name: 'Where the 28 changes are' })).toBeVisible();
    await expectAxeClean(page);
  });
}

test('A-05 review a whole comparison with the keyboard only', async ({ page }) => {
  // The drawer fades in; check contrast on its final state.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.getByRole('tab', { name: 'Workspace', selected: true })).toBeVisible();
  await expect(page.getByText('0 of 5 decided')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('a');
    await page.keyboard.press('n');
  }
  await expect(page.getByText('5 of 5 decided')).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.getByText('4 accepted · 1 rejected · 0 open')).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.getByRole('checkbox', { name: 'Mark as viewed' })).toBeChecked();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await expectAxeClean(page);
});

test('A-06 raw diff markers link to changes', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Raw diff' }).click();
  await expect(page.getByRole('heading', { name: 'Changes in this file' })).toBeVisible();
  await page.getByRole('heading', { name: 'Changes in this file' }).locator('..').getByRole('button', { name: /Endpoint removed/ }).click();
  await expect(page.getByRole('note')).toContainText('Endpoint removed');
  await expectAxeClean(page);
  await page.getByRole('note').getByRole('button', { name: 'Open in workspace' }).click();
  await expect(page.getByRole('tab', { name: 'Workspace', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Endpoint removed/ })).toBeVisible();
});

test('A-10 changelog templates and A-12 settings', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Changelog' }).click();
  await expect(page.getByLabel('Changelog text')).toHaveValue(/currency/);
  await page.getByRole('tab', { name: 'Slack message' }).click();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Rules and settings' }).click();
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Severity for response-property-enum-value-added' }).selectOption('breaking');
  await expect(page.getByText('1 changed by you')).toBeVisible();
  await expectAxeClean(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).last().click();
  // Browsers drop the leading dot of a downloaded name; the UI says to rename it.
  expect((await dl).suggestedFilename()).toBe('specdiff.yaml');
});

test('A-05 SDK impact (Beta) and changes that affect me', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('radio', { name: 'SDK calls' }).click();
  await expect(page.getByText('payments.create({ currency })')).toBeVisible();
  await page.getByRole('radio', { name: 'Python' }).click();
  await expect(page.getByText('client.payments.create(currency=…)')).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Affects me' }).click();
  await page.getByLabel(/operationIds or METHOD/).fill('createPayment\nGET /v1/payments/{id}');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText(/Only changes to the 2 endpoints in your list/)).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByText('Only changes to')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`@phone M-01..M-03 read-only phone flow (${scheme})`, async ({ page }) => {
    test.skip(test.info().project.name !== 'phone');
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=openapi');
    await expect(page.getByText('Read-only on phones.')).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'See all 28 changes' }).click();
    await expect(page.getByRole('heading', { name: '28 changes' })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: /Endpoint removed/ }).first().click();
    await expect(page.getByRole('heading', { name: /of 28/ })).toBeVisible();
    await expect(page.getByText('Why it breaks')).toBeVisible();
    await expectAxeClean(page);
  });
}

test('the app opens the comparison in the Viewer with change badges', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Open in Viewer' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText('Breaking').first()).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
});
