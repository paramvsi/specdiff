// Screen fixes from the screen and feature audits (docs/audit): IN-08 / A-02, IN-11 / A-13, TX-07, TX-10, X-02,
// X-06, X-08, OUT-05, OUT-06, O-05, O-08, A-01 drag over, A-07, A-08, A-09, O-13 toasts.
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectAxeClean as axe } from './a11y';

// Production build (B-18). SD_BASE points the same tests at another build (the "before" run).
test.use({ baseURL: process.env.SD_BASE ?? 'http://localhost:4173' });

const expectAxeClean = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await axe(page);
};

async function openFile(page: Page, side: 0 | 1, name: string, content: string | Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).nth(side).click();
  await (await chooser).setFiles({
    name,
    mimeType: 'text/plain',
    buffer: typeof content === 'string' ? Buffer.from(content) : content,
  });
}

const lines = (n: number, f: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

// ---------------------------------------------------------------- IN-08 / A-02

const LARGE = 'fixtures/specs/large/large.yaml'; // node scripts/gen-large-spec.mjs 10 --yaml

test('IN-08 A-02: a large spec shows five steps that progress one by one; the heading has no focus box', async ({
  page,
}) => {
  test.skip(!existsSync(LARGE), 'run node scripts/gen-large-spec.mjs 10 --yaml first');
  test.setTimeout(120_000);
  const spec = readFileSync(LARGE, 'utf8');
  await page.goto('/app/');
  await openFile(page, 0, 'large-v1.yaml', spec);
  await openFile(page, 1, 'large-v2.yaml', spec.replace(/version: .*/, 'version: 9.9.9'));
  // Record every distinct state of the step list while the comparison runs.
  await page.evaluate(() => {
    const w = window as unknown as { __steps: string[] };
    w.__steps = [];
    const tick = () => {
      const s = [...document.querySelectorAll('ol li[data-state]')]
        .map((li) => `${li.textContent?.split(',')[0]}=${li.getAttribute('data-state')}`)
        .join('|');
      if (s && s !== w.__steps.at(-1)) w.__steps.push(s);
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.getByRole('button', { name: 'Compare', exact: true }).focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Preparing your comparison' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  expect(await heading.evaluate((h) => getComputedStyle(h).boxShadow)).toBe('none');
  const list = page.locator('ol li[data-state]');
  await expect(list).toHaveText([/^Detect format/, /^Parse/, /^Resolve \$refs/, /^Normalise/, /^Compare and classify/]);
  await expectAxeClean(page);
  await expect(heading).toHaveCount(0, { timeout: 90_000 });
  const seen = await page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);
  // Real progress: Parse finished while later steps were still pending or running (not all done at once).
  expect(seen.some((s) => /Parse=done/.test(s) && /Compare and classify=(pending|running)/.test(s))).toBe(true);
  expect(seen.some((s) => /(Resolve \$refs|Normalise|Compare and classify)=running/.test(s))).toBe(true);
});

// Wall-clock threshold: a loaded machine can push even a tiny compare past it, so retry (X-02).
test.describe(() => {
  test.describe.configure({ retries: 2 });
  test('IN-08: a quick comparison never flashes the Parsing screen', async ({ page }) => {
    // Production build: the dev server compiles the worker on first use, which is slow under parallel load.
    await page.goto('http://localhost:4173/app/');
    await page.evaluate(() => {
      const w = window as unknown as { __flash: boolean };
      w.__flash = false;
      new MutationObserver(() => {
        if (document.body.textContent?.includes('Preparing your comparison')) w.__flash = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await page.getByRole('textbox', { name: 'Before' }).fill('a\nb\n');
    await page.getByRole('textbox', { name: 'After' }).fill('a\nc\n');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __flash: boolean }).__flash)).toBe(false);
  });
});

// ---------------------------------------------------------------- IN-11 / O-13

test('IN-11: saved sources are re-fetched when the app opens; a changed one shows a "Saved source changed" toast', async ({
  page,
}) => {
  let version = 1;
  let fetches = 0;
  await page.route('https://specs.example.test/**', (route) => {
    fetches++;
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'flags', version, enabled: version > 1 }, null, 2),
    });
  });
  await page.goto('/app/');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Saved sources' }).click();
  await page.getByRole('button', { name: 'Add source' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a saved source' });
  await dialog.getByLabel('URL').fill('https://specs.example.test/flags.json');
  await dialog.getByLabel('Name (optional)').fill('Feature flags');
  await dialog.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByText(/Saved\. Changes show/)).toBeVisible();

  version = 2;
  fetches = 0;
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Compare two files' })).toBeVisible();
  const toast = page.getByText('Saved source changed');
  await expect(toast).toBeVisible();
  expect(fetches).toBe(1);
  await expect(page.getByText('Feature flags changed since your last visit.')).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: /\d+ differences?/ })).toBeVisible();
  // Opening Saved sources now shows the result of that check, without fetching again.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Saved sources' }).click();
  await expect(page.getByText('1 of your saved sources changed since your last visit')).toBeVisible();
  expect(fetches).toBe(1);
});

