// Website (P5.1/P5.2): W-01 Home v2, W-02 Docs, W-03 Rules, W-04 Rule detail, W-06 Changelog, W-08 404.
// The website runs on its own server (playwright.config.ts), so every URL here is absolute.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  await expect(page.locator('#pk-panel')).toContainText('entry: npx specdiff-cli pre-commit --fail-on breaking');
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

/** Every built HTML file under apps/website/dist. */
function builtPages(): string[] {
  const root = join(process.cwd(), 'apps/website/dist');
  return (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.html')).map((f) => join(root, f));
}

test('no built page shows an unfilled template placeholder (WEB-04)', () => {
  const files = builtPages();
  expect(files.length).toBeGreaterThan(80);
  const hits: string[] = [];
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const rel = f.split('/dist/')[1]!;
    // Docs pages show TX-08 masked text (‹name›, ‹time›) on purpose; rule pages never show a ‹word›.
    // `{id}` in a path is a real path parameter, so only core's template keys count.
    const re = rel.startsWith('rules/') ? /‹\w+›|\{(?:op|target|before|after|where)\}/g : /‹(?:operation|target|before|after|where)›|\{(?:op|target|before|after|where)\}/g;
    for (const m of html.matchAll(re)) hits.push(`${rel}: ${m[0]}`);
  }
  expect(hits).toEqual([]);
});

test('rule detail fills who/avoid and the example line from the fixture (WEB-04)', async ({ page }) => {
  await page.goto(WEB + '/rules/request-property-became-required/');
  const body = page.locator('.rule-body');
  await expect(body.locator('#who + p')).toContainText('POST /a');
  await expect(body.locator('#who + p code').first()).toBeVisible();
  await expect(body.locator('pre').last()).toContainText('`POST /a` now requires `name`');
  for (const p of await body.locator('.p-doc').allTextContents()) expect(p).not.toContain('`');
});

test('docs severity cards show their symbol in the badge colour, not grey (W-02, rule 4)', async ({ page }) => {
  await page.goto(WEB + '/docs/openapi/');
  const sym = page.locator('.sev-grid .sev-breaking .sev-sym');
  const [fg, bg] = await sym.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.parentElement!).backgroundColor]);
  expect(fg).toBe(bg); // symbol is drawn in the pill tint on the solid disc
});

test('titled code fences render a file-name header with a copy button (W-02)', async ({ page }) => {
  await page.goto(WEB + '/docs/openapi/');
  const head = page.locator('.codecard-head', { hasText: '.specdiff/decisions.json' });
  await expect(head).toBeVisible();
  await expect(head.getByRole('button', { name: 'Copy .specdiff/decisions.json' })).toHaveAttribute('data-copy', /"decisions"/);
});

for (const width of [1440, 390]) {
  test(`hero npx command is shown in full at ${width}${width === 390 ? ' @phone' : ''}`, async ({ page }, info) => {
    test.skip(info.project.name !== (width === 390 ? 'phone' : 'desktop'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(WEB + '/');
    const code = page.locator('.hero .cmd code');
    await expect(code).toHaveText(/npx specdiff-cli old\.yaml new\.yaml/);
    const [sw, cw] = await code.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
  });
}

test('rules table keeps rule ids whole: they wrap only at hyphens @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto(WEB + '/rules/');
  const first = page.locator('.rules-table tbody td:first-child').first();
  expect((await first.boundingBox())!.width).toBeGreaterThanOrEqual(220);
  // Every rendered line of every id ends at a hyphen or at the end of the id.
  const broken = await page.locator('.rule-id').evaluateAll((els) =>
    els.flatMap((el) => {
      const text = el.textContent ?? '';
      const node = el.firstChild!;
      const range = document.createRange();
      const out: string[] = [];
      let lastTop = -1;
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const top = range.getClientRects()[0]?.top ?? lastTop;
        if (lastTop >= 0 && top > lastTop + 2 && text[i - 1] !== '-') out.push(`${text} @${i}`);
        lastTop = top;
      }
      return out;
    }),
  );
  expect(broken).toEqual([]);
});

test('changelog: the Latest bar spans the version column (W-06)', async ({ page }) => {
  await page.goto(WEB + '/changelog/');
  const w = (await page.locator('.latest').boundingBox())!.width;
  expect(w).toBeGreaterThanOrEqual(180);
});

test('package terminal: the typed command is not clipped under the cursor @phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(WEB + '/');
  const sizes = await page.locator('#pk-panel .term-type').evaluateAll((els) => els.map((el) => [el.scrollWidth, el.clientWidth]));
  expect(sizes.length).toBeGreaterThan(0);
  for (const [sw, cw] of sizes) expect(sw).toBeLessThanOrEqual(cw!);
});

