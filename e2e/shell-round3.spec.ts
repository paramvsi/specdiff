// Round 3 (shell, OpenAPI Workspace, UI states): B-30, X-02, X-04, AComponents, utility top bars,
// dialog footer bands, 390 px overflow and touch targets, share links in the same tab, X-09 axe states.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build: the dev server can reload mid-test while it optimises dependencies.
test.use({ baseURL: 'http://localhost:4173' });

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const expectAxeClean = async (page: Page) => {
  await settle(page);
  await axe(page);
};
const desktopOnly = () => test.skip(test.info().project.name !== 'desktop');
const phoneOnly = () => test.skip(test.info().project.name !== 'phone');

/** An OpenAPI 3.1 document with `n` GET endpoints. */
const bigSpec = (n: number, version = '1.0.0') =>
  `openapi: 3.1.0\ninfo:\n  title: Big\n  version: ${version}\npaths:\n` +
  Array.from(
    { length: n },
    (_, i) => `  /r${i}:\n    get:\n      operationId: op${i}\n      responses:\n        '200':\n          description: ok\n`,
  ).join('');
const EMPTY_SPEC = 'openapi: 3.1.0\ninfo:\n  title: Big\n  version: 2.0.0\npaths: {}\n';

/** Paste text in one go (fill() types large specs too slowly). */
async function paste(page: Page, name: 'Before' | 'After', value: string) {
  await page.getByRole('textbox', { name }).evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function pasteAndCompare(page: Page, before: string, after: string) {
  await page.goto('/app/');
  await paste(page, 'Before', before);
  await paste(page, 'After', after);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

const openMore = async (page: Page, item: string) => {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

// ---- B-30 Workspace: AWorkspace by default, A05-Review on "To review" ----

test('B-30 Workspace opens as AWorkspace: stat strip, "All" filter, focused hunk; "To review" switches to A05-Review', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Workspace' });
  // Stat strip above the panes.
  for (const name of ['Breaking: 4', 'Possibly breaking: 1', 'Safe: 14', 'Docs only: 9'])
    await expect(panel.getByRole('region', { name })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Suggested version' })).toContainText('2.0.0');
  const strip = (await panel.getByRole('region', { name: 'Breaking: 4' }).boundingBox())!;
  const tree = (await page.getByRole('navigation', { name: 'Changes' }).boundingBox())!;
  expect(strip.y + strip.height).toBeLessThanOrEqual(tree.y);
  // Filter "All" is the default.
  await expect(page.getByRole('button', { name: 'All 28' })).toHaveAttribute('aria-pressed', 'true');
  // AWorkspace has no review card or decision panel.
  await expect(page.getByText(/of 5 decided/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your decision' })).toHaveCount(0);
  // The detail shows the hunk around the change, not the whole operation (AWorkspace: 11–12 lines).
  await page.getByRole('navigation', { name: 'Changes' }).getByRole('button', { name: /currency is now required/ }).click();
  const before = page.getByRole('region', { name: /^Before:/ });
  await expect(before.locator('[data-kind="del"]').first()).toBeVisible();
  expect(await before.locator('[data-kind]').count()).toBeLessThanOrEqual(13);
  await expectAxeClean(page);

  // "To review" → A05-Review: review progress, decision panel.
  await page.getByRole('button', { name: /^To review/ }).click();
  await expect(page.getByText('0 of 5 decided')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Breaking: 4' })).toHaveCount(0);
  await expectAxeClean(page);
});

// ---- X-02 the OpenAPI change tree is virtual ----

test('X-02 2,000 endpoint changes render a windowed tree, not 2,000 items', async ({ page }) => {
  desktopOnly();
  test.setTimeout(120_000);
  await pasteAndCompare(page, bigSpec(2000), EMPTY_SPEC);
  await page.getByRole('tab', { name: 'Workspace' }).click({ timeout: 60_000 });
  const tree = page.getByRole('navigation', { name: 'Changes' });
  await expect(tree.getByRole('button', { name: /Endpoint removed/ }).first()).toBeVisible();
  const items = await tree.locator('li').count();
  expect(items, 'rendered tree rows').toBeLessThan(200);
  // Scrolling the tree renders the rows further down and drops the first ones.
  const first = (await tree.locator('li').first().innerText()).trim();
  await tree.getByRole('region', { name: 'Change list' }).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(tree.getByText(first, { exact: true })).toHaveCount(0);
  expect(await tree.locator('li').count()).toBeLessThan(200);
});

// ---- X-04 command palette ----

test('X-04 palette: closes after a selection; Paths and Actions with kind labels; "ignore" finds actions', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const input = dialog.getByRole('combobox');

  await page.keyboard.press('Meta+k');
  await input.fill('curr');
  // Changes carry the kind label "change", not a rule id.
  const firstChange = dialog.getByRole('group', { name: 'Changes' }).getByRole('option').first();
  await expect(firstChange).toContainText('change');
  await expect(dialog.getByText('request-property-became-required')).toHaveCount(0);

  await input.fill('schemas.Card');
  const paths = dialog.getByRole('group', { name: 'Paths' }).getByRole('option');
  await expect(paths.first()).toContainText('$.components.schemas.Card');
  await expect(paths.first()).toContainText('path');

  await input.fill('ignore');
  const actions = dialog.getByRole('group', { name: /Actions|Settings/ }).getByRole('option');
  await expect(actions.first()).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Toggle ignore whitespace/ })).toContainText('action');

  // Selecting an item closes the palette.
  await input.fill('history');
  await dialog.getByRole('option', { name: /^History/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: /^(History|No comparisons yet)$/ })).toBeVisible();

  await page.keyboard.press('Meta+k');
  await input.fill('endpoint removed');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: /Endpoint removed/ })).toBeVisible();
});

