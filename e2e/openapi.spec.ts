import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

// Run against the production build: the dev server can reload mid-test while it optimises dependencies.
test.use({ baseURL: 'http://localhost:4173' });

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
  // B-30: the Workspace opens on All (AWorkspace); "To review" is the review view (A05-Review).
  await page.getByRole('button', { name: /^To review/ }).press('Enter');
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

test('@phone M-02 change list: shared-schema changes grouped first, docs-only collapsed, one bar with search', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=openapi');
  await page.getByRole('button', { name: 'See all 28 changes' }).click();
  await expect(page.getByRole('heading', { name: '28 changes' })).toBeVisible();
  // One bar: back + "28 changes" + search. The app's logo/icon bar is not shown above it.
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search changes' })).toBeVisible();
  const groups = page.locator('main section[aria-label]');
  await expect(groups.first()).toHaveAttribute('aria-label', 'components.schemas.Card');
  // card.last4 is one row naming its 3 endpoints.
  await expect(page.getByRole('button', { name: /card\.last4 removed · 3 endpoints/ })).toHaveCount(1);
  // The 9 docs-only changes collapse into one row.
  await expect(page.getByRole('button', { name: /9 operations · Descriptions updated/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /description of/i })).toHaveCount(0);
  await expect(groups.last()).toHaveAttribute('aria-label', '9 operations');
  // 4 breaking + 1 possibly + 14 safe rows, plus the docs row.
  await expect(page.locator('main section[aria-label] li')).toHaveCount(20);
  await expectAxeClean(page);
  // The docs row opens the docs-only list.
  await page.getByRole('button', { name: /9 operations · Descriptions updated/ }).click();
  await expect(page.getByRole('button', { name: 'Docs 9' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('main section[aria-label] li')).toHaveCount(9);
});

test('OUT-10 the Atom export asks for the feed URL and title in a dialog', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('28 changes').first()).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).first().click();
  await page.getByRole('menuitem', { name: 'Changelog feed (.xml)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Changelog feed' });
  await expect(dialog).toBeVisible();
  await expectAxeClean(page);
  await dialog.getByLabel('Feed URL').fill('not a url');
  await dialog.getByRole('button', { name: 'Download changelog.xml' }).click();
  await expect(dialog.getByText('Enter an http or https URL.')).toBeVisible();
  await dialog.getByLabel('Feed URL').fill('https://docs.acme.dev/changelog.xml');
  await dialog.getByLabel('Feed title').fill('Payments API');
  const dl = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download changelog.xml' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('changelog.xml');
  const xml = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
  expect(xml).toContain('<link rel="self" href="https://docs.acme.dev/changelog.xml"/>');
  expect(xml).toContain('<title>Payments API</title>');
  expect(xml).not.toContain('example.com');
});

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

// ---- Design fixes (A-04, A-05, O-04, OA-21, OA-22, OUT-05) ----

test('A-04 titles match the design copy for the 5 breaking and possibly-breaking changes', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  const breaking = page.getByRole('region', { name: 'Breaking changes' }).or(page.locator('section[aria-labelledby="breaking-h"]'));
  for (const t of ['Endpoint removed without deprecation', 'Request field currency is now required', 'Query limit maximum lowered from 100 to 50', 'Response field card.last4 removed']) {
    await expect(breaking.getByRole('heading', { level: 3, name: t, exact: true })).toBeVisible();
  }
  await expect(page.locator('section[aria-labelledby="possibly-h"]').getByText('Response enum status gained disputed', { exact: true })).toBeVisible();
  // Inline code is rendered as <code>, never as literal backticks.
  await expect(page.locator('main')).not.toContainText('`');
});

test('OA-21 decisions.json downloads and imports back', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: /^To review/ }).click(); // B-30
  await expect(page.getByText('0 of 5 decided')).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByText('1 of 5 decided')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download decisions.json' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('decisions.json');
  const path = await file.path();
  const body = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8')) as { version: number; decisions: Record<string, { decision: string }> };
  expect(body.version).toBe(1);
  expect(Object.values(body.decisions).map((d) => d.decision)).toEqual(['accepted']);

  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: /^To review/ }).click(); // B-30
  await expect(page.getByText('0 of 5 decided')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import decisions.json' }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByText('1 of 5 decided')).toBeVisible();
});

test('OUT-05 a shared link opens on the change it was shared from', async ({ page, context }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('navigation', { name: 'Changes' }).getByRole('button', { name: /last4/ }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: /last4/ })).toBeVisible();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Share link' });
  await expect(field).toHaveValue(/#v=/);
  const link = await field.inputValue();
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByRole('tab', { name: 'Workspace', selected: true })).toBeVisible();
  await expect(other.getByRole('heading', { level: 2, name: /last4/ })).toBeVisible();
});

test('OA-22 changes that affect me lists only the endpoints asked for', async ({ page }) => {
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: 'Affects me' }).click();
  await page.getByLabel(/operationIds or METHOD/).fill('GET /v1/payments/{id}');
  await page.getByRole('button', { name: 'Filter' }).click();
  const rows = page.getByRole('region', { name: 'Changes that affect you' }).locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const paths = await rows.locator('td:nth-child(3)').allInnerTexts();
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) expect(p.trim()).toBe('/v1/payments/{id}');
  await expect(rows.filter({ hasText: 'card.last4' })).toHaveCount(1);
});

test('O-04 Explain drawer is 480 px wide with the fix options', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/?sample=openapi');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: /Request field currency is now required/ }).first().click();
  await page.keyboard.press('e');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBeGreaterThanOrEqual(470);
  await expect(drawer.getByRole('heading', { name: 'Request field currency is now required' })).toHaveCount(1);
  await expect(drawer.getByText('# Option 1')).toBeVisible();
  await expect(drawer.getByText('# Option 2')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe is clean on every OpenAPI view (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/app/?sample=openapi');
    await expect(page.getByRole('tab', { name: 'Summary', selected: true })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: /^To review/ }).click(); // B-30: Inline is in the review view
    await expectAxeClean(page);
    await page.getByRole('radio', { name: 'Inline' }).click();
    await expectAxeClean(page);
    await page.keyboard.press('e');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press('Escape');
    await page.getByRole('radio', { name: 'SDK calls' }).click();
    await expectAxeClean(page);
    await page.getByRole('radio', { name: 'Endpoints' }).click();
    await page.getByRole('button', { name: 'Affects me' }).click();
    await page.getByLabel(/operationIds or METHOD/).fill('createPayment');
    await page.getByRole('button', { name: 'Filter' }).click();
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await page.getByRole('tab', { name: 'Raw diff' }).click();
    await expect(page.getByRole('heading', { name: 'Changes in this file' })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('tab', { name: 'Changelog' }).click();
    await expect(page.getByRole('heading', { name: 'Changelog' })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'Copy for LLM' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectAxeClean(page);
  });
}