// ---------------------------------------------------------------- TX-07 / TX-10

test('TX-07: Go to line inside a collapsed region expands it and scrolls there', async ({ page }) => {
  await page.goto('/app/');
  await openFile(page, 0, 'a.txt', lines(400, (i) => `line ${i}`));
  await openFile(page, 1, 'b.txt', lines(400, (i) => (i === 1 || i === 400 ? `LINE ${i}` : `line ${i}`)));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Show \d+ unchanged lines/ })).toBeVisible();
  await page.getByRole('region', { name: /Differences between/ }).focus();
  await page.keyboard.press('ControlOrMeta+g');
  const dialog = page.getByRole('dialog', { name: 'Go to line' });
  await dialog.getByRole('textbox').fill('200');
  await dialog.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByRole('button', { name: /Show \d+ unchanged lines/ })).toHaveCount(0);
  await expect(page.getByText('line 200', { exact: true }).last()).toBeInViewport();
  await expectAxeClean(page);
});

test('TX-10: live re-diff while editing keeps the result and the editor open', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('textbox', { name: 'Before' }).fill('one\ntwo\nthree\n');
  await page.getByRole('textbox', { name: 'After' }).fill('one\nTWO\nthree\n');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 lines differ' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit both sides' }).click();
  const after = page.locator('textarea').nth(1);
  await after.click();
  await page.keyboard.press('End');
  await page.keyboard.type('four');
  await expect(page.getByRole('heading', { name: '3 lines differ' })).toBeVisible();
  await expect(after).toBeFocused();
  await page.keyboard.type(' five');
  await expect(after).toHaveValue(/four five$/);
  await expect(page.getByRole('heading', { name: 'Preparing your comparison' })).toHaveCount(0);
});

// ---------------------------------------------------------------- X-02

test('X-02: a 20,000-line JSON diff renders a virtual tree and side by side without stalling the page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const items = (k: number) => Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `item ${i}`, qty: i + k, price: i * 2 + k }));
  await page.goto('/app/');
  await openFile(page, 0, 'big-a.json', JSON.stringify({ items: items(0) }, null, 2));
  await openFile(page, 1, 'big-b.json', JSON.stringify({ items: items(1) }, null, 2));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /8000 differences/ })).toBeVisible({ timeout: 90_000 });
  const rows = await page.getByRole('list', { name: 'Changes by path' }).locator('li').count();
  expect(rows).toBeLessThan(300);
  await page.evaluate(() => {
    const w = window as unknown as { __lt: number[] };
    w.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: 'longtask' });
  });
  await page.getByRole('radio', { name: 'Side by side' }).click();
  await expect(page.getByRole('region', { name: /Side by side/ })).toBeVisible({ timeout: 90_000 });
  const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __lt: number[] }).__lt));
  expect(longest).toBeLessThan(500);
});

// ---------------------------------------------------------------- X-06 / X-08

