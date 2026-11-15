// Round 3, JSON/YAML and Markdown: B-31 AJson overview, A07-JsonExport patch from the keyed diff (with a move
// that applies), AMarkdown grouped sections + section counts + cell-level table diff, X-08 identical-state
// button, X-05 phone targets ≥ 44 px and no sideways scroll at 390, axe in light and dark.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

test.use({ baseURL: 'http://localhost:4173' });

// fast-json-patch is a dev dependency of @specdiff/core, not of the workspace root.
const coreRequire = createRequire(fileURLToPath(new URL('../packages/core/package.json', import.meta.url)));
const jsonpatch = coreRequire('fast-json-patch') as {
  applyPatch: (doc: unknown, ops: unknown[], validate?: boolean) => { newDocument: unknown };
};

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const expectAxeClean = async (page: Page) => {
  await settle(page);
  await axe(page);
};

async function paste(page: Page, before: string, after: string, mode: string) {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill(before);
  await page.getByRole('textbox', { name: 'After' }).fill(after);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption(mode);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

/** Waits for the JSON result (the tree), not just the shell. */
async function openJson(page: Page) {
  await page.goto('/app/?sample=json');
  await expect(page.getByRole('heading', { name: '7 differences in 226 values' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Changes by path' }).getByText('[key=new_pricing]')).toBeVisible();
}
async function openMarkdown(page: Page) {
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.locator('[id^="md-block-"]').first()).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`B-31 AJson overview: options + counts, views, changes by path, export card (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openJson(page);
    await expect(page.getByRole('heading', { name: 'Compare options' })).toBeVisible();
    const counts = page.getByRole('region', { name: 'Counts' });
    for (const [label, n] of [['added', '1'], ['removed', '1'], ['changed', '3'], ['moved only', '1']])
      await expect(counts.getByText(label, { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(n);
    for (const v of ['Tree', 'Side by side', 'Raw text']) await expect(page.getByRole('radio', { name: v })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Changes by path' })).toBeVisible();
    const byPath = page.getByRole('list', { name: 'Changed paths' });
    await expect(byPath.getByRole('listitem')).toHaveCount(7);
    await expect(byPath.getByText('changed 30000 → 45000')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy as JSON Patch' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy JSONPath list' })).toBeVisible();
    // "Only show changes" off adds the unchanged keys as context; the ignored key says so.
    const tree = page.getByRole('list', { name: 'Changes by path' });
    await expect(tree.getByText('ignored by your rules')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Only show changes' }).click();
    await expect(tree.getByText('ignored by your rules')).toBeVisible();
    await expect(tree.getByText('version 41')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Only show changes' }).click();
    await expectAxeClean(page);
  });

  test(`AMarkdown: sections grouped, counted, table cells diffed (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openMarkdown(page);
    const summary = page.getByRole('region', { name: 'Summary' });
    for (const [k, v] of [['Sections added', '2'], ['Sections removed', '2'], ['Sections edited', '3']])
      await expect(summary.getByText(k, { exact: true }).locator('xpath=following-sibling::dd')).toHaveText(v);
    // Table: the key cell is untouched, the value cell carries its own marks.
    const cell = page.locator('td', { hasText: 'Idempotency-Key' });
    await expect(cell).toHaveText('Idempotency-Key');
    await expect(cell.locator('del, ins')).toHaveCount(0);
    await expect(page.locator('td', { hasText: 'Required for POST' }).locator('ins')).toHaveCount(1);
    // Rate limits (removed) and Migrating to v2 (added) are two runs, not interleaved block by block.
    await expect(page.getByRole('heading', { name: 'Migrating to v2' })).toBeVisible();
    const order = await page.locator('[id^="md-block-"]').evaluateAll((els) =>
      els
        .sort((a, b) => Number(a.id.slice(9)) - Number(b.id.slice(9)))
        .map((e) => `${e.getAttribute('data-status')} ${(e.querySelector('h1,h2,h3') ?? e.querySelector('p'))?.textContent?.slice(0, 20) ?? ''}`),
    );
    const at = order.findIndex((o) => o.startsWith('removed Rate limits'));
    expect(order.slice(at, at + 4).map((o) => o.split(' ')[0])).toEqual(['removed', 'removed', 'added', 'added']);
    expect(order[at + 2]).toContain('Migrating to v2');
    await expectAxeClean(page);
  });
}

test('A07-JsonExport: the sample patch has a move, about 7 operations, and says it applies', async ({ page }) => {
  await openJson(page);
  await page.getByRole('button', { name: 'All export formats' }).click();
  const preview = page.getByRole('region', { name: 'Export preview' });
  await expect(preview).toContainText('flags.prod.patch.json · 8 operations');
  await expect(preview).toContainText('{ "op": "move", "from": "/flags/3", "path": "/flags/11" }');
  await expect(preview).toContainText('Applying this patch to flags.prod.json gives flags.staging.json exactly.');
  await expectAxeClean(page);
});

test('A07-JsonExport: a pasted keyed pair gives a move op that fast-json-patch applies exactly', async ({ page }) => {
  const before = { items: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, n: i })), mode: 'x', drop: true };
  const after = { items: ['a', 'c', 'd', 'e', 'b', 'f'].map((id) => ({ id, n: id === 'c' ? 99 : 'abcdef'.indexOf(id) })), mode: 'y' };
  await paste(page, JSON.stringify(before, null, 2), JSON.stringify(after, null, 2), 'yaml');
  await expect(page.getByRole('heading', { name: /differences? in/ })).toBeVisible();
  await page.getByRole('button', { name: 'All export formats' }).click();
  const code = page.getByRole('region', { name: 'Export preview' }).locator('pre');
  await expect(code).toContainText('"op": "move"');
  const ops = JSON.parse((await code.textContent()) ?? '[]') as Array<{ op: string }>;
  expect(ops.map((o) => o.op).sort()).toEqual(['add', 'move', 'remove', 'replace', 'replace']);
  expect(jsonpatch.applyPatch(structuredClone(before), ops, true).newDocument).toEqual(after);
});

