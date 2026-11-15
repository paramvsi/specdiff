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
    await expect(since.locator('p').first()).toContainText(/Breaking\s*4(?!\d)/);
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
  // V05-Search: opens straight into the input (no title row or close button), footer names the version.
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeHidden();
  expect((await dialog.getByRole('combobox').boundingBox())!.y).toBeLessThan(120);
  await expect(dialog.getByText('Searches v2.0.0')).toBeVisible();
  const chips = await dialog.getByRole('option').evaluateAll((els) => els.map((e) => Math.round(e.firstElementChild!.getBoundingClientRect().width)));
  expect(new Set(chips).size).toBe(1);
  await expectAxeClean(page);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/(op|schema)\//);
});

test('V-05 version picker compares with nothing, then back (VW-07)', async ({ page }) => {
  await ready(page, H);
  const compared = page.getByRole('combobox', { name: 'Compared with' });
  await expect(page.getByRole('combobox', { name: 'Version', exact: true })).toHaveValue('2.0.0');
  await expect(compared.locator('option')).toHaveText(['v1.5.0', 'Nothing']);
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
  await expect(dialog.getByText('1 request matched 1 endpoint. 1 to other hosts ignored.')).toBeVisible();
  await expect(dialog.getByText('1 call', { exact: true })).toBeVisible();
  await expectAxeClean(page);
  await dialog.getByRole('button', { name: 'Show my changes' }).click();
  await expect(page.getByRole('heading', { name: 'Showing changes for the endpoint you use' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /1\.5\.0 → 2\.0\.0 · affects you/ })).toBeVisible();
  // Checklist lines wrap inside the panel instead of being clipped at its edge.
  const pre = page.getByRole('region', { name: 'Checklist' }).locator('pre');
  const [sw, cw] = await pre.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});

test('V-04 "Pick my endpoints" narrows the list to the picked endpoints, breaking first', async ({ page }) => {
  await ready(page, `${H}#/changes`);
  const rows = page.locator('ul[class*="changeRows"] > li');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  await page.getByRole('button', { name: 'Pick my endpoints' }).click();
  const dialog = page.getByRole('dialog', { name: 'Which endpoints does your app use?' });
  const u = (method: string, path: string) => ({ request: { method, url: `https://api.example.com${path}` } });
  const har = { log: { entries: [u('POST', '/v1/payments'), u('GET', '/v1/payments/pay_1')] } };
  await dialog.locator('input[type=file]').setInputFiles({ name: 'checkout.har', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(har)) });
  await dialog.getByRole('button', { name: 'Show my changes' }).click();
  await expect(page.getByRole('heading', { name: 'Showing changes for the 2 endpoints you use' })).toBeVisible();
  const shown = await rows.count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);
  await expect(page.getByText(`${total - shown} of ${total} changes hidden`)).toBeVisible();
  // Every row names a picked endpoint (directly or through a shared schema used by it).
  for (const t of await rows.locator('p[class*="changeOp"]').allTextContents()) expect(t).toMatch(/^(POST\/v1\/payments|GET\/v1\/payments\/\{id\})$/);
  // Ordered Breaking → Possibly → Safe → Docs only.
  const order = ['Breaking', 'Possibly breaking', 'Safe', 'Docs only'];
  const sevs = (await rows.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent ?? ''))).map((t) => order.findIndex((o) => t.includes(o)));
  expect(sevs).toEqual([...sevs].sort((x, y) => x - y));
  await expectAxeClean(page);
});