test('X-06: Markdown word changes carry text cues, not colour alone', async ({ page }) => {
  await page.goto('/app/?sample=markdown');
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();
  await expect(page.locator('ins .sd-visually-hidden').first()).toHaveText('inserted: ');
  await expect(page.locator('del .sd-visually-hidden').first()).toHaveText('deleted: ');
});

test('X-08: identical OpenAPI specs show "No differences"', async ({ page }) => {
  const spec = readFileSync('fixtures/samples/payments-v1.yaml', 'utf8');
  await page.goto('/app/');
  await openFile(page, 0, 'payments-v1.yaml', spec);
  await openFile(page, 1, 'payments-v1-copy.yaml', spec);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByText('No differences')).toBeVisible();
  await expectAxeClean(page);
});

// ---------------------------------------------------------------- OUT-05 / OUT-06

test('OUT-06: a .specdiff.json comparison file opens on Compare', async ({ page }) => {
  const payload = {
    left: { name: 'app.log', content: 'start\nready\n' },
    right: { name: 'app-new.log', content: 'start\nready in 3 ms\n' },
    mode: 'text',
  };
  await page.goto('/app/');
  await openFile(page, 0, 'comparison.specdiff.json', JSON.stringify(payload, null, 2));
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(page.getByText('app-new.log').first()).toBeVisible();
});

