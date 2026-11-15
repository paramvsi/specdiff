// A-07 JSON, A-08 Markdown, O-09/O-10 share + unlock, A-11 history, A-13 saved sources.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Run against the production build: the dev server can reload mid-test while it optimises dependencies.
test.use({ baseURL: 'http://localhost:4173' });

// Overlays fade in; axe measures contrast mid-fade otherwise.
const expectAxeClean = async (page: Page) => {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await axe(page);
};

const HEADING: Record<string, RegExp> = {
  History: /^(History|No comparisons yet)$/,
  'Saved sources': /^Saved sources$/,
  'New comparison': /^Compare two files$/,
};
const open = async (page: Page, item: string) => {
  // Retry: a click can land while the app is still booting under parallel load.
  await expect(async () => {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: item }).click();
    await expect(page.getByRole('heading', { name: HEADING[item] }).first()).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 15_000 });
};

for (const scheme of ['light', 'dark'] as const) {
  test(`A-07 JSON sample: tree, views and export panel (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=json');
    await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
    const tree = page.getByRole('list', { name: 'Changes by path' });
    await expect(tree.getByRole('button', { name: 'Copy JSONPath $.limits.timeoutMs', exact: true })).toBeVisible();
    await expect(tree.getByText('~ changed').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy JSONPath $.limits.timeoutMs' })).toBeVisible();
    await expect(page.getByText(/Auto-detected|Auto: tried/)).toBeVisible();
    await expectAxeClean(page);

    // J moves to the first change; V marks it viewed.
    await page.keyboard.press('j');
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('v');
    await expect(page.getByText(/^1 of \d+ viewed$/)).toBeVisible();

    await page.getByRole('radio', { name: 'Side by side' }).click();
    await expect(page.getByRole('region', { name: /Side by side/ })).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('tab', { name: 'Export' }).click();
    const preview = page.getByRole('region', { name: 'Export preview' });
    await expect(preview).toContainText('"op": "replace"');
    await expect(preview).toContainText(
      'Applying this patch to flags.prod.json gives flags.staging.json exactly.',
    );
    await page.getByRole('radio', { name: /Merge Patch/ }).click();
    await expect(preview).toContainText('flags.prod.merge-patch.json');
    await page.getByRole('radio', { name: /JSONPath list/ }).click();
    await expect(preview).toContainText('$.limits.timeoutMs');
    const download = page.waitForEvent('download');
    await preview.getByRole('button', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toBe('flags.prod.jsonpaths.txt');
    await expectAxeClean(page);
  });

  test(`A-08 Markdown sample: outline and changed link (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=markdown');
    const outline = page.getByRole('navigation', { name: 'Outline' });
    await expect(outline.getByRole('button', { name: 'Payments API' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'integration guide' })).toHaveAttribute('data-link-changed', '0');
    await expect(page.getByRole('region', { name: 'Checks' }).getByText('docs.example.com/v1')).toBeVisible();
    await expect(page.locator('ins').first()).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('radio', { name: 'Side by side' }).click();
    await expect(page.locator('p', { hasText: 'must be an ISO 4217 code' })).toBeVisible();
    await expect(page.locator('ins').first()).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('radio', { name: 'Source' }).click();
    await expect(page.getByRole('region', { name: /^Source:/ })).toBeVisible();
    await expectAxeClean(page);
  });

  test(`O-09/O-10 share with a passphrase, then unlock (${scheme})`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=json');
    await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
    await page.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
    await expect(dialog).toBeVisible();
    await page.getByRole('switch', { name: 'Lock' }).click();
    await dialog.getByLabel('Passphrase').fill('correct horse battery staple');
    const linkBox = dialog.getByRole('textbox', { name: 'Share link' });
    await expect(linkBox).toHaveValue(/#v=1&e=1&s=/);
    await expect(dialog.getByText(/KB of 8 KB/)).toBeVisible();
    await expectAxeClean(page);
    const link = await linkBox.inputValue();
    expect(link).not.toContain('correct horse');

    const other = await context.newPage();
    await other.emulateMedia({ colorScheme: scheme });
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'This comparison is locked' })).toBeVisible();
    await expectAxeClean(other);
    await other.getByLabel('Passphrase').fill('wrong horse');
    await other.getByRole('button', { name: 'Unlock' }).click();
    await expect(other.getByRole('alert')).toHaveText(
      'That passphrase didn’t unlock it. Check for extra spaces.',
    );
    await expectAxeClean(other);
    await other.getByLabel('Passphrase').fill('correct horse battery staple');
    await other.getByRole('button', { name: 'Unlock' }).click();
    await expect(other.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
    await expect(other.getByText('flags.staging.json').first()).toBeVisible();
  });

  test(`A-11 history: entry, pin, delete, clear, empty (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=json');
    await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
    await open(page, 'New comparison');
    await page.getByRole('button', { name: 'Markdown', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();

    await open(page, 'History');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.getByText('2 comparisons', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open flags.prod.json → flags.staging.json' })).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('button', { name: 'Pin flags.prod.json → flags.staging.json' }).click();
    await expect(
      page.getByRole('button', { name: 'Unpin flags.prod.json → flags.staging.json' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('rowheader', { name: 'Pinned' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete README.md → README.md (edited)' }).click();
    await expect(page.getByText('1 comparison,', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Clear history' }).click();
    const confirm = page.getByRole('dialog', { name: 'Clear history?' });
    await expectAxeClean(page);
    await confirm.getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByRole('heading', { name: 'No comparisons yet' })).toBeVisible();
    await expectAxeClean(page);
  });

  test(`A-13 saved sources: add, re-check, changed since last visit (${scheme})`, async ({
    page,
  }) => {
    let version = 1;
    await page.route('https://specs.example.test/**', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'flags', version, enabled: version > 1 }),
      }),
    );
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/');
    await open(page, 'Saved sources');
    await expect(page.getByRole('heading', { name: 'No saved sources yet' })).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('button', { name: 'Add source' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add a saved source' });
    await dialog.getByLabel('URL').fill('https://specs.example.test/flags.json');
    await dialog.getByLabel('Name (optional)').fill('Feature flags');
    await dialog.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByText('Feature flags')).toBeVisible();
    await expect(page.getByText(/Saved\. Changes show/)).toBeVisible();

    version = 2;
    await open(page, 'New comparison');
    await open(page, 'Saved sources');
    await expect(page.getByText('1 of your saved sources changed since your last visit')).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'See what changed' }).click();
    await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
  });
}
