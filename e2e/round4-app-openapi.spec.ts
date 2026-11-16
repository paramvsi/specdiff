// Round-4 screen fixes in the web app (docs/audit/screens.md, round 3): A-04 summary, A-05 workspace and review,
// A-06 raw diff, A-10 changelog, A-05 SDK impact and consumer filter, O-04 Explain, O-08, O-09, O-10, O-13,
// A-01 drag over, A-02 parsing, A-11 history, A-12 settings, A-13 saved sources, top bar, M-01..M-03 phone.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build (B-18). SD_BASE points the same tests at another server.
test.use({ baseURL: process.env.SD_BASE ?? 'http://localhost:4173' });

const expectAxeClean = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await axe(page);
};
const desktopOnly = () => test.skip(test.info().project.name !== 'desktop');
const V1 = readFileSync('fixtures/samples/payments-v1.yaml', 'utf8');
const V2 = readFileSync('fixtures/samples/payments-v2.yaml', 'utf8');

async function openSample(page: Page) {
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
}
async function openMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('top bar: logo lines up with the page content (40 px at 1440), no divider before files exist', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  const logo = page.getByRole('link', { name: 'Specdiff home' });
  expect(Math.round((await logo.boundingBox())!.x)).toBe(40);
  await expect(page.locator('header [class*="divider"]')).toHaveCount(0);
});

test('A-04: Where the changes are lists areas in the designed order, Security included', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  const card = page.getByRole('heading', { name: /^Where the 28 changes are$/ }).locator('..');
  const areas = (await card.locator('dt').allTextContents()).map((t) => t.trim());
  expect(areas).toEqual(['Endpoints', 'Parameters', 'Request bodies', 'Responses', 'Shared schemas', 'Security', 'Descriptions and examples']);
  await expectAxeClean(page);
});

test('A-05 review: endpoints that return Card show where Card sits; decisions are half-width; decided rows dim', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: /^To review/ }).click();
  await page.keyboard.press('a');
  await page.getByRole('navigation', { name: 'Changes' }).getByRole('button', { name: /card\.last4 removed/ }).click();
  const usages = page.getByRole('heading', { name: 'Endpoints that return Card' }).locator('..').getByRole('listitem');
  const texts = (await usages.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(texts).toEqual(expect.arrayContaining(['GET /v1/payments/{id} card', 'GET /v1/payments data[].card', 'GET /v1/customers/{id}/cards data[]']));
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  const reject = page.getByRole('button', { name: 'Reject', exact: true });
  const [a, r] = [(await accept.boundingBox())!, (await reject.boundingBox())!];
  expect(Math.abs(a.width - r.width)).toBeLessThan(2);
  expect(a.width).toBeGreaterThan(110);
  // Decided rows are marked (and drawn muted); tree titles stay on one line.
  await expect(page.locator('nav[aria-label="Changes"] button[data-decided="true"]')).toHaveCount(1);
  const title = page.locator('nav[aria-label="Changes"] button[data-decided="true"] span').last();
  expect(await title.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('nowrap');
  await expectAxeClean(page);
});

test('A-06 raw diff: notable changes in file order, marker on the removed line, the diff scrolls in its card', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Raw diff' }).click();
  const list = page.getByRole('heading', { name: 'Changes in this file' }).locator('..').getByRole('listitem');
  // 28 changes, 9 docs-only: the list shows the other 19.
  await expect(list).toHaveCount(19);
  const lines = (await list.locator('span:last-child').allTextContents()).map((t) => Number(t.replace('L', '')));
  expect([...lines].sort((x, y) => x - y)).toEqual(lines);
  // The legend sits in the tab bar.
  await expect(page.getByRole('tablist', { name: 'OpenAPI views' }).locator('..')).toContainText('Possibly');
  await list.filter({ hasText: 'currency is now required' }).getByRole('button').click();
  const removed = page.locator('[data-kind="del"]', { has: page.locator('button[data-sev="breaking"]') }).first();
  await expect(removed).toBeVisible();
  // The page itself doesn't scroll to reach it.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
  await expect(page.getByRole('note')).toBeInViewport();
  await expectAxeClean(page);
});

test('A-10 changelog: items follow headings directly; share card closes; no lock link or decisions card', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Changelog' }).click();
  await expect(page.getByLabel('Changelog text')).toHaveValue(/### Breaking changes\n- /);
  await expect(page.getByText('Lock with a passphrase, include decisions…')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review decisions' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Share this comparison' }).locator('../..').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Share this comparison' })).toHaveCount(0);
  await expectAxeClean(page);
});

