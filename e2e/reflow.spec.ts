// WCAG 1.4.10 Reflow: at 320 CSS px (1280 px at 400% zoom) no screen scrolls sideways.
// Code panes and tables may scroll inside themselves; the page may not.
import { expect, test } from '@playwright/test';

const URLS = ['/app/', '/app/?sample=openapi', '/app/?sample=json', '/app/?sample=markdown', '/app/?sample=code', '/app/?sample=text', 'http://localhost:5174/', 'http://localhost:5174/#/op/post-v1-payments', 'http://localhost:4321/', 'http://localhost:4321/docs/', 'http://localhost:4321/rules/'];

for (const url of URLS)
  test(`reflows at 320 px: ${url}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
