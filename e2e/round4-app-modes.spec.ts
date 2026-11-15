// Round 4, non-OpenAPI modes (docs/audit/screens.md, Round 3 "Left:" items): AMarkdown edits stay edits, a
// space between deleted and inserted words, inline link tooltips, edited sections dotted in the outline, a
// heading rename shown as an edit; A09-Code folds unchanged context, a left gutter that only goes up, the
// logic change in words, no mid-word breaks; A09-Fallback as one card; Compare names the code language;
// A07-JsonExport shortens long values in the preview and the Markdown export is a table; one-line JSON tree
// rows; A-03 toolbar on one row and a card that hugs its rows; A03-Patch reads the frame's trimmed patch.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build (B-18). SD_BASE_URL lets a builder point it at a dev server while the build is busy.
test.use({ baseURL: process.env.SD_BASE_URL ?? 'http://localhost:4173' });

const expectAxeClean = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await axe(page);
};

async function openFile(page: Page, side: 0 | 1, name: string, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
}

async function openMarkdown(page: Page) {
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.locator('[id^="md-block-"]').first()).toBeVisible();
}

/** A block's text as read, without the screen-reader-only cues. */
const readText = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('.sd-visually-hidden').forEach((x) => x.remove());
    return c.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  });

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`AMarkdown (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openMarkdown(page);
    });

    test('the first paragraph is one edited paragraph with the inserted sentence', async ({ page }) => {
      const first = page.locator('[id^="md-block-"]', { hasText: 'Create a payment with' });
      await expect(first).toHaveCount(1);
      await expect(first).toHaveAttribute('data-status', 'edited');
      await expect(first.locator('ins').first()).toBeVisible();
      await expect(first.locator('del')).toHaveCount(0);
    });

    test('a deleted word and the inserted words read as separate words', async ({ page }) => {
      const amounts = await readText(page, '[id^="md-block-"]:has-text("Amounts are sent in")');
      expect(amounts).toContain('cents the smallest currency unit');
      const install = await readText(page, '[id^="md-block-"]:has-text("Install dependencies")');
      expect(install).toContain('npm pnpm install');
      expect(install).not.toMatch(/npmpnpm|centsthe/);
    });

    test('a changed link is marked in the text and shows before → after on hover and focus (MD-04)', async ({ page }) => {
      const link = page.getByRole('link', { name: 'integration guide' });
      await expect(link).toHaveAttribute('data-link-changed', '0');
      await expect(page.getByRole('button', { name: /^Link changed: integration guide/ })).toHaveCount(0);
      await link.hover();
      const tip = page.getByRole('tooltip');
      await expect(tip).toContainText('Link changed');
      await expect(tip).toContainText('docs.example.com/v1');
      await expect(tip).toContainText('docs.example.com/v2');
      await page.mouse.move(0, 0);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await link.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await expectAxeClean(page);
    });

    test('the outline marks edited sections and the current one; the rename is one edited heading', async ({ page }) => {
      const outline = page.getByRole('navigation', { name: 'Outline' });
      for (const name of ['Quick start', 'Running locally', 'Configuration', 'Authentication'])
        await expect(outline.getByRole('button', { name: `${name} (edited)` })).toBeVisible();
      await expect(outline.getByRole('button', { name: 'Rate limits (removed)' })).toBeVisible();
      await expect(outline.getByRole('button', { name: 'Migrating to v2 (added)' })).toBeVisible();
      await expect(outline.getByRole('button', { name: 'Environment variables (removed)' })).toHaveCount(0);
      await expect(outline.locator('[aria-current="location"]')).toHaveText(/Quick start/);
      const rename = page.locator('[id^="md-block-"]', { has: page.getByRole('heading', { name: /Configuration/ }) });
      await expect(rename).toHaveAttribute('data-status', 'edited');
      await expect(rename.locator('del')).toHaveText(/Environment variables/);
      await expect(rename.locator('ins')).toHaveText(/Configuration/);
      const summary = page.getByRole('region', { name: 'Summary' });
      for (const [k, v] of [['Sections added', '1'], ['Sections removed', '1'], ['Sections edited', '4']])
        await expect(summary.getByText(k, { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(v);
      const checks = page.getByRole('region', { name: 'Checks' });
      await expect(checks).toContainText('1 broken anchor');
      await expect(checks).toContainText('that heading was renamed to Configuration.');
      await expect(checks).toContainText('docs.example.com/v1 → docs.example.com/v2');
      await checks.getByRole('button', { name: 'Go to the link' }).click();
      await expect(page.locator('[id^="md-block-"]:focus')).toContainText('See configuration');
      await expectAxeClean(page);
    });

    test('A08 side by side: the edited first paragraph sits opposite itself, no gap row', async ({ page }) => {
      await page.getByRole('radio', { name: 'Side by side' }).click();
      const row = page.locator('[id^="sbs-md-block-"]', { hasText: 'Create a payment with' });
      await expect(row).toHaveCount(1);
      await expect(row.locator('[data-side="before"]')).toContainText('Create a payment with');
      await expect(row.locator('[data-side="after"]')).toContainText('must be an ISO 4217 code');
      await expectAxeClean(page);
    });
  });
}

test.describe('A09-Code', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`unchanged context folds, the gutter only goes up, the logic change is in words (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/app/?sample=code');
      await expect(page.getByRole('heading', { name: /^1 logic change, 1 move, 1 rename/ })).toBeVisible();
      const code = page.getByRole('region', { name: 'Code', exact: true });
      await expect(code.getByText('8 unchanged lines')).toBeVisible();
      await expect(code.getByText('package com.acme.payments;')).toHaveCount(0);
      // Left line numbers (first number column of every rendered line) never go back.
      const left = await code.locator('[data-kind] > span:first-child').evaluateAll((els) => els.map((e) => Number(e.textContent)).filter((n) => n > 0));
      expect(left.length).toBeGreaterThan(5);
      expect(left).toEqual([...left].sort((a, b) => a - b));
      const panel = page.getByRole('complementary', { name: 'What changed' });
      await expect(panel.getByText('currency no longer defaults to USD')).toBeVisible();
      await expect(panel.getByText('PaymentService.create changed')).toHaveCount(0);
      await expect(panel.getByText('validateCurrency', { exact: true })).toBeVisible();
      // No name breaks inside a word: every code name sits on one line.
      const lines = await panel.locator('code').evaluateAll((els) => els.map((e) => e.getClientRects().length));
      expect(lines.every((n) => n === 1)).toBe(true);
      await code.getByText('8 unchanged lines').locator('..').getByRole('button', { name: 'Show' }).click();
      await expect(code.getByText('package com.acme.payments;')).toBeVisible();
      await expectAxeClean(page);
    });
  }

  test('A09-Fallback: one card with the file name and a unified diff, no text toolbar', async ({ page }) => {
    await page.goto('/app/');
    await openFile(page, 0, 'main.go', 'package main\n\nimport "fmt"\nfunc greet(name string) {\n  fmt.Println("hello", name)\n}\n');
    await openFile(page, 1, 'main.go (PR)', 'package main\n\nimport "fmt"\nfunc greet(name string, loud bool) {\n  fmt.Println("hello", name)\n}\n');
    await expect(page.getByText(/^Detected/)).toHaveText(/Detected\s*Code · Go/);
    await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByText('Showing a text diff for main.go', { exact: true })).toBeVisible();
    const card = page.getByRole('region', { name: 'Text diff of main.go' });
    await expect(card).toBeVisible();
    await expect(card.locator('[data-kind="del"]')).toContainText('func greet(name string) {');
    await expect(card.locator('[data-kind="add"]')).toContainText('func greet(name string, loud bool) {');
    await expect(page.getByRole('toolbar', { name: 'Diff options' })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test('Compare: "Detected" names the code language', async ({ page }) => {
    await page.goto('/app/');
    await openFile(page, 0, 'PaymentService.java', 'class A {}\n');
    await expect(page.getByText(/^Detected/)).toHaveText(/Detected\s*Code · Java/);
  });
});