test('X-08: "Show formatting changes" works in the JSON and Markdown identical states', async ({ page }) => {
  // Same meaning, other key order and indentation.
  await paste(page, '{"a": 1, "b": [1, 2]}', '{\n  "b": [1, 2],\n  "a": 1\n}', 'yaml');
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
  await expect(page.getByText(/[1-9]\d* formatting-only lines? (was|were) ignored/)).toBeVisible();
  await page.getByRole('button', { name: 'Show formatting changes' }).click();
  await expect(page.getByRole('button', { name: 'Hide formatting changes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeHidden();
  await expectAxeClean(page);

  // Markdown: an ATX heading rewritten as a setext heading renders the same.
  await paste(page, '# Title\n\nSame text.\n', 'Title\n=====\n\nSame text.\n', 'markdown');
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
  await page.getByRole('button', { name: 'Show formatting changes' }).click();
  await expect(page.getByRole('button', { name: 'Hide formatting changes' })).toBeVisible();

  // Byte-identical: nothing was ignored, so no button and no "0 lines" claim.
  await paste(page, '{"a": 1}', '{"a": 1}', 'yaml');
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
  await expect(page.getByText(/0 formatting-only/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show formatting changes' })).toHaveCount(0);
});

test.describe('390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  for (const sample of ['json', 'markdown'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`X-05 ${sample} at 390 ${scheme}: no sideways scroll, every target ≥ 44 px, axe clean`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await (sample === 'json' ? openJson(page) : openMarkdown(page));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], input, select, summary')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
            })
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.height < 44 || r.width < 24;
            })
            // WCAG 2.5.8 inline exception: a link inside a sentence of the rendered document.
            .filter((el) => !(el.tagName === 'A' && el.closest('p, li, td')))
            .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`),
        );
        expect(small, 'targets under 44 px').toEqual([]);
        await expectAxeClean(page);
      });
    }
  }
});