test('OUT-05: "Open on the current change" opens the shared link on that change', async ({ page, context }) => {
  await page.goto('/app/?sample=text');
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
  await expect(dialog.getByRole('checkbox', { name: 'Open on the current change' })).toBeChecked();
  const box = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(box).toHaveValue(/#v=1/);
  const other = await context.newPage();
  await other.goto(await box.inputValue());
  await expect(other.getByRole('heading', { name: /lines differ/ })).toBeVisible();
  await expect(other).toHaveURL(/#change=t-1$/);
  await expect(other.getByText(/^2 \/ \d+$/)).toBeVisible();
});

// ---------------------------------------------------------------- Designs, light and dark

for (const scheme of ['light', 'dark'] as const) {
  test(`O-08 too large: option cards, sizes, the CLI command, YAML named (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/app/');
    await openFile(page, 0, 'orders-export.yaml', Buffer.alloc(27 * 1024 * 1024, 'a: 1\n'));
    const dialog = page.getByRole('dialog', { name: 'orders-export.yaml is 27.0 MB' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^Structural YAML comparison works up to 25 MB/)).toBeVisible();
    await expect(dialog.getByText('orders-export.yaml · 27.0 MB')).toBeVisible();
    await expect(dialog.getByText('Use smaller files')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Choose another file' })).toBeVisible();
    await expect(dialog.getByText('npx specdiff-cli a.yaml b.yaml')).toBeVisible();
    await expectAxeClean(page);
    await dialog.getByRole('button', { name: 'Compare as text' }).click();
    await expect(page.getByRole('combobox', { name: 'Compare as' })).toHaveValue('text');
  });

  test(`O-05 load from URL: Load into control, CORS callout, loads into After (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.route('https://specs.example.test/**', (route) =>
      route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'hello from the url\n' }),
    );
    await page.goto('/app/');
    await page.getByRole('button', { name: 'From URL' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Load from URL' });
    await dialog.getByLabel('File URL').fill('https://specs.example.test/notes.txt');
    await expect(dialog.getByText(/If the server doesn’t allow cross-origin requests/)).toBeVisible();
    await expect(dialog.getByText('The file goes from that server to this tab only.')).toBeVisible();
    await dialog.getByRole('radio', { name: 'After' }).click();
    await expectAxeClean(page);
    await dialog.getByRole('button', { name: 'Load file' }).click();
    await expect(page.getByRole('textbox', { name: /After/ })).toHaveValue('hello from the url\n');
    await expect(page.getByRole('textbox', { name: /Before/ })).toHaveValue('');
  });

  test(`A-01 drag over: the target side becomes the drop zone, the loaded side shows its file (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/app/');
    await openFile(page, 0, 'payments-v1.yaml', readFileSync('fixtures/samples/payments-v1.yaml', 'utf8'));
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await page.getByRole('textbox', { name: /After/ }).dispatchEvent('dragover', { dataTransfer: dt });
    await expect(page.getByText('Drop to use as After')).toBeVisible();
    await expect(page.getByText('One file, a folder, or a ZIP of a split spec. External $refs inside the folder are resolved.')).toBeVisible();
    await expect(page.getByText(/^Before · OpenAPI 3\.\d · [\d.]+ KB$/)).toBeVisible();
    await expectAxeClean(page);
  });

  test(`A-07 JSON sample: keyed array once, keyed move by key, null vs missing (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=json');
    await expect(page.getByRole('heading', { name: '7 differences in 226 values' })).toBeVisible();
    const tree = page.getByRole('list', { name: 'Changes by path' });
    await expect(tree.getByText('matched by')).toHaveCount(1);
    await expect(tree.getByText('[key=new_pricing]')).toBeVisible();
    await expect(tree.getByText(/index 3 → 11/)).toBeVisible();
    await expect(tree.getByText('[key=beta_banner]')).toBeVisible();
    await expect(tree.getByText('[key=fraud_rules_v3]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Null vs missing 1/ })).toBeVisible();
    await expect(page.getByText(/Unchanged\s*219/)).toBeVisible();
    await expectAxeClean(page);
  });

  test(`A-08 Markdown side by side: two wide panes, code not clipped (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=markdown');
    await page.getByRole('radio', { name: 'Side by side' }).click();
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Checks' })).toBeVisible();
    const pre = page.locator('[data-side="after"] pre').first();
    await expect(pre).toBeVisible();
    expect(await pre.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expectAxeClean(page);
  });

  test(`A-09 code sample: "Java · Beta" badge, logic + move + rename (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/?sample=code');
    await expect(page.getByRole('heading', { name: /^1 logic change, 1 move, 1 rename/ })).toBeVisible();
    await expect(page.getByText('Java · Beta', { exact: true })).toBeVisible();
    await expect(page.getByText(/lines reformatted, no logic change/)).toBeVisible();
    await expectAxeClean(page);
  });

  test(`A-09 fallback names the language: "Go is on the list" (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app/');
    await openFile(page, 0, 'main.go', 'package main\n\nfunc greet(name string) {\n}\n');
    await openFile(page, 1, 'main.go', 'package main\n\nfunc greet(name string, loud bool) {\n}\n');
    await page.getByRole('combobox', { name: 'Compare as' }).selectOption('code');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByText('Showing a text diff for main.go')).toBeVisible();
    await expect(page.getByText(/Go is on the list\./)).toBeVisible();
    // A09-Fallback: the badge says Text, since the result is a text diff.
    await expect(page.getByText('Text', { exact: true }).first()).toBeVisible();
    // A09-Fallback / A03: the search names what it searches.
    await expect(page.getByRole('button', { name: 'Search text' })).toBeVisible();
    await expectAxeClean(page);
  });

  test(`O-13 toasts: accepting a change offers Undo (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/app/?sample=openapi');
    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
    await page.keyboard.press('2');
    // B-30: the Workspace opens on All; review mode is the "To review" filter.
    await page.getByRole('button', { name: /^To review/ }).click();
    await expect(page.getByText('0 of 5 decided')).toBeVisible();
    await page.keyboard.press('a');
    await expect(page.getByText('1 of 5 decided')).toBeVisible();
    await expect(page.getByText('Change accepted')).toBeVisible();
    await expect(page.getByText('Saved to .specdiff/decisions.json.')).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('0 of 5 decided')).toBeVisible();
  });
}

test('O-13 toasts: a long share link offers "Download file"', async ({ page }) => {
  await page.goto('/app/');
  await openFile(page, 0, 'a.log', lines(4000, (i) => `${i} ${Math.sin(i).toString(36)}`));
  await openFile(page, 1, 'b.log', lines(4000, (i) => `${i} ${Math.cos(i).toString(36)}`));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /lines differ/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this comparison' });
  await expect(dialog.getByText(/Over the limit/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Link is long')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file' }).click();
  expect((await download).suggestedFilename()).toBe('comparison.specdiff.json');
});
