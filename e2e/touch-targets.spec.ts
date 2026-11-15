// Touch targets ≥ 44 px on phone layouts (CLAUDE.md rule 4). The phone project has a touch screen,
// so `pointer: coarse` applies, as on a real phone. A control inside a larger label (a radio card,
// a TextField box it fills) counts as that size.
import { expect, test, type Page } from '@playwright/test';

async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role=switch], [role=tab]')]
      .filter((e) => e.offsetParent !== null && !e.closest('[aria-hidden=true]'))
      .map((e) => {
        // An input that fills its bordered box (TextField) counts as the box; one that does not, as itself.
        const own = e.getBoundingClientRect();
        const parent = e.parentElement!.getBoundingClientRect();
        const fills = e.tagName === 'INPUT' && own.height >= parent.height - 2;
        const box = (e.closest('label') ?? (fills ? e.parentElement! : e)).getBoundingClientRect();
        return { what: (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().slice(0, 40), h: Math.round(Math.max(box.height, e.getBoundingClientRect().height)) };
      })
      .filter((t) => t.h < 44),
  );
}

test('Settings controls are at least 44 px tall on a phone @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('Suggested version')).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Rules and settings' }).click();
  for (const s of ['Rules', 'Ignore paths', 'Diff options', 'Appearance', 'Rule-set file']) {
    await page.getByRole('button', { name: s, exact: true }).or(page.getByRole('tab', { name: s, exact: true })).first().click();
    expect(await smallTargets(page), s).toEqual([]);
  }
});

test('History controls are at least 44 px tall on a phone @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('Suggested version')).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
});

test('Viewer endpoint and schema controls are at least 44 px tall on a phone @phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone');
  for (const route of ['#/op/post-v1-payments', '#/schema/card']) {
    await page.goto(`http://localhost:5174/${route}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // The hidden file input is driven by its visible "Add a version" button.
    expect((await smallTargets(page)).filter((t) => t.what !== 'Add a version from a file'), route).toEqual([]);
  }
});
