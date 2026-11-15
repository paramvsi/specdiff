// Website round 4: B-13 (Home JS budget without React) and the W-0x frame fixes.
// The website runs on its own server (playwright.config.ts), so every URL here is absolute.
import { gzipSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';

const WEB = 'http://localhost:4321';
const ISLANDS = ['demo', 'slider', 'packages', 'phone-menu'];

/** Loads Home, then wakes every island (scroll into view + pointer/focus) and waits until each says so. */
async function homeJs(page: Page) {
  const sizes = new Map<string, number>();
  const pending: Promise<void>[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() !== 'script' || !r.ok()) return;
    pending.push(
      r.body().then(
        (b) => void sizes.set(new URL(r.url()).pathname, gzipSync(b).length),
        () => undefined,
      ),
    );
  });
  await page.goto(WEB + '/');
  await page.waitForLoadState('networkidle');
  for (const island of ISLANDS) {
    const el = page.locator(`[data-island="${island}"]`);
    await el.evaluate((n) => {
      (n.firstElementChild ?? n).scrollIntoView();
      n.dispatchEvent(new Event('focusin', { bubbles: true }));
    });
    await expect(el).toHaveAttribute('data-hydrated', 'true');
  }
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  return sizes;
}

test('B-13: Home JS, start plus everything hydrated on idle/interaction, is at most 60 KB gzip (docs/04)', async ({
  page,
}) => {
  const sizes = await homeJs(page);
  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  const list = [...sizes]
    .sort((a, b) => b[1] - a[1])
    .map(([p, s]) => `${(s / 1000).toFixed(1)} kB ${p}`)
    .join('\n');
  console.log(`Home JS: ${sizes.size} scripts, ${(total / 1000).toFixed(1)} kB gzip\n${list}`);
  expect(
    total,
    `fetched ${sizes.size} scripts, ${(total / 1000).toFixed(1)} kB gzip:\n${list}`,
  ).toBeLessThanOrEqual(60_000);
});

// ---------------------------------------------------------------- B-13: islands in plain TypeScript
test('B-13: Home loads no React; every island is wired up by plain TypeScript', async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on(
    'request',
    (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname),
  );
  await homeJs(page);
  expect(scripts.filter((s) => /client\.|react/i.test(s))).toEqual([]);
});

test('B-13: demo tabs switch by mouse, keep one panel, and bring the OpenAPI tab back intact', async ({
  page,
}) => {
  await page.goto(WEB + '/');
  const tabs = page.getByRole('tablist', { name: 'Demo mode' }).getByRole('tab');
  const panel = page.locator('#demo-panel');
  const original = await panel.innerHTML();
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(2)).toHaveAttribute('tabindex', '0');
  await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
  await expect(panel).toHaveAttribute('aria-labelledby', 'demo-tab-md');
  await expect(panel.getByRole('heading', { name: 'Running locally' })).toBeVisible();
  await expect(page.locator('.demo [role="tabpanel"]')).toHaveCount(1);
  await tabs.first().click();
  await expect(panel).toHaveAttribute('aria-labelledby', 'demo-tab-openapi');
  expect(await panel.innerHTML()).toBe(original);
});

test('B-13: package tabs by mouse; Home and End; every tab shows its snippet', async ({ page }) => {
  await page.goto(WEB + '/');
  const tabs = page.getByRole('tablist', { name: 'Package' }).getByRole('tab');
  await expect(tabs).toHaveText([
    'CLI',
    'Pre-commit',
    'Spring Boot',
    'React',
    'Express',
    'Script tag',
  ]);
  const panel = page.locator('#pk-panel');
  const expected = [
    'npx specdiff-cli',
    '.pre-commit-config.yaml',
    'specdiff-spring-boot-starter',
    '@specdiff/react',
    'specdiffFastify',
    'Specdiff.mount',
  ];
  for (let i = 0; i < 6; i++) {
    await tabs.nth(i).click();
    await expect(panel).toHaveAttribute(
      'aria-labelledby',
      (await tabs.nth(i).getAttribute('id')) as string,
    );
    await expect(panel).toContainText(expected[i]!);
  }
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(5)).toBeFocused();
  await expect(panel).toContainText('Specdiff.mount');
});

test('B-13: the slider moves the clip, the handle and the spoken value together', async ({
  page,
}) => {
  await page.goto(WEB + '/');
  const slider = page.getByRole('slider', { name: 'Compare git diff with Specdiff' });
  await expect(slider).toHaveAttribute('aria-valuetext', '46% git diff, 54% Specdiff');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '100% git diff, 0% Specdiff');
  await expect(page.locator('.ba-handle')).toHaveAttribute('style', /left: 100%/);
});

test('B-13: phone menu swaps its icon, and a link click closes it @phone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto(WEB + '/');
  const button = page.getByRole('button', { name: 'Open menu' });
  await expect(button.locator('svg')).toHaveClass(/lucide-menu/);
  await button.click();
  const close = page.getByRole('button', { name: 'Close menu' });
  await expect(close.locator('svg')).toHaveClass(/lucide-x/);
  await page.locator('#phone-menu').getByRole('link', { name: 'Packages' }).click();
  await expect(page.locator('#phone-menu')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

// ---------------------------------------------------------------- W-0x frame fixes
test('W04-RuleDetail: payments excerpt, filled example and the designed related rules', async ({
  page,
}) => {
  await page.goto(WEB + '/rules/request-property-became-required/');
  await expect(page.locator('.ba-yaml')).toContainText('/v1/payments:');
  await expect(page.locator('.ba-yaml')).toContainText('required: [amount, currency]');
  await expect(page.locator('main')).toContainText('POST /v1/payments');
  const related = page.locator('.related a');
  await expect(related).toHaveText([
    'request-property-added-required',
    'request-param-became-required',
    'request-body-became-required',
  ]);
});

test('W03-Rules: area chips use the frame labels and order', async ({ page }) => {
  await page.goto(WEB + '/rules/');
  await expect(page.getByRole('group', { name: 'Area' }).getByRole('button')).toHaveText([
    'Endpoints',
    'Parameters',
    'Request bodies',
    'Responses',
    'Schemas',
    'Security',
    'Servers',
    'Deprecation',
    'Webhooks',
    'Docs',
  ]);
});

test('W06/W08: changelog and 404 content starts at x=200 at 1440, as in the frames', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const [path, sel] of [
    ['/changelog/', '.log-main h1'],
    ['/no-such-page/', '.nf-diff'],
  ] as const) {
    await page.goto(WEB + path);
    expect(Math.round((await page.locator(sel).boundingBox())!.x), path).toBe(200);
  }
});

test('W01v2-Home: the hero headline sets on 5 lines at 1440, as in the frame', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(WEB + '/');
  const lines = await page
    .locator('.hero-h1')
    .evaluate((h) =>
      Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)),
    );
  expect(lines).toBe(5);
});