test('pre-commit snippets use `specdiff-cli pre-commit` and pass file names (PK-10)', async ({ request }) => {
  // The Home tab is client-rendered; the package-tabs test checks its entry line.
  for (const path of ['/docs/pre-commit/']) {
    const html = await (await request.get(WEB + path)).text();
    expect(html, path).toContain('npx specdiff-cli pre-commit --fail-on breaking');
    expect(html, path).not.toMatch(/pass_filenames:\s*false/);
    expect(html, path).not.toContain('specdiff-cli --ci --fail-on breaking HEAD:');
  }
  expect(await (await request.get(WEB + '/docs/pre-commit/')).text()).toContain('.pre-commit-hooks.yaml');
});

// ---- Round 3: W-04 rule pages (per-rule copy, focused excerpt, unclipped .specdiff.yaml)
const ruleHtml = () =>
  builtPages()
    .filter((f) => /\/dist\/rules\/[^/]+\/index\.html$/.test(f))
    .map((f) => ({ id: f.split('/rules/')[1]!.split('/')[0]!, html: readFileSync(f, 'utf8') }));
const textOf = (html: string, re: RegExp) => (re.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('W-04 every rule page has its own headline and intro, not the catalogue title or a one-liner (WEB-04)', () => {
  const rules = ruleHtml();
  expect(rules.length).toBeGreaterThan(70);
  const h1s = rules.map((r) => textOf(r.html, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  const ledes = rules.map((r) => textOf(r.html, /<p class="lede rule-lede"[^>]*>([\s\S]*?)<\/p>/));
  expect(new Set(h1s).size).toBe(rules.length);
  expect(new Set(ledes).size).toBe(rules.length);
  const short = rules.map((r, i) => `${r.id}: ${ledes[i]}`).filter((_, i) => ledes[i]!.length < 50);
  expect(short).toEqual([]);
});

test('W-04 rule detail matches the design copy: headline, intro, who it breaks, 3-step how to avoid', async ({ page }) => {
  await page.goto(WEB + '/rules/request-property-became-required/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('An optional request property became required');
  await expect(page.locator('.rule-lede')).toHaveText('A property that clients could leave out of the request body is now in the schema’s required list.');
  await expect(page.locator('#who + p')).toContainText('POST /a');
  await expect(page.locator('#who + p')).toContainText('first call after you deploy');
  await expect(page.locator('#fix + ol > li')).toHaveCount(3);
  await expect(page.locator('#fix + ol > li').first()).toContainText('Add a default or keep the field optional');
});

test('W-04 before/after show a focused excerpt with the changed lines marked − and + in colour', async ({ page }) => {
  await page.goto(WEB + '/rules/request-property-became-required/');
  const [before, after] = [page.locator('.yaml-card').nth(0), page.locator('.yaml-card').nth(1)];
  // The fixture is 20 lines; the excerpt leaves out the unrelated top (info: …) and bottom (responses: …).
  await expect(before).not.toContainText('title: Fixture');
  await expect(after).not.toContainText('description: OK');
  await expect(after.locator('.yl-add')).toHaveCount(2);
  await expect(after.locator('.yl-add').first()).toContainText('required:');
  await expect(after.locator('.yl-add .yl-mark').first()).toHaveText('+');
  await expect(after.locator('.yl-gap').first()).toBeVisible();
  const [plain, added] = await after.evaluate((el) => [getComputedStyle(el.querySelector('.yl:not(.yl-add):not(.yl-gap)')!).backgroundColor, getComputedStyle(el.querySelector('.yl-add')!).backgroundColor]);
  expect(added).not.toBe(plain);
  // A removal is marked on the before side.
  await page.goto(WEB + '/rules/response-property-removed/');
  await expect(page.locator('.yaml-card').nth(0).locator('.yl-rem .yl-mark').first()).toHaveText('−');
});

test('W-04 the .specdiff.yaml snippet is not clipped at 1440, even for the longest rule id', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  for (const id of ['request-property-became-required', 'request-property-constraint-tightened']) {
    await page.goto(WEB + `/rules/${id}/`);
    const pre = page.locator('.aside-card pre');
    await expect(pre).toContainText(`${id}:`);
    const [sw, cw] = await pre.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(sw, id).toBeLessThanOrEqual(cw);
  }
});

test('CLI docs document `specdiff changelog` with the Atom feed and --append (OUT-10)', async ({ page }) => {
  await page.goto(WEB + '/docs/cli/');
  await expect(page.getByRole('heading', { name: /Changelogs and feeds/ })).toBeVisible();
  await expect(page.locator('main')).toContainText('npx specdiff-cli changelog v1.yaml v2.yaml --format atom');
  await expect(page.locator('main')).toContainText('--append public/changelog.xml');
  await expect(page.getByRole('cell', { name: '--append <feed.xml>' })).toBeVisible();
});
