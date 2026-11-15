// End-to-end coverage for docs/02 WEB-01…09, VW-01…14 and PK-01…10 that the other e2e files do not prove
// (audit: docs/audit/coverage-web-vw-pk.md). Each test title starts with its feature ID.
// Servers: website :4321, app preview :4173, Viewer harness :5174 (playwright.config.ts). The embed site is
// served by page.route on http://sd.test from the repository files, so no extra server is needed.
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean } from './a11y';

const ROOT = process.cwd();
const WEB = 'http://localhost:4321';
const APP = 'http://localhost:4173';
const H = 'http://localhost:5174/';
const SD = 'http://sd.test';
const CLI = resolve('packages/cli/dist/cli.js');
const fx = (n: string) => resolve('fixtures/samples', n);

const freePort = () =>
  new Promise<number>((ok, ko) => {
    const s = createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (a && typeof a === 'object' ? ok(a.port) : ko(new Error('no port'))));
    });
  });

/** Spawn a process and resolve once its output contains `ready`. */
async function startProcess(cmd: string, args: string[], ready: RegExp, env: NodeJS.ProcessEnv = {}, timeout = 60_000): Promise<{ proc: ChildProcess; log: () => string }> {
  const proc = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  await new Promise<void>((ok, ko) => {
    const timer = setTimeout(() => ko(new Error(`${cmd} did not start:\n${log}`)), timeout);
    const on = (d: Buffer) => { log += d.toString(); if (ready.test(log)) { clearTimeout(timer); ok(); } };
    proc.stdout!.on('data', on);
    proc.stderr!.on('data', on);
    proc.once('exit', (code) => { clearTimeout(timer); ko(new Error(`${cmd} exited with ${code}:\n${log}`)); });
  });
  return { proc, log: () => log };
}
const stop = (p?: ChildProcess) => { if (p?.pid) try { process.kill(-p.pid); } catch { /* gone */ } };

// ---------------------------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------------------------

const hydrated = (page: Page, island: string) => expect(page.locator(`[data-island="${island}"]`)).toHaveAttribute('data-hydrated', 'true');

