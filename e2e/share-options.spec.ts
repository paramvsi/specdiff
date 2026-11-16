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

test("M-14: a link's rules apply to that comparison only; the recipient's saved rules stay theirs", async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const hash = await encodeShare({ left: { name: 'a.json', content: '{"a":1,"secret":1}' }, right: { name: 'b.json', content: '{"a":1,"secret":2}' }, mode: 'json', options: { json: { ignoreKeys: ['secret'] } } });
  await page.goto(`/app/#${hash}`);
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
  const banner = page.getByRole('status').filter({ hasText: "Using the sender's rules" });
  await expect(banner).toBeVisible();
  // Reloaded, without the link: my rules, which never had `secret` ignored.
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('{"secret":1}');
  await page.getByRole('textbox', { name: 'After' }).fill('{"secret":2}');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /1 difference/ })).toBeVisible();
  await expect(banner).toHaveCount(0);
  // "Save theirs as mine" keeps them.
  await page.goto(`/app/#${hash}`);
  await banner.getByRole('button', { name: 'Save theirs as mine' }).click();
  await expect(banner).toHaveCount(0);
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('{"secret":1}');
  await page.getByRole('textbox', { name: 'After' }).fill('{"secret":2}');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No differences' })).toBeVisible();
});