test('V-04 with the design\'s 5 endpoints: fixes = Breaking rows, a short filtered checklist, short titles, dimmed nav', async ({ page }) => {
  await ready(page, `${H}#/changes`);
  await page.getByRole('button', { name: 'Pick my endpoints' }).click();
  const dialog = page.getByRole('dialog', { name: 'Which endpoints does your app use?' });
  const u = (method: string, path: string) => ({ request: { method, url: `https://api.example.com${path}` } });
  const har = { log: { entries: [u('POST', '/v1/payments'), u('GET', '/v1/payments'), u('GET', '/v1/payments/pay_1'), u('POST', '/v1/refunds'), u('GET', '/v1/refunds/re_1')] } };
  await dialog.locator('input[type=file]').setInputFiles({ name: 'checkout-session.har', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(har)) });
  await dialog.getByRole('button', { name: 'Show my changes' }).click();
  await expect(page.getByRole('heading', { name: 'Showing changes for the 5 endpoints you use' })).toBeVisible();
  const rows = page.locator('ul[class*="changeRows"] > li');
  const badges = await rows.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.replace(/^[!?+¶]\s*/, '').trim() ?? ''));
  const breaking = badges.filter((b) => b === 'Breaking').length;
  const possibly = badges.filter((b) => b === 'Possibly breaking').length;
  expect(breaking).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: `${breaking} required ${breaking === 1 ? 'fix' : 'fixes'}` })).toBeVisible();
  // Checklist: one short line per required fix and per thing to check, for the picked endpoints only.
  const lines = (await page.getByRole('region', { name: 'Checklist' }).locator('pre').innerText()).trim().split('\n');
  expect(lines).toHaveLength(breaking + possibly);
  expect(lines).toContain('- [ ] Send currency on POST /v1/payments');
  expect(lines).toContain('- [ ] Stop reading card.last4');
  for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(56);
  expect(lines.join('\n')).not.toMatch(/DELETE|payouts|customers/);
  // Short titles, as in the design ("currency is now required", "card.last4 removed").
  const titles = await rows.locator('p[class*="changeTitle"]').allTextContents();
  expect(titles).toContain('currency is now required');
  expect(titles).toContain('card.last4 removed');
  for (const t of titles) expect(t.length, t).toBeLessThanOrEqual(40);
  // Endpoints the app does not use are dimmed in the nav, without their change badge.
  const nav = page.getByRole('navigation', { name: 'API reference' });
  const unused = nav.getByRole('link', { name: /Send a payout/ });
  const used = nav.getByRole('link', { name: /Create a payment/ });
  await expect(unused).toHaveAttribute('class', /navDim/);
  await expect(unused).toContainText('not used');
  await expect(unused.locator('[class*="navBadge"]')).toHaveCount(0);
  await expect(used).not.toHaveAttribute('class', /navDim/);
  await expect(used.locator('[class*="navBadge"]')).toHaveCount(1);
  const [dimMethod, usedMethod] = await Promise.all([unused, used].map((l) => l.locator('span').first().evaluate((e) => getComputedStyle(e).color)));
  expect(dimMethod).not.toBe(usedMethod);
  await expectAxeClean(page);
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
  // V01-Overview-Error: skeleton cards instead of the full overview; 1.5.0 stays selected; "What changed" stays.
  await expect(page.locator('[class*="skeletonStack"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'payments' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Compared with' })).toHaveValue('1.5.0');
  await expect(page.getByRole('navigation', { name: 'API reference' }).getByRole('link', { name: 'What changed' })).toBeVisible();
  await expectAxeClean(page);
});

test('Petstore 3.0 and an upgraded Swagger 2.0 render; a raw Swagger 2.0 shows a clear state', async ({ page }) => {
  await ready(page, `${H}?spec=petstore`);
  await expect(page.getByRole('heading', { level: 1, name: 'Swagger Petstore' })).toBeVisible();
  await expectAxeClean(page);
  await ready(page, `${H}?spec=swagger2`);
  await expect(page.getByRole('heading', { level: 1, name: /Swagger Petstore/ })).toBeVisible();
  await expectAxeClean(page);
  await page.goto(`${H}?spec=swagger2-raw`);
  await expect(page.getByRole('heading', { name: 'Swagger 2.0 isn’t supported in the Viewer yet' })).toBeVisible();
  await expectAxeClean(page);
});

test('V-02 deprecated banner says "Deprecated." once, and the ground fills the viewport', async ({ page }) => {
  await ready(page, `${H}?theme=dark#/op/get-v1-refunds-id`);
  const note = page.getByRole('note');
  await expect(note).toContainText('Deprecated.');
  expect(((await note.textContent()) ?? '').match(/Deprecated\./g)).toHaveLength(1);
  // A short page in a tall window: the Viewer's ground still reaches the bottom.
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto(`${H}?theme=dark#/auth`);
  await expect(page.getByRole('heading', { level: 1, name: 'Authentication' })).toBeVisible();
  const [rootH, vh] = await page.evaluate(() => [document.querySelector('#root > *')!.getBoundingClientRect().height, innerHeight]);
  expect(rootH).toBeGreaterThanOrEqual(vh);
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
      // B-2: the same 4 breaking as the app and CLI on payments v1.5.0 → v2.0.0.
      await expect(page.getByRole('link', { name: /changes since 1\.5\.0/ })).toContainText('4 breaking');
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
