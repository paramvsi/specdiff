// A-11 History · empty matches design/prototypes/app/A11-HistoryEmpty.dc.html: a 22 px title,
// 15 px/1.6 body capped at 46ch, a 30 px clock and 56 px of vertical padding.
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

test('A-11 empty History uses the design sizes', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  const title = page.getByRole('heading', { name: 'No comparisons yet' });
  await expect(title).toBeVisible();
  const got = await title.evaluate((h) => {
    const p = h.nextElementSibling as HTMLElement;
    const root = h.parentElement!;
    const icon = root.querySelector('svg')!;
    const cs = (e: Element) => getComputedStyle(e);
    return { title: cs(h).fontSize, tracking: cs(h).letterSpacing, body: cs(p).fontSize, lh: cs(p).lineHeight, maxW: (() => { const m = document.createElement('span'); m.textContent = '0'.repeat(46); m.style.font = cs(p).font; m.style.position = 'absolute'; document.body.append(m); const w = m.getBoundingClientRect().width; m.remove(); return Math.abs(p.getBoundingClientRect().width - w) < 1; })(), icon: icon.getAttribute('width'), pad: cs(root).paddingTop };
  });
  expect(got).toEqual({ title: '22px', tracking: '-0.4px', body: '15px', lh: '24px', maxW: true, icon: '30', pad: '56px' });
  await expectAxeClean(page);
});
