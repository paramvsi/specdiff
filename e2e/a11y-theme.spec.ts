// X-05 / X-07: every sample at 1440 dark and at 390 light + dark — no horizontal scroll, axe clean
// (also with the Export and Copy for LLM menus open), and selected states readable in dark.
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build: the dev server can reload mid-test while it optimises dependencies.
test.use({ baseURL: 'http://localhost:4173' });

const SAMPLES = ['openapi', 'json', 'markdown', 'code', 'text'] as const;

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

const expectAxeClean = async (page: Page) => {
  await settle(page);
  await axe(page);
};

async function noHorizontalScroll(page: Page) {
  const r = await page.evaluate(() => {
    const w = window.innerWidth;
    const over = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > w + 0.5)
      .filter((el) => !el.closest('[data-radix-popper-content-wrapper]'))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} → ${Math.round(el.getBoundingClientRect().right)}`);
    return { scroll: document.documentElement.scrollWidth, w, over };
  });
  expect(r.scroll, `overflowing: ${r.over.join(' | ')}`).toBeLessThanOrEqual(r.w);
}

/** Selected chips, segments, tabs, count badges, checked boxes and switches: text ≥ 4.5:1, controls ≥ 3:1. */
async function selectedStateContrast(page: Page) {
  return page.evaluate(() => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const bgOf = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length === 3 || (c.length === 4 && c[3] === 1)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const bad: string[] = [];
    let checked = 0;
    const sel = '[aria-pressed="true"],[data-state="on"],[aria-selected="true"],[role="tab"][data-state="active"]';
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      for (const t of [el, ...el.querySelectorAll('*')]) {
        const hasText = [...t.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!hasText || !visible(t)) continue;
        checked++;
        const r = ratio(rgb(getComputedStyle(t).color), bgOf(t));
        if (r < 4.5) bad.push(`"${t.textContent!.trim().slice(0, 20)}" ${r.toFixed(2)}:1`);
      }
    }
    for (const el of document.querySelectorAll('[role="switch"][data-state="checked"],[role="checkbox"][data-state="checked"]')) {
      if (!visible(el)) continue;
      checked++;
      // The UI Checkbox paints an inner [data-mark] box; the button around it is the hit area.
      const box = el.querySelector('[data-mark]') ?? el;
      const r = ratio(bgOf(box), bgOf(el.parentElement));
      if (r < 3) bad.push(`${el.getAttribute('role')} ${r.toFixed(2)}:1`);
      const ind = el.querySelector('svg');
      if (ind && visible(ind)) {
        const ri = ratio(rgb(getComputedStyle(ind).color), bgOf(box));
        if (ri < 3) bad.push(`check mark ${ri.toFixed(2)}:1`);
      }
    }
    return { bad, checked };
  });
}

async function openSample(page: Page, sample: (typeof SAMPLES)[number]) {
  await page.goto(`/app/?sample=${sample}`);
  await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
  // OpenAPI opens on Summary; the review chips live on Workspace.
  if (sample === 'openapi' && (page.viewportSize()?.width ?? 0) >= 640) {
    await page.getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByRole('button', { name: /To review/ })).toBeVisible();
  }
  await settle(page);
}

async function menusAxeClean(page: Page) {
  for (const name of ['Export', 'Copy for LLM']) {
    const trigger = page.getByRole('button', { name, exact: true });
    if (!(await trigger.isVisible())) continue;
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  }
}

for (const sample of SAMPLES) {
  test(`${sample} at 1440 dark: no scroll, axe clean, menus clean, selected states readable`, async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openSample(page, sample);
    await noHorizontalScroll(page);
    const c = await selectedStateContrast(page);
    expect(c.bad).toEqual([]);
    await expectAxeClean(page);
    await menusAxeClean(page);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`@phone ${sample} at 390 ${scheme}: no scroll, compact top bar, 44px targets, axe clean`, async ({
      page,
    }) => {
      test.skip(test.info().project.name !== 'phone');
      await page.emulateMedia({ colorScheme: scheme });
      await openSample(page, sample);
      await noHorizontalScroll(page);
      // Compact top bar: no file chips, icon-only actions inside the viewport.
      const bar = page.getByRole('banner');
      await expect(bar.getByText('Search changes')).toBeHidden();
      for (const name of ['More', 'Share', 'Export']) {
        const box = (await bar.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.x + box.width, name).toBeLessThanOrEqual(390);
        expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
      }
      // Shell and shared controls must be ≥ 44 px. Screen-owned controls are listed as an annotation.
      const SHARED = 'header *, a[href="#main"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"]';
      const small = await page.evaluate((shared) =>
        [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], input, select, summary')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          })
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height < 44 || r.width < 24;
          })
          .map((el) => ({
            shared: el.matches(shared),
            what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`,
          })),
      SHARED);
      expect(small.filter((s) => s.shared).map((s) => s.what), 'shell/shared targets under 44 px').toEqual([]);
      const screenOwned = small.filter((s) => !s.shared).map((s) => s.what);
      if (screenOwned.length)
        test.info().annotations.push({ type: 'screen targets under 44 px', description: screenOwned.join('; ') });
      if (scheme === 'dark') expect((await selectedStateContrast(page)).bad).toEqual([]);
      await expectAxeClean(page);
      await menusAxeClean(page);
    });
  }
}

test('X-05 text identical state in dark: "New comparison" link is readable, axe clean', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('same\ntext\n');
  await page.getByRole('textbox', { name: 'After' }).fill('same\ntext\n');
  await page.getByRole('combobox', { name: 'Compare as' }).selectOption('text');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByText('No differences')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New comparison' })).toBeVisible();
  await expectAxeClean(page);
});

test('X-04 palette lists Files and the current result’s changes in every mode', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const cases = [
    ['json', /beta_banner/, 'timeoutMs'],
    ['markdown', /Create a payment/, 'guide'],
    ['code', /PaymentService/, 'create'],
    ['text', /db pool size/, 'checkout'],
    ['openapi', /./, 'endpoint removed'],
  ] as const;
  for (const [sample, change, query] of cases) {
    await openSample(page, sample);
    await page.getByRole('button', { name: /^Search/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog.getByText('Files', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Changes', { exact: true })).toBeVisible();
    const changes = dialog.getByRole('group', { name: 'Changes' }).getByRole('option');
    await expect(changes.first()).toHaveText(change);
    // Words, not scattered letters: every hit for the query contains it.
    await page.getByRole('combobox').fill(query);
    await expect(changes.first()).toBeVisible();
    for (const t of await dialog.getByRole('option').allTextContents())
      expect(t.toLowerCase()).toContain(query.split(' ')[0]!.toLowerCase());
    await page.keyboard.press('Escape');
  }
});

test('Settings rule switches in dark: control only, track visible, axe clean', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSample(page, 'openapi');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Rules and settings' }).click();
  const sw = page.getByRole('switch', { name: 'endpoint-removed on' });
  await expect(sw).toBeVisible();
  await expect(page.getByText('endpoint-removed on')).toHaveCount(0);
  expect((await selectedStateContrast(page)).bad).toEqual([]);
  await expectAxeClean(page);
});
