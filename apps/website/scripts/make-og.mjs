// Renders public/og.png (1200×630) from the HTML below with the Playwright Chromium already in the repo.
// Run from the repo root: node apps/website/scripts/make-og.mjs   (no new dependency; output is committed)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
const font = fileURLToPath(new URL('../../../packages/ui/node_modules/@fontsource/geist-sans/files/geist-sans-latin-800-normal.woff2', import.meta.url));
const mono = fileURLToPath(new URL('../../../packages/ui/node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff2', import.meta.url));

const b64 = (f) => readFileSync(f).toString('base64');

// Values are the light-theme tokens (packages/ui/src/tokens.css); a PNG cannot read CSS variables.
const html = `<!doctype html><html><head><style>
@font-face{font-family:G;font-weight:800;src:url(data:font/woff2;base64,${b64(font)})}
@font-face{font-family:M;font-weight:600;src:url(data:font/woff2;base64,${b64(mono)})}
body{margin:0;width:1200px;height:630px;background:#eceee9;font-family:G;color:#15171a;
 background-image:radial-gradient(#c9cdc7 1.4px,transparent 1.4px);background-size:28px 28px;}
.w{padding:72px 80px;display:flex;flex-direction:column;height:100%;box-sizing:border-box;justify-content:space-between}
.logo{display:flex;align-items:center;gap:14px;font-size:40px;font-weight:800;letter-spacing:-1px}
h1{margin:0;font-size:92px;line-height:.95;letter-spacing:-.055em;font-weight:800;max-width:15ch}
.row{display:flex;gap:14px;font-family:M;font-size:24px}
.p{padding:8px 16px;border-radius:999px}
</style></head><body><div class="w">
<div class="logo"><svg width="52" height="52" viewBox="0 0 26 26"><rect x="2" y="5" width="13" height="16" rx="3.5" fill="none" stroke="#15171a" stroke-width="2"/><rect x="11" y="5" width="13" height="16" rx="3.5" fill="#c8f24a"/><path d="M14.5 13h6M17.5 10v6" stroke="#15171a" stroke-width="2" stroke-linecap="round"/></svg>specdiff</div>
<h1>Know what your API change breaks before you ship it.</h1>
<div class="row"><span class="p" style="background:#f8dee5;color:#a11d3b">! 4 breaking</span><span class="p" style="background:#d9eee6;color:#1b6b57">+ 14 safe</span><span class="p" style="background:#15171a;color:#c8f24a">2.0.0 major</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => globalThis.document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
