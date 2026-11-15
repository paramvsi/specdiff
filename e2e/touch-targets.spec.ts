// Touch targets ≥ 44 px on phone layouts (CLAUDE.md rule 4). The phone project has a touch screen,
// so `pointer: coarse` applies, as on a real phone. A control inside a larger label (a radio card,
// a TextField box it fills) counts as that size. Exempt: links inside running text (WCAG 2.5.8
// "inline"), visually hidden file inputs driven by a visible button, and the skip link (it only
// appears on keyboard focus).
import { expect, test, type Page } from '@playwright/test';

async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role=switch], [role=tab], [role=menuitem]')]
      .filter((e) => e.offsetParent !== null && !e.closest('[aria-hidden=true]') && !(e instanceof HTMLInputElement && e.type === 'file') && !e.matches('.skip'))
      .filter((e) => !(e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, td, blockquote')))
      .map((e) => {
        const own = e.getBoundingClientRect();
        const parent = e.parentElement!.getBoundingClientRect();
        // An input that fills its bordered box (TextField) counts as the box; one that does not, as itself.
        const fills = e.tagName === 'INPUT' && own.height >= parent.height - 2;
        const box = (e.closest('label') ?? (fills ? e.parentElement! : e)).getBoundingClientRect();
        // A positioned ::after with negative insets widens the hit area of a control with a visible box.
        const after = getComputedStyle(e, '::after');
        const extra = after.position === 'absolute' ? -(parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0) : 0;
        return { what: (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), h: Math.round(Math.max(box.height, own.height + Math.max(0, extra))) };
      })
      .filter((t) => t.h < 44),
  );
}

const h1 = (page: Page) => expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
async function fromMenu(page: Page, item: string) {
  await page.goto('/app/?sample=openapi');
  await expect(page.getByText('Suggested version')).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

const screens: Array<{ name: string; open: (page: Page) => Promise<unknown>; each?: string[] }> = [
  { name: 'Compare', open: async (p) => { await p.goto('/app/'); await h1(p); } },
  ...['openapi', 'json', 'markdown', 'code', 'text'].map((s) => ({ name: `${s} result`, open: async (p: Page) => { await p.goto(`/app/?sample=${s}`); await h1(p); } })),
  { name: 'Settings', open: (p) => fromMenu(p, 'Rules and settings'), each: ['Rules', 'Ignore paths', 'Diff options', 'Appearance', 'Rule-set file'] },
  { name: 'History', open: async (p) => { await fromMenu(p, 'History'); await expect(p.getByRole('heading', { name: 'History', level: 1 })).toBeVisible(); } },
  ...['', 'docs/', 'docs/text/', 'rules/', 'rules/request-property-became-required/', 'changelog/'].map((u) => ({ name: `Website /${u}`, open: async (p: Page) => { await p.goto(`http://localhost:4321/${u}`); await h1(p); } })),
  ...['', '#/op/post-v1-payments', '#/schema/card'].map((r) => ({ name: `Viewer ${r || 'overview'}`, open: async (p: Page) => { await p.goto(`http://localhost:5174/${r}`); await h1(p); } })),
];

for (const s of screens)
  test(`${s.name}: controls are at least 44 px on a phone @phone`, async ({ page }) => {
    test.skip(test.info().project.name !== 'phone');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await s.open(page);
    for (const section of s.each ?? ['']) {
      if (section) await page.getByRole('button', { name: section, exact: true }).or(page.getByRole('tab', { name: section, exact: true })).first().click();
      expect(await smallTargets(page), section || s.name).toEqual([]);
    }
  });