test('WEB-01 Home v2 has every section: floating nav, hero, demo tabs, formats strip, slider, feature grid, Viewer band, package terminal, FAQ, CTA, footer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(WEB + '/');
  await expect(page.locator('h1')).toBeVisible();
  // Floating nav: stays on screen when the page scrolls.
  const nav = page.locator('header.fnav');
  await expect(nav.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Product', 'Viewer', 'Packages', 'Docs', 'Rules']);
  expect(await nav.evaluate((el) => getComputedStyle(el).position)).toMatch(/sticky|fixed/);
  await page.mouse.wheel(0, 2500);
  await expect.poll(() => nav.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(40);
  await page.evaluate(() => scrollTo(0, 0));
  // Word-by-word hero entrance: one span per word, each with a later start than the one before.
  const delays = await page.locator('.hero-h1 .w').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).animationDelay)));
  expect(delays).toHaveLength(10);
  for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
  await expect(page.locator('.hero-h1')).toHaveText('Know what your API change breaks before you ship it.');
  // Animated live demo with the three tabs.
  await expect(page.getByRole('tablist', { name: 'Demo mode' }).getByRole('tab')).toHaveText(['OpenAPI', 'JSON / YAML', 'Markdown']);
  await expect(page.getByRole('figure', { name: 'Live demo' })).toBeVisible();
  // Scrolling formats strip.
  const strip = page.getByRole('region', { name: 'Supported formats' });
  await expect(strip.locator('ul').first().locator('li')).toContainText(['Swagger 2.0', 'OpenAPI 3.1', 'Markdown', 'Plain text']);
  expect(await strip.locator('.formats-track').evaluate((el) => getComputedStyle(el).animationName)).toBe('sdMarquee');
  // Before/after drag slider.
  await expect(page.getByRole('slider', { name: 'Compare git diff with Specdiff' })).toHaveAttribute('type', 'range');
  // Feature grid with micro-animations.
  const features = page.getByRole('region', { name: 'Built for the review, not just the diff.' });
  await expect(features.locator('article.tile')).toHaveCount(6);
  const featureAnims = await features.evaluate((el) => [...new Set(el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName))]);
  expect(featureAnims.length).toBeGreaterThanOrEqual(3);
  // Viewer band.
  const band = page.getByRole('region', { name: 'API docs that remember every version.' });
  await expect(band.getByRole('img', { name: /The Viewer for Payments API/ })).toBeVisible();
  await expect(band.locator('.vlist li')).toHaveCount(4);
  // Package tabs with a typed terminal.
  await page.locator('[data-island="packages"]').scrollIntoViewIfNeeded();
  await hydrated(page, 'packages');
  await expect(page.getByRole('tablist', { name: 'Package' }).getByRole('tab')).toHaveCount(6);
  const typed = page.locator('#pk-panel .term-type').first();
  await expect(typed).toContainText('npx specdiff-cli');
  expect(await typed.evaluate((el) => getComputedStyle(el).animationName)).toBe('sdType');
  // FAQ, CTA and footer.
  const faq = page.getByRole('region', { name: 'Questions' });
  await expect(faq.locator('details')).toHaveCount(5);
  await faq.getByText('Is it really free?').click();
  await expect(faq.getByText(/open source under the MIT licence/)).toBeVisible();
  const cta = page.getByRole('region', { name: 'Compare your next release before your users do.' });
  await expect(cta.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', /\/app\/?$/);
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('WEB-02 "Try it with a sample" opens the app with the sample comparison loaded', async ({ page }) => {
  // On Netlify the app lives at /app on the same site. Locally the website (:4321) and the built app (:4173)
  // are two servers, so requests for /app/* on the website are answered by the app preview.
  await page.route(`${WEB}/app/**`, async (route) => {
    const res = await route.fetch({ url: route.request().url().replace(WEB, APP) });
    await route.fulfill({ response: res });
  });
  await page.goto(WEB + '/');
  await page.getByRole('link', { name: 'Try it with a sample' }).click();
  await expect(page).toHaveURL(`${WEB}/app/?sample=openapi`);
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
});

test('WEB-03 docs: getting started, one page per mode, review, packages, and a FAQ covering CORS, privacy and limits', async ({ page }) => {
  const docs: Array<[string, string]> = [
    ['/docs/', 'Getting started'],
    ['/docs/openapi/', 'Compare two OpenAPI specs'],
    ['/docs/json-yaml/', 'JSON and YAML'],
    ['/docs/markdown/', 'Markdown'],
    ['/docs/code/', 'Code (Beta)'],
    ['/docs/text/', 'Text'],
    ['/docs/review/', 'Review decisions'],
    ['/docs/packages/', 'Packages'],
  ];
  for (const [path, h1] of docs) {
    const res = await page.goto(WEB + path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(h1);
  }
  // Every mode page is reachable from the docs navigation.
  await page.goto(WEB + '/docs/');
  for (const path of ['/docs/openapi/', '/docs/json-yaml/', '/docs/markdown/', '/docs/code/', '/docs/text/', '/docs/review/', '/docs/packages/', '/docs/faq/'])
    await expect(page.locator(`nav a[href="${path}"]`).first(), path).toBeAttached();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(WEB + '/docs/faq/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FAQ');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Why did loading a URL fail?' })).toBeVisible();
  await expect(main).toContainText(/CORS/);
  await expect(main.getByRole('heading', { name: 'Are my files uploaded anywhere?' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'How large can a spec be?' })).toBeVisible();
  await expect(main).toContainText(/10 MB/);
  await expect(main).toContainText(/25 MB/);
  await expectAxeClean(page);
});

test('WEB-05 guides: embed, React, CLI with "use in any CI", pre-commit, Express/Fastify, Spring Boot', async ({ page }) => {
  const guides: Array<[string, string, Array<string | RegExp>]> = [
    ['/docs/embed/', 'Script tag', ['Specdiff.mount(']],
    ['/docs/react/', 'React', ['<SpecdiffViewer', '@specdiff/react']],
    ['/docs/cli/', 'CLI', ['npx specdiff-cli', '--ci', '--fail-on']],
    ['/docs/pre-commit/', 'Pre-commit hook', ['npx specdiff-cli pre-commit --fail-on breaking', '.pre-commit-config.yaml']],
    ['/docs/express-fastify/', 'Express and Fastify', ['@specdiff/express', '/docs', /fastify/i]],
    ['/docs/spring-boot/', 'Spring Boot', ['specdiff-spring-boot-starter', '/specdiff']],
  ];
  for (const [path, h1, needles] of guides) {
    await page.goto(WEB + path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(h1);
    for (const n of needles) await expect(page.locator('main'), `${path} ${n}`).toContainText(n);
  }
  await page.goto(WEB + '/docs/cli/');
  await expect(page.getByRole('heading', { name: 'Use in any CI' })).toBeVisible();
});

test('WEB-06 the changelog page lists releases and links its RSS feed', async ({ page, request }) => {
  await page.goto(WEB + '/changelog/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText('1.0.0');
  await expect(page.locator('main')).toContainText('0.9.0');
  const feed = await page.locator('link[rel=alternate][type="application/rss+xml"]').getAttribute('href');
  expect(feed).toBe('/changelog.xml');
  const res = await request.get(WEB + feed);
  expect(res.headers()['content-type']).toMatch(/xml/);
  expect(await res.text()).toMatch(/<item>[\s\S]*<title>Specdiff 1\.0\.0<\/title>/);
});

test('WEB-07 SEO: sitemap, canonical URLs, Open Graph image and tags, light/dark theme colours', async ({ page, request }) => {
  const index = await (await request.get(WEB + '/sitemap-index.xml')).text();
  const sub = /<loc>https:\/\/specdiff\.netlify\.app(\/sitemap-\d+\.xml)<\/loc>/.exec(index)?.[1];
  expect(sub).toBeTruthy();
  const locs = [...(await (await request.get(WEB + sub!)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  for (const p of ['/', '/docs/', '/docs/cli/', '/rules/', '/rules/endpoint-removed/', '/changelog/']) expect(locs, p).toContain(`https://specdiff.netlify.app${p}`);
  expect(locs.some((l) => l.includes('404'))).toBe(false);
  for (const path of ['/', '/rules/endpoint-removed/', '/changelog/']) {
    await page.goto(WEB + path);
    await expect(page.locator('link[rel=canonical]'), path).toHaveAttribute('href', `https://specdiff.netlify.app${path}`);
    await expect(page.locator('meta[property="og:url"]'), path).toHaveAttribute('content', `https://specdiff.netlify.app${path}`);
    const title = await page.title();
    expect(title.length, path).toBeGreaterThan(10);
    await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[property="og:description"]'), path).toHaveAttribute('content', /.{40,}/);
    await expect(page.locator('meta[name=description]'), path).toHaveAttribute('content', /.{40,}/);
    await expect(page.locator('meta[name="twitter:card"]'), path).toHaveAttribute('content', 'summary_large_image');
  }
  await expect(page.locator('link[rel=sitemap]')).toHaveAttribute('href', '/sitemap-index.xml');
  const og = await request.get(WEB + '/og.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/png');
  const theme = await page.locator('meta[name=theme-color]').evaluateAll((els) => els.map((e) => e.getAttribute('media')));
  expect(theme).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']);
  // The site follows the system colour scheme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(WEB + '/');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 13, 12)');
});

test('WEB-08 an unknown URL answers 404 with the 404 page and a way back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const res = await page.goto(WEB + '/no-such-page-xyz/');
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found · Specdiff');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('main').getByRole('link').first()).toBeVisible();
  await expect(page.locator('main a[href="/"]').first()).toBeAttached();
  await expectAxeClean(page);
});

test('WEB-09 motion: one load sequence, looping demo, loops pause off-screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(WEB + '/');
  // The hero entrance runs once.
  const hero = await page.locator('.hero-h1 .w').first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationIterationCount]);
  expect(hero[0]).not.toBe('none');
  expect(hero[1]).toBe('1');
  // The demo loops for ever and is running while on screen.
  const demo = page.getByRole('figure', { name: 'Live demo' });
  await expect.poll(() => demo.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length)).toBeGreaterThan(0);
  await expect(demo).not.toHaveClass(/is-paused/);
  // A loop below the fold is paused, and runs once it is scrolled into view.
  const cta = page.locator('section.cta-band');
  await expect(cta).toHaveClass(/is-paused/);
  expect(await cta.locator('.cta-mark .l').evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused');
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).not.toHaveClass(/is-paused/);
  await expect(demo).toHaveClass(/is-paused/);
  expect(await cta.locator('.cta-mark .l').evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('running');
});

test('WEB-09 all motion is off under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/', '/docs/', '/rules/']) {
    await page.goto(WEB + path);
    await expect(page.locator('h1')).toBeVisible();
    await page.locator('footer').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? a.id)), path).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------
