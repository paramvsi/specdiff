// Viewer (V-01..V-06, M-04, M-05) against the harness in packages/viewer/harness (port 5174).
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

const H = 'http://localhost:5174/';
const ready = async (page: Page, url: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};

for (const theme of ['light', 'dark'] as const) {
  test(`V-01 overview with change badges, axe clean (${theme})`, async ({ page }) => {
    await ready(page, `${H}?theme=${theme}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
    const since = page.getByRole('region', { name: 'Since 1.5.0' });
    await expect(since.getByText('Breaking', { exact: true })).toBeVisible();
    const payouts = page.getByRole('region', { name: 'payouts' });
    await expect(payouts.getByRole('link', { name: /POST \/v1\/payouts .*New/ })).toBeVisible();
    await expectAxeClean(page);
  });

  test(`V-02 endpoint docs and samples, axe clean (${theme})`, async ({ page }) => {
    await ready(page, `${H}?theme=${theme}#/op/post-v1-payments`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create a payment in any supported currency' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Changed since 1.5.0' })).toBeVisible();
    await expect(page.getByText('was optional before 2.0.0')).toBeVisible();
    await page.getByRole('tab', { name: 'Java', exact: true }).click();
    await expect(page.getByRole('tabpanel').filter({ hasText: 'HttpClient' })).toBeVisible();
    await expectAxeClean(page);
  });
}

test('V-02 history across versions (VW-09)', async ({ page }) => {
  await ready(page, `${H}#/op/post-v1-payments/history`);
  await expect(page.getByText('Every change to this endpoint across the versions you loaded, newest first.')).toBeVisible();
  await expect(page.getByText('Endpoint added')).toBeVisible();
  await expectAxeClean(page);
});

test('V-03 schema with a removed field and "used in" (VW-03)', async ({ page }) => {
  await ready(page, `${H}#/schema/card`);
  await expect(page.getByRole('heading', { level: 1, name: 'Card' })).toBeVisible();
  await expect(page.locator('del', { hasText: 'last4' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Used in' })).toBeVisible();
  await expectAxeClean(page);
});

test('V-05 search with the keyboard (VW-04)', async ({ page }) => {
  await ready(page, H);
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox').fill('currency');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await expect(dialog.getByText(/results? in endpoints, fields and descriptions/)).toBeVisible();
  await expectAxeClean(page);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/(op|schema)\//);
});

test('V-05 version picker compares with nothing, then back (VW-07)', async ({ page }) => {
  await ready(page, H);
  const compared = page.getByRole('combobox', { name: 'Compared with' });
  await expect(page.getByRole('combobox', { name: 'Version', exact: true })).toHaveValue('2.0.0');
  await expect(compared.locator('option')).toHaveText(['1.5.0', 'Nothing']);
  await compared.selectOption({ label: 'Nothing' });
  await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toHaveCount(0);
  await compared.selectOption('1.5.0');
  await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
  await expectAxeClean(page);
});

test('V-04 what changed: timeline, checklist and HAR filter (VW-10)', async ({ page }) => {
  await ready(page, `${H}#/changes`);
  await expect(page.getByRole('heading', { level: 1, name: 'What changed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /required fix/ })).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Pick my endpoints' }).click();
  const dialog = page.getByRole('dialog', { name: 'Which endpoints does your app use?' });
  const har = { log: { entries: [{ request: { method: 'GET', url: 'https://api.example.com/v1/payments?limit=80' } }, { request: { method: 'GET', url: 'https://cdn.example.com/x.js' } }] } };
  await dialog.locator('input[type=file]').setInputFiles({ name: 'checkout-session.har', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(har)) });
  await expect(dialog.getByText('1 requests matched 1 endpoints. 1 to other hosts ignored.')).toBeVisible();
  await expectAxeClean(page);
  await dialog.getByRole('button', { name: 'Show my changes' }).click();
  await expect(page.getByRole('heading', { name: 'Showing changes for the 1 endpoints you use' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /1\.5\.0 → 2\.0\.0 · affects you/ })).toBeVisible();
});

test('Try it sends to a mocked API and checks the response schema (VW-05)', async ({ page }) => {
  let auth = '';
  await page.route('https://api.example.com/**', async (route) => {
    auth = route.request().headers().authorization ?? '';
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [], has_more: false }) });
  });
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Authentication' });
  await expectAxeClean(page);
  await dialog.getByLabel('Token').fill('sk_test_123');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Bearer token set · kept in this tab only')).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('region', { name: 'Response', exact: true }).getByText('200 OK')).toBeVisible();
  await expect(page.getByText(/Matches the 200 schema in 2\.0\.0|differences? from the 200 schema/)).toBeVisible();
  expect(auth).toBe('Bearer sk_test_123');
  await expectAxeClean(page);
});

test('Try it warns when the request fails on the newer version, one-click fix (VW-11)', async ({ page }) => {
  await page.route('https://api.example.com/**', (route) => route.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*' } }));
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByLabel('limit', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('This request works on 1.5.0 but fails on 2.0.0')).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Set limit to 50' }).click();
  await expect(page.getByLabel('limit', { exact: true })).toHaveValue('50');
});

test('Try it shows CORS guidance when the browser blocks the request (VW-13)', async ({ page }) => {
  await page.route('https://api.example.com/**', (route) => route.abort('failed'));
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { name: 'The browser blocked this request' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy as curl' })).toBeVisible();
  await expectAxeClean(page);
});

test('V-01 a version that failed to load (VW-13)', async ({ page }) => {
  await ready(page, `${H}?spec=load-error`);
  await expect(page.getByRole('heading', { name: 'Couldn’t load openapi-1.5.0.yaml' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expectAxeClean(page);
});

test('Petstore 3.0 renders; Swagger 2.0 shows a clear state', async ({ page }) => {
  await ready(page, `${H}?spec=petstore`);
  await expect(page.getByRole('heading', { level: 1, name: 'Swagger Petstore' })).toBeVisible();
  await expectAxeClean(page);
  await page.goto(`${H}?spec=swagger2`);
  await expect(page.getByRole('heading', { name: 'Swagger 2.0 isn’t supported in the Viewer yet' })).toBeVisible();
  await expectAxeClean(page);
});

test('V-06 embedded look with a brand colour (VW-12)', async ({ page }) => {
  await ready(page, `${H}?brand=1#/op/post-v1-payments`);
  await expect(page.getByText('Acme · Payments API')).toBeVisible();
  await expectAxeClean(page);
});

test.describe('phone 390 @phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const theme of ['light', 'dark'] as const) {
    test(`M-05 overview, read-only, 44 px targets (${theme}) @phone`, async ({ page }) => {
      await ready(page, `${H}?theme=${theme}`);
      await expect(page.getByRole('link', { name: /changes since 1\.5\.0/ })).toBeVisible();
      for (const name of ['Open navigation', 'Search']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      const row = await page.getByRole('link', { name: /Create a payment/ }).first().boundingBox();
      expect(row!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expectAxeClean(page);
    });

    test(`M-04 endpoint without Try it (${theme}) @phone`, async ({ page }) => {
      await ready(page, `${H}?theme=${theme}#/op/post-v1-payments`);
      await expect(page.getByRole('heading', { level: 1, name: 'Create a payment in any supported currency' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try it' })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'curl' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expectAxeClean(page);
    });
  }

  test('navigation drawer @phone', async ({ page }) => {
    await ready(page, H);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('dialog').getByRole('link', { name: /Capture a payment/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Capture a payment' })).toBeVisible();
  });
});
