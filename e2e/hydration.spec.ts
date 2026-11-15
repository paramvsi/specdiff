import { expect, test, type Page } from '@playwright/test';

const APP = 'http://localhost:4173/app/';

// B-53: the HTML carries the Compare screen; React hydrates it without replacing the painted nodes.
async function load(page: Page, url: string) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  // Runs before the deferred module script: keep a handle on the server-rendered heading.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') (window as unknown as { __h1: Element | null }).__h1 = document.querySelector('h1');
    });
  });
  await page.goto(url);
  return errors;
}

test('B-53 /app/ ships the Compare screen as HTML and hydrates it in place', async ({ page, request }) => {
  const html = await (await request.get(APP)).text();
  expect(html).toMatch(/<div id="root">.*<h1[^>]*>Compare two files<\/h1>/s);
  const errors = await load(page, APP);
  const before = page.getByRole('textbox', { name: 'Before' });
  await before.fill('a\nb\n');
  await page.getByRole('textbox', { name: 'After' }).fill('a\nc\n');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('B-53 the painted heading is the hydrated one (no second paint)', async ({ page }) => {
  const errors = await load(page, APP);
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeVisible();
  // Interactive once hydrated: the sample link runs a comparison.
  await page.waitForFunction(() => !!document.querySelector('h1') && document.querySelector('h1') === (window as unknown as { __h1: Element }).__h1);
  expect(errors).toEqual([]);
});

test('B-53 a sample link still opens its result after hydration', async ({ page }) => {
  const errors = await load(page, `${APP}?sample=openapi`);
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  expect(errors).toEqual([]);
});
