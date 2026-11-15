// Website (P5.1/P5.2): W-01 Home v2, W-02 Docs, W-03 Rules, W-04 Rule detail, W-06 Changelog, W-08 404.
// The website runs on its own server (playwright.config.ts), so every URL here is absolute.
import { test, expect, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

const WEB = 'http://localhost:4321';
const pages: Array<[string, string, boolean]> = [
  // name, path, has a 390 px phone frame in design/screens/website
  ['Home', '/', true],
  ['Docs page', '/docs/openapi/', true],
  ['Rules list', '/rules/', true],
  ['Rule detail', '/rules/request-property-became-required/', true],
  ['Changelog', '/changelog/', false],
  ['404', '/404.html', true],
];

/** Loops never finish, so axe runs with reduced motion: every animation off, final states showing. */
async function open(page: Page, path: string, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(WEB + path);
  await expect(page.locator('h1')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  for (const [name, path, phone] of pages) {
    test(`${name} is axe clean at 1440 in ${theme}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop');
      await open(page, path, theme);
      await expectAxeClean(page);
    });
    if (phone)
      test(`${name} is axe clean at 390 in ${theme} @phone`, async ({ page }, info) => {
        test.skip(info.project.name !== 'phone');
        await open(page, path, theme);
        await expectAxeClean(page);
        // No horizontal scrolling at phone width.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      });
  }
}

test('reduced motion: hero words are visible at full opacity, with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(WEB + '/');
  const words = page.locator('.hero-h1 .w');
  await expect(words).toHaveCount(10);
  const styles = await words.evaluateAll((els) => els.map((el) => [getComputedStyle(el).opacity, getComputedStyle(el).animationName]));
  for (const [opacity, anim] of styles) {
    expect(opacity).toBe('1');
    expect(anim).toBe('none');
  }
  // Loops show their final state: the Breaking counter reads 4 and the new version 2.0.0.
  const odo = await page.locator('.odo-4').evaluate((el) => getComputedStyle(el).transform);
  expect(odo).not.toBe('none');
});

test('with motion, the hero words finish their entrance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(WEB + '/');
  await expect(page.locator('.hero-h1 .w').last()).toHaveCSS('opacity', '1', { timeout: 3000 });
});

async function hydrated(page: Page, island: string) {
  await expect(page.locator(`[data-island="${island}"]`)).toHaveAttribute('data-hydrated', 'true');
}

test('demo tabs are real tabs operable with arrow keys', async ({ page }) => {
  await page.goto(WEB + '/');
  const tabs = page.getByRole('tablist', { name: 'Demo mode' }).getByRole('tab');
  await expect(tabs).toHaveText(['OpenAPI', 'JSON / YAML', 'Markdown']);
  await tabs.first().focus();
  await hydrated(page, 'demo');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(page.locator('#demo-panel')).toContainText('4 real changes, not 212 changed lines');
  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  // The looping demo has no live region, so it is never announced on each loop.
  await expect(page.locator('.demo [aria-live]')).toHaveCount(0);
});

test('before/after slider is a range input operable by keyboard, with a visible handle', async ({ page }) => {
  await page.goto(WEB + '/');
  const slider = page.getByRole('slider', { name: 'Compare git diff with Specdiff' });
  await expect(slider).toHaveAttribute('type', 'range');
  await slider.focus();
  await hydrated(page, 'slider');
  const before = Number(await slider.inputValue());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(before + 2));
  await expect(page.locator('.ba-right')).toHaveAttribute('style', new RegExp(`inset\\(0px? 0px? 0px? ${before + 2}%\\)`));
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  const knob = page.locator('.ba-knob');
  await expect(knob).toBeVisible();
  expect(await knob.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('0px 0px 0px 6px'); // focus ring
});

test('package tabs switch with arrow keys and use specdiff-cli', async ({ page }) => {
  await page.goto(WEB + '/');
  const tabs = page.getByRole('tablist', { name: 'Package' }).getByRole('tab');
  await expect(tabs).toHaveCount(6);
  await expect(page.locator('#pk-panel')).toContainText('npx specdiff-cli');
  await expect(page.locator('#pk-panel')).toContainText('✖ 4 breaking');
  await tabs.first().focus();
  await hydrated(page, 'packages');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pk-panel')).toContainText('entry: npx specdiff-cli --ci --fail-on breaking');
});

test('"Try it with a sample" opens the app with the OpenAPI sample (WEB-02)', async ({ page }) => {
  await page.goto(WEB + '/');
  await expect(page.getByRole('link', { name: 'Try it with a sample' })).toHaveAttribute('href', '/app/?sample=openapi');
});

test('copy never says `npx specdiff ` (B-11) and never mentions GitHub Actions', async ({ request }) => {
  for (const path of ['/', '/docs/', '/docs/cli/', '/docs/pre-commit/', '/docs/faq/', '/docs/openapi/']) {
    const html = await (await request.get(WEB + path)).text();
    expect(html, path).not.toMatch(/npx specdiff(?!-cli)/);
    expect(html, path).not.toMatch(/GitHub Actions?/i);
  }
});

test('no inline scripts in any built page (CSP)', async ({ request }) => {
  for (const [, path] of pages) {
    const html = await (await request.get(WEB + path)).text();
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/\bsrc=/.test(m[1] ?? ''));
    expect(inline.map((m) => m[0]), path).toEqual([]);
  }
});

test('theme toggle sets data-theme and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(WEB + '/docs/');
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 13, 12)');
});

test('home hydrates its islands without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(WEB + '/');
  for (const island of ['demo', 'slider', 'packages']) {
    await page.locator(`[data-island="${island}"]`).scrollIntoViewIfNeeded();
    await hydrated(page, island);
  }
  expect(errors).toEqual([]);
});

test('rules list: search and severity filter', async ({ page }) => {
  await page.goto(WEB + '/rules/');
  const rows = page.locator('tr[data-rule]');
  const total = await rows.count();
  expect(total).toBeGreaterThan(50);
  await expect(page.getByRole('searchbox', { name: 'Search rules' })).toHaveAttribute('placeholder', `Search ${total} rules`);
  await page.getByRole('searchbox', { name: 'Search rules' }).fill('became-required');
  await expect(page.locator('tr[data-rule]:visible')).not.toHaveCount(total);
  for (const id of await page.locator('tr[data-rule]:visible .rule-id').allTextContents()) expect(id).toContain('became-required');
  await page.getByRole('searchbox', { name: 'Search rules' }).fill('');
  await page.getByRole('group', { name: 'Severity' }).getByRole('button', { name: /^Breaking/ }).click();
  const sevs = await page.locator('tr[data-rule]:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.sev));
  expect(new Set(sevs)).toEqual(new Set(['breaking']));
  await expect(page.getByRole('status')).toContainText(`Showing ${sevs.length} of ${total}`);
});

test('rule detail shows severity, before/after, and the .specdiff.yaml snippet', async ({ page }) => {
  await page.goto(WEB + '/rules/request-property-became-required/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who it breaks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to avoid it' })).toBeVisible();
  await expect(page.locator('.aside-card')).toContainText('request-property-became-required:');
});

test('changelog RSS feed is valid RSS with both releases', async ({ request }) => {
  const res = await request.get(WEB + '/changelog.xml');
  expect(res.ok()).toBe(true);
  const xml = await res.text();
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain('<title>Specdiff 1.0.0</title>');
  expect(xml).toContain('<title>Specdiff 0.9.0</title>');
});

test('SEO: title, description, canonical, Open Graph and theme-color', async ({ page }) => {
  await page.goto(WEB + '/docs/cli/');
  await expect(page).toHaveTitle(/CLI · Specdiff docs/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://specdiff.netlify.app/docs/cli/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://specdiff.netlify.app/og.png');
  await expect(page.locator('meta[name=theme-color]')).toHaveCount(2);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /.{40,}/);
});

test('phone nav: compact bar with a menu disclosure @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto(WEB + '/');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await expect(page.getByRole('link', { name: 'Open app', exact: true })).toBeVisible();
  const box = await menu.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await menu.focus();
  await hydrated(page, 'phone-menu');
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#phone-menu').getByRole('link', { name: 'Docs' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  await expect(page.locator('#phone-menu')).toBeHidden();
});
