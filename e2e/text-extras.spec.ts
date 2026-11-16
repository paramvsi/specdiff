// Text mode extras: TX-03 highlighting, TX-11 moved blocks, TX-12 patches, IN-06 reload, X-11 viewed, X-12 deep links.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

// Run against the production build (B-18).
test.use({ baseURL: 'http://localhost:4173' });

const TS_BEFORE = `export function total(items: Item[]): number {
  // sum the prices
  return items.reduce((s, i) => s + i.price, 0);
}
const label = 'cart';
`;
const TS_AFTER = `export function total(items: Item[], tax = 0): number {
  // sum the prices
  return items.reduce((s, i) => s + i.price, 0) * (1 + tax);
}
const label = 'basket';
`;

const tax = [
  'export function tax(amount, rate) {',
  '  if (rate < 0) throw new Error("rate")',
  '  return amount * rate',
  '}',
];
const total = ['export function total(items) {', '  return items.reduce((s, i) => s + i.price, 0)', '}'];
const filler = Array.from({ length: 6 }, (_, i) => `// helper line ${i}`);
const MOVED_BEFORE = [...tax, ...filler, ...total].join('\n') + '\n';
const MOVED_AFTER =
  [...filler, ...total, ...tax.map((l) => l.replace('return amount * rate', 'return Math.round(amount * rate)'))].join('\n') +
  '\n';

const GIT_DIFF = `diff --git a/openapi.yaml b/openapi.yaml
index 3f1c2ab..9e04d71 100644
--- a/openapi.yaml
+++ b/openapi.yaml
@@ -127,3 +127,3 @@ paths:
       schema:
-            required: [amount]
+            required: [amount, currency]
       type: object
@@ -140,2 +140,3 @@ components:
 x
+y
 z
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 # Payments
-Old intro
+New intro
`;

async function openFile(page: Page, side: 0 | 1, name: string, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
}

