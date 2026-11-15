// Round-4 design fixes for the Viewer (docs/audit/screens.md "Round 3 · Viewer and phone"),
// against the harness in packages/viewer/harness (port 5174).
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

const H = 'http://localhost:5174/';
const ready = async (page: Page, url: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};
const har = (entries: Array<[string, string]>) =>
  Buffer.from(JSON.stringify({ log: { entries: entries.map(([method, path]) => ({ request: { method, url: `https://api.example.com${path}` } })) } }));

test('V-01 summary is one prose sentence; tags are titled and listed once; descriptions line up', async ({ page }) => {
  await ready(page, H);
  const since = page.getByRole('region', { name: 'Since 1.5.0' });
  await expect(since).toContainText(
    'Currency is now required on POST /v1/payments, limit on GET /v1/payments now allows at most 50, DELETE /v1/refunds/{id} was removed, and card.last4 is gone. Payouts are new.',
  );
  await expect(since).not.toContainText(' · ');
  const main = page.locator('main');
  const groups = await main.locator('section h2[id^="sd-tag-"]').allTextContents();
  expect(groups).toEqual(['Payments', 'Refunds', 'Customers', 'Payouts']);
  // GET /v1/customers/{id}/cards is tagged [customers, cards]: one row, under Customers.
  await expect(main.getByRole('link', { name: /GET \/v1\/customers\/\{id\}\/cards/ })).toHaveCount(1);
  // The description column starts at the same x on rows with and without a badge.
  const xs = await main.locator('[class*="opSummary"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  expect(new Set(xs).size).toBe(1);
  // Nav labels wrap instead of ending in "…".
  const nav = page.getByRole('navigation', { name: 'API reference' });
  const label = nav.getByRole('link', { name: /List payments, newest first/ }).locator('[class*="navLabel"]');
  const [sw, cw, overflow] = await label.evaluate((e) => [e.scrollWidth, e.clientWidth, getComputedStyle(e).textOverflow]);
  expect(sw).toBeLessThanOrEqual(cw);
  expect(overflow).not.toBe('ellipsis');
  await expectAxeClean(page);
});

test('V-02 underline tabs, deduplicated changelog line, curl fits its panel', async ({ page }) => {
  await ready(page, `${H}#/op/post-v1-payments`);
  const tab = page.getByRole('tab', { name: 'Docs' });
  const [bg, border] = await tab.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderBottomWidth]);
  expect(bg).toBe('rgba(0, 0, 0, 0)');
  expect(border).toBe('2px');
  const changed = page.getByRole('region', { name: 'Changed since 1.5.0' });
  await expect(changed).toContainText('status in responses can now be disputed');
  await expect(changed).not.toContainText('PaymentStatus in PaymentStatus');
  const pre = page.getByRole('region', { name: 'Code samples' }).locator('pre');
  await expect(pre).toContainText("-d '{");
  const [sw, cw] = await pre.evaluate((e) => [e.scrollWidth, e.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
  await expectAxeClean(page);
});

test('V-02 history lists each version Breaking → Possibly → Safe → Docs only, with short titles', async ({ page }) => {
  await ready(page, `${H}#/op/post-v1-payments/history`);
  const first = page.locator('[class*="timelineItem"]').first().locator('li');
  const sevs = await first.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.replace(/^[!?+¶]\s*/, '').trim() ?? ''));
  const order = ['Breaking', 'Possibly breaking', 'Safe', 'Docs only'];
  const idx = sevs.map((s) => order.indexOf(s));
  expect(idx).not.toContain(-1);
  expect(idx).toEqual([...idx].sort((a, b) => a - b));
  await expect(first.first()).toContainText('currency is now required');
});

test('V-04 with the design\'s 5 endpoints: safe and docs-only changes fold into one row each', async ({ page }) => {
  await ready(page, `${H}#/changes`);
  await page.getByRole('button', { name: 'Pick my endpoints' }).click();
  const dialog = page.getByRole('dialog', { name: 'Which endpoints does your app use?' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'checkout-session.har',
    mimeType: 'application/json',
    buffer: har([['POST', '/v1/payments'], ['GET', '/v1/payments'], ['GET', '/v1/payments/pay_1'], ['POST', '/v1/refunds'], ['GET', '/v1/refunds/re_1']]),
  });
  await dialog.getByRole('button', { name: 'Show my changes' }).click();
  const list = page.getByRole('region', { name: /affects you/ });
  const top = list.locator(':scope > ul > li');
  // 3 Breaking + 1 Possibly listed one by one, then one Safe row and one Docs-only row (was 22 rows).
  await expect(top).toHaveCount(6);
  const safe = top.filter({ hasText: /\d+ safe changes/ });
  await expect(safe.locator('summary')).toContainText('Nothing to avoid.');
  await expect(top.filter({ hasText: /\d+ docs-only changes/ }).locator('summary')).toContainText('No action needed.');
  // Folded rows open with the keyboard and show every change.
  const inner = safe.locator('li[class*="changeRow"]');
  await expect(inner.first()).toBeHidden();
  await safe.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(inner.first()).toBeVisible();
  await expectAxeClean(page);
});

test('V-02 Auth dialog is anchored near the top; "Remember in this browser" is bold', async ({ page }) => {
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Authentication' });
  await expect(dialog).toBeVisible();
  expect(Math.round((await dialog.boundingBox())!.y)).toBe(120);
  const weight = await dialog.getByText('Remember in this browser').evaluate((e) => Number(getComputedStyle(e).fontWeight));
  expect(weight).toBeGreaterThanOrEqual(600);
  await expectAxeClean(page);
});

test('VW-11 the fails-on-newer warning carries its "Beta" label', async ({ page }) => {
  await page.route('https://api.example.com/**', (route) => route.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*' } }));
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByLabel('limit', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Send request' }).click();
  const title = page.getByText('This request works on 1.5.0 but fails on 2.0.0');
  await expect(title).toBeVisible();
  await expect(title.locator('xpath=..').getByText('Beta', { exact: true })).toBeVisible();
});

test.describe('phone 390 @phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('M-04 one-line callout and a curl sample that fits @phone', async ({ page }) => {
    await ready(page, `${H}#/op/post-v1-payments`);
    const callout = page.getByRole('region', { name: 'Changed since 1.5.0' });
    await expect(callout.locator('li')).toHaveText([/Breaking\s*currency is now required since 2\.0\.0\./, /Possibly breaking\s*status can be disputed since 2\.0\.0\./]);
    const pre = page.getByRole('region', { name: 'Code samples' }).locator('pre');
    await expect(pre).toContainText('curl https://api.example.com/v1/payments \\');
    const [sw, cw] = await pre.evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    await expectAxeClean(page);
  });

  test('M-05 paths wrap at a slash, not mid-word @phone', async ({ page }) => {
    await ready(page, H);
    const path = page.getByRole('link', { name: /List a customer's saved cards/ }).locator('[class*="opPathSmall"]');
    const lines = await path.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return [...new Set([...r.getClientRects()].map((x) => Math.round(x.top)))].length;
    });
    const text = await path.innerText();
    // Either one line, or the break falls right after a "/" ("…/{id}/" + "cards").
    if (lines > 1) expect(text.split('\n').slice(0, -1).every((l) => l.endsWith('/'))).toBe(true);
    expect(text.replace(/\n/g, '')).toBe('/v1/customers/{id}/cards');
  });
});
