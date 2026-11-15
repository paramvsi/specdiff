// Round-3 Code mode fixes (docs/audit, Round 2): A-09 moved rows and rename folds, CD-06 comment and
// hidden-edit labels, the side panel inside its card, X-07 no sideways scroll and X-05 44 px targets at 390 px.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build (B-18).
test.use({ baseURL: 'http://localhost:4173' });

const expectAxeClean = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await axe(page);
};

const HEADING = /^1 logic change, 1 move, 1 rename/;

async function openSample(page: Page) {
  await page.goto('/app/?sample=code');
  await expect(page.getByRole('heading', { name: HEADING })).toBeVisible();
}

async function openFile(page: Page, side: 0 | 1, name: string, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
}

async function compareCode(page: Page, before: string, after: string, name = 'pay.ts') {
  await page.goto('/app/');
  await openFile(page, 0, name, before);
  await openFile(page, 1, name, after);
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const code = (page: Page) => page.getByRole('region', { name: 'Code', exact: true });

test.describe('A-09 structural view', () => {
  test('a moved method renders as ↕ moved rows at its new place, not as + and − blocks', async ({ page }) => {
    await openSample(page);
    const moved = code(page).locator('[data-kind="moved"]');
    await expect(moved.first()).toBeVisible();
    await expect(moved).toHaveCount(5);
    await expect(moved.first()).toContainText('↕');
    await expect(moved.first()).toContainText('void validateCurrency(String currency) {');
    await expect(code(page).getByText('moved from line 33')).toBeVisible();
    // The old place is not shown as a removed block.
    await expect(code(page).locator('[data-kind="del"]', { hasText: 'validateCurrency(String currency)' })).toHaveCount(0);
    await expect(code(page).locator('[data-kind="add"]', { hasText: 'validateCurrency(String currency)' })).toHaveCount(0);
  });

  test('"Hide renames" folds the renamed lines (old and new); off shows both', async ({ page }) => {
    await openSample(page);
    const box = page.getByRole('checkbox', { name: 'Hide renames' });
    await expect(box).toBeChecked();
    await expect(code(page).getByText(/lines? with renamed names, no logic change/).first()).toBeVisible();
    await expect(code(page).getByText('var amount = req.amount();')).toHaveCount(0);
    await expect(code(page).getByText('var amt = req.amount();')).toHaveCount(0);
    await box.click();
    await expect(box).not.toBeChecked();
    await expect(code(page).getByText(/with renamed names/)).toHaveCount(0);
    await expect(code(page).locator('[data-kind="del"]', { hasText: 'var amount = req.amount();' })).toBeVisible();
    await expect(code(page).locator('[data-kind="add"]', { hasText: 'var amt = req.amount();' })).toBeVisible();
  });

  test('the side panel checkboxes and Viewed buttons stay inside the card', async ({ page }) => {
    await openSample(page);
    const card = (await page.getByRole('complementary', { name: 'What changed' }).boundingBox())!;
    const inner = page.getByRole('complementary', { name: 'What changed' }).locator('button, [role="checkbox"], label');
    const n = await inner.count();
    expect(n).toBeGreaterThan(4);
    for (let i = 0; i < n; i++) {
      const b = (await inner.nth(i).boundingBox())!;
      expect(b.x, `element ${i} left`).toBeGreaterThanOrEqual(card.x);
      expect(b.x + b.width, `element ${i} right`).toBeLessThanOrEqual(card.x + card.width);
    }
  });
});

test.describe('CD-06 labels', () => {
  test('a comment-only change shows as "comments changed", not as reformatted; hidden when asked', async ({ page }) => {
    await compareCode(page, 'export function pay(a: number) {\n  // old note\n  return a + 1;\n}\n', 'export function pay(a: number) {\n  // new note\n  return a + 1;\n}\n');
    const panel = page.getByRole('complementary', { name: 'What changed' });
    await expect(panel.getByText('comments changed')).toBeVisible();
    await expect(code(page).getByText(/reformatted/)).toHaveCount(0);
    await expect(code(page).locator('[data-kind="del"]', { hasText: '// old note' })).toBeVisible();
    await expect(code(page).locator('[data-kind="add"]', { hasText: '// new note' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Hide comment-only changes' }).click();
    await expect(code(page).getByText(/only comments changed/)).toBeVisible();
    await expect(code(page).getByText(/reformatted/)).toHaveCount(0);
  });

  test('hidden token edits are labelled by kind (number base, trailing comma)', async ({ page }) => {
    await compareCode(page, 'export const f = () => g(16, 2)\n', 'export const f = () => g(0x10, 2,)\n');
    await expect(code(page).getByText(/number base, trailing comma changed, no logic change/)).toBeVisible();
  });
});

test.describe('390 px @phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('X-07: no sideways scroll once the result has rendered', async ({ page }) => {
    await openSample(page);
    await expect(code(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('X-05: every interactive element is at least 44 × 44', async ({ page }) => {
    await openSample(page);
    await expect(code(page)).toBeVisible();
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
        .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe clean on the code result, renames shown and hidden (${scheme}) @phone`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openSample(page);
    await expectAxeClean(page);
    await page.getByRole('checkbox', { name: 'Hide renames' }).click();
    await expect(page.getByRole('checkbox', { name: 'Hide renames' })).not.toBeChecked();
    await expectAxeClean(page);
  });
}

test('X-02: a 20,000-line code diff renders only the rows near the viewport', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const fn = (i: number, v: string) => `function f${i}(a: number) {\n  return a + ${v};\n}\n`;
  const before = Array.from({ length: 5000 }, (_, i) => fn(i, '1')).join('');
  const after = Array.from({ length: 5000 }, (_, i) => fn(i, i % 2 ? '2' : '1')).join('');
  test.setTimeout(120_000);
  await page.goto('/app/');
  for (const [side, name, content] of [[0, 'a.ts', before], [1, 'b.ts', after]] as const) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open file' }).nth(side).click();
    await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  }
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Code', exact: true }).or(page.getByText(/Showing a text diff/)).first()).toBeVisible({ timeout: 60_000 });
  const nodes = await page.evaluate(() => document.querySelectorAll('main *').length);
  expect(nodes).toBeLessThan(20_000);
});
