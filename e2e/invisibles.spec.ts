// A line that differs only by invisible characters names them, and bidi controls cannot reorder
// the line a reviewer reads (Trojan Source).
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y';

test('text mode names invisible characters and bidi controls in changed lines', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  for (const [i, body] of [[0, 'price: 10\naccess = user\n'], [1, 'pri​ce: 10\naccess = user‮ admin\n']] as const) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open file' }).nth(i).click();
    await (await chooser).setFiles({ name: `notes-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from(body) });
  }
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByTitle('U+200B zero-width space').first()).toHaveText('ZWSP');
  await expect(page.getByTitle('U+202E right-to-left override').first()).toHaveText('RLO');
  expect(await page.locator('mark').evaluateAll((ms) => ms.some((m) => m.textContent!.includes('‮')))).toBe(false);
  await expectAxeClean(page);
});
