// Renders the PWA icons from public/favicon.svg with the Playwright Chromium already installed for tests.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, maskable] of [[192, false], [512, false], [512, true]]) {
  const pad = maskable ? size * 0.2 : size * 0.1;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:#ECEEE9;display:grid;place-items:center;width:${size}px;height:${size}px"><div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: fileURLToPath(new URL(`../public/icon-${size}${maskable ? '-maskable' : ''}.png`, import.meta.url)) });
}
await browser.close();
console.log('icons written');