test('A-05 SDK impact: endpoint calls take their path parameters; columns line up', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('radio', { name: 'SDK calls' }).click();
  await expect(page.getByText('refunds.cancel(id)', { exact: true })).toBeVisible();
  const xs = await page.locator('section[aria-labelledby="sdk-h"] li > button > code').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
  expect(new Set(xs).size).toBe(1);
  await expectAxeClean(page);
});

test('A-05 consumer filter: banner and table are separate cards; narrow method column; plain titles', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: 'Affects me' }).click();
  await page.getByLabel(/operationIds or METHOD/).fill('createPayment\nGET /v1/payments/{id}');
  await page.getByRole('button', { name: 'Filter' }).click();
  const table = page.getByRole('region', { name: 'Changes that affect you' });
  const banner = page.getByRole('status').filter({ hasText: 'Only changes to the 2 endpoints' });
  expect((await table.boundingBox())!.y - ((await banner.boundingBox())!.y + (await banner.boundingBox())!.height)).toBeGreaterThanOrEqual(12);
  const path = table.locator('tbody tr').first().locator('td').nth(2);
  expect((await path.boundingBox())!.x).toBeLessThan(200);
  await expectAxeClean(page);
});

test('O-04 Explain: method row above the title in the header, error body, fix highlighted, no stray full stops', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('button', { name: 'Open in workspace' }).first().click();
  await page.keyboard.press('e');
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('missing required property: currency')).toBeVisible();
  await expect(drawer.locator('mark', { hasText: 'default: USD' })).toBeVisible();
  await expect(drawer.locator('mark', { hasText: '2.0.0' })).toBeVisible();
  await expect(drawer.getByText('Add a default or keep the field optional.')).toHaveCount(0);
  const chip = drawer.getByText('/v1/payments', { exact: true }).first();
  const title = drawer.getByRole('heading', { name: 'Request field currency is now required' });
  expect((await chip.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  // The docs-only info description: the value's own full stop isn't doubled.
  await page.getByRole('navigation', { name: 'Changes' }).getByRole('button', { name: /Descriptions updated/ }).click();
  await page.locator('nav[aria-label="Changes"] button[title="Description updated"]').first().click();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').innerText()).not.toMatch(/\.\./);
});