// ---- AComponents states ----

test('AComponents parse-error card has no orphan line rows; identical copy has no "0 … ignored" (X-09 axe)', async ({ page }) => {
  desktopOnly();
  await pasteAndCompare(page, 'a: 1\nb: 2\n', 'a: 1\nb: [1, 2\n');
  const alert = page.getByText(/Couldn't parse After: line/);
  await expect(alert).toBeVisible();
  const rows = await page.locator('[data-parse-line]').evaluateAll((els) =>
    els.map((e) => ({ n: e.getAttribute('data-parse-line'), text: (e.lastElementChild?.textContent ?? '').trim() })),
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.filter((r) => !r.text), 'rows with a number and no text').toEqual([]);
  await expectAxeClean(page);

  await pasteAndCompare(page, '{"a": 1}\n', '{"a": 1}\n');
  await expect(page.getByText('No differences')).toBeVisible();
  await expect(page.getByText(/0 formatting-only/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show formatting changes' })).toHaveCount(0);
});

// ---- Utility screens' own top bars ----

test('History, Settings, Saved sources and Parsing use their own top bars', async ({ page }) => {
  desktopOnly();
  test.setTimeout(90_000);
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  const bar = page.getByRole('banner');

  await openMore(page, 'History');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'New comparison' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  for (const name of ['Share', 'Export', 'Copy for LLM']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(bar.getByText('payments-v1.yaml')).toHaveCount(0);
  await expectAxeClean(page);

  await openMore(page, 'Rules and settings');
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Back to comparison' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Back to comparison' })).toHaveCount(0);
  for (const name of ['Share', 'Export', 'Search']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expectAxeClean(page);
  await bar.getByRole('button', { name: 'Back to comparison' }).click();
  await expect(page.getByRole('tablist', { name: 'OpenAPI views' })).toBeVisible();

  await openMore(page, 'Saved sources');
  await expect(page.getByRole('heading', { name: 'Saved sources' }).first()).toBeVisible();
  await bar.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a saved source' })).toBeVisible();
  await page.keyboard.press('Escape');
  for (const name of ['Share', 'Export']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);

  // A-02 Parsing: file chips and a single Cancel.
  await pasteAndCompare(page, bigSpec(6000), bigSpec(6000, '1.1.0').replace('/r5999:', '/r6000:'));
  await expect(page.getByRole('heading', { name: 'Preparing your comparison' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Cancel' })).toBeVisible();
  for (const name of ['Share', 'Export', 'More']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await bar.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
});

test('A03-Patch uses a top bar with Back only', async ({ page }) => {
  desktopOnly();
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Paste a patch' }).click();
  await expect(page.getByRole('heading', { name: 'Open a patch' })).toBeVisible();
  const bar = page.getByRole('banner');
  for (const name of ['Share', 'Export', 'Search']) await expect(bar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await bar.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
});

// ---- Dialog footer band (O-03, O-09) ----

async function footerBand(page: Page, dialogName: string, button: string) {
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  const r = await dialog.getByRole('button', { name: button, exact: true }).last().evaluate((btn) => {
    const dlg = btn.closest('[role="dialog"]')!;
    let band: Element | null = btn.parentElement;
    const bg = (e: Element) => getComputedStyle(e).backgroundColor;
    while (band && band !== dlg && bg(band) === 'rgba(0, 0, 0, 0)') band = band.parentElement;
    const d = dlg.getBoundingClientRect();
    const b = band!.getBoundingClientRect();
    return {
      differs: band !== dlg && bg(band!) !== bg(dlg),
      fullWidth: Math.abs(b.width - d.width) <= 2,
      atBottom: Math.abs(b.bottom - d.bottom) <= 2,
      borderTop: getComputedStyle(band!).borderTopWidth,
    };
  });
  expect(r).toEqual({ differs: true, fullWidth: true, atBottom: true, borderTop: '1px' });
}

test('O-03 Shortcuts and O-09 Share have the grey footer band; axe clean with the Shortcuts sheet open (X-09)', async ({ page }) => {
  desktopOnly();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  await page.keyboard.press('?');
  await footerBand(page, 'Keyboard shortcuts', 'Close');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await footerBand(page, 'Share this comparison', 'Done');
  await expectAxeClean(page);
});

// ---- 390 px ----

test('@phone History and Settings fit 390 px; Compare targets are ≥ 44 px', async ({ page }) => {
  phoneOnly();
  await page.goto('/app/?sample=json');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  for (const [item, heading] of [['History', 'History'], ['Rules and settings', 'Rules']] as const) {
    await openMore(page, item);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await settle(page);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, `${item} scrollWidth`).toBeLessThanOrEqual(390);
  }
  await openMore(page, 'New comparison');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main button, main a[href], main [role="radio"], main input, main select, main summary, main [role="checkbox"], main [role="switch"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.height < 44 || r.width < 24);
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`),
  );
  expect(small, 'Compare targets under 44 px').toEqual([]);
});

// ---- Share link in the same tab ----

async function shareLink(page: Page, sample: string) {
  await page.goto(`/app/?sample=${sample}`);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Share link' });
  await expect(field).toHaveValue(/#v=/);
  const link = await field.inputValue();
  await page.keyboard.press('Escape');
  return link;
}

test('a second share link opened in the same tab replaces the first comparison', async ({ page }) => {
  desktopOnly();
  const json = await shareLink(page, 'json');
  const openapi = await shareLink(page, 'openapi');
  await page.goto('/app/');
  await page.goto(openapi);
  await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
  // Only the hash changes: no reload, so the app must follow hashchange.
  await page.evaluate((h) => (location.hash = h), new URL(json).hash);
  await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'OpenAPI views' })).toHaveCount(0);
});

// ---- start-up: Export / Copy for LLM menus load only with a result ----

test('the empty Compare screen does not load the Export menu chunk', async ({ page }) => {
  desktopOnly();
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  expect(scripts.filter((s) => /ExportMenu|CopyLlm/.test(s))).toEqual([]);
});

test('after a palette pick, focus is not left on the page body (JSON and OpenAPI)', async ({ page }) => {
  for (const sample of ['json', 'openapi']) {
    await page.goto(`/app/?sample=${sample}`);
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await dialog.getByRole('group', { name: 'Changes' }).getByRole('option').first().click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  }
});