async function pasteAndCompare(page: Page, before: string, after: string) {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill(before);
  await page.getByRole('textbox', { name: 'After' }).fill(after);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`TX-03 highlights a .ts file in text mode, axe clean (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/');
    await openFile(page, 0, 'cart.ts', TS_BEFORE);
    await openFile(page, 1, 'cart.ts', TS_AFTER);
    await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    const region = page.getByRole('region', { name: /Differences between cart\.ts and cart\.ts/ });
    await expect(region).toHaveAttribute('data-lang', 'typescript');
    await expect(region.locator('span[style*="--sd-syn-token-keyword"]').first()).toBeVisible();
    // Word-diff highlights survive highlighting.
    await expect(region.locator('mark').filter({ hasText: 'basket' }).first()).toBeVisible();
    await expectAxeClean(page);
  });

  test(`TX-11 moved block is labelled at both ends, axe clean (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await pasteAndCompare(page, MOVED_BEFORE, MOVED_AFTER);
    await expect(page.getByRole('heading', { name: '1 move, 1 edit' })).toBeVisible();
    const to = page.getByText(/4 lines moved from line 1 to line 10/);
    const from = page.getByText(/4 lines moved to line 10 \(from line 1\)/);
    await expect(to).toBeVisible();
    await expect(from).toBeVisible();
    // The edit inside the moved block is highlighted word-level.
    await expect(
      page.locator('[data-kind="moved"]').filter({ hasText: 'Math.round' }).locator('mark').first(),
    ).toHaveText('Math.round(');
    await page.getByRole('button', { name: 'Jump to old position' }).click();
    await expect(page.locator('#sd-move-0-from')).toBeFocused();
    await page.getByRole('button', { name: 'Jump to new position' }).click();
    await expect(page.locator('#sd-move-0-to')).toBeFocused();
    await expectAxeClean(page);
  });

  test(`TX-12 a pasted git diff opens as a comparison, axe clean (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Paste a patch' }).click();
    await expect(page.getByRole('heading', { name: 'Open a patch' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Pasted patch' }).fill(GIT_DIFF);
    await expect(page.getByRole('heading', { name: 'This looks like a git patch' })).toBeVisible();
    await expect(page.getByText('2 files, 3 hunks.')).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('radio', { name: /openapi\.yaml/ }).check();
    await page.getByRole('button', { name: 'Show as text diff' }).click();
    await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
    await expect(page.getByText('126 lines not in the patch')).toBeVisible();
    await expect(page.getByText('10 lines not in the patch')).toBeVisible();
    await expect(page.getByText('127', { exact: true }).first()).toBeVisible();
    await expectAxeClean(page);
  });
}

test('TX-12 a patch pasted into one side is offered as a patch; plain text is not', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('# Notes\n\n---\n\n- item\n+ item\n');
  await expect(page.getByRole('button', { name: 'Open as a patch' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Before' }).fill(GIT_DIFF);
  await page.getByRole('button', { name: 'Open as a patch' }).click();
  await expect(page.getByRole('textbox', { name: 'Pasted patch' })).toHaveValue(GIT_DIFF);
  await expect(page.getByRole('radio', { name: /README\.md/ })).toBeVisible();
});

test('X-12 deep link #change=t-1 scrolls to and focuses the block; V marks viewed; ⇧C copies the link', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/app/?sample=text#change=t-1');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(page.locator('#sd-t-1')).toBeFocused();
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  const progress = page.getByTestId('viewed-progress');
  await expect(progress).toHaveText(/^0 of \d+ viewed$/);
  await page.keyboard.press('v');
  await expect(progress).toHaveText(/^1 of \d+ viewed$/);
  await expect(page.getByRole('checkbox', { name: 'Viewed' })).toBeChecked();
  await expect(page.locator('#sd-t-1')).toHaveAttribute('data-viewed', 'true');
  await page.keyboard.press('Shift+C');
  await expect(page.getByText('Link to this change copied')).toBeVisible();
  // M-20: a full share link, so it opens in any tab or browser, on this change.
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/#v=1&/);
  const elsewhere = await (await page.context().browser()!.newContext()).newPage();
  await elsewhere.goto(link);
  await expect(elsewhere.locator('#sd-t-1')).toBeFocused();
  await elsewhere.close();
  await page.keyboard.press('v');
  await expect(progress).toHaveText(/^0 of \d+ viewed$/);
});

test('IN-06 reload re-fetches a URL side, on Compare and on the result', async ({ page }) => {
  const bodies = ['alpha\nBETA\ngamma\n', 'alpha\nBETA\ngamma\ndelta\nepsilon\n', 'alpha\nbeta\ngamma\ndelta\n'];
  let version = 0;
  let fetches = 0;
  await page.route('https://files.example.test/notes.txt', (route) => {
    fetches++;
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
      body: bodies[version]!,
    });
  });
  // Production build: the dev server compiles the worker on first use, which is slow under parallel load.
  await page.goto('http://localhost:4173/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('alpha\nbeta\ngamma\n');
  await page.getByRole('button', { name: 'From URL' }).nth(1).click();
  await page.getByLabel('File URL').fill('https://files.example.test/notes.txt');
  await page.getByRole('button', { name: 'Load file' }).click();
  await expect(page.getByRole('textbox', { name: 'After' })).toHaveValue(bodies[0]!);
  // Pasted text has nowhere to reload from; the URL side does.
  await expect(page.getByRole('button', { name: /^Reload before/ })).toHaveCount(0);
  const reload = page.getByRole('button', { name: 'Reload after: notes.txt' });
  version = 1;
  await reload.click();
  await expect(page.getByRole('textbox', { name: 'After' })).toHaveValue(bodies[1]!);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 lines differ' })).toBeVisible();
  version = 2;
  await reload.click();
  await expect(page.getByRole('heading', { name: '1 line differs' })).toBeVisible();
  expect(fetches).toBe(3);
  await expectAxeClean(page);
});