test('O-08 too large: the warning tile then the title, no header divider or ×', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).first().click();
  await (await chooser).setFiles({ name: 'orders-export.yaml', mimeType: 'text/yaml', buffer: Buffer.alloc(27 * 1024 * 1024, 'a: 1\n') });
  const dialog = page.getByRole('dialog', { name: 'orders-export.yaml is 27.0 MB' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);
  const tile = dialog.locator('svg.lucide-triangle-alert').first();
  const title = dialog.getByRole('heading', { name: 'orders-export.yaml is 27.0 MB' });
  expect((await tile.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('O-09 share: both options shown from Summary; strength to the right of the meter', async ({ page }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
  await expect(dialog.getByRole('checkbox', { name: 'Open on the current change' })).toBeDisabled();
  await expect(dialog.getByText('Open a change in the Workspace first.')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Include review decisions' })).toBeDisabled();
  await page.getByRole('switch', { name: 'Lock' }).click();
  await dialog.getByLabel('Passphrase').fill('Correct-Horse-Battery-9');
  const level = dialog.locator('[data-score]');
  await expect(level).toHaveText('Strength: Strong');
  const meter = dialog.locator('[class*="meter"]').last();
  const [l, m] = [(await level.boundingBox())!, (await meter.boundingBox())!];
  expect(l.x).toBeGreaterThan(m.x + m.width - 2);
  expect(Math.abs(l.y + l.height / 2 - (m.y + m.height / 2))).toBeLessThan(8);
  await expectAxeClean(page);
});

test('O-10 unlock: a modal over the dimmed app; the top bar behind it is inert', async ({ page, context }) => {
  desktopOnly();
  await openSample(page);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
  await page.getByRole('switch', { name: 'Lock' }).click();
  await dialog.getByLabel('Passphrase').fill('correct horse battery staple');
  const box = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(box).toHaveValue(/#v=1&e=1/);
  const other = await context.newPage();
  await other.goto(await box.inputValue());
  const unlock = other.getByRole('dialog', { name: 'This comparison is locked' });
  await expect(unlock).toBeVisible();
  await expect(other.locator('header').first()).toHaveAttribute('inert', '');
  const b = (await unlock.boundingBox())!;
  expect(Math.abs(b.y + b.height / 2 - 450)).toBeLessThan(60);
  await expectAxeClean(other);
});

test('A-01 drag over: two tall zones under "Compare two versions"; the rest steps aside', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await page.getByRole('textbox', { name: /Before/ }).dispatchEvent('dragover', { dataTransfer: dt });
  await expect(page.getByRole('heading', { name: 'Compare two versions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open file' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Try a sample' })).toBeHidden();
  const zone = page.getByText('Drop to use as Before').locator('..');
  expect((await zone.boundingBox())!.height).toBeGreaterThan(480);
  await expectAxeClean(page);
});

test('A-02 parsing: an OpenAPI comparison lists all five steps before the worker reports', async ({ page }) => {
  desktopOnly();
  await page.route('**/engine.worker*', () => {}); // never answers: the screen stays on its first state
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill(V1);
  await page.getByRole('textbox', { name: 'After' }).fill(V2);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preparing your comparison' })).toBeVisible();
  await expect(page.locator('ol li[data-state]')).toHaveCount(5);
});

test('A-11 history: "sections edited" for Markdown; no lone "Earlier" heading; empty state can stop saving', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  await openMore(page, 'History');
  await expect(page.getByRole('heading', { name: 'No comparisons yet' })).toBeVisible();
  const save = page.getByRole('checkbox', { name: 'Save new comparisons to history' });
  await expect(save).toBeChecked();
  await expectAxeClean(page);
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('tab').first().or(page.getByRole('heading').first())).toBeVisible();
  await page.waitForTimeout(500);
  await openMore(page, 'History');
  await expect(page.getByText(/^\d+ sections? edited$/)).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Earlier' })).toHaveCount(0);
});

test('A-11 history: unticking "Save new comparisons" stops new rows', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  await openMore(page, 'History');
  await page.getByRole('checkbox', { name: 'Save new comparisons to history' }).click();
  await expect(page.getByRole('checkbox', { name: 'Save new comparisons to history' })).not.toBeChecked();
  await page.waitForTimeout(300); // settings are saved to IndexedDB
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await page.waitForTimeout(500);
  await openMore(page, 'History');
  await expect(page.getByRole('heading', { name: 'No comparisons yet' })).toBeVisible();
});

test('A-12 settings: all 92 rules listed, the 4 without a severity say why', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  await openMore(page, 'Rules and settings');
  await expect(page.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search 92 rules')).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(92);
  await expect(page.locator('table tbody tr[data-fixed]')).toHaveCount(4);
  await expect(page.getByRole('rowheader', { name: 'version-bump-missing' })).toBeVisible();
  await expectAxeClean(page);
});

test('A-13 saved sources: a changed OpenAPI source says how many changes break', async ({ page }) => {
  desktopOnly();
  let body = V1;
  await page.route('https://specs.example.test/**', (r) =>
    r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/yaml' }, body }),
  );
  await page.goto('/app/');
  await openMore(page, 'Saved sources');
  await page.getByRole('button', { name: 'Add source' }).first().click();
  const d = page.getByRole('dialog');
  await d.getByLabel('URL').fill('https://specs.example.test/openapi.yaml');
  await d.getByLabel('Name (optional)').fill('Payments API');
  await d.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByText('Saved. Changes show from your next visit.')).toBeVisible();
  body = V2;
  await openMore(page, 'New comparison');
  await openMore(page, 'Saved sources');
  await expect(page.getByText('Changed · 4 breaking')).toBeVisible({ timeout: 20_000 });
  await expectAxeClean(page);
});

test('O-13 toasts: a file that cannot be read is named in the toast', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).first().click();
  // A damaged ZIP can't be read.
  await (await chooser).setFiles({ name: 'payments-v2.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all') });
  await expect(page.getByText('Couldn’t read payments-v2.zip')).toBeVisible();
});

test('@phone M-01 summary: title on the ground with its format, four severity tiles, neutral notice', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('View-only on phones.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'payments-v1.yaml → payments-v2.yaml' })).toBeVisible();
  await expect(page.locator('main').getByText('OpenAPI 3.1', { exact: true })).toBeVisible();
  await expect(page.locator('dl > div')).toHaveCount(4);
  const size = await page.getByRole('heading', { level: 1 }).evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
  expect(size).toBeGreaterThanOrEqual(22);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAxeClean(page);
});

test('@phone M-03 change: one bar (no app bar above it), title outside the diff card', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=openapi');
  await page.getByRole('button', { name: 'See all 28 changes' }).click();
  await page.getByRole('button', { name: /currency is now required/ }).first().click();
  await expect(page.getByRole('heading', { name: /of 28/ })).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  const region = page.getByRole('region', { name: 'Source around the change' });
  const title = page.getByRole('heading', { level: 2, name: /currency is now required/ });
  expect((await title.boundingBox())!.y).toBeLessThan((await region.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAxeClean(page);
});