test.describe('A07 JSON', () => {
  test('JsonExport: the long add value is shortened in the preview, not clipped; the file is whole', async ({ page }) => {
    await page.goto('/app/?sample=json');
    await expect(page.getByRole('heading', { name: '7 differences in 226 values' })).toBeVisible();
    await page.getByRole('button', { name: 'All export formats' }).click();
    const preview = page.getByRole('region', { name: 'Export preview' });
    const pre = preview.locator('pre');
    await expect(pre).toContainText('{ "op": "add", "path": "/flags/-", "value": { "key": "fraud_rules_v3", … } }');
    const fits = await pre.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    // The format list has no visible heading (A07-JsonExport); Diff / Export are tabs.
    const legend = (await page.getByText('Export format', { exact: true }).boundingBox())!;
    expect(legend.width).toBeLessThanOrEqual(1);
    await expect(page.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
    const download = page.waitForEvent('download');
    await preview.getByRole('button', { name: 'Download' }).click();
    const file = await (await download).path();
    const ops = JSON.parse(readFileSync(file, 'utf8')) as Array<{ op: string; value?: { key?: string; ticket?: string } }>;
    expect(ops.find((o) => o.op === 'add')?.value).toMatchObject({ key: 'fraud_rules_v3', ticket: 'PAY-1224' });
    await expectAxeClean(page);
  });

  test('JsonExport: the Markdown export is the table the card promises', async ({ page }) => {
    await page.goto('/app/?sample=json');
    await page.getByRole('button', { name: 'All export formats' }).click();
    await page.getByRole('radio', { name: /^Markdown/ }).click();
    await expect(page.getByText('A table of every change.')).toBeVisible();
    const preview = page.getByRole('region', { name: 'Export preview' });
    await expect(preview).toContainText('| | Path | Change |');
    await expect(preview).toContainText('| --- | --- | --- |');
    await expect(preview).toContainText('| ~ | limits › timeoutMs | `30000` → `45000` |');
  });

  test('JsonTree: every change is one line; JSONPath stays on the copy button (JS-05)', async ({ page }) => {
    await page.goto('/app/?sample=json');
    const rows = page.getByRole('list', { name: 'Changes by path' }).locator('li[data-kind]');
    await expect(rows).toHaveCount(7);
    const heights = await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.max(...heights)).toBeLessThan(48);
    await expect(page.getByRole('button', { name: 'Copy JSONPath $.limits.timeoutMs' })).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe('A-03 Text', () => {
  test('the toolbar is one row at 1440 px and the card hugs a short diff', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/?sample=text');
    const bar = page.getByRole('toolbar', { name: 'Diff options' });
    await expect(bar).toBeVisible();
    const tops = await bar.evaluate((el) => [...el.children].filter((c) => (c as HTMLElement).offsetWidth > 1).map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
    const region = page.getByRole('region', { name: /^Differences between/ });
    const box = (await region.boundingBox())!;
    expect(box.height).toBeLessThan(500);
  });

  test("A03-Patch: the frame's trimmed patch is read as 1 file, 1 hunk", async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Paste a patch' }).click();
    await page.getByRole('textbox', { name: 'Pasted patch' }).fill(
      'diff --git a/openapi.yaml b/openapi.yaml\nindex 3f1c2ab..9e04d71 100644\n--- a/openapi.yaml\n+++ b/openapi.yaml\n@@ -127,3 +127,3 @@\n-            required: [amount]\n+            required: [amount, currency]\n',
    );
    await expect(page.getByRole('heading', { name: 'This looks like a git patch' })).toBeVisible();
    await expect(page.getByText(/^1 file, 1 hunk\./)).toBeVisible();
    const box = (await page.getByRole('textbox', { name: 'Pasted patch' }).boundingBox())!;
    expect(box.height).toBeLessThan(260);
    await page.getByRole('button', { name: 'Show as text diff' }).click();
    await expect(page.getByRole('region', { name: /^Differences between/ })).toContainText('required: [amount, currency]');
    await expectAxeClean(page);
  });
});