// Viewer: an embed site on http://sd.test with a richer spec (two servers, four auth kinds, 262 operations)
// ---------------------------------------------------------------------------------------------

type Spec = Record<string, unknown>;
function auditSpec(ver: string): Spec {
  const v2 = ver !== '1.0.0';
  const paths: Record<string, unknown> = {};
  paths['/v1/widgets'] = {
    post: {
      operationId: 'createWidget', summary: 'Create a widget', description: 'Creates a widget with a name.', tags: ['widgets'], security: [{ apiKey: [] }],
      parameters: [{ name: 'X-Trace', in: 'header', description: 'Trace id', schema: { type: 'string' } }, { name: 'dry', in: 'query', description: 'Validate only', schema: { type: 'boolean' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' }, example: { name: 'w1', size: 3 } } } },
      responses: {
        '201': { description: 'Created', headers: { 'X-Rate-Limit': { description: 'Remaining calls', schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Widget' }, example: { id: 'w_1', name: 'w1', size: 3 } } } },
        '422': { description: 'Invalid widget' },
      },
    },
  };
  paths['/v1/old'] = { get: { operationId: 'getOld', summary: 'Old endpoint', tags: ['widgets'], ...(v2 ? { deprecated: true, 'x-sunset': '2027-03-01', description: 'Use GET /v1/widgets instead.' } : {}), responses: { '200': { description: 'ok' } } } };
  if (v2) paths['/v1/fresh'] = { get: { operationId: 'getFresh', summary: 'Fresh endpoint', tags: ['widgets'], responses: { '200': { description: 'ok' } } } };
  for (let i = 0; i < 260; i++) paths[`/v1/bulk/${i}`] = { get: { operationId: `bulk${i}`, summary: `Bulk op ${i}`, tags: [`tag${i % 13}`], security: [{ oauth: ['read'] }, { basic: [] }], responses: { '200': { description: 'ok' } } } };
  return {
    openapi: '3.1.0', info: { title: 'Audit API', version: ver, description: 'Audit fixture API' },
    servers: [{ url: 'https://api.audit.test' }, { url: 'https://sandbox.audit.test' }],
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        basic: { type: 'http', scheme: 'basic' },
        bearer: { type: 'http', scheme: 'bearer' },
        oauth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://auth.audit.test/token', scopes: { read: 'Read', write: 'Write' } } } },
      },
      schemas: { Widget: { type: 'object', required: ['name'], properties: { id: { type: 'string', readOnly: true }, name: { type: 'string', maxLength: 40, description: 'Widget name' }, size: { type: 'integer', minimum: 1 }, ...(v2 ? {} : { colour: { type: 'string' } }), ...(v2 ? { weight: { type: 'number', deprecated: true } } : {}) } } },
    },
  };
}
const LOGO = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%237a2bd1%22/%3E%3C/svg%3E';

/** Serve the repository on http://sd.test, plus `/` = a page that calls Specdiff.mount(opts) and the given specs. */
async function embedSite(page: Page, opts: Record<string, unknown> = { url: '/v2.json', compareWith: '/v1.json', theme: 'light' }, specs: Record<string, Spec> = { '/v1.json': auditSpec('1.0.0'), '/v2.json': auditSpec('2.0.0') }) {
  const requested: string[] = [];
  await page.route(`${SD}/**`, async (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    requested.push(p);
    if (p === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Embed</title><link rel="stylesheet" href="/packages/embed/dist/specdiff-embed.css"></head><body><div id="v"></div><script src="/packages/embed/dist/specdiff-embed.js"></script><script>window.__m = Specdiff.mount(document.getElementById('v'), ${JSON.stringify(opts)});</script></body></html>`,
      });
    }
    if (specs[p]) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(specs[p]) });
    const f = join(ROOT, p);
    if (f.startsWith(ROOT) && existsSync(f) && statSync(f).isFile()) return route.fulfill({ path: f });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  return requested;
}
const openEmbed = async (page: Page, hash = '') => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${SD}/${hash}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};
const ready = async (page: Page, url: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};

test('VW-01 overview: info, servers, auth, endpoints by tag with badges, a route per operation and schema, near-viewport rendering, CSS-variable theme', async ({ page }) => {
  await embedSite(page);
  await openEmbed(page);
  const main = page.locator('main');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit API' })).toBeVisible();
  await expect(main).toContainText('Audit fixture API');
  await expect(main).toContainText('https://api.audit.test');
  await expect(main).toContainText('https://sandbox.audit.test');
  for (const a of ['API key', 'Basic', 'Bearer', 'OAuth2']) await expect(main, a).toContainText(a);
  const widgets = page.getByRole('region', { name: 'widgets' });
  await expect(widgets.getByRole('link', { name: /GET \/v1\/fresh .*New/ })).toBeVisible();
  await expect(widgets.getByRole('link', { name: /GET \/v1\/old .*Deprecated/ })).toBeVisible();
  // Only what is near the viewport is rendered: the 262-operation nav is virtualised, the sections skip rendering off-screen.
  const navLinks = await page.getByRole('navigation', { name: 'API reference' }).getByRole('link').count();
  expect(navLinks).toBeGreaterThan(5);
  expect(navLinks).toBeLessThan(120);
  const lazy = await page.locator('main section').evaluateAll((els) => els.filter((e) => getComputedStyle(e).contentVisibility === 'auto').length);
  expect(lazy).toBeGreaterThan(5);
  // A route per operation and per schema.
  await widgets.getByRole('link', { name: /POST \/v1\/widgets/ }).click();
  await expect(page).toHaveURL(/#\/op\/post-v1-widgets$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create a widget' })).toBeVisible();
  await page.goto(`${SD}/#/schema/widget`);
  await expect(page.getByRole('heading', { level: 1, name: 'Widget' })).toBeVisible();
  // CSS-variable theming: the theme switches the --sd-* tokens.
  const surface = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-theme]')!).getPropertyValue('--sd-surface').trim());
  const light = await surface();
  await page.evaluate(() => { (window as unknown as { __m: { unmount(): void } }).__m.unmount(); (window as unknown as { __m: unknown }).__m = (window as unknown as { Specdiff: { mount: (e: Element, o: object) => unknown } }).Specdiff.mount(document.getElementById('v')!, { url: '/v2.json', compareWith: '/v1.json', theme: 'dark' }); });
  await expect(page.locator('[data-theme="dark"]').first()).toBeAttached();
  expect(await surface()).not.toBe(light);
  await expectAxeClean(page);
});

test('VW-01 inside the app: More › Open in Viewer shows the compared spec', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(APP + '/app/?sample=openapi');
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^More/ }).first().click();
  await page.getByRole('menuitem', { name: 'Open in Viewer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
});

test('VW-02 endpoint page: description, parameters, headers, body, responses, examples; deprecated with sunset date and migration', async ({ page }) => {
  await embedSite(page);
  await openEmbed(page, '#/op/post-v1-widgets');
  const main = page.locator('main');
  await expect(main).toContainText('Creates a widget with a name.');
  for (const t of ['dry', 'Validate only', 'X-Trace', 'Request body', 'name', 'size', '201', 'Created', '422', 'Invalid widget']) await expect(main, t).toContainText(t);
  await main.getByText('X-Rate-Limit', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => undefined);
  // Response headers sit in a disclosure.
  const hdr = main.locator('details', { hasText: 'X-Rate-Limit' }).first();
  await hdr.locator('summary').click();
  await expect(hdr).toContainText('Remaining calls');
  // Response example.
  await expect(page.getByText(/"id":\s*"w_1"/).first()).toBeVisible();
  // Deprecated with sunset and migration.
  await page.goto(`${SD}/#/op/get-v1-old`);
  const note = page.getByRole('note');
  await expect(note).toContainText('Deprecated. Stops working on 1 March 2027.');
  await expect(note).toContainText('Use GET /v1/widgets instead.');
  await expect(page.getByText('Migrate to the replacement')).toBeVisible();
  await expectAxeClean(page);
});

test('VW-03 schema page: fields, types, constraints, removed fields struck through, "used in"', async ({ page }) => {
  await embedSite(page);
  await openEmbed(page, '#/schema/widget');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { level: 1, name: 'Widget' })).toBeVisible();
  for (const t of ['name', 'string', 'size', 'integer', 'weight', 'number', 'Widget name']) await expect(main, t).toContainText(t);
  await expect(main).toContainText(/Max(imum)? length 40|maxLength 40|≤ 40 char/i);
  await expect(main).toContainText(/Minimum 1|≥ 1/);
  await expect(main.locator('del', { hasText: 'colour' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Used in' })).toBeVisible();
  const used = page.locator('main li').filter({ has: page.getByRole('link', { name: '/v1/widgets', exact: true }) });
  await expect(used.first()).toContainText(/POST\s*\/v1\/widgets/);
  await used.first().getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create a widget' })).toBeVisible();
  await expectAxeClean(page);
});

test('VW-03 a removed field is listed once on the schema page', async ({ page }) => {
  // Was a defect (listed twice: once per request/response change); fixed in change-index.ts.
  await embedSite(page);
  await openEmbed(page, '#/schema/widget');
  await expect(page.locator('main del', { hasText: 'colour' }).first()).toBeVisible();
  await expect(page.locator('main del', { hasText: 'colour' })).toHaveCount(1, { timeout: 3000 });
});

test('VW-04 search finds endpoints, fields, parameters, response codes and descriptions', async ({ page }) => {
  await embedSite(page);
  await openEmbed(page);
  const cases: Array<[string, RegExp]> = [
    ['Create a widget', /POST|Endpoint/i],
    ['Widget name', /Field/i],
    ['dry', /Parameter/i],
    ['422', /Response/i],
    ['Creates a widget with', /Create a widget/],
  ];
  for (const [q, kind] of cases) {
    await page.keyboard.press('/');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await dialog.getByRole('combobox').fill(q);
    await expect(dialog.getByRole('option').first(), q).toBeVisible();
    await expect(dialog.getByRole('option').filter({ hasText: kind }).first(), q).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('VW-05 Try it: form and JSON, servers, API key / bearer / basic / OAuth2, schema check, tokens in memory unless "remember"', async ({ page }) => {
  let last: { url: string; headers: Record<string, string>; body: string | null } = { url: '', headers: {}, body: null };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('https://auth.audit.test/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ access_token: 'tok_cc', token_type: 'bearer' }) }));
  for (const host of ['api', 'sandbox'])
    await page.route(`https://${host}.audit.test/**`, (r) => {
      if (r.request().method() !== 'OPTIONS') last = { url: r.request().url(), headers: r.request().headers(), body: r.request().postData() };
      return r.fulfill({ status: 201, contentType: 'application/json', headers: cors, body: JSON.stringify({ id: 'x', name: 5 }) });
    });
  await embedSite(page);
  await openEmbed(page, '#/op/post-v1-widgets');
  await page.getByRole('button', { name: 'Try it' }).click();
  const panel = page.getByRole('region', { name: 'Try it' });
  // Form editor.
  await panel.getByLabel('name', { exact: true }).fill('w1');
  await panel.getByLabel('size', { exact: true }).fill('3');
  const auth: Array<[string, (d: ReturnType<Page['getByRole']>) => Promise<void>, (h: Record<string, string>) => void]> = [
    ['API key', (d) => d.getByLabel('API key', { exact: true }).fill('k_123'), (h) => expect(h['x-api-key']).toBe('k_123')],
    ['Bearer', (d) => d.getByLabel('Token').fill('b_123'), (h) => expect(h.authorization).toBe('Bearer b_123')],
    ['Basic', async (d) => { await d.getByLabel('Username').fill('u'); await d.getByLabel('Password').fill('p'); }, (h) => expect(h.authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`)],
    ['OAuth2', async (d) => { await d.getByLabel('Client ID').fill('cid'); await d.getByLabel('Client secret').fill('sec'); }, (h) => expect(h.authorization).toBe('Bearer tok_cc')],
  ];
  for (const [kind, fill, check] of auth) {
    await panel.getByRole('button', { name: /^(Add|Change)$/ }).click();
    const d = page.getByRole('dialog', { name: 'Authentication' });
    await d.getByRole('radio', { name: kind, exact: true }).click();
    await fill(d);
    await d.getByRole('button', { name: /^(Save|Get token)/ }).click();
    await expect(d).toBeHidden();
    await expect(panel).toContainText('kept in this tab only');
    last = { url: '', headers: {}, body: null };
    await panel.getByRole('button', { name: 'Send request' }).click();
    await expect.poll(() => last.url, kind).toMatch(/^https:\/\/api\.audit\.test\/v1\/widgets/);
    check(last.headers);
    expect(JSON.parse(last.body ?? '{}')).toMatchObject({ name: 'w1', size: 3 });
    expect(await page.evaluate(() => localStorage.length), kind).toBe(0);
  }
  // Response viewer with a schema check: name came back as a number.
  const response = page.getByRole('region', { name: 'Response', exact: true });
  await expect(response).toContainText('201');
  await expect(response).toContainText(/\$\.name: expected string, got integer/);
  // JSON editor.
  await panel.getByRole('radio', { name: 'JSON', exact: true }).click();
  const json = panel.getByRole('textbox', { name: 'Request body' });
  expect(JSON.parse(await json.inputValue())).toMatchObject({ name: 'w1', size: 3 });
  await json.fill('{"name":"from-json","size":9}');
  // Server picker.
  await panel.getByLabel('Server').selectOption('https://sandbox.audit.test');
  await panel.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => last.url).toMatch(/^https:\/\/sandbox\.audit\.test\/v1\/widgets/);
  expect(JSON.parse(last.body ?? '{}')).toEqual({ name: 'from-json', size: 9 });
  // "Remember in this browser" is the only thing that writes the token to storage.
  await panel.getByRole('button', { name: 'Change' }).click();
  const d = page.getByRole('dialog', { name: 'Authentication' });
  await d.getByRole('radio', { name: 'Bearer', exact: true }).click();
  await d.getByLabel('Token').fill('remember_me');
  await d.getByRole('checkbox', { name: 'Remember in this browser' }).click();
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(panel).toContainText('remembered in this browser');
  const stored = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join('\n'));
  expect(stored).toContain('remember_me');
});

test('VW-06 code samples: curl, JavaScript (fetch), Python (requests), Java (HttpClient)', async ({ page }) => {
  await ready(page, `${H}#/op/post-v1-payments`);
  const tabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'curl' }) });
  await expect(tabs.getByRole('tab')).toHaveText(['curl', 'JavaScript', 'Python', 'Java']);
  const expected: Record<string, RegExp> = { curl: /curl -X POST 'https:\/\/api\.example\.com\/v1\/payments'/, JavaScript: /fetch\(/, Python: /import requests[\s\S]*requests\.request\("POST"/, Java: /HttpClient/ };
  for (const [tab, re] of Object.entries(expected)) {
    await tabs.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tabpanel').filter({ hasText: re }), tab).toBeVisible();
  }
});

test('VW-07 version timeline: load a third version, pick it, compare any two', async ({ page }) => {
  await embedSite(page);
  await openEmbed(page);
  const v3 = auditSpec('3.0.0');
  delete (v3.paths as Record<string, unknown>)['/v1/old'];
  await page.locator('input[type=file]').first().setInputFiles({ name: 'v3.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v3)) });
  const version = page.getByRole('combobox', { name: 'Version', exact: true });
  await expect(version.locator('option')).toHaveText([/3\.0\.0/, /2\.0\.0/, /1\.0\.0/, /Add a version/]);
  await version.selectOption('3.0.0');
  const compared = page.getByRole('combobox', { name: 'Compared with' });
  await compared.selectOption('1.0.0');
  await expect(page.getByRole('region', { name: 'Since 1.0.0' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Removed GET /v1/old');
  await compared.selectOption('2.0.0');
  await expect(page.getByRole('region', { name: 'Since 2.0.0' })).toBeVisible();
  await page.goto(`${SD}/#/changes`);
  await expect(page.getByRole('heading', { level: 1, name: 'What changed' })).toBeVisible();
});

test('VW-08 badges: New, Changed, Breaking, Deprecated on endpoints and on fields', async ({ page }) => {
  await ready(page, H);
  for (const re of [/^POST \/v1\/payments .*Breaking/, /^POST \/v1\/refunds .*Changed/, /^POST \/v1\/payouts .*New/, /^GET \/v1\/refunds\/\{id\} .*Deprecated/])
    await expect(page.locator('main').getByRole('link', { name: re }).first(), String(re)).toBeVisible();
  // Fields.
  await embedSite(page);
  await openEmbed(page, '#/schema/widget');
  // A field row's text starts with its name and type (class names are minified in the embed build).
  const field = (name: string) => page.locator('main li').filter({ hasText: new RegExp(`^${name}(string|number|integer|object|boolean|array)`) }).first();
  const weight = field('weight');
  await expect(weight).toContainText('New');
  await expect(weight).toContainText('Deprecated');
  await ready(page, `${H}#/op/post-v1-payments`);
  const currency = field('currency');
  await expect(currency).toContainText('Changed');
  await embedSite(page);
  await openEmbed(page, '#/schema/widget');
  await expect(field('colour')).toContainText('Breaking');
});

test('VW-12 deep links survive a reload; dark theme; brand colour and logo for embeds', async ({ page }) => {
  await embedSite(page, { url: '/v2.json', compareWith: '/v1.json', theme: 'dark', brand: { name: 'Zeta', color: '#7a2bd1', logo: LOGO } });
  await openEmbed(page, '#/op/post-v1-widgets');
  await expect(page.getByRole('heading', { level: 1, name: 'Create a widget' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Create a widget' })).toBeVisible();
  await expect(page.locator('[data-theme="dark"]').first()).toBeAttached();
  const brand = await page.evaluate(() => getComputedStyle(document.querySelector('[data-theme]')!).getPropertyValue('--sd-brand').trim().toLowerCase());
  expect(brand).toBe('#7a2bd1');
  await expect(page.locator('header img').first()).toHaveAttribute('src', LOGO);
  await expect(page.getByText('Zeta · Audit API')).toBeVisible();
  // Navigating updates the hash, so the address can be shared.
  await page.goto(`${SD}/#/schema/widget`);
  await expect(page.getByRole('heading', { level: 1, name: 'Widget' })).toBeVisible();
  await expectAxeClean(page);
});

test('VW-13 a blocked request offers a user-supplied CORS proxy, and the retry goes through it', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(H)) external.push(r.url()); });
  await page.route('https://api.example.com/**', (r) => r.abort('failed'));
  let proxied = '';
  await page.route('https://proxy.test/**', (r) => { proxied = r.request().url(); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [], has_more: false }) }); });
  await ready(page, `${H}#/op/get-v1-payments`);
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { name: 'The browser blocked this request' })).toBeVisible();
  await page.getByLabel('CORS proxy URL').fill('https://proxy.test/?url={url}');
  await page.getByRole('button', { name: 'Retry with proxy' }).click();
  await expect(page.getByRole('region', { name: 'Response', exact: true }).getByText('200 OK')).toBeVisible();
  expect(proxied).toBe(`https://proxy.test/?url=${encodeURIComponent('https://api.example.com/v1/payments')}${proxied.includes('%3F') ? proxied.slice(proxied.indexOf('%3F')) : ''}`);
  // Specdiff hosts no proxy: the only hosts contacted are the API and the proxy the user typed.
  expect([...new Set(external.map((u) => new URL(u).host))].sort()).toEqual(['api.example.com', 'proxy.test']);
});

test('VW-14 "Copy for LLM" on every Viewer page puts that page on the clipboard as Markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5174' });
  const pages: Array<[string, RegExp]> = [
    ['', /^# Payments API/m],
    ['#/op/post-v1-payments', /POST \/v1\/payments/],
    ['#/schema/card', /^#+ .*Card/m],
    ['#/changes', /^# Changes from 1\.5\.0 to 2\.0\.0/m],
  ];
  for (const [hash, re] of pages) {
    await ready(page, H + hash);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.getByRole('button', { name: 'Copy for LLM' }).first().click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), hash || '#/').toMatch(re);
  }
  // Endpoint text is Markdown, not HTML.
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).not.toMatch(/<\w+[^>]*>/);
});

test('VW-14 "Copy for LLM" on the Authentication page copies that page', async ({ page, context }) => {
  // Was a defect (copied the overview); fixed: authMarkdown.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5174' });
  await ready(page, `${H}#/auth`);
  await expect(page.getByRole('heading', { level: 1, name: 'Authentication' })).toBeVisible();
  await expect(page.locator('main').first()).toContainText('bearerAuth');
  await page.getByRole('button', { name: 'Copy for LLM' }).first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 3000 }).toMatch(/bearerAuth|Bearer token/);
});

// ---------------------------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------------------------

test('PK-01 @specdiff/core runs in plain Node with no DOM: parse, normalise, diff engines, rules, changelog', () => {
  const core = pathToFileURL(resolve('packages/core/dist/index.js')).href;
  const sub = (s: string) => JSON.stringify(pathToFileURL(resolve(`packages/core/dist/${s}.js`)).href);
  const script = `
    import * as c from ${JSON.stringify(core)};
    import { diffText } from ${sub('text')}; import { diffJson } from ${sub('json')}; import { diffMarkdown } from ${sub('markdown')};
    import { readFileSync } from 'node:fs';
    if (typeof document !== 'undefined' || typeof window !== 'undefined') throw new Error('DOM present');
    const v1 = { name: 'v1.yaml', content: readFileSync(${JSON.stringify(fx('payments-v1.yaml'))}, 'utf8') };
    const v2 = { name: 'v2.yaml', content: readFileSync(${JSON.stringify(fx('payments-v2.yaml'))}, 'utf8') };
    const r = c.compareOpenApi(v1, v2);
    const again = c.compareOpenApi(v1, v2);
    const parsed = c.parseDocument(v1.content, 'v1.yaml');
    const swagger = c.upgradeSpec(JSON.parse(readFileSync(${JSON.stringify(resolve('fixtures/specs/petstore-swagger2.json'))}, 'utf8')));
    console.log(JSON.stringify({
      summary: r.summary, version: r.versionCheck.suggested, same: JSON.stringify(r) === JSON.stringify(again),
      parsedTitle: parsed.value.info.title, upgraded: swagger.openapi, rules: c.rules.length,
      changelog: c.buildChangelog(r, 'keep-a-changelog').split('\\n')[0],
      text: diffText('a\\nb\\n', 'a\\nc\\n', { ignoreWhitespace: false, ignoreCase: false, ignoreLineEndings: true, precision: 'word', filters: [], transforms: [] }).stats,
      json: diffJson({ a: 1 }, { a: 2 }, c.Config.parse({}).json).changes.length,
      md: diffMarkdown('# T\\n\\nhello\\n', '# T\\n\\nhello world\\n').stats,
    }));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const out = JSON.parse(run.stdout) as Record<string, unknown>;
  expect(out.summary).toMatchObject({ breaking: 4, possibly: 1, safe: 14, docs: 9 });
  expect(out.version).toBe('2.0.0');
  expect(out.same).toBe(true);
  expect(out.parsedTitle).toBe('Payments API');
  expect(String(out.upgraded)).toMatch(/^3\./);
  expect(out.rules).toBeGreaterThan(50);
  expect(out.changelog).toBe('## [2.0.0]');
  expect(out.text).toEqual({ added: 0, removed: 0, changed: 1 });
  expect(out.json).toBe(1);
  expect(out.md).toBeTruthy();
});

test('PK-02 the embed example page mounts the Viewer from the script build', async ({ page }) => {
  const requested = await embedSite(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${SD}/examples/embed/index.html`);
  await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
  expect(requested).toContain('/packages/embed/dist/specdiff-embed.js');
  expect(requested).toContain('/packages/embed/dist/specdiff-compare.js');
  expect(errors).toEqual([]);
  await expectAxeClean(page);
});

test('PK-02 Specdiff.mount options: url, compareWith, mode, theme, brand', async ({ page }) => {
  // Without compareWith the comparison chunk is never loaded.
  let requested = await embedSite(page, { url: '/v2.json' });
  await openEmbed(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Audit API' })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Since / })).toHaveCount(0);
  expect(requested).not.toContain('/packages/embed/dist/specdiff-compare.js');
  await page.unrouteAll();
  requested = await embedSite(page, { url: '/v2.json', compareWith: '/v1.json', mode: 'changes', theme: 'dark', brand: { name: 'Acme', color: '#1f55c4' } });
  await page.goto(`${SD}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'What changed' })).toBeVisible();
  await expect(page).toHaveURL(/#\/changes$/);
  await expect(page.locator('[data-theme="dark"]').first()).toBeAttached();
  await expect(page.getByText('Acme · Audit API')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-theme]')!).getPropertyValue('--sd-brand').trim().toLowerCase())).toBe('#1f55c4');
  expect(requested).toContain('/packages/embed/dist/specdiff-compare.js');
  // unmount() removes it.
  await page.evaluate(() => (window as unknown as { __m: { unmount(): void } }).__m.unmount());
  await expect(page.locator('#v')).toBeEmpty();
});

const reactHarness = async (page: Page, query = '') => {
  const main = `/@fs${encodeURI(resolve('packages/react/harness/main.tsx'))}`;
  await page.route(`${H}react-harness.html*`, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>React harness</title></head><body><div id="root"></div><script type="module" src="${main}"></script></body></html>` }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${H}react-harness.html${query}`);
};

test('PK-03 <SpecdiffViewer url compareWith> renders the Viewer with the comparison in React', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await reactHarness(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible({ timeout: 30_000 });
  const since = page.getByRole('region', { name: 'Since 1.5.0' });
  await expect(since.locator('p').first()).toContainText(/Breaking\s*4(?!\d)/);
  await page.getByRole('navigation', { name: 'API reference' }).getByRole('link', { name: /Create a payment/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create a payment in any supported currency' })).toBeVisible();
  expect(errors).toEqual([]);
  await expectAxeClean(page);
});

test('PK-03 <SpecdiffDiff before after> renders a marked side-by-side diff in React', async ({ page }) => {
  await reactHarness(page, '?part=diff');
  const table = page.getByRole('table', { name: 'Sample diff' });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('+1 added · −0 removed · ~1 changed')).toBeVisible();
  await expect(table.locator('ins', { hasText: 'two' })).toBeVisible();
  await expect(table).toContainText('delta');
  await expect(table).toContainText('~');
  await expectAxeClean(page);
});

function gitRepo(): { dir: string; git: (...a: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-cov-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  copyFileSync(fx('payments-v1.yaml'), join(dir, 'openapi.yaml'));
  git('add', '.');
  git('commit', '-qm', 'v1');
  git('tag', 'v1.5.0');
  copyFileSync(fx('payments-v2.yaml'), join(dir, 'openapi.yaml'));
  return { dir, git };
}
const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('PK-04 `specdiff old new` without --ci opens the local UI with both files loaded', async ({ page }) => {
  const port = await freePort();
  const { proc, log } = await startProcess(process.execPath, [CLI, fx('payments-v1.yaml'), fx('payments-v2.yaml'), '--no-open', '--port', String(port)], /is running at/);
  try {
    const url = /is running at (\S+)/.exec(log())![1]!;
    expect(url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/app/\\?local=[0-9a-f]{32}$`));
    await page.goto(url);
    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Breaking: 4' })).toBeVisible();
  } finally {
    stop(proc);
  }
});

