// OUT-05: a share link's options are checked before use. Invalid options from a link must not end up in the
// recipient's saved settings, where they would break every later comparison.
import { expect, test } from '@playwright/test';
import { encodeShare } from '../packages/core/src/share/codec';

test('a share link with invalid options does not break later comparisons', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const hash = await encodeShare({ left: { name: 'a.json', content: '{"a":1}' }, right: { name: 'b.json', content: '{"a":2}' }, mode: 'json', options: { json: { numberTolerance: 'lots' } } } as never);
  await page.goto(`/app/#${hash}`);
  await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('{"x":1}');
  await page.getByRole('textbox', { name: 'After' }).fill('{"x":2}');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
});