test('PK-04 --ci: --fail-on possibly / missing-version-bump, --format md, .specdiff.yaml', () => {
  const { dir } = gitRepo();
  // md is the default format.
  const md = cli(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci', '--fail-on', 'none');
  expect(md.status).toBe(0);
  expect(md.stdout).toMatch(/^#/m);
  expect(md.stdout).toContain('`POST /v1/payments` now requires `currency`');
  // --fail-on possibly: a possibly-breaking-only change passes the default gate and fails this one.
  const rule = resolve('fixtures/rules/request-param-pattern-changed');
  expect(cli(dir, join(rule, 'before.yaml'), join(rule, 'after.yaml'), '--ci').status).toBe(0);
  expect(cli(dir, join(rule, 'before.yaml'), join(rule, 'after.yaml'), '--ci', '--fail-on', 'possibly').status).toBe(1);
  // --fail-on missing-version-bump: breaking changes with info.version left at 1.5.0.
  writeFileSync(join(dir, 'same-version.yaml'), readFileSync(fx('payments-v2.yaml'), 'utf8').replace(/^(\s*version:\s*)['"]?2\.0\.0['"]?/m, '$11.5.0'));
  const bump = cli(dir, fx('payments-v1.yaml'), 'same-version.yaml', '--ci', '--fail-on', 'missing-version-bump');
  expect(bump.status).toBe(1);
  expect(bump.stderr + bump.stdout).toContain('use 2.0.0');
  expect(cli(dir, fx('payments-v1.yaml'), fx('payments-v2.yaml'), '--ci', '--fail-on', 'missing-version-bump').status).toBe(0);
  // .specdiff.yaml is read: endpoint-removed downgraded to safe leaves 3 breaking.
  writeFileSync(join(dir, '.specdiff.yaml'), 'version: 1\nrules:\n  endpoint-removed:\n    severity: safe\n');
  const cfg = cli(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci');
  expect(cfg.stderr).toMatch(/✖ 3 breaking/);
  writeFileSync(join(dir, '.specdiff.yaml'), 'version: 1\nfailOn: none\n');
  expect(cli(dir, 'main:openapi.yaml', 'openapi.yaml', '--ci').status).toBe(0);
});

test('PK-04 `specdiff history <file>` walks git history into a Viewer version set', () => {
  const { dir, git } = gitRepo();
  git('commit', '-qam', 'v2');
  git('tag', 'v2.0.0');
  const r = cli(dir, 'history', 'openapi.yaml', '--out', 'versions.json');
  expect(r.status, r.stderr).toBe(0);
  const set = JSON.parse(readFileSync(join(dir, 'versions.json'), 'utf8')) as { versions: Array<{ label: string }>; current: string };
  expect(set.versions.map((v) => v.label)).toEqual(expect.arrayContaining(['1.5.0', '2.0.0']));
  expect(set.current).toBe('2.0.0');
});

async function startExpressLike(script: string[]): Promise<{ proc: ChildProcess; base: string }> {
  if (!existsSync(resolve('packages/embed/dist/specdiff-embed.js'))) execFileSync('pnpm', ['--filter', '@specdiff/embed', 'build'], { cwd: ROOT, stdio: 'inherit' });
  const port = await freePort();
  const { proc } = await startProcess(process.execPath, script, /Specdiff Viewer at/, { PORT: String(port) });
  return { proc, base: `http://127.0.0.1:${port}` };
}

test('PK-06 Fastify example: the specdiffFastify plugin serves the Viewer at /docs', async ({ page, request }) => {
  const { proc, base } = await startExpressLike(['examples/express/fastify.mjs']);
  try {
    expect(await (await request.get(`${base}/docs/config.json`)).json()).toMatchObject({ url: 'openapi.yaml', compareWith: 'openapi-previous.yaml' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/docs/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
    await expectAxeClean(page);
  } finally {
    stop(proc);
  }
});

test('PK-06 real Express: app.use("/docs", specdiff()) serves the Viewer', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'specdiff-express-'));
  const file = join(dir, 'app.mjs');
  writeFileSync(file, `
    import { createRequire } from 'node:module';
    import { specdiff } from ${JSON.stringify(pathToFileURL(resolve('packages/express/src/index.ts')).href)};
    const require = createRequire(${JSON.stringify(resolve('packages/express/package.json'))});
    const express = require('express');
    const app = express();
    app.use('/docs', specdiff({ spec: ${JSON.stringify(fx('payments-v2.yaml'))}, compareWith: ${JSON.stringify(fx('payments-v1.yaml'))}, title: 'Payments API', assetsDir: ${JSON.stringify(resolve('packages/embed/dist'))} }));
    const s = app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('Specdiff Viewer at ' + s.address().port));
  `);
  const { proc, base } = await startExpressLike([file]);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/docs`);
    await expect(page).toHaveURL(`${base}/docs/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Payments API' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Since 1.5.0' })).toBeVisible();
  } finally {
    stop(proc);
  }
});

test('PK-07 Spring Boot example: the starter serves the Viewer at /specdiff and renders the app\'s own OpenAPI document', async ({ page }) => {
  test.setTimeout(180_000);
  const classes = resolve('examples/spring-boot/target/classes');
  const hasJava = spawnSync('java', ['-version']).status === 0 && spawnSync('mvn', ['-v']).status === 0;
  test.skip(!hasJava || !existsSync(classes), 'needs java, mvn, and `mvn -f examples/spring-boot/pom.xml test` run first');
  const cpFile = join(mkdtempSync(join(tmpdir(), 'specdiff-sb-')), 'cp.txt');
  execFileSync('mvn', ['-B', '-q', '-o', '-f', 'examples/spring-boot/pom.xml', 'dependency:build-classpath', `-Dmdep.outputFile=${cpFile}`, '-Dmdep.includeScope=runtime'], { cwd: ROOT, stdio: 'ignore' });
  const port = await freePort();
  const { proc } = await startProcess('java', ['-cp', `${classes}:${readFileSync(cpFile, 'utf8').trim()}`, 'example.PaymentsApp', `--server.port=${port}`], /Started PaymentsApp/, {}, 120_000);
  try {
    const base = `http://127.0.0.1:${port}`;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/specdiff`);
    await expect(page).toHaveURL(`${base}/specdiff/`);
    // The Viewer reads /v3/api-docs (springdoc) on its own: the operations come from the Java controller.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    const nav = page.getByRole('navigation', { name: 'API reference' });
    await expect(nav).toContainText('/v1/payments');
    await expect(page.locator('main')).toContainText(/POST\s*\/v1\/payments/);
    await expectAxeClean(page);
  } finally {
    stop(proc);
  }
});

test('PK-08 the built app is installable: manifest, icons, scope, service worker', async ({ page, request }) => {
  await page.goto(APP + '/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href!, APP + '/app/').href)).json() as { display: string; scope: string; start_url: string; name: string; icons: Array<{ sizes: string }> };
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/app/');
  expect(manifest.start_url).toMatch(/^\/app\//);
  expect(manifest.name).toMatch(/Specdiff/);
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
});

test('PK-09 git diff driver: configured in a real repo, git log -p --ext-diff and git diff show the semantic changelog', () => {
  const { dir, git } = gitRepo();
  writeFileSync(join(dir, '.gitattributes'), 'openapi.yaml diff=specdiff\n');
  git('config', 'diff.specdiff.command', `"${process.execPath}" "${CLI}" git-diff-driver`);
  const wt = git('diff');
  expect(wt).toMatch(/! 4 breaking/);
  git('add', '.');
  git('commit', '-qm', 'v2');
  const log = git('log', '-p', '--ext-diff', '-1');
  expect(log).toMatch(/! 4 breaking\s+\? 1 possibly\s+\+ 14 safe\s+¶ 9 docs only/);
  expect(log).toContain('suggested 2.0.0');
  expect(log).not.toMatch(/^\+\s+currency:/m); // the semantic view, not the line diff
});
